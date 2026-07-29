import api from '../api/client'

export async function createMessagingEventSource() {
  const response = await api.post('/messaging/stream-ticket')
  const ticket = String(response.data?.ticket || '').trim()
  if (!ticket) throw new Error('Nu am primit tichet pentru notificări live.')
  return new EventSource(`/api/messaging/stream?sse=${encodeURIComponent(ticket)}`)
}
