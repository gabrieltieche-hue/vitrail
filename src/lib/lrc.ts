import type { LyricLine, WordTiming } from "@/lib/types"

const LINE_TIME = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g
const WORD_TIME = /<(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?>/g

function toSeconds(min: string, sec: string, frac?: string): number {
  const m = Number.parseInt(min, 10)
  const s = Number.parseInt(sec, 10)
  let fraction = 0
  if (frac) {
    fraction = frac.length === 3 ? Number.parseInt(frac, 10) / 1000 : Number.parseInt(frac, 10) / 100
  }
  return m * 60 + s + fraction
}

/**
 * Parse du LRC simple (une ligne = un horodatage) ou enrichi (timestamps mot à mot
 * entre chevrons, produit par LRCLIB pour certains morceaux).
 */
export function parseLrc(raw: string): LyricLine[] {
  const lines: LyricLine[] = []

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue

    const stamps: number[] = []
    LINE_TIME.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = LINE_TIME.exec(line)) !== null) {
      stamps.push(toSeconds(match[1] ?? "0", match[2] ?? "0", match[3]))
    }
    if (stamps.length === 0) continue

    const body = line.replace(LINE_TIME, "").trim()
    const words: WordTiming[] = []

    if (body.includes("<")) {
      WORD_TIME.lastIndex = 0
      const marks: { time: number; end: number }[] = []
      let wordMatch: RegExpExecArray | null
      while ((wordMatch = WORD_TIME.exec(body)) !== null) {
        marks.push({
          time: toSeconds(wordMatch[1] ?? "0", wordMatch[2] ?? "0", wordMatch[3]),
          end: wordMatch.index,
        })
      }
      const pieces = body.split(WORD_TIME)
      const texts = pieces.filter(p => p.length > 0)
      for (let i = 0; i < marks.length; i += 1) {
        const mark = marks[i]
        const text = (texts[i] ?? "").trim()
        if (mark && text) words.push({ time: mark.time, text })
      }
    }

    const cleanText = body.replace(WORD_TIME, "").replace(/\s+/g, " ").trim()

    for (const time of stamps) {
      lines.push({ time, text: cleanText, ...(words.length > 0 ? { words } : {}) })
    }
  }

  lines.sort((a, b) => a.time - b.time)

  for (let i = 0; i < lines.length; i += 1) {
    const next = lines[i + 1]
    const current = lines[i]
    if (current && next) current.endTime = next.time
  }

  return lines
}

/** Index de la ligne active pour un temps donné, ou -1 avant la première. */
export function activeLineIndex(lines: LyricLine[], time: number): number {
  if (lines.length === 0) return -1
  if (time < (lines[0]?.time ?? 0)) return -1
  let lo = 0
  let hi = lines.length - 1
  let found = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const line = lines[mid]
    if (!line) break
    if (line.time <= time) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found
}
