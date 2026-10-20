import { useEffect, useMemo, useState } from "react"
import { Clock, Disc3, Music2, Sparkles, Users } from "lucide-react"
import { clsx } from "clsx"
import { getHistory, summarise } from "@/lib/history"
import { getFamilyStats, type FamilyStats } from "@/lib/family"
import { formatLongDuration } from "@/lib/format"
import { Artwork } from "@/components/Artwork"

export function Capsules() {
  const [version, setVersion] = useState(0)
  const [family, setFamily] = useState<FamilyStats | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setVersion(v => v + 1), 5000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    void getFamilyStats().then(stats => {
      if (!cancelled) setFamily(stats)
    })
    return () => {
      cancelled = true
    }
  }, [version])

  const summary = useMemo(() => summarise(getHistory()), [version])
  const week = useMemo(() => lastDays(summary.days, 7), [summary])

  if (summary.playCount === 0) {
    return (
      <div className="glass glass-sheen flex flex-col items-center gap-3 rounded-3xl px-6 py-12 text-center">
        <Sparkles className="h-8 w-8 text-ink/35" />
        <p className="font-display text-xl text-ink/75">Les capsules se remplissent en écoutant</p>
        <p className="max-w-sm text-sm leading-relaxed text-ink/40">
          Chaque écoute est comptée sur cet appareil. Dans quelques minutes ici, tu verras tes artistes, tes
          morceaux et ta rétropective.
        </p>
      </div>
    )
  }

  const maxDay = Math.max(1, ...week.map(day => day.seconds))

  return (
    <div className="flex flex-col gap-6">
      <section className="glass glass-sheen relative overflow-hidden rounded-3xl p-5">
        <div className="absolute -right-8 -top-10 h-40 w-40 rounded-full bg-surface-strong blur-3xl" />
        <p className="text-[11px] uppercase tracking-[0.28em] text-ink/40">Depuis toujours</p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <span className="font-display text-5xl font-semibold tracking-tight">
            {formatLongDuration(summary.totalSeconds)}
          </span>
          <span className="text-sm text-ink/45">
            d&apos;écoute · {summary.playCount} écoutes · {summary.uniqueTracks} morceaux
          </span>
        </div>

        {family && family.playCount > 0 ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-ink/50">
            <Users className="h-4 w-4" />
            La famille cumule {formatLongDuration(family.totalSeconds)} d&apos;écoute
          </p>
        ) : null}
      </section>

      <section className="glass glass-sheen rounded-3xl p-5">
        <h2 className="flex items-center gap-2 font-display text-lg">
          <Clock className="h-4 w-4 text-ink/50" />
          Les sept derniers jours
        </h2>
        <div className="mt-4 flex h-28 items-stretch gap-2">
          {week.map(day => (
            <div key={day.day} className="flex h-full flex-1 flex-col items-center gap-2">
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t-lg bg-ink/70 transition-all duration-500"
                  style={{ height: `${Math.max(3, (day.seconds / maxDay) * 100)}%` }}
                  title={formatLongDuration(day.seconds)}
                />
              </div>
              <span className="text-[10px] text-ink/35">{day.label}</span>
            </div>
          ))}
        </div>
      </section>

      {summary.topTracks.length > 0 ? (
        <section>
          <h2 className="mb-3 flex items-center gap-2 px-1 font-display text-xl">
            <Music2 className="h-4 w-4 text-ink/50" />
            Tes morceaux
          </h2>
          <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-1">
            {summary.topTracks.map((track, index) => (
              <div key={track.key} className="w-36 shrink-0">
                <div className="relative">
                  <Artwork src={track.artwork} alt="" size="none" rounded="2xl" className="aspect-square w-36" />
                  <span className="absolute left-2 top-2 font-display text-2xl font-bold text-ink/80 drop-shadow-lg">
                    {index + 1}
                  </span>
                </div>
                <p className="mt-2 truncate text-sm font-medium">{track.title}</p>
                <p className="truncate text-xs text-ink/40">{track.artist}</p>
                <p className="truncate text-[11px] text-ink/25">
                  {track.count} écoute{track.count > 1 ? "s" : ""}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {summary.topArtists.length > 0 ? (
        <section className="glass glass-sheen rounded-3xl p-5">
          <h2 className="flex items-center gap-2 font-display text-lg">
            <Disc3 className="h-4 w-4 text-ink/50" />
            Tes artistes
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {summary.topArtists.slice(0, 6).map((artist, index) => (
              <li key={artist.key} className="flex items-center gap-3">
                <span className="w-5 text-right text-sm tabular-nums text-ink/30">{index + 1}</span>
                <span className="flex-1 truncate text-sm">{artist.key}</span>
                <span className="text-xs text-ink/35">{artist.count}×</span>
                <span className="w-16 text-right text-xs tabular-nums text-ink/25">
                  {formatLongDuration(artist.seconds)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {summary.topAlbums.length > 0 ? (
        <section className="glass glass-sheen rounded-3xl p-5">
          <h2 className="flex items-center gap-2 font-display text-lg">
            <Disc3 className="h-4 w-4 text-ink/50" />
            Tes albums
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {summary.topAlbums.slice(0, 6).map(album => (
              <li key={album.key} className="flex items-center gap-3">
                <span className="flex-1 truncate text-sm">{album.key}</span>
                <span className="text-xs text-ink/35">{album.count}×</span>
                <span className="w-16 text-right text-xs tabular-nums text-ink/25">
                  {formatLongDuration(album.seconds)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {summary.recent.length > 0 ? (
        <section className="glass glass-sheen rounded-3xl p-5">
          <h2 className="font-display text-lg">Écouté à l&apos;instant</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {summary.recent.slice(0, 8).map((event, index) => (
              <li key={`${event.id}-${event.at}-${index}`} className="flex items-center gap-3">
                <Artwork src={event.artwork} alt="" size="sm" rounded="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{event.title}</p>
                  <p className="truncate text-xs text-ink/40">{event.artist}</p>
                </div>
                <span className="shrink-0 text-xs text-ink/30">
                  {new Date(event.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

function lastDays(days: { day: string; seconds: number }[], count: number) {
  const labels = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."]
  const today = new Date()
  const result: { day: string; label: string; seconds: number }[] = []
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(today)
    date.setDate(today.getDate() - i)
    const key = date.toISOString().slice(0, 10)
    const found = days.find(entry => entry.day === key)
    result.push({ day: key, label: labels[date.getDay()] ?? "", seconds: found?.seconds ?? 0 })
  }
  return result
}

export { clsx }
