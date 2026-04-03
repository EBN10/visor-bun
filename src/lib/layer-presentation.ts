import type { Feature } from "geojson"
import type {
  LayerBoundsConfig,
  LayerConfig,
  VectorConfig,
} from "~/server/db/schema"
import type { MapBoundsSnapshot } from "~/lib/map-layer-utils"

const DEFAULT_LAYER_PALETTE = [
  "#1462cc",
  "#0f766e",
  "#b45309",
  "#7c3aed",
  "#be123c",
  "#0284c7",
  "#4d7c0f",
  "#c2410c",
]

const POPUP_NUMBER_FORMATTER = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 6,
})

export type GeometryKind = "point" | "line" | "polygon" | "unknown"
export type FeatureVisualState = "default" | "hover" | "selected"

export type ResolvedVectorStyle = {
  geometryKind: GeometryKind
  color: string
  fillColor: string
  weight: number
  opacity: number
  fillOpacity: number
  radius: number
  dashArray?: string
}

type HexRgb = {
  red: number
  green: number
  blue: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function parseHexColor(value: string): HexRgb | null {
  const normalized = value.trim()
  const match = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)

  if (!match) {
    return null
  }

  const rawHex = match[1]!.length === 3
    ? match[1]!.split("").map((part) => `${part}${part}`).join("")
    : match[1]!

  return {
    red: Number.parseInt(rawHex.slice(0, 2), 16),
    green: Number.parseInt(rawHex.slice(2, 4), 16),
    blue: Number.parseInt(rawHex.slice(4, 6), 16),
  }
}

function rgbToHex({ red, green, blue }: HexRgb) {
  return `#${[red, green, blue]
    .map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`
}

function mixHexColor(value: string, target: HexRgb, amount: number) {
  const parsed = parseHexColor(value)

  if (!parsed) {
    return value
  }

  const ratio = clamp(amount, 0, 1)

  return rgbToHex({
    red: parsed.red + (target.red - parsed.red) * ratio,
    green: parsed.green + (target.green - parsed.green) * ratio,
    blue: parsed.blue + (target.blue - parsed.blue) * ratio,
  })
}

function darkenHexColor(value: string, amount: number) {
  return mixHexColor(value, { red: 0, green: 0, blue: 0 }, amount)
}

function lightenHexColor(value: string, amount: number) {
  return mixHexColor(value, { red: 255, green: 255, blue: 255 }, amount)
}

function hashString(value: string) {
  return Array.from(value).reduce((hash, char) => {
    return (hash * 31 + char.charCodeAt(0)) >>> 0
  }, 7)
}

function getPopupCandidate(
  properties: Record<string, unknown>,
  candidates: string[],
) {
  return candidates.find((candidate) => {
    const value = properties[candidate]
    return value !== undefined && value !== null && `${value}`.trim().length > 0
  })
}

function resolvePropertyKey(
  properties: Record<string, unknown>,
  candidate?: string | null,
) {
  const normalizedCandidate = candidate?.trim()

  if (!normalizedCandidate) {
    return null
  }

  if (normalizedCandidate in properties) {
    return normalizedCandidate
  }

  const lowerCandidate = normalizedCandidate.toLowerCase()

  return (
    Object.keys(properties).find(
      (propertyKey) => propertyKey.toLowerCase() === lowerCandidate,
    ) ?? null
  )
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

export function humanizePropertyLabel(value: string) {
  return value
    .replaceAll(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll(/[_\-.]+/g, " ")
    .trim()
    .replaceAll(/\s+/g, " ")
    .replace(/^\w/, (letter) => letter.toUpperCase())
}

export function formatPopupValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ""
  }

  if (typeof value === "number") {
    return POPUP_NUMBER_FORMATTER.format(value)
  }

  if (typeof value === "boolean") {
    return value ? "Sí" : "No"
  }

  if (typeof value === "bigint") {
    return value.toString()
  }

  if (Array.isArray(value)) {
    return value.map((entry) => formatPopupValue(entry)).filter(Boolean).join(", ")
  }

  if (typeof value === "object") {
    return JSON.stringify(value)
  }

  return String(value)
}

export function normalizeLayerBounds(
  bounds?: LayerBoundsConfig | null,
): MapBoundsSnapshot | null {
  if (!bounds) {
    return null
  }

  if (Array.isArray(bounds)) {
    const [west, south, east, north] = bounds

    if ([south, west, north, east].some((value) => Number.isNaN(Number(value)))) {
      return null
    }

    return { south, west, north, east }
  }

  if (
    [bounds.south, bounds.west, bounds.north, bounds.east].some((value) =>
      Number.isNaN(Number(value)),
    )
  ) {
    return null
  }

  return bounds
}

export function getLayerBoundsFromConfig(config?: LayerConfig) {
  return normalizeLayerBounds(config?.bounds)
}

export function isLayerInZoomRange(
  config: Pick<LayerConfig, "minZoom" | "maxZoom"> | undefined,
  zoom: number,
) {
  if (!config) {
    return true
  }

  if (typeof config.minZoom === "number" && zoom < config.minZoom) {
    return false
  }

  if (typeof config.maxZoom === "number" && zoom > config.maxZoom) {
    return false
  }

  return true
}

export function inferGeometryKind(
  feature?: Pick<Feature, "geometry"> | null,
): GeometryKind {
  const geometryType = feature?.geometry?.type

  if (!geometryType) {
    return "unknown"
  }

  if (geometryType === "Point" || geometryType === "MultiPoint") {
    return "point"
  }

  if (geometryType === "LineString" || geometryType === "MultiLineString") {
    return "line"
  }

  if (geometryType === "Polygon" || geometryType === "MultiPolygon") {
    return "polygon"
  }

  return "unknown"
}

export function getLayerAccentColor(layerId: string, config?: LayerConfig) {
  if (config?.legend?.color) {
    return config.legend.color
  }

  if (config?.type === "vector") {
    if (config.style?.color) {
      return config.style.color
    }

    if (config.style?.fillColor) {
      return config.style.fillColor
    }
  }

  return DEFAULT_LAYER_PALETTE[hashString(layerId) % DEFAULT_LAYER_PALETTE.length]!
}

export function getResolvedVectorStyle({
  layerId,
  config,
  feature,
  zoom,
  state = "default",
}: {
  layerId: string
  config: VectorConfig
  feature?: Feature | null
  zoom: number
  state?: FeatureVisualState
}): ResolvedVectorStyle {
  const geometryKind = inferGeometryKind(feature)
  const accentColor = getLayerAccentColor(layerId, config)
  const strokeColor = config.style?.color ?? darkenHexColor(accentColor, 0.14)
  const fillColor =
    config.style?.fillColor ??
    (geometryKind === "polygon"
      ? lightenHexColor(accentColor, 0.22)
      : accentColor)
  const sharedOpacity = clamp(config.opacity ?? 1, 0.15, 1)
  const defaultWeight =
    geometryKind === "polygon"
      ? zoom >= 11
        ? 1.9
        : zoom >= 9
          ? 1.5
          : 1.15
      : geometryKind === "line"
        ? zoom >= 11
          ? 2.4
          : zoom >= 9
            ? 2
            : 1.6
        : 1.4
  const defaultFillOpacity =
    geometryKind === "polygon"
      ? zoom >= 11
        ? 0.2
        : zoom >= 9
          ? 0.14
          : 0.08
      : 0.7
  const defaultRadius =
    zoom >= 12 ? 7 : zoom >= 10 ? 6 : zoom >= 8 ? 5 : 4

  let weight = config.style?.weight ?? defaultWeight
  let fillOpacity = clamp(
    config.style?.fillOpacity ?? defaultFillOpacity,
    0,
    1,
  )
  let opacity = clamp(config.style?.opacity ?? sharedOpacity, 0.15, 1)
  let radius = config.style?.pointRadius ?? defaultRadius

  if (state === "hover") {
    weight += geometryKind === "line" ? 1 : 0.75
    fillOpacity = clamp(fillOpacity + 0.08, 0.06, 0.75)
    opacity = clamp(opacity + 0.08, 0.3, 1)
    radius += 1.2
  }

  if (state === "selected") {
    weight += geometryKind === "line" ? 1.5 : 1.1
    fillOpacity = clamp(fillOpacity + 0.14, 0.14, 0.82)
    opacity = clamp(opacity + 0.14, 0.45, 1)
    radius += 2
  }

  return {
    geometryKind,
    color: strokeColor,
    fillColor,
    weight,
    opacity,
    fillOpacity:
      geometryKind === "line" ? 0 : fillOpacity,
    radius,
    dashArray: config.style?.dashArray,
  }
}

export function buildPopupHtml(
  layerName: string,
  properties: Record<string, unknown>,
  config?: VectorConfig,
): string | null {
  const popupConfig = config?.popup
  const aliases = popupConfig?.aliases ?? {}
  const configuredTitleProp = resolvePropertyKey(properties, popupConfig?.titleProp)
  const configuredSubtitleProp = resolvePropertyKey(
    properties,
    popupConfig?.subtitleProp,
  )
  const titleProp =
    configuredTitleProp ??
    getPopupCandidate(properties, [
      "nombre",
      "name",
      "title",
      "titulo",
      "descripcion",
      "description",
      "cod_indec",
      "id",
    ])
  const subtitleProp =
    configuredSubtitleProp ??
    getPopupCandidate(properties, [
      "jur",
      "dpto",
      "departamento",
      "categoria",
      "tipo",
    ])
  const hiddenProps = new Set(
    [titleProp, subtitleProp, ...(popupConfig?.hiddenProps ?? [])].filter(
      Boolean,
    ) as string[],
  )
  const orderedFields =
    popupConfig?.order?.length
      ? popupConfig.order
      : config?.popupProps?.length
        ? config.popupProps
        : Object.keys(properties)

  const titleValue = titleProp ? formatPopupValue(properties[titleProp]) : ""
  const subtitleValue = subtitleProp
    ? formatPopupValue(properties[subtitleProp])
    : ""

  const rows = orderedFields
    .filter((field) => !hiddenProps.has(field))
    .map((field) => {
      const value = properties[field]
      const formattedValue = formatPopupValue(value)

      if (!formattedValue) {
        return ""
      }

      return `
        <div class="map-popup__row">
          <span class="map-popup__label">${escapeHtml(
            aliases[field] ?? humanizePropertyLabel(field),
          )}</span>
          <span class="map-popup__value">${escapeHtml(formattedValue)}</span>
        </div>
      `
    })
    .filter(Boolean)

  if (!titleValue && !subtitleValue && rows.length === 0) {
    return null
  }

  return `
    <section class="map-popup">
      <div class="map-popup__header">
        <div class="map-popup__eyebrow">${escapeHtml(
          config?.legend?.label ?? layerName,
        )}</div>
        ${
          titleValue
            ? `<h3 class="map-popup__title">${escapeHtml(titleValue)}</h3>`
            : ""
        }
        ${
          subtitleValue
            ? `<p class="map-popup__subtitle">${escapeHtml(subtitleValue)}</p>`
            : ""
        }
      </div>
      ${
        rows.length > 0
          ? `<div class="map-popup__body"><div class="map-popup__rows">${rows.join("")}</div></div>`
          : ""
      }
    </section>
  `
}
