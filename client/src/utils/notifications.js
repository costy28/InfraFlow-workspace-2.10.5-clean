/**
 * InfraFlow — utilitar notificări browser
 *
 * Flux:
 * 1. registerSW()          → înregistrează Service Worker la pornire
 * 2. requestPermission()   → cere permisiunea utilizatorului
 * 3. notify(opts)          → afișează notificație locală
 *
 * Notificările locale nu necesită server VAPID — funcționează
 * prin triggerare directă din SSE (mesaje noi) sau polling.
 */

let _swRegistration = null

export async function registerSW() {
  if (!('serviceWorker' in navigator)) return null
  try {
    _swRegistration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    return _swRegistration
  } catch (err) {
    console.warn('[SW] Înregistrare eșuată:', err.message)
    return null
  }
}

export function notificationsSupported() {
  return 'Notification' in window && 'serviceWorker' in navigator
}

export function permissionGranted() {
  return Notification.permission === 'granted'
}

export async function requestPermission() {
  if (!notificationsSupported()) return false
  if (permissionGranted()) return true
  const result = await Notification.requestPermission()
  return result === 'granted'
}

/**
 * Afișează o notificație browser.
 * @param {Object} opts
 * @param {string} opts.title
 * @param {string} [opts.body]
 * @param {string} [opts.url]   – URL deschis la click
 * @param {string} [opts.tag]   – grupează notificările de același tip
 * @param {boolean} [opts.requireInteraction]
 */
export async function notify({ title, body = '', url = '/', tag = 'infraflow', requireInteraction = false }) {
  if (!notificationsSupported() || !permissionGranted()) return

  const reg = _swRegistration || (await navigator.serviceWorker.ready.catch(() => null))
  if (reg?.showNotification) {
    await reg.showNotification(title, {
      body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag,
      data: { url },
      requireInteraction,
      silent: false,
    })
  } else {
    // Fallback fără SW
    new Notification(title, { body, icon: '/favicon.svg', tag })
  }
}

// ─── Helpers specifice InfraFlow ──────────────────────────────────────────────

export function notifyMessage({ sender, preview, channelName }) {
  notify({
    title: `💬 Mesaj nou${channelName ? ` în #${channelName}` : ''}`,
    body: `${sender ? sender + ': ' : ''}${preview || 'Mesaj nou'}`,
    url: '/mesaje',
    tag: 'infraflow-message',
  })
}

export function notifyTicket({ title, priority }) {
  const urgent = ['critica', 'urgent', 'urgenta'].includes(String(priority || '').toLowerCase())
  notify({
    title: urgent ? '🚨 Sesizare urgentă!' : '🎫 Sesizare nouă',
    body: title || 'A apărut o sesizare nouă',
    url: '/sesizari',
    tag: 'infraflow-ticket',
    requireInteraction: urgent,
  })
}

export function notifyDocument({ subject, action }) {
  notify({
    title: '📄 Document de aprobat',
    body: subject || action || 'Document nou în circuit',
    url: '/documente',
    tag: 'infraflow-document',
  })
}

export function notifyTask({ title, urgent }) {
  notify({
    title: urgent ? '✅ Task urgent' : '✅ Task nou',
    body: title || 'Ai un task de rezolvat',
    url: '/taskuri',
    tag: 'infraflow-task',
    requireInteraction: Boolean(urgent),
  })
}
