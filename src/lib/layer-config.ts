import type { LayerConfig, VectorConfig, WfsConfig } from "~/server/db/schema";

export const LAYER_KIND_OPTIONS = [
  { value: "wms", label: "WMS" },
  { value: "wfs", label: "WFS" },
  { value: "xyz", label: "XYZ" },
] as const;

export const WFS_VERSION_OPTIONS = ["2.0.0", "1.1.0", "1.0.0"] as const;

export const WFS_AXIS_ORDER_OPTIONS = [
  {
    value: "auto",
    label: "Automático",
    description: "Usa el orden recomendado según versión y SRS.",
  },
  {
    value: "lonlat",
    label: "Lon, Lat",
    description: "Usa X,Y como longitud,latitud.",
  },
  {
    value: "latlon",
    label: "Lat, Lon",
    description: "Usa Y,X como latitud,longitud.",
  },
] as const;

export type FeatureLayerConfig = VectorConfig | WfsConfig;

export function isFeatureLayerKind(
  kind?: string | null,
): kind is "vector" | "wfs" {
  return kind === "vector" || kind === "wfs";
}

export function isFeatureLayerConfig(
  config?: LayerConfig | null,
): config is FeatureLayerConfig {
  return config?.type === "vector" || config?.type === "wfs";
}

export function sanitizeLayerIdentifier(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}
