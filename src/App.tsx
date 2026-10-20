import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { ListMusic, Mic2, Sparkles } from "lucide-react"
import { clsx } from "clsx"
import { player, usePlayer } from "@/audio/player"
import { Backdrop } from "@/components/Backdrop"
import { Capsules } from "@/components/Capsules"
import { FamilyQueuePanel } from "@/components/FamilyQueue"
import { Library } from "@/components/Library"
import { MiniPlayer } from "@/components/MiniPlayer"
import { NowPlaying } from "@/components/NowPlaying"
import { QueueList, QueueSheet } from "@/components/Queue"
import { LYRICS_IDS } from "@/lib/lyricsIndex"
import { flushHistory, useHistoryRecorder } from "@/lib/history"

type View = "home" | "queue" | "capsules"

export default function App() {
  const state = usePlayer()
  const [view, setView] = useState<View>("home")
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false)
  const [queueOpen, setQueueOpen] = useState(false)
  const current = state.queue[state.index] ?? null

  useHistoryRecorder()

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flushHistory()
    }
    document.addEventListener("visibilitychange", onHide)
    window.addEventListener("pagehide", flushHistory)
    return () => {
      document.removeEventListener("visibilitychange", onHide)
      window.removeEventListener("pagehide", flushHistory)
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return
      if (event.code === "Space") {
        event.preventDefault()
        player.toggle()
      }
      if (event.code === "ArrowRight" && event.shiftKey) player.next()
      if (event.code === "ArrowLeft" && event.shiftKey) player.prev()
      if (event.code === "Escape") setNowPlayingOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <div className="relative flex min-h-full flex-col">
      <Backdrop artwork={current?.artwork ?? null} />

      <main
        className={clsx(
          "safe-top mx-auto w-full max-w-3xl flex-1 px-4 pt-4",
          current && !nowPlayingOpen ? "pb-52" : "pb-32",
        )}
      >
        {view === "home" ? (
          <Library lyricsIds={LYRICS_IDS} onPlay={() => setNowPlayingOpen(true)} />
        ) : view === "queue" ? (
          <div className="flex flex-col gap-6">
            <header className="px-1 pt-2">
              <p className="text-[11px] uppercase tracking-[0.28em] text-ink/35">Vitrail</p>
              <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">
                File d&apos;attente
              </h1>
            </header>
            <FamilyQueuePanel />
            <section className="flex flex-col gap-3">
              <h2 className="px-1 font-display text-lg">File de cet appareil</h2>
              <QueueList />
            </section>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <header className="px-1 pt-2">
              <p className="text-[11px] uppercase tracking-[0.28em] text-ink/35">Vitrail</p>
              <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">Capsules</h1>
            </header>
            <Capsules />
          </div>
        )}
      </main>

      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-10 h-48 bg-gradient-to-t from-canvas via-canvas/85 to-transparent light:via-canvas/35 light:to-transparent"
      />

      {/* Dock du bas : lecteur compact puis navigation, dans un seul flux
          pour qu'ils ne puissent plus se chevaucher. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex flex-col items-center gap-2 px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)]">
        {current && !nowPlayingOpen ? <MiniPlayer onOpen={() => setNowPlayingOpen(true)} /> : null}
        <nav className="flex justify-center">
          <div className="dock-panel pointer-events-auto flex items-center gap-1 rounded-full p-1">
            <NavButton
              active={view === "home"}
              onClick={() => setView("home")}
              icon={<ListMusic className="h-4 w-4" />}
              label="Musique"
            />
            <NavButton
              active={view === "queue"}
              onClick={() => setView("queue")}
              icon={<Mic2 className="h-4 w-4" />}
              label="File"
            />
            <NavButton
              active={view === "capsules"}
              onClick={() => setView("capsules")}
              icon={<Sparkles className="h-4 w-4" />}
              label="Capsules"
            />
          </div>
        </nav>
      </div>

      <QueueSheet open={queueOpen} onClose={() => setQueueOpen(false)} />

      <NowPlaying
        open={nowPlayingOpen && Boolean(current)}
        onClose={() => setNowPlayingOpen(false)}
        onOpenQueue={() => setQueueOpen(true)}
      />
    </div>
  )
}

function NavButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex items-center gap-2 rounded-full px-4 py-2 text-xs transition-colors",
        active ? "bg-ink text-canvas" : "text-ink/60 hover:text-ink",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
