"use client"

import { useState, useEffect } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchJson, qk } from "~/lib/api"
import { toast } from "sonner"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "~/components/ui/sheet"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Switch } from "~/components/ui/switch"
import { Badge } from "~/components/ui/badge"
import { Separator } from "~/components/ui/separator"
import * as SelectPrimitive from "@radix-ui/react-select"
import { CheckIcon, ChevronDownIcon } from "lucide-react"
import { cn } from "~/lib/utils"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog"
import { Loader2, Trash2, Plus, X, Layers, Globe, Map } from "lucide-react"

interface LayerSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  layer: any | null
  groups: any[]
}

// Custom Select that renders portal at higher z-index for Sheet
function SheetSelect({
  value,
  onValueChange,
  placeholder,
  children,
}: {
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  children: React.ReactNode
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50"
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
            "relative z-[1002] max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2"
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
  )
}

function SheetSelectItem({
  value,
  children,
}: {
  value: string
  children: React.ReactNode
}) {
  return (
    <SelectPrimitive.Item
      value={value}
      className={cn(
        "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none",
        "focus:bg-accent focus:text-accent-foreground",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
      )}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  )
}

export function LayerSheet({ open, onOpenChange, layer, groups }: LayerSheetProps) {
  const queryClient = useQueryClient()
  
  const [name, setName] = useState("")
  const [groupId, setGroupId] = useState("")
  const [defaultVisible, setDefaultVisible] = useState(false)
  const [popupProps, setPopupProps] = useState<string[]>([])
  const [newPropValue, setNewPropValue] = useState("")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  useEffect(() => {
    if (layer) {
      setName(layer.name ?? "")
      setGroupId(layer.groupId ?? "")
      setDefaultVisible(layer.defaultVisible ?? false)
      setPopupProps(layer.config?.popupProps ?? [])
    }
  }, [layer])

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      return fetchJson("/api/admin/layers", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      })
    },
    onSuccess: () => {
      toast.success("Capa actualizada")
      queryClient.invalidateQueries({ queryKey: ["admin", "layers"] })
      queryClient.invalidateQueries({ queryKey: ["admin", "activity"] })
      queryClient.invalidateQueries({ queryKey: qk.catalog })
      onOpenChange(false)
    },
    onError: (err: any) => toast.error(err.message || "Error al actualizar"),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return fetchJson(`/api/admin/layers?id=${id}`, {
        method: "DELETE",
      })
    },
    onSuccess: () => {
      toast.success("Capa eliminada")
      queryClient.invalidateQueries({ queryKey: ["admin", "layers"] })
      queryClient.invalidateQueries({ queryKey: ["admin", "activity"] })
      queryClient.invalidateQueries({ queryKey: qk.catalog })
      onOpenChange(false)
    },
    onError: (err: any) => toast.error(err.message || "Error al eliminar"),
  })

  const handleSave = () => {
    if (!layer) return

    const config = { ...layer.config }
    if (config.type === "vector") {
      config.popupProps = popupProps
    }

    updateMutation.mutate({
      id: layer.id,
      name,
      groupId,
      defaultVisible,
      config,
    })
  }

  const handleDelete = () => {
    if (!layer) return
    deleteMutation.mutate(layer.id)
  }

  const addPopupProp = () => {
    const trimmed = newPropValue.trim()
    if (trimmed && !popupProps.includes(trimmed)) {
      setPopupProps([...popupProps, trimmed])
      setNewPropValue("")
    }
  }

  const removePopupProp = (index: number) => {
    setPopupProps(popupProps.filter((_, i) => i !== index))
  }

  const updatePopupProp = (index: number, value: string) => {
    const newProps = [...popupProps]
    newProps[index] = value
    setPopupProps(newProps)
  }

  const getKindIcon = () => {
    switch (layer?.kind) {
      case "vector":
        return <Layers className="size-5 text-blue-500" />
      case "wms":
        return <Globe className="size-5 text-green-500" />
      case "xyz":
        return <Map className="size-5 text-orange-500" />
      default:
        return <Layers className="size-5" />
    }
  }

  if (!layer) return null

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            {getKindIcon()}
            <SheetTitle className="text-base">Editar Capa</SheetTitle>
            <Badge variant="outline" className="ml-auto text-xs">
              {layer.kind}
            </Badge>
          </div>
          <SheetDescription className="text-xs font-mono">
            {layer.id}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Basic Info */}
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-sm">Nombre</Label>
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

          <div className="flex items-center justify-between py-2 px-3 rounded-md border">
            <div>
              <Label htmlFor="visible" className="text-sm">Visible por defecto</Label>
              <p className="text-xs text-muted-foreground">
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

          {/* Popup Props (vector only) */}
          {layer.kind === "vector" && (
            <div className="space-y-3">
              <div>
                <Label className="text-sm">Propiedades del Popup</Label>
                <p className="text-xs text-muted-foreground">
                  Campos visibles al hacer clic en el mapa
                </p>
              </div>

              <div className="space-y-2">
                {popupProps.map((prop, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={prop}
                      onChange={(e) => updatePopupProp(index, e.target.value)}
                      className="flex-1 h-8 text-sm"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
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
                        e.preventDefault()
                        addPopupProp()
                      }
                    }}
                    className="flex-1 h-8 text-sm"
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
                <p className="text-xs text-muted-foreground italic">
                  Sin propiedades configuradas.
                </p>
              )}

              <Separator />
            </div>
          )}

          {/* Config Info (read-only) */}
          <div className="space-y-2">
            <Label className="text-sm">Configuración Técnica</Label>
            <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1.5">
              {layer.kind === "vector" && (
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
                    <span className="font-mono">{layer.config?.geomColumn}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">SRID:</span>
                    <span className="font-mono">{layer.config?.srid}</span>
                  </div>
                </>
              )}
              {(layer.kind === "wms" || layer.kind === "xyz") && (
                <>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground flex-shrink-0">URL:</span>
                    <span className="font-mono truncate">{layer.config?.url}</span>
                  </div>
                  {layer.kind === "wms" && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Capas:</span>
                      <span className="font-mono">{layer.config?.layers}</span>
                    </div>
                  )}
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Para modificar, reimporta la capa.
            </p>
          </div>
        </div>

        <div className="px-4 py-3 border-t bg-muted/30 flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="size-4" />
          </Button>

          <div className="flex-1" />
          
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
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
            Se eliminará permanentemente "{layer.name}". Esta acción no se puede deshacer.
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
  )
}
