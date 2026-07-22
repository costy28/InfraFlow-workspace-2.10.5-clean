/**
 * Hook global de notificări — montăm o singură dată în Layout.
 * Ascultă SSE de mesaje și polling de sesizări/documente.
 */
import { useEffect, useRef } from 'react'
import { notifyDocument, notifyMessage, notifyTask, notifyTicket, permissionGranted } from '../utils/notifications'
import { useAuth } from './useAuth'
import api from '../api/client'

const POLL_INTERVAL_MS = 60_000 // 1 minut

export function useGlobalNotifications() {
  const { user } = useAuth()
  const lastTicketCount = useRef(null)
  const lastDocCount = useRef(null)
  const lastTaskCount = useRef(null)

  // ─── SSE mesaje ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    const token = localStorage.getItem('infraflow_token')
    if (!token) return
    const source = new EventSource(`/api/messaging/stream?token=${encodeURIComponent(token)}`)

    source.addEventListener('message', event => {
      try {
        const payload = JSON.parse(event.data)
        const msg = payload?.message
        // Notifică doar dacă fereastra nu e activă și mesajul nu e al meu
        if (document.hidden && msg && String(msg.sender_id) !== String(user.id)) {
          notifyMessage({
            sender: msg.sender_id,
            preview: msg.continut?.slice(0, 80),
            channelName: payload.channel?.nume || payload.channel?.name,
          })
        }
      } catch { /* ignore */ }
    })

    source.onerror = () => {}
    return () => source.close()
  }, [user])

  // ─── Polling sesizări + documente ────────────────────────────────────────────
  useEffect(() => {
    if (!user || !permissionGranted()) return

    async function poll() {
      try {
        // Sesizări urgente noi
        const ticketRes = await api.get('/tickets/my-open').catch(() => null)
        if (ticketRes) {
          const tickets = Array.isArray(ticketRes.data)
            ? ticketRes.data
            : (ticketRes.data?.tickets || ticketRes.data?.items || [])
          const urgentCount = tickets.filter(t =>
            ['critica', 'urgent', 'urgenta'].includes(String(t.prioritate || t.priority || '').toLowerCase())
          ).length

          if (lastTicketCount.current !== null && urgentCount > lastTicketCount.current) {
            notifyTicket({ title: `${urgentCount} sesizări urgente deschise`, priority: 'critica' })
          }
          lastTicketCount.current = urgentCount
        }

        // Documente în inbox
        const docRes = await api.get('/documents/inbox').catch(() => null)
        if (docRes) {
          const docs = Array.isArray(docRes.data)
            ? docRes.data
            : (docRes.data?.documents || docRes.data?.items || [])

          if (lastDocCount.current !== null && docs.length > lastDocCount.current) {
            notifyDocument({ subject: `${docs.length} documente de aprobat` })
          }
          lastDocCount.current = docs.length
        }

        // Task-uri personale deschise
        const taskRes = await api.get('/tasks/my-open').catch(() => null)
        if (taskRes) {
          const tasks = Array.isArray(taskRes.data)
            ? taskRes.data
            : (taskRes.data?.tasks || taskRes.data?.items || [])
          const urgentTask = tasks.find(task => ['urgent', 'high'].includes(String(task.priority || '').toLowerCase()))

          if (lastTaskCount.current !== null && tasks.length > lastTaskCount.current) {
            notifyTask({ title: urgentTask?.title || `${tasks.length} task-uri deschise`, urgent: Boolean(urgentTask) })
          }
          lastTaskCount.current = tasks.length
        }
      } catch { /* ignore */ }
    }

    poll()
    const id = setInterval(poll, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [user])
}
