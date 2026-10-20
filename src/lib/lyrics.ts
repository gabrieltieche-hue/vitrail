import { metadataVariants, scoreMatch } from "@/lib/matching"
import { parseLrc } from "@/lib/lrc"
import type { Lyrics, LyricsState, Track } from "@/lib/types"

const API = "https://lrclib.net/api"
const CACHE_KEY = "vitrail_lyrics_v2"
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30

type CachedEntry = {
  fetchedAt: number
  lrclibId: number
  /** LRC brut, conservé tel quel pour préserver la synchronisation mot à mot. */
  synced: string | null
  plain: string | null
  matchedTitle?: string
  matchedArtist?: string
}

type Cache = Record<string, CachedEntry>

type LrclibRecord = {
  id: number
  trackName: string
  artistName: string
  albumName: string
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

function buildLyrics(syncedRaw: string | null, plainRaw: string | null, lrclibId: number): Lyrics | null {
  const synced = syncedRaw ? parseLrc(syncedRaw) : []
  const plain = plainRaw ? plainRaw.split(/\r?\n/).filter(line => line.trim().length > 0) : null
  if (synced.length === 0 && (!plain || plain.length === 0)) return null
  return { synced: synced.length > 0 ? synced : null, plain, lrclibId }
}

export type MatchInfo = {
  title: string
  artist: string
  durationDelta: number
}

export type LyricsResult = {
  lyrics: Lyrics
  raw: { synced: string | null; plain: string | null }
  match?: MatchInfo
}

async function searchLrclib(title: string, artist: string): Promise<LrclibRecord[]> {
  const params = new URLSearchParams()
  if (title) params.set("track_name", title)
  if (artist) params.set("artist_name", artist)
  const response = await fetchWithRetry(`${API}/search?${params.toString()}`)
  if (!response.ok) return []
  const records = (await response.json()) as LrclibRecord[]
  return Array.isArray(records) ? records : []
}

/**
 * Cherche les paroles d'un morceau : plusieurs variantes de titre et d'artiste
 * sont essayées, puis chaque résultat est noté (titre, artiste, durée).
 */
export async function findLyrics(track: Track): Promise<LyricsResult | null> {
  const variants = metadataVariants({ title: track.title, artist: track.artist })
  const seen = new Set<number>()
  const candidates: LrclibRecord[] = []

  for (const variant of variants.slice(0, 3)) {
    const records = await searchLrclib(variant.title, variant.artist)
    for (const record of records) {
      if (seen.has(record.id)) continue
      seen.add(record.id)
      candidates.push(record)
    }
    if (candidates.length >= 15) break
  }

  if (candidates.length === 0) return null

  let best: { record: LrclibRecord; score: number; durationDelta: number } | null = null

  for (const record of candidates) {
    if (record.instrumental) continue
    if (!record.syncedLyrics && !record.plainLyrics) continue

    const scored = scoreMatch(
      { title: record.trackName, artist: record.artistName, duration: record.duration },
      {
        title: variants.map(variant => variant.title),
        artist: variants.map(variant => variant.artist),
        durationSec: track.durationSec,
      },
    )
    // Le titre prime : une durée qui colle avec un autre titre ne doit pas passer.
    if (scored.titleSim < 0.62) continue
    if (track.durationSec && track.durationSec > 0 && scored.durationDelta > 12) continue
    // Le risque de prendre la chanson d'un homonyme est réel : si l'artiste
    // est connu, il doit correspondre.
    const artistKnown = track.artist.trim().length > 3 && !/^(artiste inconnu|unknown)$/i.test(track.artist)
    if (artistKnown && scored.artistSim < 0.45) continue
    if (!best || scored.score > best.score) {
      best = { record, score: scored.score, durationDelta: scored.durationDelta }
    }
  }

  if (!best) return null

  const lyrics = buildLyrics(best.record.syncedLyrics, best.record.plainLyrics, best.record.id)
  if (!lyrics) return null

  return {
    lyrics,
    raw: { synced: best.record.syncedLyrics, plain: best.record.plainLyrics },
    match: {
      title: best.record.trackName,
      artist: best.record.artistName,
      durationDelta: best.durationDelta,
    },
  }
}

export async function loadLyrics(track: Track): Promise<LyricsState> {
  const cache = readCache()
  const cached = cache[track.id]
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    const lyrics = buildLyrics(cached.synced, cached.plain, cached.lrclibId)
    if (lyrics) return { status: "ready", lyrics }
  }

  try {
    const result = await findLyrics(track)
    if (!result) {
      writeCache({
        ...cache,
        [track.id]: { fetchedAt: Date.now(), lrclibId: 0, synced: null, plain: null },
      })
      return { status: "none" }
    }

    writeCache({
      ...cache,
      [track.id]: {
        fetchedAt: Date.now(),
        lrclibId: result.lyrics.lrclibId,
        synced: result.raw.synced,
        plain: result.raw.plain,
        ...(result.match ? { matchedTitle: result.match.title, matchedArtist: result.match.artist } : {}),
      },
    })

    return { status: "ready", lyrics: result.lyrics }
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "erreur inconnue" }
  }
}
