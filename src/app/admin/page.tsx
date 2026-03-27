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

const accents = ["#C49830", "#9EAD3C", "#E0BF96"] as const;

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
      <div>
        <h1 className="text-3xl font-bold tracking-tight font-heading">
          Panel de Control
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Resumen general del visor geoespacial
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat, i) => (
          <Card
            key={stat.title}
            className="relative overflow-hidden group hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
          >
            <div
              className="absolute left-0 top-0 bottom-0 w-[2px]"
              style={{ background: accents[i] }}
            />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <div className="p-2 rounded-lg bg-primary/[0.06] group-hover:bg-primary/[0.1] transition-colors">
                <stat.icon className="text-primary h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold font-heading">{stat.value}</div>
              <p className="text-muted-foreground text-xs mt-1">
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
