"use client";

import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson, qk } from "~/lib/api";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "~/components/ui/sheet";
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
import { cn } from "~/lib/utils";
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
import type { LayerConfig, LayerMetadata } from "~/server/db/schema";

type AdminLayerGroup = {
  id: string;
  name: string;
};

type EditableLayer = {
  id: string;
  name: string;
  type?: "group" | "layer";
  kind?: "vector" | "wms" | "xyz";
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

// Custom Select that renders portal at higher z-index for Sheet
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
            "bg-popover text-popover-foreground relative z-[1002] max-h-96 min-w-[8rem] overflow-hidden rounded-md border shadow-md",
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
  const [newPropValue, setNewPropValue] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    if (layer) {
      const config = layer.config;

      setName(layer.name ?? "");
      setGroupId(layer.groupId ?? "");
      setDefaultVisible(layer.defaultVisible ?? false);
      setMetadataOpen(hasLayerMetadata(config?.metadata));
      setMetadataOwner(config?.metadata?.owner ?? "");
      setMetadataCreatedDate(config?.metadata?.createdDate ?? "");
      setMetadataUpdateFrequency(config?.metadata?.updateFrequency ?? "");
      setMetadataVariableEncoding(config?.metadata?.variableEncoding ?? "");
      setMetadataRecordDescription(config?.metadata?.recordDescription ?? "");
      setPopupProps(config?.type === "vector" ? (config.popupProps ?? []) : []);
      setAccentColor(
        config?.type === "vector"
          ? (config.style?.color ?? config.legend?.color ?? "")
          : (config?.legend?.color ?? ""),
      );
      setOpacity(
        config?.opacity === undefined || config.opacity === null
          ? ""
          : String(config.opacity),
      );
      setMinZoom(
        config?.minZoom === undefined || config.minZoom === null
          ? ""
          : String(config.minZoom),
      );
      setMaxZoom(
        config?.maxZoom === undefined || config.maxZoom === null
          ? ""
          : String(config.maxZoom),
      );
      setPopupTitleProp(
        config?.type === "vector" ? (config.popup?.titleProp ?? "") : "",
      );
      setPopupSubtitleProp(
        config?.type === "vector" ? (config.popup?.subtitleProp ?? "") : "",
      );
    }
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

    const parseOptionalNumber = (value: string) => {
      if (!value.trim()) {
        return undefined;
      }

      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    const config = { ...layer.config };
    const nextOpacity = parseOptionalNumber(opacity);
    const nextMinZoom = parseOptionalNumber(minZoom);
    const nextMaxZoom = parseOptionalNumber(maxZoom);
    const nextMetadata = cleanLayerMetadata({
      owner: metadataOwner,
      createdDate: metadataCreatedDate,
      updateFrequency: metadataUpdateFrequency,
      variableEncoding: metadataVariableEncoding,
      recordDescription: metadataRecordDescription,
    });

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

    if (config.type === "vector") {
      config.popupProps = popupProps;

      const nextStyle = { ...(config.style ?? {}) };
      const nextPopup = { ...(config.popup ?? {}) };
      const nextLegend = { ...(config.legend ?? {}) };

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
    const newProps = [...popupProps];
    newProps[index] = value;
    setPopupProps(newProps);
  };

  const getKindIcon = () => {
    switch (layer?.kind) {
      case "vector":
        return <Layers className="size-5 text-blue-500" />;
      case "wms":
        return <Globe className="size-5 text-green-500" />;
      case "xyz":
        return <Map className="size-5 text-orange-500" />;
      default:
        return <Layers className="size-5" />;
    }
  };

  if (!layer?.kind || !layer.config) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b px-4 py-3">
            <div className="flex items-center gap-2">
              {getKindIcon()}
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
            {/* Basic Info */}
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-sm">
                Nombre
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
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
                {groups.map((g) => (
                  <SheetSelectItem key={g.id} value={g.id}>
                    {g.name}
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
                  Se mostrará al cargar el mapa
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
                  Ajustes seguros que impactan el visor sin tocar la fuente de
                  datos.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {layer.kind === "vector" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="accent-color" className="text-sm">
                      Color base
                    </Label>
                    <Input
                      id="accent-color"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
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
                    onChange={(e) => setOpacity(e.target.value)}
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
                    onChange={(e) => setMinZoom(e.target.value)}
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
                    onChange={(e) => setMaxZoom(e.target.value)}
                    placeholder="Sin límite"
                    className="h-9"
                  />
                </div>
              </div>
            </div>

            <Separator />

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
                    onChange={(e) => setMetadataOwner(e.target.value)}
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
                      onChange={(e) => setMetadataCreatedDate(e.target.value)}
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
                      onChange={(e) =>
                        setMetadataUpdateFrequency(e.target.value)
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
                    onChange={(e) =>
                      setMetadataVariableEncoding(e.target.value)
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
                    onChange={(e) =>
                      setMetadataRecordDescription(e.target.value)
                    }
                    placeholder="Resumen del contenido y alcance de la capa"
                    className="min-h-20"
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>

            <Separator />

            {/* Popup Props (vector only) */}
            {layer.kind === "vector" && (
              <div className="space-y-3">
                <div>
                  <Label className="text-sm">Propiedades del Popup</Label>
                  <p className="text-muted-foreground text-xs">
                    Campos visibles al hacer clic en el mapa
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
                      onChange={(e) => setPopupTitleProp(e.target.value)}
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
                      onChange={(e) => setPopupSubtitleProp(e.target.value)}
                      placeholder="ej. dpto"
                      className="h-9"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  {popupProps.map((prop, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={prop}
                        onChange={(e) => updatePopupProp(index, e.target.value)}
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
                      onChange={(e) => setNewPropValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
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

            {/* Config Info (read-only) */}
            <div className="space-y-2">
              <Label className="text-sm">Configuración Técnica</Label>
              <div className="bg-muted/30 space-y-1.5 rounded-md border p-3 text-xs">
                {layer.config.type === "vector" && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Esquema:</span>
                      <span className="font-mono">{layer.config?.schema}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tabla:</span>
                      <span className="font-mono">{layer.config?.table}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Geometría:</span>
                      <span className="font-mono">
                        {layer.config?.geomColumn}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">SRID:</span>
                      <span className="font-mono">{layer.config?.srid}</span>
                    </div>
                  </>
                )}
                {(layer.config.type === "wms" ||
                  layer.config.type === "xyz") && (
                  <>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground flex-shrink-0">
                        URL:
                      </span>
                      <span className="truncate font-mono">
                        {layer.config?.url}
                      </span>
                    </div>
                    {layer.config.type === "wms" && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Capas:</span>
                        <span className="font-mono">
                          {layer.config?.layers}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
              <p className="text-muted-foreground text-xs">
                Para modificar, reimporta la capa.
              </p>
            </div>
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
