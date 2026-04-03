"use client"

import * as React from "react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarSeparator,
} from "~/components/ui/sidebar"
import ArbolCapas from "~/components/comp-598"
import Image from "next/image"

export function MapSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader className="px-2 pt-2">
        <a
          href="/"
          className="rounded-2xl border border-sidebar-border/80 bg-sidebar-accent/35 p-3 transition-colors hover:bg-sidebar-accent/60"
        >
          <div className="flex items-center gap-3">
            <div className="flex aspect-square items-center justify-center rounded-xl bg-black p-1 text-sidebar-primary-foreground shadow-sm">
              <Image
                src="/logo-dir.estadisticasycensos.png"
                alt="Logo"
                className="-ml-0.5"
                width={30}
                height={30}
              />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">Visor Cartográfico</span>
              <span className="truncate text-xs text-muted-foreground">
                Dirección de Estadísticas y Censos
              </span>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-sidebar-border/70 bg-background/60 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Operación
            </p>
            <p className="mt-1 text-xs leading-relaxed text-sidebar-foreground/80">
              Busca, activa y centra capas sin perder el contexto del mapa.
            </p>
          </div>
        </a>
      </SidebarHeader>
      <SidebarSeparator className="my-3" />
      <SidebarContent>
        <div className="h-full p-2">
          <ArbolCapas />
        </div>
      </SidebarContent>
      <SidebarFooter className="px-2 pb-2">
        <div className="flex items-center justify-between rounded-xl border border-sidebar-border/70 bg-background/55 px-3 py-2">
          <span className="text-xs text-muted-foreground">Visor SDE</span>
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            IDE
          </span>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

