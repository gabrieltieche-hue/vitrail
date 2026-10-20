import { useRef, useState } from "react"
import { FolderOpen, HardDriveDownload, Pause, Play, Trash2, Upload, X } from "lucide-react"
import { clsx } from "clsx"
import { player, usePlayer } from "@/audio/player"
import { Artwork } from "@/components/Artwork"
import { formatTime } from "@/lib/format"
import { pickDirectory } from "@/lib/localLibrary"
import { useLocalLibrary } from "@/lib/useLocalLibrary"

const supportsDirectory = typeof window !== "undefined" && "showDirectoryPicker" in window

export function LocalLibrary({ onPlay }: { onPlay?: (() => void) | undefined }) {
  const { tracks, loading, importing, usage, quota, error, addFiles, remove, clear } = useLocalLibrary()
  const state = usePlayer()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    const files = Array.from(fileList)
    await addFiles(files)
    setMessage(`${files.length} fichier${files.length > 1 ? "s" : ""} importé${files.length > 1 ? "s" : ""}`)
  }

  const handleDirectory = async () => {
    setBusy(true)
    try {
      const files = await pickDirectory()
      if (files === null) {
        setMessage("Sélecteur de dossier non supporté par ce navigateur")
        return
      }
      if (files.length === 0) {
        setMessage("Aucun fichier audio trouvé dans ce dossier")
        return
      }
      await addFiles(files)
      setMessage(`${files.length} fichier${files.length > 1 ? "s" : ""} importé${files.length > 1 ? "s" : ""}`)
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return
      setMessage("Dossier non lu")
    } finally {
      setBusy(false)
    }
  }

  const usedPercent = quota > 0 ? Math.min(100, (usage / quota) * 100) : 0

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="font-display text-xl">
          Ma musique
          {tracks.length > 0 ? <span className="ml-2 text-sm font-normal text-white/35">{tracks.length}</span> : null}
        </h2>
        {tracks.length > 0 ? (
          <button
            type="button"
            onClick={() => void clear()}
            className="text-xs text-white/40 underline decoration-white/20 underline-offset-2 hover:text-white/70"
          >
            tout effacer
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={importing}
          className="glass glass-press flex items-center gap-2 rounded-full px-4 py-2 text-xs text-white/80 disabled:opacity-50"
        >
          <Upload className="h-4 w-4" />
          {importing ? "Import en cours…" : "Importer des fichiers"}
        </button>
        {supportsDirectory ? (
          <button
            type="button"
            onClick={() => void handleDirectory()}
            disabled={busy}
            className="glass glass-press flex items-center gap-2 rounded-full px-4 py-2 text-xs text-white/80 disabled:opacity-50"
          >
            <FolderOpen className="h-4 w-4" />
            Choisir un dossier
          </button>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept="audio/*,.mp3,.flac,.m4a,.ogg,.opus,.wav"
          multiple
          className="hidden"
          onChange={event => {
            void handleFiles(event.target.files)
            event.target.value = ""
          }}
        />
        {message ? <span className="text-xs text-white/40">{message}</span> : null}
        {error ? <span className="text-xs text-red-300">{error}</span> : null}
      </div>

      {loading ? (
        <div className="glass glass-sheen rounded-3xl px-4 py-6 text-center text-sm text-white/40">
          Lecture de la bibliothèque…
        </div>
      ) : tracks.length === 0 ? (
        <div className="glass glass-sheen flex items-start gap-3 rounded-3xl px-4 py-5">
          <HardDriveDownload className="mt-0.5 h-5 w-5 shrink-0 text-white/35" />
          <p className="text-sm leading-relaxed text-white/45">
            Tes propres fichiers audio restent sur cet appareil. Les titres, artistes et pochettes sont lus
            dans les balises du fichier — rien n&apos;est envoyé sur internet.
          </p>
        </div>
      ) : (
        <ul className="glass glass-sheen overflow-hidden rounded-3xl">
          {tracks.map(track => {
            const isCurrent = track.id === state.queue[state.index]?.id
            return (
              <li
                key={track.id}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2.5 transition-colors",
                  isCurrent ? "bg-white/10" : "hover:bg-white/5",
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (isCurrent) {
                      player.toggle()
                      return
                    }
                    player.playTrack(track, tracks)
                    onPlay?.()
                  }}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <div className="relative">
                    <Artwork src={track.artwork} alt="" size="sm" rounded="md" />
                    {isCurrent ? (
                      <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/45">
                        {state.playing ? (
                          <Pause className="h-4 w-4 fill-white" />
                        ) : (
                          <Play className="h-4 w-4 fill-white" />
                        )}
                      </span>
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={clsx("truncate text-sm", isCurrent ? "text-white" : "text-white/85")}>
                      {track.title}
                    </p>
                    <p className="truncate text-xs text-white/40">
                      {track.artist}
                      {track.album && track.album !== "Ma bibliothèque" ? ` · ${track.album}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-white/35">
                    {formatTime(track.durationSec ?? 0)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void remove(track.id)}
                  aria-label={`Retirer ${track.title}`}
                  className="glass-press flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/40 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {tracks.length > 0 && quota > 0 ? (
        <div className="px-1">
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-white/40"
              style={{ width: `${Math.max(1, usedPercent)}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-white/30">
            {formatBytes(usage)} utilisés sur {formatBytes(quota)} disponibles
          </p>
        </div>
      ) : null}
    </section>
  )
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 Mo"
  const units = ["o", "Ko", "Mo", "Go"]
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
}

export { Trash2 }
