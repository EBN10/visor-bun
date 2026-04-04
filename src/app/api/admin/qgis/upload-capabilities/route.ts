import { NextResponse } from "next/server";
import {
  MAX_GEOJSON_UPLOAD_SIZE_BYTES,
  VERCEL_FUNCTION_PAYLOAD_LIMIT_BYTES,
  type GeoJsonUploadTransport,
} from "~/lib/qgis-upload";

type UploadStrategy = "vercel-blob" | "vercel-direct" | "server-direct";

function resolveUploadCapabilities(): {
  maxFileSizeBytes: number | null;
  strategy: UploadStrategy;
  transport: GeoJsonUploadTransport;
} {
  const isVercel = process.env.VERCEL === "1";
  const hasBlobToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

  if (isVercel && hasBlobToken) {
    return {
      transport: "blob",
      maxFileSizeBytes: MAX_GEOJSON_UPLOAD_SIZE_BYTES,
      strategy: "vercel-blob",
    };
  }

  if (isVercel) {
    return {
      transport: "direct",
      maxFileSizeBytes: VERCEL_FUNCTION_PAYLOAD_LIMIT_BYTES,
      strategy: "vercel-direct",
    };
  }

  return {
    transport: "direct",
    maxFileSizeBytes: null,
    strategy: "server-direct",
  };
}

export async function GET() {
  return NextResponse.json(resolveUploadCapabilities());
}
