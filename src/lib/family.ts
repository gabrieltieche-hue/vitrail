/**
 * Client du service local de la famille.
 *
 * Le service tourne sur la machine qui héberge Vitrail (la tablette). Il
 * fournit : la bibliothèque partagée, la transcription des paroles, la file
 * d'attente commune et les statistiques d'écoute.
 *
 * Aucune donnée ne part sur internet : tout reste sur le réseau local.
 */

export type FamilyTrack = {
  id: string
  title: string
  artist: string
  album: string
  year: number | null
  durationSec: number
  filename: string
  mime: string
  size: number
  hasArtwork: boolean
  addedAt: number
}

export type TranscriptWord = { time: number; text: string }

export type TranscriptLine = {
  time: number
  endTime?: number
  text: string
  words?: TranscriptWord[]
}

export type Transcript = {
  id: string
  createdAt: number
  text: string
  lines: TranscriptLine[]
  words: { start: number; end: number; text: string }[]
  cached?: boolean
}

export type QueueItem = {
  id: string
  /** "demo" = catalogue libre, "family" = fichier partagé par le service local. */
  kind: "demo" | "family"
  title: string
  artist: string
  album: string
  artwork: string
  durationSec: number
  source: "demo" | "local" | "family"
  addedAt?: number
}

export type FamilyQueue = {
  items: QueueItem[]
  now: QueueItem | null
  updatedAt: number
}

export type FamilyStats = {
  totalSeconds: number
  playCount: number
  tracks: { key: string; count: number }[]
  artists: { key: string; count: number }[]
  albums: { key: string; count: number }[]
  days: [string, number][]
}

let resolvedBase: string | null = null
let resolving: Promise<string | null> | null = null

function candidates(): string[] {
  const list: string[] = []
  if (typeof location !== "undefined") {
    // Priorité à l'origine courante : quand l'app est servie par le service
    // local (http://127.0.0.1:8099), l'API est en même origine et tout
    // fonctionne. Depuis une page HTTPS (Vercel), l'accès à une API HTTP
    // locale est bloqué par le navigateur (mixed content) : on le dit.
    list.push(location.origin)
    if (location.port !== "8099") {
      list.push(`${location.protocol}//${location.hostname}:8099`)
    }
  }
  list.push("http://127.0.0.1:8099")
  list.push("http://192.168.1.114:8099")
  return [...new Set(list)]
}

/** Vrai quand la page est en HTTPS : le navigateur bloque alors l'appel à
 *  une API HTTP locale (mixed content). */
export function isMixedContentBlocked(): boolean {
  if (typeof location === "undefined") return false
  if (location.protocol !== "https:") return false
  return true
}

async function probe(url: string, timeoutMs = 4000): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${url}/api/health`, { signal: controller.signal })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** Trouve le service local (une seule fois, puis mémorisé). */
export async function findService(): Promise<string | null> {
  if (resolvedBase) return resolvedBase
  if (resolving) return resolving

  resolving = (async () => {
    for (const candidate of candidates()) {
      if (await probe(candidate)) {
        resolvedBase = candidate
        return candidate
      }
    }
    resolvedBase = null
    return null
  })()

  const result = await resolving
  resolving = null
  return result
}

export function serviceBase(): string | null {
  return resolvedBase
}

async function request<T>(path: string, init?: RequestInit): Promise<T | null> {
  const base = await findService()
  if (!base) return null
  try {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/octet-stream" } : {}),
        ...(init?.headers ?? {}),
      },
    })
    if (!response.ok) return null
    return (await response.json()) as T
  } catch {
    return null
  }
}

function encodeMeta(meta: Record<string, unknown>): string {
  const json = JSON.stringify(meta)
  const bytes = new TextEncoder().encode(json)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export async function serviceHealth(): Promise<{
  ok: boolean
  hasWhisper: boolean
  librarySize: number
  addresses: string[]
} | null> {
  return request("/api/health")
}

// -- transcription ---------------------------------------------------------

export async function getTranscript(hash: string): Promise<Transcript | null> {
  const result = await request<Transcript & { status?: string }>(`/api/transcript/${hash}`)
  if (!result || result.status === "pending") return null
  return result
}

export async function requestTranscript(
  hash: string,
  blob: Blob,
  meta: { title?: string; artist?: string; language?: string } = {},
): Promise<boolean> {
  const base = await findService()
  if (!base) return false
  try {
    const response = await fetch(`${base}/api/transcript/${hash}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "x-metadata": encodeMeta({ ...meta, language: meta.language ?? "fr" }),
      },
      body: blob,
    })
    return response.status === 202 || response.ok
  } catch {
    return false
  }
}

// -- bibliothèque partagée -------------------------------------------------

export async function listFamilyLibrary(): Promise<FamilyTrack[]> {
  const result = await request<{ items: FamilyTrack[] }>("/api/library")
  return result?.items ?? []
}

export async function uploadToFamily(
  blob: Blob,
  meta: {
    filename: string
    title: string
    artist: string
    album: string
    durationSec: number
    mime: string
    artworkBase64?: string
  },
): Promise<FamilyTrack | null> {
  const result = await request<{ item: FamilyTrack }>("/api/library", {
    method: "POST",
    headers: { "x-metadata": encodeMeta(meta) },
    body: blob,
  })
  return result?.item ?? null
}

export function familyAudioUrl(id: string): string | null {
  return resolvedBase ? `${resolvedBase}/api/library/${id}/audio` : null
}

export function familyArtworkUrl(id: string): string | null {
  return resolvedBase ? `${resolvedBase}/api/library/${id}/artwork` : null
}

/** Transforme un élément de la file partagée en morceau jouable. */
export function queueItemToTrack(item: QueueItem): import("@/lib/types").Track | null {
  if (item.kind !== "family") return null
  const base = resolvedBase
  if (!base) return null
  return {
    id: `family-${item.id}`,
    title: item.title,
    artist: item.artist,
    album: item.album,
    durationSec: item.durationSec,
    artwork: item.artwork || `${base}/api/library/${item.id}/artwork`,
    audio: `${base}/api/library/${item.id}/audio`,
    sourceUrl: `${base}/api/library/${item.id}`,
    license: "Bibliothèque de la famille",
  }
}

// -- file d'attente partagée ------------------------------------------------

export async function getFamilyQueue(): Promise<FamilyQueue | null> {
  return request<FamilyQueue>("/api/queue")
}

export async function addToFamilyQueue(item: QueueItem): Promise<FamilyQueue | null> {
  return request<FamilyQueue>("/api/queue", {
    method: "POST",
    headers: { "x-metadata": encodeMeta(item) },
  })
}

export async function removeFromFamilyQueue(id: string): Promise<FamilyQueue | null> {
  const base = await findService()
  if (!base) return null
  try {
    const response = await fetch(`${base}/api/queue/${id}`, { method: "DELETE" })
    if (!response.ok) return null
    return (await response.json()) as FamilyQueue
  } catch {
    return null
  }
}

export async function clearFamilyQueue(): Promise<FamilyQueue | null> {
  return request<FamilyQueue>("/api/queue/clear", { method: "POST" })
}

export async function setFamilyNowPlaying(item: QueueItem | null): Promise<FamilyQueue | null> {
  return request<FamilyQueue>("/api/queue/now", {
    method: "POST",
    headers: { "x-metadata": encodeMeta(item ?? {}) },
  })
}

// -- statistiques ------------------------------------------------------------

export async function getFamilyStats(): Promise<FamilyStats | null> {
  return request<FamilyStats>("/api/stats")
}

export async function reportPlay(play: {
  id: string
  title: string
  artist: string
  album: string
  artwork: string
  seconds: number
  source: string
  device: string
}): Promise<void> {
  await request("/api/stats", {
    method: "POST",
    headers: { "x-metadata": encodeMeta(play) },
  })
}
