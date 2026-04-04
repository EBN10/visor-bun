import { env } from "~/env";
import {
  MAX_GEOJSON_UPLOAD_SIZE_BYTES,
  VERCEL_FUNCTION_PAYLOAD_LIMIT_BYTES,
  type GeoJsonUploadMode,
  type GeoJsonUploadTransport,
} from "~/lib/qgis-upload";

export type GeoJsonUploadStrategy = "blob" | "vercel-direct" | "server-direct";

export type ResolvedGeoJsonUploadCapabilities = {
  maxFileSizeBytes: number | null;
  mode: GeoJsonUploadMode;
  strategy: GeoJsonUploadStrategy;
  transport: GeoJsonUploadTransport;
};

export function resolveGeoJsonUploadCapabilities(): ResolvedGeoJsonUploadCapabilities {
  const mode = env.QGIS_UPLOAD_TRANSPORT;
  const isVercel = process.env.VERCEL === "1";
  const hasBlobToken = Boolean(env.BLOB_READ_WRITE_TOKEN);

  if (mode === "blob") {
    if (!hasBlobToken) {
      throw new Error(
        "QGIS_UPLOAD_TRANSPORT=blob requiere configurar BLOB_READ_WRITE_TOKEN.",
      );
    }

    return {
      transport: "blob",
      maxFileSizeBytes: MAX_GEOJSON_UPLOAD_SIZE_BYTES,
      strategy: "blob",
      mode,
    };
  }

  if (mode === "direct") {
    return {
      transport: "direct",
      maxFileSizeBytes: isVercel ? VERCEL_FUNCTION_PAYLOAD_LIMIT_BYTES : null,
      strategy: isVercel ? "vercel-direct" : "server-direct",
      mode,
    };
  }

  if (isVercel && hasBlobToken) {
    return {
      transport: "blob",
      maxFileSizeBytes: MAX_GEOJSON_UPLOAD_SIZE_BYTES,
      strategy: "blob",
      mode,
    };
  }

  return {
    transport: "direct",
    maxFileSizeBytes: isVercel ? VERCEL_FUNCTION_PAYLOAD_LIMIT_BYTES : null,
    strategy: isVercel ? "vercel-direct" : "server-direct",
    mode,
  };
}
