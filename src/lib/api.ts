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

export const qk = {
  catalog: ["catalog"] as const,
  vectorLayer: (id: string, bbox: string, z: number) => ["vector", id, bbox, z] as const,
}
