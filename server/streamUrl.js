/**
 * Résolution de l'URL audio directe d'une vidéo YouTube.
 *
 * Au lieu de télécharger puis de stocker le morceau (lourd : disque, Drive,
 * temps), on demande à yt-dlp l'URL signée du flux audio. Le navigateur
 * lit alors directement sur le CDN de YouTube, avec ses requêtes Range :
 * seek instantané, reprise en cours de route, zéro copie sur la tablette.
 *
 * L'URL signée expire (environ 6 h) : on la met en cache et on la renouvelle
 * à la demande.
 */

const fs = require("node:fs")
const fsp = require("node:fs/promises")
const path = require("node:path")
const { execFile } = require("node:child_process")

const NOTUBE_DIR = process.env.VITRAIL_NOTUBE_DIR || "/root/notube-batch"
const DATA_DIR = process.env.VITRAIL_DATA || "/root/vitrail-data"
const BINARY = path.join(NOTUBE_DIR, "bin", "yt-dlp")
const CACHE_FILE = path.join(DATA_DIR, "stream-urls.json")
/** Les URL signées tiennent environ 6 h : on lesrenew avant qu'elles meurent. */
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

/**
 * Retourne l'URL audio directe d'une vidéo YouTube, ou null.
 * `force` ignore le cache (quand le navigateur signale une URL expirée).
 */
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

  // `-g` peut renvoyer plusieurs URL (vidéo puis audio) : la dernière est
  // généralement le flux audio complet.
  const url = lines[lines.length - 1]
  cache[key] = { url, at: Date.now() }
  save()
  return url
}

/** L'URL est-elle encore censée être valide ? */
function isFresh(videoUrl) {
  const cached = cache[videoUrl]
  return Boolean(cached && Date.now() - cached.at < TTL)
}

module.exports = { resolveAudioUrl, isFresh }
