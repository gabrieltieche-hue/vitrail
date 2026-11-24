const fs = require("node:fs")
const fsp = require("node:fs/promises")
const path = require("node:path")
const { execFile } = require("node:child_process")

const NOTUBE_DIR = process.env.VITRAIL_NOTUBE_DIR || "/root/notube-batch"
const DATA_DIR = process.env.VITRAIL_DATA || "/root/vitrail-data"
const BINARY = path.join(NOTUBE_DIR, "bin", "yt-dlp")
const CACHE_FILE = path.join(DATA_DIR, "stream-urls.json")
const TTL = 1000 * 60 * 60 * 4

let cache = {}
try {
  cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"))
} catch {
  cache = {}
}

let saving = false

function save() {
  if (saving) return
  saving = true
  setTimeout(() => {
    saving = false
    fs.writeFile(CACHE_FILE, JSON.stringify(cache), () => undefined)
  }, 2000)
}

function runYtDlp(args, timeoutMs) {
  return new Promise(resolve => {
    execFile(BINARY, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      resolve({ code: error ? (error.code ?? 1) : 0, stdout: stdout || "" })
    })
  })
}

async function resolveAudioUrl(videoUrl, { force = false } = {}) {
  if (!videoUrl) return null
  const key = videoUrl
  const cached = cache[key]
  if (!force && cached && Date.now() - cached.at < TTL) {
    return cached.url
  }

  const result = await runYtDlp(
    ["--no-warnings", "--no-playlist", "-f", "bestaudio/best", "-g", videoUrl],
    45000,
  )
  if (result.code !== 0) return null

  const lines = result.stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
  if (lines.length === 0) return null

  const url = lines[lines.length - 1]
  cache[key] = { url, at: Date.now() }
  save()
  return url
}

function isFresh(videoUrl) {
  const cached = cache[videoUrl]
  return Boolean(cached && Date.now() - cached.at < TTL)
}

const prefetching = new Set()

async function prefetch(videoUrls, concurrency = 2) {
  const queue = [...new Set(videoUrls.filter(Boolean))].filter(url => !cache[url])
  if (queue.length === 0) return
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    for (;;) {
      const url = queue.shift()
      if (!url) return
      if (prefetching.has(url)) continue
      prefetching.add(url)
      try {
        await resolveAudioUrl(url)
      } catch {
        /* on ignore */
      } finally {
        prefetching.delete(url)
      }
    }
  })
  await Promise.all(workers)
}

module.exports = { resolveAudioUrl, isFresh, prefetch }
