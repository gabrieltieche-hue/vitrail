import { useMemo, useState } from "react"
import { ChevronRight, Mic2, Pause, Play, Search } from "lucide-react"
import { clsx } from "clsx"
import { player, usePlayer } from "@/audio/player"
import { Artwork } from "@/components/Artwork"
import { CatalogSearch } from "@/components/CatalogSearch"
import { DEMO_ATTRIBUTION, DEMO_TRACKS } from "@/lib/demoCatalog"
import { LocalLibrary } from "@/components/LocalLibrary"
import { ThemeToggle } from "@/components/ThemeToggle"
import { formatTime } from "@/lib/format"
import type { Track } from "@/lib/types"

type LibraryProps = {
  lyricsIds?: ReadonlySet<string> | undefined
  onPlay?: (() => void) | undefined
}

export function Library({ lyricsIds, onPlay }: LibraryProps) {
  const state = usePlayer()
  const [query, setQuery] = useState("")
  const [albumFilter, setAlbumFilter] = useState<string | null>(null)

  const albums = useMemo(() => {
    const map = new Map<string, { name: string; year?: number; artwork: string; tracks: Track[] }>()
    for (const track of DEMO_TRACKS) {
      const existing = map.get(track.album)
      if (existing) existing.tracks.push(track)
      else
        map.set(track.album, {
          name: track.album,
          ...(track.year !== undefined ? { year: track.year } : {}),
          artwork: track.artwork,
          tracks: [track],
        })
    }
    return [...map.values()].sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
  }, [])

  const visibleTracks = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return DEMO_TRACKS.filter(track => {
      if (albumFilter && track.album !== albumFilter) return false
      if (!needle) return true
      return (
        track.title.toLowerCase().includes(needle) ||
        track.album.toLowerCase().includes(needle) ||
        track.artist.toLowerCase().includes(needle)
      )
    })
  }, [query, albumFilter])

  const current = state.queue[state.index] ?? null

  return (
    <div className="flex flex-col gap-7">
      <header className="flex items-start justify-between gap-4 px-1 pt-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-ink/35">Vitrail</p>
          <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">
            {current ? "Reprendre l'écoute" : "Ta musique"}
          </h1>
          <p className="mt-2 text-sm text-ink/45">
            Démo locale · {DEMO_TRACKS.length} morceaux de {DEMO_ATTRIBUTION.artist} sous licence{" "}
            <a
              href={DEMO_ATTRIBUTION.licenseUrl}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-ink/25 underline-offset-2 hover:text-ink/70"
            >
              {DEMO_ATTRIBUTION.license}
            </a>
          </p>
        </div>
        <ThemeToggle />
      </header>

      {current ? <ResumeCard lyricsIds={lyricsIds} /> : null}

      <LocalLibrary onPlay={onPlay} />

      <CatalogSearch onPlay={onPlay} />

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="font-display text-xl">Albums</h2>
          {albumFilter ? (
            <button
              type="button"
              onClick={() => setAlbumFilter(null)}
              className="text-xs text-ink/50 underline decoration-white/20 underline-offset-2"
            >
              tout afficher
            </button>
          ) : null}
        </div>
        <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-1">
          {albums.map(album => (
            <button
              key={album.name}
              type="button"
              onClick={() => {
                setAlbumFilter(album.name)
                player.playQueue(album.tracks, 0, album.name)
                onPlay?.()
              }}
              className="glass-press w-36 shrink-0 text-left"
            >
              <Artwork
                src={album.artwork}
                alt={`Pochette de ${album.name}`}
                size="none"
                rounded="2xl"
                className="aspect-square w-36 shadow-[0_20px_50px_-24px_rgba(0,0,0,0.9)]"
              />
              <p className="mt-2 truncate font-display text-sm">{album.name}</p>
              <p className="truncate text-xs text-ink/40">
                {album.year} · {album.tracks.length} morceaux
              </p>
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 px-1">
          <h2 className="font-display text-xl">
            {albumFilter ?? "Tous les morceaux"}
            <span className="ml-2 text-sm font-normal text-ink/35">{visibleTracks.length}</span>
          </h2>
        </div>

        <label className="glass glass-sheen flex items-center gap-2 rounded-2xl px-3 py-2">
          <Search className="h-4 w-4 text-ink/40" />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Chercher un morceau, un album…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-ink/30"
            type="search"
          />
        </label>

        <ul className="glass glass-sheen overflow-hidden rounded-3xl">
          {visibleTracks.map((track, index) => {
            const isCurrent = track.id === current?.id
            const hasLyrics = lyricsIds?.has(track.id) ?? false
            return (
              <li key={track.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (isCurrent) {
                      player.toggle()
                      return
                    }
                    player.playTrack(track, albumFilter ? visibleTracks : DEMO_TRACKS)
                    onPlay?.()
                  }}
                  className={clsx(
                    "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                    isCurrent ? "bg-surface-strong" : "hover:bg-surface",
                  )}
                >
                  <span className="w-6 shrink-0 text-center text-xs tabular-nums text-ink/30">
                    {isCurrent && state.playing ? (
                      <Pause className="mx-auto h-3.5 w-3.5 fill-white text-ink" />
                    ) : isCurrent ? (
                      <Play className="mx-auto h-3.5 w-3.5 fill-white text-ink" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={clsx("truncate text-sm", isCurrent ? "text-ink" : "text-ink/85")}>
                      {track.title}
                    </p>
                    <p className="truncate text-xs text-ink/40">
                      {albumFilter ? track.album : `${track.artist} · ${track.album}`}
                    </p>
                  </div>
                  {hasLyrics ? (
                    <span className="glass flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] text-ink/60">
                      <Mic2 className="h-3 w-3" />
                      paroles
                    </span>
                  ) : null}
                  <span className="shrink-0 text-xs tabular-nums text-ink/35">
                    {formatTime(track.durationSec ?? 0)}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink/20" />
                </button>
              </li>
            )
          })}
          {visibleTracks.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-ink/40">Aucun morceau trouvé</li>
          ) : null}
        </ul>
      </section>
    </div>
  )
}

function ResumeCard({ lyricsIds }: LibraryProps) {
  const state = usePlayer()
  const track = state.queue[state.index]
  if (!track) return null

  return (
    <button
      type="button"
      onClick={() => player.toggle()}
      className="glass-press glass glass-sheen flex items-center gap-4 rounded-3xl p-3 text-left"
    >
      <Artwork src={track.artwork} alt="" size="none" rounded="2xl" className="h-20 w-20" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-[0.18em] text-ink/40">En cours</p>
        <p className="truncate font-display text-lg">{track.title}</p>
        <p className="truncate text-sm text-ink/45">
          {track.artist} · {track.album}
          {lyricsIds?.has(track.id) ? " · paroles" : ""}
        </p>
      </div>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink text-canvas">
        {state.playing ? (
          <Pause className="h-5 w-5 fill-canvas" />
        ) : (
          <Play className="h-5 w-5 translate-x-[1px] fill-canvas" />
        )}
      </span>
    </button>
  )
}
