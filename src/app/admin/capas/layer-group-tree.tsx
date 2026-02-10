"use client"

import * as React from "react"
import { useState, useMemo, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
  MeasuringStrategy,
} from "@dnd-kit/core"
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { fetchJson, qk } from "~/lib/api"
import {
  Folder,
  FolderOpen,
  Map,
  Globe,
  Layers,
  Eye,
  GripVertical,
  Plus,
  ChevronRight,
  Pencil,
  AlertCircle,
  Undo2,
  Save,
} from "lucide-react"
import { cn } from "~/lib/utils"
import { Button } from "~/components/ui/button"
import { Badge } from "~/components/ui/badge"
import { toast } from "sonner"
import { LayerSheet } from "./layer-sheet"
import { GroupSheet } from "./group-sheet"
import { motion, AnimatePresence } from "framer-motion"

// ─── Types ──────────────────────────────────────────────────────────────────

const ROOT_ID = "__root__"
const INDENT_PX = 20

type TreeItemType = "group" | "layer"

interface TreeItemData {
  id: string
  name: string
  type: TreeItemType
  children?: string[]
  parentId?: string | null
  order?: number
  kind?: "vector" | "wms" | "xyz"
  groupId?: string
  defaultVisible?: boolean
  config?: any
}

interface FlatItem {
  id: string
  data: TreeItemData
  parentId: string
  depth: number
}

interface PendingChange {
  itemId: string
  itemType: TreeItemType
  newParentId: string | null
  newOrder: number
}

type DropIntent =
  | { type: "reorder"; targetId: string; position: "before" | "after" }
  | { type: "nest"; targetGroupId: string }
  | null

// ─── Data helpers ───────────────────────────────────────────────────────────

function buildTreeItems(
  groups: any[],
  layers: any[]
): Record<string, TreeItemData> {
  const items: Record<string, TreeItemData> = {}

  items[ROOT_ID] = {
    id: ROOT_ID,
    name: "Raíz",
    type: "group",
    children: [],
  }

  for (const group of groups) {
    items[group.id] = {
      id: group.id,
      name: group.name,
      type: "group",
      parentId: group.parentId,
      order: group.order,
      children: [],
    }
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
      children: [],
    }
  }

  for (const group of groups) {
    const parentId = group.parentId || ROOT_ID
    if (items[parentId]?.children) {
      items[parentId].children!.push(group.id)
    }
  }

  for (const layer of layers) {
    const groupItem = items[layer.groupId]
    if (groupItem?.children) {
      groupItem.children.push(layer.id)
    }
  }

  for (const item of Object.values(items)) {
    if (item.children && item.children.length > 0) {
      item.children.sort((a, b) => {
        const itemA = items[a]
        const itemB = items[b]
        if (itemA?.type !== itemB?.type) {
          return itemA?.type === "group" ? -1 : 1
        }
        return (itemA?.order ?? 0) - (itemB?.order ?? 0)
      })
    }
  }

  return items
}

function applyPendingChanges(
  baseItems: Record<string, TreeItemData>,
  pendingChanges: PendingChange[]
): Record<string, TreeItemData> {
  if (pendingChanges.length === 0) return baseItems

  const items = JSON.parse(JSON.stringify(baseItems)) as Record<
    string,
    TreeItemData
  >

  for (const change of pendingChanges) {
    const item = items[change.itemId]
    if (!item) continue

    let currentParentId: string | null = null
    if (item.type === "layer") {
      currentParentId = item.groupId ?? null
    } else {
      currentParentId = item.parentId ?? null
    }

    const currentParent = items[currentParentId ?? ROOT_ID]
    if (currentParent?.children) {
      currentParent.children = currentParent.children.filter(
        (id) => id !== change.itemId
      )
    }
  }

  for (const change of pendingChanges) {
    const item = items[change.itemId]
    if (!item) continue

    const newParentId = change.newParentId ?? ROOT_ID
    const newParent = items[newParentId]

    if (item.type === "layer") {
      item.groupId = change.newParentId ?? undefined
    } else {
      item.parentId = change.newParentId
    }
    item.order = change.newOrder

    if (newParent?.children) {
      const insertIdx = Math.min(change.newOrder, newParent.children.length)
      newParent.children.splice(insertIdx, 0, change.itemId)
    }
  }

  return items
}

/** Flatten tree respecting expanded state, skipping root  */
function flattenTree(
  items: Record<string, TreeItemData>,
  expandedIds: Set<string>
): FlatItem[] {
  const result: FlatItem[] = []

  function walk(nodeId: string, depth: number, parentId: string) {
    const node = items[nodeId]
    if (!node) return
    if (nodeId !== ROOT_ID) {
      result.push({ id: nodeId, data: node, parentId, depth })
    }
    if (node.type === "group" && (nodeId === ROOT_ID || expandedIds.has(nodeId))) {
      for (const childId of node.children ?? []) {
        walk(childId, nodeId === ROOT_ID ? 0 : depth + 1, nodeId)
      }
    }
  }

  walk(ROOT_ID, 0, ROOT_ID)
  return result
}

/** Get all descendant ids (recursive) */
function getDescendantIds(
  items: Record<string, TreeItemData>,
  nodeId: string
): string[] {
  const result: string[] = []
  const stack = [...(items[nodeId]?.children ?? [])]
  while (stack.length > 0) {
    const id = stack.pop()!
    result.push(id)
    const node = items[id]
    if (node?.children) {
      stack.push(...node.children)
    }
  }
  return result
}

function getLayerIcon(kind: string) {
  switch (kind) {
    case "vector":
      return <Layers className="size-4 text-blue-500" />
    case "wms":
      return <Globe className="size-4 text-green-500" />
    case "xyz":
      return <Map className="size-4 text-orange-500" />
    default:
      return <Layers className="size-4" />
  }
}

// ─── Sortable Item ──────────────────────────────────────────────────────────

interface SortableTreeItemProps {
  flatItem: FlatItem
  isExpanded: boolean
  onToggle: (id: string) => void
  onEditClick: (item: TreeItemData) => void
  dropIntent: DropIntent
  isDragging: boolean
}

function SortableTreeItem({
  flatItem,
  isExpanded,
  onToggle,
  onEditClick,
  dropIntent,
  isDragging,
}: SortableTreeItemProps) {
  const { id, data, depth } = flatItem
  const isGroup = data.type === "group"

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isSorting,
  } = useSortable({ id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(
      transform ? { ...transform, scaleX: 1, scaleY: 1 } : null
    ),
    transition,
    opacity: isDragging ? 0.35 : 1,
    position: "relative" as const,
    zIndex: isDragging ? 0 : 1,
  }

  // Determine indicator style from dropIntent
  const showBeforeLine =
    dropIntent?.type === "reorder" &&
    dropIntent.targetId === id &&
    dropIntent.position === "before"
  const showAfterLine =
    dropIntent?.type === "reorder" &&
    dropIntent.targetId === id &&
    dropIntent.position === "after"
  const showNestHighlight =
    dropIntent?.type === "nest" && dropIntent.targetGroupId === id

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {/* Before insertion indicator */}
      {showBeforeLine && (
        <div
          className="absolute -top-[1px] left-0 right-0 z-30 flex items-center pointer-events-none"
          style={{ marginLeft: `${depth * INDENT_PX + 8}px` }}
        >
          <div className="size-2 rounded-full border-2 border-primary bg-background -ml-1" />
          <div className="flex-1 h-0.5 bg-primary" />
        </div>
      )}

      <div
        role="treeitem"
        tabIndex={0}
        className={cn(
          "flex items-center gap-2 py-1.5 px-2 rounded-md transition-all duration-200 cursor-default select-none",
          "hover:bg-white dark:hover:bg-muted/80",
          showNestHighlight &&
            "bg-primary/10 ring-2 ring-primary/40 scale-[1.01] shadow-sm",
          isDragging && "opacity-35"
        )}
        style={{
          marginLeft: `${depth * INDENT_PX}px`,
        }}
      >
        {/* Drag handle */}
        <div
          className="cursor-grab active:cursor-grabbing flex-shrink-0 p-0.5 rounded hover:bg-muted touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4 text-muted-foreground/50" />
        </div>

        {/* Chevron for groups */}
        {isGroup ? (
          <div
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation()
              onToggle(id)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                e.stopPropagation()
                onToggle(id)
              }
            }}
            className="p-0.5 hover:bg-muted rounded flex-shrink-0 transition-colors cursor-pointer"
          >
            <motion.div
              animate={{ rotate: isExpanded ? 90 : 0 }}
              transition={{ duration: 0.15 }}
            >
              <ChevronRight className="size-4 text-muted-foreground" />
            </motion.div>
          </div>
        ) : (
          <div className="w-5 flex-shrink-0" />
        )}

        {/* Icon */}
        <div className="flex-shrink-0">
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

        {/* Name */}
        <span
          className={cn(
            "text-sm truncate flex-1",
            isGroup && "cursor-pointer font-medium"
          )}
          onClick={(e) => {
            e.stopPropagation()
            if (isGroup) onToggle(id)
          }}
        >
          {data.name}
        </span>

        {/* Badges for layers */}
        {!isGroup && (
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
            {data.defaultVisible && (
              <Eye className="size-3.5 text-green-500" />
            )}
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 font-normal"
            >
              {data.kind}
            </Badge>
          </div>
        )}

        {/* Edit button */}
        <div
          role="button"
          tabIndex={-1}
          className="size-6 ml-1 opacity-0 group-hover/item:opacity-100 hover:!opacity-100 transition-opacity flex-shrink-0 flex items-center justify-center rounded hover:bg-muted cursor-pointer"
          onClick={(e) => {
            e.stopPropagation()
            onEditClick(data)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              e.stopPropagation()
              onEditClick(data)
            }
          }}
        >
          <Pencil className="size-3" />
        </div>
      </div>

      {/* After insertion indicator */}
      {showAfterLine && (
        <div
          className="absolute -bottom-[1px] left-0 right-0 z-30 flex items-center pointer-events-none"
          style={{ marginLeft: `${depth * INDENT_PX + 8}px` }}
        >
          <div className="size-2 rounded-full border-2 border-primary bg-background -ml-1" />
          <div className="flex-1 h-0.5 bg-primary" />
        </div>
      )}
    </div>
  )
}

// ─── Drag Overlay ───────────────────────────────────────────────────────────

function DragOverlayContent({ data }: { data: TreeItemData }) {
  const isGroup = data.type === "group"

  return (
    <div className="flex items-center gap-2 py-1.5 px-3 rounded-md bg-background border shadow-lg shadow-black/10 dark:shadow-black/30 w-fit max-w-xs">
      <GripVertical className="size-4 text-muted-foreground/50" />
      <div className="flex-shrink-0">
        {isGroup ? (
          <Folder className="size-4 text-amber-500" />
        ) : (
          getLayerIcon(data.kind ?? "vector")
        )}
      </div>
      <span className="text-sm font-medium truncate">{data.name}</span>
      {!isGroup && (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 font-normal"
        >
          {data.kind}
        </Badge>
      )}
    </div>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────

export function LayerGroupTree() {
  const queryClient = useQueryClient()
  const [selectedItem, setSelectedItem] = useState<TreeItemData | null>(null)
  const [isLayerSheetOpen, setIsLayerSheetOpen] = useState(false)
  const [isGroupSheetOpen, setIsGroupSheetOpen] = useState(false)
  const [isNewGroupSheetOpen, setIsNewGroupSheetOpen] = useState(false)
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([])
  const [isSaving, setIsSaving] = useState(false)

  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => {
      const s = new Set<string>()
      s.add(ROOT_ID)
      return s
    }
  )
  const [activeId, setActiveId] = useState<string | null>(null)
  const [dropIntent, setDropIntent] = useState<DropIntent>(null)



  const groupsQuery = useQuery({
    queryKey: ["admin", "layer-groups"],
    queryFn: () => fetchJson<any[]>("/api/admin/layer-groups"),
  })

  const layersQuery = useQuery({
    queryKey: ["admin", "layers"],
    queryFn: () => fetchJson<any[]>("/api/admin/layers"),
  })

  const updateLayerMutation = useMutation({
    mutationFn: async (data: {
      id: string
      groupId: string
      order: number
    }) => {
      return fetchJson("/api/admin/layers", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      })
    },
  })

  const updateGroupMutation = useMutation({
    mutationFn: async (data: {
      id: string
      parentId: string | null
      order: number
    }) => {
      return fetchJson("/api/admin/layer-groups", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      })
    },
  })

  const baseTreeItems = useMemo(() => {
    if (!groupsQuery.data || !layersQuery.data) {
      return {
        [ROOT_ID]: {
          id: ROOT_ID,
          name: "Raíz",
          type: "group" as const,
          children: [],
        },
      }
    }
    return buildTreeItems(groupsQuery.data, layersQuery.data)
  }, [groupsQuery.data, layersQuery.data])

  const treeItems = useMemo(() => {
    return applyPendingChanges(baseTreeItems, pendingChanges)
  }, [baseTreeItems, pendingChanges])

  // Flatten tree for dnd-kit
  const flatItems = useMemo(
    () => flattenTree(treeItems, expandedIds),
    [treeItems, expandedIds]
  )
  const flatItemIds = useMemo(() => flatItems.map((fi) => fi.id), [flatItems])
  const flatItemMap = useMemo(() => {
    const m: Record<string, FlatItem> = {}
    for (const fi of flatItems) m[fi.id] = fi
    return m
  }, [flatItems])

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // ─── DnD Sensors ──────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  )

  // ─── DnD handlers ────────────────────────────────────────────────────

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const id = String(event.active.id)
      setActiveId(id)

      // Expand ancestry of dragged item to prevent layout jumps
      const item = treeItems[id]
      if (item?.type === "group") {
        // Keep it expanded so children are visible
        setExpandedIds((prev) => {
          const next = new Set(prev)
          next.add(id)
          return next
        })
      }
    },
    [treeItems]
  )

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event
      if (!over || !active) {
        setDropIntent(null)
        return
      }

      const activeItemId = String(active.id)
      const overItemId = String(over.id)

      if (activeItemId === overItemId) {
        setDropIntent(null)
        return
      }

      const overItem = treeItems[overItemId]
      const activeItem = treeItems[activeItemId]
      if (!overItem || !activeItem) {
        setDropIntent(null)
        return
      }

      // Prevent dropping into own descendants
      if (activeItem.type === "group") {
        const descendants = getDescendantIds(treeItems, activeItemId)
        if (descendants.includes(overItemId)) {
          setDropIntent(null)
          return
        }
      }

      // Use pointer position relative to the over element to determine intent
      const overRect = over.rect
      if (!overRect) {
        setDropIntent(null)
        return
      }

      const pointerY = (event.activatorEvent as PointerEvent)?.clientY
      const deltaY = event.delta?.y ?? 0
      const currentPointerY = pointerY + deltaY

      const rectTop = overRect.top
      const rectHeight = overRect.height
      const relativeY = currentPointerY - rectTop
      const fraction = relativeY / rectHeight

      if (overItem.type === "group") {
        // For groups: top 25% = before, middle 50% = nest into, bottom 25% = after
        if (fraction < 0.25) {
          setDropIntent({
            type: "reorder",
            targetId: overItemId,
            position: "before",
          })
        } else if (fraction > 0.75) {
          setDropIntent({
            type: "reorder",
            targetId: overItemId,
            position: "after",
          })
        } else {
          // Nest into this group
          setDropIntent({ type: "nest", targetGroupId: overItemId })
        }
      } else {
        // For layers: top 50% = before, bottom 50% = after
        if (fraction < 0.5) {
          setDropIntent({
            type: "reorder",
            targetId: overItemId,
            position: "before",
          })
        } else {
          setDropIntent({
            type: "reorder",
            targetId: overItemId,
            position: "after",
          })
        }
      }
    },
    [treeItems]
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active } = event
      const localDropIntent = dropIntent

      setActiveId(null)
      setDropIntent(null)

      if (!localDropIntent || !active) return

      const activeItemId = String(active.id)
      const activeItem = treeItems[activeItemId]
      if (!activeItem) return

      let newParentId: string | null = null
      let newOrder = 0

      if (localDropIntent.type === "nest") {
        // Drop into a group
        const targetGroup = treeItems[localDropIntent.targetGroupId]
        if (!targetGroup) return

        newParentId =
          localDropIntent.targetGroupId === ROOT_ID
            ? null
            : localDropIntent.targetGroupId
        newOrder = targetGroup.children?.length ?? 0

        // Auto-expand the target group
        setExpandedIds((prev) => {
          const next = new Set(prev)
          next.add(localDropIntent.targetGroupId)
          return next
        })
      } else {
        // Reorder: place before or after the target
        const targetId = localDropIntent.targetId
        const targetFlatItem = flatItemMap[targetId]
        if (!targetFlatItem) return

        const targetParentId = targetFlatItem.parentId
        const parentItem = treeItems[targetParentId]
        if (!parentItem?.children) return

        // Filter out the active item from the parent's children to find clean index
        const siblings = parentItem.children.filter(
          (cid) => cid !== activeItemId
        )
        const targetIdx = siblings.indexOf(targetId)
        if (targetIdx === -1) return

        newParentId = targetParentId === ROOT_ID ? null : targetParentId
        newOrder =
          localDropIntent.position === "before" ? targetIdx : targetIdx + 1
      }

      // Layers must belong to a group
      if (activeItem.type === "layer" && newParentId === null) {
        toast.error("Las capas deben pertenecer a un grupo")
        return
      }

      // Check if anything actually changed
      const currentItem = baseTreeItems[activeItemId]
      if (!currentItem) return

      let currentParentId: string | null = null
      if (activeItem.type === "layer") {
        currentParentId = currentItem.groupId ?? null
      } else {
        currentParentId = currentItem.parentId ?? null
      }

      const currentParent = baseTreeItems[currentParentId ?? ROOT_ID]
      const currentOrder =
        currentParent?.children?.indexOf(activeItemId) ?? 0

      const parentChanged = newParentId !== currentParentId
      const orderChanged = newOrder !== currentOrder

      if (!parentChanged && !orderChanged) return

      setPendingChanges((prev) => {
        const filtered = prev.filter((c) => c.itemId !== activeItemId)
        return [
          ...filtered,
          {
            itemId: activeItemId,
            itemType: activeItem.type,
            newParentId,
            newOrder,
          },
        ]
      })
    },
    [dropIntent, treeItems, flatItemMap, baseTreeItems]
  )

  const handleDragCancel = useCallback(() => {
    setActiveId(null)
    setDropIntent(null)
  }, [])

  // ─── Editing ──────────────────────────────────────────────────────────

  const handleEditClick = (itemData: TreeItemData) => {
    if (itemData.id === ROOT_ID) return

    setSelectedItem(itemData)
    if (itemData.type === "layer") {
      setIsLayerSheetOpen(true)
    } else {
      setIsGroupSheetOpen(true)
    }
  }

  const handleNewGroup = () => {
    setSelectedItem(null)
    setIsNewGroupSheetOpen(true)
  }

  const handleDiscardChanges = () => {
    setPendingChanges([])
    toast.info("Cambios descartados")
  }

  const handleSaveChanges = async () => {
    if (pendingChanges.length === 0) return

    setIsSaving(true)
    try {
      for (const change of pendingChanges) {
        if (change.itemType === "layer") {
          await updateLayerMutation.mutateAsync({
            id: change.itemId,
            groupId: change.newParentId!,
            order: change.newOrder,
          })
        } else {
          await updateGroupMutation.mutateAsync({
            id: change.itemId,
            parentId: change.newParentId,
            order: change.newOrder,
          })
        }
      }

      setPendingChanges([])
      queryClient.invalidateQueries({ queryKey: ["admin", "layers"] })
      queryClient.invalidateQueries({ queryKey: ["admin", "layer-groups"] })
      queryClient.invalidateQueries({ queryKey: qk.catalog })
      toast.success(
        `${pendingChanges.length} cambio(s) guardado(s)`
      )
    } catch (err: any) {
      toast.error(err.message || "Error al guardar cambios")
    } finally {
      setIsSaving(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────

  if (groupsQuery.isLoading || layersQuery.isLoading) {
    return <div className="p-4 text-muted-foreground">Cargando...</div>
  }

  const hasItems = Object.keys(treeItems).length > 1
  const hasPendingChanges = pendingChanges.length > 0
  const activeData = activeId ? treeItems[activeId] : null

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold">Gestión de Capas y Grupos</h2>
          <p className="text-sm text-muted-foreground">
            Arrastra para reordenar. Usa el ícono de lápiz para editar.
          </p>
        </div>
        <Button onClick={handleNewGroup} size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Grupo
        </Button>
      </div>

      {/* Tree */}
      <div className="flex-1 border rounded-lg bg-muted/40 overflow-auto min-h-0">
        <div className="p-3">
          {hasItems ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
              measuring={{
                droppable: { strategy: MeasuringStrategy.Always },
              }}
            >
              <SortableContext
                items={flatItemIds}
                strategy={verticalListSortingStrategy}
              >
                <div role="tree" className="flex flex-col gap-0.5">
                  {flatItems.map((flatItem) => (
                    <div key={flatItem.id} className="group/item">
                      <SortableTreeItem
                        flatItem={flatItem}
                        isExpanded={expandedIds.has(flatItem.id)}
                        onToggle={toggleExpand}
                        onEditClick={handleEditClick}
                        dropIntent={dropIntent}
                        isDragging={activeId === flatItem.id}
                      />
                    </div>
                  ))}
                </div>
              </SortableContext>

              <DragOverlay dropAnimation={{
                duration: 200,
                easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)",
              }}>
                {activeData ? (
                  <DragOverlayContent data={activeData} />
                ) : null}
              </DragOverlay>
            </DndContext>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              <p>No hay grupos ni capas.</p>
              <p className="text-sm mt-2">
                Crea un grupo o importa capas desde QGIS para comenzar.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Pending changes footer */}
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
            className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center justify-between overflow-hidden"
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
              <Button
                size="sm"
                onClick={handleSaveChanges}
                disabled={isSaving}
              >
                <Save className="mr-2 size-4" />
                {isSaving ? "Guardando..." : "Guardar cambios"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Info */}
      <p className="mt-3 text-xs text-muted-foreground">
        💡 Para importar nuevas capas, usa la opción de{" "}
        <a href="/admin/qgis" className="text-primary underline">
          Importar desde QGIS
        </a>
      </p>

      {/* Sheets */}
      <LayerSheet
        open={isLayerSheetOpen}
        onOpenChange={setIsLayerSheetOpen}
        layer={selectedItem?.type === "layer" ? selectedItem : null}
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
  )
}
