import { NextResponse } from "next/server"
import { db } from "~/server/db"
import { layers, type VectorConfig } from "~/server/db/schema"
import { eq, sql } from "drizzle-orm"

export const dynamic = "force-dynamic"
export const revalidate = 0

function parseBbox(bbox: string | null) {
  if (!bbox) return null
  const parts = bbox.split(",").map((n) => Number(n))
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null
  const [minX, minY, maxX, maxY] = parts
  return { minX, minY, maxX, maxY }
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const { searchParams } = new URL(req.url)
  const bboxParam = searchParams.get("bbox")
  const zParam = Number(searchParams.get("z") ?? "0")
  const bbox = parseBbox(bboxParam)

  const [layer] = await db
    .select()
    .from(layers)
    .where(eq(layers.id, id))
    .limit(1)

  if (!layer) return new NextResponse("Layer not found", { status: 404 })
  if (layer.kind !== "vector")
    return new NextResponse("Only vector supported here", { status: 400 })
  if (!bbox) return new NextResponse("Missing bbox", { status: 400 })

  const cfg = layer.config as VectorConfig
  const srid = cfg.srid ?? 4326

  const limit =
    zParam >= 11 ? 20000 : zParam >= 9 ? 10000 : zParam >= 7 ? 5000 : 2000

  // Identificadores correctos
  const tableIdent = sql`${sql.identifier(cfg.schema)}.${sql.identifier(
    cfg.table,
  )}`
  const geomIdent = sql.identifier(cfg.geomColumn)

  const q = sql<{ geojson: unknown }>`
    with bbox as (
      select ST_MakeEnvelope(
        ${bbox.minX}, ${bbox.minY}, ${bbox.maxX}, ${bbox.maxY}, ${srid}
      ) as g
    )
    select jsonb_build_object(
      'type','FeatureCollection',
      'features', coalesce(jsonb_agg(
        jsonb_build_object(
          'type','Feature',
          'geometry', ST_AsGeoJSON(t.${geomIdent})::jsonb,
          'properties', to_jsonb(t) - ${cfg.geomColumn} -- aqui va el nombre como texto
        )
      ), '[]'::jsonb)
    ) as geojson
    from ${tableIdent} t
    join bbox on ST_Intersects(t.${geomIdent}, bbox.g)
    limit ${limit}
  `

  const rs = (await db.execute(q)) as { geojson: unknown }[]
const row = rs[0]
return NextResponse.json(
  row?.geojson ?? { type: "FeatureCollection", features: [] },
)
}