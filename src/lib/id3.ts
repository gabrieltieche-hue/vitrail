/**
 * Lecture des métadonnées audio dans le navigateur, sans dépendance.
 *
 * - MP3 : balises ID3v2.2 / v2.3 / v2.4, avec repli ID3v1 en fin de fichier.
 * - FLAC, M4A, OGG, WAV : repli sur le nom de fichier (« Artiste - Titre »).
 */

export type AudioTags = {
  title: string | null
  artist: string | null
  album: string | null
  year: number | null
  trackNumber: number | null
  artwork: { blob: Blob; mime: string } | null
  /** Paroles non synchronisées intégrées au fichier (trame ID3 USLT). */
  lyrics: string | null
}

const EMPTY: AudioTags = {
  title: null,
  artist: null,
  album: null,
  year: null,
  trackNumber: null,
  artwork: null,
  lyrics: null,
}

function decodeText(bytes: Uint8Array, encoding: number): string {
  try {
    switch (encoding) {
      case 0:
        return new TextDecoder("iso-8859-1").decode(bytes).replace(/\0+$/, "").trim()
      case 1: {
        // UTF-16 avec BOM
        const little = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe
        const big = bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff
        if (little || big) {
          let start = 2
          if (bytes.length % 2 === 1) start += 1
          const usable = bytes.subarray(start, bytes.length - ((bytes.length - start) % 2))
          const text = new TextDecoder(little ? "utf-16le" : "utf-16be").decode(usable)
          return text.replace(/\0+$/, "").trim()
        }
        return new TextDecoder("utf-8").decode(bytes).replace(/\0+$/, "").trim()
      }
      case 2:
        return new TextDecoder("utf-16be").decode(bytes).replace(/\0+$/, "").trim()
      default:
        return new TextDecoder("utf-8").decode(bytes).replace(/\0+$/, "").trim()
    }
  } catch {
    return new TextDecoder("utf-8").decode(bytes).replace(/\0+$/, "").trim()
  }
}

function syncSafe(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) & 0x7f) * 0x200000 +
    ((bytes[offset + 1] ?? 0) & 0x7f) * 0x4000 +
    ((bytes[offset + 2] ?? 0) & 0x7f) * 0x80 +
    ((bytes[offset + 3] ?? 0) & 0x7f)
  )
}

function parseYear(value: string | null): number | null {
  if (!value) return null
  const match = value.match(/(\d{4})/)
  return match ? Number.parseInt(match[1] ?? "", 10) : null
}

function parseTrackNumber(value: string | null): number | null {
  if (!value) return null
  const match = value.match(/(\d+)/)
  return match ? Number.parseInt(match[1] ?? "", 10) : null
}

/** Découpe une chaîne ID3 textuelle multivalue (séparateur NUL en v2.4). */
function firstValue(value: string | null): string | null {
  if (!value) return null
  const parts = value.split("\0").map(part => part.trim()).filter(Boolean)
  return parts[0] ?? null
}

export function parseId3(buffer: ArrayBuffer): AudioTags {
  const bytes = new Uint8Array(buffer)
  const tags: AudioTags = { ...EMPTY }

  if (bytes.length < 10) return tags
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) {
    return { ...tags, ...parseId3v1(bytes) }
  }

  const major = bytes[3] ?? 4
  const tagSize = syncSafe(bytes, 6)
  const end = Math.min(bytes.length, 10 + tagSize)

  let offset = 10
  const idLength = major === 2 ? 3 : 4
  const headerLength = major === 2 ? 6 : 10

  while (offset + headerLength <= end) {
    const id = String.fromCharCode(...bytes.subarray(offset, offset + idLength)).replace(/\0/g, "")
    if (!id || !/^[A-Z0-9]+$/.test(id)) break

    let frameSize = 0
    if (major === 2) {
      frameSize =
        ((bytes[offset + 3] ?? 0) << 16) | ((bytes[offset + 4] ?? 0) << 8) | (bytes[offset + 5] ?? 0)
    } else if (major === 4) {
      frameSize = syncSafe(bytes, offset + 4)
    } else {
      frameSize =
        ((bytes[offset + 4] ?? 0) << 24) |
        ((bytes[offset + 5] ?? 0) << 16) |
        ((bytes[offset + 6] ?? 0) << 8) |
        (bytes[offset + 7] ?? 0)
    }

    const dataStart = offset + headerLength
    if (frameSize <= 0 || dataStart + frameSize > bytes.length) break
    const data = bytes.subarray(dataStart, dataStart + frameSize)

    switch (id) {
      case "TIT2":
      case "TT2":
        tags.title = firstValue(decodeText(data.subarray(1), data[0] ?? 0))
        break
      case "TPE1":
      case "TP1":
        tags.artist = firstValue(decodeText(data.subarray(1), data[0] ?? 0))
        break
      case "TPE2":
        tags.artist = tags.artist ?? firstValue(decodeText(data.subarray(1), data[0] ?? 0))
        break
      case "TALB":
      case "TAL":
        tags.album = firstValue(decodeText(data.subarray(1), data[0] ?? 0))
        break
      case "TRCK":
      case "TRK":
        tags.trackNumber = parseTrackNumber(firstValue(decodeText(data.subarray(1), data[0] ?? 0)))
        break
      case "TYER":
      case "TYE":
      case "TDRC":
      case "TDRL":
        tags.year = tags.year ?? parseYear(firstValue(decodeText(data.subarray(1), data[0] ?? 0)))
        break
      case "APIC":
      case "PIC": {
        if (tags.artwork) break
        const encoding = data[0] ?? 0
        let cursor = 1
        let mime = "image/jpeg"
        if (id === "PIC") {
          mime = String.fromCharCode(...data.subarray(1, 4)).toLowerCase()
          cursor = 4
        } else {
          const terminator = data.indexOf(0, cursor)
          if (terminator > cursor) {
            mime = decodeText(data.subarray(cursor, terminator), 0) || "image/jpeg"
          }
          cursor = terminator + 1
        }
        cursor += 1 // type de picture
        // description, terminée par NUL (pour l'encodage 0/3) ou double NUL (UTF-16)
        if (encoding === 1 || encoding === 2) {
          while (cursor + 1 < data.length && !(data[cursor] === 0 && data[cursor + 1] === 0)) cursor += 2
          cursor += 2
        } else {
          while (cursor < data.length && data[cursor] !== 0) cursor += 1
          cursor += 1
        }
        if (cursor < data.length) {
          const bytesImage = data.subarray(cursor)
          if (bytesImage.length > 0) {
            tags.artwork = { blob: new Blob([bytesImage as BlobPart], { type: mime }), mime }
          }
        }
        break
      }
      case "USLT":
      case "ULT": {
        if (tags.lyrics) break
        // langue (3 octets) + description terminée par NUL + texte
        const encoding = data[0] ?? 0
        let cursor = 4
        if (encoding === 1 || encoding === 2) {
          while (cursor + 1 < data.length && !(data[cursor] === 0 && data[cursor + 1] === 0)) cursor += 2
          cursor += 2
        } else {
          while (cursor < data.length && data[cursor] !== 0) cursor += 1
          cursor += 1
        }
        if (cursor < data.length) {
          const text = decodeText(data.subarray(cursor), encoding)
          if (text) tags.lyrics = text
        }
        break
      }
      default:
        break
    }

    offset = dataStart + frameSize
  }

  if (!tags.title && !tags.artist) {
    return { ...tags, ...parseId3v1(bytes) }
  }
  return tags
}

function parseId3v1(bytes: Uint8Array): Partial<AudioTags> {
  if (bytes.length < 128) return {}
  const start = bytes.length - 128
  if (bytes[start] !== 0x54 || bytes[start + 1] !== 0x41 || bytes[start + 2] !== 0x47) return {}

  const decode = (from: number, length: number): string => {
    const slice = bytes.subarray(from, from + length)
    const end = slice.indexOf(0)
    return new TextDecoder("iso-8859-1").decode(end === -1 ? slice : slice.subarray(0, end)).trim()
  }

  const result: Partial<AudioTags> = {}
  const title = decode(start + 3, 30)
  const artist = decode(start + 33, 30)
  const album = decode(start + 63, 30)
  const year = decode(start + 93, 4)
  if (title) result.title = title
  if (artist) result.artist = artist
  if (album) result.album = album
  const parsedYear = parseYear(year)
  if (parsedYear) result.year = parsedYear
  return result
}

/** Repli : « Artiste - Titre.ext » ou « Titre.ext ». */
export function tagsFromFilename(filename: string): Partial<AudioTags> {
  const base = filename.replace(/\.[a-z0-9]{2,4}$/i, "").replace(/_/g, " ").trim()
  const dash = base.match(/^(.+?)\s+[-–—]\s+(.+)$/)
  if (dash) {
    return { artist: dash[1]?.trim() ?? null, title: dash[2]?.trim() ?? null }
  }
  return { title: base || null }
}

export async function readTags(file: File): Promise<AudioTags> {
  const isMp3 = /\.mp3$/i.test(file.name) || file.type === "audio/mpeg" || file.type === "audio/mp3"
  if (!isMp3) {
    return { ...EMPTY, ...tagsFromFilename(file.name) }
  }
  try {
    const head = await file.slice(0, 512 * 1024).arrayBuffer()
    const parsed = parseId3(head)
    if (parsed.title || parsed.artist) return parsed
    return { ...parsed, ...tagsFromFilename(file.name) }
  } catch {
    return { ...EMPTY, ...tagsFromFilename(file.name) }
  }
}
