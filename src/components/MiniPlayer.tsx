import { Pause, Play } from "lucide-react"
import { clsx } from "clsx"
import { player, usePlayer } from "@/audio/player"
import { Artwork } from "@/components/Artwork"
import { ProgressBar } from "@/components/ProgressBar"

export function MiniPlayer({ onOpen, hidden }: { onOpen: () => void; hidden?: boolean }) {
  const state = usePlayer()
  const track = state.queue[state.index] ?? null
  const duration = state.duration || track?.durationSec || 0

  if (!track || hidden) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[max(env(safe-area-inset-bottom),0.6rem)]">
      <div className="glass-strong glass-sheen pointer-events-auto w-full max-w-2xl overflow-hidden rounded-2xl">
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
              <p className="truncate text-xs text-white/45">{track.artist}</p>
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
              "glass-press flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-ink-950",
            )}
          >
            {state.playing ? (
              <Pause className="h-5 w-5 fill-ink-950" />
            ) : (
              <Play className="h-5 w-5 translate-x-[1px] fill-ink-950" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
