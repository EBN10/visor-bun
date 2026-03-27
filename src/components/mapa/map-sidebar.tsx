"use client"

import * as React from "react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "~/components/ui/sidebar"
import ArbolCapas from "~/components/comp-598"
import Image from "next/image"

export function MapSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
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
        <div className="p-2">
            <ArbolCapas />
        </div>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center justify-between px-2 py-1">
          <span className="text-xs text-muted-foreground">Visor SDE</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

