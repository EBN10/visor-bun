import { auth } from "@clerk/nextjs/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import {
  GEOJSON_ALLOWED_CONTENT_TYPES,
  MAX_GEOJSON_UPLOAD_SIZE_BYTES,
} from "~/lib/qgis-upload";
import { resolveGeoJsonUploadCapabilities } from "~/server/qgis/upload-capabilities";

function getFriendlyErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "No se pudo iniciar la subida del archivo";
  }

  if (error.message.includes("BLOB_READ_WRITE_TOKEN")) {
    return "Falta configurar Vercel Blob para este deployment.";
  }

  return error.message;
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const uploadCapabilities = resolveGeoJsonUploadCapabilities();

    if (uploadCapabilities.transport !== "blob") {
      throw new Error(
        "La subida por Blob esta deshabilitada. Ajusta QGIS_UPLOAD_TRANSPORT si quieres activarla.",
      );
    }

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const { userId } = await auth();

        if (!userId) {
          throw new Error("Debes iniciar sesion para subir archivos GeoJSON.");
        }

        return {
          allowedContentTypes: GEOJSON_ALLOWED_CONTENT_TYPES,
          addRandomSuffix: true,
          maximumSizeInBytes: MAX_GEOJSON_UPLOAD_SIZE_BYTES,
        };
      },
      onUploadCompleted: async () => {},
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error("Error preparing GeoJSON blob upload:", error);

    return NextResponse.json(
      { error: getFriendlyErrorMessage(error) },
      { status: 400 },
    );
  }
}
