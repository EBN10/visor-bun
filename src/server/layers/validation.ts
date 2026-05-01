import type { LayerConfig, WfsAxisOrder } from "~/server/db/schema";

export type LayerKind = "vector" | "wms" | "wfs" | "xyz";

type ValidationResult = { ok: true } | { ok: false; error: string };

const VALID_WFS_AXIS_ORDERS = new Set<WfsAxisOrder>([
  "auto",
  "lonlat",
  "latlon",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function validateHttpUrl(value: unknown, label: string): ValidationResult {
  if (!isNonEmptyString(value)) {
    return { ok: false, error: `${label} is required` };
  }

  try {
    const url = new URL(value.trim());

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { ok: false, error: `${label} must use http or https` };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: `${label} must be a valid URL` };
  }
}

function validateBounds(bounds: unknown): ValidationResult {
  if (bounds === undefined) {
    return { ok: true };
  }

  let south: unknown;
  let west: unknown;
  let north: unknown;
  let east: unknown;

  if (Array.isArray(bounds)) {
    if (bounds.length !== 4) {
      return { ok: false, error: "bounds array must have 4 values" };
    }

    west = bounds[0];
    south = bounds[1];
    east = bounds[2];
    north = bounds[3];
  } else if (isPlainObject(bounds)) {
    ({ south, west, north, east } = bounds);
  } else {
    return { ok: false, error: "bounds must be an array or object" };
  }

  if (![south, west, north, east].every(isFiniteNumber)) {
    return { ok: false, error: "bounds values must be finite numbers" };
  }

  if (Number(south) >= Number(north)) {
    return { ok: false, error: "bounds south must be less than north" };
  }

  if (Number(west) >= Number(east)) {
    return { ok: false, error: "bounds west must be less than east" };
  }

  return { ok: true };
}

function validateCommonDisplayConfig(
  config: Record<string, unknown>,
): ValidationResult {
  const boundsValidation = validateBounds(config.bounds);
  if (!boundsValidation.ok) {
    return boundsValidation;
  }

  const opacity = config.opacity;
  if (opacity !== undefined) {
    if (!isFiniteNumber(opacity) || opacity < 0 || opacity > 1) {
      return { ok: false, error: "opacity must be a number between 0 and 1" };
    }
  }

  const minZoom = config.minZoom;
  if (minZoom !== undefined) {
    if (!isFiniteNumber(minZoom) || minZoom < 0 || minZoom > 24) {
      return { ok: false, error: "minZoom must be a number between 0 and 24" };
    }
  }

  const maxZoom = config.maxZoom;
  if (maxZoom !== undefined) {
    if (!isFiniteNumber(maxZoom) || maxZoom < 0 || maxZoom > 24) {
      return { ok: false, error: "maxZoom must be a number between 0 and 24" };
    }
  }

  if (isFiniteNumber(minZoom) && isFiniteNumber(maxZoom) && minZoom > maxZoom) {
    return { ok: false, error: "minZoom cannot be greater than maxZoom" };
  }

  return { ok: true };
}

function validateFeatureLayerConfig(
  config: Record<string, unknown>,
): ValidationResult {
  const displayValidation = validateCommonDisplayConfig(config);
  if (!displayValidation.ok) {
    return displayValidation;
  }

  if (config.popupProps !== undefined) {
    if (
      !Array.isArray(config.popupProps) ||
      !config.popupProps.every((value) => isNonEmptyString(value))
    ) {
      return {
        ok: false,
        error: "popupProps must be an array of non-empty strings",
      };
    }
  }

  return { ok: true };
}

export function validateLayerConfig(
  kind: LayerKind,
  config: unknown,
): ValidationResult {
  if (!isPlainObject(config)) {
    return { ok: false, error: "config must be an object" };
  }

  if (config.type !== kind) {
    return { ok: false, error: `${kind} config.type must be '${kind}'` };
  }

  if (kind === "vector") {
    const featureValidation = validateFeatureLayerConfig(config);
    if (!featureValidation.ok) {
      return featureValidation;
    }

    if (!isNonEmptyString(config.schema)) {
      return { ok: false, error: "missing schema in vector config" };
    }

    if (!isNonEmptyString(config.table)) {
      return { ok: false, error: "missing table in vector config" };
    }

    if (!isNonEmptyString(config.geomColumn)) {
      return { ok: false, error: "missing geomColumn in vector config" };
    }

    if (config.srid !== undefined && !isPositiveInteger(config.srid)) {
      return { ok: false, error: "srid must be a positive integer" };
    }

    return { ok: true };
  }

  if (kind === "wms") {
    const displayValidation = validateCommonDisplayConfig(config);
    if (!displayValidation.ok) {
      return displayValidation;
    }

    const urlValidation = validateHttpUrl(config.url, "url");
    if (!urlValidation.ok) {
      return urlValidation;
    }

    if (!isNonEmptyString(config.layers)) {
      return { ok: false, error: "missing layers in wms config" };
    }

    if (
      config.transparent !== undefined &&
      typeof config.transparent !== "boolean"
    ) {
      return { ok: false, error: "transparent must be a boolean" };
    }

    return { ok: true };
  }

  if (kind === "wfs") {
    const featureValidation = validateFeatureLayerConfig(config);
    if (!featureValidation.ok) {
      return featureValidation;
    }

    const urlValidation = validateHttpUrl(config.url, "url");
    if (!urlValidation.ok) {
      return urlValidation;
    }

    if (!isNonEmptyString(config.typeName)) {
      return { ok: false, error: "missing typeName in wfs config" };
    }

    if (config.pageSize !== undefined && !isPositiveInteger(config.pageSize)) {
      return { ok: false, error: "pageSize must be a positive integer" };
    }

    if (
      config.maxFeatures !== undefined &&
      !isPositiveInteger(config.maxFeatures)
    ) {
      return { ok: false, error: "maxFeatures must be a positive integer" };
    }

    if (
      config.axisOrder !== undefined &&
      !VALID_WFS_AXIS_ORDERS.has(config.axisOrder as WfsAxisOrder)
    ) {
      return { ok: false, error: "axisOrder must be auto, lonlat or latlon" };
    }

    return { ok: true };
  }

  const displayValidation = validateCommonDisplayConfig(config);
  if (!displayValidation.ok) {
    return displayValidation;
  }

  const urlValidation = validateHttpUrl(config.url, "url");
  if (!urlValidation.ok) {
    return urlValidation;
  }

  return { ok: true };
}

export function isLayerKind(value: unknown): value is LayerKind {
  return (
    value === "vector" || value === "wms" || value === "wfs" || value === "xyz"
  );
}

export function asLayerConfig(config: unknown) {
  return config as LayerConfig;
}
