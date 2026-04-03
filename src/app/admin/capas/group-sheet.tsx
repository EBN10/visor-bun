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
import { Loader2, Trash2, Folder } from "lucide-react"

interface GroupSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: any | null
  groups: any[]
  isNew: boolean
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

export function GroupSheet({ open, onOpenChange, group, groups, isNew }: GroupSheetProps) {
  const queryClient = useQueryClient()

  const [id, setId] = useState("")
  const [name, setName] = useState("")
  const [parentId, setParentId] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  useEffect(() => {
    if (group && !isNew) {
      setId(group.id ?? "")
      setName(group.name ?? "")
      setParentId(group.parentId ?? null)
    } else if (isNew) {
      setId("")
      setName("")
      setParentId(null)
    }
  }, [group, isNew])

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return fetchJson("/api/admin/layer-groups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      })
    },
    onSuccess: () => {
      toast.success("Grupo creado")
      queryClient.invalidateQueries({ queryKey: ["admin", "layer-groups"] })
      queryClient.invalidateQueries({ queryKey: ["admin", "activity"] })
      queryClient.invalidateQueries({ queryKey: qk.catalog })
      onOpenChange(false)
    },
    onError: (err: any) => toast.error(err.message || "Error al crear"),
  })

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      return fetchJson("/api/admin/layer-groups", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      })
    },
    onSuccess: () => {
      toast.success("Grupo actualizado")
      queryClient.invalidateQueries({ queryKey: ["admin", "layer-groups"] })
      queryClient.invalidateQueries({ queryKey: ["admin", "activity"] })
      queryClient.invalidateQueries({ queryKey: qk.catalog })
      onOpenChange(false)
    },
    onError: (err: any) => toast.error(err.message || "Error al actualizar"),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return fetchJson(`/api/admin/layer-groups?id=${id}`, {
        method: "DELETE",
      })
    },
    onSuccess: () => {
      toast.success("Grupo eliminado")
      queryClient.invalidateQueries({ queryKey: ["admin", "layer-groups"] })
      queryClient.invalidateQueries({ queryKey: ["admin", "layers"] })
      queryClient.invalidateQueries({ queryKey: ["admin", "activity"] })
      queryClient.invalidateQueries({ queryKey: qk.catalog })
      onOpenChange(false)
    },
    onError: (err: any) => toast.error(err.message || "Error al eliminar"),
  })

  const handleSave = () => {
    if (isNew) {
      if (!id.trim() || !name.trim()) {
        toast.error("El ID y nombre son requeridos")
        return
      }
      createMutation.mutate({
        id: id.trim(),
        name: name.trim(),
        parentId,
      })
    } else {
      if (!group) return
      updateMutation.mutate({
        id: group.id,
        name: name.trim(),
        parentId,
      })
    }
  }

  const handleDelete = () => {
    if (!group) return
    deleteMutation.mutate(group.id)
  }

  const availableParents = groups.filter((g) => {
    if (!group) return true
    if (g.id === group.id) return false
    let current = g
    while (current.parentId) {
      if (current.parentId === group.id) return false
      current = groups.find((gr) => gr.id === current.parentId)
      if (!current) break
    }
    return true
  })

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Folder className="size-5 text-amber-500" />
            <SheetTitle className="text-base">
              {isNew ? "Nuevo Grupo" : "Editar Grupo"}
            </SheetTitle>
          </div>
          {!isNew && group && (
            <SheetDescription className="text-xs font-mono">
              {group.id}
            </SheetDescription>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {isNew && (
            <div className="space-y-1.5">
              <Label htmlFor="group-id" className="text-sm">ID (Slug)</Label>
              <Input
                id="group-id"
                value={id}
                onChange={(e) => setId(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                placeholder="ej: censo-2022"
                className="h-9"
              />
              <p className="text-xs text-muted-foreground">
                Solo letras minúsculas, números y guiones.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="group-name" className="text-sm">Nombre</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre del grupo"
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Grupo Padre (opcional)</Label>
            <SheetSelect
              value={parentId ?? "__none__"}
              onValueChange={(value) => setParentId(value === "__none__" ? null : value)}
              placeholder="Seleccionar grupo padre"
            >
              <SheetSelectItem value="__none__">
                <span className="text-muted-foreground">Sin grupo padre (raíz)</span>
              </SheetSelectItem>
              {availableParents.map((g) => (
                <SheetSelectItem key={g.id} value={g.id}>
                  {g.name}
                </SheetSelectItem>
              ))}
            </SheetSelect>
          </div>
        </div>

        <div className="px-4 py-3 border-t bg-muted/30 flex items-center gap-2">
          {!isNew && group && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="size-4" />
            </Button>
          )}

          <div className="flex-1" />
          
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {isNew ? "Crear" : "Guardar"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>

    {!isNew && group && (
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar grupo?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará "{group.name}" y <strong>todas las capas que contiene</strong>. Esta acción no se puede deshacer.
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
    )}
    </>
  )
}
