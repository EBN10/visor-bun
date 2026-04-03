"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { Map as LeafletMap } from "leaflet"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { LayerConfig } from "~/server/db/schema"
import { fetchJson, qk } from "~/lib/api"
import { getLayerBoundsFromConfig, isLayerInZoomRange } from "~/lib/layer-presentation"
import {
  buildVectorLayerUrl,
  type MapViewportSnapshot,
  viewportToQuery,
} from "~/lib/map-layer-utils"

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

type LayerExtentResponse = {
  bounds: {
    south: number
    west: number
    north: number
    east: number
  } | null
}

type LayersContextValue = {
  ready: boolean
  items: Record<string, Item>
  metas: Record<string, LayerNodeMeta>
  visibleLayerIds: Set<string>
  mapViewport: MapViewportSnapshot | null
  setVisibleFromChecked: (checkedIds: string[]) => void
  setLayerVisibility: (id: string, visible: boolean) => void
  clearVisibleLayers: () => void
  updateMapViewport: (viewport: MapViewportSnapshot) => void
  registerMap: (map: LeafletMap | null) => void
  prefetchLayer: (id: string) => void
  zoomToLayer: (id: string) => Promise<void>
}

const LayersContext = createContext<LayersContextValue | null>(null)

function nodesToItemsWithRoot(nodes: LayerNodeMeta[]) {
  const items: Record<string, Item> = {}
  const children: Record<string, string[]> = { [ROOT_ID]: [] }
  const nodesById = new Map(nodes.map((node) => [node.id, node]))

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
      const na = nodesById.get(a)!
      const nb = nodesById.get(b)!
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
  const [mapViewport, setMapViewport] = useState<MapViewportSnapshot | null>(null)
  const queryClient = useQueryClient()
  const mapRef = useRef<LeafletMap | null>(null)

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

  const setLayerVisibility = useCallback((id: string, visible: boolean) => {
    setVisibleLayerIds((previous) => {
      const next = new Set(previous)

      if (visible) {
        next.add(id)
      } else {
        next.delete(id)
      }

      if (next.size === previous.size && [...next].every((itemId) => previous.has(itemId))) {
        return previous
      }

      return next
    })
  }, [])

  const clearVisibleLayers = useCallback(() => {
    setVisibleLayerIds((previous) => (previous.size === 0 ? previous : new Set()))
  }, [])

  const updateMapViewport = useCallback((nextViewport: MapViewportSnapshot) => {
    setMapViewport((currentViewport) => {
      if (
        currentViewport &&
        currentViewport.zoom === nextViewport.zoom &&
        currentViewport.bounds.south === nextViewport.bounds.south &&
        currentViewport.bounds.west === nextViewport.bounds.west &&
        currentViewport.bounds.north === nextViewport.bounds.north &&
        currentViewport.bounds.east === nextViewport.bounds.east
      ) {
        return currentViewport
      }

      return nextViewport
    })
  }, [])

  const registerMap = useCallback((map: LeafletMap | null) => {
    mapRef.current = map
  }, [])

  const prefetchLayer = useCallback(
    (id: string) => {
      const meta = metas[id]

      if (
        !mapViewport ||
        meta?.type !== "layer" ||
        meta.kind !== "vector" ||
        !isLayerInZoomRange(meta.config, mapViewport.zoom)
      ) {
        return
      }

      const { bbox, zoom } = viewportToQuery(mapViewport)

      void queryClient.prefetchQuery({
        queryKey: qk.vectorLayer(id, bbox, zoom),
        queryFn: ({ signal }) =>
          fetchJson(buildVectorLayerUrl(id, bbox, zoom), { signal }),
        staleTime: 60_000,
        gcTime: 10 * 60_000,
      })
    },
    [mapViewport, metas, queryClient],
  )

  const zoomToLayer = useCallback(
    async (id: string) => {
      const map = mapRef.current
      const meta = metas[id]

      if (!map || meta?.type !== "layer") {
        return
      }

      const configBounds = getLayerBoundsFromConfig(meta.config)

      if (configBounds) {
        map.fitBounds(
          [
            [configBounds.south, configBounds.west],
            [configBounds.north, configBounds.east],
          ],
          { padding: [28, 28] },
        )
        return
      }

      if (meta.kind !== "vector") {
        return
      }

      const response = await queryClient.fetchQuery({
        queryKey: qk.layerExtent(id),
        queryFn: () =>
          fetchJson<LayerExtentResponse>(
            `/api/layers/${encodeURIComponent(id)}/extent`,
          ),
        staleTime: 10 * 60_000,
        gcTime: 30 * 60_000,
      })

      if (!response.bounds) {
        return
      }

      map.fitBounds(
        [
          [response.bounds.south, response.bounds.west],
          [response.bounds.north, response.bounds.east],
        ],
        { padding: [28, 28], maxZoom: 14 },
      )
    },
    [metas, queryClient],
  )

  const value = useMemo<LayersContextValue>(
    () => ({
      ready: catalogQuery.isSuccess,
      items,
      metas,
      visibleLayerIds,
      mapViewport,
      setVisibleFromChecked,
      setLayerVisibility,
      clearVisibleLayers,
      updateMapViewport,
      registerMap,
      prefetchLayer,
      zoomToLayer,
    }),
    [
      catalogQuery.isSuccess,
      clearVisibleLayers,
      items,
      mapViewport,
      metas,
      prefetchLayer,
      registerMap,
      setLayerVisibility,
      setVisibleFromChecked,
      updateMapViewport,
      visibleLayerIds,
      zoomToLayer,
    ],
  )

  return <LayersContext.Provider value={value}>{props.children}</LayersContext.Provider>
}

export function useLayers() {
  const ctx = useContext(LayersContext)
  if (!ctx) throw new Error("useLayers must be used within LayersProvider")
  return ctx
}
