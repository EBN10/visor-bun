import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { layers } from "~/server/db/schema";
import { desc, eq } from "drizzle-orm";
import {
  buildAuditChanges,
  getAuditActor,
  writeAuditLog,
} from "~/server/audit";
import {
  asLayerConfig,
  isLayerKind,
  validateLayerConfig,
} from "~/server/layers/validation";
import { validateRemoteWmsConfig } from "~/server/layers/wms";
import type { WmsConfig } from "~/server/db/schema";

export async function GET() {
  const rows = await db.select().from(layers);
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      id,
      name,
      kind,
      groupId,
      defaultVisible = false,
      config,
    } = body ?? {};

    if (!id || !name || !kind || !groupId) {
      return NextResponse.json(
        { error: "id, name, kind, groupId are required" },
        { status: 400 },
      );
    }

    if (!isLayerKind(kind)) {
      return NextResponse.json(
        { error: "Unsupported layer kind" },
        { status: 400 },
      );
    }

    // Check if ID already exists
    const existing = await db
      .select()
      .from(layers)
      .where(eq(layers.id, id))
      .limit(1);
    if (existing.length > 0) {
      return NextResponse.json(
        { error: `Layer with id '${id}' already exists` },
        { status: 409 },
      );
    }

    const v = validateLayerConfig(kind, config);
    if (!v.ok) {
      return NextResponse.json({ error: v.error }, { status: 400 });
    }

    if (kind === "wms") {
      const remoteValidation = await validateRemoteWmsConfig(
        config as WmsConfig,
      );
      if (!remoteValidation.ok) {
        return NextResponse.json(
          { error: remoteValidation.error },
          { status: remoteValidation.status },
        );
      }
    }

    const actor = await getAuditActor();

    const row = await db.transaction(async (tx) => {
      const [lastSibling] = await tx
        .select({ order: layers.order })
        .from(layers)
        .where(eq(layers.groupId, groupId))
        .orderBy(desc(layers.order))
        .limit(1);

      const nextOrder = (lastSibling?.order ?? -1) + 1;

      await tx.insert(layers).values({
        id,
        name,
        kind,
        groupId,
        order: nextOrder,
        defaultVisible,
        config: asLayerConfig(config),
      });

      const [created] = await tx
        .select()
        .from(layers)
        .where(eq(layers.id, id))
        .limit(1);

      if (!created) {
        throw new Error("No se pudo recuperar la capa creada");
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
      });

      return created;
    });

    return NextResponse.json(row, { status: 201 });
  } catch (error: any) {
    console.error("Error creating layer:", error);
    return NextResponse.json(
      { error: error.message || String(error) },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const actor = await getAuditActor();

    const existing = await db
      .select()
      .from(layers)
      .where(eq(layers.id, id))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ error: "Layer not found" }, { status: 404 });
    }

    const layer = existing[0]!;

    await db.transaction(async (tx) => {
      await tx.delete(layers).where(eq(layers.id, id));

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
      });
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error("Error deleting layer:", error);
    return NextResponse.json(
      { error: error.message || String(error) },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, name, groupId, config, defaultVisible, order } = body ?? {};

    if (!id)
      return NextResponse.json({ error: "id is required" }, { status: 400 });

    const [existing] = await db
      .select()
      .from(layers)
      .where(eq(layers.id, id))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Layer not found" }, { status: 404 });
    }

    if (config !== undefined) {
      const validation = validateLayerConfig(existing.kind, config);
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }

      if (existing.kind === "wms") {
        const remoteValidation = await validateRemoteWmsConfig(
          config as WmsConfig,
        );
        if (!remoteValidation.ok) {
          return NextResponse.json(
            { error: remoteValidation.error },
            { status: remoteValidation.status },
          );
        }
      }
    }

    const patch: Partial<typeof existing> = {};
    if (name !== undefined) patch.name = name;
    if (groupId !== undefined) patch.groupId = groupId;
    if (config !== undefined) patch.config = asLayerConfig(config);
    if (defaultVisible !== undefined) patch.defaultVisible = defaultVisible;
    if (order !== undefined) patch.order = order;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(existing);
    }

    const actor = await getAuditActor();

    const row = await db.transaction(async (tx) => {
      if (
        order === undefined &&
        groupId !== undefined &&
        groupId !== existing.groupId
      ) {
        const [lastSibling] = await tx
          .select({ order: layers.order })
          .from(layers)
          .where(eq(layers.groupId, groupId))
          .orderBy(desc(layers.order))
          .limit(1);

        patch.order = (lastSibling?.order ?? -1) + 1;
      }

      await tx.update(layers).set(patch).where(eq(layers.id, id));

      const [updated] = await tx
        .select()
        .from(layers)
        .where(eq(layers.id, id))
        .limit(1);

      if (!updated) {
        throw new Error("No se pudo recuperar la capa actualizada");
      }

      const changes = buildAuditChanges(existing, updated, [
        { key: "name", label: "Nombre" },
        { key: "groupId", label: "Grupo" },
        { key: "order", label: "Orden" },
        { key: "defaultVisible", label: "Visible por defecto" },
        { key: "config", label: "Configuración" },
      ]);

      if (changes.length > 0) {
        const movedOnly = changes.every(
          (change) => change.field === "groupId" || change.field === "order",
        );

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
        });
      }

      return updated;
    });

    return NextResponse.json(row);
  } catch (error: any) {
    console.error("Error updating layer:", error);
    return NextResponse.json(
      { error: error.message || String(error) },
      { status: 500 },
    );
  }
}
