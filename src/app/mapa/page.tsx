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
          <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12 justify-between pr-4">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <h1 className="text-lg font-semibold">Infraestructura de Datos Espaciales</h1>
            </div>
            <ThemeToggle />
          </header>
          <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
            <div className="h-[calc(100vh-5rem)] w-full overflow-hidden rounded-xl border bg-muted/50 shadow-sm">
               <Mapa />
            </div>
          </div>
        </SidebarInset>
      </LayersProvider>
    </SidebarProvider>
  );
}

export default App;
