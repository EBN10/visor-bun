import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { layers } from "~/server/db/schema";
import { desc, eq } from "drizzle-orm";
import {
  buildAuditChanges,
  getAuditActor,
  writeAuditLog,
} from "~/server/audit";
import { asLayerConfig, validateLayerConfig } from "~/server/layers/validation";
import { validateRemoteWmsConfig } from "~/server/layers/wms";
import type { WmsConfig } from "~/server/db/schema";

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = await req.json();
  const { name, groupId, order, defaultVisible, config } = body ?? {};

  const [existing] = await db
    .select()
    .from(layers)
    .where(eq(layers.id, id))
    .limit(1);
  if (!existing)
    return NextResponse.json({ error: "not found" }, { status: 404 });

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

  const patch: any = {};
  if (name !== undefined) patch.name = name;
  if (groupId !== undefined) patch.groupId = groupId;
  if (order !== undefined) patch.order = order;
  if (defaultVisible !== undefined) patch.defaultVisible = defaultVisible;
  if (config !== undefined) patch.config = asLayerConfig(config);

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
      await writeAuditLog(tx, {
        actor,
        action: "update",
        resourceType: "layer",
        resourceId: updated.id,
        resourceLabel: updated.name,
        summary: `Actualizó la capa "${updated.name}"`,
        details: { changes },
      });
    }

    return updated;
  });

  return NextResponse.json(row);
}

export async function DELETE(
  _: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const [existing] = await db
    .select()
    .from(layers)
    .where(eq(layers.id, id))
    .limit(1);
  if (!existing)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  const actor = await getAuditActor();

  await db.delete(layers).where(eq(layers.id, id));
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
  });
  return NextResponse.json({ ok: true });
}
