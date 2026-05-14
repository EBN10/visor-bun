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
import { Minus, Navigation, Plus, RotateCcw } from "lucide-react";
import { useLayers } from "~/components/layers/provider";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { fetchJson, qk } from "~/lib/api";
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
}: {
  layerMeta: LayerNodeMeta;
  viewport: MapViewportSnapshot;
}) {
  const map = useMap();
  const config = layerMeta.config as VectorConfig | WfsConfig;
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const selectedLayerRef = useRef<L.Layer | null>(null);
  const selectedFeatureRef = useRef<Feature | null>(null);
  const configRef = useRef(config);
  const layerNameRef = useRef(layerMeta.name);
  const viewportZoomRef = useRef(viewport.zoom);
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
    queryFn: ({ signal }) =>
      fetchJson<FeatureCollection>(
        buildVectorLayerUrl(
          layerMeta.id,
          queryViewport.bbox,
          queryViewport.zoom,
        ),
        { signal },
      ),
    staleTime: VECTOR_LAYER_STALE_TIME,
    gcTime: VECTOR_LAYER_GC_TIME,
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: false,
  });

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
  }, [data]);

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

const LayerRenderer = memo(function LayerRenderer() {
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
}: {
  baseMap: (typeof BASEMAPS)[number];
  onReady: (map: L.Map | null) => void;
  onCursorChange: (latlng: LatLng | null) => void;
  onZoomChange: (zoom: number) => void;
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
      <LayerRenderer />
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
  const handleMapReady = useCallback(
    (map: L.Map | null) => {
      setMapInstance(map);
      registerMap(map);
    },
    [registerMap],
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
