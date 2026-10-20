import { motion } from "framer-motion"
import { Pause, Play, Trash2, X } from "lucide-react"
import { clsx } from "clsx"
import { player, usePlayer } from "@/audio/player"
import { Artwork } from "@/components/Artwork"
import { formatTime } from "@/lib/format"

export function QueueList() {
  const state = usePlayer()

  if (state.queue.length === 0) {
    return (
      <div className="glass glass-sheen rounded-3xl px-6 py-12 text-center">
        <p className="font-display text-xl text-ink/70">La file est vide</p>
        <p className="mt-2 text-sm text-ink/40">
          Choisis un album ou un morceau pour commencer l&apos;écoute.
        </p>
      </div>
    )
  }

  return (
    <ul className="glass glass-sheen overflow-hidden rounded-3xl">
      {state.queue.map((track, index) => {
        const isCurrent = index === state.index
        return (
          <li
            key={`${track.id}-${index}`}
            className={clsx(
              "flex items-center gap-3 px-3 py-2.5 transition-colors",
              isCurrent ? "bg-surface-strong" : "hover:bg-surface",
            )}
          >
            <button
              type="button"
              onClick={() => (isCurrent ? player.toggle() : player.jumpTo(index))}
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
                <p
                  className={clsx(
                    "truncate text-sm",
                    isCurrent ? "font-medium text-ink" : "text-ink/85",
                  )}
                >
                  {track.title}
                </p>
                <p className="truncate text-xs text-ink/40">{track.album}</p>
              </div>
              <span className="shrink-0 text-xs tabular-nums text-ink/35">
                {formatTime(track.durationSec ?? 0)}
              </span>
            </button>
            <button
              type="button"
              onClick={() => player.removeAt(index)}
              aria-label={`Retirer ${track.title}`}
              className="glass-press flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink/40 hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function QueueSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const state = usePlayer()

  return (
    <motion.div
      initial={false}
      animate={{ opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
      onClick={onClose}
    >
      <motion.div
        initial={false}
        animate={{ y: open ? 0 : "100%" }}
        transition={{ type: "spring", stiffness: 360, damping: 36 }}
        onClick={event => event.stopPropagation()}
        className="safe-bottom max-h-[72vh] w-full max-w-2xl overflow-hidden rounded-t-[2rem] border-t border-line bg-canvas px-4 pt-3 pb-6"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink/25" />
        <div className="mb-3 flex items-center justify-between px-1">
          <h2 className="font-display text-lg">
            File d&apos;attente
            <span className="ml-2 text-sm text-ink/40">{state.queue.length} morceaux</span>
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => player.clearQueue()}
              aria-label="Vider la file"
              className="glass-press flex h-9 w-9 items-center justify-center rounded-full text-ink/50 hover:text-ink"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="glass-press flex h-9 w-9 items-center justify-center rounded-full text-ink/60"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="no-scrollbar max-h-[58vh] overflow-y-auto">
          <QueueList />
        </div>
      </motion.div>
    </motion.div>
  )
}
