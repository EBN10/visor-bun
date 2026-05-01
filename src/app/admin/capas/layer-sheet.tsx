"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as SelectPrimitive from "@radix-ui/react-select";
import {
  CheckIcon,
  ChevronDownIcon,
  Globe,
  Layers,
  Loader2,
  Map,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { fetchJson, qk } from "~/lib/api";
import { isFeatureLayerConfig } from "~/lib/layer-config";
import {
  WFS_AXIS_ORDER_OPTIONS,
  WFS_VERSION_OPTIONS,
} from "~/lib/layer-config";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import { Textarea } from "~/components/ui/textarea";
import { Badge } from "~/components/ui/badge";
import { Separator } from "~/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
import type {
  LayerConfig,
  LayerMetadata,
  WfsAxisOrder,
} from "~/server/db/schema";

type AdminLayerGroup = {
  id: string;
  name: string;
};

type EditableLayer = {
  id: string;
  name: string;
  type?: "group" | "layer";
  kind?: "vector" | "wms" | "wfs" | "xyz";
  groupId?: string | null;
  defaultVisible?: boolean;
  config?: LayerConfig;
};

type LayerUpdatePayload = {
  id: string;
  name: string;
  groupId: string;
  defaultVisible: boolean;
  config: LayerConfig;
};

type LayerSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layer: EditableLayer | null;
  groups: AdminLayerGroup[];
};

function SheetSelect({
  value,
  onValueChange,
  placeholder,
  children,
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  children: React.ReactNode;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        className={cn(
          "border-input flex h-9 w-full items-center justify-between rounded-md border bg-transparent px-3 py-2 text-sm",
          "focus:ring-ring focus:ring-2 focus:ring-offset-2 focus:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDownIcon className="size-4 opacity-50" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className={cn(
            "bg-popover text-popover-foreground relative z-[1105] max-h-96 min-w-[8rem] overflow-hidden rounded-md border shadow-md",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2",
          )}
          position="popper"
          sideOffset={4}
        >
          <SelectPrimitive.Viewport className="p-1">
            {children}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

function SheetSelectItem({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  return (
    <SelectPrimitive.Item
      value={value}
      className={cn(
        "relative flex w-full cursor-default items-center rounded-sm py-1.5 pr-8 pl-2 text-sm outline-none select-none",
        "focus:bg-accent focus:text-accent-foreground",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      )}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  );
}

function hasLayerMetadata(metadata?: LayerMetadata | null) {
  if (!metadata) return false;

  return Object.values(metadata).some(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
}

function cleanLayerMetadata(metadata: LayerMetadata) {
  const entries: Array<[string, string]> = [];

  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmedValue = value.trim();

    if (trimmedValue) {
      entries.push([key, trimmedValue]);
    }
  }

  return Object.fromEntries(entries) as LayerMetadata;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

function parseOptionalInteger(value: string) {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function parseOptionalNumber(value: string) {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getKindIcon(kind?: EditableLayer["kind"]) {
  switch (kind) {
    case "vector":
      return <Layers className="size-5 text-sky-600" />;
    case "wms":
      return <Globe className="size-5 text-emerald-600" />;
    case "wfs":
      return <Layers className="size-5 text-violet-600" />;
    case "xyz":
      return <Map className="size-5 text-orange-500" />;
    default:
      return <Layers className="size-5" />;
  }
}

export function LayerSheet({
  open,
  onOpenChange,
  layer,
  groups,
}: LayerSheetProps) {
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState("");
  const [defaultVisible, setDefaultVisible] = useState(false);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [metadataOwner, setMetadataOwner] = useState("");
  const [metadataCreatedDate, setMetadataCreatedDate] = useState("");
  const [metadataUpdateFrequency, setMetadataUpdateFrequency] = useState("");
  const [metadataVariableEncoding, setMetadataVariableEncoding] = useState("");
  const [metadataRecordDescription, setMetadataRecordDescription] =
    useState("");
  const [popupProps, setPopupProps] = useState<string[]>([]);
  const [accentColor, setAccentColor] = useState("");
  const [opacity, setOpacity] = useState("");
  const [minZoom, setMinZoom] = useState("");
  const [maxZoom, setMaxZoom] = useState("");
  const [popupTitleProp, setPopupTitleProp] = useState("");
  const [popupSubtitleProp, setPopupSubtitleProp] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [wmsLayersValue, setWmsLayersValue] = useState("");
  const [wmsVersion, setWmsVersion] = useState("");
  const [wmsFormat, setWmsFormat] = useState("");
  const [wmsTransparent, setWmsTransparent] = useState(true);
  const [xyzAttribution, setXyzAttribution] = useState("");
  const [wfsTypeName, setWfsTypeName] = useState("");
  const [wfsVersion, setWfsVersion] = useState("2.0.0");
  const [wfsOutputFormat, setWfsOutputFormat] = useState("application/json");
  const [wfsSrsName, setWfsSrsName] = useState("EPSG:4326");
  const [wfsPageSize, setWfsPageSize] = useState("");
  const [wfsMaxFeatures, setWfsMaxFeatures] = useState("");
  const [wfsAxisOrder, setWfsAxisOrder] = useState<WfsAxisOrder>("auto");
  const [newPropValue, setNewPropValue] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    if (!layer?.config) {
      return;
    }

    const config = layer.config;

    setName(layer.name ?? "");
    setGroupId(layer.groupId ?? "");
    setDefaultVisible(layer.defaultVisible ?? false);
    setMetadataOpen(hasLayerMetadata(config.metadata));
    setMetadataOwner(config.metadata?.owner ?? "");
    setMetadataCreatedDate(config.metadata?.createdDate ?? "");
    setMetadataUpdateFrequency(config.metadata?.updateFrequency ?? "");
    setMetadataVariableEncoding(config.metadata?.variableEncoding ?? "");
    setMetadataRecordDescription(config.metadata?.recordDescription ?? "");
    setPopupProps(
      isFeatureLayerConfig(config) ? [...(config.popupProps ?? [])] : [],
    );
    setAccentColor(
      isFeatureLayerConfig(config)
        ? (config.style?.color ?? config.legend?.color ?? "")
        : (config.legend?.color ?? ""),
    );
    setOpacity(
      config.opacity === undefined || config.opacity === null
        ? ""
        : String(config.opacity),
    );
    setMinZoom(
      config.minZoom === undefined || config.minZoom === null
        ? ""
        : String(config.minZoom),
    );
    setMaxZoom(
      config.maxZoom === undefined || config.maxZoom === null
        ? ""
        : String(config.maxZoom),
    );
    setPopupTitleProp(
      isFeatureLayerConfig(config) ? (config.popup?.titleProp ?? "") : "",
    );
    setPopupSubtitleProp(
      isFeatureLayerConfig(config) ? (config.popup?.subtitleProp ?? "") : "",
    );
    setSourceUrl("url" in config ? (config.url ?? "") : "");
    setWmsLayersValue(config.type === "wms" ? (config.layers ?? "") : "");
    setWmsVersion(config.type === "wms" ? (config.version ?? "1.3.0") : "");
    setWmsFormat(config.type === "wms" ? (config.format ?? "image/png") : "");
    setWmsTransparent(
      config.type === "wms" ? (config.transparent ?? true) : true,
    );
    setXyzAttribution(config.type === "xyz" ? (config.attribution ?? "") : "");
    setWfsTypeName(config.type === "wfs" ? (config.typeName ?? "") : "");
    setWfsVersion(
      config.type === "wfs" ? (config.version ?? "2.0.0") : "2.0.0",
    );
    setWfsOutputFormat(
      config.type === "wfs"
        ? (config.outputFormat ?? "application/json")
        : "application/json",
    );
    setWfsSrsName(
      config.type === "wfs" ? (config.srsName ?? "EPSG:4326") : "EPSG:4326",
    );
    setWfsPageSize(
      config.type === "wfs" && config.pageSize ? String(config.pageSize) : "",
    );
    setWfsMaxFeatures(
      config.type === "wfs" && config.maxFeatures
        ? String(config.maxFeatures)
        : "",
    );
    setWfsAxisOrder(
      config.type === "wfs" ? (config.axisOrder ?? "auto") : "auto",
    );
  }, [layer]);

  const updateMutation = useMutation({
    mutationFn: async (data: LayerUpdatePayload) => {
      return fetchJson<EditableLayer>("/api/admin/layers", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast.success("Capa actualizada");
      void queryClient.invalidateQueries({ queryKey: ["admin", "layers"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "activity"] });
      void queryClient.invalidateQueries({ queryKey: qk.catalog });
      onOpenChange(false);
    },
    onError: (err: unknown) =>
      toast.error(getErrorMessage(err, "Error al actualizar")),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return fetchJson(`/api/admin/layers?id=${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      toast.success("Capa eliminada");
      void queryClient.invalidateQueries({ queryKey: ["admin", "layers"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "activity"] });
      void queryClient.invalidateQueries({ queryKey: qk.catalog });
      onOpenChange(false);
    },
    onError: (err: unknown) =>
      toast.error(getErrorMessage(err, "Error al eliminar")),
  });

  const handleSave = () => {
    if (!layer?.config) return;

    const config = structuredClone(layer.config);
    const nextOpacity = parseOptionalNumber(opacity);
    const nextMinZoom = parseOptionalInteger(minZoom);
    const nextMaxZoom = parseOptionalInteger(maxZoom);
    const nextMetadata = cleanLayerMetadata({
      owner: metadataOwner,
      createdDate: metadataCreatedDate,
      updateFrequency: metadataUpdateFrequency,
      variableEncoding: metadataVariableEncoding,
      recordDescription: metadataRecordDescription,
    });

    if (
      nextMinZoom !== undefined &&
      nextMaxZoom !== undefined &&
      nextMinZoom > nextMaxZoom
    ) {
      toast.error("El zoom mínimo no puede ser mayor que el máximo.");
      return;
    }

    if (nextOpacity === undefined) {
      delete config.opacity;
    } else {
      config.opacity = nextOpacity;
    }

    if (nextMinZoom === undefined) {
      delete config.minZoom;
    } else {
      config.minZoom = nextMinZoom;
    }

    if (nextMaxZoom === undefined) {
      delete config.maxZoom;
    } else {
      config.maxZoom = nextMaxZoom;
    }

    if (Object.keys(nextMetadata).length > 0) {
      config.metadata = nextMetadata;
    } else {
      delete config.metadata;
    }

    if (isFeatureLayerConfig(config)) {
      const cleanedPopupProps = Array.from(
        new Set(popupProps.map((value) => value.trim()).filter(Boolean)),
      );
      const nextStyle = { ...(config.style ?? {}) };
      const nextPopup = { ...(config.popup ?? {}) };
      const nextLegend = { ...(config.legend ?? {}) };

      if (cleanedPopupProps.length > 0) {
        config.popupProps = cleanedPopupProps;
      } else {
        delete config.popupProps;
      }

      if (accentColor.trim()) {
        nextStyle.color = accentColor.trim();
        nextLegend.color = accentColor.trim();
      } else {
        delete nextStyle.color;
        delete nextLegend.color;
      }

      if (popupTitleProp.trim()) {
        nextPopup.titleProp = popupTitleProp.trim();
      } else {
        delete nextPopup.titleProp;
      }

      if (popupSubtitleProp.trim()) {
        nextPopup.subtitleProp = popupSubtitleProp.trim();
      } else {
        delete nextPopup.subtitleProp;
      }

      if (Object.keys(nextStyle).length > 0) {
        config.style = nextStyle;
      } else {
        delete config.style;
      }

      if (Object.keys(nextPopup).length > 0) {
        config.popup = nextPopup;
      } else {
        delete config.popup;
      }

      if (Object.keys(nextLegend).length > 0) {
        config.legend = nextLegend;
      } else {
        delete config.legend;
      }
    }

    if (config.type === "wms") {
      if (!sourceUrl.trim() || !wmsLayersValue.trim()) {
        toast.error("La URL y las capas WMS son obligatorias.");
        return;
      }

      config.url = sourceUrl.trim();
      config.layers = wmsLayersValue.trim();
      config.version = wmsVersion.trim() || "1.3.0";
      config.format = wmsFormat.trim() || "image/png";
      config.transparent = wmsTransparent;
    }

    if (config.type === "xyz") {
      if (!sourceUrl.trim()) {
        toast.error("La URL XYZ es obligatoria.");
        return;
      }

      config.url = sourceUrl.trim();

      if (xyzAttribution.trim()) {
        config.attribution = xyzAttribution.trim();
      } else {
        delete config.attribution;
      }
    }

    if (config.type === "wfs") {
      const nextPageSize = parseOptionalInteger(wfsPageSize);
      const nextMaxFeatures = parseOptionalInteger(wfsMaxFeatures);

      if (!sourceUrl.trim() || !wfsTypeName.trim()) {
        toast.error("La URL y el nombre de capa WFS son obligatorios.");
        return;
      }

      if (wfsPageSize.trim() && nextPageSize === undefined) {
        toast.error("El tamaño de página WFS debe ser un entero positivo.");
        return;
      }

      if (wfsMaxFeatures.trim() && nextMaxFeatures === undefined) {
        toast.error("El máximo de entidades WFS debe ser un entero positivo.");
        return;
      }

      config.url = sourceUrl.trim();
      config.typeName = wfsTypeName.trim();
      config.version = wfsVersion.trim() || "2.0.0";
      config.outputFormat = wfsOutputFormat.trim() || "application/json";
      config.srsName = wfsSrsName.trim() || "EPSG:4326";
      config.axisOrder = wfsAxisOrder;

      if (nextPageSize === undefined) {
        delete config.pageSize;
      } else {
        config.pageSize = nextPageSize;
      }

      if (nextMaxFeatures === undefined) {
        delete config.maxFeatures;
      } else {
        config.maxFeatures = nextMaxFeatures;
      }
    }

    updateMutation.mutate({
      id: layer.id,
      name,
      groupId,
      defaultVisible,
      config,
    });
  };

  const handleDelete = () => {
    if (!layer) return;
    deleteMutation.mutate(layer.id);
  };

  const addPopupProp = () => {
    const trimmed = newPropValue.trim();
    if (trimmed && !popupProps.includes(trimmed)) {
      setPopupProps([...popupProps, trimmed]);
      setNewPropValue("");
    }
  };

  const removePopupProp = (index: number) => {
    setPopupProps(popupProps.filter((_, i) => i !== index));
  };

  const updatePopupProp = (index: number, value: string) => {
    const nextProps = [...popupProps];
    nextProps[index] = value;
    setPopupProps(nextProps);
  };

  if (!layer?.kind || !layer.config) return null;

  const isFeatureLayer = layer.kind === "vector" || layer.kind === "wfs";

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b px-4 py-3">
            <div className="flex items-center gap-2">
              {getKindIcon(layer.kind)}
              <SheetTitle className="text-base">Editar Capa</SheetTitle>
              <Badge variant="outline" className="ml-auto text-xs">
                {layer.kind}
              </Badge>
            </div>
            <SheetDescription className="font-mono text-xs">
              {layer.id}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-sm">
                Nombre
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Nombre de la capa"
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Grupo</Label>
              <SheetSelect
                value={groupId}
                onValueChange={setGroupId}
                placeholder="Seleccionar grupo"
              >
                {groups.map((group) => (
                  <SheetSelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SheetSelectItem>
                ))}
              </SheetSelect>
            </div>

            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <Label htmlFor="visible" className="text-sm">
                  Visible por defecto
                </Label>
                <p className="text-muted-foreground text-xs">
                  Se mostrará al cargar el mapa.
                </p>
              </div>
              <Switch
                id="visible"
                checked={defaultVisible}
                onCheckedChange={setDefaultVisible}
              />
            </div>

            <Separator />

            <div className="space-y-3">
              <div>
                <Label className="text-sm">Visualización</Label>
                <p className="text-muted-foreground text-xs">
                  Ajustes del visor que no cambian la fuente de datos.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {isFeatureLayer && (
                  <div className="space-y-1.5">
                    <Label htmlFor="accent-color" className="text-sm">
                      Color base
                    </Label>
                    <Input
                      id="accent-color"
                      value={accentColor}
                      onChange={(event) => setAccentColor(event.target.value)}
                      placeholder="#1462cc"
                      className="h-9"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="opacity" className="text-sm">
                    Opacidad
                  </Label>
                  <Input
                    id="opacity"
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={opacity}
                    onChange={(event) => setOpacity(event.target.value)}
                    placeholder="1"
                    className="h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="min-zoom" className="text-sm">
                    Zoom mínimo
                  </Label>
                  <Input
                    id="min-zoom"
                    type="number"
                    min="0"
                    max="22"
                    step="1"
                    value={minZoom}
                    onChange={(event) => setMinZoom(event.target.value)}
                    placeholder="Sin límite"
                    className="h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="max-zoom" className="text-sm">
                    Zoom máximo
                  </Label>
                  <Input
                    id="max-zoom"
                    type="number"
                    min="0"
                    max="22"
                    step="1"
                    value={maxZoom}
                    onChange={(event) => setMaxZoom(event.target.value)}
                    placeholder="Sin límite"
                    className="h-9"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {layer.config.type === "wms" && (
              <>
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm">Fuente WMS</Label>
                    <p className="text-muted-foreground text-xs">
                      Configura el servicio remoto y la capa publicada.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="wms-url" className="text-sm">
                      URL
                    </Label>
                    <Input
                      id="wms-url"
                      value={sourceUrl}
                      onChange={(event) => setSourceUrl(event.target.value)}
                      placeholder="https://servidor/geoserver/wms"
                      className="h-9"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="wms-layers" className="text-sm">
                      Capas
                    </Label>
                    <Input
                      id="wms-layers"
                      value={wmsLayersValue}
                      onChange={(event) =>
                        setWmsLayersValue(event.target.value)
                      }
                      placeholder="workspace:capa"
                      className="h-9"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="wms-version" className="text-sm">
                        Versión
                      </Label>
                      <Input
                        id="wms-version"
                        value={wmsVersion}
                        onChange={(event) => setWmsVersion(event.target.value)}
                        placeholder="1.3.0"
                        className="h-9"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="wms-format" className="text-sm">
                        Formato
                      </Label>
                      <Input
                        id="wms-format"
                        value={wmsFormat}
                        onChange={(event) => setWmsFormat(event.target.value)}
                        placeholder="image/png"
                        className="h-9"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-md border px-3 py-2">
                    <div>
                      <Label htmlFor="wms-transparent" className="text-sm">
                        Fondo transparente
                      </Label>
                      <p className="text-muted-foreground text-xs">
                        Recomendado para superponer el servicio sobre el mapa
                        base.
                      </p>
                    </div>
                    <Switch
                      id="wms-transparent"
                      checked={wmsTransparent}
                      onCheckedChange={setWmsTransparent}
                    />
                  </div>
                </div>
                <Separator />
              </>
            )}

            {layer.config.type === "wfs" && (
              <>
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm">Fuente WFS</Label>
                    <p className="text-muted-foreground text-xs">
                      El visor consulta el servicio vía backend y dibuja las
                      entidades como capa vectorial.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="wfs-url" className="text-sm">
                      URL
                    </Label>
                    <Input
                      id="wfs-url"
                      value={sourceUrl}
                      onChange={(event) => setSourceUrl(event.target.value)}
                      placeholder="https://servidor/geoserver/wfs"
                      className="h-9"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="wfs-type-name" className="text-sm">
                      Nombre de capa
                    </Label>
                    <Input
                      id="wfs-type-name"
                      value={wfsTypeName}
                      onChange={(event) => setWfsTypeName(event.target.value)}
                      placeholder="workspace:capa"
                      className="h-9"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm">Versión</Label>
                      <SheetSelect
                        value={wfsVersion}
                        onValueChange={setWfsVersion}
                        placeholder="Versión"
                      >
                        {WFS_VERSION_OPTIONS.map((option) => (
                          <SheetSelectItem key={option} value={option}>
                            {option}
                          </SheetSelectItem>
                        ))}
                      </SheetSelect>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-sm">Orden de ejes</Label>
                      <SheetSelect
                        value={wfsAxisOrder}
                        onValueChange={(value) =>
                          setWfsAxisOrder(value as WfsAxisOrder)
                        }
                        placeholder="Orden"
                      >
                        {WFS_AXIS_ORDER_OPTIONS.map((option) => (
                          <SheetSelectItem
                            key={option.value}
                            value={option.value}
                          >
                            {option.label}
                          </SheetSelectItem>
                        ))}
                      </SheetSelect>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="wfs-output-format" className="text-sm">
                        Output format
                      </Label>
                      <Input
                        id="wfs-output-format"
                        value={wfsOutputFormat}
                        onChange={(event) =>
                          setWfsOutputFormat(event.target.value)
                        }
                        placeholder="application/json"
                        className="h-9"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="wfs-srs-name" className="text-sm">
                        SRS
                      </Label>
                      <Input
                        id="wfs-srs-name"
                        value={wfsSrsName}
                        onChange={(event) => setWfsSrsName(event.target.value)}
                        placeholder="EPSG:4326"
                        className="h-9"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="wfs-page-size" className="text-sm">
                        Tamaño de página
                      </Label>
                      <Input
                        id="wfs-page-size"
                        type="number"
                        min="1"
                        step="1"
                        value={wfsPageSize}
                        onChange={(event) => setWfsPageSize(event.target.value)}
                        placeholder="1000"
                        className="h-9"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="wfs-max-features" className="text-sm">
                        Máximo de entidades
                      </Label>
                      <Input
                        id="wfs-max-features"
                        type="number"
                        min="1"
                        step="1"
                        value={wfsMaxFeatures}
                        onChange={(event) =>
                          setWfsMaxFeatures(event.target.value)
                        }
                        placeholder="5000"
                        className="h-9"
                      />
                    </div>
                  </div>

                  <p className="text-muted-foreground text-xs">
                    Si el servidor sigue el estándar WFS 1.1.0 con `EPSG:4326`,
                    usa orden de ejes automático o `Lat, Lon`.
                  </p>
                </div>
                <Separator />
              </>
            )}

            {layer.config.type === "xyz" && (
              <>
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm">Fuente XYZ</Label>
                    <p className="text-muted-foreground text-xs">
                      Define la plantilla de tiles y la atribución pública del
                      proveedor.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="xyz-url" className="text-sm">
                      URL
                    </Label>
                    <Input
                      id="xyz-url"
                      value={sourceUrl}
                      onChange={(event) => setSourceUrl(event.target.value)}
                      placeholder="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      className="h-9"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="xyz-attribution" className="text-sm">
                      Atribución
                    </Label>
                    <Textarea
                      id="xyz-attribution"
                      value={xyzAttribution}
                      onChange={(event) =>
                        setXyzAttribution(event.target.value)
                      }
                      placeholder="© OpenStreetMap contributors"
                      className="min-h-20"
                    />
                  </div>
                </div>
                <Separator />
              </>
            )}

            <Collapsible
              open={metadataOpen}
              onOpenChange={setMetadataOpen}
              className="space-y-3"
            >
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between"
                >
                  <span>Metadatos de la capa</span>
                  <ChevronDownIcon
                    className={cn(
                      "size-4 transition-transform",
                      metadataOpen && "rotate-180",
                    )}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 rounded-md border p-3">
                <div className="space-y-1.5">
                  <Label htmlFor="metadata-owner" className="text-sm">
                    Autor/Propietario
                  </Label>
                  <Input
                    id="metadata-owner"
                    value={metadataOwner}
                    onChange={(event) => setMetadataOwner(event.target.value)}
                    placeholder="Dirección, organismo o equipo responsable"
                    className="h-9"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="metadata-created-date" className="text-sm">
                      Fecha de creación
                    </Label>
                    <Input
                      id="metadata-created-date"
                      type="date"
                      value={metadataCreatedDate}
                      onChange={(event) =>
                        setMetadataCreatedDate(event.target.value)
                      }
                      className="h-9"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="metadata-update-frequency"
                      className="text-sm"
                    >
                      Frecuencia de actualización
                    </Label>
                    <Input
                      id="metadata-update-frequency"
                      value={metadataUpdateFrequency}
                      onChange={(event) =>
                        setMetadataUpdateFrequency(event.target.value)
                      }
                      placeholder="Mensual, anual, eventual"
                      className="h-9"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="metadata-variable-encoding"
                    className="text-sm"
                  >
                    Codificación de variables
                  </Label>
                  <Textarea
                    id="metadata-variable-encoding"
                    value={metadataVariableEncoding}
                    onChange={(event) =>
                      setMetadataVariableEncoding(event.target.value)
                    }
                    placeholder="Ej. cod_indec: código censal; dpto: departamento"
                    className="min-h-20"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="metadata-record-description"
                    className="text-sm"
                  >
                    Descripción general de los registros
                  </Label>
                  <Textarea
                    id="metadata-record-description"
                    value={metadataRecordDescription}
                    onChange={(event) =>
                      setMetadataRecordDescription(event.target.value)
                    }
                    placeholder="Resumen del contenido y alcance de la capa"
                    className="min-h-20"
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>

            <Separator />

            {isFeatureLayer && (
              <div className="space-y-3">
                <div>
                  <Label className="text-sm">Propiedades del popup</Label>
                  <p className="text-muted-foreground text-xs">
                    Campos que se mostrarán al hacer clic sobre la entidad.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="popup-title" className="text-sm">
                      Campo título
                    </Label>
                    <Input
                      id="popup-title"
                      value={popupTitleProp}
                      onChange={(event) =>
                        setPopupTitleProp(event.target.value)
                      }
                      placeholder="ej. nombre"
                      className="h-9"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="popup-subtitle" className="text-sm">
                      Campo subtítulo
                    </Label>
                    <Input
                      id="popup-subtitle"
                      value={popupSubtitleProp}
                      onChange={(event) =>
                        setPopupSubtitleProp(event.target.value)
                      }
                      placeholder="ej. dpto"
                      className="h-9"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  {popupProps.map((prop, index) => (
                    <div
                      key={`${prop}-${index}`}
                      className="flex items-center gap-2"
                    >
                      <Input
                        value={prop}
                        onChange={(event) =>
                          updatePopupProp(index, event.target.value)
                        }
                        className="h-8 flex-1 text-sm"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive size-8"
                        onClick={() => removePopupProp(index)}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  ))}

                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Agregar propiedad..."
                      value={newPropValue}
                      onChange={(event) => setNewPropValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addPopupProp();
                        }
                      }}
                      className="h-8 flex-1 text-sm"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-8"
                      onClick={addPopupProp}
                      disabled={!newPropValue.trim()}
                    >
                      <Plus className="size-4" />
                    </Button>
                  </div>
                </div>

                {popupProps.length === 0 && (
                  <p className="text-muted-foreground text-xs italic">
                    Sin propiedades configuradas.
                  </p>
                )}

                <Separator />
              </div>
            )}
          </div>

          <div className="bg-muted/30 flex items-center gap-2 border-t px-4 py-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="size-4" />
            </Button>

            <div className="flex-1" />

            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Guardar
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar capa?</AlertDialogTitle>
            <AlertDialogDescription>
              {`Se eliminará permanentemente "${layer.name}". Esta acción no se puede deshacer.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
