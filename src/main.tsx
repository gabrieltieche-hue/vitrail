import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "@/App"
import { applyTheme, storedTheme } from "@/lib/theme"
import "@/styles.css"

// Le thème est posé avant le premier rendu : pas de flash blanc au démarrage.
applyTheme(storedTheme())

const root = document.getElementById("root")
if (!root) throw new Error("Racine introuvable")

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// PWA : coquille applicative disponible hors connexion.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined)
  })
}
