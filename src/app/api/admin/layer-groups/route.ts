import { NextResponse } from "next/server"
import { db } from "~/server/db"
import { layerGroups, layers } from "~/server/db/schema"
import { eq } from "drizzle-orm"
import { buildAuditChanges, getAuditActor, writeAuditLog } from "~/server/audit"

export async function GET() {
  const rows = await db.select().from(layerGroups)
  return NextResponse.json(rows)
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { id, name, parentId = null, order = 0 } = body ?? {}

    if (!id || !name) {
      return NextResponse.json({ error: "id and name are required" }, { status: 400 })
    }

    const existing = await db.select().from(layerGroups).where(eq(layerGroups.id, id)).limit(1)
    if (existing.length > 0) {
      return NextResponse.json({ error: `Group with id '${id}' already exists` }, { status: 409 })
    }

    const actor = await getAuditActor()

    const row = await db.transaction(async (tx) => {
      await tx.insert(layerGroups).values({ id, name, parentId, order })
      const [created] = await tx.select().from(layerGroups).where(eq(layerGroups.id, id)).limit(1)

      if (!created) {
        throw new Error("No se pudo recuperar el grupo creado")
      }

      await writeAuditLog(tx, {
        actor,
        action: "create",
        resourceType: "layer_group",
        resourceId: created.id,
        resourceLabel: created.name,
        summary: `Creó el grupo "${created.name}"`,
        details: {
          notes: created.parentId ? [`Grupo padre: ${created.parentId}`] : ["Grupo creado en la raíz"],
          metadata: {
            parentId: created.parentId,
            order: created.order,
          },
        },
      })

      return created
    })

    return NextResponse.json(row, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json()
    const { id, name, parentId, order } = body ?? {}
    
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

    const [existing] = await db.select().from(layerGroups).where(eq(layerGroups.id, id)).limit(1)

    if (!existing) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 })
    }

    const patch: Partial<typeof existing> = {}
    if (name !== undefined) patch.name = name
    if (parentId !== undefined) patch.parentId = parentId
    if (order !== undefined) patch.order = order

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(existing)
    }

    const actor = await getAuditActor()

    const row = await db.transaction(async (tx) => {
      await tx.update(layerGroups).set(patch).where(eq(layerGroups.id, id))

      const [updated] = await tx.select().from(layerGroups).where(eq(layerGroups.id, id)).limit(1)

      if (!updated) {
        throw new Error("No se pudo recuperar el grupo actualizado")
      }

      const changes = buildAuditChanges(existing, updated, [
        { key: "name", label: "Nombre" },
        { key: "parentId", label: "Grupo padre" },
        { key: "order", label: "Orden" },
      ])

      if (changes.length > 0) {
        const movedOnly = changes.every(
          (change) => change.field === "parentId" || change.field === "order"
        )

        await writeAuditLog(tx, {
          actor,
          action: movedOnly ? "move" : "update",
          resourceType: "layer_group",
          resourceId: updated.id,
          resourceLabel: updated.name,
          summary: movedOnly
            ? `Reubicó el grupo "${updated.name}"`
            : `Actualizó el grupo "${updated.name}"`,
          details: { changes },
        })
      }

      return updated
    })

    return NextResponse.json(row)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")

    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

    const [group] = await db.select().from(layerGroups).where(eq(layerGroups.id, id)).limit(1)

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 })
    }

    const relatedLayers = await db.select().from(layers).where(eq(layers.groupId, id))
    const actor = await getAuditActor()

    await db.transaction(async (tx) => {
      await tx.delete(layerGroups).where(eq(layerGroups.id, id))

      await writeAuditLog(tx, {
        actor,
        action: "delete",
        resourceType: "layer_group",
        resourceId: group.id,
        resourceLabel: group.name,
        summary: `Eliminó el grupo "${group.name}"`,
        details: {
          notes: relatedLayers.length > 0
            ? [`Se eliminaron también ${relatedLayers.length} capa(s): ${relatedLayers.map((layer) => layer.name).join(", ")}`]
            : undefined,
          metadata: {
            parentId: group.parentId,
            deletedLayerIds: relatedLayers.map((layer) => layer.id),
          },
        },
      })
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
