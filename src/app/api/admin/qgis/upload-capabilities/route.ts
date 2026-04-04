import { NextResponse } from "next/server";
import { resolveGeoJsonUploadCapabilities } from "~/server/qgis/upload-capabilities";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "No se pudo resolver la configuracion de uploads";
}

export async function GET() {
  try {
    return NextResponse.json(resolveGeoJsonUploadCapabilities());
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 400 },
    );
  }
}
