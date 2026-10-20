import { useEffect, useState } from "react"
import { Radio, Trash2, Users, X } from "lucide-react"
import { clsx } from "clsx"
import { player, usePlayer } from "@/audio/player"
import { Artwork } from "@/components/Artwork"
import {
  addToFamilyQueue,
  isMixedContentBlocked,
  clearFamilyQueue,
  findService,
  getFamilyQueue,
  removeFromFamilyQueue,
  queueItemToTrack,
  type FamilyQueue,
  type QueueItem,
} from "@/lib/family"
import { formatTime } from "@/lib/format"

export function FamilyQueuePanel() {
  const state = usePlayer()
  const [queue, setQueue] = useState<FamilyQueue | null>(null)
  const [online, setOnline] = useState<boolean | null>(null)
  const current = state.queue[state.index] ?? null

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      const service = await findService()
      if (cancelled) return
      setOnline(Boolean(service))
      if (!service) {
        setQueue(null)
        return
      }
      const result = await getFamilyQueue()
      if (!cancelled) setQueue(result)
    }
    void tick()
    const timer = window.setInterval(tick, 4000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  const addCurrent = async () => {
    if (!current) return
    const item: QueueItem = {
      id: current.id.startsWith("family-") ? current.id.slice(6) : current.id,
      kind: current.id.startsWith("family-") ? "family" : "demo",
      title: current.title,
      artist: current.artist,
      album: current.album,
      artwork: current.artwork,
      durationSec: current.durationSec ?? 0,
      source: current.id.startsWith("local-") ? "local" : "demo",
    }
    const result = await addToFamilyQueue(item)
    if (result) setQueue(result)
  }

  const play = async (item: QueueItem) => {
    if (item.kind === "family") {
      const track = queueItemToTrack(item)
      if (track) player.playTrack(track, [track])
      return
    }
    const demo = await import("@/lib/demoCatalog")
    const track = demo.DEMO_TRACKS.find(entry => entry.id === item.id)
    if (track) player.playTrack(track, demo.DEMO_TRACKS)
  }

  if (online === null) {
    return (
      <div className="glass glass-sheen rounded-3xl px-4 py-6 text-center text-sm text-ink/40">
        Recherche du service de la famille…
      </div>
    )
  }

  if (!online) {
    return (
      <div className="glass glass-sheen flex items-start gap-3 rounded-3xl px-4 py-5">
        <Users className="mt-0.5 h-5 w-5 shrink-0 text-ink/35" />
        <div>
          <p className="text-sm text-ink/60">Service de la famille injoignable</p>
          <p className="mt-1 text-sm leading-relaxed text-ink/40">
            {isMixedContentBlocked() ? (
              <>
                Cette page est en HTTPS : le navigateur interdit d&apos;appeler une adresse HTTP locale.
                Ouvre l&apos;app par l&apos;adresse du service local —
                <span className="mx-1 rounded bg-surface-strong px-1.5 py-0.5 font-mono text-xs">
                  http://127.0.0.1:8099
                </span>
                sur la tablette, ou
                <span className="mx-1 rounded bg-surface-strong px-1.5 py-0.5 font-mono text-xs">
                  http://192.168.1.114:8099
                </span>
                depuis les autres appareils du réseau.
              </>
            ) : (
              <>
                La file partagée et la transcription des paroles ont besoin du service local. Démarre-le avec
                <span className="mx-1 rounded bg-surface-strong px-1.5 py-0.5 font-mono text-xs">
                  bash /root/vitrail/server/service.sh start
                </span>
                puis recharges cette page.
              </>
            )}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg">
          <Radio className="h-4 w-4 text-ink/50" />
          File de la famille
        </h2>
        {queue && queue.items.length > 0 ? (
          <button
            type="button"
            onClick={() => void clearFamilyQueue().then(result => result && setQueue(result))}
            className="text-xs text-ink/40 underline decoration-white/20 underline-offset-2 hover:text-ink/70"
          >
            vider
          </button>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => void addCurrent()}
        disabled={!current}
        className="glass glass-press flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm text-ink/80 disabled:opacity-40"
      >
        <Users className="h-4 w-4" />
        {current ? `Ajouter « ${current.title} » à la file de la famille` : "Lance un morceau pour l'ajouter"}
      </button>

      {queue && queue.items.length > 0 ? (
        <ul className="glass glass-sheen overflow-hidden rounded-3xl">
          {queue.items.map(item => (
            <li key={item.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface">
              <button
                type="button"
                onClick={() => void play(item)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <Artwork src={item.artwork} alt="" size="sm" rounded="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{item.title}</p>
                  <p className="truncate text-xs text-ink/40">
                    {item.artist}
                    {item.kind === "family" ? " · bibliothèque de la famille" : ""}
                  </p>
                </div>
                <span className="shrink-0 text-xs tabular-nums text-ink/30">
                  {formatTime(item.durationSec)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => void removeFromFamilyQueue(item.id).then(result => result && setQueue(result))}
                aria-label={`Retirer ${item.title}`}
                className="glass-press flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink/40 hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="glass glass-sheen rounded-3xl px-4 py-8 text-center">
          <p className="text-sm text-ink/45">La file de la famille est vide</p>
          <p className="mt-1 text-sm text-ink/30">
            Chacun ajoute ses morceaux depuis son appareil, tout le monde les voit apparaître.
          </p>
        </div>
      )}

      {queue?.now ? (
        <p className="px-1 text-xs text-ink/35">En cours chez la famille : {queue.now.title}</p>
      ) : null}
    </div>
  )
}

export { clsx, Trash2 }
