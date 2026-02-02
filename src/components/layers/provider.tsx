"use client"

import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import type { LayerConfig } from "~/server/db/schema"
import { fetchJson, qk } from "~/lib/api"

// Synthetic root id for tree
export const ROOT_ID = "root"

type Item = { name: string; children?: string[] }

export type LayerNodeMeta = {
  id: string
  type: "group" | "layer"
  name: string
  parentId: string | null
  kind?: "vector" | "xyz" | "wms"
  config?: LayerConfig
  defaultVisible?: boolean
  order: number
}

type CatalogResponse = {
  nodes: LayerNodeMeta[]
}

type LayersContextValue = {
  ready: boolean
  items: Record<string, Item>
  metas: Record<string, LayerNodeMeta>
  visibleLayerIds: Set<string>
  setVisibleFromChecked: (checkedIds: string[]) => void
}

const LayersContext = createContext<LayersContextValue | null>(null)

function nodesToItemsWithRoot(nodes: LayerNodeMeta[]) {
  const items: Record<string, Item> = {}
  const children: Record<string, string[]> = { [ROOT_ID]: [] }

  // ensure all groups/items exist
  nodes.forEach((n) => {
    items[n.id] ??= { name: n.name, children: [] }
  })

  // collect root-level nodes under synthetic ROOT_ID
  nodes.forEach((n) => {
    if (!n.parentId) {
      children[ROOT_ID]!.push(n.id)
    } else {
      children[n.parentId] ??= []
      children[n.parentId]!.push(n.id)
    }
  })

  // sort children by order then name
  Object.keys(children).forEach((pid) => {
    children[pid]!.sort((a, b) => {
      const na = nodes.find((n) => n.id === a)!
      const nb = nodes.find((n) => n.id === b)!
      if ((na.order ?? 0) !== (nb.order ?? 0)) {
        return (na.order ?? 0) - (nb.order ?? 0)
      }
      return na.name.localeCompare(nb.name)
    })
  })

  nodes.forEach((n) => {
    items[n.id]!.children = children[n.id] ?? []
  })

  // add synthetic root
  items[ROOT_ID] = { name: "Capas", children: children[ROOT_ID] ?? [] }

  return items
}

export function LayersProvider(props: { children: React.ReactNode }) {
  const [visibleLayerIds, setVisibleLayerIds] = useState<Set<string>>(new Set())

  const catalogQuery = useQuery({
    queryKey: qk.catalog,
    queryFn: () => fetchJson<CatalogResponse>("/api/catalog"),
  })

  const metas = useMemo(() => {
    const byId: Record<string, LayerNodeMeta> = {}
    if (catalogQuery.data?.nodes) {
      for (const n of catalogQuery.data.nodes) byId[n.id] = n
    }
    return byId
  }, [catalogQuery.data])

  const items = useMemo(() => {
    if (!catalogQuery.data?.nodes) {
      return {}
    }
    const built = nodesToItemsWithRoot(catalogQuery.data.nodes)
    return built
  }, [catalogQuery.data])

  // Ref to track if we've already initialized defaults (only once)
  const initializedRef = useRef(false)

  // initialize visible defaults when data arrives the first time
  useEffect(() => {
    if (!catalogQuery.data?.nodes) return
    // only initialize ONCE, not every time the set becomes empty
    if (initializedRef.current) return
    initializedRef.current = true
    
    const vis = new Set<string>()
    for (const n of catalogQuery.data.nodes) {
      if (n.type === "layer" && n.defaultVisible) vis.add(n.id)
    }
    setVisibleLayerIds(vis)
  }, [catalogQuery.data])

  const setVisibleFromChecked = useCallback(
    (checkedIds: string[]) => {
      const onlyLayers = checkedIds.filter((id) => metas[id]?.type === "layer")
      const next = new Set(onlyLayers)
      
      setVisibleLayerIds((prev) => {
        if (prev.size === next.size && [...prev].every((x) => next.has(x))) {
          return prev
        }
        return next
      })
    },
    [metas],
  )

  const value = useMemo<LayersContextValue>(
    () => ({
      ready: catalogQuery.isSuccess,
      items,
      metas,
      visibleLayerIds,
      setVisibleFromChecked,
    }),
    [catalogQuery.isSuccess, items, metas, visibleLayerIds, setVisibleFromChecked],
  )

  return <LayersContext.Provider value={value}>{props.children}</LayersContext.Provider>
}

export function useLayers() {
  const ctx = useContext(LayersContext)
  if (!ctx) throw new Error("useLayers must be used within LayersProvider")
  return ctx
}