import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { ListMusic, Mic2, Sparkles } from "lucide-react"
import { clsx } from "clsx"
import { player, usePlayer } from "@/audio/player"
import { Backdrop } from "@/components/Backdrop"
import { Library } from "@/components/Library"
import { MiniPlayer } from "@/components/MiniPlayer"
import { NowPlaying } from "@/components/NowPlaying"
import { QueueList, QueueSheet } from "@/components/Queue"
import { LYRICS_IDS } from "@/lib/lyricsIndex"

type View = "home" | "queue" | "capsules"

export default function App() {
  const state = usePlayer()
  const [view, setView] = useState<View>("home")
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false)
  const [queueOpen, setQueueOpen] = useState(false)
  const current = state.queue[state.index] ?? null

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

      <main className="safe-top mx-auto w-full max-w-3xl flex-1 px-4 pt-4 pb-48">
        {view === "home" ? (
          <Library lyricsIds={LYRICS_IDS} onPlay={() => setNowPlayingOpen(true)} />
        ) : view === "queue" ? (
          <div className="flex flex-col gap-5">
            <header className="px-1 pt-2">
              <p className="text-[11px] uppercase tracking-[0.28em] text-white/35">Vitrail</p>
              <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">
                File d&apos;attente
              </h1>
            </header>
            <QueueList />
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <header className="px-1 pt-2">
              <p className="text-[11px] uppercase tracking-[0.28em] text-white/35">Vitrail</p>
              <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">Capsules</h1>
              <p className="mt-2 text-sm text-white/45">
                Tes rétrospectives d&apos;écoute arrivent dans la prochaine étape.
              </p>
            </header>
            <div className="glass glass-sheen flex items-center gap-4 rounded-3xl p-5">
              <Sparkles className="h-8 w-8 text-white/50" />
              <p className="text-sm text-white/55">
                Historique, temps d&apos;écoute, artistes et albums les plus écoutés de la famille.
              </p>
            </div>
          </div>
        )}
      </main>

      <MiniPlayer onOpen={() => setNowPlayingOpen(true)} hidden={nowPlayingOpen} />

      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-10 h-40 bg-gradient-to-t from-ink-950 via-ink-950/85 to-transparent"
      />

      <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center pb-[max(env(safe-area-inset-bottom),0.6rem)]">
        <div
          className={clsx(
            "glass-strong glass-sheen pointer-events-auto flex items-center gap-1 rounded-full p-1 transition-transform duration-300",
            current && !nowPlayingOpen ? "-translate-y-[4.6rem]" : "",
          )}
        >
          <NavButton active={view === "home"} onClick={() => setView("home")} icon={<ListMusic className="h-4 w-4" />} label="Musique" />
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
        active ? "bg-white/90 text-ink-950" : "text-white/60 hover:text-white",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
