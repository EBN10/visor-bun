"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, type Resolver } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { fetchJson, qk } from "~/lib/api";
import {
  LAYER_KIND_OPTIONS,
  sanitizeLayerIdentifier,
  WFS_AXIS_ORDER_OPTIONS,
  WFS_VERSION_OPTIONS,
} from "~/lib/layer-config";
import { Button } from "~/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { Textarea } from "~/components/ui/textarea";

const serviceLayerKinds = ["wms", "wfs", "xyz"] as const;

const optionalNumberField = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}, z.number().finite().optional());

const optionalIntegerField = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : value;
}, z.number().int().positive().optional());

const layerSchema = z
  .object({
    id: z.string().min(2, "El ID debe tener al menos 2 caracteres"),
    name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
    groupId: z.string().min(1, "El grupo es requerido"),
    kind: z.enum(serviceLayerKinds),
    defaultVisible: z.boolean().default(false),
    config: z
      .object({
        type: z.enum(serviceLayerKinds),
        opacity: optionalNumberField,
        minZoom: optionalIntegerField,
        maxZoom: optionalIntegerField,
        accentColor: z.string().optional(),
        url: z.string().optional(),
        layers: z.string().optional(),
        version: z.string().optional(),
        format: z.string().optional(),
        transparent: z.boolean().optional(),
        typeName: z.string().optional(),
        outputFormat: z.string().optional(),
        srsName: z.string().optional(),
        pageSize: optionalIntegerField,
        maxFeatures: optionalIntegerField,
        axisOrder: z.enum(["auto", "lonlat", "latlon"]).optional(),
        attribution: z.string().optional(),
      })
      .superRefine((data, ctx) => {
        if (
          data.minZoom !== undefined &&
          data.maxZoom !== undefined &&
          data.minZoom > data.maxZoom
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "El zoom mínimo no puede ser mayor que el máximo.",
            path: ["minZoom"],
          });
        }

        if (data.type === "wms") {
          if (!data.url?.trim()) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "La URL es requerida.",
              path: ["url"],
            });
          }

          if (!data.layers?.trim()) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Las capas WMS son requeridas.",
              path: ["layers"],
            });
          }
        }

        if (data.type === "wfs") {
          if (!data.url?.trim()) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "La URL es requerida.",
              path: ["url"],
            });
          }

          if (!data.typeName?.trim()) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "El nombre de capa WFS es requerido.",
              path: ["typeName"],
            });
          }
        }

        if (data.type === "xyz" && !data.url?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "La URL es requerida.",
            path: ["url"],
          });
        }
      }),
  })
  .superRefine((data, ctx) => {
    if (data.kind !== data.config.type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El tipo de configuración no coincide con la clase de capa.",
        path: ["config", "type"],
      });
    }
  });

type LayerFormValues = z.infer<typeof layerSchema>;

const defaultValues: LayerFormValues = {
  id: "",
  name: "",
  groupId: "",
  kind: "wms",
  defaultVisible: false,
  config: {
    type: "wms",
    accentColor: "",
    opacity: 1,
    url: "",
    layers: "",
    transparent: true,
    version: "1.3.0",
    format: "image/png",
    typeName: "",
    outputFormat: "application/json",
    srsName: "EPSG:4326",
    axisOrder: "auto",
    attribution: "",
  },
};

type LayerFormProps = {
  groups: Array<{ id: string; name: string }>;
  onSuccess?: () => void;
};

function getOptionalTrimmed(value?: string) {
  const trimmed = value?.trim();
  return trimmed === "" ? undefined : trimmed;
}

function buildLayerConfig(data: LayerFormValues) {
  const commonConfig = {
    ...(data.config.opacity !== undefined
      ? { opacity: data.config.opacity }
      : {}),
    ...(data.config.minZoom !== undefined
      ? { minZoom: data.config.minZoom }
      : {}),
    ...(data.config.maxZoom !== undefined
      ? { maxZoom: data.config.maxZoom }
      : {}),
  };

  if (data.kind === "wms") {
    const version = getOptionalTrimmed(data.config.version);
    const format = getOptionalTrimmed(data.config.format);

    return {
      ...commonConfig,
      type: "wms" as const,
      url: data.config.url?.trim() ?? "",
      layers: data.config.layers?.trim() ?? "",
      version: version ?? "1.3.0",
      format: format ?? "image/png",
      transparent: data.config.transparent ?? true,
    };
  }

  if (data.kind === "wfs") {
    const version =
      data.config.version &&
      WFS_VERSION_OPTIONS.includes(
        data.config.version as (typeof WFS_VERSION_OPTIONS)[number],
      )
        ? data.config.version
        : "2.0.0";
    const axisOrder = WFS_AXIS_ORDER_OPTIONS.some(
      (option) => option.value === data.config.axisOrder,
    )
      ? data.config.axisOrder
      : "auto";
    const outputFormat = getOptionalTrimmed(data.config.outputFormat);
    const srsName = getOptionalTrimmed(data.config.srsName);
    const accentColor = getOptionalTrimmed(data.config.accentColor);

    return {
      ...commonConfig,
      type: "wfs" as const,
      url: data.config.url?.trim() ?? "",
      typeName: data.config.typeName?.trim() ?? "",
      version,
      outputFormat: outputFormat ?? "application/json",
      srsName: srsName ?? "EPSG:4326",
      axisOrder,
      ...(accentColor
        ? {
            style: { color: accentColor },
            legend: { color: accentColor },
          }
        : {}),
      ...(data.config.pageSize ? { pageSize: data.config.pageSize } : {}),
      ...(data.config.maxFeatures
        ? { maxFeatures: data.config.maxFeatures }
        : {}),
    };
  }

  const attribution = data.config.attribution?.trim();

  return {
    ...commonConfig,
    type: "xyz" as const,
    url: data.config.url?.trim() ?? "",
    ...(attribution ? { attribution } : {}),
  };
}

export function LayerForm({ groups, onSuccess }: LayerFormProps) {
  const queryClient = useQueryClient();
  const form = useForm<LayerFormValues>({
    resolver: zodResolver(layerSchema) as Resolver<LayerFormValues>,
    defaultValues,
  });

  const kind = form.watch("kind");

  const createLayerMutation = useMutation({
    mutationFn: async (data: LayerFormValues) => {
      return fetchJson("/api/admin/layers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: sanitizeLayerIdentifier(data.id),
          name: data.name.trim(),
          groupId: data.groupId,
          kind: data.kind,
          defaultVisible: data.defaultVisible,
          config: buildLayerConfig(data),
        }),
      });
    },
    onSuccess: () => {
      toast.success("Capa creada exitosamente.");
      form.reset(defaultValues);
      void queryClient.invalidateQueries({ queryKey: ["admin", "layers"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "activity"] });
      void queryClient.invalidateQueries({ queryKey: qk.catalog });
      onSuccess?.();
    },
    onError: (error: unknown) => {
      toast.error(
        error instanceof Error ? error.message : "Error al crear la capa.",
      );
    },
  });

  function onSubmit(data: LayerFormValues) {
    createLayerMutation.mutate(data);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>ID (slug)</FormLabel>
                <FormControl>
                  <Input
                    placeholder="ej: radios-censales"
                    {...field}
                    onChange={(event) =>
                      field.onChange(
                        sanitizeLayerIdentifier(event.target.value),
                      )
                    }
                  />
                </FormControl>
                <FormDescription>
                  Solo minúsculas, números, guiones y guiones bajos.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre</FormLabel>
                <FormControl>
                  <Input placeholder="Nombre visible de la capa" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="groupId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Grupo</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar grupo" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {groups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="kind"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo</FormLabel>
                <Select
                  onValueChange={(value) => {
                    field.onChange(value);
                    form.setValue(
                      "config.type",
                      value as LayerFormValues["kind"],
                    );
                  }}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar tipo" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {LAYER_KIND_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <p className="text-muted-foreground text-sm">
          El orden inicial se asigna automáticamente. Luego puedes reubicar la
          capa con drag and drop desde el árbol del catálogo.
        </p>

        <FormField
          control={form.control}
          name="defaultVisible"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
              <div className="space-y-0.5">
                <FormLabel>Visible por defecto</FormLabel>
                <FormDescription>
                  Se cargará activa al abrir el mapa.
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <div className="space-y-4 rounded-lg border p-4">
          <div>
            <h4 className="font-medium">Visualización</h4>
            <p className="text-muted-foreground text-sm">
              Estos ajustes aplican a la capa sin modificar la fuente.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kind === "wfs" && (
              <FormField
                control={form.control}
                name="config.accentColor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color base</FormLabel>
                    <FormControl>
                      <Input
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        placeholder="#1462cc"
                      />
                    </FormControl>
                    <FormDescription>Ejemplo: `#1462cc`.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="config.opacity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Opacidad</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      max="1"
                      step="0.05"
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      placeholder="1"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="config.minZoom"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Zoom mínimo</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      max="22"
                      step="1"
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      placeholder="Opcional"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="config.maxZoom"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Zoom máximo</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      max="22"
                      step="1"
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      placeholder="Opcional"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {kind === "wms" && (
          <div className="space-y-4 rounded-lg border p-4">
            <div>
              <h4 className="font-medium">Servicio WMS</h4>
              <p className="text-muted-foreground text-sm">
                Configura la URL del endpoint y el nombre publicado de la capa.
              </p>
            </div>

            <FormField
              control={form.control}
              name="config.url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://servidor/geoserver/wms"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="config.layers"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Capas</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="workspace:capa"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormDescription>
                    Debe coincidir con el `Name` publicado por el servicio.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="config.version"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Versión</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="1.3.0"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="config.format"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Formato</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="image/png"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="config.transparent"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel>Fondo transparente</FormLabel>
                    <FormDescription>
                      Recomendado para superponerlo al mapa base.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value ?? true}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        )}

        {kind === "wfs" && (
          <div className="space-y-4 rounded-lg border p-4">
            <div>
              <h4 className="font-medium">Servicio WFS</h4>
              <p className="text-muted-foreground text-sm">
                El visor consultará el servicio desde backend y dibujará las
                entidades como capa vectorial.
              </p>
            </div>

            <FormField
              control={form.control}
              name="config.url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://servidor/geoserver/wfs"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="config.typeName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre de capa</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="workspace:capa"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormDescription>
                    Usa el nombre publicado por el servicio WFS.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="config.version"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Versión</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={
                        field.value &&
                        WFS_VERSION_OPTIONS.includes(
                          field.value as (typeof WFS_VERSION_OPTIONS)[number],
                        )
                          ? field.value
                          : "2.0.0"
                      }
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Versión" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {WFS_VERSION_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="config.axisOrder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Orden de ejes</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={
                        field.value &&
                        WFS_AXIS_ORDER_OPTIONS.some(
                          (option) => option.value === field.value,
                        )
                          ? field.value
                          : "auto"
                      }
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Orden" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {WFS_AXIS_ORDER_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="config.outputFormat"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Output format</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="application/json"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="config.srsName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SRS</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="EPSG:4326"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="config.pageSize"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tamaño de página</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        placeholder="1000"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="config.maxFeatures"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Máximo de entidades</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        placeholder="5000"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <p className="text-muted-foreground text-sm">
              Si el servidor usa WFS 1.1.0 con `EPSG:4326`, el modo automático
              suele ser la mejor opción.
            </p>
          </div>
        )}

        {kind === "xyz" && (
          <div className="space-y-4 rounded-lg border p-4">
            <div>
              <h4 className="font-medium">Servicio XYZ</h4>
              <p className="text-muted-foreground text-sm">
                Define la plantilla de tiles y la atribución del proveedor.
              </p>
            </div>

            <FormField
              control={form.control}
              name="config.url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="config.attribution"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Atribución</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="© OpenStreetMap contributors"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        <Button
          type="submit"
          disabled={createLayerMutation.isPending}
          className="w-full"
        >
          {createLayerMutation.isPending ? "Creando..." : "Crear capa"}
        </Button>
      </form>
    </Form>
  );
}
