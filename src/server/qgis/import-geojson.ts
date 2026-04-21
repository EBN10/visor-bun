import { eq, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { layerGroups, layers, type LayerMetadata } from "~/server/db/schema";
import { getAuditActor, writeAuditLog } from "~/server/audit";

export type ImportGeoJsonSource = "direct_upload" | "vercel_blob";

export type ImportGeoJsonLayerInput = {
  layerName: string;
  groupId: string;
  text: string;
  source: ImportGeoJsonSource;
  originalFileName?: string | null;
  metadata?: LayerMetadata | null;
};

export type ImportGeoJsonLayerResult = {
  layerId: string;
  layerName: string;
  featureCount: number;
};

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
  if (!Array.isArray(value.features) || value.features.length === 0) {
    return false;
  }

  return true;
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

export async function importGeoJsonLayer({
  layerName,
  groupId,
  text,
  source,
  originalFileName,
  metadata,
}: ImportGeoJsonLayerInput): Promise<ImportGeoJsonLayerResult> {
  let createdTableId: string | null = null;

  try {
    const [group] = await db
      .select({ id: layerGroups.id })
      .from(layerGroups)
      .where(eq(layerGroups.id, groupId))
      .limit(1);

    if (!group) {
      throw new Error("El grupo seleccionado no existe");
    }

    let parsedGeojson: unknown;
    try {
      parsedGeojson = JSON.parse(text) as unknown;
    } catch {
      throw new Error("El archivo no contiene un JSON valido");
    }

    if (!isFeatureCollection(parsedGeojson)) {
      throw new Error("GeoJSON invalido: no se encontraron features");
    }

    const geojson = parsedGeojson;
    const allProperties = new Map<string, string>();

    let inputSrid = 4326;
    const crsName = geojson.crs?.properties?.name;
    if (typeof crsName === "string") {
      const match = /EPSG[:]+(\d+)/i.exec(crsName);
      if (match?.[1]) {
        inputSrid = parseInt(match[1], 10);
      }
    }

    for (const feature of geojson.features) {
      const props = feature.properties ?? {};
      for (const [key, value] of Object.entries(props)) {
        const sanitizedKey = key.toLowerCase().replace(/[^a-z0-9_]/g, "_");
        const currentType = allProperties.get(sanitizedKey);
        let newType = "TEXT";

        if (typeof value === "number") newType = "NUMERIC";
        else if (typeof value === "boolean") newType = "BOOLEAN";

        if (!currentType) {
          allProperties.set(sanitizedKey, newType);
        } else if (currentType !== newType) {
          allProperties.set(sanitizedKey, "TEXT");
        }
      }
    }

    const sanitizedTableName =
      layerName
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
        .replace(/^_+|_+$/g, "") || "layer";
    const randomSuffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    const tableId = `qgis_${sanitizedTableName}_${Date.now()}_${randomSuffix}`;
    createdTableId = tableId;
    const indexName = `${tableId.slice(0, 48)}_geom_gix`;

    const columnsSql: string[] = [];
    allProperties.forEach((type, key) => {
      columnsSql.push(`"${key}" ${type}`);
    });

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

    await db.execute(sql.raw(createTableQuery));
    await db.execute(
      sql.raw(
        `CREATE INDEX "${indexName}" ON public."${tableId}" USING GIST (geom);`,
      ),
    );

    for (const feature of geojson.features) {
      const props = feature.properties ?? {};
      const geom = feature.geometry;
      const colNames: string[] = [];
      const colValues: string[] = [];

      allProperties.forEach((_, key) => {
        const originalKey = Object.keys(props).find(
          (candidate) =>
            candidate.toLowerCase().replace(/[^a-z0-9_]/g, "_") === key,
        );
        const value = originalKey ? props[originalKey] : null;

        if (value !== undefined && value !== null) {
          colNames.push(`"${key}"`);
          colValues.push(serializePropertyValue(value));
        }
      });

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
        const insertQuery = `
          INSERT INTO public."${tableId}" (geom)
          VALUES (${geomExpr});
        `;
        await db.execute(sql.raw(insertQuery));
      }
    }

    await db.execute(sql.raw(`ANALYZE public."${tableId}"`));

    const actor = await getAuditActor();

    await db.transaction(async (tx) => {
      await tx.insert(layers).values({
        id: tableId,
        name: layerName,
        kind: "vector",
        groupId,
        order: 0,
        defaultVisible: true,
        config: {
          type: "vector",
          schema: "public",
          table: tableId,
          geomColumn: "geom",
          srid: 4326,
          popupProps: Array.from(allProperties.keys()),
          ...(metadata ? { metadata } : {}),
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
            `Medio de carga: ${source === "vercel_blob" ? "Vercel Blob" : "directo"}`,
            ...(originalFileName
              ? [`Archivo original: ${originalFileName}`]
              : []),
          ],
          metadata: {
            featureCount: geojson.features.length,
            groupId,
            source,
          },
        },
      });
    });

    return {
      layerId: tableId,
      layerName,
      featureCount: geojson.features.length,
    };
  } catch (error) {
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

    throw error;
  }
}
