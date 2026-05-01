import { NextResponse } from "next/server";
import type { FeatureCollection } from "geojson";
import { db } from "~/server/db";
import { layers, type VectorConfig, type WfsConfig } from "~/server/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  getVectorGeoJsonPrecision,
  getVectorSimplifyTolerance,
} from "~/lib/map-layer-utils";
import { fetchWfsFeatureCollection } from "~/server/layers/wfs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseBbox(
  bbox: string | null,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (!bbox) return null;
  const parts = bbox.split(",").map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
  const [minX, minY, maxX, maxY] = parts as [number, number, number, number];
  return { minX, minY, maxX, maxY };
}

function quoteSqlIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function buildPropertiesSql(config: VectorConfig) {
  const popupProps = (config.popupProps ?? []).filter((prop) =>
    /^[A-Za-z_][A-Za-z0-9_]*$/.test(prop),
  );

  if (popupProps.length === 0) {
    return sql.raw(
      `jsonb_strip_nulls(to_jsonb(t) - '${config.geomColumn.replaceAll("'", "''")}')`,
    );
  }

  const propertyEntries = popupProps.flatMap((prop) => [
    `'${prop.replaceAll("'", "''")}'`,
    `t.${quoteSqlIdentifier(prop)}`,
  ]);

  return sql.raw(
    `jsonb_strip_nulls(jsonb_build_object(${propertyEntries.join(", ")}))`,
  );
}

function buildSimpleVectorQuery(
  config: VectorConfig,
  bbox: { minX: number; minY: number; maxX: number; maxY: number },
  srid: number,
) {
  const propertiesSql = buildPropertiesSql(config);
  const tableIdent = sql`${sql.identifier(config.schema)}.${sql.identifier(
    config.table,
  )}`;
  const geomIdent = sql.identifier(config.geomColumn);

  return sql<{ geojson: unknown }>`
    with bbox as (
      select ST_MakeEnvelope(
        ${bbox.minX}, ${bbox.minY}, ${bbox.maxX}, ${bbox.maxY}, ${srid}
      ) as g
    )
    select jsonb_build_object(
      'type', 'FeatureCollection',
      'features', coalesce(
        jsonb_agg(
          jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(t.${geomIdent})::jsonb,
            'properties', ${propertiesSql}
          )
        ),
        '[]'::jsonb
      )
    ) as geojson
    from ${tableIdent} t
    join bbox on t.${geomIdent} && bbox.g and ST_Intersects(t.${geomIdent}, bbox.g)
  `;
}

async function fetchVectorLayerGeoJson(
  config: VectorConfig,
  bbox: { minX: number; minY: number; maxX: number; maxY: number },
  zoom: number,
) {
  const srid = config.srid ?? 4326;
  const simplifyTolerance = getVectorSimplifyTolerance(zoom);
  const decimalPrecision = getVectorGeoJsonPrecision(zoom);
  const propertiesSql = buildPropertiesSql(config);
  const simplifyToleranceSql = sql.raw(String(simplifyTolerance));
  const decimalPrecisionSql = sql.raw(String(decimalPrecision));
  const tableIdent = sql`${sql.identifier(config.schema)}.${sql.identifier(
    config.table,
  )}`;
  const geomIdent = sql.identifier(config.geomColumn);

  const query = sql<{ geojson: unknown }>`
    with bbox as (
      select ST_MakeEnvelope(
        ${bbox.minX}, ${bbox.minY}, ${bbox.maxX}, ${bbox.maxY}, ${srid}
      ) as g
    ),
    source as (
      select
        case
          when ST_Dimension(t.${geomIdent}) = 0 then t.${geomIdent}
          else ST_Intersection(t.${geomIdent}, bbox.g)
        end as clipped_geom,
        ${propertiesSql} as properties
      from ${tableIdent} t
      join bbox on t.${geomIdent} && bbox.g and ST_Intersects(t.${geomIdent}, bbox.g)
    ),
    simplified as (
      select
        case
          when ST_Dimension(clipped_geom) = 0 or ${simplifyToleranceSql} = 0 then clipped_geom
          else ST_SimplifyPreserveTopology(clipped_geom, ${simplifyToleranceSql})
        end as geom,
        properties
      from source
    ),
    features as (
      select geom, properties
      from simplified
      where not ST_IsEmpty(geom)
    )
    select jsonb_build_object(
      'type', 'FeatureCollection',
      'features', coalesce(
        jsonb_agg(
          jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(geom, ${decimalPrecisionSql})::jsonb,
            'properties', properties
          )
        ),
        '[]'::jsonb
      )
    ) as geojson
    from features
  `;

  let row: { geojson: unknown } | undefined;

  try {
    const result = (await db.execute(query)) as { geojson: unknown }[];
    row = result[0];
  } catch (error) {
    console.error("Optimized vector query failed, using fallback", error);
    const fallback = (await db.execute(
      buildSimpleVectorQuery(config, bbox, srid),
    )) as { geojson: unknown }[];
    row = fallback[0];
  }

  return (row?.geojson ?? {
    type: "FeatureCollection",
    features: [],
  }) as FeatureCollection;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const bboxParam = searchParams.get("bbox");
  const zParam = Number(searchParams.get("z") ?? "0");
  const bbox = parseBbox(bboxParam);

  const [layer] = await db
    .select()
    .from(layers)
    .where(eq(layers.id, id))
    .limit(1);

  if (!layer) {
    return new NextResponse("Layer not found", { status: 404 });
  }

  if (!bbox) {
    return new NextResponse("Missing bbox", { status: 400 });
  }

  if (layer.kind === "vector") {
    const geojson = await fetchVectorLayerGeoJson(
      layer.config as VectorConfig,
      bbox,
      zParam,
    );
    return NextResponse.json(geojson);
  }

  if (layer.kind === "wfs") {
    try {
      const geojson = await fetchWfsFeatureCollection(
        layer.config as WfsConfig,
        {
          south: bbox.minY,
          west: bbox.minX,
          north: bbox.maxY,
          east: bbox.maxX,
        },
        req.signal,
      );

      return NextResponse.json(geojson);
    } catch (error) {
      console.error(`WFS fetch failed for layer ${id}`, error);
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "No se pudo consultar el servicio WFS",
        },
        { status: 502 },
      );
    }
  }

  return new NextResponse("Only vector and wfs layers are supported here", {
    status: 400,
  });
}
