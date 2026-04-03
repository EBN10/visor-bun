import { NextResponse } from "next/server"
import { eq, sql } from "drizzle-orm"
import { db } from "~/server/db"
import { layers, type VectorConfig } from "~/server/db/schema"
import { normalizeLayerBounds } from "~/lib/layer-presentation"

function quoteSqlIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`
}

function parseBox2d(value: string | null) {
  if (!value) {
    return null
  }

  const match = value.match(
    /^BOX\((-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)\)$/i,
  )

  if (!match) {
    return null
  }

  return {
    west: Number(match[1]),
    south: Number(match[2]),
    east: Number(match[3]),
    north: Number(match[4]),
  }
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params

  const [layer] = await db.select().from(layers).where(eq(layers.id, id)).limit(1)

  if (!layer) {
    return NextResponse.json({ error: "Layer not found" }, { status: 404 })
  }

  const configBounds = normalizeLayerBounds(layer.config?.bounds)

  if (configBounds) {
    return NextResponse.json({ bounds: configBounds })
  }

  if (layer.kind !== "vector") {
    return NextResponse.json({ bounds: null })
  }

  const config = layer.config as VectorConfig
  const tableName = `${quoteSqlIdentifier(config.schema)}.${quoteSqlIdentifier(
    config.table,
  )}`
  const geometryColumn = quoteSqlIdentifier(config.geomColumn)
  const geometryExpression =
    config.srid && config.srid !== 4326
      ? `ST_Transform(t.${geometryColumn}, 4326)`
      : `t.${geometryColumn}`

  const query = `
    select ST_Extent(${geometryExpression})::text as bbox
    from ${tableName} t
  `

  try {
    const result = (await db.execute(sql.raw(query))) as { bbox: string | null }[]
    const bounds = parseBox2d(result[0]?.bbox ?? null)
    return NextResponse.json({ bounds })
  } catch (error) {
    console.error(`Failed to compute extent for layer ${id}`, error)
    return NextResponse.json({ bounds: null }, { status: 500 })
  }
}
