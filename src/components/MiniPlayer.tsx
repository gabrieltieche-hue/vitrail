import { Pause, Play } from "lucide-react"
import { clsx } from "clsx"
import { player, usePlayer } from "@/audio/player"
import { Artwork } from "@/components/Artwork"
import { ProgressBar } from "@/components/ProgressBar"

/**
 * Lecteur compact. Il vit dans le « dock » du bas (avec la navigation),
 * et non en position fixe : c'était la cause du chevauchement.
 */
export function MiniPlayer({ onOpen }: { onOpen: () => void }) {
  const state = usePlayer()
  const track = state.queue[state.index] ?? null
  const duration = state.duration || track?.durationSec || 0

  if (!track) return null

  return (
    <div className="dock-panel glass-press pointer-events-auto w-full max-w-2xl overflow-hidden rounded-2xl">
      <ProgressBar
        value={state.time}
        max={duration}
        onSeek={seconds => player.seek(seconds)}
        className="h-2 px-3"
      />
      <div className="flex items-center gap-3 px-3 pb-2.5">
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <Artwork src={track.artwork} alt="" size="sm" rounded="md" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{track.title}</p>
            <p className="truncate text-xs text-ink/45">{track.artist}</p>
          </div>
        </button>
        <button
          type="button"
          onClick={event => {
            event.stopPropagation()
            player.toggle()
          }}
          aria-label={state.playing ? "Pause" : "Lecture"}
          className={clsx(
            "glass-press flex h-10 w-10 items-center justify-center rounded-full bg-ink text-canvas",
          )}
        >
          {state.playing ? (
            <Pause className="h-5 w-5 fill-canvas" />
          ) : (
            <Play className="h-5 w-5 translate-x-[1px] fill-canvas" />
          )}
        </button>
      </div>
    </div>
  )
}
