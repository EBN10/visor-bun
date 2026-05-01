import type { WmsConfig } from "~/server/db/schema";

const WMS_FETCH_TIMEOUT_MS = 15_000;

type WmsCapabilityLayer = {
  name: string;
  title: string;
};

type WmsValidationResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      status: 400 | 502;
    };

function decodeXmlEntities(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildTimeoutSignal(signal?: AbortSignal) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WMS_FETCH_TIMEOUT_MS);

  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeoutId),
  };
}

function parseRequestedLayers(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  );
}

function extractSearchTerms(value: string) {
  const normalized = normalizeText(value);
  const rawTerms = normalized
    .split(" ")
    .flatMap((term) => term.split(":"))
    .map((term) => term.trim())
    .filter(Boolean);

  return Array.from(
    new Set(
      rawTerms.flatMap((term) =>
        term.endsWith("s") && term.length > 3
          ? [term, term.slice(0, -1)]
          : [term],
      ),
    ),
  );
}

function parseCapabilityLayers(xml: string): WmsCapabilityLayer[] {
  const layers: WmsCapabilityLayer[] = [];
  const seen = new Set<string>();
  const pattern =
    /<Layer\b[\s\S]*?<Name>([^<]+)<\/Name>[\s\S]*?<Title>([^<]+)<\/Title>/g;

  for (const match of xml.matchAll(pattern)) {
    const name = decodeXmlEntities(match[1] ?? "").trim();
    const title = decodeXmlEntities(match[2] ?? "").trim();

    if (!name || seen.has(name)) {
      continue;
    }

    seen.add(name);
    layers.push({ name, title });
  }

  return layers;
}

function scoreLayerSuggestion(
  requestedLayer: string,
  candidate: WmsCapabilityLayer,
) {
  const requestedTerms = extractSearchTerms(requestedLayer);
  const candidateName = normalizeText(candidate.name);
  const candidateTitle = normalizeText(candidate.title);
  const candidateNamespaceStripped = normalizeText(
    candidate.name.split(":").pop() ?? candidate.name,
  );

  let score = 0;

  for (const term of requestedTerms) {
    if (!term) {
      continue;
    }

    if (candidate.name.toLowerCase() === requestedLayer.toLowerCase()) {
      score += 100;
    }

    if (candidateNamespaceStripped === term) {
      score += 40;
    }

    if (candidateName.includes(term)) {
      score += 18;
    }

    if (candidateTitle.includes(term)) {
      score += 22;
    }

    if (term.includes(candidateNamespaceStripped)) {
      score += 12;
    }
  }

  return score;
}

function buildSuggestions(
  requestedLayer: string,
  availableLayers: WmsCapabilityLayer[],
) {
  return availableLayers
    .map((candidate) => ({
      ...candidate,
      score: scoreLayerSuggestion(requestedLayer, candidate),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
}

async function fetchWmsCapabilities(
  url: string,
  signal?: AbortSignal,
): Promise<WmsCapabilityLayer[]> {
  const requestUrl = new URL(url);
  requestUrl.searchParams.set("service", "WMS");
  requestUrl.searchParams.set("request", "GetCapabilities");

  const timeout = buildTimeoutSignal(signal);

  try {
    const response = await fetch(requestUrl, {
      method: "GET",
      headers: {
        accept: "application/xml, text/xml;q=0.9, */*;q=0.5",
      },
      cache: "no-store",
      signal: timeout.signal,
    });

    if (!response.ok) {
      throw new Error(`WMS ${response.status} ${response.statusText}`);
    }

    const xml = await response.text();
    const layers = parseCapabilityLayers(xml);

    if (layers.length === 0) {
      throw new Error("El GetCapabilities no devolvió capas publicadas.");
    }

    return layers;
  } finally {
    timeout.cleanup();
  }
}

export async function validateRemoteWmsConfig(
  config: WmsConfig,
  signal?: AbortSignal,
): Promise<WmsValidationResult> {
  try {
    const requestedLayers = parseRequestedLayers(config.layers);
    const availableLayers = await fetchWmsCapabilities(config.url, signal);
    const availableLayerNames = new Set(
      availableLayers.map((layer) => layer.name.toLowerCase()),
    );

    const missingLayers = requestedLayers.filter(
      (layerName) => !availableLayerNames.has(layerName.toLowerCase()),
    );

    if (missingLayers.length === 0) {
      return { ok: true };
    }

    const suggestions = buildSuggestions(missingLayers[0]!, availableLayers);
    const suggestionText =
      suggestions.length > 0
        ? ` Sugerencias: ${suggestions
            .map((layer) => `${layer.name} (${layer.title})`)
            .join(", ")}.`
        : "";

    return {
      ok: false,
      status: 400,
      error: `La capa WMS ${missingLayers
        .map((layerName) => `"${layerName}"`)
        .join(", ")} no existe en el servicio remoto.${suggestionText}`,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo validar el servicio WMS remoto.";

    return {
      ok: false,
      status: 502,
      error: `No se pudo validar el servicio WMS remoto: ${message}`,
    };
  }
}
