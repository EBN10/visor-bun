"use client";

import { Mapa } from "~/components/mapa/mapa";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "~/components/ui/sidebar";
import "leaflet/dist/leaflet.css";
import { LayersProvider } from "~/components/layers/provider";
import { MapSidebar } from "~/components/mapa/map-sidebar";
import { Separator } from "~/components/ui/separator";

import { ThemeToggle } from "~/components/ui/theme-toggle";

function App() {
  return (
    <SidebarProvider>
      <LayersProvider>
        <MapSidebar />
        <SidebarInset>
          <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-background/88 pr-4 backdrop-blur transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <div>
                <h1 className="text-base font-semibold">Infraestructura de Datos Espaciales</h1>
                <p className="text-xs text-muted-foreground">
                  Exploración cartográfica y gestión visual de capas
                </p>
              </div>
            </div>
            <ThemeToggle />
          </header>
          <div className="flex flex-1 flex-col p-3 pt-3">
            <div className="h-[calc(100vh-4.7rem)] w-full overflow-hidden rounded-[28px] border border-border/70 bg-muted/30 shadow-[0_30px_70px_-40px_rgba(15,23,42,0.6)]">
              <Mapa />
            </div>
          </div>
        </SidebarInset>
      </LayersProvider>
    </SidebarProvider>
  );
}

export default App;
