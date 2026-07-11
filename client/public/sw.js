/**
 * InfraFlow Service Worker — notificări push
 * Gestionează notificările primite prin Push API
 * și click-uri pe notificări.
 */

const APP_NAME = 'InfraFlow'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})

// Push event — sosit de la server (dacă este configurat VAPID)
self.addEventListener('push', event => {
  let data
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: APP_NAME, body: event.data?.text() || 'Notificare nouă' }
  }

  const title = data.title || APP_NAME
  const options = {
    body: data.body || '',
    icon: data.icon || '/favicon.svg',
    badge: data.badge || '/favicon.svg',
    tag: data.tag || 'infraflow-notification',
    data: { url: data.url || '/', ...data.data },
    requireInteraction: data.requireInteraction || false,
    silent: data.silent || false,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// Click pe notificare — deschide tab sau focusează fereastra existentă
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        const clientUrl = new URL(client.url)
        if (clientUrl.origin === self.location.origin) {
          client.focus()
          if (targetUrl !== '/') client.navigate(targetUrl)
          return
        }
      }
      return self.clients.openWindow(targetUrl)
    })
  )
})
