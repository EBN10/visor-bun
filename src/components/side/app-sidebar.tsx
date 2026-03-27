"use client";

import * as React from "react";
import Link from "next/link";
import {
  FileUp,
  LayoutDashboard,
  Layers3,
  Map,
  UsersRound,
} from "lucide-react";
import { SidebarThemeToggle } from "~/components/side/sidebar-theme-toggle";
import Image from "next/image";
import { NavMain } from "./nav-main";
import { NavUser } from "./nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "~/components/ui/sidebar";

const data = {
  user: {
    name: "Admin",
    email: "admin@example.com",
    avatar: "/avatars/shadcn.jpg",
  },
  navMain: [
    {
      title: "Panel de control",
      url: "/admin",
      icon: LayoutDashboard,
    },
    {
      title: "Capas",
      url: "/admin/capas",
      icon: Layers3,
    },
    {
      title: "Usuarios",
      url: "/admin/usuarios",
      icon: UsersRound,
    },
    {
      title: "Importar QGIS",
      url: "/admin/qgis",
      icon: FileUp,
    },
    {
      title: "Mapa",
      url: "/mapa",
      icon: Map,
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <Link
          href="/"
          className="hover:bg-sidebar-accent/60 flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors"
        >
          <div className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-lg">
            <Image
              src="/logo-dir.estadisticasycensos.png"
              alt="Logo"
              width={32}
              height={32}
            />
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="font-heading truncate font-semibold">
              IDE Visor
            </span>
            <span className="text-muted-foreground truncate text-xs">
              Dir. de Estadísticas
            </span>
          </div>
        </Link>
      </SidebarHeader>

      {/* Branded separator — 4 logo colors */}
      <div
        className="mx-4 my-3 h-px opacity-50"
        style={{
          background:
            "linear-gradient(to right, var(--logo-peach), var(--logo-lime), var(--logo-gold), var(--logo-pearl))",
        }}
      />

      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarThemeToggle />
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
