/**
 * InfraFlow — Service Worker pentru PWA Șofer (/sofer)
 * Suport offline: cache app shell + coadă operații
 */

const CACHE_NAME = 'infraflow-sofer-v1'
const SHELL_URLS = [
  '/sofer',
  '/sofer/',
]

// Install: cache shell
self.addEventListener('install', event => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Try to cache the shell; ignore failures (offline install)
      return Promise.allSettled(SHELL_URLS.map(url => cache.add(url).catch(() => null)))
    })
  )
})

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

// Fetch: network-first for /api, cache-first for shell
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)

  // API calls: network only (offline queue handled by app)
  if (url.pathname.startsWith('/api/')) return

  // Navigation requests: serve cached shell or network
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
          return response
        })
        .catch(() => caches.match('/sofer') || caches.match('/'))
    )
    return
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') return response
        const clone = response.clone()
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
        return response
      }).catch(() => cached)
    })
  )
})

// Background sync (if supported)
self.addEventListener('sync', event => {
  if (event.tag === 'sofer-sync') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SYNC_REQUESTED' }))
      })
    )
  }
})

self.addEventListener('push', event => {
  let data
  try { data = event.data ? event.data.json() : {} } catch { data = { body: 'Notificare nouă' } }
  event.waitUntil(self.registration.showNotification(data.title || 'InfraFlow', { body: data.body || '', icon: data.icon || '/favicon.svg', data: { url: data.url || '/sofer' } }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(self.clients.openWindow(event.notification.data?.url || '/sofer'))
})
