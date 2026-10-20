import { useEffect, useState } from "react"
import { loadLyrics } from "@/lib/lyrics"
import type { LyricsState, Track } from "@/lib/types"

export function useLyrics(track: Track | null): LyricsState {
  const [state, setState] = useState<LyricsState>({ status: "idle" })
  const trackId = track?.id ?? null

  useEffect(() => {
    if (!track || !trackId) {
      setState({ status: "idle" })
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
  }, [track, trackId])

  return state
}
