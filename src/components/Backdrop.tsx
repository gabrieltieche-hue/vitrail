import { clsx } from "clsx"

type BackdropProps = {
  artwork: string | null
  className?: string
}

/**
 * Fond « vitrail » : la pochette, agrandie et floutée, donne sa lumière à
 * l'écran. En thème clair, la même lumière mais attenuee : l'image est
 * delavée pour que le texte reste lisible.
 */
export function Backdrop({ artwork, className }: BackdropProps) {
  return (
    <div className={clsx("pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-canvas", className)}>
      {artwork ? (
        <img
          src={artwork}
          alt=""
          aria-hidden
          className="breathe absolute left-1/2 top-1/2 h-[46vh] w-[46vh] -translate-x-1/2 -translate-y-1/2 scale-[7] object-cover opacity-60 blur-3xl saturate-150 light:opacity-30 light:saturate-[1.05]"
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,#2a2340,transparent_55%),radial-gradient(circle_at_80%_30%,#123044,transparent_50%),radial-gradient(circle_at_50%_90%,#3a1f2e,transparent_60%)] light:bg-[radial-gradient(circle_at_18%_12%,#e7e2f5,transparent_58%),radial-gradient(circle_at_82%_28%,#dceaf5,transparent_52%),radial-gradient(circle_at_50%_92%,#f6e3ec,transparent_62%)]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-canvas/35 via-canvas/60 to-canvas light:from-canvas/45 light:via-canvas/70 light:to-canvas/95" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,0.55)_100%)] light:bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.08)_100%)]" />
    </div>
  )
}
