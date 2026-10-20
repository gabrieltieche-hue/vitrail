import { useEffect, useRef, useState } from "react"
import { getTranscript, requestTranscript } from "@/lib/family"
import { loadLyrics } from "@/lib/lyrics"
import type { Lyrics, LyricsState, Track } from "@/lib/types"

/**
 * Moteur de paroles.
 *
 * Ordre de recherche :
 *   1. Paroles intégrées au fichier (ID3) — instantanées.
 *   2. Transcription locale (whisper.cpp sur le service familial) — synchronisée
 *      au mot près, disponible pour *n'importe quel* morceau importé.
 *   3. LRCLIB — pour les morceaux connus du catalogue public.
 *
 * La transcription est déclenchée en tâche de fond : l'écran affiche
 * « transcription en cours » puis bascule sur les paroles dès qu'elles sont là.
 */

const TRANSCRIPT_CACHE = "vitrail_transcripts_v1"
const POLL_INTERVAL = 4000
const POLL_LIMIT = 240 // ~16 minutes

type Cached = { lines: Lyrics["synced"]; plain: string[] | null; at: number }

function readCache(): Record<string, Cached> {
  try {
    const raw = localStorage.getItem(TRANSCRIPT_CACHE)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === "object" ? (parsed as Record<string, Cached>) : {}
  } catch {
    return {}
  }
}

function writeCache(hash: string, value: Cached): void {
  try {
    const cache = readCache()
    cache[hash] = value
    const entries = Object.entries(cache)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, 60)
    localStorage.setItem(TRANSCRIPT_CACHE, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    /* quota plein : on ignore */
  }
}

function transcriptToLyrics(transcript: { lines?: unknown[]; text?: string; id: string }): Lyrics | null {
  const rawLines = Array.isArray(transcript.lines) ? transcript.lines : []
  const lines = rawLines
    .map(line => {
      const item = line as {
        time?: number
        endTime?: number
        text?: string
        words?: { time: number; text: string }[]
      }
      if (typeof item.time !== "number" || !item.text) return null
      return {
        time: item.time,
        text: item.text,
        ...(item.endTime !== undefined ? { endTime: item.endTime } : {}),
        ...(Array.isArray(item.words) && item.words.length > 0 ? { words: item.words } : {}),
      }
    })
    .filter((line): line is NonNullable<typeof line> => line !== null)

  if (lines.length > 0) return { synced: lines, plain: null, lrclibId: 0 }

  const text = transcript.text ?? ""
  const plain = text.split(/\r?\n/).filter(line => line.trim().length > 0)
  if (plain.length === 0) return null
  return { synced: null, plain, lrclibId: 0 }
}

export function useLyrics(track: Track | null): LyricsState {
  const [state, setState] = useState<LyricsState>({ status: "idle" })
  const trackId = track?.id ?? null
  const embedded = track?.embeddedLyrics ?? null
  const fileHash = track?.fileHash ?? null
  const pollCount = useRef(0)

  useEffect(() => {
    if (!track || !trackId) {
      setState({ status: "idle" })
      return
    }

    let cancelled = false
    pollCount.current = 0

    // 1. Paroles intégrées au fichier.
    if (embedded) {
      const lines = embedded
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0)
      setState({
        status: "ready",
        lyrics: { synced: null, plain: lines.length > 0 ? lines : null, lrclibId: 0 },
      })
      return
    }

    const run = async () => {
      // 2. LRCLIB : instantané, et parfait quand le morceau est connu.
      setState({ status: "loading" })
      const known = await loadLyrics(track)
      if (cancelled) return
      if (known.status === "ready") {
        setState(known)
        return
      }

      // 3. Transcription locale, par empreinte du fichier.
      if (fileHash) {
        const cached = readCache()[fileHash]
        if (cached) {
          setState({ status: "ready", lyrics: { synced: cached.lines, plain: cached.plain, lrclibId: 0 } })
          return
        }

        const existing = await getTranscript(fileHash)
        if (cancelled) return
        if (existing) {
          const lyrics = transcriptToLyrics(existing)
          if (lyrics) {
            writeCache(fileHash, { lines: lyrics.synced, plain: lyrics.plain, at: Date.now() })
            setState({ status: "ready", lyrics })
            return
          }
          // Un transcript vide n'est pas exploitable : on redemande.
        }

        // Pas encore transcrite : on lance le calcul en tâche de fond.
        setState({ status: "transcribing" })
        const blob = await fetch(track.audio).then(response => response.blob()).catch(() => null)
        if (cancelled) return
        if (blob) {
          const started = await requestTranscript(fileHash, blob, {
            title: track.title,
            artist: track.artist,
          })
          if (!started && !cancelled) {
            setState({ status: "loading" })
          }
        }

        // On interroge le service jusqu'à ce que la transcription soit prête.
        const timer = window.setInterval(async () => {
          if (cancelled) {
            window.clearInterval(timer)
            return
          }
          pollCount.current += 1
          const ready = await getTranscript(fileHash)
          if (ready) {
            window.clearInterval(timer)
            const lyrics = transcriptToLyrics(ready)
            if (lyrics) {
              writeCache(fileHash, { lines: lyrics.synced, plain: lyrics.plain, at: Date.now() })
              if (!cancelled) setState({ status: "ready", lyrics })
              return
            }
          }
          if (pollCount.current > POLL_LIMIT) {
            window.clearInterval(timer)
            if (!cancelled) setState(known.status === "none" ? { status: "none" } : known)
          }
        }, POLL_INTERVAL)

        return
      }

      if (!cancelled) setState(known)
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [track, trackId, embedded, fileHash])

  return state
}
