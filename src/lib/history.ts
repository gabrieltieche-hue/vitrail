/**
 * Historique d'écoute local : la base des capsules.
 *
 * Tout reste dans le navigateur (localStorage). Le service familial peut
 * ensuite recevoir un résumé pour une vue partagée.
 */

import { player, usePlayer } from "@/audio/player"
import { useEffect, useRef } from "react"

const STORAGE_KEY = "vitrail_history_v1"
const MAX_EVENTS = 3000
/** Pas d'enregistrement : on empile des événements de 30 s. */
const STEP_SECONDS = 15

export type PlayEvent = {
  id: string
  title: string
  artist: string
  album: string
  artwork: string
  source: string
  seconds: number
  at: number
}

export type History = {
  events: PlayEvent[]
}

function read(): History {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { events: [] }
    const parsed = JSON.parse(raw) as Partial<History>
    return { events: Array.isArray(parsed.events) ? parsed.events : [] }
  } catch {
    return { events: [] }
  }
}

function write(history: History): void {
  try {
    const events = history.events.slice(-MAX_EVENTS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ events }))
  } catch {
    /* quota plein : on ignore */
  }
}

export function recordPlay(event: Omit<PlayEvent, "at">): void {
  const history = read()
  history.events.push({ ...event, at: Date.now() })
  write(history)
}

export function getHistory(): History {
  return read()
}

export function clearHistory(): void {
  write({ events: [] })
}

// -- agrégats ---------------------------------------------------------------

export type Summary = {
  totalSeconds: number
  playCount: number
  uniqueTracks: number
  topTracks: { key: string; title: string; artist: string; artwork: string; count: number; seconds: number }[]
  topArtists: { key: string; count: number; seconds: number }[]
  topAlbums: { key: string; count: number; seconds: number }[]
  days: { day: string; seconds: number }[]
  recent: PlayEvent[]
}

export function summarise(history: History): Summary {
  const tracks = new Map<string, { title: string; artist: string; artwork: string; count: number; seconds: number }>()
  const artists = new Map<string, { count: number; seconds: number }>()
  const albums = new Map<string, { count: number; seconds: number }>()
  const days = new Map<string, number>()
  let totalSeconds = 0

  for (const event of history.events) {
    totalSeconds += event.seconds
    const track = tracks.get(event.id)
    if (track) {
      track.count += 1
      track.seconds += event.seconds
    } else {
      tracks.set(event.id, {
        title: event.title,
        artist: event.artist,
        artwork: event.artwork,
        count: 1,
        seconds: event.seconds,
      })
    }
    const artist = artists.get(event.artist) ?? { count: 0, seconds: 0 }
    artist.count += 1
    artist.seconds += event.seconds
    artists.set(event.artist, artist)
    const album = albums.get(event.album) ?? { count: 0, seconds: 0 }
    album.count += 1
    album.seconds += event.seconds
    albums.set(event.album, album)
    const day = new Date(event.at).toISOString().slice(0, 10)
    days.set(day, (days.get(day) ?? 0) + event.seconds)
  }

  const byCount = <T extends { count: number }>(map: Map<string, T>) =>
    [...map.entries()].sort((a, b) => b[1].count - a[1].count)

  return {
    totalSeconds,
    playCount: history.events.length,
    uniqueTracks: tracks.size,
    topTracks: byCount(tracks)
      .slice(0, 12)
      .map(([key, value]) => ({ key, ...value })),
    topArtists: byCount(artists)
      .slice(0, 12)
      .map(([key, value]) => ({ key, ...value })),
    topAlbums: byCount(albums)
      .slice(0, 12)
      .map(([key, value]) => ({ key, ...value })),
    days: [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([day, seconds]) => ({ day, seconds })),
    recent: history.events.slice(-24).reverse(),
  }
}

/**
 * Enregistre ce qui est réellement écouté : on accumule le temps de lecture
 * entre deux changements de morceau, et on ignore les écoutes de moins de
 * 10 secondes (une simple reconnaissance ne compte pas).
 */
export function useHistoryRecorder(): void {
  const state = usePlayer()
  const lastRef = useRef<{
    id: string | null
    position: number
    seconds: number
    recorded: number
    meta: { title: string; artist: string; album: string; artwork: string } | null
  }>({ id: null, position: 0, seconds: 0, recorded: 0, meta: null })

  useEffect(() => {
    const track = state.queue[state.index] ?? null
    const previous = lastRef.current

    const flush = (seconds: number) => {
      if (seconds < 10 || !previous.meta || !previous.id) return
      recordPlay({
        id: previous.id,
        title: previous.meta.title,
        artist: previous.meta.artist,
        album: previous.meta.album,
        artwork: previous.meta.artwork,
        source: previous.id.startsWith("local-") ? "local" : "demo",
        seconds: Math.round(seconds),
      })
    }

    if (previous.id && previous.id !== track?.id) {
      flush(previous.seconds - previous.recorded)
      lastRef.current = { id: track?.id ?? null, position: 0, seconds: 0, recorded: 0, meta: null }
      return
    }

    if (track && previous.id !== track.id) {
      lastRef.current = {
        id: track.id,
        position: 0,
        seconds: 0,
        recorded: 0,
        meta: { title: track.title, artist: track.artist, album: track.album, artwork: track.artwork },
      }
      return
    }

    // Une pause met en danger l'historique : on enregistre ce qui a été écouté.
    if (track && !state.playing) {
      const pending = previous.seconds - previous.recorded
      if (pending >= 10) {
        flush(pending)
        lastRef.current = { ...previous, recorded: previous.seconds }
      }
      return
    }

    if (track && state.playing) {
      const delta = state.time - previous.position
      // Un saut en avant de plus de 5 s est une recherche, pas de l'écoute.
      if (delta > 0 && delta < 5) {
        const seconds = previous.seconds + delta
        const pending = seconds - previous.recorded
        if (pending >= STEP_SECONDS) {
          flush(pending)
          lastRef.current = { ...previous, seconds, position: state.time, recorded: seconds }
          return
        }
        lastRef.current = { ...previous, seconds, position: state.time }
        return
      }
      lastRef.current = { ...previous, position: state.time }
    }
  }, [state.index, state.playing, state.time, state.queue])
}

/** Ferme la session en cours (changement d'onglet, fermeture). */
export function flushHistory(): void {
  const state = player.getSnapshot()
  const track = state.queue[state.index]
  if (!track) return
  if (state.time >= 10) {
    recordPlay({
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      artwork: track.artwork,
      source: track.id.startsWith("local-") ? "local" : "demo",
      seconds: Math.round(state.time),
    })
  }
}
