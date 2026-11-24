const fs = require("node:fs")
const fsp = require("node:fs/promises")
const path = require("node:path")
const { execFile } = require("node:child_process")

const NOTUBE_DIR = process.env.VITRAIL_NOTUBE_DIR || "/root/notube-batch"
const DATA_DIR = process.env.VITRAIL_DATA || "/root/vitrail-data"
const INDEX_FILE = path.join(DATA_DIR, "library-index.json")
const RCLONE = "rclone"
const DRIVE_REMOTE = process.env.VITRAIL_DRIVE_REMOTE || "gdrive:Notube"
const DRIVE_SERVE = process.env.VITRAIL_DRIVE_SERVE || "http://127.0.0.1:8091"

const EMPTY_INDEX = { tracks: [], builtAt: 0, sources: {} }

let index = { ...EMPTY_INDEX, tracks: [] }
let building = null

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function tokenize(value) {
  return normalize(value)
    .split(" ")
    .filter(token => token.length > 0 && !/^\d+$/.test(token))
}

function stripDecorations(value) {
  return String(value || "")
    .replace(/\(([^)]*)\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function levenshtein(a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let previous = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j += 1) previous[j] = j
  for (let i = 1; i <= a.length; i += 1) {
    const current = new Array(b.length + 1)
    current[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost)
    }
    previous = current
  }
  return previous[b.length]
}

function run(command, args, timeoutMs = 120000) {
  return new Promise(resolve => {
    execFile(command, args, { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ code: error ? (error.code ?? 1) : 0, stdout: stdout || "", stderr: stderr || "" })
    })
  })
}

async function readCatalogCsv(file) {
  const content = await fsp.readFile(file, "utf8").catch(() => "")
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0)
  if (lines.length === 0) return []
  const header = lines[0].split(";").map(cell => cell.trim().toLowerCase())
  const indexOf = name => header.indexOf(name)
  const rows = []
  for (const line of lines.slice(1)) {
    const cells = line.split(";")
    const get = name => {
      const at = indexOf(name)
      return at >= 0 ? (cells[at] ?? "").trim() : ""
    }
    const url = get("url")
    if (!url) continue
    rows.push({
      rank: Number.parseInt(get("rang"), 10) || 0,
      artist: get("artiste"),
      title: get("titre"),
      url,
      youtubeTitle: get("titre_youtube"),
      views: Number.parseInt(get("vues"), 10) || 0,
      source: get("source"),
    })
  }
  return rows
}

const DRIVE_CACHE_FILE = path.join(DATA_DIR, "drive-listing.json")
const DRIVE_CACHE_TTL = 1000 * 60 * 60

const ROOTS = new Map()

const ROOT_MAIN = "main"

function rootFor(spec) {
  if (!ROOTS.has(spec)) {
    ROOTS.set(spec, {
      spec,
      rclonePath: spec === ROOT_MAIN ? DRIVE_REMOTE : "gdrive:",
      rootFolderId: spec === ROOT_MAIN ? null : spec.replace(/^f-/, ""),
      port: null,
    })
  }
  return ROOTS.get(spec)
}

function roots() {
  return [...ROOTS.values()]
}

async function lsjson(path, rootFolderId) {
  const args = ["lsjson", path]
  if (rootFolderId) args.push("--drive-root-folder-id", rootFolderId)
  const result = await run(RCLONE, args, 120000)
  if (result.code !== 0) return []
  try {
    const parsed = JSON.parse(result.stdout)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function listDrive() {
  try {
    const cached = JSON.parse(await fsp.readFile(DRIVE_CACHE_FILE, "utf8"))
    if (Date.now() - (cached.at ?? 0) < DRIVE_CACHE_TTL && Array.isArray(cached.files)) {
      for (const spec of cached.roots ?? []) {
        const root = rootFor(spec.spec)
        root.rclonePath = spec.rclonePath
        root.rootFolderId = spec.rootFolderId
      }
      return cached.files
    }
  } catch {
    /* pas de cache */
  }

  const files = []
  const seen = new Set()

  const walk = async (spec, prefix, depth) => {
    if (depth > 3) return
    const root = rootFor(spec)
    const target = root.rootFolderId ? root.rclonePath : `${root.rclonePath}/${prefix}`
    const entries = await lsjson(target, root.rootFolderId)

    const byName = new Map()
    for (const entry of entries) {
      if (!entry.IsDir) continue
      const list = byName.get(entry.Path) ?? []
      list.push(entry)
      byName.set(entry.Path, list)
    }

    for (const entry of entries) {
      if (entry.IsDir) continue
      if (!/\.(mp3|m4a|aac|flac|ogg|opus|wav)$/i.test(entry.Path || "")) continue
      const path = prefix ? `${prefix}/${entry.Path}` : entry.Path
      if (seen.has(path)) continue
      seen.add(path)
      files.push({
        Path: path,
        Name: entry.Name,
        Size: entry.Size,
        ModTime: entry.ModTime,
        driveRoot: spec,
        driveUrl: `/${path}`,
        driveRemote: root.rootFolderId
          ? `gdrive:${root.rootFolderId}/${entry.Path}`
          : `${DRIVE_REMOTE}/${path}`,
      })
    }

    for (const [name, list] of byName) {
      for (const dir of list) {
        if (list.length === 1) {
          await walk(spec, prefix ? `${prefix}/${name}` : name, depth + 1)
        } else {
          const childSpec = `f-${dir.ID}`
          const childRoot = rootFor(childSpec)
          childRoot.rclonePath = "gdrive:"
          childRoot.rootFolderId = dir.ID
          await walk(childSpec, "", depth + 1)
        }
      }
    }
  }

  await walk(ROOT_MAIN, "", 0)

  await fsp
    .writeFile(
      DRIVE_CACHE_FILE,
      JSON.stringify({
        at: Date.now(),
        files,
        roots: roots().map(root => ({
          spec: root.spec,
          rclonePath: root.rclonePath,
          rootFolderId: root.rootFolderId,
        })),
      }),
    )
    .catch(() => undefined)
  return files
}

function videoIdFrom(url, filename, fallback) {
  const fromUrl = String(url || "").match(/[?&]v=([\w-]+)/)?.[1]
  if (fromUrl) return fromUrl
  const fromName = String(filename || "").match(/\[([\w-]+)\]/)?.[1]
  if (fromName) return fromName
  return fallback
}

function trackId(videoId) {
  return `yt-${videoId}`
}

async function buildIndex() {
  const started = Date.now()
  const tracks = new Map()
  const sources = {}

  const add = track => {
    if (!track.title && !track.artist) return
    const existing = tracks.get(track.id)
    if (existing) {
      for (const [key, value] of Object.entries(track)) {
        if (value === "" || value === null || value === undefined) continue
        existing[key] = value
      }
      return
    }
    tracks.set(track.id, track)
  }

  let catalogCount = 0
  for (const name of ["urls_france.csv", "urls_international.csv"]) {
    const rows = await readCatalogCsv(path.join(NOTUBE_DIR, name))
    for (const row of rows) {
      const videoId = videoIdFrom(row.url, "", null)
      add({
        id: trackId(videoId),
        title: row.title || row.youtubeTitle || "",
        artist: row.artist || "",
        album: "",
        durationSec: 0,
        artwork: "",
        url: row.url,
        rank: row.rank,
        views: row.views,
        catalog: true,
        available: false,
        downloadable: true,
        source: "catalog",
      })
      catalogCount += 1
    }
  }
  sources.catalog = catalogCount

  const driveFiles = await listDrive()
  const driveByName = new Map()
  for (const file of driveFiles) {
    driveByName.set(file.Name, file)
  }

  let downloadedCount = 0
  for (const lot of ["dl_france", "dl_international"]) {
    const state = await fsp
      .readFile(path.join(NOTUBE_DIR, lot, "state.json"), "utf8")
      .then(text => JSON.parse(text))
      .catch(() => null)
    if (!state || !state.items) continue
    for (const [stateKey, item] of Object.entries(state.items)) {
      if (item.status !== "done") continue
      const base = path.basename(item.file || "")
      const title = base.replace(/\s*\[[\w-]+\]\s*\.[a-z0-9]+$/i, "").replace(/\.[a-z0-9]+$/i, "")
      const videoId = videoIdFrom(item.url, base, stateKey)
      const driveRelative = item.drive
        ? String(item.drive).replace(/^[^:]+:[^/]*\/?/, "")
        : null
      const driveEntry = driveByName.get(path.basename(base))
      add({
        id: trackId(videoId),
        title: stripDecorations(title),
        artist: "",
        album: "",
        durationSec: 0,
        artwork: "",
        url: item.url || "",
        localPath: item.file && fs.existsSync(item.file) ? item.file : null,
        drivePath: item.drive || null,
        ...(driveEntry
          ? { driveRemote: driveEntry.driveRemote, driveUrl: driveEntry.driveUrl }
          : driveRelative
            ? { driveUrl: `/${driveRelative}` }
            : {}),
        available: true,
        downloadable: false,
        source: "notube",
        addedAt: item.ts ? Date.parse(item.ts.replace(" ", "T")) || Date.now() : Date.now(),
      })
      downloadedCount += 1
    }
  }
  sources.downloaded = downloadedCount

  for (const file of driveFiles) {
    const name = path.basename(file.Path || "")
    const title = stripDecorations(name.replace(/\.[a-z0-9]+$/i, ""))
    const videoId = videoIdFrom("", name, null)
    add({
      id: videoId ? trackId(videoId) : `drive-${Buffer.from(file.Path).toString("base64url").slice(0, 40)}`,
      title,
      artist: "",
      album: path.dirname(file.Path || ""),
      durationSec: 0,
      artwork: "",
      url: "",
      drivePath: file.driveRemote || `${DRIVE_REMOTE}/${file.Path}`,
      driveRemote: file.driveRemote || `${DRIVE_REMOTE}/${file.Path}`,
      driveUrl: file.driveUrl || `/${file.Path}`,
      driveRoot: file.driveRoot || "main",
      size: file.Size || 0,
      available: true,
      downloadable: false,
      source: "drive",
      addedAt: file.ModTime ? Date.parse(file.ModTime) || Date.now() : Date.now(),
    })
  }
  sources.drive = driveFiles.length

  for (const lot of ["dl_france", "dl_international"]) {
    const dir = path.join(NOTUBE_DIR, lot)
    const names = await fsp.readdir(dir).catch(() => [])
    for (const name of names) {
      if (!/\.(mp3|m4a|aac|flac|ogg|opus|wav)$/i.test(name)) continue
      const full = path.join(dir, name)
      const stat = await fsp.stat(full).catch(() => null)
      if (!stat || !stat.isFile()) continue
      const videoId = videoIdFrom("", name, null)
      const title = stripDecorations(name.replace(/\s*\[[\w-]+\]\s*\.[a-z0-9]+$/i, "").replace(/\.[a-z0-9]+$/i, ""))
      add({
        id: videoId ? trackId(videoId) : `local-${Buffer.from(full).toString("base64url").slice(0, 40)}`,
        title,
        artist: "",
        album: lot,
        durationSec: 0,
        artwork: "",
        url: "",
        localPath: full,
        size: stat.size,
        available: true,
        downloadable: false,
        source: "local",
        addedAt: stat.mtimeMs || Date.now(),
      })
    }
  }

  const onDemandDir = path.join(DATA_DIR, "downloads")
  const onDemand = await fsp.readdir(onDemandDir).catch(() => [])
  for (const name of onDemand) {
    if (!/\.(mp3|m4a|aac|flac|ogg|opus|wav)$/i.test(name)) continue
    const full = path.join(onDemandDir, name)
    const stat = await fsp.stat(full).catch(() => null)
    if (!stat || !stat.isFile()) continue
    const title = stripDecorations(name.replace(/\.[a-z0-9]+$/i, ""))
    add({
      id: `ondemand-${Buffer.from(full).toString("base64url").slice(0, 40)}`,
      title,
      artist: "",
      album: "Téléchargé depuis Vitrail",
      durationSec: 0,
      artwork: "",
      url: "",
      localPath: full,
      size: stat.size,
      available: true,
      downloadable: false,
      source: "ondemand",
      addedAt: stat.mtimeMs || Date.now(),
    })
  }

  const list = [...tracks.values()]
  for (const track of list) {
    track.searchTokens = [...new Set([...tokenize(track.title), ...tokenize(track.artist)])]
  }

  const inverted = new Map()
  for (const track of list) {
    for (const token of track.searchTokens) {
      let bucket = inverted.get(token)
      if (!bucket) {
        bucket = []
        inverted.set(token, bucket)
      }
      bucket.push(track.id)
    }
  }

  index = {
    tracks: list,
    byId: new Map(list.map(track => [track.id, track])),
    builtAt: Date.now(),
    sources,
    buildMs: Date.now() - started,
    inverted,
  }
  await fsp
    .writeFile(INDEX_FILE, JSON.stringify({ tracks: list, builtAt: index.builtAt, sources }))
    .catch(() => undefined)
  return index
}

async function ensureIndex({ force = false } = {}) {
  if (!force && index.tracks.length > 0) return index
  if (!building) {
    building = buildIndex().finally(() => {
      building = null
    })
  }
  return building
}

async function loadFromDisk() {
  try {
    const raw = await fsp.readFile(INDEX_FILE, "utf8")
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed.tracks) && parsed.tracks.length > 0) {
      index = { tracks: parsed.tracks, builtAt: parsed.builtAt || 0, sources: parsed.sources || {} }
      buildLookupMaps()
      return true
    }
  } catch {
    /* pas d'index sur disque */
  }
  return false
}

function buildLookupMaps() {
  index.byId = new Map(index.tracks.map(track => [track.id, track]))
  const inverted = new Map()
  for (const track of index.tracks) {
    if (!track.searchTokens) {
      track.searchTokens = [...new Set([...tokenize(track.title), ...tokenize(track.artist)])]
    }
    for (const token of track.searchTokens) {
      let bucket = inverted.get(token)
      if (!bucket) {
        bucket = []
        inverted.set(token, bucket)
      }
      bucket.push(track.id)
    }
  }
  index.inverted = inverted
}

function getIndex() {
  return index
}

function getTrack(id) {
  if (index.byId) return index.byId.get(id) || null
  return index.tracks.find(track => track.id === id) || null
}

function scoreTrack(track, query, tokens) {
  const title = normalize(track.title)
  const artist = normalize(track.artist)
  const cleanTitle = normalize(stripDecorations(track.title))
  const haystack = `${title} ${artist}`

  if (cleanTitle === query || title === query) return 1000
  if (artist === query) return 900
  if (cleanTitle.startsWith(query)) return 800
  if (haystack.includes(query)) return 700

  let score = 0
  for (const token of tokens) {
    if (title.includes(token)) score += 40
    if (artist.includes(token)) score += 30
    for (const candidate of track.searchTokens || []) {
      if (candidate === token) score += 60
      else if (
        candidate.length >= 3 &&
        token.length >= 3 &&
        (candidate.startsWith(token) || token.startsWith(candidate))
      ) {
        score += 30
      } else if (
        candidate.length >= 4 &&
        token.length >= 4 &&
        Math.abs(candidate.length - token.length) <= 1 &&
        levenshtein(candidate, token) <= 1
      ) {
        score += 20
      }
    }
  }
  if (track.rank) score += Math.max(0, 20 - track.rank / 50)
  if (track.available) score += 5
  return score
}

function search(query, limit = 60) {
  const cleaned = normalize(query)
  if (cleaned.length < 2) return []

  const tokens = tokenize(query)
  if (tokens.length === 0) return []

  const inverted = index.inverted
  if (!inverted) {
    const results = []
    for (const track of index.tracks) {
      const score = scoreTrack(track, cleaned, tokens)
      if (score > 0) results.push({ ...track, score })
    }
    results.sort((a, b) => b.score - a.score)
    return results.slice(0, limit)
  }

  const candidates = new Set()
  for (const token of tokens) {
    for (const [known, ids] of inverted) {
      let match = known === token
      if (!match && known.length >= 3 && token.length >= 3) {
        match = known.startsWith(token) || token.startsWith(known)
      }
      if (!match && known.length >= 4 && token.length >= 4) {
        match = Math.abs(known.length - token.length) <= 1 && levenshtein(known, token) <= 1
      }
      if (match) {
        for (const id of ids) candidates.add(id)
        if (candidates.size > 4000) break
      }
    }
  }

  const results = []
  for (const id of candidates) {
    const track = index.byId ? index.byId.get(id) : index.tracks.find(item => item.id === id)
    if (!track) continue
    const score = scoreTrack(track, cleaned, tokens)
    if (score > 0) {
      results.push({
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album || "",
        durationSec: track.durationSec || 0,
        artwork: track.artwork || "",
        url: track.url || "",
        rank: track.rank || 0,
        available: Boolean(track.available),
        downloadable: Boolean(track.downloadable),
        source: track.source,
        size: track.size || 0,
        score,
      })
    }
  }
  results.sort((a, b) => b.score - a.score || (a.rank || 0) - (b.rank || 0))
  return results.slice(0, limit)
}

const youtubeCache = new Map()
const YOUTUBE_CACHE_FILE = path.join(DATA_DIR, "youtube-search-cache.json")

function loadYoutubeCache() {
  try {
    const parsed = JSON.parse(fs.readFileSync(YOUTUBE_CACHE_FILE, "utf8"))
    for (const [key, value] of Object.entries(parsed)) youtubeCache.set(key, value)
  } catch {
    /* pas de cache */
  }
}

function saveYoutubeCache() {
  const now = Date.now()
  const fresh = {}
  for (const [key, value] of youtubeCache) {
    if (now - value.at < 1000 * 60 * 60 * 24 * 7) fresh[key] = value
  }
  fs.writeFile(YOUTUBE_CACHE_FILE, JSON.stringify(fresh), () => undefined)
}

async function searchYoutube(query, limit = 12) {
  const key = normalize(query)
  const cached = youtubeCache.get(key)
  if (cached && Date.now() - cached.at < 1000 * 60 * 60 * 24) {
    return { results: cached.results, cached: true }
  }

  const binary = path.join(NOTUBE_DIR, "bin", "yt-dlp")
  const result = await run(
    binary,
    ["--flat-playlist", "--dump-json", "--no-warnings", `ytsearch${limit}:${query}`],
    90000,
  )
  if (result.code !== 0 || !result.stdout.trim()) {
    return { results: [], cached: false, error: "yt-dlp n'a rien renvoyé" }
  }

  const results = []
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line.trim()) continue
    try {
      const item = JSON.parse(line)
      const videoId = item.id || item.url?.match(/[?&]v=([\w-]+)/)?.[1] || ""
      if (!videoId) continue
      results.push({
        id: `yt-${videoId}`,
        title: stripDecorations(item.title || ""),
        rawTitle: item.title || "",
        artist: item.channel || item.uploader || "",
        album: "",
        durationSec: item.duration || 0,
        artwork: item.thumbnail || "",
        url: item.url || `https://www.youtube.com/watch?v=${videoId}`,
        views: item.view_count || 0,
        available: false,
        downloadable: true,
        source: "youtube",
      })
    } catch {
      /* ligne illisible */
    }
  }

  youtubeCache.set(key, { at: Date.now(), results })
  saveYoutubeCache()
  return { results, cached: false }
}

module.exports = {
  ensureIndex,
  buildIndex,
  loadFromDisk,
  getIndex,
  getTrack,
  search,
  searchYoutube,
  normalize,
  tokenize,
  levenshtein,
  stripDecorations,
  DRIVE_SERVE,
  DRIVE_REMOTE,
  NOTUBE_DIR,
  DATA_DIR,
  INDEX_FILE,
  roots,
  rootFor,
  ROOT_MAIN,
}
