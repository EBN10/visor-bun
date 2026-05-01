import type { Feature, FeatureCollection, GeoJsonProperties } from "geojson";
import type { MapBoundsSnapshot } from "~/lib/map-layer-utils";
import type { WfsConfig } from "~/server/db/schema";

const DEFAULT_WFS_VERSION = "2.0.0";
const DEFAULT_WFS_OUTPUT_FORMAT = "application/json";
const DEFAULT_WFS_SRS = "EPSG:4326";
const DEFAULT_WFS_PAGE_SIZE = 1000;
const DEFAULT_WFS_MAX_FEATURES = 5000;
const HARD_MAX_WFS_FEATURES = 10000;
const WFS_FETCH_TIMEOUT_MS = 15_000;

type WfsFeatureResponse = {
  features: Feature[];
};

function isFeature(value: unknown): value is Feature {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as Feature).type === "Feature"
  );
}

function normalizeFeatureProperties(
  properties: GeoJsonProperties | null | undefined,
  popupProps: string[] | undefined,
): GeoJsonProperties {
  if (!properties || !popupProps || popupProps.length === 0) {
    return properties ?? {};
  }

  return popupProps.reduce<Record<string, unknown>>(
    (accumulator, propertyName) => {
      if (propertyName in properties) {
        accumulator[propertyName] = properties[propertyName];
      }

      return accumulator;
    },
    {},
  );
}

function normalizeFeatureCollection(
  payload: unknown,
  popupProps: string[] | undefined,
): WfsFeatureResponse {
  const rawFeatures = Array.isArray(payload)
    ? payload
    : payload &&
        typeof payload === "object" &&
        Array.isArray((payload as { features?: unknown[] }).features)
      ? (payload as { features: unknown[] }).features
      : [];

  const features = rawFeatures.filter(isFeature).map((feature) => ({
    ...feature,
    properties: normalizeFeatureProperties(feature.properties, popupProps),
  }));

  return { features };
}

function clampPositiveInteger(
  value: number | undefined,
  fallback: number,
  max: number,
) {
  if (!Number.isInteger(value) || !value || value <= 0) {
    return fallback;
  }

  return Math.min(value, max);
}

function shouldUseLatLonAxisOrder(config: WfsConfig) {
  if (config.axisOrder === "latlon") {
    return true;
  }

  if (config.axisOrder === "lonlat") {
    return false;
  }

  const version = config.version ?? DEFAULT_WFS_VERSION;
  const srsName = (config.srsName ?? DEFAULT_WFS_SRS).trim().toUpperCase();

  return version === "1.1.0" && srsName === "EPSG:4326";
}

function buildBboxParam(bounds: MapBoundsSnapshot, config: WfsConfig) {
  const srsName = config.srsName?.trim() ?? DEFAULT_WFS_SRS;
  const axisValues = shouldUseLatLonAxisOrder(config)
    ? [bounds.south, bounds.west, bounds.north, bounds.east]
    : [bounds.west, bounds.south, bounds.east, bounds.north];

  return `${axisValues.join(",")},${srsName}`;
}

function buildWfsParams(
  config: WfsConfig,
  bounds: MapBoundsSnapshot,
  pageSize: number,
  startIndex: number,
) {
  const version = config.version?.trim() ?? DEFAULT_WFS_VERSION;
  const params = new URLSearchParams();

  params.set("service", "WFS");
  params.set("request", "GetFeature");
  params.set("version", version);
  params.set(version === "2.0.0" ? "typeNames" : "typeName", config.typeName);
  params.set(
    "outputFormat",
    config.outputFormat?.trim() ?? DEFAULT_WFS_OUTPUT_FORMAT,
  );
  params.set("srsName", config.srsName?.trim() ?? DEFAULT_WFS_SRS);
  params.set("bbox", buildBboxParam(bounds, config));
  params.set(version === "2.0.0" ? "count" : "maxFeatures", String(pageSize));

  if (startIndex > 0) {
    params.set("startIndex", String(startIndex));
  }

  return params;
}

async function fetchWfsPage(
  config: WfsConfig,
  bounds: MapBoundsSnapshot,
  pageSize: number,
  startIndex: number,
  signal?: AbortSignal,
) {
  const url = new URL(config.url);
  const params = buildWfsParams(config, bounds, pageSize, startIndex);

  params.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept:
        "application/json, application/geo+json, text/json;q=0.9, */*;q=0.5",
    },
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `WFS ${response.status} ${response.statusText}${
        errorText ? `: ${errorText.slice(0, 240)}` : ""
      }`,
    );
  }

  const payload = (await response.json()) as unknown;
  return normalizeFeatureCollection(payload, config.popupProps);
}

function buildTimeoutSignal(signal?: AbortSignal) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WFS_FETCH_TIMEOUT_MS);

  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeoutId),
  };
}

export async function fetchWfsFeatureCollection(
  config: WfsConfig,
  bounds: MapBoundsSnapshot,
  signal?: AbortSignal,
): Promise<FeatureCollection> {
  const pageSize = clampPositiveInteger(
    config.pageSize,
    DEFAULT_WFS_PAGE_SIZE,
    HARD_MAX_WFS_FEATURES,
  );
  const maxFeatures = clampPositiveInteger(
    config.maxFeatures,
    DEFAULT_WFS_MAX_FEATURES,
    HARD_MAX_WFS_FEATURES,
  );
  const maxPages = Math.max(1, Math.ceil(maxFeatures / pageSize));
  const features: Feature[] = [];

  for (
    let page = 0;
    page < maxPages && features.length < maxFeatures;
    page += 1
  ) {
    const startIndex = page * pageSize;
    const requestSize = Math.min(pageSize, maxFeatures - features.length);
    const timeout = buildTimeoutSignal(signal);

    try {
      const pageResult = await fetchWfsPage(
        config,
        bounds,
        requestSize,
        startIndex,
        timeout.signal,
      );

      const nextFeatures = pageResult.features.slice(0, requestSize);
      features.push(...nextFeatures);

      if (nextFeatures.length < requestSize) {
        break;
      }
    } catch (error) {
      if (features.length === 0) {
        throw error;
      }

      console.warn(
        `WFS pagination stopped early for ${config.typeName} at page ${page + 1}`,
        error,
      );
      break;
    } finally {
      timeout.cleanup();
    }
  }

  return {
    type: "FeatureCollection",
    features,
  };
}
