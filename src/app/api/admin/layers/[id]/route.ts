import { NextResponse } from "next/server"
import { db } from "~/server/db"
import { layers, type LayerConfig } from "~/server/db/schema"
import { eq } from "drizzle-orm"

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await req.json()
  const { name, groupId, order, defaultVisible, config } = body ?? {}

  const patch: any = {}
  if (name !== undefined) patch.name = name
  if (groupId !== undefined) patch.groupId = groupId
  if (order !== undefined) patch.order = order
  if (defaultVisible !== undefined) patch.defaultVisible = defaultVisible
  if (config !== undefined) patch.config = config as LayerConfig

  await db.update(layers).set(patch).where(eq(layers.id, id))
  const [row] = await db.select().from(layers).where(eq(layers.id, id)).limit(1)
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 })
  return NextResponse.json(row)
}

export async function DELETE(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  await db.delete(layers).where(eq(layers.id, id))
  return NextResponse.json({ ok: true })
}
