import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Hash, Info, Mail, Paperclip, Plus, Search, Send, Trash2, Users, X } from 'lucide-react'
import api from '../../api/client'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import Modal from '../../components/ui/Modal'
import { formatDate } from '../../utils/format'
import { useAuth } from '../../hooks/useAuth'
import { notifyMessage, permissionGranted, requestPermission } from '../../utils/notifications'

function arrayFrom(data, keys) {
  if (Array.isArray(data)) return data
  for (const key of keys) if (Array.isArray(data?.[key])) return data[key]
  return []
}

function channelName(channel) {
  if (!channel) return 'Canal'
  if (channel.nume) return ['departament', 'public', 'anunturi'].includes(channel.tip) ? `#${channel.nume}` : channel.nume
  if (channel.entitate_tip) return `${channel.entitate_tip} ${channel.entitate_id}`
  return `Canal ${channel.id}`
}

function channelIcon(channel) {
  const tip = typeof channel === 'string' ? channel : channel?.tip
  if (channel?.icon) return channel.icon
  if (tip === 'departament') return '🏢'
  if (tip === 'public') return '🌐'
  if (tip === 'anunturi') return '📢'
  if (tip === 'direct') return '💬'
  if (tip === 'contextual') return '🔗'
  return '#'
}

function channelTypeBadge(tip) {
  if (tip === 'departament') return { label: 'Departament', cls: 'bg-blue-100 text-blue-700' }
  if (tip === 'anunturi')    return { label: 'Anunțuri',   cls: 'bg-amber-100 text-amber-700' }
  if (tip === 'public')      return { label: 'Public',     cls: 'bg-green-100 text-green-700' }
  if (tip === 'direct')      return { label: 'Direct',     cls: 'bg-purple-100 text-purple-700' }
  if (tip === 'contextual')  return { label: 'Contextual', cls: 'bg-slate-100 text-slate-600' }
  return null
}

function userId(user) {
  return user?.id || user?.userId || user?.username
}

function isAdminUser(user) {
  return user?.role === 'superadmin' || user?.role === 'admin'
}

function highlightMentions(text) {
  const parts = String(text || '').split(/(@[\w.-]+)/g)
  return parts.map((part, index) => (
    part.startsWith('@')
      ? <mark key={`${part}-${index}`} className="rounded bg-amber-100 px-1 text-amber-900">{part}</mark>
      : <span key={`${part}-${index}`}>{part}</span>
  ))
}

function messageText(message) {
  if (message.sters_la) return 'Mesaj șters'
  return message.continut || ''
}

const emptyChannelForm = { nume: '', tip: 'departament', descriere: '' }

const emailFilterDefaults = { q: '', category: '', importance: '', status: '', has_attachments: '' }

function importanceBadge(value) {
  if (value === 'urgent') return { label: 'urgent', tone: 'danger', cls: 'bg-rose-100 text-rose-700' }
  if (value === 'high') return { label: 'important', tone: 'warning', cls: 'bg-amber-100 text-amber-700' }
  if (value === 'low') return { label: 'scăzut', tone: 'muted', cls: 'bg-slate-100 text-slate-500' }
  return { label: 'normal', tone: 'default', cls: 'bg-emerald-100 text-emerald-700' }
}

export default function MessagingPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('chat')
  const [channels, setChannels] = useState([])
  const [activeChannel, setActiveChannel] = useState(null)
  const [messages, setMessages] = useState([])
  const [emailRows, setEmailRows] = useState([])
  const [emailCategories, setEmailCategories] = useState([])
  const [emailStats, setEmailStats] = useState({ total: 0, unread: 0, important: 0, with_attachments: 0 })
  const [emailFilters, setEmailFilters] = useState(emailFilterDefaults)
  const [emailLoading, setEmailLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notifGranted, setNotifGranted] = useState(permissionGranted)

  // canal nou
  const [newChannelModal, setNewChannelModal] = useState(false)
  const [channelForm, setChannelForm] = useState(emptyChannelForm)
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState('')

  // info panel
  const [infoOpen, setInfoOpen] = useState(false)
  const [channelMembers, setChannelMembers] = useState([])

  // confirmare ștergere
  const [deleteModal, setDeleteModal] = useState(false)

  const listRef = useRef(null)
  const currentUserId = userId(user)
  const isAdmin = isAdminUser(user)

  // ─── Load canale ─────────────────────────────────────────────────────────────
  const loadChannels = useCallback(async () => {
    setError('')
    try {
      const response = await api.get('/messaging/channels')
      const rows = arrayFrom(response.data, ['channels'])
      setChannels(rows)
      setActiveChannel(current => current ? (rows.find(c => String(c.id) === String(current.id)) || rows[0] || null) : (rows[0] || null))
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut încărca canalele.')
    } finally {
      setLoading(false)
    }
  }, [])

  // ─── Load mesaje ─────────────────────────────────────────────────────────────
  const loadMessages = useCallback(async (channel) => {
    if (!channel?.id) { setMessages([]); return }
    setError('')
    try {
      const response = await api.get(`/messaging/channels/${channel.id}/messages`, { params: { limit: 60 } })
      setMessages(arrayFrom(response.data, ['messages']).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))))
      api.post(`/messaging/channels/${channel.id}/read`).catch(() => {})
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut încărca mesajele.')
    }
  }, [])

  // ─── Load membri canal ────────────────────────────────────────────────────────
  const loadMembers = useCallback(async (channel) => {
    if (!channel?.id) return
    try {
      const response = await api.get(`/messaging/channels/${channel.id}/members`)
      setChannelMembers(arrayFrom(response.data, ['members']))
    } catch {
      setChannelMembers([])
    }
  }, [])

  useEffect(() => { Promise.resolve().then(() => loadChannels()) }, [loadChannels])
  useEffect(() => { Promise.resolve().then(() => loadMessages(activeChannel)) }, [activeChannel, loadMessages])
  useEffect(() => { if (!listRef.current) return; listRef.current.scrollTop = listRef.current.scrollHeight }, [messages])

  const loadEmailInbox = useCallback(async () => {
    setEmailLoading(true)
    setError('')
    try {
      const params = Object.fromEntries(Object.entries(emailFilters).filter(([, value]) => String(value || '').trim()))
      const response = await api.get('/messaging/email/inbox', { params })
      setEmailRows(arrayFrom(response.data, ['emails']))
      setEmailCategories(arrayFrom(response.data, ['categories']))
      setEmailStats(response.data?.stats || { total: 0, unread: 0, important: 0, with_attachments: 0 })
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut încărca Inbox ERP.')
    } finally {
      setEmailLoading(false)
    }
  }, [emailFilters])

  useEffect(() => {
    if (activeTab === 'email') Promise.resolve().then(() => loadEmailInbox())
  }, [activeTab, loadEmailInbox])

  // ─── Info panel ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (infoOpen && activeChannel) loadMembers(activeChannel)
  }, [infoOpen, activeChannel, loadMembers])

  // ─── SSE stream ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('infraflow_token')
    if (!token) return undefined
    const source = new EventSource(`/api/messaging/stream?token=${encodeURIComponent(token)}`)
    source.addEventListener('message', event => {
      try {
        const payload = JSON.parse(event.data)
        if (String(payload?.channel?.id) === String(activeChannel?.id)) {
          setMessages(current => [...current, payload.message])
        }
        loadChannels()
        if (document.hidden && payload?.message && String(payload.message.sender_id) !== String(currentUserId)) {
          notifyMessage({
            sender: payload.message.sender_id,
            preview: payload.message.continut?.slice(0, 80),
            channelName: payload.channel?.nume || payload.channel?.name,
          })
        }
      } catch { loadChannels() }
    })
    source.addEventListener('mention', () => loadChannels())
    source.onerror = () => {}
    return () => source.close()
  }, [activeChannel?.id, currentUserId, loadChannels])

  const activeMessages = useMemo(() => messages.filter(m => !m.sters_la), [messages])

  // ─── Trimitere mesaj ─────────────────────────────────────────────────────────
  async function sendMessage(event) {
    event.preventDefault()
    if (!draft.trim() || !activeChannel?.id) return
    const content = draft.trim()
    setDraft('')
    try {
      const response = await api.post(`/messaging/channels/${activeChannel.id}/messages`, { tip: 'text', continut: content })
      const message = response.data.message
      if (message) setMessages(current => [...current, message])
    } catch (err) {
      setDraft(content)
      setError(err.response?.data?.error || 'Mesajul nu a putut fi trimis.')
    }
  }

  // ─── Creare canal ─────────────────────────────────────────────────────────────
  async function createChannel(event) {
    event.preventDefault()
    if (!channelForm.nume.trim()) return
    setFormLoading(true)
    setFormError('')
    try {
      const response = await api.post('/messaging/channels', {
        tip: channelForm.tip,
        nume: channelForm.nume.trim(),
        descriere: channelForm.descriere.trim(),
        members: [],
      })
      const channel = response.data?.channel
      setNewChannelModal(false)
      setChannelForm(emptyChannelForm)
      await loadChannels()
      if (channel) setActiveChannel(channel)
    } catch (err) {
      setFormError(err.response?.data?.error || 'Canalul nu a putut fi creat.')
    } finally {
      setFormLoading(false)
    }
  }

  // ─── Ștergere canal ───────────────────────────────────────────────────────────
  async function deleteChannel() {
    if (!activeChannel?.id) return
    try {
      await api.delete(`/messaging/channels/${activeChannel.id}`)
      setDeleteModal(false)
      setActiveChannel(null)
      setInfoOpen(false)
      await loadChannels()
    } catch (err) {
      setError(err.response?.data?.error || 'Canalul nu a putut fi șters.')
      setDeleteModal(false)
    }
  }

  const canWrite = activeChannel && !activeChannel.readonly
  const totalUnread = channels.reduce((sum, c) => sum + (c.unread || 0), 0)

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Comunicare</h1>
          <p className="text-sm text-slate-500">Chat intern, notificări și fundația Inbox ERP organizațional.</p>
        </div>
        <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${activeTab === 'chat' ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Hash size={15} /> Chat intern {totalUnread > 0 ? <Badge tone="danger">{totalUnread}</Badge> : null}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('email')}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${activeTab === 'email' ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Mail size={15} /> Inbox ERP {emailStats.unread > 0 ? <Badge tone="danger">{emailStats.unread}</Badge> : null}
          </button>
        </div>
      </Card>

      {activeTab === 'email' ? (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Inbox ERP organizațional</h2>
              <p className="text-sm text-slate-500">
                Fundație pentru emailuri clasificate și legate de surse ERP. Integrarea IMAP/OAuth vine într-un update separat.
              </p>
            </div>
            <Button variant="secondary" onClick={loadEmailInbox} loading={emailLoading}>Reîncarcă</Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs uppercase text-slate-500">Emailuri</div>
              <div className="text-2xl font-bold text-slate-900">{emailStats.total || 0}</div>
            </div>
            <div className="rounded-lg border border-rose-100 bg-rose-50 p-3">
              <div className="text-xs uppercase text-rose-600">Necitite</div>
              <div className="text-2xl font-bold text-rose-700">{emailStats.unread || 0}</div>
            </div>
            <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
              <div className="text-xs uppercase text-amber-700">Importante</div>
              <div className="text-2xl font-bold text-amber-700">{emailStats.important || 0}</div>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
              <div className="text-xs uppercase text-blue-700">Cu atașamente</div>
              <div className="text-2xl font-bold text-blue-700">{emailStats.with_attachments || 0}</div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr_1fr_1fr_auto]">
            <Input
              label="Caută"
              value={emailFilters.q}
              onChange={event => setEmailFilters(filters => ({ ...filters, q: event.target.value }))}
              placeholder="subiect, expeditor, sursă ERP..."
            />
            <Select
              label="Categorie"
              value={emailFilters.category}
              onChange={event => setEmailFilters(filters => ({ ...filters, category: event.target.value }))}
              options={[{ value: '', label: 'Toate categoriile' }].concat(emailCategories.map(item => ({ value: item.id, label: `${item.icon || '📥'} ${item.label}` })))}
            />
            <Select
              label="Importanță"
              value={emailFilters.importance}
              onChange={event => setEmailFilters(filters => ({ ...filters, importance: event.target.value }))}
              options={[
                { value: '', label: 'Toate' },
                { value: 'urgent', label: 'Urgent' },
                { value: 'high', label: 'Important' },
                { value: 'normal', label: 'Normal' },
                { value: 'low', label: 'Scăzut' },
              ]}
            />
            <Select
              label="Status"
              value={emailFilters.status}
              onChange={event => setEmailFilters(filters => ({ ...filters, status: event.target.value }))}
              options={[
                { value: '', label: 'Toate' },
                { value: 'unread', label: 'Necitite' },
                { value: 'read', label: 'Citite' },
                { value: 'archived', label: 'Arhivate' },
              ]}
            />
            <div className="flex items-end gap-2">
              <Button type="button" onClick={loadEmailInbox} loading={emailLoading}><Search size={15} /></Button>
              <Button type="button" variant="secondary" onClick={() => setEmailFilters(emailFilterDefaults)}>Reset</Button>
            </div>
          </div>

          {error && <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

          <div className="overflow-hidden rounded-xl border border-slate-200">
            {emailLoading ? (
              <div className="p-6 text-sm text-slate-500">Se încarcă Inbox ERP...</div>
            ) : emailRows.length === 0 ? (
              <div className="grid place-items-center p-10 text-center">
                <div className="mb-2 text-4xl">📬</div>
                <div className="font-semibold text-slate-800">Inbox ERP pregătit</div>
                <p className="mt-1 max-w-xl text-sm text-slate-500">
                  Nu există emailuri interne înregistrate încă. Următorul pas va conecta această cutie poștală la furnizori reali sau la conversia email → task/document.
                </p>
              </div>
            ) : emailRows.map(email => {
              const badge = importanceBadge(email.importance)
              return (
                <div key={email.id} className="border-b border-slate-100 p-4 last:border-b-0 hover:bg-slate-50">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                          {email.category_icon || '📥'} {email.category_label || email.category}
                        </span>
                        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${badge.cls}`}>{badge.label}</span>
                        {email.status === 'unread' ? <Badge tone="danger">necitit</Badge> : null}
                        {email.has_attachments ? <span className="inline-flex items-center gap-1 text-xs text-blue-600"><Paperclip size={13} /> {email.attachments_count || 1}</span> : null}
                      </div>
                      <h3 className="mt-2 truncate text-sm font-semibold text-slate-900">{email.subject}</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        De la <strong>{email.from}</strong>{email.to ? <> către {email.to}</> : null} · {formatDate(email.received_at)}
                      </p>
                      {email.preview ? <p className="mt-2 line-clamp-2 text-sm text-slate-600">{email.preview}</p> : null}
                      {email.source_label ? (
                        <div className="mt-2 rounded-md border border-emerald-100 bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                          Legat de: {email.source_label}
                        </div>
                      ) : null}
                    </div>
                    {email.source_url ? (
                      <Button size="sm" variant="secondary" onClick={() => { window.location.href = email.source_url }}>Deschide sursa</Button>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      ) : (
        <div className="grid h-[calc(100vh-13rem)] gap-4 lg:grid-cols-[300px_1fr]">

      {/* ── SIDEBAR CANALE ── */}
      <Card className="flex min-h-0 flex-col p-0">
        <div className="border-b border-slate-200 p-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-semibold text-slate-900">
                Mesaje {totalUnread > 0 && <Badge tone="danger">{totalUnread}</Badge>}
              </h1>
              <p className="text-xs text-slate-500">{channels.length} canale active</p>
            </div>
            <div className="flex items-center gap-1">
              {!notifGranted && 'Notification' in window && Notification.permission !== 'denied' && (
                <button
                  onClick={async () => { const ok = await requestPermission(); setNotifGranted(ok) }}
                  className="rounded-md p-1.5 text-amber-500 hover:bg-amber-50"
                  title="Activează notificările"
                >🔔</button>
              )}
              {isAdmin && (
                <button
                  onClick={() => { setNewChannelModal(true); setFormError('') }}
                  className="flex items-center gap-1 rounded-md bg-primary-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-primary-700"
                  title="Canal nou"
                >
                  <Plus size={13} /> Canal
                </button>
              )}
            </div>
          </div>
        </div>

        {error && <div className="mx-3 mt-2 rounded bg-rose-50 px-2 py-1.5 text-xs text-rose-700">{error}</div>}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-sm text-slate-500">Se încarcă...</div>
          ) : channels.length === 0 ? (
            <div className="p-6 text-center">
              <div className="mb-2 text-2xl">💬</div>
              <p className="text-sm font-medium text-slate-700">Niciun canal</p>
              <p className="mt-1 text-xs text-slate-400">
                {isAdmin ? 'Creează primul canal cu butonul de mai sus.' : 'Contactează administratorul.'}
              </p>
            </div>
          ) : channels.map(channel => (
            <button
              key={channel.id}
              type="button"
              onClick={() => { setActiveChannel(channel); setInfoOpen(false) }}
              className={`flex w-full items-center gap-2.5 border-b border-slate-100 px-3 py-2.5 text-left transition hover:bg-slate-50 ${
                String(activeChannel?.id) === String(channel.id) ? 'bg-primary-50' : ''
              }`}
            >
              <span className="shrink-0 text-base">{channelIcon(channel)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={`truncate text-sm font-medium ${String(activeChannel?.id) === String(channel.id) ? 'text-primary-800' : 'text-slate-800'}`}>
                    {channelName(channel)}
                  </span>
                  {channel.readonly && <span className="shrink-0 text-[10px] text-slate-400" title="Doar admin poate posta">🔒</span>}
                  {channel.creat_automat && <span className="shrink-0 text-[10px] text-slate-300" title="Creat automat">🤖</span>}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  {(() => { const b = channelTypeBadge(channel.tip); return b ? <span className={`rounded px-1 py-px text-[10px] font-medium ${b.cls}`}>{b.label}</span> : null })()}
                </div>
              </div>
              {channel.unread > 0 && (
                <span className="shrink-0 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {channel.unread > 99 ? '99+' : channel.unread}
                </span>
              )}
            </button>
          ))}
        </div>
      </Card>

      {/* ── ZONA MESAJE ── */}
      <Card className="flex min-h-0 flex-col p-0">
        {activeChannel ? (
          <>
            {/* Header canal */}
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">{channelIcon(activeChannel)}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-slate-900">{channelName(activeChannel)}</h2>
                    {(() => { const b = channelTypeBadge(activeChannel.tip); return b ? <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${b.cls}`}>{b.label}</span> : null })()}
                    {activeChannel.readonly && <span className="text-[11px] text-slate-400" title="Doar admin poate posta">🔒 Readonly</span>}
                    {activeChannel.creat_automat && <span className="text-[11px] text-slate-300" title="Canal creat automat de sistem">🤖</span>}
                  </div>
                  {activeChannel.descriere && <p className="text-xs text-slate-400">{activeChannel.descriere}</p>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setInfoOpen(v => !v)}
                  className={`rounded-md p-1.5 transition hover:bg-slate-100 ${infoOpen ? 'bg-primary-50 text-primary-700' : 'text-slate-500'}`}
                  title="Info canal"
                >
                  <Info size={17} />
                </button>
                {isAdmin && (
                  <button
                    onClick={() => setDeleteModal(true)}
                    className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                    title="Șterge canal"
                  >
                    <Trash2 size={17} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 overflow-hidden">
              {/* Mesaje */}
              <div
                ref={listRef}
                className={`min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-50 p-4 ${infoOpen ? 'hidden lg:block' : ''}`}
              >
                {activeMessages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
                    <span className="text-4xl">💬</span>
                    <p className="text-sm">Nicio conversație încă. Fii primul care scrie!</p>
                  </div>
                ) : activeMessages.map(message => {
                  const mine = String(message.sender_id) === String(currentUserId)
                  return (
                    <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      {!mine && (
                        <div className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">
                          {String(message.sender_id || '?')[0].toUpperCase()}
                        </div>
                      )}
                      <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 shadow-sm ${mine ? 'rounded-tr-sm bg-primary-600 text-white' : 'rounded-tl-sm bg-white text-slate-800'}`}>
                        {!mine && (
                          <div className="mb-0.5 text-[10px] font-semibold text-slate-400">{message.sender_id}</div>
                        )}
                        <div className="whitespace-pre-wrap text-sm leading-relaxed">{highlightMentions(messageText(message))}</div>
                        <div className={`mt-1 text-[10px] ${mine ? 'text-right text-primary-200' : 'text-slate-400'}`}>
                          {formatDate(message.created_at)}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Panou info canal */}
              {infoOpen && (
                <div className="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-slate-200 bg-white p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-700">Detalii canal</h3>
                    <button onClick={() => setInfoOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
                  </div>

                  <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm">
                    <div className="font-semibold text-slate-800">{channelName(activeChannel)}</div>
                    <div className="mt-1 text-xs capitalize text-slate-500">{activeChannel.tip}</div>
                    {activeChannel.readonly && <div className="mt-1 text-xs text-amber-600">🔒 Numai citire</div>}
                  </div>

                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-500 mb-2">
                    <Users size={13} /> Membri ({channelMembers.length})
                  </div>
                  <div className="grid gap-1">
                    {channelMembers.length === 0 ? (
                      <p className="text-xs text-slate-400">Se încarcă...</p>
                    ) : channelMembers.map((m, i) => (
                      <div key={m.user_id || m.userId || i} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-slate-50">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">
                          {String(m.user_id || m.userId || '?')[0].toUpperCase()}
                        </div>
                        <span className="truncate text-slate-700">{m.user_id || m.userId}</span>
                        {m.rol === 'admin' && <span className="ml-auto text-[10px] text-primary-600">admin</span>}
                      </div>
                    ))}
                  </div>

                  {isAdmin && (
                    <button
                      onClick={() => setDeleteModal(true)}
                      className="mt-4 flex items-center gap-2 rounded-lg border border-rose-200 p-2.5 text-sm text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 size={15} /> Șterge canal
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Input mesaj */}
            {canWrite ? (
              <form className="flex items-end gap-2 border-t border-slate-200 p-3" onSubmit={sendMessage}>
                <div className="flex-1">
                  <Input
                    label=""
                    value={draft}
                    onChange={event => setDraft(event.target.value)}
                    placeholder={`Scrie în #${channelName(activeChannel).replace('#', '')} — @username pentru mențiuni`}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e) } }}
                  />
                </div>
                <Button type="submit" className="mb-0.5 shrink-0" disabled={!draft.trim()}>
                  <Send size={15} />
                </Button>
              </form>
            ) : (
              <div className="border-t border-slate-200 p-3 text-center text-sm text-slate-400">
                🔒 Canal de anunțuri — numai administratorii pot posta
              </div>
            )}
          </>
        ) : (
          <div className="grid h-full place-items-center">
            <div className="text-center text-slate-400">
              <div className="mb-3 text-5xl">💬</div>
              <p className="text-sm font-medium">Alege un canal pentru a începe conversația</p>
              {isAdmin && (
                <button
                  onClick={() => setNewChannelModal(true)}
                  className="mt-4 flex items-center gap-2 rounded-lg bg-primary-50 px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-100"
                >
                  <Plus size={16} /> Creează primul canal
                </button>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* ── MODAL CANAL NOU ── */}
      <Modal open={newChannelModal} title="Canal nou" onClose={() => setNewChannelModal(false)}>
        <form className="grid gap-4" onSubmit={createChannel}>
          <Input
            label="Nume canal"
            value={channelForm.nume}
            onChange={e => setChannelForm({ ...channelForm, nume: e.target.value })}
            placeholder="ex: mecanizare, anunturi-hr..."
            required
          />
          <Select
            label="Tip canal"
            value={channelForm.tip}
            onChange={e => setChannelForm({ ...channelForm, tip: e.target.value })}
            options={[
              { value: 'departament', label: '🏢 Departament — membrii unui departament' },
              { value: 'public', label: '🌐 Public — toți utilizatorii' },
              { value: 'anunturi', label: '📢 Anunțuri — numai admin poate posta' },
              { value: 'direct', label: '💬 Direct — conversație privată' },
            ]}
          />
          <Input
            label="Descriere (opțional)"
            value={channelForm.descriere}
            onChange={e => setChannelForm({ ...channelForm, descriere: e.target.value })}
            placeholder="Scurtă descriere a scopului canalului..."
          />
          <div className="rounded-lg border border-primary-100 bg-primary-50 p-3 text-xs text-primary-700">
            <strong>Canal {channelForm.tip === 'public' ? 'Public' : channelForm.tip === 'departament' ? 'Departament' : channelForm.tip === 'anunturi' ? 'Anunțuri' : 'Direct'}:</strong>{' '}
            {channelForm.tip === 'public' && 'Toți utilizatorii sunt adăugați automat.'}
            {channelForm.tip === 'departament' && 'Vizibil utilizatorilor din departamentul respectiv.'}
            {channelForm.tip === 'anunturi' && 'Numai administratorii pot trimite mesaje.'}
            {channelForm.tip === 'direct' && 'Conversație privată — adaugă membrii după creare.'}
          </div>
          {formError && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setNewChannelModal(false)}>Anulează</Button>
            <Button type="submit" disabled={formLoading || !channelForm.nume.trim()}>
              {formLoading ? 'Se creează...' : 'Creează canal'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL CONFIRMARE ȘTERGERE ── */}
      <Modal open={deleteModal} title="Șterge canal" onClose={() => setDeleteModal(false)}>
        <p className="mb-4 text-sm text-slate-600">
          Ești sigur că vrei să ștergi canalul <strong>{channelName(activeChannel)}</strong>?
          Toate mesajele vor fi șterse permanent.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteModal(false)}>Anulează</Button>
          <Button
            onClick={deleteChannel}
            className="bg-rose-600 hover:bg-rose-700 focus:ring-rose-500"
          >
            Șterge definitiv
          </Button>
        </div>
      </Modal>
        </div>
      )}
    </div>
  )
}
