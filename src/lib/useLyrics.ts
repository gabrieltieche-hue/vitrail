import { useEffect, useState } from "react"
import { loadLyrics } from "@/lib/lyrics"
import type { LyricsState, Track } from "@/lib/types"

export function useLyrics(track: Track | null): LyricsState {
  const [state, setState] = useState<LyricsState>({ status: "idle" })
  const trackId = track?.id ?? null
  const embedded = track?.embeddedLyrics ?? null

  useEffect(() => {
    if (!track || !trackId) {
      setState({ status: "idle" })
      return
    }
    // Paroles intégrées au fichier : on ne va pas les chercher sur LRCLIB.
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
    let cancelled = false
    setState({ status: "loading" })
    void loadLyrics(track).then(result => {
      if (!cancelled) setState(result)
    })
    return () => {
      cancelled = true
    }
  }, [track, trackId, embedded])

  return state
}
