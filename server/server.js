#!/usr/bin/env node
/**
 * Vitrail — service local de la famille.
 *
 * Rôle (sans Spotify, tout local) :
 *   1. Bibliothèque partagée : un appareil importe des fichiers, les téléverse
 *      ici, et tout le monde peut les jouer.
 *   2. Transcription : les paroles des morceaux que personne ne connaît sont
 *      calculées ici (whisper.cpp) et mises en cache.
 *   3. File d'attente partagée : la file de la famille, en temps réel.
 *   4. Statistiques : base des capsules d'écoute.
 *
 * Zéro dépendance : uniquement le module `http` de Node.
 */

const http = require("node:http")
const fs = require("node:fs")
const fsp = require("node:fs/promises")
const path = require("node:path")
const os = require("node:os")
const { spawn } = require("node:child_process")
const crypto = require("node:crypto")

const PORT = Number(process.env.VITRAIL_PORT || 8099)
const DATA_DIR = process.env.VITRAIL_DATA || "/root/vitrail-data"
const DIST_DIR = process.env.VITRAIL_DIST || "/root/vitrail/dist"
const WHISPER_BIN = process.env.VITRAIL_WHISPER || "/root/whisper.cpp/build/bin/whisper-cli"
const WHISPER_MODEL = process.env.VITRAIL_MODEL || "/root/models/ggml-base.bin"
const WHISPER_LIB_DIR = path.dirname(WHISPER_BIN)
const WHISPER_THREADS = Number(process.env.VITRAIL_THREADS || 6)
const FFMPEG = "ffmpeg"

const LIB_DIR = path.join(DATA_DIR, "library")
const LYRIC_DIR = path.join(DATA_DIR, "lyrics")
const TRANSCRIPT_DIR = path.join(DATA_DIR, "transcripts")
const TMP_DIR = path.join(DATA_DIR, "tmp")
const QUEUE_FILE = path.join(DATA_DIR, "queue.json")
const STATS_FILE = path.join(DATA_DIR, "stats.json")

for (const dir of [DATA_DIR, LIB_DIR, LYRIC_DIR, TRANSCRIPT_DIR, TMP_DIR]) fs.mkdirSync(dir, { recursive: true })

// ---------------------------------------------------------------- utilitaires

function json(res, code, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-Filename,X-Metadata",
  })
  res.end(body)
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"))
  } catch {
    return fallback
  }
}

function writeJson(file, value) {
  const temporary = `${file}.tmp`
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2))
  fs.renameSync(temporary, file)
}

function readBody(req, limitBytes = 200 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on("data", chunk => {
      size += chunk.length
      if (size > limitBytes) {
        reject(new Error("Fichier trop volumineux"))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on("end", () => resolve(Buffer.concat(chunks)))
    req.on("error", reject)
  })
}

function baseName(name) {
  return (name || "morceau").replace(/[^\p{L}\p{N} ._'-]/gu, "_").slice(0, 120)
}

function readMetadata(req) {
  const raw = req.headers["x-metadata"]
  if (!raw) return {}
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf8"))
  } catch {
    return {}
  }
}

// ------------------------------------------------------------------库里 library

async function listLibrary() {
  const files = await fsp.readdir(LIB_DIR).catch(() => [])
  const items = []
  for (const file of files) {
    if (!file.endsWith(".json")) continue
    const meta = readJson(path.join(LIB_DIR, file), null)
    if (meta) items.push(meta)
  }
  items.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
  return items
}

async function saveLibraryItem(meta) {
  await fsp.writeFile(path.join(LIB_DIR, `${meta.id}.json`), JSON.stringify(meta, null, 2))
  return meta
}

async function deleteLibraryItem(id) {
  await fsp.unlink(path.join(LIB_DIR, `${id}.json`)).catch(() => {})
  await fsp.unlink(path.join(LIB_DIR, `${id}.bin`)).catch(() => {})
  await fsp.unlink(path.join(LIB_DIR, `${id}.art`)).catch(() => {})
  await fsp.unlink(path.join(LYRIC_DIR, `${id}.json`)).catch(() => {})
}

// ------------------------------------------------------------------ transcription

function hasWhisper() {
  return fs.existsSync(WHISPER_BIN) && fs.existsSync(WHISPER_MODEL)
}

/** Convertit n'importe quel format audio en WAV 16 kHz mono. */
function toWav16k(input, output) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      input,
      "-ar",
      "16000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      output,
    ])
    let stderr = ""
    child.stderr.on("data", chunk => (stderr += chunk))
    child.on("error", reject)
    child.on("close", code =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg a échoué (${code}) : ${stderr.slice(-400)}`)),
    )
  })
}

/**
 * Découpe l'audio en blocs de 28 s avec 2 s de chevauchement.
 *
 *.whisper.cpp traite le fichier en fenêtres de 30 s avec un contexte glissant :
 * dès qu'un jeton « musique » apparaît, le modèle contamine toutes les
 * fenêtres suivantes et ne transcrit plus rien. En découpant nous-mêmes et en
 * relançant whisper sur chaque bloc, chaque bloc est traité à froid — et le
 * texte est complet.
 */
const CHUNK_LENGTH = 28
const CHUNK_STEP = 26

async function splitIntoChunks(wavPath) {
  const directory = path.join(TMP_DIR, `chunks-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`)
  await fsp.mkdir(directory, { recursive: true })
  const chunks = []
  const total = durationOf(wavPath)

  for (let start = 0; ; start += CHUNK_STEP) {
    const output = path.join(directory, `c${String(chunks.length).padStart(3, "0")}.wav`)
    const code = await runFfmpegExtract(wavPath, output, start, CHUNK_LENGTH)
    if (code !== 0) break
    const stat = await fsp.stat(output).catch(() => null)
    if (!stat || stat.size < 1000) {
      await fsp.unlink(output).catch(() => {})
      break
    }
    chunks.push({ path: output, start })
    if (total > 0 && start + CHUNK_LENGTH >= total) break
    if (chunks.length > 60) break
  }

  return { chunks, directory }
}

function durationOf(file) {
  try {
    const buffer = fs.readFileSync(file)
    // En-tête RIFF : taille des données à l'octet 40, taille d'un échantillon 16 bits.
    const byteRate = buffer.readUInt32LE(28)
    const dataSize = buffer.readUInt32LE(40)
    return byteRate > 0 ? dataSize / byteRate : 0
  } catch {
    return 0
  }
}

function runFfmpegExtract(input, output, start, length) {
  return new Promise(resolve => {
    const child = spawn(FFMPEG, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      String(start),
      "-t",
      String(length),
      "-i",
      input,
      "-ar",
      "16000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      output,
    ])
    child.on("error", () => resolve(1))
    child.on("close", code => resolve(code ?? 1))
  })
}

/** Lance whisper.cpp sur un bloc et renvoie les mots (un segment par mot). */
function runWhisper(wavPath, language) {
  return new Promise((resolve, reject) => {
    const outBase = wavPath.replace(/\.wav$/, "")
    const args = [
      "-m",
      WHISPER_MODEL,
      "-f",
      wavPath,
      "-ml",
      "1",
      "-sow",
      "-oj",
      "-of",
      outBase,
      "-nt",
      "-t",
      String(WHISPER_THREADS),
      // Décodage glouton : 3 à 5 fois plus rapide que la recherche à 5
      // faisceaux, et le texte est meilleur sur les voix chantées.
      "-bs",
      "1",
      "-bo",
      "1",
    ]
    if (language) args.push("-l", language)

    const child = spawn(WHISPER_BIN, args, {
      env: { ...process.env, LD_LIBRARY_PATH: WHISPER_LIB_DIR },
    })
    let stderr = ""
    child.stderr.on("data", chunk => (stderr += chunk))
    child.on("error", reject)
    child.on("close", code => {
      if (code !== 0) {
        reject(new Error(`whisper a échoué (${code}) : ${stderr.slice(-500)}`))
        return
      }
      const result = readJson(`${outBase}.json`, null)
      if (!result) {
        reject(new Error("Sortie JSON de whisper illisible"))
        return
      }
      const segments = (result.transcription ?? []).map(item => ({
        start: (item.offsets?.from ?? 0) / 1000,
        end: (item.offsets?.to ?? 0) / 1000,
        text: (item.text ?? "").trim(),
      }))
      resolve(segments)
    })
  })
}

/** Jetons non chantés : [Musique], *musique*, ♪, (musique)… */
const NON_VOCAL = /^[*[\]()].*[*[\]()]$/
const SYMBOL_ONLY = /^[^\p{L}\p{N}]+$/u

/** Supprime les répétitions caractéristiques des hallucinations de whisper. */
function dropHallucinations(words) {
  const cleaned = words.filter(word => {
    if (!word.text) return false
    if (NON_VOCAL.test(word.text)) return false
    if (SYMBOL_ONLY.test(word.text)) return false
    if (/^(musique|music|musical|instrumental|silence|bruit|applaudissements|applause)$/i.test(word.text)) {
      return false
    }
    return true
  })

  // Un même mot répété plus de 3 fois d'affilée est une hallucination.
  const result = []
  let run = 0
  let previous = ""
  for (const word of cleaned) {
    if (word.text.toLowerCase() === previous) {
      run += 1
      if (run >= 3) continue
    } else {
      run = 0
      previous = word.text.toLowerCase()
    }
    result.push(word)
  }
  return result
}

/** Regroupe les mots en lignes cohérentes (≈ 8 mots ou 6 s). */
function groupIntoLines(words) {
  const lines = []
  let current = []
  for (const word of words) {
    if (!word.text) continue
    current.push(word)
    const reachedWords = current.length >= 8
    const reachedTime = current.length > 0 && word.end - current[0].start >= 6
    const endsSentence = /[.!?]$/.test(word.text)
    if (reachedWords || reachedTime || endsSentence) {
      lines.push({
        time: current[0].start,
        endTime: word.end,
        text: current.map(item => item.text).join(" "),
        words: current.map(item => ({ time: item.start, text: item.text })),
      })
      current = []
    }
  }
  if (current.length > 0) {
    lines.push({
      time: current[0].start,
      endTime: current[current.length - 1].end,
      text: current.map(item => item.text).join(" "),
      words: current.map(item => ({ time: item.start, text: item.text })),
    })
  }
  return lines
}

const jobs = new Map()

/** Détecte la langue une seule fois (par blocs), pour garder un résultat cohérent. */
function detectLanguage(wavPath) {
  return new Promise(resolve => {
    const child = spawn(WHISPER_BIN, ["-m", WHISPER_MODEL, "-f", wavPath, "-dl"], {
      env: { ...process.env, LD_LIBRARY_PATH: WHISPER_LIB_DIR },
    })
    let output = ""
    child.stdout.on("data", chunk => (output += chunk))
    child.on("error", () => resolve(null))
    child.on("close", () => {
      const match = output.match(/auto-detected language:\s*([a-z-]+)/i)
      resolve(match ? (match[1] ?? null) : null)
    })
  })
}

/** Transcrit un fichier audio arbitraire et renvoie les lignes synchronisées. */
async function transcribeBuffer(source, id, language) {
  const stamp = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`
  const wav = path.join(TMP_DIR, `${stamp}.wav`)
  let directory = null
  try {
    await toWav16k(source, wav)
    const { chunks, directory: chunkDirectory } = await splitIntoChunks(wav)
    directory = chunkDirectory

    const wanted = language && language !== "auto" ? language : null
    const detected = wanted ?? (chunks[0] ? await detectLanguage(chunks[0].path) : null)
    const useLanguage = detected || "fr"

    const all = []
    let lastEnd = -1

    for (const chunk of chunks) {
      let raw = []
      try {
        raw = await runWhisper(chunk.path, useLanguage)
      } catch (error) {
        console.error(`[vitrail] bloc ${chunk.start}s :`, error instanceof Error ? error.message : error)
        continue
      }
      if (raw.length === 0) {
        console.error(`[vitrail] bloc ${chunk.start}s : aucune sortie de whisper`)
      }
      const words = dropHallucinations(raw)
      for (const word of words) {
        const absolute = {
          start: chunk.start + word.start,
          end: chunk.start + word.end,
          text: word.text,
        }
        // Le chevauchement de 2 s entre blocs : on écarte les doublons.
        if (absolute.start < lastEnd - 0.2) continue
        all.push(absolute)
        lastEnd = Math.max(lastEnd, absolute.end)
      }
    }

    const lines = groupIntoLines(all)
    return {
      id,
      createdAt: Date.now(),
      language: useLanguage,
      text: lines.map(line => line.text).join("\n"),
      lines,
      words: all,
    }
  } finally {
    await fsp.unlink(wav).catch(() => {})
    await fsp.unlink(wav.replace(/\.wav$/, ".json")).catch(() => {})
    if (directory) {
      const files = await fsp.readdir(directory).catch(() => [])
      for (const file of files) await fsp.unlink(path.join(directory, file)).catch(() => {})
      await fsp.rmdir(directory).catch(() => {})
    }
  }
}

async function transcribeItem(id, language) {
  if (jobs.has(id)) return jobs.get(id)

  const promise = (async () => {
    const source = path.join(LIB_DIR, `${id}.bin`)
    if (!fs.existsSync(source)) throw new Error("Fichier introuvable")
    const transcript = await transcribeBuffer(source, id, language)
    await fsp.writeFile(path.join(LYRIC_DIR, `${id}.json`), JSON.stringify(transcript))
    return transcript
  })()

  jobs.set(id, promise)
  promise.finally(() => jobs.delete(id))
  return promise
}

// ------------------------------------------------------------------ file d'attente

function readQueue() {
  return readJson(QUEUE_FILE, { items: [], now: null, updatedAt: 0 })
}

function writeQueue(queue) {
  queue.updatedAt = Date.now()
  writeJson(QUEUE_FILE, queue)
  return queue
}

// ------------------------------------------------------------------ statistiques

function readStats() {
  return readJson(STATS_FILE, { plays: [] })
}

function writeStats(stats) {
  writeJson(STATS_FILE, stats)
  return stats
}

// ------------------------------------------------------------------ serveur

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`)
  const route = url.pathname

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,X-Filename,X-Metadata",
    })
    res.end()
    return
  }

  try {
    // Tout ce qui n'est pas une API est l'application elle-même.
    if (!route.startsWith("/api/")) {
      await serveStatic(req, res, route)
      return
    }

    // -- santé ------------------------------------------------------------
    if (route === "/api/health") {
      const items = await listLibrary()
      json(res, 200, {
        ok: true,
        service: "vitrail",
        hasWhisper: hasWhisper(),
        librarySize: items.length,
        addresses: [localAddress(), lanAddress()].filter(Boolean),
      })
      return
    }

    // -- bibliothèque -----------------------------------------------------
    if (route === "/api/library" && req.method === "GET") {
      json(res, 200, { items: await listLibrary() })
      return
    }

    if (route === "/api/library" && req.method === "POST") {
      const meta = readMetadata(req)
      const body = await readBody(req)
      if (body.length === 0) {
        json(res, 400, { error: "Corps vide" })
        return
      }
      const id = crypto.randomUUID()
      await fsp.writeFile(path.join(LIB_DIR, `${id}.bin`), body)
      if (meta.artworkBase64) {
        await fsp.writeFile(path.join(LIB_DIR, `${id}.art`), Buffer.from(meta.artworkBase64, "base64"))
      }
      const item = {
        id,
        title: meta.title || baseName(meta.filename).replace(/\.[a-z0-9]+$/i, ""),
        artist: meta.artist || "Artiste inconnu",
        album: meta.album || "Bibliothèque de la famille",
        durationSec: Number(meta.durationSec) || 0,
        year: meta.year ?? null,
        filename: meta.filename || "fichier",
        mime: meta.mime || "audio/mpeg",
        size: body.length,
        hasArtwork: Boolean(meta.artworkBase64),
        addedAt: Date.now(),
      }
      await saveLibraryItem(item)
      json(res, 201, { item })
      return
    }

    const libraryMatch = route.match(/^\/api\/library\/([\w-]+)(\/audio|\/artwork|\/lyrics|\/transcribe)?$/)
    if (libraryMatch) {
      const id = libraryMatch[1]
      const action = libraryMatch[2]

      if (action === "/audio" && req.method === "GET") {
        await streamFile(res, path.join(LIB_DIR, `${id}.bin`), "audio/mpeg")
        return
      }
      if (action === "/artwork" && req.method === "GET") {
        await streamFile(res, path.join(LIB_DIR, `${id}.art`), "image/jpeg")
        return
      }
      if (action === "/lyrics" && req.method === "GET") {
        const lyrics = readJson(path.join(LYRIC_DIR, `${id}.json`), null)
        if (!lyrics) {
          json(res, 404, { error: "Paroles non transcrites" })
          return
        }
        json(res, 200, lyrics)
        return
      }
      if (action === "/transcribe" && req.method === "POST") {
        if (!hasWhisper()) {
          json(res, 503, { error: "whisper.cpp non disponible sur ce serveur" })
          return
        }
        const meta = readJson(path.join(LIB_DIR, `${id}.json`), {})
        const language = url.searchParams.get("lang") || meta.language || "auto"
        try {
          const result = await transcribeItem(id, language)
          json(res, 200, result)
        } catch (error) {
          json(res, 500, { error: error instanceof Error ? error.message : "transcription impossible" })
        }
        return
      }
      if (req.method === "DELETE" && !action) {
        await deleteLibraryItem(id)
        json(res, 200, { ok: true })
        return
      }
    }

    // -- transcription par empreinte -------------------------------------
    // L'empreinte du fichier (SHA-256 calculé par le navigateur) permet de
    // partager les paroles : si un membre de la famille a déjà fait
    // transcrire un morceau, tous en profitent.
    const transcriptMatch = route.match(/^\/api\/transcript\/([\w-]+)$/)
    if (transcriptMatch) {
      const hash = transcriptMatch[1]
      if (req.method === "GET") {
        const transcript = readJson(path.join(TRANSCRIPT_DIR, `${hash}.json`), null)
        if (!transcript) {
          json(res, 404, { error: "Aucune transcription pour cette empreinte" })
          return
        }
        json(res, 200, transcript)
        return
      }
      if (req.method === "POST") {
        if (!hasWhisper()) {
          json(res, 503, { error: "whisper.cpp non disponible sur ce serveur" })
          return
        }
        const existing = readJson(path.join(TRANSCRIPT_DIR, `${hash}.json`), null)
        if (existing) {
          json(res, 200, { ...existing, cached: true })
          return
        }
        const meta = readMetadata(req)
        const body = await readBody(req)
        if (body.length === 0) {
          json(res, 400, { error: "Corps vide" })
          return
        }
        const source = path.join(TMP_DIR, `${hash}.bin`)
        await fsp.writeFile(source, body)
        // La transcription prend plusieurs minutes : on la lance en tâche de
        // fond et le client vient interroger l'empreinte toutes les 5 s.
        const language = meta.language || "auto"
        transcribeBuffer(source, hash, language)
          .then(transcript => {
            fs.writeFileSync(path.join(TRANSCRIPT_DIR, `${hash}.json`), JSON.stringify(transcript))
          })
          .catch(() => undefined)
          .finally(() => {
            fs.unlink(source, () => undefined)
          })
        json(res, 202, { status: "pending", hash })
        return
      }
    }

    // -- file d'attente partagée -----------------------------------------
    if (route === "/api/queue" && req.method === "GET") {
      json(res, 200, readQueue())
      return
    }

    if (route === "/api/queue" && req.method === "POST") {
      const queue = readQueue()
      const ref = readMetadata(req)
      if (!ref || !ref.id) {
        json(res, 400, { error: "Référence de morceau manquante" })
        return
      }
      if (!queue.items.some(item => item.id === ref.id)) {
        queue.items.push({ ...ref, addedAt: Date.now() })
      }
      json(res, 200, writeQueue(queue))
      return
    }

    if (route === "/api/queue/clear" && req.method === "POST") {
      json(res, 200, writeQueue({ items: [], now: null, updatedAt: Date.now() }))
      return
    }

    if (route === "/api/queue/now" && req.method === "POST") {
      const queue = readQueue()
      const ref = readMetadata(req)
      queue.now = ref && ref.id ? ref : null
      json(res, 200, writeQueue(queue))
      return
    }

    const queueItemMatch = route.match(/^\/api\/queue\/([\w-]+)$/)
    if (queueItemMatch && req.method === "DELETE") {
      const queue = readQueue()
      queue.items = queue.items.filter(item => item.id !== queueItemMatch[1])
      json(res, 200, writeQueue(queue))
      return
    }

    // -- statistiques -----------------------------------------------------
    if (route === "/api/stats" && req.method === "GET") {
      json(res, 200, summarise(readStats()))
      return
    }

    if (route === "/api/stats" && req.method === "POST") {
      const stats = readStats()
      const play = readMetadata(req)
      if (play && play.id) {
        stats.plays.push({
          id: play.id,
          title: play.title ?? "",
          artist: play.artist ?? "",
          album: play.album ?? "",
          artwork: play.artwork ?? "",
          source: play.source ?? "local",
          seconds: Number(play.seconds) || 0,
          at: Date.now(),
          device: play.device ?? "",
        })
        // On ne garde que les 5000 derniers événements.
        if (stats.plays.length > 5000) stats.plays = stats.plays.slice(-5000)
      }
      json(res, 200, summarise(writeStats(stats)))
      return
    }

    json(res, 404, { error: "Route inconnue" })
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : "erreur interne" })
  }
})

/**
 * L'application est servie par le service local, et non seulement depuis
 * Vercel. Raison : une page HTTPS ne peut pas appeler une API HTTP locale
 * (mixed content bloqué par le navigateur). En servant l'app et l'API depuis
 * la même origine, les paroles transcrites et la file de la famille
 * fonctionnent — sur la tablette comme sur les autres appareils du réseau.
 */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
}

async function serveStatic(req, res, pathname) {
  const relative = pathname === "/" ? "/index.html" : pathname
  const target = path.join(DIST_DIR, path.normalize(relative).replace(/^(\.\.[/\\])+/, ""))
  if (!target.startsWith(DIST_DIR)) {
    json(res, 403, { error: "Chemin refusé" })
    return
  }
  let file = target
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(DIST_DIR, "index.html")
  }
  if (!fs.existsSync(file)) {
    json(res, 404, { error: "Application non construite (lance npm run build)" })
    return
  }
  const ext = path.extname(file).toLowerCase()
  const stat = await fsp.stat(file)
  const headers = {
    "Content-Type": MIME[ext] ?? "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600",
  }
  res.writeHead(200, { ...headers, "Content-Length": stat.size })
  fs.createReadStream(file).pipe(res)
}

function readJsonBody(req) {
  return readMetadata(req)
}

async function streamFile(res, file, contentType) {
  if (!fs.existsSync(file)) {
    json(res, 404, { error: "Fichier introuvable" })
    return
  }
  const stat = await fsp.stat(file)
  const range = res.req.headers.range
  const headers = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=3600",
  }

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range)
    const start = match && match[1] ? Number(match[1]) : 0
    const end = match && match[2] ? Number(match[2]) : stat.size - 1
    if (start >= stat.size) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` })
      res.end()
      return
    }
    res.writeHead(206, {
      ...headers,
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Content-Length": end - start + 1,
    })
    fs.createReadStream(file, { start, end }).pipe(res)
    return
  }

  res.writeHead(200, { ...headers, "Content-Length": stat.size })
  fs.createReadStream(file).pipe(res)
}

function summarise(stats) {
  const plays = stats.plays ?? []
  const byTrack = new Map()
  const byArtist = new Map()
  const byAlbum = new Map()
  const byDay = new Map()
  let seconds = 0

  for (const play of plays) {
    seconds += play.seconds ?? 0
    byTrack.set(play.id, (byTrack.get(play.id) ?? 0) + 1)
    byArtist.set(play.artist, (byArtist.get(play.artist) ?? 0) + 1)
    byAlbum.set(play.album, (byAlbum.get(play.album) ?? 0) + 1)
    const day = new Date(play.at).toISOString().slice(0, 10)
    byDay.set(day, (byDay.get(day) ?? 0) + (play.seconds ?? 0))
  }

  const top = (map, limit = 20) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([key, count]) => ({ key, count }))

  return {
    totalSeconds: seconds,
    playCount: plays.length,
    tracks: top(byTrack),
    artists: top(byArtist),
    albums: top(byAlbum),
    days: [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
  }
}

function localAddress() {
  return "127.0.0.1"
}

function lanAddress() {
  const interfaces = os.networkInterfaces()
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) return entry.address
    }
  }
  return null
}

const isCli = process.argv[2] === "--transcribe"

if (!isCli) {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[vitrail] service local sur le port ${PORT}`)
    console.log(`[vitrail] 127.0.0.1:${PORT} · ${lanAddress() ?? "?"}:${PORT}`)
    console.log(`[vitrail] whisper.cpp ${hasWhisper() ? "disponible" : "ABSENT"}`)
  })
}

// Mode ligne de commande : node server.js --transcribe <fichier> [langue]
if (isCli) {
  const file = process.argv[3]
  const language = process.argv[4] || "auto"
  ;(async () => {
    try {
      const stamp = `${Date.now()}`
      const wav = path.join(TMP_DIR, `${stamp}.wav`)
      await toWav16k(file, wav)
      console.log(`[cli] wav : ${wav}`)
      const { chunks, directory } = await splitIntoChunks(wav)
      console.log(`[cli] blocs : ${chunks.length}`)
      const detected = chunks[0] ? await detectLanguage(chunks[0].path) : null
      console.log(`[cli] langue : ${detected}`)
      const useLanguage = detected || "fr"
      let lastEnd = -1
      const all = []
      for (const chunk of chunks) {
        const raw = await runWhisper(chunk.path, useLanguage)
        console.log(`[cli] bloc ${chunk.start}s : ${raw.length} mots bruts`)
        const words = dropHallucinations(raw)
        console.log(`[cli] bloc ${chunk.start}s : ${words.length} mots retenus`)
        for (const word of words) {
          const absolute = {
            start: chunk.start + word.start,
            end: chunk.start + word.end,
            text: word.text,
          }
          if (absolute.start < lastEnd - 0.2) {
            console.log(`[cli]   écarté (doublon) : ${absolute.start.toFixed(2)}s ${word.text}`)
            continue
          }
          all.push(absolute)
          lastEnd = Math.max(lastEnd, absolute.end)
        }
      }
      console.log(`[cli] total : ${all.length} mots`)
      const lines = groupIntoLines(all)
      console.log(`[cli] lignes : ${lines.length}`)
      for (const line of lines.slice(0, 12)) {
        console.log(`[cli]   ${line.time.toFixed(2)}s | ${line.text}`)
      }
      const files = await fsp.readdir(directory).catch(() => [])
      for (const item of files) await fsp.unlink(path.join(directory, item)).catch(() => {})
      await fsp.rmdir(directory).catch(() => {})
      await fsp.unlink(wav).catch(() => {})
      process.exit(0)
    } catch (error) {
      console.error("[cli] échec :", error)
      process.exit(1)
    }
  })()
}
