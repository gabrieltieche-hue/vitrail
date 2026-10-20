import { useState } from "react"
import { Music2 } from "lucide-react"
import { clsx } from "clsx"

type ArtworkProps = {
  src: string
  alt: string
  size?: "sm" | "md" | "lg" | "xl" | "none"
  className?: string
  rounded?: "md" | "xl" | "2xl" | "3xl"
  eager?: boolean
}

const sizes = {
  sm: "h-11 w-11",
  md: "h-16 w-16",
  lg: "h-32 w-32",
  xl: "h-full w-full",
  none: "",
} as const

const radii = {
  md: "rounded-lg",
  xl: "rounded-2xl",
  "2xl": "rounded-3xl",
  "3xl": "rounded-[2rem]",
} as const

export function Artwork({ src, alt, size = "md", className, rounded = "xl", eager = false }: ArtworkProps) {
  const [failed, setFailed] = useState(false)

  return (
    <div
      className={clsx(
        "relative overflow-hidden bg-ink/10",
        sizes[size],
        radii[rounded],
        className,
      )}
    >
      {failed || !src ? (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-ink/10 via-ink/5 to-transparent">
          <Music2 className="h-1/3 w-1/3 text-ink/35" strokeWidth={1.5} />
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          draggable={false}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      )}
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/12" />
    </div>
  )
}
