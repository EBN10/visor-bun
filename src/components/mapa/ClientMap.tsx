"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useQuery } from "@tanstack/react-query";
import type { Feature, FeatureCollection, GeoJsonObject } from "geojson";
import L from "leaflet";
import type { LatLng, PathOptions } from "leaflet";
import {
  MapContainer,
  TileLayer,
  useMap,
  useMapEvents,
  WMSTileLayer,
} from "react-leaflet";
import {
  AlertCircle,
  LoaderCircle,
  Minus,
  Navigation,
  Plus,
  RotateCcw,
} from "lucide-react";
import { useLayers } from "~/components/layers/provider";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { fetchJson, fetchJsonWithProgress, qk } from "~/lib/api";
import {
  buildPopupHtml,
  getResolvedVectorStyle,
  isLayerInZoomRange,
} from "~/lib/layer-presentation";
import {
  boundsContainBounds,
  buildVectorLayerUrl,
  type MapBoundsSnapshot,
  type MapViewportSnapshot,
  viewportToQuery,
} from "~/lib/map-layer-utils";
import type { LayerNodeMeta } from "~/components/layers/provider";
import type {
  LayerMetadata,
  VectorConfig,
  WfsConfig,
  WmsConfig,
  XyzConfig,
} from "~/server/db/schema";

const MAP_CENTER: [number, number] = [-27.909423151558293, -62.85220337225053];
const MAP_ZOOM = 7;
const VECTOR_LAYER_STALE_TIME = 2 * 60_000;
const VECTOR_LAYER_GC_TIME = 10 * 60_000;

const LAYER_METADATA_FIELDS: Array<{
  key: keyof LayerMetadata;
  label: string;
}> = [
  { key: "owner", label: "Autor/Propietario" },
  { key: "createdDate", label: "Fecha de creación" },
  { key: "updateFrequency", label: "Frecuencia de actualización" },
  { key: "variableEncoding", label: "Codificación de variables" },
  { key: "recordDescription", label: "Descripción general de los registros" },
];

type BasemapConfig = {
  id: string;
  name: string;
  url: string;
  attribution: string;
  minZoom?: number;
  maxZoom?: number;
};

type WfsLoadState = {
  layerName: string;
  status: "loading" | "error";
  progress: number | null;
  loadedBytes: number;
  totalBytes: number | null;
  errorMessage?: string;
};

const DEFAULT_BASEMAP: BasemapConfig = {
  id: "argenmap",
  name: "Mapa oficial",
  url: "https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/capabaseargenmap@EPSG%3A3857@png/{z}/{x}/{-y}.png",
  attribution:
    '<a href="https://www.ign.gob.ar/AreaServicios/Argenmap/IntroduccionV2" target="_blank" rel="noreferrer">Instituto Geográfico Nacional</a> + <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
  minZoom: 3,
  maxZoom: 18,
};

const BASEMAPS: readonly [BasemapConfig, ...BasemapConfig[]] = [
  DEFAULT_BASEMAP,
  {
    id: "esri-imagery",
    name: "Satélite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
  },
];

function toLeafletSnapshot(bounds: L.LatLngBounds): MapBoundsSnapshot {
  const southWest = bounds.getSouthWest();
  const northEast = bounds.getNorthEast();

  return {
    south: southWest.lat,
    west: southWest.lng,
    north: northEast.lat,
    east: northEast.lng,
  };
}

function toPathOptions(
  style: ReturnType<typeof getResolvedVectorStyle>,
): PathOptions {
  return {
    color: style.color,
    fillColor: style.fillColor,
    weight: style.weight,
    opacity: style.opacity,
    fillOpacity: style.fillOpacity,
    dashArray: style.dashArray,
  };
}

function applyResolvedStyle(
  layer: L.Layer,
  style: ReturnType<typeof getResolvedVectorStyle>,
) {
  if (layer instanceof L.Path) {
    layer.setStyle(toPathOptions(style));
  }

  if (layer instanceof L.CircleMarker) {
    layer.setRadius(style.radius);
  }
}

function hasBringToFront(
  layer: L.Layer,
): layer is L.Layer & { bringToFront: () => void } {
  return (
    "bringToFront" in layer &&
    typeof (layer as { bringToFront?: unknown }).bringToFront === "function"
  );
}

function getMetadataValue(
  metadata: LayerMetadata | undefined,
  key: keyof LayerMetadata,
) {
  const value = metadata?.[key];

  if (value === undefined || value === null) {
    return "Sin especificar";
  }

  const text = String(value).trim();

  return text.length > 0 ? text : "Sin especificar";
}

function buildMetadataRows(layer: LayerNodeMeta | null | undefined) {
  const metadata = layer?.type === "layer" ? layer.config?.metadata : undefined;

  return LAYER_METADATA_FIELDS.map((field) => ({
    ...field,
    value: getMetadataValue(metadata, field.key),
  }));
}

function formatTransferSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getWfsProgressLabel(state: WfsLoadState) {
  if (state.status === "error") {
    return "Error";
  }

  if (state.progress !== null) {
    return `${Math.round(state.progress * 100)}%`;
  }

  if (state.loadedBytes > 0) {
    return formatTransferSize(state.loadedBytes);
  }

  return "Cargando...";
}

function isAbortError(error: unknown) {
  return (
    error instanceof DOMException
      ? error.name === "AbortError"
      : error instanceof Error && error.name === "AbortError"
  );
}

function ScaleControl() {
  const map = useMap();

  useEffect(() => {
    const control = L.control.scale({
      imperial: false,
      position: "bottomleft",
    });

    control.addTo(map);

    return () => {
      control.remove();
    };
  }, [map]);

  return null;
}

function ViewportSync() {
  const map = useMap();
  const { updateMapViewport } = useLayers();
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const syncViewport = () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }

      frameRef.current = requestAnimationFrame(() => {
        updateMapViewport({
          bounds: toLeafletSnapshot(map.getBounds()),
          zoom: map.getZoom(),
        });
      });
    };

    syncViewport();

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [map, updateMapViewport]);

  useMapEvents({
    load: () => {
      updateMapViewport({
        bounds: toLeafletSnapshot(map.getBounds()),
        zoom: map.getZoom(),
      });
    },
    moveend: () => {
      updateMapViewport({
        bounds: toLeafletSnapshot(map.getBounds()),
        zoom: map.getZoom(),
      });
    },
    zoomend: () => {
      updateMapViewport({
        bounds: toLeafletSnapshot(map.getBounds()),
        zoom: map.getZoom(),
      });
    },
  });

  return null;
}

function MapTelemetry({
  onReady,
  onCursorChange,
  onZoomChange,
}: {
  onReady: (map: L.Map | null) => void;
  onCursorChange: (latlng: LatLng | null) => void;
  onZoomChange: (zoom: number) => void;
}) {
  const draggingRef = useRef(false);
  const cursorFrameRef = useRef<number | null>(null);
  const pendingCursorRef = useRef<LatLng | null>(null);

  const flushCursorPosition = useCallback(() => {
    cursorFrameRef.current = null;
    onCursorChange(pendingCursorRef.current);
  }, [onCursorChange]);

  const map = useMapEvents({
    mousemove: (event) => {
      if (draggingRef.current) {
        return;
      }

      pendingCursorRef.current = event.latlng;

      if (cursorFrameRef.current !== null) {
        return;
      }

      cursorFrameRef.current = requestAnimationFrame(flushCursorPosition);
    },
    mouseout: () => {
      if (cursorFrameRef.current !== null) {
        cancelAnimationFrame(cursorFrameRef.current);
        cursorFrameRef.current = null;
      }

      pendingCursorRef.current = null;
      onCursorChange(null);
    },
    dragstart: () => {
      draggingRef.current = true;
      pendingCursorRef.current = null;

      if (cursorFrameRef.current !== null) {
        cancelAnimationFrame(cursorFrameRef.current);
        cursorFrameRef.current = null;
      }

      onCursorChange(null);
    },
    dragend: () => {
      draggingRef.current = false;
    },
    zoomend: () => {
      onZoomChange(map.getZoom());
    },
  });

  useEffect(() => {
    onReady(map);
    onZoomChange(map.getZoom());
    map.invalidateSize();

    return () => {
      if (cursorFrameRef.current !== null) {
        cancelAnimationFrame(cursorFrameRef.current);
      }

      onReady(null);
    };
  }, [map, onReady, onZoomChange]);

  return null;
}

function FeatureLayer({
  layerMeta,
  viewport,
  onWfsLoadStateChange,
}: {
  layerMeta: LayerNodeMeta;
  viewport: MapViewportSnapshot;
  onWfsLoadStateChange?: (layerId: string, state: WfsLoadState | null) => void;
}) {
  const map = useMap();
  const config = layerMeta.config as VectorConfig | WfsConfig;
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const selectedLayerRef = useRef<L.Layer | null>(null);
  const selectedFeatureRef = useRef<Feature | null>(null);
  const configRef = useRef(config);
  const layerNameRef = useRef(layerMeta.name);
  const viewportZoomRef = useRef(viewport.zoom);
  const requestSequenceRef = useRef(0);
  const activeRequestIdRef = useRef(0);
  const renderedRequestIdRef = useRef(0);
  const lastRequestOutcomeRef = useRef<"success" | "error" | null>(null);
  const [requestViewport, setRequestViewport] =
    useState<MapViewportSnapshot>(viewport);
  const queryViewport = useMemo(
    () => viewportToQuery(requestViewport),
    [requestViewport],
  );

  useEffect(() => {
    configRef.current = config;
    layerNameRef.current = layerMeta.name;
    viewportZoomRef.current = viewport.zoom;
  }, [config, layerMeta.name, viewport.zoom]);

  useEffect(() => {
    const coveredBounds = viewportToQuery(requestViewport).bounds;
    const nextZoom = viewportToQuery(viewport).zoom;
    const currentZoom = queryViewport.zoom;

    if (
      currentZoom !== nextZoom ||
      !boundsContainBounds(coveredBounds, viewport.bounds)
    ) {
      setRequestViewport(viewport);
    }
  }, [queryViewport.zoom, requestViewport, viewport]);

  const { data } = useQuery({
    queryKey: qk.vectorLayer(
      layerMeta.id,
      queryViewport.bbox,
      queryViewport.zoom,
    ),
    queryFn: ({ signal }) => {
      const layerUrl = buildVectorLayerUrl(
        layerMeta.id,
        queryViewport.bbox,
        queryViewport.zoom,
      );

      if (layerMeta.kind !== "wfs") {
        return fetchJson<FeatureCollection>(layerUrl, { signal });
      }

      const requestId = ++requestSequenceRef.current;
      activeRequestIdRef.current = requestId;
      lastRequestOutcomeRef.current = null;

      onWfsLoadStateChange?.(layerMeta.id, {
        layerName: layerMeta.name,
        status: "loading",
        progress: null,
        loadedBytes: 0,
        totalBytes: null,
      });

      return fetchJsonWithProgress<FeatureCollection>(
        layerUrl,
        (progress) => {
          if (activeRequestIdRef.current !== requestId) {
            return;
          }

          onWfsLoadStateChange?.(layerMeta.id, {
            layerName: layerMeta.name,
            status: "loading",
            progress: progress.progress,
            loadedBytes: progress.loadedBytes,
            totalBytes: progress.totalBytes,
          });
        },
        { signal },
      )
        .then((result) => {
          if (activeRequestIdRef.current === requestId) {
            lastRequestOutcomeRef.current = "success";
          }

          return result;
        })
        .catch((error: unknown) => {
          if (signal.aborted || isAbortError(error)) {
            throw error;
          }

          if (activeRequestIdRef.current === requestId) {
            lastRequestOutcomeRef.current = "error";
            onWfsLoadStateChange?.(layerMeta.id, {
              layerName: layerMeta.name,
              status: "error",
              progress: null,
              loadedBytes: 0,
              totalBytes: null,
              errorMessage:
                error instanceof Error
                  ? error.message
                  : "No se pudo cargar la capa WFS",
            });
          }

          return {
            type: "FeatureCollection",
            features: [],
          } satisfies FeatureCollection;
        });
    },
    staleTime: VECTOR_LAYER_STALE_TIME,
    gcTime: VECTOR_LAYER_GC_TIME,
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    return () => {
      if (layerMeta.kind === "wfs") {
        onWfsLoadStateChange?.(layerMeta.id, null);
      }
    };
  }, [layerMeta.id, layerMeta.kind, onWfsLoadStateChange]);

  const getFeatureStyle = useCallback(
    (
      feature: Feature | undefined,
      state: Parameters<typeof getResolvedVectorStyle>[0]["state"] = "default",
    ) =>
      getResolvedVectorStyle({
        layerId: layerMeta.id,
        config: configRef.current,
        feature,
        zoom: viewportZoomRef.current,
        state,
      }),
    [layerMeta.id],
  );

  const geoJsonOptions = useMemo<L.GeoJSONOptions>(() => {
    return {
      style: (feature) =>
        toPathOptions(getFeatureStyle(feature as Feature | undefined)),
      pointToLayer: (feature, latlng) => {
        const style = getFeatureStyle(feature as Feature);

        return L.circleMarker(latlng, {
          ...toPathOptions(style),
          radius: style.radius,
        });
      },
      onEachFeature: (feature, layer) => {
        const popupHtml = buildPopupHtml(
          layerNameRef.current,
          (feature.properties ?? {}) as Record<string, unknown>,
          configRef.current,
          { layerId: layerMeta.id },
        );

        if (popupHtml) {
          layer.bindPopup(popupHtml, {
            maxWidth: 448,
            className: "map-popup-shell",
          });
        }

        const applyState = (
          state: Parameters<typeof getResolvedVectorStyle>[0]["state"],
        ) => {
          applyResolvedStyle(layer, getFeatureStyle(feature as Feature, state));
        };

        applyState("default");

        layer.on({
          mouseover: () => {
            if (selectedLayerRef.current !== layer) {
              applyState("hover");
            }

            if (hasBringToFront(layer)) {
              layer.bringToFront();
            }
          },
          mouseout: () => {
            if (selectedLayerRef.current !== layer) {
              applyState("default");
            }
          },
          click: () => {
            if (
              selectedLayerRef.current &&
              selectedLayerRef.current !== layer &&
              selectedFeatureRef.current
            ) {
              applyResolvedStyle(
                selectedLayerRef.current,
                getFeatureStyle(selectedFeatureRef.current),
              );
            }

            selectedLayerRef.current = layer;
            selectedFeatureRef.current = feature as Feature;
            applyState("selected");
          },
          popupclose: () => {
            if (selectedLayerRef.current === layer) {
              selectedLayerRef.current = null;
              selectedFeatureRef.current = null;
              applyState("default");
            }
          },
        });
      },
    };
  }, [getFeatureStyle, layerMeta.id]);

  useEffect(() => {
    const geoJsonLayer = L.geoJSON(undefined, geoJsonOptions).addTo(map);
    geoJsonLayerRef.current = geoJsonLayer;

    return () => {
      geoJsonLayer.remove();
      geoJsonLayerRef.current = null;
      selectedLayerRef.current = null;
      selectedFeatureRef.current = null;
    };
  }, [geoJsonOptions, map]);

  useEffect(() => {
    const geoJsonLayer = geoJsonLayerRef.current;

    if (!geoJsonLayer || !data) {
      return;
    }

    selectedLayerRef.current = null;
    selectedFeatureRef.current = null;
    geoJsonLayer.clearLayers();
    geoJsonLayer.addData(data as GeoJsonObject);

    if (
      layerMeta.kind === "wfs" &&
      onWfsLoadStateChange &&
      lastRequestOutcomeRef.current === "success" &&
      renderedRequestIdRef.current !== activeRequestIdRef.current
    ) {
      renderedRequestIdRef.current = activeRequestIdRef.current;
      onWfsLoadStateChange(layerMeta.id, null);
    }
  }, [data, layerMeta.id, layerMeta.kind, onWfsLoadStateChange]);

  useEffect(() => {
    const geoJsonLayer = geoJsonLayerRef.current;

    if (!geoJsonLayer) {
      return;
    }

    geoJsonLayer.eachLayer((layer) => {
      const feature = (layer as L.Layer & { feature?: Feature }).feature;
      const state = selectedLayerRef.current === layer ? "selected" : "default";

      applyResolvedStyle(layer, getFeatureStyle(feature, state));
    });
  }, [config, getFeatureStyle, viewport.zoom]);

  return null;
}

const WmsLayer = memo(function WmsLayer({
  order,
  ...config
}: WmsConfig & { order: number }) {
  const params = useMemo(
    () => ({
      layers: config.layers,
      format: config.format ?? "image/png",
      transparent: config.transparent ?? true,
      version: config.version ?? "1.3.0",
    }),
    [config.format, config.layers, config.transparent, config.version],
  );

  return (
    <WMSTileLayer
      url={config.url}
      opacity={config.opacity ?? 1}
      minZoom={config.minZoom}
      maxZoom={config.maxZoom}
      zIndex={200 + order}
      tileSize={512}
      updateWhenIdle
      updateWhenZooming={false}
      keepBuffer={1}
      params={params}
    />
  );
});

const XyzLayer = memo(function XyzLayer({
  order,
  ...config
}: XyzConfig & { order: number }) {
  return (
    <TileLayer
      url={config.url}
      attribution={config.attribution}
      opacity={config.opacity ?? 1}
      minZoom={config.minZoom}
      maxZoom={config.maxZoom}
      zIndex={200 + order}
    />
  );
});

const LayerRenderer = memo(function LayerRenderer({
  onWfsLoadStateChange,
}: {
  onWfsLoadStateChange?: (layerId: string, state: WfsLoadState | null) => void;
}) {
  const { mapViewport, metas, visibleLayerIds } = useLayers();

  const visibleLayers = useMemo(
    () =>
      Array.from(visibleLayerIds)
        .map((id) => metas[id])
        .filter((meta): meta is NonNullable<typeof meta> => Boolean(meta))
        .sort((a, b) => a.order - b.order),
    [metas, visibleLayerIds],
  );

  return (
    <>
      {visibleLayers.map((layerMeta) => {
        if (layerMeta.type !== "layer") {
          return null;
        }

        if (!mapViewport) {
          return null;
        }

        if (!isLayerInZoomRange(layerMeta.config, mapViewport.zoom)) {
          return null;
        }

        if (layerMeta.kind === "vector" || layerMeta.kind === "wfs") {
          return (
            <FeatureLayer
              key={layerMeta.id}
              layerMeta={layerMeta}
              viewport={mapViewport}
              onWfsLoadStateChange={
                layerMeta.kind === "wfs" ? onWfsLoadStateChange : undefined
              }
            />
          );
        }

        if (layerMeta.kind === "wms") {
          return (
            <WmsLayer
              key={layerMeta.id}
              order={layerMeta.order}
              {...(layerMeta.config as WmsConfig)}
            />
          );
        }

        if (layerMeta.kind === "xyz") {
          return (
            <XyzLayer
              key={layerMeta.id}
              order={layerMeta.order}
              {...(layerMeta.config as XyzConfig)}
            />
          );
        }

        return null;
      })}
    </>
  );
});

const MapScene = memo(function MapScene({
  baseMap,
  onReady,
  onCursorChange,
  onZoomChange,
  onWfsLoadStateChange,
}: {
  baseMap: (typeof BASEMAPS)[number];
  onReady: (map: L.Map | null) => void;
  onCursorChange: (latlng: LatLng | null) => void;
  onZoomChange: (zoom: number) => void;
  onWfsLoadStateChange?: (layerId: string, state: WfsLoadState | null) => void;
}) {
  return (
    <MapContainer
      center={MAP_CENTER}
      zoom={MAP_ZOOM}
      className="h-full w-full"
      preferCanvas
      zoomControl={false}
    >
      <TileLayer
        attribution={baseMap.attribution}
        url={baseMap.url}
        minZoom={baseMap.minZoom}
        maxZoom={baseMap.maxZoom}
      />
      <ViewportSync />
      <MapTelemetry
        onReady={onReady}
        onCursorChange={onCursorChange}
        onZoomChange={onZoomChange}
      />
      <ScaleControl />
      <LayerRenderer onWfsLoadStateChange={onWfsLoadStateChange} />
    </MapContainer>
  );
});

export default function ClientMap() {
  const { mapViewport, metas, registerMap, visibleLayerIds } = useLayers();
  const [baseMapId] =
    useState<(typeof BASEMAPS)[number]["id"]>("argenmap");
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const [cursorPosition, setCursorPosition] = useState<LatLng | null>(null);
  const [currentZoom, setCurrentZoom] = useState(MAP_ZOOM);
  const [metadataLayerId, setMetadataLayerId] = useState<string | null>(null);
  const [wfsLoadingStates, setWfsLoadingStates] = useState<
    Record<string, WfsLoadState>
  >({});

  const activeBaseMap =
    BASEMAPS.find((baseMap) => baseMap.id === baseMapId) ?? DEFAULT_BASEMAP;
  const activeLayersCount = visibleLayerIds.size;
  const outOfRangeCount = useMemo(() => {
    if (!mapViewport) {
      return 0;
    }

    return Array.from(visibleLayerIds).reduce((count, layerId) => {
      const meta = metas[layerId];
      if (!meta || meta.type !== "layer") {
        return count;
      }

      return (
        count + (isLayerInZoomRange(meta.config, mapViewport.zoom) ? 0 : 1)
      );
    }, 0);
  }, [mapViewport, metas, visibleLayerIds]);

  const cursorLabel = cursorPosition
    ? `${cursorPosition.lat.toFixed(4)}, ${cursorPosition.lng.toFixed(4)}`
    : "Mueve el cursor sobre el mapa";
  const metadataLayer = metadataLayerId ? metas[metadataLayerId] : null;
  const metadataRows = useMemo(
    () => buildMetadataRows(metadataLayer),
    [metadataLayer],
  );
  const wfsLoadingLayers = useMemo(
    () =>
      Object.entries(wfsLoadingStates)
        .filter(([layerId]) => visibleLayerIds.has(layerId))
        .map(([layerId, state]) => ({
          layerId,
          order: metas[layerId]?.order ?? Number.MAX_SAFE_INTEGER,
          ...state,
        }))
        .sort((a, b) => a.order - b.order),
    [metas, visibleLayerIds, wfsLoadingStates],
  );
  const wfsErrorCount = useMemo(
    () => wfsLoadingLayers.filter((layer) => layer.status === "error").length,
    [wfsLoadingLayers],
  );
  const wfsPendingCount = useMemo(
    () => wfsLoadingLayers.filter((layer) => layer.status === "loading").length,
    [wfsLoadingLayers],
  );
  const handleMapReady = useCallback(
    (map: L.Map | null) => {
      setMapInstance(map);
      registerMap(map);
    },
    [registerMap],
  );
  const handleWfsLoadStateChange = useCallback(
    (layerId: string, state: WfsLoadState | null) => {
      setWfsLoadingStates((current) => {
        if (!state) {
          if (!(layerId in current)) {
            return current;
          }

          const next = { ...current };
          delete next[layerId];
          return next;
        }

        const previous = current[layerId];

        if (
          previous &&
          previous.layerName === state.layerName &&
          previous.status === state.status &&
          previous.progress === state.progress &&
          previous.loadedBytes === state.loadedBytes &&
          previous.totalBytes === state.totalBytes &&
          previous.errorMessage === state.errorMessage
        ) {
          return current;
        }

        return {
          ...current,
          [layerId]: state,
        };
      });
    },
    [],
  );
  const handleCursorChange = useCallback((latlng: LatLng | null) => {
    setCursorPosition((current) => {
      if (!latlng) {
        return current ? null : current;
      }

      if (
        current &&
        current.lat.toFixed(4) === latlng.lat.toFixed(4) &&
        current.lng.toFixed(4) === latlng.lng.toFixed(4)
      ) {
        return current;
      }

      return latlng;
    });
  }, []);
  const handleShellClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = event.target;

      if (!(target instanceof HTMLElement)) {
        return;
      }

      const trigger = target.closest<HTMLElement>("[data-layer-metadata-id]");

      if (!trigger?.dataset.layerMetadataId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setMetadataLayerId(trigger.dataset.layerMetadataId);
    },
    [],
  );

  return (
    <div
      className="map-shell relative h-full overflow-hidden rounded-[24px]"
      onClickCapture={handleShellClick}
    >
      <MapScene
        baseMap={activeBaseMap}
        onReady={handleMapReady}
        onCursorChange={handleCursorChange}
        onZoomChange={setCurrentZoom}
        onWfsLoadStateChange={handleWfsLoadStateChange}
      />

      <div className="pointer-events-none absolute inset-0 z-[500]">
        <div className="absolute top-4 left-4 flex flex-col gap-2">
          <div className="bg-background/92 pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/80 px-3 py-1.5 text-xs font-medium shadow-lg shadow-black/10 backdrop-blur">
            <span className="bg-primary size-2.5 rounded-full" />
            {activeLayersCount}{" "}
            {activeLayersCount === 1 ? "capa activa" : "capas activas"}
          </div>

          {outOfRangeCount > 0 && (
            <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50/95 px-3 py-1.5 text-xs font-medium text-amber-800 shadow-lg shadow-amber-200/30 backdrop-blur dark:border-amber-800 dark:bg-amber-950/80 dark:text-amber-200">
              <Navigation className="size-3.5" />
              {outOfRangeCount} fuera de escala
            </div>
          )}

          {wfsLoadingLayers.length > 0 && (
            <div
              aria-live="polite"
              className={`pointer-events-auto min-w-[15rem] max-w-[20rem] rounded-2xl p-3 text-xs shadow-lg backdrop-blur ${
                wfsErrorCount > 0
                  ? "border border-rose-200 bg-white/92 text-rose-950 shadow-rose-200/40 dark:border-rose-900 dark:bg-slate-950/85 dark:text-rose-100"
                  : "border border-sky-200 bg-white/92 text-sky-950 shadow-sky-200/40 dark:border-sky-900 dark:bg-slate-950/85 dark:text-sky-100"
              }`}
            >
              <div className="flex items-center gap-2 font-medium">
                {wfsErrorCount > 0 ? (
                  <AlertCircle className="size-3.5" />
                ) : (
                  <LoaderCircle className="size-3.5 animate-spin" />
                )}
                {wfsErrorCount > 0
                  ? wfsPendingCount > 0
                    ? `WFS con errores (${wfsPendingCount} cargando)`
                    : "Error al cargar capa WFS"
                  : wfsLoadingLayers.length === 1
                    ? "Cargando capa WFS"
                    : `Cargando ${wfsLoadingLayers.length} capas WFS`}
              </div>
              <div className="mt-2 space-y-2">
                {wfsLoadingLayers.map((layer) => {
                  const progressWidth =
                    layer.status === "error"
                      ? "100%"
                      : layer.progress !== null
                      ? `${Math.max(8, Math.round(layer.progress * 100))}%`
                      : layer.loadedBytes > 0
                        ? "40%"
                        : "22%";

                  return (
                    <div key={layer.layerId} className="space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate font-medium">
                          {layer.layerName}
                        </span>
                        <span
                          className={`shrink-0 text-[11px] ${
                            layer.status === "error"
                              ? "text-rose-700 dark:text-rose-300"
                              : "text-sky-700 dark:text-sky-300"
                          }`}
                        >
                          {getWfsProgressLabel(layer)}
                        </span>
                      </div>
                      <div
                        className={`h-1.5 overflow-hidden rounded-full ${
                          layer.status === "error"
                            ? "bg-rose-100 dark:bg-rose-950/70"
                            : "bg-sky-100 dark:bg-sky-950"
                        }`}
                      >
                        <div
                          className={`h-full rounded-full transition-[width] duration-200 ${
                            layer.status === "error"
                              ? "bg-rose-500"
                              : "bg-sky-500"
                          } ${
                            layer.status === "loading" && layer.progress === null
                              ? "animate-pulse"
                              : ""
                          }`}
                          style={{ width: progressWidth }}
                        />
                      </div>
                      {layer.status === "error" && layer.errorMessage && (
                        <p className="line-clamp-2 text-[11px] text-rose-800 dark:text-rose-200">
                          {layer.errorMessage}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="pointer-events-auto absolute top-4 right-2 mt-3 grid w-[3rem] grid-rows-3 gap-2 rounded-[22px]">
          <Button
            variant="outline"
            size="icon"
            className="rounded-xl bg-black/60!"
            onClick={() => mapInstance?.zoomOut()}
            disabled={!mapInstance}
          >
            <Minus className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="rounded-xl bg-black/60!"
            onClick={() => mapInstance?.zoomIn()}
            disabled={!mapInstance}
          >
            <Plus className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="rounded-xl bg-black/60!"
            onClick={() => mapInstance?.setView(MAP_CENTER, MAP_ZOOM)}
            disabled={!mapInstance}
          >
            <RotateCcw className="size-4" />
          </Button>
        </div>

        <div className="absolute right-4 bottom-4 flex flex-col items-end gap-2">
          <div className="bg-background/92 pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/80 px-3 py-1.5 text-xs font-medium shadow-lg shadow-black/10 backdrop-blur">
            <span className="text-muted-foreground">Zoom</span>
            <span className="text-foreground font-semibold">{currentZoom}</span>
          </div>
          <div className="bg-background/92 pointer-events-auto inline-flex max-w-[18rem] items-center gap-2 rounded-full border border-white/80 px-3 py-1.5 text-xs shadow-lg shadow-black/10 backdrop-blur">
            <Navigation className="text-primary size-3.5" />
            <span className="text-muted-foreground truncate">
              {cursorLabel}
            </span>
          </div>
        </div>
      </div>

      <Dialog
        open={metadataLayer?.type === "layer"}
        onOpenChange={(open) => {
          if (!open) {
            setMetadataLayerId(null);
          }
        }}
      >
        <DialogContent className="max-h-[min(90vh,36rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Metadatos de la capa</DialogTitle>
            <DialogDescription>
              {metadataLayer?.type === "layer" ? metadataLayer.name : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {metadataRows.map((row) => (
              <div
                key={row.key}
                className="bg-muted/25 grid gap-1 rounded-md border p-3 sm:grid-cols-[11rem_1fr] sm:gap-4"
              >
                <span className="text-muted-foreground text-sm font-medium">
                  {row.label}
                </span>
                <span className="text-sm break-words whitespace-pre-wrap">
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
