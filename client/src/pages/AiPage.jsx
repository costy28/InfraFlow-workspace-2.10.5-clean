import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import api from '../api/client'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'

function dateTime(value) {
  if (!value) return ''
  return String(value).replace('T', ' ').slice(0, 16)
}

function normalizeMessages(messages = []) {
  return messages.map(message => ({
    id: message.id || `${message.rol}-${message.created_at}`,
    role: message.rol || message.role,
    content: message.continut || message.content || '',
    created_at: message.created_at,
  }))
}

export default function AiPage() {
  const [status, setStatus] = useState({ loading: true, enabled: false })
  const [conversations, setConversations] = useState([])
  const [activeConversation, setActiveConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef(null)
  const messageCounterRef = useRef(0)

  const activeTitle = useMemo(() => {
    if (activeConversation?.titlu) return activeConversation.titlu
    if (messages.length > 0) return messages[0].content.slice(0, 80)
    return 'Conversație nouă'
  }, [activeConversation, messages])

  const loadConversations = useCallback(async () => {
    const res = await api.get('/ai/conversations')
    setConversations(Array.isArray(res.data?.conversations) ? res.data.conversations : [])
  }, [])

  const loadSuggestions = useCallback(async () => {
    const res = await api.get('/ai/suggestions', { params: { pagina: 'dashboard' } })
    setSuggestions(Array.isArray(res.data?.sugestii) ? res.data.sugestii.slice(0, 4) : [])
  }, [])

  const loadStatus = useCallback(async () => {
    setStatus({ loading: true, enabled: false })
    setError('')
    try {
      const res = await api.get('/admin/ai/status')
      const enabled = Boolean(res.data?.enabled)
      setStatus({ loading: false, enabled, info: res.data })
      if (enabled) {
        await Promise.all([loadConversations(), loadSuggestions()])
      }
    } catch (err) {
      if (err.response?.status === 402 || err.response?.data?.cod === 'AI_NOT_ENABLED') {
        setStatus({ loading: false, enabled: false })
      } else {
        setStatus({ loading: false, enabled: false })
        setError(err.response?.data?.error || 'Nu am putut verifica statusul modulului AI.')
      }
    }
  }, [loadConversations, loadSuggestions])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStatus()
  }, [loadStatus])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function openConversation(conversation) {
    setError('')
    setActiveConversation(conversation)
    try {
      const res = await api.get(`/ai/conversations/${conversation.uuid}`)
      const data = res.data?.conversation || {}
      setActiveConversation(data)
      setMessages(normalizeMessages(data.messages))
    } catch (err) {
      setError(err.response?.data?.error || 'Conversația nu a putut fi încărcată.')
    }
  }

  function newConversation() {
    setActiveConversation(null)
    setMessages([])
    setInput('')
    setError('')
  }

  async function sendMessage(text = input) {
    const message = String(text || '').trim()
    if (!message || loading) return

    messageCounterRef.current += 1
    const tempId = `local-${messageCounterRef.current}`
    setInput('')
    setError('')
    setLoading(true)
    setMessages(prev => [...prev, {
      id: tempId,
      role: 'user',
      content: message,
      created_at: new Date().toISOString(),
    }])

    try {
      const res = await api.post('/ai/chat', {
        mesaj: message,
        conversatie_id: activeConversation?.uuid,
      })
      const conversationId = res.data?.conversatie_id
      setMessages(prev => [...prev, {
        id: `ai-${messageCounterRef.current}`,
        role: 'assistant',
        content: res.data?.raspuns || '',
        created_at: new Date().toISOString(),
      }])
      if (Array.isArray(res.data?.sugestii)) setSuggestions(res.data.sugestii.slice(0, 4))
      if (conversationId) {
        setActiveConversation(prev => prev || { uuid: conversationId, titlu: message })
      }
      await loadConversations()
    } catch (err) {
      setError(err.response?.data?.error || 'AI nu a putut procesa mesajul.')
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendMessage()
    }
  }

  if (status.loading) {
    return (
      <Card title="AI Assistant" loading>
        <div />
      </Card>
    )
  }

  if (!status.enabled) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card title="AI Assistant" subtitle="Modul opțional cu activare separată.">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-center gap-2">
              <Badge variant="yellow">INACTIV</Badge>
              <h2 className="text-lg font-semibold text-slate-900">Modulul AI nu este activat</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-700">
              Modulul AI nu este activat. Contactează administratorul pentru configurarea cheii API și activarea permisiunilor.
            </p>
            {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="grid min-h-[calc(100vh-7rem)] gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <Card
        title="Conversații"
        subtitle={`${conversations.length} conversații recente`}
        actions={<Button size="sm" onClick={newConversation}>Nouă</Button>}
        className="min-h-0"
      >
        <div className="grid max-h-[calc(100vh-13rem)] gap-2 overflow-y-auto pr-1">
          {conversations.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">
              Nu există conversații salvate.
            </div>
          ) : conversations.map(conversation => (
            <button
              key={conversation.uuid}
              type="button"
              className={`rounded-md border p-3 text-left transition ${
                activeConversation?.uuid === conversation.uuid
                  ? 'border-primary-200 bg-primary-50'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
              onClick={() => openConversation(conversation)}
            >
              <div className="line-clamp-2 text-sm font-semibold text-slate-900">{conversation.titlu || 'Conversație AI'}</div>
              <div className="mt-1 text-xs text-slate-500">{dateTime(conversation.updated_at || conversation.created_at)}</div>
            </button>
          ))}
        </div>
      </Card>

      <Card
        title={activeTitle}
        subtitle={`Model: ${status.info?.model || 'claude-haiku-4-5'}`}
        actions={<Button size="sm" variant="secondary" onClick={newConversation}>Conversație nouă</Button>}
        className="flex min-h-0 flex-col"
      >
        {error ? <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

        <div className="min-h-[22rem] flex-1 space-y-3 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-4">
          {messages.length === 0 ? (
            <div className="grid h-full min-h-[18rem] place-items-center text-center">
              <div>
                <div className="text-lg font-semibold text-slate-900">Întreabă InfraFlow AI</div>
                <p className="mt-2 text-sm text-slate-500">Poți cere date, explicații sau pași de lucru din aplicație.</p>
              </div>
            </div>
          ) : messages.map(message => {
            const isUser = message.role === 'user'
            return (
              <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[78%] rounded-lg px-4 py-3 text-sm shadow-sm ${
                  isUser ? 'bg-primary-600 text-white' : 'bg-white text-slate-800'
                }`}>
                  <div className="whitespace-pre-wrap leading-6">{message.content}</div>
                  <div className={`mt-2 text-[11px] ${isUser ? 'text-primary-50' : 'text-slate-400'}`}>{dateTime(message.created_at)}</div>
                </div>
              </div>
            )
          })}
          {loading ? (
            <div className="flex justify-start">
              <div className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
                AI procesează...
              </div>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>

        {suggestions.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {suggestions.map(suggestion => (
              <Button
                key={suggestion}
                size="sm"
                variant="secondary"
                disabled={loading}
                onClick={() => sendMessage(suggestion)}
              >
                {suggestion}
              </Button>
            ))}
          </div>
        ) : null}

        <div className="mt-4 flex gap-3">
          <textarea
            className="min-h-12 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            placeholder="Scrie mesajul aici..."
            value={input}
            onChange={event => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <Button className="self-end" loading={loading} disabled={!input.trim()} onClick={() => sendMessage()}>
            Trimite
          </Button>
        </div>
      </Card>
    </div>
  )
}
