import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "@/App"
import { applyTheme, storedTheme } from "@/lib/theme"
import "@/styles.css"

applyTheme(storedTheme())

const root = document.getElementById("root")
if (!root) throw new Error("Racine introuvable")

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined)
  })
}
