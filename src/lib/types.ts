export type Track = {
  id: string
  title: string
  artist: string
  album: string
  year?: number
  durationSec?: number
  artwork: string
  audio: string
  sourceUrl?: string
  license?: string
  embeddedLyrics?: string
  fileHash?: string
}

export type WordTiming = {
  time: number
  text: string
}

export type LyricLine = {
  time: number
  text: string
  words?: WordTiming[]
  endTime?: number
}

export type Lyrics = {
  synced: LyricLine[] | null
  plain: string[] | null
  lrclibId: number
}

export type LyricsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "transcribing" }
  | { status: "ready"; lyrics: Lyrics }
  | { status: "none" }
  | { status: "error"; message: string }

export type RepeatMode = "off" | "all" | "one"
