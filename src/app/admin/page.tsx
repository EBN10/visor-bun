"use client"

import { useQuery } from "@tanstack/react-query"
import { fetchJson } from "~/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import { Layers, Users, Map, Server } from "lucide-react"
import { Badge } from "~/components/ui/badge"

interface UsersResponse {
  users: any[]
  totalCount: number
  currentUserId: string
  currentUserRole: string
}

interface ActivityLog {
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

const actionLabels: Record<string, string> = {
  create: "Alta",
  update: "Edición",
  delete: "Baja",
  move: "Movimiento",
  import: "Importación",
  invite: "Invitación",
}

const resourceLabels: Record<string, string> = {
  layer: "Capa",
  layer_group: "Grupo",
  user: "Usuario",
  invitation: "Invitación",
  vector_table: "Tabla",
}

function formatActor(log: ActivityLog) {
  return log.actorName || log.actorEmail || "Sistema"
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value))
}

function formatChangeValue(value: string | null) {
  return value ?? "vacío"
}

export default function AdminDashboard() {
  const layersQuery = useQuery({
    queryKey: ["admin", "layers"],
    queryFn: () => fetchJson<any[]>("/api/admin/layers"),
  })

  const groupsQuery = useQuery({
    queryKey: ["admin", "layer-groups"],
    queryFn: () => fetchJson<any[]>("/api/admin/layer-groups"),
  })

  const usersQuery = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => fetchJson<UsersResponse>("/api/admin/users"),
  })

  const activityQuery = useQuery({
    queryKey: ["admin", "activity"],
    queryFn: () => fetchJson<ActivityLog[]>("/api/admin/activity"),
  })

  const stats = [
    {
      title: "Capas Totales",
      value: layersQuery.data?.length || 0,
      icon: Layers,
      description: "Capas de mapa activas",
    },
    {
      title: "Grupos de Capas",
      value: groupsQuery.data?.length || 0,
      icon: Server,
      description: "Categorías organizadas",
    },
    {
      title: "Usuarios Totales",
      value: usersQuery.data?.totalCount ?? 0,
      icon: Users,
      description: "Administradores registrados",
    },
    {
      title: "Vistas del Mapa",
      value: "1,234", // Placeholder
      icon: Map,
      description: "Impresiones totales del mapa",
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Panel de Control</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Actividad Reciente</CardTitle>
          </CardHeader>
          <CardContent>
            {activityQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">
                Cargando actividad...
              </p>
            ) : activityQuery.isError ? (
              <p className="text-sm text-destructive">
                No se pudo cargar el historial de actividad.
              </p>
            ) : activityQuery.data && activityQuery.data.length > 0 ? (
              <div className="space-y-3">
                {activityQuery.data.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-lg border bg-muted/30 px-3 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{log.summary}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatActor(log)} • {formatTimestamp(log.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                          {actionLabels[log.action] ?? log.action}
                        </Badge>
                        <Badge variant="outline">
                          {resourceLabels[log.resourceType] ?? log.resourceType}
                        </Badge>
                      </div>
                    </div>

                    {log.details?.changes && log.details.changes.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        {log.details.changes.map((change) => (
                          <p
                            key={`${log.id}-${change.field}`}
                            className="text-xs text-muted-foreground"
                          >
                            <span className="font-medium text-foreground">
                              {change.label}:
                            </span>{" "}
                            {formatChangeValue(change.before)} →{" "}
                            {formatChangeValue(change.after)}
                          </p>
                        ))}
                      </div>
                    )}

                    {log.details?.notes && log.details.notes.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        {log.details.notes.map((note, index) => (
                          <p
                            key={`${log.id}-note-${index}`}
                            className="text-xs text-muted-foreground"
                          >
                            {note}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No hay actividad reciente para mostrar.
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Estado del Sistema</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">Base de Datos</span>
                <span className="text-sm text-green-500">Conectado</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">API</span>
                <span className="text-sm text-green-500">Operacional</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Versión</span>
                <span className="text-sm">v1.0.0</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
