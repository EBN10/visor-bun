import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { layerGroups, layers, type LayerConfig } from "~/server/db/schema";

type CatalogNode =
  | {
      id: string;
      type: "group";
      parentId: string | null;
      name: string;
      order: number;
    }
  | {
      id: string;
      type: "layer";
      parentId: string;
      name: string;
      order: number;
      kind: "vector" | "xyz" | "wms" | "wfs";
      config: LayerConfig;
      defaultVisible: boolean;
    };

export async function GET() {
  const groups = await db.select().from(layerGroups);
  const ls = await db.select().from(layers);

  const nodes: CatalogNode[] = [
    ...groups.map((g) => ({
      id: g.id,
      type: "group" as const,
      parentId: g.parentId,
      name: g.name,
      order: g.order ?? 0,
    })),
    ...ls.map((l) => ({
      id: l.id,
      type: "layer" as const,
      parentId: l.groupId,
      name: l.name,
      order: l.order ?? 0,
      kind: l.kind,
      config: l.config,
      defaultVisible: l.defaultVisible ?? false,
    })),
  ];

  return NextResponse.json({ nodes });
}
