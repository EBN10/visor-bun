export type GeoJsonUploadTransport = "blob" | "direct";

export const GEOJSON_ALLOWED_CONTENT_TYPES = [
  "application/geo+json",
  "application/json",
  "application/octet-stream",
  "text/plain",
];

export const MAX_GEOJSON_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;
export const BLOB_MULTIPART_UPLOAD_THRESHOLD_BYTES = 5 * 1024 * 1024;
export const VERCEL_FUNCTION_PAYLOAD_LIMIT_BYTES = 4.5 * 1024 * 1024;

export function buildGeoJsonBlobPath(fileName: string) {
  const safeName = sanitizeFileName(fileName);
  const date = new Date().toISOString().slice(0, 10);

  return `qgis-imports/${date}/${safeName}`;
}

function sanitizeFileName(fileName: string) {
  const normalized = fileName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!normalized) {
    return "layer.geojson";
  }

  return normalized;
}
