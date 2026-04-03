"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  Layers3,
  MapPinned,
  Minus,
  Navigation,
  Plus,
  RotateCcw,
  Satellite,
} from "lucide-react";
import { useLayers } from "~/components/layers/provider";
import { Button } from "~/components/ui/button";
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
import type { VectorConfig, WmsConfig, XyzConfig } from "~/server/db/schema";

const MAP_CENTER: [number, number] = [-27.909423151558293, -62.85220337225053];
const MAP_ZOOM = 7;
const VECTOR_LAYER_STALE_TIME = 2 * 60_000;
const VECTOR_LAYER_GC_TIME = 10 * 60_000;

const BASEMAPS = [
  {
    id: "carto-voyager",
    name: "Contexto",
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  {
    id: "esri-imagery",
    name: "Satélite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
  },
] as const;

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
  const map = useMapEvents({
    mousemove: (event) => {
      onCursorChange(event.latlng);
    },
    mouseout: () => {
      onCursorChange(null);
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
      onReady(null);
    };
  }, [map, onReady, onZoomChange]);

  return null;
}

function VectorLayer({
  layerMeta,
  viewport,
}: {
  layerMeta: LayerNodeMeta;
  viewport: MapViewportSnapshot;
}) {
  const map = useMap();
  const config = layerMeta.config as VectorConfig;
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const selectedLayerRef = useRef<L.Layer | null>(null);
  const selectedFeatureRef = useRef<Feature | null>(null);
  const [requestViewport, setRequestViewport] =
    useState<MapViewportSnapshot>(viewport);
  const queryViewport = useMemo(
    () => viewportToQuery(requestViewport),
    [requestViewport],
  );

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

  const geoJsonOptions = useMemo<L.GeoJSONOptions>(() => {
    return {
      style: (feature) =>
        toPathOptions(
          getResolvedVectorStyle({
            layerId: layerMeta.id,
            config,
            feature: feature as Feature | undefined,
            zoom: viewport.zoom,
          }),
        ),
      pointToLayer: (feature, latlng) => {
        const style = getResolvedVectorStyle({
          layerId: layerMeta.id,
          config,
          feature: feature as Feature,
          zoom: viewport.zoom,
        });

        return L.circleMarker(latlng, {
          ...toPathOptions(style),
          radius: style.radius,
        });
      },
      onEachFeature: (feature, layer) => {
        const popupHtml = buildPopupHtml(
          layerMeta.name,
          (feature.properties ?? {}) as Record<string, unknown>,
          config,
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
          applyResolvedStyle(
            layer,
            getResolvedVectorStyle({
              layerId: layerMeta.id,
              config,
              feature: feature as Feature,
              zoom: viewport.zoom,
              state,
            }),
          );
        };

        applyState("default");

        layer.on({
          mouseover: () => {
            if (selectedLayerRef.current !== layer) {
              applyState("hover");
            }

            if (
              "bringToFront" in layer &&
              typeof layer.bringToFront === "function"
            ) {
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
                getResolvedVectorStyle({
                  layerId: layerMeta.id,
                  config,
                  feature: selectedFeatureRef.current,
                  zoom: viewport.zoom,
                }),
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
  }, [config, layerMeta.id, layerMeta.name, viewport.zoom]);

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

  return null;
}

function WmsLayer({ order, ...config }: WmsConfig & { order: number }) {
  return (
    <WMSTileLayer
      url={config.url}
      opacity={config.opacity ?? 1}
      minZoom={config.minZoom}
      maxZoom={config.maxZoom}
      zIndex={200 + order}
      params={{
        layers: config.layers,
        format: config.format ?? "image/png",
        transparent: config.transparent ?? true,
        version: config.version ?? "1.3.0",
      }}
    />
  );
}

function XyzLayer({ order, ...config }: XyzConfig & { order: number }) {
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
}

function LayerRenderer() {
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

        if (layerMeta.kind === "vector") {
          return (
            <VectorLayer
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
}

export default function ClientMap() {
  const { mapViewport, metas, registerMap, visibleLayerIds } = useLayers();
  const [baseMapId, setBaseMapId] =
    useState<(typeof BASEMAPS)[number]["id"]>("carto-light");
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const [cursorPosition, setCursorPosition] = useState<LatLng | null>(null);
  const [currentZoom, setCurrentZoom] = useState(MAP_ZOOM);

  const activeBaseMap =
    BASEMAPS.find((baseMap) => baseMap.id === baseMapId) ?? BASEMAPS[0];
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

  return (
    <div className="map-shell relative h-full overflow-hidden rounded-[24px]">
      <MapContainer
        center={MAP_CENTER}
        zoom={MAP_ZOOM}
        className="h-full w-full"
        preferCanvas
        zoomControl={false}
      >
        <TileLayer
          attribution={activeBaseMap.attribution}
          url={activeBaseMap.url}
        />
        <ViewportSync />
        <MapTelemetry
          onReady={(map) => {
            setMapInstance(map);
            registerMap(map);
          }}
          onCursorChange={setCursorPosition}
          onZoomChange={setCurrentZoom}
        />
        <ScaleControl />
        <LayerRenderer />
      </MapContainer>

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

        <div className="pointer-events-auto absolute top-4 right-2 mt-3 grid w-[3rem] grid-rows-3 gap-2 rounded-[22px] ">
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
    </div>
  );
}
