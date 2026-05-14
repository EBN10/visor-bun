"use client"

import { type ReactNode, useDeferredValue, useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  ChevronLeft,
  ChevronRight,
  FilterX,
  Search,
} from "lucide-react"
import { fetchJson } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import { ScrollArea } from "~/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"

type ActivityLog = {
  id: number
  action: string
  resourceType: string
  resourceId: string
  resourceLabel: string | null
  summary: string
  actorUserId: string | null
  actorName: string | null
  actorEmail: string | null
  details?: {
    changes?: Array<{
      field: string
      label: string
      before: string | null
      after: string | null
    }>
    notes?: string[]
  }
  createdAt: string
}

type ActivityResponse = {
  items: ActivityLog[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

const actionLabels: Record<string, string> = {
  create: "Alta",
  update: "Edición",
  delete: "Baja",
  move: "Movimiento",
  import: "Importación",
  invite: "Invitación",
  invite_resend: "Reenvío",
}

const resourceLabels: Record<string, string> = {
  layer: "Capa",
  layer_group: "Grupo",
  user: "Usuario",
  invitation: "Invitación",
  vector_table: "Tabla",
}

const actionOptions = [
  { value: "all", label: "Todas las acciones" },
  ...Object.entries(actionLabels).map(([value, label]) => ({ value, label })),
]

const resourceOptions = [
  { value: "all", label: "Todos los recursos" },
  ...Object.entries(resourceLabels).map(([value, label]) => ({ value, label })),
]

const pageSizeOptions = [20, 50, 100]

function formatActor(log: ActivityLog) {
  const actorName = log.actorName?.trim()

  if (actorName) {
    return actorName
  }

  const actorEmail = log.actorEmail?.trim()

  if (actorEmail) {
    return actorEmail
  }

  return "Sistema"
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value))
}

function compactValue(value: string | null, maxLength = 28) {
  if (!value) {
    return "vacío"
  }

  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength - 1)}…`
}

function buildDetailsPreview(log: ActivityLog) {
  const parts: string[] = []

  if (log.details?.changes?.length) {
    parts.push(
      ...log.details.changes
        .slice(0, 2)
        .map(
          (change) =>
            `${change.label}: ${compactValue(change.before)} → ${compactValue(change.after)}`
        )
    )

    if (log.details.changes.length > 2) {
      parts.push(`+${log.details.changes.length - 2} cambios más`)
    }
  }

  if (log.details?.notes?.length) {
    const availableSlots = Math.max(0, 2 - parts.length)

    parts.push(...log.details.notes.slice(0, availableSlots))

    if (log.details.notes.length > availableSlots) {
      parts.push(`+${log.details.notes.length - availableSlots} notas más`)
    }
  }

  return parts.join(" • ")
}

function buildActivityUrl(params: {
  page: number
  pageSize: number
  action: string
  resourceType: string
  actor: string
  search: string
}) {
  const searchParams = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  })

  if (params.search) {
    searchParams.set("search", params.search)
  }

  if (params.actor) {
    searchParams.set("actor", params.actor)
  }

  if (params.action !== "all") {
    searchParams.set("action", params.action)
  }

  if (params.resourceType !== "all") {
    searchParams.set("resourceType", params.resourceType)
  }

  return `/api/admin/activity?${searchParams.toString()}`
}

function getPageItems(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  if (currentPage <= 3) {
    return [1, 2, 3, 4, "ellipsis-right", totalPages] as const
  }

  if (currentPage >= totalPages - 2) {
    return [1, "ellipsis-left", totalPages - 3, totalPages - 2, totalPages - 1, totalPages] as const
  }

  return [
    1,
    "ellipsis-left",
    currentPage - 1,
    currentPage,
    currentPage + 1,
    "ellipsis-right",
    totalPages,
  ] as const
}

type ActivityCellProps = {
  label: string
  children: ReactNode
}

function ActivityCell({ label, children }: ActivityCellProps) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase lg:hidden">
        {label}
      </p>
      {children}
    </div>
  )
}

export function AdminActivityPanel() {
  const [search, setSearch] = useState("")
  const [actor, setActor] = useState("")
  const [action, setAction] = useState("all")
  const [resourceType, setResourceType] = useState("all")
  const [pageSize, setPageSize] = useState(20)
  const [page, setPage] = useState(1)

  const deferredSearch = useDeferredValue(search.trim())
  const deferredActor = useDeferredValue(actor.trim())

  useEffect(() => {
    setPage(1)
  }, [action, deferredActor, deferredSearch, pageSize, resourceType])

  const activityQuery = useQuery({
    queryKey: [
      "admin",
      "activity",
      {
        action,
        actor: deferredActor,
        page,
        pageSize,
        resourceType,
        search: deferredSearch,
      },
    ],
    queryFn: () =>
      fetchJson<ActivityResponse>(
        buildActivityUrl({
          action,
          actor: deferredActor,
          page,
          pageSize,
          resourceType,
          search: deferredSearch,
        })
      ),
    placeholderData: (previousData) => previousData,
  })

  const pagination = activityQuery.data?.pagination ?? {
    page,
    pageSize,
    total: 0,
    totalPages: 1,
  }
  const logs = activityQuery.data?.items ?? []
  const hasActiveFilters =
    Boolean(actor.trim()) ||
    Boolean(search.trim()) ||
    action !== "all" ||
    resourceType !== "all"
  const firstItem =
    pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1
  const lastItem =
    pagination.total === 0
      ? 0
      : Math.min(pagination.page * pagination.pageSize, pagination.total)

  return (
    <Card className="min-h-[34rem]">
      <CardHeader className="gap-4">
        <div className="space-y-1">
          <CardTitle>Actividad Reciente</CardTitle>
          <CardDescription>
            Explorá el historial administrativo con búsqueda, filtros y páginas
            pensadas para miles de eventos.
          </CardDescription>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_minmax(220px,0.8fr)_190px_190px_140px_auto]">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por resumen, recurso o ID"
              className="pl-9"
              aria-label="Buscar actividad"
            />
          </div>

          <Input
            value={actor}
            onChange={(event) => setActor(event.target.value)}
            placeholder="Filtrar por usuario"
            aria-label="Filtrar por usuario"
          />

          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Acción" />
            </SelectTrigger>
            <SelectContent>
              {actionOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={resourceType} onValueChange={setResourceType}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Recurso" />
            </SelectTrigger>
            <SelectContent>
              {resourceOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={String(pageSize)}
            onValueChange={(value) => setPageSize(Number(value))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Por página" />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option} por página
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            onClick={() => {
              setSearch("")
              setActor("")
              setAction("all")
              setResourceType("all")
              setPage(1)
            }}
            disabled={!hasActiveFilters}
            className="w-full xl:w-auto"
          >
            <FilterX />
            Limpiar filtros
          </Button>
        </div>

        <div className="flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground">
            {pagination.total > 0
              ? `Mostrando ${firstItem}-${lastItem} de ${pagination.total} eventos`
              : "No hay eventos para los filtros actuales"}
          </p>
          {activityQuery.isFetching && (
            <p className="text-muted-foreground">Actualizando resultados...</p>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4">
        {activityQuery.isLoading ? (
          <p className="text-muted-foreground text-sm">Cargando actividad...</p>
        ) : activityQuery.isError ? (
          <p className="text-destructive text-sm">
            No se pudo cargar el historial de actividad.
          </p>
        ) : logs.length > 0 ? (
          <>
            <div className="overflow-hidden rounded-lg border">
              <div className="bg-muted/40 text-muted-foreground hidden grid-cols-[120px_170px_minmax(0,1.4fr)_220px_180px] gap-3 border-b px-4 py-3 text-[11px] font-medium tracking-wide uppercase lg:grid">
                <span>Fecha</span>
                <span>Acción</span>
                <span>Detalle</span>
                <span>Usuario</span>
                <span>Recurso</span>
              </div>

              <ScrollArea className="h-[26rem]">
                <div className="divide-y">
                  {logs.map((log) => {
                    const detailsPreview = buildDetailsPreview(log)

                    return (
                      <article key={log.id} className="px-4 py-3">
                        <div className="grid gap-3 lg:grid-cols-[120px_170px_minmax(0,1.4fr)_220px_180px] lg:items-start">
                          <ActivityCell label="Fecha">
                            <p className="font-mono text-xs">
                              {formatTimestamp(log.createdAt)}
                            </p>
                          </ActivityCell>

                          <ActivityCell label="Acción">
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="secondary">
                                {actionLabels[log.action] ?? log.action}
                              </Badge>
                              <Badge variant="outline">
                                {resourceLabels[log.resourceType] ??
                                  log.resourceType}
                              </Badge>
                            </div>
                          </ActivityCell>

                          <ActivityCell label="Detalle">
                            <div className="min-w-0 space-y-1">
                              <p
                                className="text-sm leading-5 font-medium"
                                title={log.summary}
                              >
                                {log.summary}
                              </p>
                              {detailsPreview && (
                                <p
                                  className="text-muted-foreground text-xs leading-5"
                                  title={detailsPreview}
                                >
                                  {detailsPreview}
                                </p>
                              )}
                            </div>
                          </ActivityCell>

                          <ActivityCell label="Usuario">
                            <div className="min-w-0 space-y-1">
                              <p className="text-sm leading-5">
                                {formatActor(log)}
                              </p>
                              {log.actorEmail && log.actorName && (
                                <p className="text-muted-foreground text-xs break-all">
                                  {log.actorEmail}
                                </p>
                              )}
                            </div>
                          </ActivityCell>

                          <ActivityCell label="Recurso">
                            <div className="min-w-0 space-y-1">
                              <p className="text-sm leading-5">
                                {log.resourceLabel ?? log.resourceId}
                              </p>
                              {log.resourceLabel &&
                                log.resourceId !== log.resourceLabel && (
                                  <p className="text-muted-foreground font-mono text-xs break-all">
                                    {log.resourceId}
                                  </p>
                                )}
                            </div>
                          </ActivityCell>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </ScrollArea>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted-foreground text-xs">
                Página {pagination.page} de {pagination.totalPages}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={pagination.page <= 1}
                >
                  <ChevronLeft />
                  Anterior
                </Button>

                {getPageItems(pagination.page, pagination.totalPages).map(
                  (item, index) =>
                    typeof item === "number" ? (
                      <Button
                        key={item}
                        variant={
                          item === pagination.page ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => setPage(item)}
                      >
                        {item}
                      </Button>
                    ) : (
                      <span
                        key={`${item}-${index}`}
                        className="text-muted-foreground px-2 text-sm"
                      >
                        …
                      </span>
                    )
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPage((current) =>
                      Math.min(pagination.totalPages, current + 1)
                    )
                  }
                  disabled={pagination.page >= pagination.totalPages}
                >
                  Siguiente
                  <ChevronRight />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex min-h-[18rem] flex-col items-center justify-center gap-3 rounded-lg border border-dashed text-center">
            <div className="space-y-1">
              <p className="text-sm font-medium">
                No encontramos actividad con esos filtros.
              </p>
              <p className="text-muted-foreground text-sm">
                Probá con otra búsqueda o limpiá los filtros para volver al
                historial completo.
              </p>
            </div>

            {hasActiveFilters && (
              <Button
                variant="outline"
                onClick={() => {
                  setSearch("")
                  setActor("")
                  setAction("all")
                  setResourceType("all")
                  setPage(1)
                }}
              >
                <FilterX />
                Restablecer vista
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
