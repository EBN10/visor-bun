"use client";

import { Globe, Layers, Map } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
import { LayerForm } from "./layer-form";

type LayerCreateSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: Array<{ id: string; name: string }>;
};

export function LayerCreateSheet({
  open,
  onOpenChange,
  groups,
}: LayerCreateSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-2xl">
        <SheetHeader className="border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <Layers className="size-5 text-sky-600" />
            <Globe className="size-5 text-violet-600" />
            <Map className="size-5 text-orange-500" />
            <SheetTitle className="text-base">Nueva capa</SheetTitle>
          </div>
          <SheetDescription>
            Conecta servicios WMS, WFS y XYZ manteniendo el estilo del visor.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-6 py-5">
          <LayerForm groups={groups} onSuccess={() => onOpenChange(false)} />
          <p className="text-muted-foreground text-sm">
            Para archivos GeoJSON y exportaciones desde QGIS sigue usando el
            flujo de importación dedicado.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
