import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { layers, layerGroups } from "~/server/db/schema";
import { eq, sql } from "drizzle-orm";
import { getAuditActor, writeAuditLog } from "~/server/audit";

type GeoJsonFeature = {
  geometry: unknown;
  properties?: Record<string, unknown> | null;
};

type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
  crs?: {
    properties?: {
      name?: string;
    };
  } | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFeatureCollection(
  value: unknown,
): value is GeoJsonFeatureCollection {
  if (!isRecord(value)) return false;
  if (value.type !== "FeatureCollection") return false;
  if (!Array.isArray(value.features) || value.features.length === 0)
    return false;

  return true;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Internal Server Error";
}

function getErrorStack(error: unknown) {
  if (error instanceof Error) {
    return error.stack;
  }

  return undefined;
}

function serializePropertyValue(value: unknown) {
  if (typeof value === "string") {
    return `'${value.replace(/'/g, "''")}'`;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
}

export async function POST(req: Request) {
  let createdTableId: string | null = null;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const layerName = formData.get("name") as string;
    const groupId = formData.get("groupId") as string;

    if (!file || !layerName || !groupId) {
      return NextResponse.json(
        { error: "File, name, and groupId are required" },
        { status: 400 },
      );
    }

    const [group] = await db
      .select({ id: layerGroups.id })
      .from(layerGroups)
      .where(eq(layerGroups.id, groupId))
      .limit(1);

    if (!group) {
      return NextResponse.json(
        { error: "The selected group does not exist" },
        { status: 400 },
      );
    }

    const text = await file.text();
    let parsedGeojson: unknown;
    try {
      parsedGeojson = JSON.parse(text) as unknown;
    } catch {
      return NextResponse.json({ error: "Invalid JSON file" }, { status: 400 });
    }

    if (!isFeatureCollection(parsedGeojson)) {
      return NextResponse.json(
        { error: "Invalid GeoJSON: No features found" },
        { status: 400 },
      );
    }

    const geojson = parsedGeojson;

    // 1. Analyze ALL features to determine table schema (superset of properties)
    const allProperties = new Map<string, string>();

    // Determine input SRID from GeoJSON CRS
    let inputSrid = 4326;
    const crsName = geojson.crs?.properties?.name;
    if (typeof crsName === "string") {
      const match = /EPSG[:]+(\d+)/i.exec(crsName);
      if (match?.[1]) {
        inputSrid = parseInt(match[1], 10);
      }
    }
    console.log(`Detected SRID: ${inputSrid}`);

    // We'll also check for mixed geometry types, though we'll default to generic GEOMETRY
    // to be safe.

    for (const feature of geojson.features) {
      const props = feature.properties ?? {};
      for (const [key, value] of Object.entries(props)) {
        const sanitizedKey = key.toLowerCase().replace(/[^a-z0-9_]/g, "_");

        // Simple type inference: if we see a string, it stays string.
        // If we see a number, it's numeric unless we already saw it as string.
        // If we see boolean, it's boolean unless we already saw it as string/number.
        // Default/Fallback is TEXT.

        const currentType = allProperties.get(sanitizedKey);
        let newType = "TEXT";

        if (typeof value === "number") newType = "NUMERIC";
        else if (typeof value === "boolean") newType = "BOOLEAN";
        else newType = "TEXT";

        if (!currentType) {
          allProperties.set(sanitizedKey, newType);
        } else if (currentType !== newType) {
          // Conflict: upgrade to TEXT to be safe
          allProperties.set(sanitizedKey, "TEXT");
        }
      }
    }

    // Sanitize table name (slugify)
    const sanitizedTableName =
      layerName
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
        .replace(/^_+|_+$/g, "") || "layer";
    const randomSuffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    const tableId = `qgis_${sanitizedTableName}_${Date.now()}_${randomSuffix}`;
    createdTableId = tableId;
    const indexName = `${tableId.slice(0, 48)}_geom_gix`;

    // 2. Create Table SQL
    const columnsSql: string[] = [];
    allProperties.forEach((type, key) => {
      columnsSql.push(`"${key}" ${type}`);
    });

    // Use generic GEOMETRY type to allow mixed geometries (Point, MultiPolygon, etc.)
    // SRID 4326 is standard for GeoJSON

    // Determine a safe Primary Key name to avoid collision with user properties
    let pkName = "id";
    if (allProperties.has("id")) pkName = "ogc_fid";
    if (allProperties.has("ogc_fid")) pkName = "gid";

    const createTableQuery = `
      CREATE TABLE public."${tableId}" (
        ${pkName} SERIAL PRIMARY KEY,
        ${columnsSql.join(",\n")}${columnsSql.length > 0 ? "," : ""}
        geom geometry(Geometry, 4326)
      );
    `;

    // Execute Create Table
    await db.execute(sql.raw(createTableQuery));

    await db.execute(
      sql.raw(
        `CREATE INDEX "${indexName}" ON public."${tableId}" USING GIST (geom);`,
      ),
    );

    // 3. Insert Data
    // We construct INSERT statements dynamically for each feature,
    // ensuring we handle missing properties (NULL) and escape strings.

    for (const feature of geojson.features) {
      const props = feature.properties ?? {};
      const geom = feature.geometry;

      const colNames: string[] = [];
      const colValues: string[] = [];

      allProperties.forEach((_, key) => {
        // We need to find the original key in props that matches this sanitized key
        // This is O(N) per property, but robust.
        // Optimization: create a map of sanitized -> original keys for each feature?
        // For now, simple iteration.

        // Actually, we can just iterate the props of the feature and match sanitized keys.
        // But we need to insert ALL columns defined in the table, or at least the ones present.
        // It's safer to insert only present ones and let DB handle NULLs,
        // BUT we need to match the sanitized column names.

        // Let's iterate the TABLE columns (allProperties) and find value in feature.
        // We need a reverse mapping or just loose matching.
        // To be safe, let's look for the value in props where key.toLowerCase()... matches.

        const originalKey = Object.keys(props).find(
          (k) => k.toLowerCase().replace(/[^a-z0-9_]/g, "_") === key,
        );
        const value = originalKey ? props[originalKey] : null;

        if (value !== undefined && value !== null) {
          colNames.push(`"${key}"`);
          colValues.push(serializePropertyValue(value));
        }
      });

      // Construct geometry expression based on input SRID
      // If input is not 4326, we transform it.
      const geomExpr =
        inputSrid === 4326
          ? `ST_SetSRID(ST_GeomFromGeoJSON('${JSON.stringify(geom)}'), 4326)`
          : `ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON('${JSON.stringify(geom)}'), ${inputSrid}), 4326)`;

      if (colNames.length > 0) {
        const insertQuery = `
          INSERT INTO public."${tableId}" (${colNames.join(",")}, geom)
          VALUES (${colValues.join(",")}, ${geomExpr});
        `;
        await db.execute(sql.raw(insertQuery));
      } else {
        // Case with no properties, just geometry
        const insertQuery = `
          INSERT INTO public."${tableId}" (geom)
          VALUES (${geomExpr});
        `;
        await db.execute(sql.raw(insertQuery));
      }
    }

    await db.execute(sql.raw(`ANALYZE public."${tableId}"`));

    // 4. Register Layer
    const actor = await getAuditActor();

    await db.transaction(async (tx) => {
      await tx.insert(layers).values({
        id: tableId,
        name: layerName,
        kind: "vector",
        groupId: groupId,
        order: 0,
        defaultVisible: true,
        config: {
          type: "vector",
          schema: "public",
          table: tableId,
          geomColumn: "geom",
          srid: 4326,
          popupProps: Array.from(allProperties.keys()),
        },
      });

      await writeAuditLog(tx, {
        actor,
        action: "import",
        resourceType: "layer",
        resourceId: tableId,
        resourceLabel: layerName,
        summary: `Importó la capa "${layerName}" desde QGIS`,
        details: {
          notes: [
            `Grupo destino: ${groupId}`,
            `Tabla creada: public.${tableId}`,
          ],
          metadata: {
            featureCount: geojson.features.length,
            groupId,
            source: "qgis",
          },
        },
      });
    });

    return NextResponse.json(
      {
        success: true,
        layerId: tableId,
        layerName,
        featureCount: geojson.features.length,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("Error processing QGIS upload:", error);

    if (createdTableId) {
      try {
        await db.execute(
          sql.raw(`DROP TABLE IF EXISTS public."${createdTableId}"`),
        );
      } catch (cleanupError) {
        console.error(
          `Error cleaning up table ${createdTableId}:`,
          cleanupError,
        );
      }
    }

    // Return a JSON response even for 500 errors so the frontend can parse it
    return NextResponse.json(
      {
        error: getErrorMessage(error),
        details: getErrorStack(error),
      },
      { status: 500 },
    );
  }
}
