import { useEffect, useState } from "react"

const STORAGE_KEY = "vitrail_theme_v1"

export type Theme = "light" | "dark"

function systemTheme(): Theme {
  try {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"
  } catch {
    return "dark"
  }
}

export function storedTheme(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === "light" || raw === "dark") return raw
  } catch {
    /* ignore */
  }
  return systemTheme()
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  root.classList.toggle("light", theme === "light")
  root.classList.toggle("dark", theme === "dark")
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute("content", theme === "light" ? "#f2f2f7" : "#08080c")
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>("dark")

  useEffect(() => {
    const initial = storedTheme()
    setTheme(initial)
    applyTheme(initial)
  }, [])

  const toggle = () => {
    setTheme(current => {
      const next: Theme = current === "light" ? "dark" : "light"
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        /* ignore */
      }
      applyTheme(next)
      return next
    })
  }

  return [theme, toggle]
}
