"use client"

import * as React from "react"
import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  syncDataLoaderFeature,
  selectionFeature,
  hotkeysCoreFeature,
  dragAndDropFeature,
  isOrderedDragTarget,
} from "@headless-tree/core"
import { useTree } from "@headless-tree/react"
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
  ChevronDown,
  Pencil,
  AlertCircle,
  Undo2,
  Save,
} from "lucide-react"
import { cn } from "~/lib/utils"
import { Tree, TreeItem, TreeDragLine } from "~/components/tree"
import { Button } from "~/components/ui/button"
import { Badge } from "~/components/ui/badge"
import { toast } from "sonner"
import { LayerSheet } from "./layer-sheet"
import { GroupSheet } from "./group-sheet"
import { motion, AnimatePresence } from "framer-motion"

const ROOT_ID = "__root__"
const indent = 20

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

interface PendingChange {
  itemId: string
  itemType: TreeItemType
  newParentId: string | null
  newOrder: number
}

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
  
  const items = JSON.parse(JSON.stringify(baseItems)) as Record<string, TreeItemData>
  
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
      currentParent.children = currentParent.children.filter(id => id !== change.itemId)
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
      newParent.children.splice(change.newOrder, 0, change.itemId)
    }
  }
  
  return items
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

const itemVariants = {
  initial: { opacity: 0, y: -10 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.2 }
  },
  exit: { 
    opacity: 0, 
    y: 10,
    transition: { duration: 0.15 }
  },
}

function LayerGroupTreeView({
  treeItems,
  onDrop,
  onEditClick,
  expandedItemsRef,
}: {
  treeItems: Record<string, TreeItemData>
  onDrop: (items: any[], target: any) => void
  onEditClick: (item: TreeItemData) => void
  expandedItemsRef: React.MutableRefObject<string[]>
}) {
  const tree = useTree<TreeItemData>({
    initialState: {
      expandedItems: expandedItemsRef.current,
    },
    indent,
    rootItemId: ROOT_ID,
    getItemName: (item) => item.getItemData()?.name ?? "",
    isItemFolder: (item) => {
      const data = item.getItemData()
      return data?.type === "group"
    },
    canReorder: true,
    onDrop: (items, target) => {
      expandedItemsRef.current = tree.getState().expandedItems ?? [ROOT_ID]
      onDrop(items, target)
    },
    dataLoader: {
      getItem: (itemId: string) => treeItems[itemId] ?? { id: itemId, name: "", type: "group" as const, children: [] },
      getChildren: (itemId: string) => treeItems[itemId]?.children ?? [],
    },
    features: [
      syncDataLoaderFeature,
      selectionFeature,
      hotkeysCoreFeature,
      dragAndDropFeature,
    ],
  })

  useEffect(() => {
    const state = tree.getState()
    if (state.expandedItems) {
      expandedItemsRef.current = state.expandedItems
    }
  })

  useEffect(() => {
    try {
      tree.getItemInstance(ROOT_ID)?.expand()
    } catch {}
  }, [])

  const items = tree.getItems()

  return (
    <Tree indent={indent} tree={tree} className="relative">
      <AnimatePresence mode="popLayout">
        {items.map((item) => {
          const itemData = item.getItemData()
          if (!itemData || itemData.id === ROOT_ID) return null

          const isGroup = itemData.type === "group"
          const isExpanded = item.isExpanded()
          const level = item.getItemMeta().level

          return (
            <motion.div
              key={item.getId()}
              layout
              variants={itemVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{
                layout: { type: "spring", stiffness: 500, damping: 35 }
              }}
            >
              <TreeItem
                item={item}
                className="group/item"
                asChild
              >
                <div
                  role="treeitem"
                  tabIndex={0}
                  className={cn(
                    "flex items-center gap-2 py-1.5 px-2 rounded-md transition-colors cursor-default",
                    "hover:bg-white dark:hover:bg-muted/80",
                    item.isSelected() && "bg-white dark:bg-muted shadow-sm",
                    item.isDragTarget() && "bg-primary/10 ring-2 ring-primary/40 scale-[1.02]"
                  )}
                  style={{
                    marginLeft: `${level * indent}px`,
                  }}
                >
                  {/* Drag handle */}
                  <div 
                    className="cursor-grab active:cursor-grabbing flex-shrink-0 p-0.5 rounded hover:bg-muted"
                  >
                    <GripVertical className="size-4 text-muted-foreground/50" />
                  </div>

                  {/* Chevron for groups - using div instead of button */}
                  {isGroup ? (
                    <div
                      role="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation()
                        isExpanded ? item.collapse() : item.expand()
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          e.stopPropagation()
                          isExpanded ? item.collapse() : item.expand()
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
                      getLayerIcon(itemData.kind ?? "vector")
                    )}
                  </div>

                  {/* Name */}
                  <span 
                    className={cn(
                      "text-sm truncate",
                      isGroup && "cursor-pointer font-medium"
                    )}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (isGroup) {
                        isExpanded ? item.collapse() : item.expand()
                      }
                    }}
                  >
                    {itemData.name}
                  </span>

                  {/* Badges for layers */}
                  {!isGroup && (
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                      {itemData.defaultVisible && (
                        <Eye className="size-3.5 text-green-500" />
                      )}
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                        {itemData.kind}
                      </Badge>
                    </div>
                  )}

                  {/* Edit button - using div instead of Button */}
                  <div
                    role="button"
                    tabIndex={-1}
                    className="size-6 ml-1 opacity-0 group-hover/item:opacity-100 transition-opacity flex-shrink-0 flex items-center justify-center rounded hover:bg-muted cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation()
                      onEditClick(itemData)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        e.stopPropagation()
                        onEditClick(itemData)
                      }
                    }}
                  >
                    <Pencil className="size-3" />
                  </div>
                </div>
              </TreeItem>
            </motion.div>
          )
        })}
      </AnimatePresence>
      <TreeDragLine />
    </Tree>
  )
}

export function LayerGroupTree() {
  const queryClient = useQueryClient()
  const [selectedItem, setSelectedItem] = useState<TreeItemData | null>(null)
  const [isLayerSheetOpen, setIsLayerSheetOpen] = useState(false)
  const [isGroupSheetOpen, setIsGroupSheetOpen] = useState(false)
  const [isNewGroupSheetOpen, setIsNewGroupSheetOpen] = useState(false)
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([])
  const [isSaving, setIsSaving] = useState(false)
  
  const expandedItemsRef = useRef<string[]>([ROOT_ID])

  const groupsQuery = useQuery({
    queryKey: ["admin", "layer-groups"],
    queryFn: () => fetchJson<any[]>("/api/admin/layer-groups"),
  })

  const layersQuery = useQuery({
    queryKey: ["admin", "layers"],
    queryFn: () => fetchJson<any[]>("/api/admin/layers"),
  })

  const updateLayerMutation = useMutation({
    mutationFn: async (data: { id: string; groupId: string; order: number }) => {
      return fetchJson("/api/admin/layers", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      })
    },
  })

  const updateGroupMutation = useMutation({
    mutationFn: async (data: { id: string; parentId: string | null; order: number }) => {
      return fetchJson("/api/admin/layer-groups", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      })
    },
  })

  const baseTreeItems = useMemo(() => {
    if (!groupsQuery.data || !layersQuery.data) {
      return { [ROOT_ID]: { id: ROOT_ID, name: "Raíz", type: "group" as const, children: [] } }
    }
    return buildTreeItems(groupsQuery.data, layersQuery.data)
  }, [groupsQuery.data, layersQuery.data])

  const treeItems = useMemo(() => {
    return applyPendingChanges(baseTreeItems, pendingChanges)
  }, [baseTreeItems, pendingChanges])

  const dataVersion = useMemo(
    () => JSON.stringify([Object.keys(treeItems).sort(), pendingChanges.length]),
    [treeItems, pendingChanges]
  )

  const handleDrop = useCallback((items: any[], target: any) => {
    const item = items[0]
    if (!item) return

    const itemData = item.getItemData()
    if (!itemData) return

    const targetItem = target.item
    const targetData = targetItem?.getItemData()

    let newParentId: string | null = null
    let newOrder = 0

    if (isOrderedDragTarget(target)) {
      newParentId = targetData?.id === ROOT_ID ? null : targetData?.id ?? null
      newOrder = target.childIndex
    } else if (targetData?.type === "group") {
      newParentId = targetData.id === ROOT_ID ? null : targetData.id
      newOrder = (targetData.children?.length ?? 0)
    }

    if (itemData.type === "layer" && newParentId === null) {
      toast.error("Las capas deben pertenecer a un grupo")
      return
    }

    // Get current position from base items (not pending changes)
    const currentItem = baseTreeItems[itemData.id]
    if (!currentItem) return

    // Determine current parent
    let currentParentId: string | null = null
    if (itemData.type === "layer") {
      currentParentId = currentItem.groupId ?? null
    } else {
      currentParentId = currentItem.parentId ?? null
    }

    // Find current order (index in parent's children)
    const currentParent = baseTreeItems[currentParentId ?? ROOT_ID]
    const currentOrder = currentParent?.children?.indexOf(itemData.id) ?? 0

    // Check if position actually changed
    const parentChanged = newParentId !== currentParentId
    const orderChanged = newOrder !== currentOrder

    // If nothing changed, don't add pending change
    if (!parentChanged && !orderChanged) {
      return
    }

    setPendingChanges(prev => {
      const filtered = prev.filter(c => c.itemId !== itemData.id)
      return [...filtered, {
        itemId: itemData.id,
        itemType: itemData.type,
        newParentId,
        newOrder,
      }]
    })
  }, [baseTreeItems])

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
      toast.success(`${pendingChanges.length} cambio(s) guardado(s)`)
    } catch (err: any) {
      toast.error(err.message || "Error al guardar cambios")
    } finally {
      setIsSaving(false)
    }
  }

  if (groupsQuery.isLoading || layersQuery.isLoading) {
    return <div className="p-4 text-muted-foreground">Cargando...</div>
  }

  const hasItems = Object.keys(treeItems).length > 1
  const hasPendingChanges = pendingChanges.length > 0

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
            <LayerGroupTreeView
              key={dataVersion}
              treeItems={treeItems}
              onDrop={handleDrop}
              onEditClick={handleEditClick}
              expandedItemsRef={expandedItemsRef}
            />
          ) : (
            <div className="text-center text-muted-foreground py-8">
              <p>No hay grupos ni capas.</p>
              <p className="text-sm mt-2">Crea un grupo o importa capas desde QGIS para comenzar.</p>
            </div>
          )}
        </div>
      </div>

      {/* Pending changes footer with slide-up animation */}
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
              opacity: { duration: 0.2 }
            }}
            className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center justify-between overflow-hidden"
          >
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertCircle className="size-4" />
              <span className="text-sm font-medium">
                {pendingChanges.length} cambio{pendingChanges.length > 1 ? 's' : ''} sin guardar
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
