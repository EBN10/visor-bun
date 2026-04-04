"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { upload as uploadBlob } from "@vercel/blob/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  FileJson,
  Loader2,
  RefreshCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { fetchJson, qk } from "~/lib/api";
import {
  BLOB_MULTIPART_UPLOAD_THRESHOLD_BYTES,
  buildGeoJsonBlobPath,
  type GeoJsonUploadMode,
  type GeoJsonUploadTransport,
} from "~/lib/qgis-upload";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Progress } from "~/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

type LayerGroup = {
  id: string;
  name: string;
};

type UploadStatus =
  | "pending"
  | "uploading"
  | "processing"
  | "success"
  | "error";

type UploadItem = {
  id: string;
  fingerprint: string;
  file: File;
  name: string;
  groupId: string;
  status: UploadStatus;
  progress: number;
  error?: string;
  layerId?: string;
};

type UploadResponse = {
  layerId: string;
};

type UploadErrorResponse = {
  error?: string;
};

type UploadCapabilities = {
  maxFileSizeBytes: number | null;
  mode: GeoJsonUploadMode;
  strategy: "blob" | "vercel-direct" | "server-direct";
  transport: GeoJsonUploadTransport;
};

const GEOJSON_FILE_REGEX = /\.(geojson|json)$/i;

function createQueueId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildFingerprint(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function getSuggestedLayerName(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getStatusLabel(status: UploadStatus) {
  switch (status) {
    case "pending":
      return "Pendiente";
    case "uploading":
      return "Subiendo";
    case "processing":
      return "Procesando";
    case "success":
      return "Completado";
    case "error":
      return "Con error";
  }
}

function getStatusVariant(status: UploadStatus) {
  switch (status) {
    case "pending":
      return "secondary";
    case "uploading":
    case "processing":
      return "outline";
    case "success":
      return "default";
    case "error":
      return "destructive";
  }
}

function isUploadResponse(value: unknown): value is UploadResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "layerId" in value &&
    typeof value.layerId === "string"
  );
}

function isUploadErrorResponse(value: unknown): value is UploadErrorResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    (typeof value.error === "string" || typeof value.error === "undefined")
  );
}

function getAggregateProgress(items: UploadItem[]) {
  if (!items.length) return 0;

  const total = items.reduce((acc, item) => {
    if (item.status === "success") return acc + 100;
    if (item.status === "processing") return acc + 98;
    if (item.status === "uploading")
      return acc + Math.max(item.progress, 5) * 0.9;

    return acc;
  }, 0);

  return Math.round(total / items.length);
}

async function uploadGeoJson(
  item: Pick<UploadItem, "file" | "name" | "groupId">,
  transport: GeoJsonUploadTransport,
  maxFileSizeBytes: number | null,
  onStateChange: (state: Pick<UploadItem, "status" | "progress">) => void,
) {
  if (maxFileSizeBytes !== null && item.file.size > maxFileSizeBytes) {
    throw new Error(
      `El archivo supera el limite configurado de ${formatFileSize(maxFileSizeBytes)} para este deployment.`,
    );
  }

  if (transport === "blob") {
    return uploadGeoJsonViaBlob(item, onStateChange);
  }

  return uploadGeoJsonDirect(item, onStateChange);
}

async function uploadGeoJsonViaBlob(
  item: Pick<UploadItem, "file" | "name" | "groupId">,
  onStateChange: (state: Pick<UploadItem, "status" | "progress">) => void,
) {
  onStateChange({ status: "uploading", progress: 0 });

  try {
    const blob = await uploadBlob(
      buildGeoJsonBlobPath(item.file.name),
      item.file,
      {
        access: "private",
        handleUploadUrl: "/api/qgis/blob-upload",
        multipart: item.file.size >= BLOB_MULTIPART_UPLOAD_THRESHOLD_BYTES,
        onUploadProgress: ({ percentage }) => {
          onStateChange({
            status: "uploading",
            progress: Math.max(5, Math.round(percentage)),
          });
        },
      },
    );

    onStateChange({ status: "processing", progress: 100 });

    return fetchJson<UploadResponse>("/api/admin/qgis/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        blobPathname: blob.pathname,
        name: item.name,
        groupId: item.groupId,
        originalFileName: item.file.name,
      }),
    });
  } catch (error) {
    throw new Error(
      getBlobUploadErrorMessage(error) ??
        "No se pudo subir el archivo a Vercel Blob",
    );
  }
}

function uploadGeoJsonDirect(
  item: Pick<UploadItem, "file" | "name" | "groupId">,
  onStateChange: (state: Pick<UploadItem, "status" | "progress">) => void,
) {
  return new Promise<UploadResponse>((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", item.file);
    formData.append("name", item.name);
    formData.append("groupId", item.groupId);

    const xhr = new XMLHttpRequest();
    let movedToProcessing = false;

    const moveToProcessing = () => {
      if (movedToProcessing) return;
      movedToProcessing = true;
      onStateChange({ status: "processing", progress: 100 });
    };

    xhr.open("POST", "/api/admin/qgis/upload");
    xhr.responseType = "text";

    xhr.onloadstart = () => {
      onStateChange({ status: "uploading", progress: 0 });
    };

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;

      onStateChange({
        status: "uploading",
        progress: Math.max(5, Math.round((event.loaded / event.total) * 100)),
      });
    };

    xhr.upload.onloadend = moveToProcessing;
    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.LOADING) {
        moveToProcessing();
      }
    };

    xhr.onerror = () => {
      reject(new Error("No se pudo conectar con el servidor"));
    };

    xhr.onload = () => {
      const response = getXhrResponse(xhr);

      if (xhr.status >= 200 && xhr.status < 300) {
        if (isUploadResponse(response)) {
          resolve(response);
          return;
        }

        reject(
          new Error(
            "La respuesta del servidor no incluyó el identificador de la capa",
          ),
        );
        return;
      }

      const errorMessage = getUploadRequestErrorMessage(xhr, response);

      reject(new Error(errorMessage));
    };

    xhr.send(formData);
  });
}

function getBlobUploadErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return null;
  }

  return error.message;
}

function getXhrResponse(xhr: XMLHttpRequest) {
  if (xhr.response && typeof xhr.response === "object") {
    return xhr.response;
  }

  const rawResponse =
    typeof xhr.response === "string" ? xhr.response : getSafeResponseText(xhr);

  return safeParseJson(rawResponse);
}

function getSafeResponseText(xhr: XMLHttpRequest) {
  try {
    return xhr.responseText;
  } catch {
    return "";
  }
}

function safeParseJson(text: string) {
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function getUploadRequestErrorMessage(xhr: XMLHttpRequest, response: unknown) {
  if (isUploadErrorResponse(response) && response.error) {
    return response.error;
  }

  if (xhr.status === 413) {
    return "El archivo supera el limite de carga del servidor. Si en local funciona y en produccion no, aumenta client_max_body_size en el proxy o Nginx.";
  }

  return `Error en la subida con estado ${xhr.status}`;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

export default function QgisImportPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const itemsRef = useRef<UploadItem[]>([]);

  const [items, setItems] = useState<UploadItem[]>([]);
  const [defaultGroupId, setDefaultGroupId] = useState("");
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
  const [isBatchRunning, setIsBatchRunning] = useState(false);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const groupsQuery = useQuery({
    queryKey: ["admin", "layer-groups"],
    queryFn: () => fetchJson<LayerGroup[]>("/api/admin/layer-groups"),
  });
  const uploadCapabilitiesQuery = useQuery({
    queryKey: ["admin", "qgis-upload-capabilities"],
    queryFn: () =>
      fetchJson<UploadCapabilities>("/api/admin/qgis/upload-capabilities"),
  });
  const uploadTransport = uploadCapabilitiesQuery.data?.transport;

  const stats = useMemo(() => {
    const pending = items.filter((item) => item.status === "pending").length;
    const success = items.filter((item) => item.status === "success").length;
    const error = items.filter((item) => item.status === "error").length;
    const ready = items.filter(
      (item) => item.status === "pending" && item.name.trim() && item.groupId,
    ).length;

    return {
      pending,
      success,
      error,
      ready,
      progress: getAggregateProgress(items),
    };
  }, [items]);

  const isBusy = isBatchRunning || activeUploadId !== null;
  const isUploadTransportLoading =
    uploadCapabilitiesQuery.isLoading || uploadCapabilitiesQuery.isRefetching;
  const uploadCapabilitiesError = uploadCapabilitiesQuery.isError
    ? getErrorMessage(
        uploadCapabilitiesQuery.error,
        "No se pudo determinar el modo de carga del entorno.",
      )
    : null;
  const hasPendingInvalidItems = items.some(
    (item) => item.status === "pending" && (!item.name.trim() || !item.groupId),
  );

  function updateItem(
    itemId: string,
    updater: (item: UploadItem) => UploadItem,
  ) {
    setItems((current) =>
      current.map((item) => (item.id === itemId ? updater(item) : item)),
    );
  }

  function queueFiles(files: FileList | null) {
    if (!files?.length) return;

    const selectedFiles = Array.from(files);
    const acceptedFiles = selectedFiles.filter((file) =>
      GEOJSON_FILE_REGEX.test(file.name),
    );

    const rejectedCount = selectedFiles.length - acceptedFiles.length;
    let addedCount = 0;
    let duplicateCount = 0;

    setItems((current) => {
      const fingerprints = new Set(current.map((item) => item.fingerprint));
      const next = [...current];

      for (const file of acceptedFiles) {
        const fingerprint = buildFingerprint(file);
        if (fingerprints.has(fingerprint)) {
          duplicateCount += 1;
          continue;
        }

        fingerprints.add(fingerprint);
        addedCount += 1;
        next.push({
          id: createQueueId(),
          fingerprint,
          file,
          name: getSuggestedLayerName(file.name),
          groupId: defaultGroupId,
          status: "pending",
          progress: 0,
        });
      }

      return next;
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    if (addedCount > 0) {
      toast.success(
        addedCount === 1
          ? "Se agregó 1 archivo a la cola"
          : `Se agregaron ${addedCount} archivos a la cola`,
      );
    }

    if (duplicateCount > 0) {
      toast.error(
        duplicateCount === 1
          ? "1 archivo ya estaba en la cola"
          : `${duplicateCount} archivos ya estaban en la cola`,
      );
    }

    if (rejectedCount > 0) {
      toast.error(
        rejectedCount === 1
          ? "1 archivo fue omitido porque no es GeoJSON/JSON"
          : `${rejectedCount} archivos fueron omitidos porque no son GeoJSON/JSON`,
      );
    }
  }

  function removeItem(itemId: string) {
    setItems((current) => current.filter((item) => item.id !== itemId));
  }

  function clearCompletedItems() {
    setItems((current) => current.filter((item) => item.status !== "success"));
  }

  function applyDefaultGroupToPending() {
    if (!defaultGroupId) return;

    setItems((current) =>
      current.map((item) => {
        if (item.status === "success") return item;

        return {
          ...item,
          groupId: defaultGroupId,
          status: item.status === "error" ? "pending" : item.status,
          progress: item.status === "error" ? 0 : item.progress,
          error: undefined,
        };
      }),
    );
  }

  async function importItem(itemId: string) {
    const currentItem = itemsRef.current.find((item) => item.id === itemId);
    if (!currentItem) return false;

    if (!uploadTransport) {
      toast.error(
        "Todavia no se pudo determinar el modo de carga del servidor",
      );
      return false;
    }

    const name = currentItem.name.trim();
    if (!name || !currentItem.groupId) {
      updateItem(itemId, (item) => ({
        ...item,
        status: "error",
        progress: 0,
        error: "Completa nombre y grupo antes de importar",
      }));
      return false;
    }

    setActiveUploadId(itemId);
    updateItem(itemId, (item) => ({
      ...item,
      name,
      status: "uploading",
      progress: 0,
      error: undefined,
    }));

    try {
      const response = await uploadGeoJson(
        {
          file: currentItem.file,
          name,
          groupId: currentItem.groupId,
        },
        uploadTransport,
        uploadCapabilitiesQuery.data?.maxFileSizeBytes ?? null,
        (state) => {
          updateItem(itemId, (item) => ({
            ...item,
            status: state.status,
            progress: state.progress,
          }));
        },
      );

      updateItem(itemId, (item) => ({
        ...item,
        name,
        status: "success",
        progress: 100,
        error: undefined,
        layerId: response.layerId,
      }));

      return true;
    } catch (error: unknown) {
      updateItem(itemId, (item) => ({
        ...item,
        status: "error",
        progress: 0,
        error: getErrorMessage(error, "Error al importar el archivo"),
      }));

      return false;
    } finally {
      setActiveUploadId((current) => (current === itemId ? null : current));
    }
  }

  async function invalidateImportedLayers() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin", "layers"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "activity"] }),
      queryClient.invalidateQueries({ queryKey: qk.catalog }),
    ]);
  }

  async function runImport(targetIds?: string[]) {
    const sourceItems = targetIds?.length
      ? itemsRef.current.filter((item) => targetIds.includes(item.id))
      : itemsRef.current.filter((item) => item.status === "pending");

    if (!sourceItems.length) {
      toast.error("No hay archivos listos para importar");
      return;
    }

    const validItems = sourceItems.filter(
      (item) => item.name.trim() && item.groupId,
    );
    const invalidCount = sourceItems.length - validItems.length;

    if (!validItems.length) {
      toast.error("Completa nombre y grupo antes de importar");
      return;
    }

    if (invalidCount > 0) {
      toast.error(
        invalidCount === 1
          ? "1 archivo fue omitido porque le falta nombre o grupo"
          : `${invalidCount} archivos fueron omitidos porque les falta nombre o grupo`,
      );
    }

    setIsBatchRunning(validItems.length > 1);

    let successCount = 0;
    let errorCount = 0;

    for (const item of validItems) {
      const ok = await importItem(item.id);
      if (ok) {
        successCount += 1;
      } else {
        errorCount += 1;
      }
    }

    setIsBatchRunning(false);

    if (successCount > 0) {
      await invalidateImportedLayers();
    }

    if (validItems.length === 1) {
      const trimmedName = validItems[0]?.name?.trim();
      const label =
        trimmedName && trimmedName.length > 0
          ? trimmedName
          : (validItems[0]?.file.name ?? "archivo");
      if (successCount === 1) {
        toast.success(`"${label}" se importó correctamente`);
      } else {
        toast.error(`No se pudo importar "${label}"`);
      }
      return;
    }

    if (successCount > 0 && errorCount === 0) {
      toast.success(`Se importaron ${successCount} capas correctamente`);
      return;
    }

    if (successCount > 0) {
      toast.success(
        `Importación finalizada: ${successCount} ok, ${errorCount} con error`,
      );
      return;
    }

    toast.error("No se pudo importar ningún archivo");
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Importar desde QGIS (GeoJSON)</CardTitle>
          <CardDescription>
            Selecciona varios GeoJSON, ajusta el nombre y el grupo de cada capa,
            y sigue el estado de subida y procesamiento archivo por archivo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="space-y-2">
              <Label htmlFor="default-group">Grupo por defecto</Label>
              <Select
                value={defaultGroupId}
                onValueChange={setDefaultGroupId}
                disabled={groupsQuery.isLoading || isBusy}
              >
                <SelectTrigger id="default-group">
                  <SelectValue placeholder="Seleccionar grupo para nuevos archivos" />
                </SelectTrigger>
                <SelectContent>
                  {groupsQuery.data?.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-sm">
                Se usa como valor inicial al agregar archivos nuevos. Luego
                puedes cambiarlo por archivo.
              </p>
            </div>

            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                onClick={applyDefaultGroupToPending}
                disabled={isBusy || !defaultGroupId || items.length === 0}
              >
                Aplicar grupo a pendientes
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="files">Archivos GeoJSON</Label>
            <Input
              ref={fileInputRef}
              id="files"
              type="file"
              multiple
              accept=".json,.geojson"
              onChange={(event) => queueFiles(event.target.files)}
              disabled={isBusy}
            />
            <p className="text-muted-foreground text-sm">
              Puedes seleccionar 10 o más archivos. Cada uno quedará en cola con
              su propio nombre de capa, grupo y estado de importación.
            </p>
            {uploadCapabilitiesQuery.isSuccess && (
              <p className="text-muted-foreground text-sm">
                {uploadCapabilitiesQuery.data.strategy === "blob"
                  ? uploadCapabilitiesQuery.data.mode === "blob"
                    ? `La subida por Blob fue forzada por configuracion. Este modo tambien te sirve si mañana migras a Dokploy o a una VPS y quieres mantener el archivo fuera del request al servidor. Limite actual: ${formatFileSize(uploadCapabilitiesQuery.data.maxFileSizeBytes ?? 0)}.`
                    : `Este deployment usa Vercel Blob para archivos grandes. Limite actual: ${formatFileSize(uploadCapabilitiesQuery.data.maxFileSizeBytes ?? 0)}.`
                  : uploadCapabilitiesQuery.data.strategy === "vercel-direct"
                    ? `Este deployment corre en Vercel sin Blob configurado. Las subidas directas quedan limitadas a ${formatFileSize(uploadCapabilitiesQuery.data.maxFileSizeBytes ?? 0)}.`
                    : "Este entorno usa subida directa al servidor, util para desarrollo local y futuros deploys en VPS. Si hay proxy inverso, recuerda ajustar su limite de body/upload."}
              </p>
            )}
            {uploadCapabilitiesQuery.isError && (
              <p className="text-destructive text-sm">
                {uploadCapabilitiesError}
              </p>
            )}
          </div>

          {items.length > 0 && (
            <div className="bg-muted/30 rounded-xl border p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {stats.success} completados, {stats.pending} pendientes,{" "}
                    {stats.error} con error
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {stats.ready} archivo{stats.ready === 1 ? "" : "s"} listo
                    {stats.ready === 1 ? "" : "s"} para importar
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={clearCompletedItems}
                    disabled={isBusy || stats.success === 0}
                  >
                    <Trash2 />
                    Limpiar completados
                  </Button>
                  <Button
                    type="button"
                    onClick={() => runImport()}
                    disabled={
                      isBusy ||
                      stats.ready === 0 ||
                      isUploadTransportLoading ||
                      !uploadTransport
                    }
                  >
                    {isBusy ? <Loader2 className="animate-spin" /> : <Upload />}
                    {isUploadTransportLoading
                      ? "Preparando carga..."
                      : isBatchRunning
                        ? "Importando cola..."
                        : "Importar pendientes"}
                  </Button>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <Progress value={stats.progress} />
                <div className="text-muted-foreground flex items-center justify-between text-xs">
                  <span>Progreso total</span>
                  <span>{stats.progress}%</span>
                </div>
              </div>

              {hasPendingInvalidItems && (
                <p className="mt-3 text-sm text-amber-600">
                  Hay archivos pendientes sin nombre o sin grupo. Puedes
                  completarlos y luego importarlos.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cola de importación</CardTitle>
          <CardDescription>
            Revisa y ajusta cada archivo antes de importarlo. Los errores se
            pueden corregir y reintentar sin volver a seleccionarlo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileJson />
                </EmptyMedia>
                <EmptyTitle>No hay archivos en cola</EmptyTitle>
                <EmptyDescription>
                  Agrega uno o varios GeoJSON para preparar la importación.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <p>
                  Se sugerirá el nombre de la capa a partir del archivo y podrás
                  cambiar el grupo de cada elemento por separado.
                </p>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="space-y-4">
              {items.map((item) => {
                const isActive = activeUploadId === item.id;
                const isLocked =
                  isBusy ||
                  item.status === "success" ||
                  item.status === "processing";

                return (
                  <div key={item.id} className="rounded-xl border p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{item.file.name}</p>
                          <Badge variant={getStatusVariant(item.status)}>
                            {item.status === "uploading" && (
                              <Loader2 className="animate-spin" />
                            )}
                            {item.status === "processing" && (
                              <Loader2 className="animate-spin" />
                            )}
                            {item.status === "success" && <CheckCircle2 />}
                            {item.status === "error" && <AlertCircle />}
                            {getStatusLabel(item.status)}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground text-sm">
                          {formatFileSize(item.file.size)}
                          {item.layerId
                            ? ` · capa registrada como ${item.layerId}`
                            : ""}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {item.status !== "success" && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => runImport([item.id])}
                            disabled={
                              isBusy ||
                              isUploadTransportLoading ||
                              !uploadTransport ||
                              !item.name.trim() ||
                              !item.groupId
                            }
                          >
                            {item.status === "error" ? (
                              <RefreshCcw />
                            ) : (
                              <Upload />
                            )}
                            {isActive
                              ? "Importando..."
                              : item.status === "error"
                                ? "Reintentar"
                                : "Importar"}
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => removeItem(item.id)}
                          disabled={isBusy}
                        >
                          <Trash2 />
                          Quitar
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor={`name-${item.id}`}>
                          Nombre de la capa
                        </Label>
                        <Input
                          id={`name-${item.id}`}
                          value={item.name}
                          onChange={(event) =>
                            updateItem(item.id, (current) => ({
                              ...current,
                              name: event.target.value,
                              status:
                                current.status === "error"
                                  ? "pending"
                                  : current.status,
                              progress:
                                current.status === "error"
                                  ? 0
                                  : current.progress,
                              error: undefined,
                            }))
                          }
                          disabled={isLocked}
                          placeholder="Mi capa importada"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`group-${item.id}`}>Grupo</Label>
                        <Select
                          value={item.groupId}
                          onValueChange={(value) =>
                            updateItem(item.id, (current) => ({
                              ...current,
                              groupId: value,
                              status:
                                current.status === "error"
                                  ? "pending"
                                  : current.status,
                              progress:
                                current.status === "error"
                                  ? 0
                                  : current.progress,
                              error: undefined,
                            }))
                          }
                          disabled={isLocked || groupsQuery.isLoading}
                        >
                          <SelectTrigger id={`group-${item.id}`}>
                            <SelectValue placeholder="Seleccionar grupo" />
                          </SelectTrigger>
                          <SelectContent>
                            {groupsQuery.data?.map((group) => (
                              <SelectItem key={group.id} value={group.id}>
                                {group.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {(item.status === "uploading" ||
                      item.status === "processing" ||
                      item.status === "success") && (
                      <div className="mt-4 space-y-2">
                        <Progress
                          value={
                            item.status === "success" ? 100 : item.progress
                          }
                        />
                        <p className="text-muted-foreground text-xs">
                          {item.status === "uploading" &&
                            `Subiendo archivo... ${item.progress}%`}
                          {item.status === "processing" &&
                            "El archivo ya llegó al servidor y se está creando la tabla y la capa."}
                          {item.status === "success" &&
                            "Importación finalizada correctamente."}
                        </p>
                      </div>
                    )}

                    {item.error && (
                      <p className="text-destructive mt-4 text-sm">
                        {item.error}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
