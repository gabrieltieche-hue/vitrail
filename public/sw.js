/* Vitrail — service worker minimal : coquille applicative en cache. */
const CACHE = "vitrail-v1"
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg"]

self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => undefined),
  )
})

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", event => {
  const request = event.request
  if (request.method !== "GET") return

  const url = new URL(request.url)

  // L'audio et les paroles vont toujours au réseau : un cache audio périmé
  // donnerait un son faux. On ne les met pas en cache.
  if (url.pathname.includes("/audio") || url.hostname.includes("lrclib.net")) return
  if (url.hostname.includes("archive.org")) return

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok && url.origin === self.location.origin) {
          const copy = response.clone()
          caches.open(CACHE).then(cache => cache.put(request, copy))
        }
        return response
      })
      .catch(() =>
        caches.match(request).then(cached => {
          if (cached) return cached
          if (request.mode === "navigate") return caches.match("/index.html")
          return Response.error()
        }),
      ),
  )
})
