import { NextResponse } from "next/server"
import { db } from "~/server/db"
import { layers, type LayerConfig } from "~/server/db/schema"
import { eq } from "drizzle-orm"
import { buildAuditChanges, getAuditActor, writeAuditLog } from "~/server/audit"

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await req.json()
  const { name, groupId, order, defaultVisible, config } = body ?? {}

  const [existing] = await db.select().from(layers).where(eq(layers.id, id)).limit(1)
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 })

  const patch: any = {}
  if (name !== undefined) patch.name = name
  if (groupId !== undefined) patch.groupId = groupId
  if (order !== undefined) patch.order = order
  if (defaultVisible !== undefined) patch.defaultVisible = defaultVisible
  if (config !== undefined) patch.config = config as LayerConfig

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(existing)
  }

  const actor = await getAuditActor()

  await db.update(layers).set(patch).where(eq(layers.id, id))
  const [row] = await db.select().from(layers).where(eq(layers.id, id)).limit(1)
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 })

  const changes = buildAuditChanges(existing, row, [
    { key: "name", label: "Nombre" },
    { key: "groupId", label: "Grupo" },
    { key: "order", label: "Orden" },
    { key: "defaultVisible", label: "Visible por defecto" },
    { key: "config", label: "Configuración" },
  ])

  if (changes.length > 0) {
    await writeAuditLog(db, {
      actor,
      action: "update",
      resourceType: "layer",
      resourceId: row.id,
      resourceLabel: row.name,
      summary: `Actualizó la capa "${row.name}"`,
      details: { changes },
    })
  }

  return NextResponse.json(row)
}

export async function DELETE(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const [existing] = await db.select().from(layers).where(eq(layers.id, id)).limit(1)
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 })

  const actor = await getAuditActor()

  await db.delete(layers).where(eq(layers.id, id))
  await writeAuditLog(db, {
    actor,
    action: "delete",
    resourceType: "layer",
    resourceId: existing.id,
    resourceLabel: existing.name,
    summary: `Eliminó la capa "${existing.name}"`,
    details: {
      notes: [`Tipo: ${existing.kind}`, `Grupo: ${existing.groupId}`],
    },
  })
  return NextResponse.json({ ok: true })
}
