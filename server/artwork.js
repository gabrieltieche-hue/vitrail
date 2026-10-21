/**
 * Enrichissement des métadonnées : pochettes et durées exactes.
 *
 * L'API publique iTunes (aucune clé, aucun compte) rend la pochette et la
 * durée d'un morceau à partir de l'artiste et du titre. Les résultats sont
 * mis en cache sur disque : chaque morceau n'est donc interrogé qu'une fois.
 *
 * L'enrichissement tourne en tâche de fond, par lots, sans jamais bloquer
 * la recherche ni la lecture.
 */

const fs = require("node:fs")
const fsp = require("node:fs/promises")
const path = require("node:path")

const DATA_DIR = process.env.VITRAIL_DATA || "/root/vitrail-data"
const CACHE_FILE = path.join(DATA_DIR, "artwork-cache.json")
const ITUNES = "https://itunes.apple.com/search"

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

function keyFor(track) {
  return `${(track.artist || "").toLowerCase()}|${(track.title || "").toLowerCase()}`
}

/** Artwork en plus grand : l'API renvoie 100x100, on demande 600x600. */
function upscale(url) {
  return url ? url.replace("/100x100bb", "/600x600bb") : ""
}

async function query(track) {
  const artist = (track.artist || "").trim()
  const title = (track.title || "").trim()
  if (!title) return null
  const term = artist ? `${artist} ${title}` : title
  const url = `${ITUNES}?term=${encodeURIComponent(term)}&entity=song&limit=5`
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const response = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    if (!response.ok) return null
    const data = await response.json()
    const results = Array.isArray(data.results) ? data.results : []
    if (results.length === 0) return null

    // On privilégie le résultat dont le titre ressemble le plus.
    const wanted = title.toLowerCase()
    const best =
      results.find(item => (item.trackName || "").toLowerCase() === wanted) || results[0]
    return {
      artwork: upscale(best.artworkUrl100),
      durationSec: best.trackTimeMillis ? Math.round(best.trackTimeMillis / 1000) : 0,
      artist: best.artistName || "",
      album: best.collectionName || "",
    }
  } catch {
    return null
  }
}

async function lookup(track) {
  const key = keyFor(track)
  const cached = cache[key]
  if (cached) return cached
  const result = await query(track)
  if (result) {
    cache[key] = result
    save()
  }
  return result
}

/**
 * Enrichit un lot de morceaux et renvoie les champs complétés.
 * Appelé en tâche de fond, jamais dans le chemin d'une requête.
 */
async function enrich(tracks, limit = 60) {
  const enriched = []
  for (const track of tracks) {
    if (track.artwork) continue
    const result = await lookup(track)
    if (!result) continue
    enriched.push({
      id: track.id,
      artwork: result.artwork,
      durationSec: result.durationSec || track.durationSec || 0,
      artist: track.artist || result.artist,
      album: track.album || result.album,
    })
    if (enriched.length >= limit) break
  }
  return enriched
}

/** Enrichit progressivement l'index, par petits lots. */
function startBackgroundEnrichment(getTracks, onUpdated) {
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      const tracks = getTracks().filter(track => !track.artwork)
      if (tracks.length > 0) {
        // L'API iTunes tolère un débit modéré : 60 pochettes toutes les
        // 10 s remplit le catalogue en quelques minutes.
        const updated = await enrich(tracks.slice(0, 60))
        if (updated.length > 0) onUpdated(updated)
      }
    } catch {
      /* on continue */
    } finally {
      running = false
    }
  }
  void tick()
  const timer = setInterval(tick, 10000)
  timer.unref?.()
  return () => clearInterval(timer)
}

module.exports = { lookup, enrich, startBackgroundEnrichment, keyFor }
