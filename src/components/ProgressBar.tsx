import { useCallback, useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"
import { clsx } from "clsx"

type ProgressBarProps = {
  value: number
  max: number
  onSeek: (seconds: number) => void
  className?: string
  disabled?: boolean
}

export function ProgressBar({ value, max, onSeek, className, disabled }: ProgressBarProps) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [dragValue, setDragValue] = useState<number | null>(null)

  const ratioFromEvent = useCallback((clientX: number): number => {
    const element = trackRef.current
    if (!element) return 0
    const rect = element.getBoundingClientRect()
    const ratio = (clientX - rect.left) / rect.width
    return Math.min(1, Math.max(0, ratio))
  }, [])

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragValue(ratioFromEvent(event.clientX) * max)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragValue === null) return
    setDragValue(ratioFromEvent(event.clientX) * max)
  }

  const commit = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragValue === null) return
    const next = ratioFromEvent(event.clientX) * max
    setDragValue(null)
    onSeek(next)
  }

  const displayed = dragValue ?? value
  const progress = max > 0 ? Math.min(100, (displayed / max) * 100) : 0

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(displayed)}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={commit}
      onPointerCancel={() => setDragValue(null)}
      className={clsx(
        "group relative flex h-8 w-full touch-none items-center",
        disabled ? "cursor-default opacity-50" : "cursor-pointer",
        className,
      )}
    >
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-ink/15">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-ink"
          style={{ width: `${progress}%`, transition: dragValue === null ? "width 180ms linear" : "none" }}
        />
      </div>
      <div
        className="absolute h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-ink opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
        style={{ left: `${progress}%`, opacity: dragValue === null ? undefined : 1 }}
      />
    </div>
  )
}
