import { Moon, Sun } from "lucide-react"
import { useTheme } from "@/lib/theme"

export function ThemeToggle() {
  const [theme, toggle] = useTheme()

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "light" ? "Passer en thème sombre" : "Passer en thème clair"}
      title={theme === "light" ? "Thème sombre" : "Thème clair"}
      className="glass glass-press flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink/70 transition-colors hover:text-ink"
    >
      {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </button>
  )
}
