import { useEffect, useMemo, useRef } from "react"
import { clsx } from "clsx"
import { activeLineIndex } from "@/lib/lrc"
import type { LyricsState } from "@/lib/types"

type LyricsProps = {
  state: LyricsState
  currentTime: number
  onSeek: (seconds: number) => void
  className?: string
}

export function Lyrics({ state, currentTime, onSeek, className }: LyricsProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const lineRefs = useRef(new Map<number, HTMLButtonElement>())
  const userScrollUntil = useRef(0)

  const lines = state.status === "ready" ? state.lyrics.synced : null
  const activeIndex = useMemo(() => (lines ? activeLineIndex(lines, currentTime) : -1), [lines, currentTime])

  useEffect(() => {
    if (activeIndex < 0) return
    if (Date.now() < userScrollUntil.current) return
    const element = lineRefs.current.get(activeIndex)
    if (!element) return
    element.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [activeIndex])

  const markUserScroll = () => {
    userScrollUntil.current = Date.now() + 4000
  }

  if (state.status === "loading") {
    return (
      <div className={clsx("flex flex-col justify-center gap-4 px-2", className)}>
        {[72, 88, 60, 80, 52].map((width, index) => (
          <div
            key={index}
            className="h-7 animate-pulse rounded-full bg-ink/8"
            style={{ width: `${width}%`, animationDelay: `${index * 90}ms` }}
          />
        ))}
      </div>
    )
  }

  if (state.status === "transcribing") {
    return (
      <div className={clsx("flex flex-col items-center justify-center gap-3 px-8 text-center", className)}>
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-white/70" />
        <p className="font-display text-xl text-ink/75">Paroles en cours de calcul</p>
        <p className="max-w-xs text-sm leading-relaxed text-ink/35">
          Ce morceau n&apos;est pas dans les bases de paroles connues. L&apos;app le transcrit sur cet
          appareil — les paroles s&apos;afficheront ici dès que c&apos;est prêt.
        </p>
      </div>
    )
  }

  if (state.status === "none") {
    return (
      <div className={clsx("flex flex-col items-center justify-center gap-3 px-8 text-center", className)}>
        <p className="font-display text-xl text-ink/70">Paroles indisponibles</p>
        <p className="max-w-xs text-sm leading-relaxed text-ink/35">
          Ce morceau n&apos;est pas encore référencé dans la base libre LRCLIB. Les paroles apparaîtront dès
          qu&apos;elles y seront ajoutées.
        </p>
      </div>
    )
  }

  if (state.status === "error") {
    return (
      <div className={clsx("flex flex-col items-center justify-center gap-3 px-8 text-center", className)}>
        <p className="font-display text-xl text-ink/70">Connexion aux paroles impossible</p>
        <p className="text-sm text-ink/35">{state.message}</p>
      </div>
    )
  }

  if (state.status !== "ready") return null

  if (lines && lines.length > 0) {
    return (
      <div
        ref={scrollRef}
        onWheel={markUserScroll}
        onTouchMove={markUserScroll}
        onKeyDown={markUserScroll}
        className={clsx("no-scrollbar line-mask h-full overflow-y-auto overscroll-contain px-2 pr-8", className)}
      >
        <div className="py-[38%]">
          {lines.map((line, index) => {
            const distance = Math.abs(index - activeIndex)
            const isActive = index === activeIndex
            const isPast = index < activeIndex
            return (
              <button
                key={`${line.time}-${index}`}
                ref={element => {
                  if (element) lineRefs.current.set(index, element)
                  else lineRefs.current.delete(index)
                }}
                type="button"
                onClick={() => onSeek(line.time)}
                className={clsx(
                  "block w-full origin-left text-left font-display leading-tight transition-all duration-500",
                  "px-2 py-2",
                  isActive
                    ? "text-3xl font-semibold text-ink drop-shadow-[0_2px_18px_rgba(0,0,0,0.6)] sm:text-4xl"
                    : distance === 1
                      ? "text-2xl text-ink/45 sm:text-3xl"
                      : "text-2xl text-ink/25 sm:text-3xl",
                  isPast && !isActive ? "text-ink/18" : "",
                )}
              >
                {isActive && line.words && line.words.length > 0 ? (
                  <span>
                    {line.words.map((word, wordIndex) => {
                      const isWordActive = currentTime >= word.time
                      return (
                        <span
                          key={`${word.time}-${wordIndex}`}
                          className={clsx(
                            "transition-colors duration-200",
                            isWordActive ? "text-ink" : "text-ink/35",
                          )}
                        >
                          {word.text}{" "}
                        </span>
                      )
                    })}
                  </span>
                ) : (
                  <span>{line.text || "·"}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  if (state.lyrics.plain && state.lyrics.plain.length > 0) {
    return (
      <div className={clsx("no-scrollbar line-mask h-full overflow-y-auto px-2", className)}>
        <div className="space-y-4 py-[30%] font-display text-2xl leading-snug text-ink/70">
          {state.lyrics.plain.map((line, index) => (
            <p key={index}>{line}</p>
          ))}
        </div>
      </div>
    )
  }

  return null
}
