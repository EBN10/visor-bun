"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "~/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Layers, Users, Server } from "lucide-react";
import { AdminActivityPanel } from "./admin-activity-panel";

interface UsersResponse {
  users: unknown[];
  totalCount: number;
  currentUserId: string;
  currentUserRole: string;
}

export default function AdminDashboard() {
  const layersQuery = useQuery({
    queryKey: ["admin", "layers"],
    queryFn: () => fetchJson<unknown[]>("/api/admin/layers"),
  });

  const groupsQuery = useQuery({
    queryKey: ["admin", "layer-groups"],
    queryFn: () => fetchJson<unknown[]>("/api/admin/layer-groups"),
  });

  const usersQuery = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => fetchJson<UsersResponse>("/api/admin/users"),
  });

  const stats = [
    {
      title: "Capas Totales",
      value: layersQuery.data?.length ?? 0,
      icon: Layers,
      description: "Capas de mapa activas",
    },
    {
      title: "Grupos de Capas",
      value: groupsQuery.data?.length ?? 0,
      icon: Server,
      description: "Categorías organizadas",
    },
    {
      title: "Usuarios Totales",
      value: usersQuery.data?.totalCount ?? 0,
      icon: Users,
      description: "Administradores registrados",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Panel de Control</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <stat.icon className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-muted-foreground text-xs">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <AdminActivityPanel />
    </div>
  );
}
