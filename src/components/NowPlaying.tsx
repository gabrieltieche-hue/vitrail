import { useState } from "react"
import type { ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  ChevronDown,
  ListMusic,
  Mic2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react"
import { clsx } from "clsx"
import { player, usePlayer } from "@/audio/player"
import { Artwork } from "@/components/Artwork"
import { Lyrics } from "@/components/Lyrics"
import { ProgressBar } from "@/components/ProgressBar"
import { formatTime } from "@/lib/format"
import { useLyrics } from "@/lib/useLyrics"
import type { Track } from "@/lib/types"

type NowPlayingProps = {
  open: boolean
  onClose: () => void
  onOpenQueue: () => void
}

export function NowPlaying({ open, onClose, onOpenQueue }: NowPlayingProps) {
  const state = usePlayer()
  const [mode, setMode] = useState<"art" | "lyrics">("art")
  const track = state.queue[state.index] ?? null
  const lyricsState = useLyrics(track)

  if (!track) return null

  const duration = state.duration || track.durationSec || 0
  const context = state.contextLabel && state.contextLabel !== track.album ? state.contextLabel : null

  return (
    <AnimatePresence>
      {open ? (
        <motion.section
          key="now-playing"
          initial={{ y: "100%", opacity: 0.4 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0.4 }}
          transition={{ type: "spring", stiffness: 300, damping: 32 }}
          className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-canvas"
        >
          {/* Lumière de la pochette : c'est la signature « vitrail ». */}
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <img
              src={track.artwork}
              alt=""
              className="breathe absolute left-1/2 top-1/3 h-[70vh] w-[70vh] -translate-x-1/2 -translate-y-1/2 scale-[5] object-cover opacity-45 blur-3xl saturate-160 light:opacity-25 light:saturate-[1.05]"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-canvas/55 via-canvas/80 to-canvas light:from-canvas/50 light:via-canvas/75 light:to-canvas/95" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.7)_100%)] light:bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.1)_100%)]" />
          </div>

          <header className="safe-top relative z-10 flex items-center justify-between px-4 pt-3 pb-1">
            <button
              type="button"
              onClick={onClose}
              aria-label="Réduire"
              className="glass glass-press flex h-10 w-10 items-center justify-center rounded-full"
            >
              <ChevronDown className="h-5 w-5" />
            </button>
            <div className="flex min-w-0 flex-col items-center px-2 text-center">
              <span className="truncate text-[10px] uppercase tracking-[0.2em] text-ink/40">
                {context ?? "Lecture en cours"}
              </span>
              <span className="truncate font-display text-sm text-ink/80">{track.album}</span>
            </div>
            <button
              type="button"
              onClick={onOpenQueue}
              aria-label="File d'attente"
              className="glass glass-press flex h-10 w-10 items-center justify-center rounded-full"
            >
              <ListMusic className="h-5 w-5" />
            </button>
          </header>

          <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-5 overflow-hidden px-4 pt-3 md:grid md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:grid-rows-[minmax(0,1fr)] md:items-center md:gap-12 md:px-14">
            <div
              className={clsx(
                "min-h-0 flex-1 flex-col items-center justify-center gap-5 md:flex md:h-full",
                mode === "art" ? "flex" : "hidden",
              )}
            >
              <div className="relative aspect-square w-full max-w-[min(78vw,38vh,380px)]">
                <Artwork
                  src={track.artwork}
                  alt={`Pochette de ${track.album}`}
                  size="none"
                  rounded="3xl"
                  eager
                  className="glass-sheen h-full w-full shadow-[0_50px_120px_-40px_rgba(0,0,0,0.95)]"
                />
              </div>
              <div className="hidden w-full max-w-[min(78vw,38vh,380px)] flex-col md:flex">
                <TrackMeta track={track} />
                <ProgressBar
                  value={state.time}
                  max={duration}
                  onSeek={seconds => player.seek(seconds)}
                  className="mt-2"
                />
                <div className="flex justify-between text-xs tabular-nums text-ink/40">
                  <span>{formatTime(state.time)}</span>
                  <span>{duration > 0 ? `-${formatTime(Math.max(0, duration - state.time))}` : "--:--"}</span>
                </div>
              </div>
            </div>

            <div
              className={clsx(
                "min-h-0 flex-1 md:flex md:h-full",
                mode === "lyrics" ? "flex" : "hidden",
              )}
            >
              <Lyrics
                state={lyricsState}
                currentTime={state.time}
                onSeek={seconds => player.seek(seconds)}
                className="h-full w-full"
              />
            </div>
          </div>

          <footer className="safe-bottom relative z-10 px-5 pt-2 pb-4 md:px-14">
            {state.error ? (
              <p className="mb-2 rounded-xl bg-red-500/15 px-3 py-1.5 text-center text-xs text-red-200">
                {state.error}
              </p>
            ) : null}
            <div className="md:hidden">
              <TrackMeta track={track} />
              <ProgressBar
                value={state.time}
                max={duration}
                onSeek={seconds => player.seek(seconds)}
                className="mt-1"
              />
              <div className="flex justify-between text-xs tabular-nums text-ink/40">
                <span>{formatTime(state.time)}</span>
                <span>{duration > 0 ? `-${formatTime(Math.max(0, duration - state.time))}` : "--:--"}</span>
              </div>
              <div className="mt-2 flex justify-center">
                <ModeSwitcher mode={mode} onChange={setMode} compact />
              </div>
            </div>

            <div className="mt-2 flex items-center justify-center gap-6">
              <IconButton
                active={state.shuffle}
                onClick={() => player.toggleShuffle()}
                label="Lecture aléatoire"
              >
                <Shuffle className="h-5 w-5" />
              </IconButton>
              <IconButton onClick={() => player.prev()} label="Précédent">
                <SkipBack className="h-6 w-6" />
              </IconButton>
              <button
                type="button"
                onClick={() => player.toggle()}
                aria-label={state.playing ? "Pause" : "Lecture"}
                className="glass-press flex h-[68px] w-[68px] items-center justify-center rounded-full bg-ink text-canvas shadow-[0_18px_45px_-12px_rgba(255,255,255,0.45)]"
              >
                {state.playing ? (
                  <Pause className="h-7 w-7 fill-canvas" />
                ) : (
                  <Play className="h-7 w-7 translate-x-[2px] fill-canvas" />
                )}
              </button>
              <IconButton onClick={() => player.next()} label="Suivant">
                <SkipForward className="h-6 w-6" />
              </IconButton>
              <IconButton
                active={state.repeat !== "off"}
                onClick={() => player.cycleRepeat()}
                label="Répétition"
              >
                {state.repeat === "one" ? <Repeat1 className="h-5 w-5" /> : <Repeat className="h-5 w-5" />}
              </IconButton>
            </div>

            <div className="mt-3 hidden items-center gap-3 md:flex">
              <IconButton onClick={() => player.toggleMute()} label="Couper le son">
                {state.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </IconButton>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={state.muted ? 0 : state.volume}
                onChange={event => player.setVolume(Number(event.target.value))}
                aria-label="Volume"
                className="range-glass w-40"
              />
            </div>
          </footer>
        </motion.section>
      ) : null}
    </AnimatePresence>
  )
}

function TrackMeta({ track }: { track: Track }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="truncate font-display text-2xl font-semibold tracking-tight md:text-3xl">
          {track.title}
        </h1>
        <p className="truncate text-sm text-ink/50">
          {track.artist}
          {track.license ? (
            <>
              {" · "}
              <a
                href={track.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-white/25 underline-offset-2 hover:text-ink/80"
              >
                {track.license}
              </a>
            </>
          ) : null}
        </p>
      </div>
    </div>
  )
}

function ModeSwitcher({
  mode,
  onChange,
  compact,
}: {
  mode: "art" | "lyrics"
  onChange: (mode: "art" | "lyrics") => void
  compact?: boolean
}) {
  return (
    <div className="glass glass-sheen flex items-center gap-1 rounded-full p-1">
      <button
        type="button"
        onClick={() => onChange("art")}
        aria-label="Pochette"
        aria-pressed={mode === "art"}
        className={clsx(
          "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs transition-colors",
          mode === "art" ? "bg-ink text-canvas" : "text-ink/60",
        )}
      >
        <ListMusic className="h-4 w-4" />
        {compact ? null : <span>Pochette</span>}
      </button>
      <button
        type="button"
        onClick={() => onChange("lyrics")}
        aria-label="Paroles"
        aria-pressed={mode === "lyrics"}
        className={clsx(
          "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs transition-colors",
          mode === "lyrics" ? "bg-ink text-canvas" : "text-ink/60",
        )}
      >
        <Mic2 className="h-4 w-4" />
        {compact ? null : <span>Paroles</span>}
      </button>
    </div>
  )
}

function IconButton({
  children,
  onClick,
  label,
  active,
}: {
  children: ReactNode
  onClick: () => void
  label: string
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={clsx(
        "glass-press flex h-11 w-11 items-center justify-center rounded-full transition-colors",
        active ? "glass text-ink" : "text-ink/65 hover:text-ink",
      )}
    >
      {children}
    </button>
  )
}
