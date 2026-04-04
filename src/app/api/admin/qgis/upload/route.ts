import { del, get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { importGeoJsonLayer } from "~/server/qgis/import-geojson";

type BlobImportRequest = {
  blobPathname: string;
  name: string;
  groupId: string;
  originalFileName?: string;
};

type RequestInput = {
  layerName: string;
  groupId: string;
  text: string;
  source: "direct_upload" | "vercel_blob";
  originalFileName?: string | null;
  cleanup?: () => Promise<void>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBlobImportRequest(value: unknown): value is BlobImportRequest {
  if (!isRecord(value)) return false;

  return (
    typeof value.blobPathname === "string" &&
    typeof value.name === "string" &&
    typeof value.groupId === "string"
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Internal Server Error";
}

function getErrorStack(error: unknown) {
  if (error instanceof Error) {
    return error.stack;
  }

  return undefined;
}

async function readRequestInput(req: Request): Promise<RequestInput> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return readBlobRequestInput(req);
  }

  return readMultipartRequestInput(req);
}

async function readMultipartRequestInput(req: Request): Promise<RequestInput> {
  const formData = await req.formData();
  const file = formData.get("file");
  const layerName = formData.get("name");
  const groupId = formData.get("groupId");

  if (
    !(file instanceof File) ||
    typeof layerName !== "string" ||
    typeof groupId !== "string"
  ) {
    throw new Error("File, name, and groupId are required");
  }

  return {
    layerName,
    groupId,
    text: await file.text(),
    source: "direct_upload",
    originalFileName: file.name,
  };
}

async function readBlobRequestInput(req: Request): Promise<RequestInput> {
  const body = (await req.json()) as unknown;

  if (!isBlobImportRequest(body)) {
    throw new Error("blobPathname, name, and groupId are required");
  }

  const { blobPathname, groupId, name, originalFileName } = body;
  const blob = await get(blobPathname, { access: "private" });

  if (!blob || blob.statusCode !== 200) {
    throw new Error(
      "No se pudo recuperar el archivo temporal desde Vercel Blob",
    );
  }

  return {
    layerName: name,
    groupId,
    text: await new Response(blob.stream).text(),
    source: "vercel_blob",
    originalFileName: originalFileName ?? blobPathname,
    cleanup: async () => {
      await del(blobPathname);
    },
  };
}

export async function POST(req: Request) {
  let cleanup: (() => Promise<void>) | undefined;

  try {
    const input = await readRequestInput(req);
    cleanup = input.cleanup;

    const result = await importGeoJsonLayer({
      layerName: input.layerName,
      groupId: input.groupId,
      text: input.text,
      source: input.source,
      originalFileName: input.originalFileName,
    });

    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }

    return NextResponse.json(
      {
        success: true,
        layerId: result.layerId,
        layerName: result.layerName,
        featureCount: result.featureCount,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("Error processing QGIS upload:", error);

    return NextResponse.json(
      {
        error: getErrorMessage(error),
        details: getErrorStack(error),
      },
      { status: 500 },
    );
  } finally {
    if (cleanup) {
      try {
        await cleanup();
      } catch (cleanupError) {
        console.error("Error cleaning up upload blob:", cleanupError);
      }
    }
  }
}
