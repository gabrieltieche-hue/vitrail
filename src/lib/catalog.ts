/**
 * Client du catalogue : recherche locale (instantanée) et recherche YouTube
 * (à la demande, ~10 s) passent par le service local.
 */

import { serviceBase } from "@/lib/family"
import type { Track } from "@/lib/types"

export type CatalogResult = {
  id: string
  title: string
  artist: string
  album: string
  durationSec: number
  artwork: string
  url: string
  rank: number
  available: boolean
  downloadable: boolean
  source: string
  size: number
  score: number
}

export type DownloadJob = {
  id: string
  url: string
  title: string
  artist: string
  status: "queued" | "running" | "done" | "failed"
  engine?: string
  error?: string
  createdAt: number
  startedAt?: number
  finishedAt?: number
}

async function base(): Promise<string | null> {
  const known = serviceBase()
  if (known) return known
  const { findService } = await import("@/lib/family")
  return findService()
}

export async function searchCatalog(query: string, limit = 40): Promise<CatalogResult[]> {
  const origin = await base()
  if (!origin) return []
  try {
    const response = await fetch(
      `${origin}/api/library/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    )
    if (!response.ok) return []
    const data = (await response.json()) as { results: CatalogResult[] }
    return data.results ?? []
  } catch {
    return []
  }
}

export async function searchYoutube(query: string, limit = 12): Promise<CatalogResult[]> {
  const origin = await base()
  if (!origin) return []
  try {
    const response = await fetch(
      `${origin}/api/library/youtube?q=${encodeURIComponent(query)}&limit=${limit}`,
    )
    if (!response.ok) return []
    const data = (await response.json()) as { results: CatalogResult[] }
    return data.results ?? []
  } catch {
    return []
  }
}

export async function requestDownload(result: CatalogResult): Promise<DownloadJob | null> {
  const origin = await base()
  if (!origin) return null
  try {
    const metadata = btoa(
      JSON.stringify({
        id: result.id,
        url: result.url,
        title: result.title,
        artist: result.artist,
      }),
    )
    const response = await fetch(`${origin}/api/download`, {
      method: "POST",
      headers: { "x-metadata": metadata },
    })
    if (!response.ok) return null
    const data = (await response.json()) as { job: DownloadJob }
    return data.job
  } catch {
    return null
  }
}

export async function listJobs(): Promise<DownloadJob[]> {
  const origin = await base()
  if (!origin) return []
  try {
    const response = await fetch(`${origin}/api/jobs`)
    if (!response.ok) return []
    const data = (await response.json()) as { jobs: DownloadJob[] }
    return data.jobs ?? []
  } catch {
    return []
  }
}

export async function lookupArtwork(
  results: CatalogResult[],
): Promise<Record<string, { artwork: string; durationSec: number }>> {
  const origin = await base()
  if (!origin) return {}
  const missing = results.filter(result => !result.artwork).slice(0, 12)
  if (missing.length === 0) return {}

  const found: Record<string, { artwork: string; durationSec: number }> = {}
  await Promise.all(
    missing.map(async result => {
      try {
        const params = new URLSearchParams({ title: result.title, artist: result.artist })
        const response = await fetch(`${origin}/api/library/lookup?${params}`)
        if (!response.ok) return
        const data = (await response.json()) as { artwork?: string; durationSec?: number }
        if (data.artwork) {
          found[result.id] = { artwork: data.artwork, durationSec: data.durationSec ?? 0 }
        }
      } catch {
        /* on continue */
      }
    }),
  )
  return found
}

/** Transforme un résultat du catalogue en morceau jouable. */
export function resultToTrack(result: CatalogResult): Track | null {
  const origin = serviceBase()
  if (!origin) return null
  return {
    id: result.id,
    title: result.title || "Sans titre",
    artist: result.artist || "Artiste inconnu",
    album: result.album || "Catalogue",
    durationSec: result.durationSec || 0,
    artwork: result.artwork || "",
    audio: `${origin}/api/stream/${encodeURIComponent(result.id)}`,
    sourceUrl: result.url || "",
    license: result.available ? "Bibliothèque de la famille" : "Catalogue",
  }
}
