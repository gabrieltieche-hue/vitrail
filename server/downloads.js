/**
 * Téléchargements à la demande.
 *
 * On ne réécrit pas de téléchargeur : on délègue au script notube-batch déjà
 * présent sur la machine, avec un dossier de sortie et un dossier Drive
 * dédiés pour ne pas entrer en conflit avec les lots en cours. Si le job
 * échoue, on réessaie avec yt-dlp en direct.
 */

const fs = require("node:fs")
const fsp = require("node:fs/promises")
const path = require("node:path")
const { spawn } = require("node:child_process")
const crypto = require("node:crypto")

const NOTUBE_DIR = process.env.VITRAIL_NOTUBE_DIR || "/root/notube-batch"
const DATA_DIR = process.env.VITRAIL_DATA || "/root/vitrail-data"
const DOWNLOAD_DIR = path.join(DATA_DIR, "downloads")
const JOBS_FILE = path.join(DATA_DIR, "download-jobs.json")
const DRIVE_FOLDER = process.env.VITRAIL_DRIVE_FOLDER || "Vitrail"
const MAX_CONCURRENT = Number(process.env.VITRAIL_JOBS || 2)

fs.mkdirSync(DOWNLOAD_DIR, { recursive: true })

/** file: url, title: "Artiste - Titre", startedAt, status, log, error */
let jobs = []
try {
  jobs = JSON.parse(fs.readFileSync(JOBS_FILE, "utf8"))
} catch {
  jobs = []
}

function saveJobs() {
  fs.writeFile(JOBS_FILE, JSON.stringify(jobs.slice(-200), null, 2), () => undefined)
}

function sanitize(name) {
  return String(name || "morceau")
    .replace(/[^\p{L}\p{N} ._'-]/gu, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120)
}

function runProcess(command, args, onLine) {
  return new Promise(resolve => {
    const child = spawn(command, args, { cwd: NOTUBE_DIR })
    let output = ""
    const capture = chunk => {
      output += chunk
      if (output.length > 200000) output = output.slice(-100000)
      if (onLine) onLine(chunk.toString())
    }
    child.stdout.on("data", capture)
    child.stderr.on("data", capture)
    child.on("error", error => resolve({ code: 1, output: String(error) }))
    child.on("close", code => resolve({ code: code ?? 1, output }))
  })
}

/** Nom de fichier final, dérivé de l'identifiant vidéo. */
function targetName(id, title) {
  const videoId = id.replace(/^yt-/, "")
  return `${sanitize(title) || videoId} [${videoId}]`
}

async function downloadWithNotube(job) {
  const urlFile = path.join(DATA_DIR, `job-${job.id}.txt`)
  await fsp.writeFile(urlFile, `${job.url}\n`, "utf8")
  try {
    return await runProcess(
      "python3",
      [
        "notube_batch.py",
        urlFile,
        "--out",
        DOWNLOAD_DIR,
        "--drive-folder",
        DRIVE_FOLDER,
        "--engine",
        "auto",
        "--workers",
        "1",
        "--delay",
        "0",
      ],
      chunk => {
        job.log = (job.log + chunk).slice(-4000)
      },
    )
  } finally {
    await fsp.unlink(urlFile).catch(() => undefined)
  }
}

async function downloadWithYtdlp(job) {
  const output = path.join(DOWNLOAD_DIR, `${targetName(job.id, job.title)}.%(ext)s`)
  return runProcess(
    path.join(NOTUBE_DIR, "bin", "yt-dlp"),
    [
      "--no-warnings",
      "--no-playlist",
      "-x",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "0",
      "--write-info-json",
      "--write-thumbnail",
      "--convert-thumbnails",
      "jpg",
      "-o",
      output,
      job.url,
    ],
    chunk => {
      job.log = (job.log + chunk).slice(-4000)
    },
  )
}

let running = 0
const queue = []

function pump() {
  while (running < MAX_CONCURRENT && queue.length > 0) {
    const job = queue.shift()
    running += 1
    void execute(job).finally(() => {
      running -= 1
      pump()
    })
  }
}

async function execute(job) {
  job.status = "running"
  job.startedAt = Date.now()
  saveJobs()

  let result = await downloadWithNotube(job)
  job.engine = "notube"

  if (result.code !== 0) {
    job.log = (job.log + "\n--- notube a échoué, repli sur yt-dlp ---\n").slice(-4000)
    result = await downloadWithYtdlp(job)
    job.engine = "yt-dlp"
  }

  if (result.code === 0) {
    job.status = "done"
  } else {
    job.status = "failed"
    job.error = (result.output || "").slice(-500)
  }
  job.finishedAt = Date.now()
  saveJobs()
}

function enqueue({ id, url, title, artist }) {
  const existing = jobs.find(job => job.id === id && job.status !== "failed")
  if (existing) return existing
  const job = {
    id: id || `job-${crypto.randomBytes(4).toString("hex")}`,
    url,
    title: title || "",
    artist: artist || "",
    status: "queued",
    createdAt: Date.now(),
    log: "",
  }
  jobs.push(job)
  saveJobs()
  queue.push(job)
  pump()
  return job
}

function listJobs() {
  return jobs.slice(-50).reverse()
}

function getJob(id) {
  return jobs.find(job => job.id === id) || null
}

module.exports = { enqueue, listJobs, getJob, DOWNLOAD_DIR }
