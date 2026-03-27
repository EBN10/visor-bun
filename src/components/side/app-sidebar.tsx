"use client"

import * as React from "react"
import {
  LifeBuoy,
  Map,
  Send,
  SquareTerminal,
} from "lucide-react"
import { SidebarThemeToggle } from "~/components/side/sidebar-theme-toggle"
import Image from "next/image"
import { NavMain } from "./nav-main"
import { NavSecondary } from "./nav-secondary"
import { NavUser } from "./nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarSeparator,
} from "~/components/ui/sidebar"

const data = {
  user: {
    name: "Admin",
    email: "admin@example.com",
    avatar: "/avatars/shadcn.jpg",
  },
  navMain: [
    {
      title: "Administración",
      url: "/admin",
      icon: SquareTerminal,
      isActive: true,
      items: [
        {
          title: "Panel de Control",
          url: "/admin",
        },
        {
          title: "Capas",
          url: "/admin/capas",
        },
        {
          title: "Usuarios",
          url: "/admin/usuarios",
        },
        {
          title: "Importar QGIS",
          url: "/admin/qgis",
        },
      ],
    },
    {
      title: "Mapa",
      url: "/mapa",
      icon: Map,
      items: [
        {
          title: "Ver Mapa",
          url: "/mapa",
        },
      ],
    },
  ],
  navSecondary: [
    {
      title: "Soporte",
      url: "#",
      icon: LifeBuoy,
    },
    {
      title: "Comentarios",
      url: "#",
      icon: Send,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <a href="/" className="flex items-center justify-center rounded-lg gap-4 text-sidebar-primary-foreground">
          <div className="flex aspect-square p-1 items-center justify-center rounded-lg bg-black text-sidebar-primary-foreground">
            <Image src="/logo-dir.estadisticasycensos.png" alt="Logo" className="-ml-0.5" width={30} height={30} />
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-semibold">Visor de Mapa</span>
            <span className="truncate text-xs">Dirección de Estadísticas</span>
          </div>
        </a>
      </SidebarHeader>
      <SidebarSeparator className="my-4" />
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
         <SidebarThemeToggle />
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}
