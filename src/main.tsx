import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "@/App"
import "@/styles.css"

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
