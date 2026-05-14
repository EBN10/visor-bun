export type FetchJsonProgress = {
  loadedBytes: number
  totalBytes: number | null
  progress: number | null
}

export async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    cache: "no-store",
    ...init,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    const err = new Error(`HTTP ${res.status} ${res.statusText}: ${text}`)

    ;(err as any).status = res.status
    throw err
  }
  return (await res.json()) as T
}

export async function fetchJsonWithProgress<T>(
  input: RequestInfo,
  onProgress: ((progress: FetchJsonProgress) => void) | undefined,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(input, {
    cache: "no-store",
    ...init,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    const err = new Error(`HTTP ${res.status} ${res.statusText}: ${text}`)

    ;(err as any).status = res.status
    throw err
  }

  if (!res.body || !onProgress) {
    return (await res.json()) as T
  }

  const contentLength = Number(res.headers.get("content-length") ?? "")
  const totalBytes = Number.isFinite(contentLength) && contentLength > 0 ? contentLength : null
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let loadedBytes = 0

  onProgress({
    loadedBytes,
    totalBytes,
    progress: totalBytes ? 0 : null,
  })

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    if (!value) {
      continue
    }

    chunks.push(value)
    loadedBytes += value.byteLength

    onProgress({
      loadedBytes,
      totalBytes,
      progress: totalBytes ? Math.min(loadedBytes / totalBytes, 1) : null,
    })
  }

  const bytes = new Uint8Array(loadedBytes)
  let offset = 0

  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  const text = new TextDecoder().decode(bytes)

  return JSON.parse(text) as T
}

export const qk = {
  catalog: ["catalog"] as const,
  vectorLayer: (id: string, bbox: string, z: number) => ["vector", id, bbox, z] as const,
  layerExtent: (id: string) => ["layer-extent", id] as const,
}
