export type MapBoundsSnapshot = {
  south: number
  west: number
  north: number
  east: number
}

export type MapViewportSnapshot = {
  bounds: MapBoundsSnapshot
  zoom: number
}

const DEFAULT_BOUNDS_PADDING = 0.6

export function padBounds(
  bounds: MapBoundsSnapshot,
  padding: number = DEFAULT_BOUNDS_PADDING,
): MapBoundsSnapshot {
  const latDiff = bounds.north - bounds.south
  const lngDiff = bounds.east - bounds.west
  const latPadding = Math.max(latDiff * padding, 0.0005)
  const lngPadding = Math.max(lngDiff * padding, 0.0005)

  return {
    south: bounds.south - latPadding,
    west: bounds.west - lngPadding,
    north: bounds.north + latPadding,
    east: bounds.east + lngPadding,
  }
}

export function getBboxPrecision(zoom: number) {
  if (zoom >= 14) return 5
  if (zoom >= 11) return 4
  if (zoom >= 8) return 3
  return 2
}

export function boundsToBboxParam(bounds: MapBoundsSnapshot, zoom: number) {
  const precision = getBboxPrecision(zoom)

  return [bounds.west, bounds.south, bounds.east, bounds.north]
    .map((value) => value.toFixed(precision))
    .join(",")
}

export function viewportToQuery(
  viewport: MapViewportSnapshot,
  padding: number = DEFAULT_BOUNDS_PADDING,
) {
  const paddedBounds = padBounds(viewport.bounds, padding)
  const queryZoom = getVectorQueryZoom(viewport.zoom)

  return {
    zoom: queryZoom,
    bounds: paddedBounds,
    bbox: boundsToBboxParam(paddedBounds, queryZoom),
  }
}

export function buildVectorLayerUrl(id: string, bbox: string, zoom: number) {
  return `/api/layers/${encodeURIComponent(id)}/data?bbox=${bbox}&z=${zoom}`
}

export function getVectorSimplifyTolerance(zoom: number) {
  if (zoom >= 13) return 0
  if (zoom >= 11) return 0.00003
  if (zoom >= 9) return 0.00012
  if (zoom >= 7) return 0.0005
  return 0.0015
}

export function getVectorGeoJsonPrecision(zoom: number) {
  if (zoom >= 13) return 6
  if (zoom >= 10) return 5
  return 4
}

export function getVectorQueryZoom(zoom: number) {
  if (zoom >= 14) return zoom
  if (zoom >= 11) return 12
  if (zoom >= 8) return 9
  return 7
}

export function boundsContainBounds(
  container: MapBoundsSnapshot,
  target: MapBoundsSnapshot,
) {
  return (
    container.south <= target.south &&
    container.west <= target.west &&
    container.north >= target.north &&
    container.east >= target.east
  )
}
