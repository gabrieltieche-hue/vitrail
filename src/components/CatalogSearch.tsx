import { useEffect, useRef, useState } from "react"
import { Download, Loader2, Play, Search as SearchIcon, Sparkles } from "lucide-react"
import { clsx } from "clsx"
import { player, usePlayer } from "@/audio/player"
import { Artwork } from "@/components/Artwork"
import {
  listJobs,
  requestDownload,
  resultToTrack,
  searchCatalog,
  searchYoutube,
  type CatalogResult,
  type DownloadJob,
} from "@/lib/catalog"
import { formatTime } from "@/lib/format"

type SearchProps = {
  onPlay?: (() => void) | undefined
}

export function CatalogSearch({ onPlay }: SearchProps) {
  const state = usePlayer()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<CatalogResult[]>([])
  const [youtube, setYoutube] = useState<CatalogResult[]>([])
  const [searching, setSearching] = useState(false)
  const [youtubeLoading, setYoutubeLoading] = useState(false)
  const [jobs, setJobs] = useState<DownloadJob[]>([])
  const timer = useRef<number | null>(null)

  // Recherche locale, avec un léger délai pour ne pas taper à chaque lettre.
  useEffect(() => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    const clean = query.trim()
    if (clean.length < 2) {
      setResults([])
      setYoutube([])
      return
    }
    setSearching(true)
    timer.current = window.setTimeout(async () => {
      const found = await searchCatalog(clean)
      setResults(found)
      setSearching(false)
    }, 160)
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [query])

  // Suivi des téléchargements en cours.
  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      const list = await listJobs()
      if (!cancelled) setJobs(list)
    }
    void tick()
    const timerId = window.setInterval(tick, 2500)
    return () => {
      cancelled = true
      window.clearInterval(timerId)
    }
  }, [])

  const runYoutubeSearch = async () => {
    const clean = query.trim()
    if (clean.length < 3) return
    setYoutubeLoading(true)
    const found = await searchYoutube(clean)
    setYoutube(found)
    setYoutubeLoading(false)
  }

  const play = (result: CatalogResult) => {
    const track = resultToTrack(result)
    if (!track) return
    player.playTrack(track, [track])
    onPlay?.()
  }

  const download = async (result: CatalogResult) => {
    await requestDownload(result)
    const list = await listJobs()
    setJobs(list)
  }

  const jobFor = (id: string) => jobs.find(job => job.id === id)
  const hasResults = results.length > 0 || youtube.length > 0
  const current = state.queue[state.index] ?? null

  return (
    <section className="flex flex-col gap-3">
      <label className="glass glass-sheen flex items-center gap-2.5 rounded-2xl px-4 py-3">
        <SearchIcon className="h-4 w-4 shrink-0 text-ink/40" />
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Chercher un morceau, un artiste…"
          type="search"
          autoComplete="off"
          className="w-full bg-transparent text-base outline-none placeholder:text-ink/30"
        />
        {searching ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ink/40" /> : null}
      </label>

      {query.trim().length >= 2 ? (
        <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-ink/45">
          <span>
            {results.length > 0
              ? `${results.length} résultat${results.length > 1 ? "s" : ""} dans ta bibliothèque`
              : "Rien dans ta bibliothèque"}
          </span>
          {youtube.length > 0 ? (
            <span className="text-ink/30">· {youtube.length} trouvés en ligne</span>
          ) : null}
          {youtube.length === 0 ? (
            <button
              type="button"
              onClick={() => void runYoutubeSearch()}
              disabled={youtubeLoading}
              className="glass glass-press flex items-center gap-1.5 rounded-full px-3 py-1 text-ink/70 disabled:opacity-50"
            >
              {youtubeLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              {youtubeLoading ? "Recherche en ligne…" : "Chercher aussi en ligne"}
            </button>
          ) : null}
        </div>
      ) : null}

      {hasResults ? (
        <ul className="glass glass-sheen overflow-hidden rounded-3xl">
          {[...results, ...youtube].map(result => {
            const isCurrent = current?.id === result.id
            const job = jobFor(result.id)
            const busy = job?.status === "queued" || job?.status === "running"
            return (
              <li
                key={`${result.source}-${result.id}`}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2.5 transition-colors",
                  isCurrent ? "bg-surface-strong" : "hover:bg-surface",
                )}
              >
                <button
                  type="button"
                  onClick={() => (result.available ? play(result) : void download(result))}
                  disabled={!result.available && busy}
                  className="group relative flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <div className="relative">
                    <Artwork src={result.artwork} alt="" size="sm" rounded="md" />
                    <span
                      className={clsx(
                        "absolute inset-0 flex items-center justify-center rounded-lg",
                        result.available
                          ? "bg-black/0 opacity-0 transition-opacity group-hover:bg-black/45 group-hover:opacity-100"
                          : busy
                            ? "bg-black/45 opacity-100"
                            : "bg-black/45 opacity-100",
                      )}
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin text-white" />
                      ) : result.available ? (
                        <Play className="h-4 w-4 fill-white text-white" />
                      ) : (
                        <Download className="h-4 w-4 text-white" />
                      )}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink/90">{result.title}</p>
                    <p className="truncate text-xs text-ink/40">
                      {result.artist || "Artiste inconnu"}
                      {result.rank ? ` · n°${result.rank}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-ink/30">
                    {result.durationSec ? formatTime(result.durationSec) : ""}
                  </span>
                </button>
                {!result.available ? (
                  <button
                    type="button"
                    onClick={() => void download(result)}
                    disabled={busy}
                    className="glass glass-press flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[11px] text-ink/70 disabled:opacity-50"
                  >
                    {busy ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {job?.status === "running" ? "Téléchargement" : "En file"}
                      </>
                    ) : job?.status === "done" ? (
                      "Téléchargé"
                    ) : job?.status === "failed" ? (
                      "Échec"
                    ) : (
                      <>
                        <Download className="h-3 w-3" />
                        Télécharger
                      </>
                    )}
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}

      {query.trim().length >= 2 && !hasResults && !searching ? (
        <p className="px-1 text-sm text-ink/40">
          Aucun résultat. Lance la recherche en ligne pour aller chercher le morceau.
        </p>
      ) : null}
    </section>
  )
}
