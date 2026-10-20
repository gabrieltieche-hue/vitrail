/** "3:07" — format court pour les durées de morceaux. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

/** "1 h 04" — format long pour les capsules d'écoute. */
export function formatLongDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0 min"
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.round((total % 3600) / 60)
  if (h === 0) return `${m} min`
  return `${h} h ${m.toString().padStart(2, "0")}`
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })
}
