self.addEventListener('install', () => {
  // Registration-only foundation for a future Web Push implementation.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})
