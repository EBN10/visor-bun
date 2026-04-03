"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  EyeOff,
  Folder,
  FolderOpen,
  Globe,
  Layers3,
  LocateFixed,
  Map,
  Search,
  X,
} from "lucide-react";
import { Checkbox } from "~/components/ui/checkbox";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Badge } from "~/components/ui/badge";
import {
  ROOT_ID,
  type LayerNodeMeta,
  useLayers,
} from "~/components/layers/provider";
import {
  getLayerAccentColor,
  isLayerInZoomRange,
} from "~/lib/layer-presentation";
import { cn } from "~/lib/utils";

function getLayerIcon(kind?: LayerNodeMeta["kind"]) {
  switch (kind) {
    case "wms":
      return <Globe className="size-4 text-emerald-600" />;
    case "xyz":
      return <Map className="size-4 text-orange-500" />;
    default:
      return <Layers3 className="size-4 text-sky-600" />;
  }
}

function collectDescendantIds(
  rootId: string,
  items: Record<string, { name: string; children?: string[] }>,
): string[] {
  const descendants: string[] = [];
  const stack = [...(items[rootId]?.children ?? [])];

  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId) {
      continue;
    }

    descendants.push(currentId);
    stack.push(...(items[currentId]?.children ?? []));
  }

  return descendants;
}

function getDescendantLayerIds(
  rootId: string,
  items: Record<string, { name: string; children?: string[] }>,
  metas: Record<string, LayerNodeMeta>,
) {
  return collectDescendantIds(rootId, items).filter(
    (nodeId) => metas[nodeId]?.type === "layer",
  );
}

export default function ArbolCapas() {
  const {
    ready,
    items,
    metas,
    visibleLayerIds,
    mapViewport,
    setVisibleFromChecked,
    setLayerVisibility,
    clearVisibleLayers,
    prefetchLayer,
    zoomToLayer,
  } = useLayers();
  const [query, setQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    new Set([ROOT_ID]),
  );

  useEffect(() => {
    const rootChildren = items[ROOT_ID]?.children ?? [];

    if (rootChildren.length === 0) {
      return;
    }

    setExpandedIds((previous) => {
      if (previous.size > 1) {
        return previous;
      }

      return new Set([ROOT_ID, ...rootChildren]);
    });
  }, [items]);

  const normalizedQuery = query.trim().toLowerCase();
  const activeLayers = useMemo(
    () =>
      Array.from(visibleLayerIds)
        .map((layerId) => metas[layerId])
        .filter((meta): meta is LayerNodeMeta =>
          Boolean(meta && meta.type === "layer"),
        )
        .sort((left, right) => left.order - right.order),
    [metas, visibleLayerIds],
  );

  const searchVisibility = useMemo(() => {
    if (!normalizedQuery) {
      return null;
    }

    const next = new Set<string>([ROOT_ID]);

    const markAncestors = (parentId: string | null | undefined) => {
      let currentId = parentId ?? null;

      while (currentId) {
        next.add(currentId);
        currentId = metas[currentId]?.parentId ?? null;
      }
    };

    Object.entries(items).forEach(([itemId, item]) => {
      if (itemId === ROOT_ID) {
        return;
      }

      const meta = metas[itemId];
      const matches =
        item.name.toLowerCase().includes(normalizedQuery) ||
        meta?.kind?.toLowerCase().includes(normalizedQuery) ||
        meta?.config?.legend?.label?.toLowerCase().includes(normalizedQuery);

      if (!matches) {
        return;
      }

      next.add(itemId);
      markAncestors(meta?.parentId);

      if (meta?.type === "group") {
        collectDescendantIds(itemId, items).forEach((descendantId) => {
          next.add(descendantId);
        });
      }
    });

    return next;
  }, [items, metas, normalizedQuery]);

  const autoExpandedIds = useMemo(() => {
    if (!searchVisibility) {
      return new Set<string>();
    }

    return new Set(
      Array.from(searchVisibility).filter(
        (itemId) => metas[itemId]?.type === "group",
      ),
    );
  }, [metas, searchVisibility]);

  const visibleCount = activeLayers.length;

  const toggleGroupLayers = (groupId: string) => {
    const descendantLayerIds = getDescendantLayerIds(groupId, items, metas);

    if (descendantLayerIds.length === 0) {
      return;
    }

    const nextVisibleIds = new Set(visibleLayerIds);
    const allVisible = descendantLayerIds.every((layerId) =>
      nextVisibleIds.has(layerId),
    );

    descendantLayerIds.forEach((layerId) => {
      if (allVisible) {
        nextVisibleIds.delete(layerId);
      } else {
        nextVisibleIds.add(layerId);
      }
    });

    setVisibleFromChecked(Array.from(nextVisibleIds));
  };

  const renderNode = (nodeId: string, depth: number): React.ReactNode => {
    if (nodeId === ROOT_ID) {
      return (items[nodeId]?.children ?? []).map((childId) =>
        renderNode(childId, depth),
      );
    }

    if (searchVisibility && !searchVisibility.has(nodeId)) {
      return null;
    }

    const item = items[nodeId];
    const meta = metas[nodeId];

    if (!item || !meta) {
      return null;
    }

    const isGroup = meta.type === "group";
    const childIds = item.children ?? [];
    const isExpanded = expandedIds.has(nodeId) || autoExpandedIds.has(nodeId);

    if (isGroup) {
      const descendantLayerIds = getDescendantLayerIds(nodeId, items, metas);
      const visibleDescendantCount = descendantLayerIds.filter((layerId) =>
        visibleLayerIds.has(layerId),
      ).length;
      const checkboxState =
        descendantLayerIds.length === 0
          ? false
          : visibleDescendantCount === 0
            ? false
            : visibleDescendantCount === descendantLayerIds.length
              ? true
              : "indeterminate";

      return (
        <div key={nodeId} className="space-y-1">
          <div
            className="hover:bg-muted/40 flex items-center gap-2 rounded-md py-1 transition-colors"
            style={{ marginLeft: `${depth * 16}px` }}
          >
            <Checkbox
              checked={checkboxState}
              disabled={descendantLayerIds.length === 0}
              onCheckedChange={() => toggleGroupLayers(nodeId)}
            />
            <button
              type="button"
              onClick={() => {
                setExpandedIds((previous) => {
                  const next = new Set(previous);
                  if (next.has(nodeId)) {
                    next.delete(nodeId);
                  } else {
                    next.add(nodeId);
                  }
                  return next;
                });
              }}
              className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg p-1 transition-colors"
            >
              <ChevronRight
                className={cn(
                  "size-4 transition-transform",
                  isExpanded && "rotate-90",
                )}
              />
            </button>

            <div className="shrink-0">
              {isExpanded ? (
                <FolderOpen className="size-4 text-amber-500" />
              ) : (
                <Folder className="size-4 text-amber-500" />
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setExpandedIds((previous) => {
                  const next = new Set(previous);
                  if (next.has(nodeId)) {
                    next.delete(nodeId);
                  } else {
                    next.add(nodeId);
                  }
                  return next;
                });
              }}
              className="min-w-0 flex-1 text-left"
            >
              <div className="truncate text-sm font-medium">{item.name}</div>
            </button>
          </div>

          {isExpanded && childIds.length > 0 && (
            <div className="space-y-1">
              {childIds.map((childId) => renderNode(childId, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    const isVisible = visibleLayerIds.has(nodeId);
    const isInScale = mapViewport
      ? isLayerInZoomRange(meta.config, mapViewport.zoom)
      : true;
    const accentColor = getLayerAccentColor(nodeId, meta.config);

    return (
      <div
        key={nodeId}
        className={cn("group flex items-center gap-2 transition-colors")}
        style={{ marginLeft: `${depth * 16}px` }}
        onMouseEnter={() => prefetchLayer(nodeId)}
        onFocusCapture={() => prefetchLayer(nodeId)}
      >
        <Checkbox
          checked={isVisible}
          onCheckedChange={(checked) =>
            setLayerVisibility(nodeId, checked === true)
          }
        />

        <span
          className="size-2.5 rounded-full shadow-sm"
          style={{ backgroundColor: accentColor }}
          aria-hidden="true"
        />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground h-8 w-4 shrink-0"
          onClick={() => {
            void zoomToLayer(nodeId);
          }}
          title="Centrar capa"
        >
          {getLayerIcon(meta.kind)}
        </Button>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{item.name}</div>
        </div>
      </div>
    );
  };

  if (!ready) {
    return (
      <div className="text-muted-foreground p-2 text-sm">Cargando capas…</div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar capas o grupos..."
          className="h-10 rounded-xl pr-10 pl-9"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="text-muted-foreground hover:bg-muted hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-1 transition-colors"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <ScrollArea className="max-h-[calc(100vh-22rem)]py-3 h-full">
        <div className="space-y-1 pr-1">{renderNode(ROOT_ID, 0)}</div>
      </ScrollArea>
    </div>
  );
}
