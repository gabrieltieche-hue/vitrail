import { parseLrc } from "@/lib/lrc"
import type { Lyrics, LyricsState, Track } from "@/lib/types"

const API = "https://lrclib.net/api"
const CACHE_KEY = "vitrail_lyrics_v1"
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30

type CachedEntry = {
  fetchedAt: number
  lrclibId: number
  synced: string | null
  plain: string | null
}

type Cache = Record<string, CachedEntry>

type LrclibRecord = {
  id: number
  trackName: string
  artistName: string
  duration: number
  instrumental: boolean
  plainLyrics: string | null
  syncedLyrics: string | null
}

function readCache(): Cache {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === "object") return parsed as Cache
    return {}
  } catch {
    return {}
  }
}

function writeCache(cache: Cache): void {
  try {
    const entries = Object.entries(cache)
      .sort((a, b) => b[1].fetchedAt - a[1].fetchedAt)
      .slice(0, 400)
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    /* quota plein : on ignore */
  }
}

async function fetchWithRetry(url: string, attempts = 3): Promise<Response> {
  let lastError: unknown = null
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" } })
      if (response.status === 503 || response.status === 429) {
        const wait = Number.parseInt(response.headers.get("retry-after") ?? "", 10)
        await new Promise(resolve => setTimeout(resolve, Number.isFinite(wait) ? wait * 1000 : 1200 * (i + 1)))
        continue
      }
      return response
    } catch (error) {
      lastError = error
      await new Promise(resolve => setTimeout(resolve, 800 * (i + 1)))
    }
  }
  throw lastError ?? new Error("LRCLIB injoignable")
}

function toLyrics(entry: CachedEntry): Lyrics | null {
  const synced = entry.synced ? parseLrc(entry.synced) : []
  const plain = entry.plain ? entry.plain.split(/\r?\n/).filter(line => line.trim().length > 0) : null
  if (synced.length === 0 && (!plain || plain.length === 0)) return null
  return {
    synced: synced.length > 0 ? synced : null,
    plain,
    lrclibId: entry.lrclibId,
  }
}

/** Cherche les paroles du morceau, avec cache local et sélection par durée la plus proche. */
export async function loadLyrics(track: Track): Promise<LyricsState> {
  const cache = readCache()
  const cached = cache[track.id]
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    const lyrics = toLyrics(cached)
    return lyrics ? { status: "ready", lyrics } : { status: "none" }
  }

  const params = new URLSearchParams({ track_name: track.title, artist_name: track.artist })
  if (track.album) params.set("album_name", track.album)

  try {
    const response = await fetchWithRetry(`${API}/search?${params.toString()}`)
    if (!response.ok) return { status: "error", message: `LRCLIB ${response.status}` }

    const records = (await response.json()) as LrclibRecord[]
    if (!Array.isArray(records) || records.length === 0) {
      writeCache({ ...cache, [track.id]: { fetchedAt: Date.now(), lrclibId: 0, synced: null, plain: null } })
      return { status: "none" }
    }

    const target = track.durationSec ?? 0
    let best: LrclibRecord | null = null
    let bestDelta = Number.POSITIVE_INFINITY
    for (const record of records) {
      if (record.instrumental && !record.syncedLyrics) continue
      const delta = target > 0 ? Math.abs((record.duration ?? 0) - target) : 0
      const hasLyrics = Boolean(record.syncedLyrics || record.plainLyrics)
      if (!hasLyrics) continue
      if (delta < bestDelta) {
        best = record
        bestDelta = delta
      }
    }

    if (!best || (target > 0 && bestDelta > 8)) {
      writeCache({ ...cache, [track.id]: { fetchedAt: Date.now(), lrclibId: 0, synced: null, plain: null } })
      return { status: "none" }
    }

    const entry: CachedEntry = {
      fetchedAt: Date.now(),
      lrclibId: best.id,
      synced: best.syncedLyrics,
      plain: best.plainLyrics,
    }
    writeCache({ ...cache, [track.id]: entry })

    const lyrics = toLyrics(entry)
    return lyrics ? { status: "ready", lyrics } : { status: "none" }
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "erreur inconnue" }
  }
}
