/**
 * Bibliothèque personnelle : les fichiers importés par l'utilisateur sont stockés
 * dans IndexedDB (IndexedDB uniquement — localStorage est plafonné à ~5 Mo et
 * n'accepte que des chaînes).
 */

import { readTags } from "@/lib/id3"
import type { Track } from "@/lib/types"

const DB_NAME = "vitrail-local"
const DB_VERSION = 1
const STORE = "tracks"

export type LocalRecord = {
  id: string
  title: string
  artist: string
  album: string
  year: number | null
  durationSec: number
  addedAt: number
  filename: string
  mime: string
  size: number
  blob: Blob
  artwork: Blob | null
  artworkMime: string | null
  lyrics: string | null
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" })
        store.createIndex("addedAt", "addedAt")
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("IndexedDB indisponible"))
  })
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    db =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode)
        const request = run(transaction.objectStore(STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error("Requête IndexedDB échouée"))
      }),
  )
}

export async function listRecords(): Promise<LocalRecord[]> {
  const all = await tx<LocalRecord[]>("readonly", store => store.getAll() as IDBRequest<LocalRecord[]>)
  return all.sort((a, b) => b.addedAt - a.addedAt)
}

export async function putRecord(record: LocalRecord): Promise<void> {
  await tx("readwrite", store => store.put(record) as IDBRequest<IDBValidKey>)
}

export async function deleteRecord(id: string): Promise<void> {
  await tx("readwrite", store => store.delete(id) as IDBRequest<undefined>)
}

export async function clearRecords(): Promise<void> {
  await tx("readwrite", store => store.clear() as IDBRequest<undefined>)
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null
  const estimate = await navigator.storage.estimate()
  return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 }
}

async function readDuration(blob: Blob): Promise<number> {
  const url = URL.createObjectURL(blob)
  try {
    return await new Promise<number>(resolve => {
      const audio = new Audio()
      const done = (value: number) => {
        audio.removeAttribute("src")
        resolve(value)
      }
      audio.preload = "metadata"
      audio.addEventListener("loadedmetadata", () => {
        done(Number.isFinite(audio.duration) ? Math.round(audio.duration) : 0)
      })
      audio.addEventListener("error", () => done(0))
      audio.src = url
    })
  } finally {
    // Le blob reste en mémoire : on ne révoque l'URL qu'après la lecture.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

export type ImportResult = {
  added: number
  failed: { name: string; reason: string }[]
  totalBytes: number
}

export async function importFiles(files: File[]): Promise<ImportResult> {
  const result: ImportResult = { added: 0, failed: [], totalBytes: 0 }
  const existing = new Set((await listRecords()).map(record => `${record.filename}::${record.size}`))

  for (const file of files) {
    try {
      const key = `${file.name}::${file.size}`
      if (existing.has(key)) {
        result.failed.push({ name: file.name, reason: "déjà importé" })
        continue
      }
      const tags = await readTags(file)
      const durationSec = await readDuration(file)
      const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const record: LocalRecord = {
        id,
        title: tags.title ?? file.name.replace(/\.[a-z0-9]{2,4}$/i, ""),
        artist: tags.artist ?? "Artiste inconnu",
        album: tags.album ?? "Ma bibliothèque",
        year: tags.year,
        durationSec,
        addedAt: Date.now(),
        filename: file.name,
        mime: file.type || "audio/mpeg",
        size: file.size,
        blob: file,
        artwork: tags.artwork?.blob ?? null,
        artworkMime: tags.artwork?.mime ?? null,
        lyrics: tags.lyrics,
      }
      await putRecord(record)
      existing.add(key)
      result.added += 1
      result.totalBytes += file.size
    } catch (error) {
      result.failed.push({
        name: file.name,
        reason: error instanceof Error ? error.message : "import impossible",
      })
    }
  }

  return result
}

export function recordToTrack(record: LocalRecord, audioUrl: string, artworkUrl: string | null): Track {
  return {
    id: record.id,
    title: record.title,
    artist: record.artist,
    album: record.album,
    ...(record.year !== null ? { year: record.year } : {}),
    durationSec: record.durationSec,
    artwork: artworkUrl ?? "",
    audio: audioUrl,
    sourceUrl: "local://",
    license: "Fichier personnel",
    ...(record.lyrics ? { embeddedLyrics: record.lyrics } : {}),
  }
}

const AUDIO_EXTENSIONS = /\.(mp3|flac|m4a|aac|ogg|oga|opus|wav|aiff?|wma)$/i

type DirectoryHandle = {
  name: string
  values: () => AsyncIterableIterator<{ kind: string; name: string; getFile: () => Promise<File> }>
}

async function collectFiles(handle: DirectoryHandle, depth = 0): Promise<File[]> {
  const files: File[] = []
  if (depth > 4) return files
  for await (const entry of handle.values()) {
    if (entry.kind === "file" && AUDIO_EXTENSIONS.test(entry.name)) {
      try {
        files.push(await entry.getFile())
      } catch {
        /* fichier illisible */
      }
    } else if (entry.kind === "directory" && depth < 4) {
      files.push(...(await collectFiles(entry as unknown as DirectoryHandle, depth + 1)))
    }
  }
  return files
}

/**
 * Ouvre le sélecteur de dossier du navigateur (File System Access API).
 * Les fichiers sont lus en place, sans copie : le dossier reste la source
 * de vérité, l'app n'en garde que les métadonnées.
 */
export async function pickDirectory(): Promise<File[] | null> {
  const picker = (window as unknown as { showDirectoryPicker?: () => Promise<DirectoryHandle> })
    .showDirectoryPicker
  if (!picker) return null
  const handle = await picker.call(window)
  return collectFiles(handle)
}
