"use client";

import * as React from "react";
import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  rectIntersection,
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Collision,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  AlertCircle,
  ChevronRight,
  Eye,
  Folder,
  FolderOpen,
  Globe,
  GripVertical,
  Layers,
  Map,
  Pencil,
  Plus,
  Save,
  Undo2,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { fetchJson, qk } from "~/lib/api";
import { cn } from "~/lib/utils";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { GroupSheet } from "./group-sheet";
import { LayerCreateSheet } from "./layer-create-sheet";
import { LayerSheet } from "./layer-sheet";

const ROOT_ID = "__root__";
const INDENT_PX = 20;
const GROUP_DROP_EDGE_INSET_PX = 10;

type TreeItemType = "group" | "layer";

interface TreeItemData {
  id: string;
  name: string;
  type: TreeItemType;
  children?: string[];
  parentId?: string | null;
  order?: number;
  kind?: "vector" | "wms" | "wfs" | "xyz";
  groupId?: string;
  defaultVisible?: boolean;
  config?: any;
}

interface TreeNode {
  id: string;
  data: TreeItemData;
  depth: number;
  parentId: string | null;
}

interface PendingChange {
  itemId: string;
  itemType: TreeItemType;
  newParentId: string | null;
  newOrder: number;
}

type DropZonePayload =
  | {
      kind: "section-slot";
      parentId: string | null;
      accepts: TreeItemType;
      position: "before" | "after";
      anchorId: string | null;
    }
  | {
      kind: "group-body";
      groupId: string;
    };

type DropIntent =
  | ({
      zoneId: string;
    } & DropZonePayload)
  | null;

function buildTreeItems(
  groups: any[],
  layers: any[],
): Record<string, TreeItemData> {
  const items: Record<string, TreeItemData> = {
    [ROOT_ID]: {
      id: ROOT_ID,
      name: "Raíz",
      type: "group",
      children: [],
    },
  };

  for (const group of groups) {
    items[group.id] = {
      id: group.id,
      name: group.name,
      type: "group",
      parentId: group.parentId ?? null,
      order: group.order,
      children: [],
    };
  }

  for (const layer of layers) {
    items[layer.id] = {
      id: layer.id,
      name: layer.name,
      type: "layer",
      kind: layer.kind,
      groupId: layer.groupId,
      order: layer.order,
      defaultVisible: layer.defaultVisible,
      config: layer.config,
    };
  }

  for (const group of groups) {
    const parentId = group.parentId ?? ROOT_ID;
    items[parentId]?.children?.push(group.id);
  }

  for (const layer of layers) {
    items[layer.groupId]?.children?.push(layer.id);
  }

  for (const item of Object.values(items)) {
    if (!item.children) continue;

    item.children.sort((a, b) => {
      const itemA = items[a];
      const itemB = items[b];

      if (!itemA || !itemB) return 0;
      if (itemA.type !== itemB.type) {
        return itemA.type === "group" ? -1 : 1;
      }

      return (itemA.order ?? 0) - (itemB.order ?? 0);
    });
  }

  return items;
}

function cloneTreeItems(
  items: Record<string, TreeItemData>,
): Record<string, TreeItemData> {
  return JSON.parse(JSON.stringify(items)) as Record<string, TreeItemData>;
}

function getItemParentId(item: TreeItemData): string | null {
  return item.type === "group"
    ? (item.parentId ?? null)
    : (item.groupId ?? null);
}

function getSectionChildIds(
  items: Record<string, TreeItemData>,
  parentId: string | null,
  type: TreeItemType,
): string[] {
  const parent = items[parentId ?? ROOT_ID];
  return (parent?.children ?? []).filter(
    (childId) => items[childId]?.type === type,
  );
}

function setSectionChildIds(
  items: Record<string, TreeItemData>,
  parentId: string | null,
  type: TreeItemType,
  sectionIds: string[],
) {
  const parent = items[parentId ?? ROOT_ID];
  if (!parent?.children) return;

  const siblingType = type === "group" ? "layer" : "group";
  const siblingIds = getSectionChildIds(items, parentId, siblingType);

  parent.children =
    type === "group"
      ? [...sectionIds, ...siblingIds]
      : [...siblingIds, ...sectionIds];
}

function reindexSection(
  items: Record<string, TreeItemData>,
  parentId: string | null,
  type: TreeItemType,
) {
  const sectionIds = getSectionChildIds(items, parentId, type);

  sectionIds.forEach((itemId, index) => {
    const item = items[itemId];
    if (!item) return;

    item.order = index;
    if (type === "group") {
      item.parentId = parentId;
    } else {
      item.groupId = parentId ?? undefined;
    }
  });
}

function moveTreeItem(
  items: Record<string, TreeItemData>,
  itemId: string,
  targetParentId: string | null,
  targetIndex: number,
): Record<string, TreeItemData> {
  const nextItems = cloneTreeItems(items);
  const item = nextItems[itemId];
  if (!item) return items;

  const itemType = item.type;
  const currentParentId = getItemParentId(item);
  const sourceIds = getSectionChildIds(
    nextItems,
    currentParentId,
    itemType,
  ).filter((id) => id !== itemId);
  const destinationBaseIds =
    currentParentId === targetParentId
      ? sourceIds
      : getSectionChildIds(nextItems, targetParentId, itemType);
  const destinationIds = [...destinationBaseIds];
  const clampedIndex = Math.max(
    0,
    Math.min(targetIndex, destinationIds.length),
  );

  destinationIds.splice(clampedIndex, 0, itemId);

  if (currentParentId === targetParentId) {
    setSectionChildIds(nextItems, targetParentId, itemType, destinationIds);
    reindexSection(nextItems, targetParentId, itemType);
    return nextItems;
  }

  setSectionChildIds(nextItems, currentParentId, itemType, sourceIds);
  reindexSection(nextItems, currentParentId, itemType);

  setSectionChildIds(nextItems, targetParentId, itemType, destinationIds);
  reindexSection(nextItems, targetParentId, itemType);

  return nextItems;
}

function buildPendingChanges(
  baseItems: Record<string, TreeItemData>,
  currentItems: Record<string, TreeItemData>,
): PendingChange[] {
  const changes: PendingChange[] = [];

  for (const item of Object.values(currentItems)) {
    if (item.id === ROOT_ID) continue;

    const baseItem = baseItems[item.id];
    if (!baseItem) continue;

    const newParentId = getItemParentId(item);
    const oldParentId = getItemParentId(baseItem);
    const newOrder = item.order ?? 0;
    const oldOrder = baseItem.order ?? 0;

    if (newParentId === oldParentId && newOrder === oldOrder) continue;

    changes.push({
      itemId: item.id,
      itemType: item.type,
      newParentId,
      newOrder,
    });
  }

  return changes;
}

function getDescendantIds(
  items: Record<string, TreeItemData>,
  nodeId: string,
): string[] {
  const descendants: string[] = [];
  const stack = [...(items[nodeId]?.children ?? [])];

  while (stack.length > 0) {
    const childId = stack.pop();
    if (!childId) continue;

    descendants.push(childId);
    stack.push(...(items[childId]?.children ?? []));
  }

  return descendants;
}

function buildSectionZoneId(
  parentId: string | null,
  accepts: TreeItemType,
  position: "before" | "after",
  anchorId: string | null,
): string {
  return `slot:${parentId ?? ROOT_ID}:${accepts}:${position}:${anchorId ?? "empty"}`;
}

function buildGroupBodyZoneId(groupId: string): string {
  return `group-body:${groupId}`;
}

function getCollisionPayload(collision: Collision): DropZonePayload | null {
  const droppableContainer = collision.data?.droppableContainer;

  return (
    (droppableContainer?.data.current as DropZonePayload | undefined) ?? null
  );
}

function getCollisionScore(collision: Collision): number {
  const rawValue = collision.data?.value;
  return typeof rawValue === "number" ? rawValue : 0;
}

interface GroupBodyCollision {
  collision: Collision;
  centerInsideInterior: boolean;
  centerDistance: number;
}

const layerTreeCollisionDetection: CollisionDetection = (args) => {
  const rectCollisions = rectIntersection(args);

  if (rectCollisions.length === 0) {
    return pointerWithin(args);
  }

  const overlayCenterY = args.collisionRect.top + args.collisionRect.height / 2;
  const groupBodyCollisions = rectCollisions
    .map((collision) => {
      const payload = getCollisionPayload(collision);
      if (payload?.kind !== "group-body") return null;

      const rect = args.droppableRects.get(collision.id);
      if (!rect) return null;

      const edgeInset = Math.min(
        GROUP_DROP_EDGE_INSET_PX,
        Math.max(6, rect.height * 0.22),
      );
      const centerInsideInterior =
        overlayCenterY >= rect.top + edgeInset &&
        overlayCenterY <= rect.bottom - edgeInset;

      return {
        collision,
        centerInsideInterior,
        centerDistance: Math.abs(overlayCenterY - (rect.top + rect.height / 2)),
      };
    })
    .filter((entry): entry is GroupBodyCollision => entry !== null)
    .sort((left, right) => {
      if (left.centerInsideInterior !== right.centerInsideInterior) {
        return left.centerInsideInterior ? -1 : 1;
      }

      const scoreDelta =
        getCollisionScore(right.collision) - getCollisionScore(left.collision);
      if (scoreDelta !== 0) return scoreDelta;

      return left.centerDistance - right.centerDistance;
    });

  if (groupBodyCollisions[0]?.centerInsideInterior) {
    return [groupBodyCollisions[0].collision];
  }

  const slotCollisions = rectCollisions
    .filter(
      (collision) => getCollisionPayload(collision)?.kind === "section-slot",
    )
    .sort((left, right) => getCollisionScore(right) - getCollisionScore(left));
  const firstSlotCollision = slotCollisions[0];

  if (firstSlotCollision) {
    return [firstSlotCollision];
  }

  const firstGroupBodyCollision = groupBodyCollisions[0];

  if (firstGroupBodyCollision) {
    return [firstGroupBodyCollision.collision];
  }

  return rectCollisions;
};

function getLayerIcon(kind: string) {
  switch (kind) {
    case "vector":
      return <Layers className="size-4 text-blue-500" />;
    case "wms":
      return <Globe className="size-4 text-green-500" />;
    case "wfs":
      return <Layers className="size-4 text-violet-500" />;
    case "xyz":
      return <Map className="size-4 text-orange-500" />;
    default:
      return <Layers className="size-4" />;
  }
}

interface DropZoneProps {
  zoneId: string;
  payload: DropZonePayload;
  depth: number;
  activeType: TreeItemType | null;
  activeZoneId: string | null;
}

function DropZone({
  zoneId,
  payload,
  depth,
  activeType,
  activeZoneId,
}: DropZoneProps) {
  const enabled =
    payload.kind === "section-slot"
      ? activeType === payload.accepts
      : activeType !== null;

  const { setNodeRef } = useDroppable({
    id: zoneId,
    data: payload,
    disabled: !enabled,
  });

  const isActive = activeZoneId === zoneId;

  return (
    <div
      ref={setNodeRef}
      aria-hidden="true"
      className={cn(
        "relative transition-all duration-150",
        enabled ? "h-3" : "h-1",
      )}
      style={{ marginLeft: `${depth * INDENT_PX}px` }}
    >
      <div
        className={cn(
          "pointer-events-none absolute top-1/2 right-0 left-2 -translate-y-1/2 transition-all duration-150",
          isActive ? "bg-primary h-0.5" : "h-px bg-transparent",
        )}
      />
      <div
        className={cn(
          "border-primary bg-background pointer-events-none absolute top-1/2 left-1 size-2 -translate-y-1/2 rounded-full border-2 transition-opacity duration-150",
          isActive ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}

interface TreeRowProps {
  node: TreeNode;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  onEditClick: (item: TreeItemData) => void;
  activeId: string | null;
  activeType: TreeItemType | null;
  activeZoneId: string | null;
}

function TreeRow({
  node,
  isExpanded,
  onToggle,
  onEditClick,
  activeId,
  activeType,
  activeZoneId,
}: TreeRowProps) {
  const { id, data, depth } = node;
  const isGroup = data.type === "group";
  const isDragging = activeId === id;
  const groupBodyZoneId = isGroup ? buildGroupBodyZoneId(id) : null;
  const showNestHighlight =
    groupBodyZoneId !== null && activeZoneId === groupBodyZoneId;

  const { attributes, listeners, setNodeRef } = useDraggable({
    id,
    data: { itemType: data.type },
  });

  const { setNodeRef: setDroppableNodeRef } = useDroppable({
    id: groupBodyZoneId ?? `group-body-disabled:${id}`,
    data: isGroup
      ? ({ kind: "group-body", groupId: id } satisfies DropZonePayload)
      : undefined,
    disabled: !isGroup || activeType === null,
  });

  return (
    <div ref={setNodeRef} className="relative">
      <div
        ref={isGroup ? setDroppableNodeRef : undefined}
        className={cn(isGroup && "py-1")}
      >
        <div
          role="treeitem"
          aria-selected={false}
          tabIndex={0}
          className={cn(
            "flex cursor-default items-center gap-2 rounded-md border border-transparent px-2 py-1.5 transition-all duration-200 select-none",
            "dark:hover:bg-muted/80 hover:bg-white",
            showNestHighlight &&
              "border-primary/45 bg-primary/10 shadow-primary/10 shadow-sm",
            isDragging && "opacity-35",
          )}
          style={{ marginLeft: `${depth * INDENT_PX}px` }}
        >
          <div
            className="hover:bg-muted flex shrink-0 cursor-grab touch-none rounded p-0.5 active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="text-muted-foreground/50 size-4" />
          </div>

          {isGroup ? (
            <div
              role="button"
              tabIndex={-1}
              onClick={(event) => {
                event.stopPropagation();
                onToggle(id);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  onToggle(id);
                }
              }}
              className="hover:bg-muted shrink-0 cursor-pointer rounded p-0.5 transition-colors"
            >
              <motion.div
                animate={{ rotate: isExpanded ? 90 : 0 }}
                transition={{ duration: 0.15 }}
              >
                <ChevronRight className="text-muted-foreground size-4" />
              </motion.div>
            </div>
          ) : (
            <div className="w-5 shrink-0" />
          )}

          <div className="shrink-0">
            {isGroup ? (
              isExpanded ? (
                <FolderOpen className="size-4 text-amber-500" />
              ) : (
                <Folder className="size-4 text-amber-500" />
              )
            ) : (
              getLayerIcon(data.kind ?? "vector")
            )}
          </div>

          <span
            className={cn(
              "flex-1 truncate text-sm",
              isGroup && "cursor-pointer font-medium",
            )}
            onClick={(event) => {
              event.stopPropagation();
              if (isGroup) onToggle(id);
            }}
          >
            {data.name}
          </span>

          {!isGroup && (
            <div className="ml-2 flex shrink-0 items-center gap-1.5">
              {data.defaultVisible && (
                <Eye className="size-3.5 text-green-500" />
              )}
              <Badge
                variant="outline"
                className="px-1.5 py-0 text-[10px] font-normal"
              >
                {data.kind}
              </Badge>
            </div>
          )}

          <div
            role="button"
            tabIndex={-1}
            className="hover:bg-muted ml-1 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded opacity-0 transition-opacity group-hover/item:opacity-100 hover:!opacity-100"
            onClick={(event) => {
              event.stopPropagation();
              onEditClick(data);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                onEditClick(data);
              }
            }}
          >
            <Pencil className="size-3" />
          </div>
        </div>
      </div>
    </div>
  );
}

function DragOverlayContent({ data }: { data: TreeItemData }) {
  const isGroup = data.type === "group";

  return (
    <div className="bg-background pointer-events-none flex w-fit max-w-xs items-center gap-2 rounded-md border px-3 py-1.5 shadow-lg shadow-black/10 dark:shadow-black/30">
      <GripVertical className="text-muted-foreground/50 size-4" />
      <div className="shrink-0">
        {isGroup ? (
          <Folder className="size-4 text-amber-500" />
        ) : (
          getLayerIcon(data.kind ?? "vector")
        )}
      </div>
      <span className="truncate text-sm font-medium">{data.name}</span>
      {!isGroup && (
        <Badge
          variant="outline"
          className="px-1.5 py-0 text-[10px] font-normal"
        >
          {data.kind}
        </Badge>
      )}
    </div>
  );
}

function resolveDropMove(
  items: Record<string, TreeItemData>,
  activeItemId: string,
  intent: DropIntent,
): Record<string, TreeItemData> | null {
  if (!intent) return null;

  const activeItem = items[activeItemId];
  if (!activeItem) return null;

  if (intent.kind === "group-body") {
    const targetParentId = intent.groupId;
    const targetIndex = getSectionChildIds(
      items,
      targetParentId,
      activeItem.type,
    ).filter((itemId) => itemId !== activeItemId).length;

    return moveTreeItem(items, activeItemId, targetParentId, targetIndex);
  }

  if (activeItem.type !== intent.accepts) return null;
  if (activeItem.type === "layer" && intent.parentId === null) return null;

  const destinationIds = getSectionChildIds(
    items,
    intent.parentId,
    intent.accepts,
  ).filter((itemId) => itemId !== activeItemId);

  let targetIndex = 0;

  if (intent.anchorId !== null) {
    const anchorIndex = destinationIds.indexOf(intent.anchorId);
    if (anchorIndex === -1) return null;

    targetIndex = intent.position === "before" ? anchorIndex : anchorIndex + 1;
  }

  return moveTreeItem(items, activeItemId, intent.parentId, targetIndex);
}

export function LayerGroupTree() {
  const queryClient = useQueryClient();
  const [selectedItem, setSelectedItem] = useState<TreeItemData | null>(null);
  const [isLayerSheetOpen, setIsLayerSheetOpen] = useState(false);
  const [isNewLayerSheetOpen, setIsNewLayerSheetOpen] = useState(false);
  const [isGroupSheetOpen, setIsGroupSheetOpen] = useState(false);
  const [isNewGroupSheetOpen, setIsNewGroupSheetOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [workingTreeItems, setWorkingTreeItems] = useState<Record<
    string,
    TreeItemData
  > | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set([ROOT_ID]),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dropIntent, setDropIntent] = useState<DropIntent>(null);

  const groupsQuery = useQuery({
    queryKey: ["admin", "layer-groups"],
    queryFn: () => fetchJson<any[]>("/api/admin/layer-groups"),
  });

  const layersQuery = useQuery({
    queryKey: ["admin", "layers"],
    queryFn: () => fetchJson<any[]>("/api/admin/layers"),
  });

  const updateLayerMutation = useMutation({
    mutationFn: async (data: { id: string; groupId: string; order: number }) =>
      fetchJson("/api/admin/layers", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      }),
  });

  const updateGroupMutation = useMutation({
    mutationFn: async (data: {
      id: string;
      parentId: string | null;
      order: number;
    }) =>
      fetchJson("/api/admin/layer-groups", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      }),
  });

  const baseTreeItems = useMemo(() => {
    if (!groupsQuery.data || !layersQuery.data) {
      return {
        [ROOT_ID]: {
          id: ROOT_ID,
          name: "Raíz",
          type: "group" as const,
          children: [],
        },
      };
    }

    return buildTreeItems(groupsQuery.data, layersQuery.data);
  }, [groupsQuery.data, layersQuery.data]);

  const treeItems = workingTreeItems ?? baseTreeItems;

  const pendingChanges = useMemo(() => {
    if (!workingTreeItems) return [];
    return buildPendingChanges(baseTreeItems, workingTreeItems);
  }, [baseTreeItems, workingTreeItems]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const nextActiveId = String(event.active.id);
      setActiveId(nextActiveId);

      const activeItem = treeItems[nextActiveId];
      if (activeItem?.type === "group") {
        setExpandedIds((previous) => new Set(previous).add(nextActiveId));
      }
    },
    [treeItems],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;

      if (!active || !over) {
        setDropIntent(null);
        return;
      }

      const activeItemId = String(active.id);
      const activeItem = treeItems[activeItemId];
      const payload = over.data.current as DropZonePayload | undefined;

      if (!activeItem || !payload) {
        setDropIntent(null);
        return;
      }

      if (payload.kind === "section-slot") {
        if (payload.accepts !== activeItem.type) {
          setDropIntent(null);
          return;
        }

        if (payload.anchorId === activeItemId) {
          setDropIntent(null);
          return;
        }

        if (activeItem.type === "layer" && payload.parentId === null) {
          setDropIntent(null);
          return;
        }

        if (activeItem.type === "group" && payload.parentId !== null) {
          const descendants = getDescendantIds(treeItems, activeItemId);
          if (descendants.includes(payload.parentId)) {
            setDropIntent(null);
            return;
          }
        }

        setDropIntent({
          zoneId: String(over.id),
          ...payload,
        });
        return;
      }

      if (payload.groupId === activeItemId) {
        setDropIntent(null);
        return;
      }

      if (activeItem.type === "group") {
        const descendants = getDescendantIds(treeItems, activeItemId);
        if (descendants.includes(payload.groupId)) {
          setDropIntent(null);
          return;
        }
      }

      setDropIntent({
        zoneId: String(over.id),
        ...payload,
      });
    },
    [treeItems],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const nextActiveId = String(event.active.id);
      const localIntent = dropIntent;

      setActiveId(null);
      setDropIntent(null);

      if (!localIntent) return;

      const nextTreeItems = resolveDropMove(
        treeItems,
        nextActiveId,
        localIntent,
      );
      if (!nextTreeItems) return;

      const nextChanges = buildPendingChanges(baseTreeItems, nextTreeItems);
      setWorkingTreeItems(nextChanges.length > 0 ? nextTreeItems : null);
    },
    [baseTreeItems, dropIntent, treeItems],
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setDropIntent(null);
  }, []);

  const handleEditClick = useCallback((itemData: TreeItemData) => {
    if (itemData.id === ROOT_ID) return;

    setSelectedItem(itemData);
    if (itemData.type === "layer") {
      setIsLayerSheetOpen(true);
    } else {
      setIsGroupSheetOpen(true);
    }
  }, []);

  const handleNewGroup = useCallback(() => {
    setSelectedItem(null);
    setIsNewGroupSheetOpen(true);
  }, []);

  const handleNewLayer = useCallback(() => {
    setSelectedItem(null);
    setIsNewLayerSheetOpen(true);
  }, []);

  const handleDiscardChanges = useCallback(() => {
    setWorkingTreeItems(null);
    toast.info("Cambios descartados");
  }, []);

  const handleSaveChanges = useCallback(async () => {
    if (pendingChanges.length === 0) return;

    setIsSaving(true);

    try {
      for (const change of pendingChanges) {
        if (change.itemType === "layer") {
          await updateLayerMutation.mutateAsync({
            id: change.itemId,
            groupId: change.newParentId!,
            order: change.newOrder,
          });
        } else {
          await updateGroupMutation.mutateAsync({
            id: change.itemId,
            parentId: change.newParentId,
            order: change.newOrder,
          });
        }
      }

      setWorkingTreeItems(null);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "layers"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "layer-groups"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "activity"] }),
        queryClient.invalidateQueries({ queryKey: qk.catalog }),
      ]);

      toast.success(`${pendingChanges.length} cambio(s) guardado(s)`);
    } catch (error: any) {
      toast.error(error.message ?? "Error al guardar cambios");
    } finally {
      setIsSaving(false);
    }
  }, [pendingChanges, queryClient, updateGroupMutation, updateLayerMutation]);

  const activeData = activeId ? treeItems[activeId] : null;
  const activeType = activeData?.type ?? null;
  const activeZoneId = dropIntent?.zoneId ?? null;
  const hasItems = Object.keys(treeItems).length > 1;
  const hasPendingChanges = pendingChanges.length > 0;

  const renderChildren = useCallback(
    (parentId: string | null, depth: number): React.ReactNode => {
      const groupIds = getSectionChildIds(treeItems, parentId, "group");
      const layerIds =
        parentId === null
          ? []
          : getSectionChildIds(treeItems, parentId, "layer");

      return (
        <>
          {groupIds.map((childId, index) => {
            const child = treeItems[childId];
            if (!child) return null;

            const rowNode: TreeNode = {
              id: childId,
              data: child,
              depth,
              parentId,
            };

            return (
              <React.Fragment key={childId}>
                <DropZone
                  zoneId={buildSectionZoneId(
                    parentId,
                    "group",
                    "before",
                    childId,
                  )}
                  payload={{
                    kind: "section-slot",
                    parentId,
                    accepts: "group",
                    position: "before",
                    anchorId: childId,
                  }}
                  depth={depth}
                  activeType={activeType}
                  activeZoneId={activeZoneId}
                />

                <div className="group/item">
                  <TreeRow
                    node={rowNode}
                    isExpanded={expandedIds.has(childId)}
                    onToggle={toggleExpand}
                    onEditClick={handleEditClick}
                    activeId={activeId}
                    activeType={activeType}
                    activeZoneId={activeZoneId}
                  />
                </div>

                {expandedIds.has(childId) && (
                  <div role="group">{renderChildren(childId, depth + 1)}</div>
                )}

                {index === groupIds.length - 1 && (
                  <DropZone
                    zoneId={buildSectionZoneId(
                      parentId,
                      "group",
                      "after",
                      childId,
                    )}
                    payload={{
                      kind: "section-slot",
                      parentId,
                      accepts: "group",
                      position: "after",
                      anchorId: childId,
                    }}
                    depth={depth}
                    activeType={activeType}
                    activeZoneId={activeZoneId}
                  />
                )}
              </React.Fragment>
            );
          })}

          {layerIds.map((childId, index) => {
            const child = treeItems[childId];
            if (!child) return null;

            const rowNode: TreeNode = {
              id: childId,
              data: child,
              depth,
              parentId,
            };

            return (
              <React.Fragment key={childId}>
                <DropZone
                  zoneId={buildSectionZoneId(
                    parentId,
                    "layer",
                    "before",
                    childId,
                  )}
                  payload={{
                    kind: "section-slot",
                    parentId,
                    accepts: "layer",
                    position: "before",
                    anchorId: childId,
                  }}
                  depth={depth}
                  activeType={activeType}
                  activeZoneId={activeZoneId}
                />

                <div className="group/item">
                  <TreeRow
                    node={rowNode}
                    isExpanded={false}
                    onToggle={toggleExpand}
                    onEditClick={handleEditClick}
                    activeId={activeId}
                    activeType={activeType}
                    activeZoneId={activeZoneId}
                  />
                </div>

                {index === layerIds.length - 1 && (
                  <DropZone
                    zoneId={buildSectionZoneId(
                      parentId,
                      "layer",
                      "after",
                      childId,
                    )}
                    payload={{
                      kind: "section-slot",
                      parentId,
                      accepts: "layer",
                      position: "after",
                      anchorId: childId,
                    }}
                    depth={depth}
                    activeType={activeType}
                    activeZoneId={activeZoneId}
                  />
                )}
              </React.Fragment>
            );
          })}
        </>
      );
    },
    [
      activeId,
      activeType,
      activeZoneId,
      expandedIds,
      handleEditClick,
      toggleExpand,
      treeItems,
    ],
  );

  if (groupsQuery.isLoading || layersQuery.isLoading) {
    return <div className="text-muted-foreground p-4">Cargando...</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Gestión de Capas y Grupos</h2>
          <p className="text-muted-foreground text-sm">
            Arrastra para reordenar, crea capas de servicio y usa QGIS para
            importar GeoJSON cuando lo necesites.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleNewLayer} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Nueva Capa
          </Button>
          <Button onClick={handleNewGroup} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Grupo
          </Button>
        </div>
      </div>

      <div className="bg-muted/40 min-h-0 flex-1 overflow-auto rounded-lg border">
        <div className="p-3">
          {hasItems ? (
            <DndContext
              sensors={sensors}
              collisionDetection={layerTreeCollisionDetection}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
              measuring={{
                droppable: { strategy: MeasuringStrategy.Always },
              }}
            >
              <div role="tree" className="flex flex-col">
                {renderChildren(null, 0)}
              </div>

              <DragOverlay
                dropAnimation={{
                  duration: 200,
                  easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)",
                }}
              >
                {activeData ? <DragOverlayContent data={activeData} /> : null}
              </DragOverlay>
            </DndContext>
          ) : (
            <div className="text-muted-foreground py-8 text-center">
              <p>No hay grupos ni capas.</p>
              <p className="mt-2 text-sm">
                Crea un grupo o importa capas desde QGIS para comenzar.
              </p>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {hasPendingChanges && (
          <motion.div
            initial={{ opacity: 0, y: 30, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto", marginTop: 12 }}
            exit={{ opacity: 0, y: 30, height: 0, marginTop: 0 }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 30,
              opacity: { duration: 0.2 },
            }}
            className="flex items-center justify-between overflow-hidden rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30"
          >
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertCircle className="size-4" />
              <span className="text-sm font-medium">
                {pendingChanges.length} cambio
                {pendingChanges.length > 1 ? "s" : ""} sin guardar
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDiscardChanges}
                disabled={isSaving}
              >
                <Undo2 className="mr-2 size-4" />
                Descartar
              </Button>
              <Button size="sm" onClick={handleSaveChanges} disabled={isSaving}>
                <Save className="mr-2 size-4" />
                {isSaving ? "Guardando..." : "Guardar cambios"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="text-muted-foreground mt-3 text-xs">
        Para datos propios en GeoJSON usa la opción de{" "}
        <a href="/admin/qgis" className="text-primary underline">
          Importar desde QGIS
        </a>{" "}
        y para servicios remotos crea una capa WMS, WFS o XYZ desde “Nueva
        Capa”.
      </p>

      <LayerSheet
        open={isLayerSheetOpen}
        onOpenChange={setIsLayerSheetOpen}
        layer={selectedItem?.type === "layer" ? selectedItem : null}
        groups={groupsQuery.data ?? []}
      />

      <LayerCreateSheet
        open={isNewLayerSheetOpen}
        onOpenChange={setIsNewLayerSheetOpen}
        groups={groupsQuery.data ?? []}
      />

      <GroupSheet
        open={isGroupSheetOpen}
        onOpenChange={setIsGroupSheetOpen}
        group={selectedItem?.type === "group" ? selectedItem : null}
        groups={groupsQuery.data ?? []}
        isNew={false}
      />

      <GroupSheet
        open={isNewGroupSheetOpen}
        onOpenChange={setIsNewGroupSheetOpen}
        group={null}
        groups={groupsQuery.data ?? []}
        isNew={true}
      />
    </div>
  );
}
