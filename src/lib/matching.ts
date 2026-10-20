/**
 * Appariement des métadonnées d'un fichier importé avec une base de paroles.
 *
 * Les fichiers du monde réel ont des balises douteuses :
 *   titre  = "GIMS & La Mano 1.9 - PARISIENNE (Clip officiel)"
 *   artiste = "GIMS"
 * Il faut donc normaliser, generates des variantes, puis comparer par score.
 */

const NOISE_PARENTHESES = [
  "clip officiel",
  "official video",
  "official music video",
  "official audio",
  "official lyric video",
  "lyric video",
  "lyrics",
  "audio",
  "video",
  "visuel",
  "clip",
  "hd",
  "4k",
  "hq",
  "remastered",
  "remaster",
  "live",
  "mix",
  "version",
  "officiel",
  "official",
  "teaser",
  "extrait",
  "bonus",
  "explicit",
  "clean",
]

const FEAT_MARKERS = ["feat.", "feat ", "ft.", "ft ", "with ", "feat-", "featuring"]

export function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

export function normalize(value: string): string {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[«»]/g, " ")
    .replace(/[^\p{L}\p{N}\s&'.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Retire le contenu des parenthèses « parasites » (clip officiel, audio…). */
export function dropNoiseParentheticals(value: string): string {
  return value.replace(/\(([^)]*)\)/g, (match, inner: string) => {
    const cleaned = normalize(inner)
    const isNoise = NOISE_PARENTHESES.some(phrase => cleaned === phrase || cleaned.startsWith(`${phrase} `))
    return isNoise ? " " : match
  })
}

/** Coupe après un marqueur de feat. (feat., ft., avec…). */
export function dropFeat(value: string): string {
  const lowered = stripAccents(value).toLowerCase()
  let cut = value.length
  for (const marker of FEAT_MARKERS) {
    const index = lowered.indexOf(marker)
    if (index > 0) cut = Math.min(cut, index)
  }
  return value.slice(0, cut).trim()
}

/** "GIMS & La Mano 1.9" → "gims & la mano" (on retire les numéros de version). */
export function stripVersionNumbers(value: string): string {
  return value
    .split(" ")
    .map(token => (/^\d+(\.\d+)?$/.test(token) ? "" : token))
    .filter(Boolean)
    .join(" ")
}

function tokenize(value: string): string[] {
  return normalize(value)
    .replace(/['.-]/g, " ")
    .split(/\s+/)
    .filter(token => token.length > 0 && !/^\d+$/.test(token))
}

/** similarité de Dice sur les jetons, avec bonus d'inclusion. */
export function similarity(a: string, b: string): number {
  const tokensA = new Set(tokenize(a))
  const tokensB = new Set(tokenize(b))
  if (tokensA.size === 0 || tokensB.size === 0) return 0

  let common = 0
  for (const token of tokensA) if (tokensB.has(token)) common += 1

  const dice = (2 * common) / (tokensA.size + tokensB.size)

  const listA = [...tokensA]
  const listB = [...tokensB]
  const contained =
    listA.every(token => tokensB.has(token)) || listB.every(token => tokensA.has(token))
  const startsWith = listA.join(" ") === listB.join(" ") || listA.join(" ").startsWith(listB.join(" "))

  return Math.min(1, dice + (contained ? 0.18 : 0) + (startsWith ? 0.12 : 0))
}

export type MetadataVariant = {
  title: string
  artist: string
}

/**
 * Variantes plausibles du titre et de l'artiste, de la plus fiable à la moins fiable.
 *
 * « GIMS & La Mano 1.9 - PARISIENNE (Clip officiel) » + artiste « GIMS »
 *   → titres   : "PARISIENNE", "GIMS & La Mano 1.9 - PARISIENNE", …
 *   → artistes : "GIMS & La Mano", "GIMS", …
 */
export function metadataVariants(track: { title: string; artist: string }): MetadataVariant[] {
  const rawTitle = track.title.trim()
  const rawArtist = track.artist.trim()

  const titles: string[] = []
  const pushTitle = (value: string) => {
    const cleaned = value.replace(/\s+/g, " ").trim()
    if (cleaned && !titles.includes(cleaned)) titles.push(cleaned)
  }

  // Sources brutes : la partie après le dernier « - » est souvent le vrai titre.
  const sources: string[] = []
  const dashIndex = rawTitle.lastIndexOf(" - ")
  if (dashIndex > 0) sources.push(rawTitle.slice(dashIndex + 3))
  sources.push(rawTitle)

  for (const source of sources) {
    pushTitle(source)
    pushTitle(dropFeat(dropNoiseParentheticals(source)))
    pushTitle(stripVersionNumbers(dropFeat(dropNoiseParentheticals(source))))
  }

  const artists: string[] = []
  const pushArtist = (value: string) => {
    const cleaned = value.replace(/\s+/g, " ").trim()
    if (cleaned && !artists.includes(cleaned)) artists.push(cleaned)
  }

  pushArtist(stripVersionNumbers(dropFeat(dropNoiseParentheticals(rawArtist))))
  pushArtist(dropFeat(dropNoiseParentheticals(rawArtist)))
  pushArtist(rawArtist)

  // Le titre peut contenir l'artiste : on tente de l'extraire.
  for (const title of [...titles]) {
    const lower = title.toLowerCase()
    const artistLower = rawArtist.toLowerCase()
    if (lower.startsWith(artistLower)) {
      const rest = title.slice(rawArtist.length).replace(/^[\s\-–—:]+/, "").trim()
      if (rest) {
        pushTitle(rest)
        pushTitle(stripVersionNumbers(rest))
      }
    }
  }

  const variants: MetadataVariant[] = []
  for (const title of titles) {
    for (const artist of artists) {
      const key = `${title}|${artist}`
      if (!variants.some(variant => `${variant.title}|${variant.artist}` === key)) {
        variants.push({ title, artist })
      }
    }
  }
  return variants
}

/** Score global d'une correspondance LRCLIB. On compare le candidat à la
 *  meilleure des variantes du titre et de l'artiste : c'est ce qui permet de
 *  reconnaître « PARISIENNE » dans un titre balisé « GIMS & La Mano - PARISIENNE (Clip officiel) ». */
export function scoreMatch(
  candidate: { title: string; artist: string; duration: number },
  target: {
    title: string | string[]
    artist: string | string[]
    durationSec?: number | undefined
  },
): { score: number; titleSim: number; artistSim: number; durationDelta: number } {
  const titles = Array.isArray(target.title) ? target.title : [target.title]
  const artists = Array.isArray(target.artist) ? target.artist : [target.artist]

  const titleSim = Math.max(0, ...titles.map(title => similarity(candidate.title, title)))
  const artistSim = Math.max(0, ...artists.map(artist => similarity(candidate.artist, artist)))

  const durationDelta =
    target.durationSec && target.durationSec > 0
      ? Math.abs((candidate.duration ?? 0) - target.durationSec)
      : 0

  let durationScore = 0.5
  if (target.durationSec && target.durationSec > 0) {
    if (durationDelta <= 2) durationScore = 1
    else if (durationDelta <= 6) durationScore = 0.7
    else if (durationDelta <= 15) durationScore = 0.3
    else durationScore = 0
  }

  return {
    score: titleSim * 0.55 + artistSim * 0.3 + durationScore * 0.15,
    titleSim,
    artistSim,
    durationDelta,
  }
}
