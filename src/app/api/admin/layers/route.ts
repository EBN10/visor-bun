import { NextResponse } from "next/server"
import { db } from "~/server/db"
import { layers, type LayerConfig } from "~/server/db/schema"
import { eq } from "drizzle-orm"
import { buildAuditChanges, getAuditActor, writeAuditLog } from "~/server/audit"

export async function GET() {
  const rows = await db.select().from(layers)
  return NextResponse.json(rows)
}

function validateLayerConfig(kind: "vector"|"wms"|"xyz", config: any): { ok: boolean; error?: string } {
  if (!config || typeof config !== "object") return { ok: false, error: "config must be an object" }
  if (kind === "vector") {
    const required = ["type", "schema", "table", "geomColumn"]
    for (const k of required) if (!config[k]) return { ok: false, error: `missing ${k} in vector config` }
    if (config.type !== "vector") return { ok: false, error: "vector config.type must be 'vector'" }
  }
  if (kind === "wms") {
    const required = ["type", "url", "layers"]
    for (const k of required) if (!config[k]) return { ok: false, error: `missing ${k} in wms config` }
    if (config.type !== "wms") return { ok: false, error: "wms config.type must be 'wms'" }
  }
  if (kind === "xyz") {
    const required = ["type", "url"]
    for (const k of required) if (!config[k]) return { ok: false, error: `missing ${k} in xyz config` }
    if (config.type !== "xyz") return { ok: false, error: "xyz config.type must be 'xyz'" }
  }
  return { ok: true }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { id, name, kind, groupId, order = 0, defaultVisible = false, config } = body ?? {}
    
    if (!id || !name || !kind || !groupId) {
      return NextResponse.json({ error: "id, name, kind, groupId are required" }, { status: 400 })
    }

    // Check if ID already exists
    const existing = await db.select().from(layers).where(eq(layers.id, id)).limit(1)
    if (existing.length > 0) {
      return NextResponse.json({ error: `Layer with id '${id}' already exists` }, { status: 409 })
    }

    const v = validateLayerConfig(kind, config)
    if (!v.ok) {
      return NextResponse.json({ error: v.error }, { status: 400 })
    }

    const actor = await getAuditActor()

    const row = await db.transaction(async (tx) => {
      await tx.insert(layers).values({
        id,
        name,
        kind,
        groupId,
        order,
        defaultVisible,
        config: config as LayerConfig,
      })

      const [created] = await tx.select().from(layers).where(eq(layers.id, id)).limit(1)

      if (!created) {
        throw new Error("No se pudo recuperar la capa creada")
      }

      await writeAuditLog(tx, {
        actor,
        action: "create",
        resourceType: "layer",
        resourceId: created.id,
        resourceLabel: created.name,
        summary: `Creó la capa "${created.name}"`,
        details: {
          notes: [`Tipo: ${created.kind}`, `Grupo: ${created.groupId}`],
          metadata: {
            kind: created.kind,
            groupId: created.groupId,
            defaultVisible: created.defaultVisible,
          },
        },
      })

      return created
    })

    return NextResponse.json(row, { status: 201 })
  } catch (error: any) {
    console.error("Error creating layer:", error)
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 })
    }

    const actor = await getAuditActor()

    const existing = await db.select().from(layers).where(eq(layers.id, id)).limit(1)

    if (existing.length === 0) {
      return NextResponse.json({ error: "Layer not found" }, { status: 404 })
    }

    const layer = existing[0]!

    await db.transaction(async (tx) => {
      await tx.delete(layers).where(eq(layers.id, id))

      await writeAuditLog(tx, {
        actor,
        action: "delete",
        resourceType: "layer",
        resourceId: layer.id,
        resourceLabel: layer.name,
        summary: `Eliminó la capa "${layer.name}"`,
        details: {
          notes: [`Tipo: ${layer.kind}`, `Grupo: ${layer.groupId}`],
          metadata: {
            kind: layer.kind,
            groupId: layer.groupId,
          },
        },
      })
    })

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error: any) {
    console.error("Error deleting layer:", error)
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json()
    const { id, name, groupId, config, defaultVisible, order } = body ?? {}

    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

    const [existing] = await db.select().from(layers).where(eq(layers.id, id)).limit(1)

    if (!existing) {
      return NextResponse.json({ error: "Layer not found" }, { status: 404 })
    }

    if (config !== undefined) {
      const validation = validateLayerConfig(existing.kind, config)
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: 400 })
      }
    }

    const patch: Partial<typeof existing> = {}
    if (name !== undefined) patch.name = name
    if (groupId !== undefined) patch.groupId = groupId
    if (config !== undefined) patch.config = config as LayerConfig
    if (defaultVisible !== undefined) patch.defaultVisible = defaultVisible
    if (order !== undefined) patch.order = order

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(existing)
    }

    const actor = await getAuditActor()

    const row = await db.transaction(async (tx) => {
      await tx.update(layers).set(patch).where(eq(layers.id, id))

      const [updated] = await tx.select().from(layers).where(eq(layers.id, id)).limit(1)

      if (!updated) {
        throw new Error("No se pudo recuperar la capa actualizada")
      }

      const changes = buildAuditChanges(existing, updated, [
        { key: "name", label: "Nombre" },
        { key: "groupId", label: "Grupo" },
        { key: "order", label: "Orden" },
        { key: "defaultVisible", label: "Visible por defecto" },
        { key: "config", label: "Configuración" },
      ])

      if (changes.length > 0) {
        const movedOnly = changes.every(
          (change) => change.field === "groupId" || change.field === "order"
        )

        await writeAuditLog(tx, {
          actor,
          action: movedOnly ? "move" : "update",
          resourceType: "layer",
          resourceId: updated.id,
          resourceLabel: updated.name,
          summary: movedOnly
            ? `Reubicó la capa "${updated.name}"`
            : `Actualizó la capa "${updated.name}"`,
          details: { changes },
        })
      }

      return updated
    })

    return NextResponse.json(row)
  } catch (error: any) {
    console.error("Error updating layer:", error)
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 })
  }
}
