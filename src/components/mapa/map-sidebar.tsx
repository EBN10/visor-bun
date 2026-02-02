"use client"

import * as React from "react"
import {
  Command,
  Map as MapIcon,
} from "lucide-react"

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
import { ThemeToggle } from "~/components/ui/theme-toggle"

export function MapSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="#">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-black text-sidebar-primary-foreground">
                  <Image src="/logo-dir.estadisticasycensos.png" alt="Logo" width={30} height={30} />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Visor de Mapa</span>
                  <span className="truncate text-xs">Dirección de Estadísticas</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <div className="p-2">
            <ArbolCapas />
        </div>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center justify-between px-2 py-1">
          <span className="text-xs text-muted-foreground">Visor SDE</span>
          <ThemeToggle />
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

