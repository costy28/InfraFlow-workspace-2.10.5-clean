import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Forward, Hash, Info, Mail, Paperclip, Plus, Reply, Search, Send, Trash2, Users, X } from 'lucide-react'
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

const emailFilterDefaults = { q: '', category: '', importance: '', status: '', has_attachments: '', direction: 'inbound', rule: '', linked: '', linked_type: '' }
const emptyEmailComposeForm = { draft_id: '', to: '', cc: '', bcc: '', subject: '', body: '', category: 'general', importance: 'normal', attachments: [] }
const emptyLinkForm = { target_type: 'contract', target_id: '', q: '' }
const emptyEmailSyncStatus = {
  enabled: false,
  interval_min: 15,
  limit: 20,
  last_manual_sync_at: '',
  last_manual_sync_imported: 0,
  last_manual_sync_scanned: 0,
  last_auto_sync_at: '',
  last_auto_sync_imported: 0,
  last_auto_sync_scanned: 0,
  last_auto_sync_error: '',
  next_auto_sync_at: '',
}

function importanceBadge(value) {
  if (value === 'urgent') return { label: 'urgent', tone: 'danger', cls: 'bg-rose-100 text-rose-700' }
  if (value === 'high') return { label: 'important', tone: 'warning', cls: 'bg-amber-100 text-amber-700' }
  if (value === 'low') return { label: 'scăzut', tone: 'muted', cls: 'bg-slate-100 text-slate-500' }
  return { label: 'normal', tone: 'default', cls: 'bg-emerald-100 text-emerald-700' }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function readFileAsAttachment(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      const content = result.includes(',') ? result.split(',').pop() : result
      resolve({
        filename: file.name,
        name: file.name,
        size: file.size,
        type: file.type,
        contentType: file.type,
        content,
        encoding: 'base64',
      })
    }
    reader.onerror = () => reject(reader.error || new Error('Fișierul nu a putut fi citit.'))
    reader.readAsDataURL(file)
  })
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim()
}

function prefixedSubject(prefix, subject) {
  const clean = String(subject || 'fără subiect').trim()
  const pattern = prefix === 'Re:' ? /^re:/i : /^(fwd|fw):/i
  return pattern.test(clean) ? clean : `${prefix} ${clean}`
}

function quotedEmailText(email) {
  const originalBody = stripHtml(email?.body || email?.preview || '')
  return [
    '',
    '',
    '--- Mesaj original ---',
    `De la: ${email?.from || '-'}`,
    email?.to ? `Către: ${email.to}` : '',
    email?.cc ? `CC: ${email.cc}` : '',
    `Data: ${formatDate(email?.received_at)}`,
    `Subiect: ${email?.subject || 'fără subiect'}`,
    '',
    originalBody,
  ].filter(line => line !== '').join('\n')
}

function syncStatusText(status) {
  const last = status.last_auto_sync_at || status.last_manual_sync_at
  if (!last) return 'Nicio sincronizare încă'
  const imported = status.last_auto_sync_at
    ? Number(status.last_auto_sync_imported || 0)
    : Number(status.last_manual_sync_imported || 0)
  const scanned = status.last_auto_sync_at
    ? Number(status.last_auto_sync_scanned || 0)
    : Number(status.last_manual_sync_scanned || 0)
  return `${formatDate(last)} · ${imported} importate / ${scanned} verificate`
}

function urlEmailParam() {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.search || '').get('email') || ''
}

export default function MessagingPage() {
  const { user } = useAuth()
  const [pendingEmailParam, setPendingEmailParam] = useState(urlEmailParam)
  const [focusedEmailId, setFocusedEmailId] = useState(urlEmailParam)
  const [activeTab, setActiveTab] = useState(() => urlEmailParam() ? 'email' : 'chat')
  const [channels, setChannels] = useState([])
  const [activeChannel, setActiveChannel] = useState(null)
  const [messages, setMessages] = useState([])
  const [emailRows, setEmailRows] = useState([])
  const [emailCategories, setEmailCategories] = useState([])
  const [emailRules, setEmailRules] = useState([])
  const [emailStats, setEmailStats] = useState({ total: 0, unread: 0, important: 0, with_attachments: 0 })
  const [emailSyncStatus, setEmailSyncStatus] = useState(emptyEmailSyncStatus)
  const [emailFilters, setEmailFilters] = useState(() => urlEmailParam() ? { ...emailFilterDefaults, direction: '' } : emailFilterDefaults)
  const [emailLoading, setEmailLoading] = useState(false)
  const [selectedEmailIds, setSelectedEmailIds] = useState([])
  const [emailBulkLoading, setEmailBulkLoading] = useState(false)
  const [emailSyncLoading, setEmailSyncLoading] = useState(false)
  const [taskUsers, setTaskUsers] = useState([])
  const [taskEmail, setTaskEmail] = useState(null)
  const [taskForm, setTaskForm] = useState({ title: '', description: '', assigned_to: '', priority: 'normal', due_date: '' })
  const [taskLoading, setTaskLoading] = useState(false)
  const [taskError, setTaskError] = useState('')
  const [documentTemplates, setDocumentTemplates] = useState([])
  const [documentEmail, setDocumentEmail] = useState(null)
  const [documentForm, setDocumentForm] = useState({ tip_id: '', titlu: '', prioritate: 'normal', termen_limita: '' })
  const [documentLoading, setDocumentLoading] = useState(false)
  const [documentError, setDocumentError] = useState('')
  const [linkEmail, setLinkEmail] = useState(null)
  const [linkForm, setLinkForm] = useState(emptyLinkForm)
  const [linkTargets, setLinkTargets] = useState([])
  const [linkLoading, setLinkLoading] = useState(false)
  const [linkError, setLinkError] = useState('')
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeTitle, setComposeTitle] = useState('Email nou')
  const [composeForm, setComposeForm] = useState(emptyEmailComposeForm)
  const [composeLoading, setComposeLoading] = useState(false)
  const [draftLoading, setDraftLoading] = useState(false)
  const [composeError, setComposeError] = useState('')
  const [composeMessage, setComposeMessage] = useState('')
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
      const [response, syncStatusRes] = await Promise.all([
        api.get('/messaging/email/inbox', { params }),
        api.get('/messaging/email/sync/status').catch(() => ({ data: { status: emptyEmailSyncStatus } }))
      ])
      setEmailRows(arrayFrom(response.data, ['emails']))
      setSelectedEmailIds([])
      setEmailCategories(arrayFrom(response.data, ['categories']))
      setEmailRules(arrayFrom(response.data, ['rules']))
      setEmailStats(response.data?.stats || { total: 0, unread: 0, important: 0, with_attachments: 0 })
      setEmailSyncStatus(syncStatusRes.data?.status || emptyEmailSyncStatus)
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut încărca Inbox ERP.')
    } finally {
      setEmailLoading(false)
    }
  }, [emailFilters])

  useEffect(() => {
    if (activeTab === 'email') Promise.resolve().then(() => loadEmailInbox())
  }, [activeTab, loadEmailInbox])

  useEffect(() => {
    if (!pendingEmailParam || activeTab !== 'email' || emailLoading) return
    const target = emailRows.find(email => String(email.id) === String(pendingEmailParam))
    if (!target) {
      if (emailFilters.direction) setEmailFilters(filters => ({ ...filters, direction: '' }))
      return
    }
    setFocusedEmailId(String(target.id))
    if (target.status === 'unread') updateEmailStatus(target, 'read').catch(() => {})
    window.setTimeout(() => {
      const element = document.getElementById(`email-row-${target.id}`)
      if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 80)
    setPendingEmailParam('')
  }, [activeTab, emailFilters.direction, emailLoading, emailRows, pendingEmailParam])

  const loadTaskUsers = useCallback(async () => {
    try {
      const response = await api.get('/tasks/assignees')
      const rows = arrayFrom(response.data, ['users'])
      setTaskUsers(rows)
      return rows
    } catch {
      setTaskUsers([])
      return []
    }
  }, [])

  function openTaskFromEmail(email) {
    setTaskEmail(email)
    setTaskError('')
    const title = `Răspunde / rezolvă email: ${email.subject || 'fără subiect'}`
    const description = [
      `Email primit de la: ${email.from || '-'}`,
      email.to ? `Către: ${email.to}` : '',
      email.category_label ? `Categorie: ${email.category_label}` : '',
      email.preview ? `Conținut: ${email.preview}` : '',
      email.source_label ? `Legat de: ${email.source_label}` : '',
    ].filter(Boolean).join('\n')
    setTaskForm({
      title,
      description,
      assigned_to: currentUserId || '',
      priority: email.importance === 'urgent' ? 'urgent' : (email.importance === 'high' ? 'high' : 'normal'),
      due_date: '',
    })
    if (!taskUsers.length) loadTaskUsers().then(rows => {
      if (!currentUserId && rows[0]?.id) setTaskForm(form => ({ ...form, assigned_to: rows[0].id }))
    })
  }

  async function createTaskFromEmail(event) {
    event.preventDefault()
    if (!taskEmail) return
    setTaskLoading(true)
    setTaskError('')
    try {
      const response = await api.post('/tasks', {
        ...taskForm,
        source_type: 'email',
        source_id: String(taskEmail.id),
        source_label: `Email: ${taskEmail.subject || taskEmail.from || taskEmail.id}`,
        source_url: '/mesaje',
      })
      const task = response.data?.task
      if (task?.id) {
        await api.post(`/messaging/email/inbox/${taskEmail.id}/links`, {
          target_type: 'task',
          target_id: task.id,
          target_label: `Task: ${task.title || task.titlu || task.id}`,
          target_url: `/taskuri?task=${encodeURIComponent(String(task.id))}`
        }).catch(() => {})
      }
      await api.patch(`/messaging/email/inbox/${taskEmail.id}`, { status: 'read' }).catch(() => {})
      setTaskEmail(null)
      await loadEmailInbox()
    } catch (err) {
      setTaskError(err.response?.data?.error || 'Task-ul nu a putut fi creat din email.')
    } finally {
      setTaskLoading(false)
    }
  }

  const loadDocumentTemplates = useCallback(async () => {
    try {
      const response = await api.get('/documents/template-catalog')
      const rows = arrayFrom(response.data, ['templates'])
      setDocumentTemplates(rows)
      return rows
    } catch {
      setDocumentTemplates([])
      return []
    }
  }, [])

  function documentPriorityFromEmail(email) {
    if (email?.importance === 'urgent') return 'critic'
    if (email?.importance === 'high') return 'urgent'
    return 'normal'
  }

  async function openDocumentFromEmail(email) {
    setDocumentEmail(email)
    setDocumentError('')
    const rows = documentTemplates.length ? documentTemplates : await loadDocumentTemplates()
    setDocumentForm({
      tip_id: rows[0]?.id || '',
      titlu: `Email: ${email.subject || 'fără subiect'}`,
      prioritate: documentPriorityFromEmail(email),
      termen_limita: '',
    })
  }

  async function createDocumentFromEmail(event) {
    event.preventDefault()
    if (!documentEmail) return
    setDocumentLoading(true)
    setDocumentError('')
    try {
      const response = await api.post('/documents', {
        ...documentForm,
        date: {
          source_type: 'email',
          source_id: String(documentEmail.id),
          source_label: `Email: ${documentEmail.subject || documentEmail.from || documentEmail.id}`,
          source_url: '/mesaje',
          email_from: documentEmail.from || '',
          email_to: documentEmail.to || '',
          email_subject: documentEmail.subject || '',
          email_received_at: documentEmail.received_at || '',
          email_category: documentEmail.category || '',
          email_category_label: documentEmail.category_label || '',
          email_importance: documentEmail.importance || 'normal',
          email_preview: documentEmail.preview || '',
          email_has_attachments: Boolean(documentEmail.has_attachments),
          email_attachments_count: Number(documentEmail.attachments_count || 0),
        },
      })
      const document = response.data?.document
      const documentId = document?.uuid || document?.id
      if (documentId) {
        await api.post(`/messaging/email/inbox/${documentEmail.id}/links`, {
          target_type: 'document',
          target_id: documentId,
          target_label: `Document: ${document.nr_document || document.titlu || documentId}`,
          target_url: `/documente?document=${encodeURIComponent(String(documentId))}`
        }).catch(() => {})
      }
      await api.patch(`/messaging/email/inbox/${documentEmail.id}`, { status: 'read' }).catch(() => {})
      setDocumentEmail(null)
      await loadEmailInbox()
    } catch (err) {
      setDocumentError(err.response?.data?.error || 'Documentul nu a putut fi creat din email.')
    } finally {
      setDocumentLoading(false)
    }
  }

  async function loadEmailLinkTargets(nextForm = linkForm) {
    setLinkLoading(true)
    setLinkError('')
    try {
      const response = await api.get('/messaging/email/link-targets', {
        params: {
          type: nextForm.target_type,
          q: nextForm.q,
        }
      })
      const rows = arrayFrom(response.data, ['targets'])
      setLinkTargets(rows)
      setLinkForm(form => ({
        ...form,
        target_id: rows.some(item => String(item.target_id) === String(form.target_id)) ? form.target_id : (rows[0]?.target_id || '')
      }))
    } catch (err) {
      setLinkTargets([])
      setLinkError(err.response?.data?.error || 'Țintele ERP nu au putut fi încărcate.')
    } finally {
      setLinkLoading(false)
    }
  }

  async function openLinkEmail(email) {
    setLinkEmail(email)
    setLinkError('')
    const next = { ...emptyLinkForm, target_type: email.category === 'documente' ? 'document' : (email.category === 'contracte' ? 'contract' : 'contract') }
    setLinkForm(next)
    await loadEmailLinkTargets(next)
  }

  async function updateLinkType(value) {
    const next = { ...linkForm, target_type: value, target_id: '' }
    setLinkForm(next)
    await loadEmailLinkTargets(next)
  }

  async function saveEmailLink(event) {
    event.preventDefault()
    if (!linkEmail) return
    const target = linkTargets.find(item => String(item.target_id) === String(linkForm.target_id))
    if (!target) {
      setLinkError('Alege o țintă ERP validă.')
      return
    }
    setLinkLoading(true)
    setLinkError('')
    try {
      await api.post(`/messaging/email/inbox/${linkEmail.id}/links`, {
        target_type: target.target_type,
        target_id: target.target_id,
        target_label: target.target_label,
        target_url: target.target_url,
      })
      setLinkEmail(null)
      await loadEmailInbox()
    } catch (err) {
      setLinkError(err.response?.data?.error || 'Legătura nu a putut fi salvată.')
    } finally {
      setLinkLoading(false)
    }
  }

  async function cancelEmailLink(email, link) {
    try {
      await api.delete(`/messaging/email/inbox/${email.id}/links/${link.id}`)
      await loadEmailInbox()
    } catch (err) {
      setError(err.response?.data?.error || 'Legătura nu a putut fi anulată.')
    }
  }

  function openComposeEmail() {
    setComposeTitle('Email nou')
    setComposeForm(form => ({
      ...emptyEmailComposeForm,
      category: form.category || 'general',
    }))
    setComposeError('')
    setComposeMessage('')
    setComposeOpen(true)
  }

  function openDraftEmail(email) {
    setComposeTitle('Editează draft')
    setComposeForm({
      ...emptyEmailComposeForm,
      draft_id: String(email.id || ''),
      to: email.to || '',
      cc: email.cc || '',
      bcc: email.bcc && email.bcc !== '***' ? email.bcc : '',
      subject: email.subject === '(fara subiect)' ? '' : (email.subject || ''),
      body: stripHtml(email.body || email.preview || ''),
      category: email.category || 'general',
      importance: email.importance || 'normal',
      source_type: email.source_type || '',
      source_id: email.source_id || '',
      source_label: email.source_label || '',
      source_url: email.source_url || '',
    })
    setComposeError(email.has_attachments ? 'Draftul păstrează doar metadatele atașamentelor; reatașează fișierele înainte de trimitere.' : '')
    setComposeMessage('')
    setComposeOpen(true)
  }

  function openReplyEmail(email) {
    setComposeTitle('Răspunde la email')
    setComposeForm({
      ...emptyEmailComposeForm,
      to: email.from || '',
      subject: prefixedSubject('Re:', email.subject),
      body: quotedEmailText(email),
      category: email.category || 'general',
      importance: email.importance || 'normal',
      source_type: 'email',
      source_id: String(email.id),
      source_label: `Răspuns la: ${email.subject || email.from || email.id}`,
      source_url: '/mesaje',
    })
    setComposeError('')
    setComposeMessage('')
    setComposeOpen(true)
  }

  function openForwardEmail(email) {
    setComposeTitle('Redirecționează email')
    setComposeForm({
      ...emptyEmailComposeForm,
      subject: prefixedSubject('Fwd:', email.subject),
      body: quotedEmailText(email),
      category: email.category || 'general',
      importance: email.importance || 'normal',
      source_type: 'email',
      source_id: String(email.id),
      source_label: `Forward din: ${email.subject || email.from || email.id}`,
      source_url: '/mesaje',
    })
    setComposeError('')
    setComposeMessage('')
    setComposeOpen(true)
  }

  async function updateEmailStatus(email, status) {
    try {
      await api.patch(`/messaging/email/inbox/${email.id}`, { status })
      await loadEmailInbox()
    } catch (err) {
      setError(err.response?.data?.error || 'Statusul emailului nu a putut fi actualizat.')
    }
  }

  function toggleEmailSelection(emailId) {
    setSelectedEmailIds(ids => ids.some(id => String(id) === String(emailId))
      ? ids.filter(id => String(id) !== String(emailId))
      : ids.concat(emailId))
  }

  function toggleAllVisibleEmails() {
    setSelectedEmailIds(allVisibleEmailsSelected ? [] : selectableEmailRows.map(email => email.id))
  }

  async function bulkUpdateEmailStatus(status) {
    if (!selectedVisibleEmailIds.length) return
    setEmailBulkLoading(true)
    setError('')
    try {
      await Promise.all(selectedVisibleEmailIds.map(id => api.patch(`/messaging/email/inbox/${id}`, { status })))
      await loadEmailInbox()
    } catch (err) {
      setError(err.response?.data?.error || 'Emailurile selectate nu au putut fi actualizate.')
    } finally {
      setEmailBulkLoading(false)
    }
  }

  async function syncIncomingEmail() {
    setEmailSyncLoading(true)
    setError('')
    setComposeMessage('')
    try {
      const response = await api.post('/messaging/email/sync', { limit: 20 })
      const imported = Number(response.data?.imported || 0)
      const scanned = Number(response.data?.scanned || 0)
      const host = response.data?.host || 'IMAP'
      setComposeMessage(imported > 0
        ? `Sincronizare email OK: ${imported} emailuri noi importate din ${host}.`
        : `Sincronizare email OK: ${scanned} emailuri verificate, niciun email nou.`)
      setEmailFilters(filters => ({ ...filters, direction: 'inbound', status: '' }))
      await loadEmailInbox()
    } catch (err) {
      const data = err.response?.data || {}
      const tips = Array.isArray(data.tips) && data.tips.length ? `\n${data.tips.map(item => `• ${item}`).join('\n')}` : ''
      setError(`${data.error || 'Sincronizarea emailurilor nu a reușit.'}${tips}`)
    } finally {
      setEmailSyncLoading(false)
    }
  }

  function emailBodyHtml(text) {
    return String(text || '')
      .trim()
      .split(/\n{2,}/)
      .map(paragraph => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
      .join('')
  }

  async function sendComposeEmail(event) {
    event.preventDefault()
    setComposeLoading(true)
    setComposeError('')
    setComposeMessage('')
    try {
      await api.post('/messaging/email/send', {
        ...composeForm,
        draft_id: composeForm.draft_id || undefined,
        body: emailBodyHtml(composeForm.body),
        preview: composeForm.body,
      })
      setComposeOpen(false)
      setComposeForm(emptyEmailComposeForm)
      setComposeMessage('Email trimis și salvat în Trimise.')
      if (composeForm.source_type === 'email' && composeForm.source_id) {
        await api.patch(`/messaging/email/inbox/${composeForm.source_id}`, { status: 'read' }).catch(() => {})
      }
      setEmailFilters(filters => ({ ...filters, direction: 'outbound', status: '' }))
    } catch (err) {
      setComposeError(err.response?.data?.error || 'Emailul nu a putut fi trimis. Verifică setările SMTP.')
    } finally {
      setComposeLoading(false)
    }
  }

  async function saveComposeDraft() {
    setDraftLoading(true)
    setComposeError('')
    setComposeMessage('')
    try {
      const response = await api.post('/messaging/email/drafts', {
        ...composeForm,
        id: composeForm.draft_id || undefined,
        body: composeForm.body,
        preview: composeForm.body,
      })
      const draft = response.data?.draft
      setComposeForm(form => ({ ...form, draft_id: String(draft?.id || form.draft_id || '') }))
      setComposeOpen(false)
      setComposeMessage('Draft salvat.')
      setEmailFilters(filters => ({ ...filters, direction: 'draft', status: '' }))
    } catch (err) {
      setComposeError(err.response?.data?.error || 'Draftul nu a putut fi salvat.')
    } finally {
      setDraftLoading(false)
    }
  }

  async function handleComposeFiles(event) {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    setComposeError('')
    const maxFileSize = 2 * 1024 * 1024
    const maxTotalSize = 5 * 1024 * 1024
    const accepted = files.slice(0, 5)
    const oversized = accepted.find(file => file.size > maxFileSize)
    if (oversized) {
      setComposeError(`Fișierul ${oversized.name} depășește limita de 2 MB.`)
      event.target.value = ''
      return
    }
    const currentSize = composeForm.attachments.reduce((sum, item) => sum + Number(item.size || 0), 0)
    const selectedSize = accepted.reduce((sum, file) => sum + Number(file.size || 0), 0)
    if (currentSize + selectedSize > maxTotalSize) {
      setComposeError('Atașamentele depășesc limita totală de 5 MB pentru un email.')
      event.target.value = ''
      return
    }
    try {
      const attachments = await Promise.all(accepted.map(readFileAsAttachment))
      setComposeForm(form => ({ ...form, attachments: form.attachments.concat(attachments).slice(0, 5) }))
    } catch {
      setComposeError('Un atașament nu a putut fi citit.')
    } finally {
      event.target.value = ''
    }
  }

  function removeComposeAttachment(index) {
    setComposeForm(form => ({ ...form, attachments: form.attachments.filter((_, itemIndex) => itemIndex !== index) }))
  }

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
  const selectableEmailRows = useMemo(() => emailRows.filter(email => email.direction !== 'draft'), [emailRows])
  const selectedVisibleEmailIds = useMemo(
    () => selectedEmailIds.filter(id => selectableEmailRows.some(email => String(email.id) === String(id))),
    [selectedEmailIds, selectableEmailRows]
  )
  const allVisibleEmailsSelected = selectableEmailRows.length > 0 && selectedVisibleEmailIds.length === selectableEmailRows.length

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
              <h2 className="text-base font-semibold text-slate-900">
                {emailFilters.direction === 'outbound' ? 'Emailuri trimise' : emailFilters.direction === 'draft' ? 'Drafturi email' : emailFilters.direction === '' ? 'Email ERP organizațional' : 'Inbox ERP organizațional'}
              </h2>
              <p className="text-sm text-slate-500">
                Emailuri clasificate, trimise din ERP și legate de task-uri/documente. Integrarea IMAP/OAuth vine într-un update separat.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={openComposeEmail}><Mail size={15} /> Email nou</Button>
              <Button variant="secondary" onClick={syncIncomingEmail} loading={emailSyncLoading}>Sincronizează inbox</Button>
              <Button variant="secondary" onClick={loadEmailInbox} loading={emailLoading}>Reîncarcă</Button>
            </div>
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

          {composeMessage ? <div className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{composeMessage}</div> : null}
          <div className={`rounded-xl border px-3 py-2 text-sm ${emailSyncStatus.last_auto_sync_error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-semibold text-slate-800">Sincronizare email:</span>{' '}
                {emailSyncStatus.enabled ? `automată la ${emailSyncStatus.interval_min || 15} minute` : 'manuală'}
                <span className="mx-2 text-slate-300">•</span>
                {syncStatusText(emailSyncStatus)}
              </div>
              {emailSyncStatus.next_auto_sync_at ? (
                <span>Următoarea: {formatDate(emailSyncStatus.next_auto_sync_at)}</span>
              ) : null}
            </div>
            {emailSyncStatus.last_auto_sync_error ? (
              <div className="mt-1 whitespace-pre-wrap text-xs text-rose-700">Ultima eroare autosync: {emailSyncStatus.last_auto_sync_error}</div>
            ) : null}
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr_auto]">
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
              label="Cutie"
              value={emailFilters.direction}
              onChange={event => setEmailFilters(filters => ({ ...filters, direction: event.target.value }))}
              options={[
                { value: 'inbound', label: 'Inbox' },
                { value: 'outbound', label: 'Trimise' },
                { value: 'draft', label: 'Drafturi' },
                { value: '', label: 'Toate' },
              ]}
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
            <Select
              label="Regulă"
              value={emailFilters.rule}
              onChange={event => setEmailFilters(filters => ({ ...filters, rule: event.target.value }))}
              options={[
                { value: '', label: 'Toate' },
                { value: 'auto', label: 'Sortate automat' },
                { value: 'none', label: 'Fără regulă' },
              ].concat(emailRules.map(item => ({ value: item.id, label: item.name || item.id })))}
            />
            <Select
              label="Legături"
              value={emailFilters.linked}
              onChange={event => setEmailFilters(filters => ({ ...filters, linked: event.target.value }))}
              options={[
                { value: '', label: 'Toate' },
                { value: 'true', label: 'Cu legături ERP' },
                { value: 'false', label: 'Fără legături' },
              ]}
            />
            <Select
              label="Tip legătură"
              value={emailFilters.linked_type}
              onChange={event => setEmailFilters(filters => ({ ...filters, linked_type: event.target.value }))}
              options={[
                { value: '', label: 'Orice tip' },
                { value: 'contract', label: 'Contracte' },
                { value: 'document', label: 'Documente' },
                { value: 'task', label: 'Task-uri' },
              ]}
            />
            <div className="flex items-end gap-2">
              <Button type="button" onClick={loadEmailInbox} loading={emailLoading}><Search size={15} /></Button>
              <Button type="button" variant="secondary" onClick={() => setEmailFilters(emailFilterDefaults)}>Reset</Button>
            </div>
          </div>

          {error && <div className="whitespace-pre-line rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

          {selectableEmailRows.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={allVisibleEmailsSelected}
                  onChange={toggleAllVisibleEmails}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Selectează emailurile vizibile
              </label>
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                <span>{selectedVisibleEmailIds.length} selectate</span>
                <Button size="sm" variant="secondary" disabled={!selectedVisibleEmailIds.length || emailBulkLoading} loading={emailBulkLoading} onClick={() => bulkUpdateEmailStatus('read')}>Marchează citite</Button>
                <Button size="sm" variant="secondary" disabled={!selectedVisibleEmailIds.length || emailBulkLoading} loading={emailBulkLoading} onClick={() => bulkUpdateEmailStatus('unread')}>Marchează necitite</Button>
                <Button size="sm" variant="secondary" disabled={!selectedVisibleEmailIds.length || emailBulkLoading} loading={emailBulkLoading} onClick={() => bulkUpdateEmailStatus('archived')}>Arhivează</Button>
              </div>
            </div>
          ) : null}

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
              const selectable = email.direction !== 'draft'
              const selected = selectedEmailIds.some(id => String(id) === String(email.id))
              const focused = String(focusedEmailId || '') === String(email.id)
              return (
                <div
                  key={email.id}
                  id={`email-row-${email.id}`}
                  className={`border-b border-slate-100 p-4 last:border-b-0 hover:bg-slate-50 ${focused ? 'bg-blue-50 ring-2 ring-inset ring-blue-200' : ''}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    {selectable ? (
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleEmailSelection(email.id)}
                        className="mt-1 h-4 w-4 rounded border-slate-300"
                        aria-label={`Selectează email ${email.subject || email.id}`}
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                          {email.category_icon || '📥'} {email.category_label || email.category}
                        </span>
                        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${badge.cls}`}>{badge.label}</span>
                        {email.status === 'unread' ? <Badge tone="danger">necitit</Badge> : null}
                        {email.status === 'archived' ? <Badge>arhivat</Badge> : null}
                        {email.direction === 'draft' ? <Badge tone="warning">draft</Badge> : null}
                        {email.email_rule_applied ? (
                          <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                            🤖 regula: {email.email_rule_name || email.email_rule_id}
                          </span>
                        ) : null}
                        {email.has_attachments ? <span className="inline-flex items-center gap-1 text-xs text-blue-600"><Paperclip size={13} /> {email.attachments_count || 1}</span> : null}
                      </div>
                      <h3 className="mt-2 truncate text-sm font-semibold text-slate-900">{email.subject}</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {email.direction === 'draft' ? (
                          <>Draft către <strong>{email.to || '-'}</strong>{email.cc ? <> · CC {email.cc}</> : null}</>
                        ) : email.direction === 'outbound' ? (
                          <>
                            Către <strong>{email.to || '-'}</strong>
                            {email.cc ? <> · CC {email.cc}</> : null}
                            {email.from ? <> · de la {email.from}</> : null}
                          </>
                        ) : (
                          <>De la <strong>{email.from}</strong>{email.to ? <> către {email.to}</> : null}</>
                        )} · {formatDate(email.received_at)}
                      </p>
                      {email.preview ? <p className="mt-2 line-clamp-2 text-sm text-slate-600">{email.preview}</p> : null}
                      {email.source_label ? (
                        <div className="mt-2 rounded-md border border-emerald-100 bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                          Legat de: {email.source_label}
                        </div>
                      ) : null}
                      {Array.isArray(email.links) && email.links.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {email.links.map(link => (
                            <span key={link.id} className="inline-flex items-center gap-1 rounded-md border border-blue-100 bg-blue-50 px-2 py-1 text-xs text-blue-700">
                              🔗 {link.target_label}
                              {link.target_url ? (
                                <button type="button" className="font-semibold underline" onClick={() => { window.location.href = link.target_url }}>deschide</button>
                              ) : null}
                              <button type="button" className="text-blue-400 hover:text-rose-600" title="Anulează legătura" onClick={() => cancelEmailLink(email, link)}>×</button>
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {email.email_rule_applied ? (
                        <div className="mt-2 rounded-md border border-indigo-100 bg-indigo-50 px-2 py-1 text-xs text-indigo-700">
                          Sortat automat de regula „{email.email_rule_name || email.email_rule_id}”.
                        </div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-2">
                      {email.direction === 'draft' ? (
                        <Button size="sm" onClick={() => openDraftEmail(email)}>Editează draft</Button>
                      ) : (
                        <>
                          {email.status === 'unread' ? (
                            <Button size="sm" variant="secondary" onClick={() => updateEmailStatus(email, 'read')}>Marchează citit</Button>
                          ) : email.status === 'read' ? (
                            <Button size="sm" variant="secondary" onClick={() => updateEmailStatus(email, 'unread')}>Marchează necitit</Button>
                          ) : null}
                          <Button size="sm" variant="secondary" onClick={() => openReplyEmail(email)}>
                            <Reply size={14} /> Răspunde
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => openForwardEmail(email)}>
                            <Forward size={14} /> Forward
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => openLinkEmail(email)}>Leagă de...</Button>
                          <Button size="sm" onClick={() => openTaskFromEmail(email)}>Creează task</Button>
                          <Button size="sm" variant="secondary" onClick={() => openDocumentFromEmail(email)}>
                            <FileText size={14} /> Document
                          </Button>
                          {email.status === 'archived' ? (
                            <Button size="sm" variant="secondary" onClick={() => updateEmailStatus(email, 'read')}>Readuce în inbox</Button>
                          ) : (
                            <Button size="sm" variant="secondary" onClick={() => updateEmailStatus(email, 'archived')}>Arhivează</Button>
                          )}
                        </>
                      )}
                      {email.source_url ? (
                        <Button size="sm" variant="secondary" onClick={() => { window.location.href = email.source_url }}>Deschide sursa</Button>
                      ) : null}
                    </div>
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

      <Modal open={composeOpen} title={composeTitle} onClose={() => setComposeOpen(false)} size="lg">
        <form className="grid gap-4" onSubmit={sendComposeEmail}>
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
            Emailul se trimite prin SMTP-ul configurat în Setări și se salvează automat în `Trimise`.
            {composeForm.draft_id ? <span className="ml-1 font-semibold">Editezi draftul #{composeForm.draft_id}.</span> : null}
          </div>
          <Input
            label="Către"
            value={composeForm.to}
            onChange={event => setComposeForm(form => ({ ...form, to: event.target.value }))}
            placeholder="destinatar@firma.ro sau mai mulți separați prin virgulă"
            required
          />
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              label="CC (opțional)"
              value={composeForm.cc}
              onChange={event => setComposeForm(form => ({ ...form, cc: event.target.value }))}
              placeholder="copie@firma.ro"
            />
            <Input
              label="BCC (opțional)"
              value={composeForm.bcc}
              onChange={event => setComposeForm(form => ({ ...form, bcc: event.target.value }))}
              placeholder="copie-ascunsa@firma.ro"
            />
          </div>
          <Input
            label="Subiect"
            value={composeForm.subject}
            onChange={event => setComposeForm(form => ({ ...form, subject: event.target.value }))}
            required
          />
          <div className="grid gap-3 md:grid-cols-2">
            <Select
              label="Categorie"
              value={composeForm.category}
              onChange={event => setComposeForm(form => ({ ...form, category: event.target.value }))}
              options={(emailCategories.length ? emailCategories : [{ id: 'general', label: 'General', icon: '📥' }]).map(item => ({
                value: item.id,
                label: `${item.icon || '📥'} ${item.label || item.id}`,
              }))}
            />
            <Select
              label="Importanță"
              value={composeForm.importance}
              onChange={event => setComposeForm(form => ({ ...form, importance: event.target.value }))}
              options={[
                { value: 'low', label: 'Scăzută' },
                { value: 'normal', label: 'Normală' },
                { value: 'high', label: 'Importantă' },
                { value: 'urgent', label: 'Urgentă' },
              ]}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Mesaj</label>
            <textarea
              className="min-h-[180px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
              value={composeForm.body}
              onChange={event => setComposeForm(form => ({ ...form, body: event.target.value }))}
              placeholder="Scrie mesajul..."
              required
            />
          </div>
          <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800">
            Atașamentele se trimit prin SMTP și în registrul ERP se păstrează doar numele, dimensiunea și tipul fișierului.
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <label className="mb-2 block text-sm font-medium text-slate-700">Atașamente</label>
            <input
              type="file"
              multiple
              onChange={handleComposeFiles}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary-700 hover:file:bg-primary-100"
            />
            <p className="mt-2 text-xs text-slate-500">Maximum 5 fișiere, 2 MB/fișier și 5 MB total/email.</p>
            {composeForm.attachments.length ? (
              <div className="mt-3 grid gap-2">
                {composeForm.attachments.map((attachment, index) => (
                  <div key={`${attachment.name}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                    <span className="truncate text-slate-700">
                      <Paperclip size={13} className="mr-1 inline" />
                      {attachment.name} · {Math.ceil(Number(attachment.size || 0) / 1024)} KB
                    </span>
                    <Button type="button" size="sm" variant="secondary" onClick={() => removeComposeAttachment(index)}>Scoate</Button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          {composeError ? <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{composeError}</div> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setComposeOpen(false)}>Renunță</Button>
            <Button type="button" variant="secondary" loading={draftLoading} disabled={composeLoading} onClick={saveComposeDraft}>
              Salvează draft
            </Button>
            <Button type="submit" loading={composeLoading} disabled={!composeForm.to.trim() || !composeForm.subject.trim() || !composeForm.body.trim()}>
              <Send size={15} /> Trimite email
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(linkEmail)} title="Leagă emailul de ERP" onClose={() => setLinkEmail(null)}>
        <form className="grid gap-4" onSubmit={saveEmailLink}>
          {linkEmail ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="font-semibold text-slate-900">{linkEmail.subject || 'Email fără subiect'}</div>
              <div className="mt-1 text-xs text-slate-500">De la {linkEmail.from || '-'} · {linkEmail.category_label || linkEmail.category || 'General'}</div>
            </div>
          ) : null}
          {linkError ? <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{linkError}</div> : null}
          <Select
            label="Tip țintă"
            value={linkForm.target_type}
            onChange={event => updateLinkType(event.target.value)}
            options={[
              { value: 'contract', label: 'Contract' },
              { value: 'document', label: 'Document' },
              { value: 'task', label: 'Task' },
            ]}
          />
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <Input
              label="Caută țintă"
              value={linkForm.q}
              onChange={event => setLinkForm(form => ({ ...form, q: event.target.value }))}
              placeholder="număr, titlu, partener..."
            />
            <div className="flex items-end">
              <Button type="button" variant="secondary" onClick={() => loadEmailLinkTargets()} loading={linkLoading}>Caută</Button>
            </div>
          </div>
          <Select
            label="Țintă ERP"
            value={linkForm.target_id}
            onChange={event => setLinkForm(form => ({ ...form, target_id: event.target.value }))}
            options={linkTargets.length
              ? linkTargets.map(item => ({ value: item.target_id, label: item.target_label }))
              : [{ value: '', label: linkLoading ? 'Se încarcă...' : 'Nicio țintă găsită' }]}
          />
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-700">
            Legătura apare pe email și poate fi anulată ulterior. Înregistrarea rămâne în audit.
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setLinkEmail(null)}>Renunță</Button>
            <Button type="submit" loading={linkLoading} disabled={!linkForm.target_id}>Salvează legătura</Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(taskEmail)} title="Creează task din email" onClose={() => setTaskEmail(null)}>
        <form className="grid gap-4" onSubmit={createTaskFromEmail}>
          {taskEmail ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="font-semibold text-slate-900">{taskEmail.subject || 'Email fără subiect'}</div>
              <div className="mt-1 text-xs text-slate-500">De la {taskEmail.from || '-'} · {taskEmail.category_label || taskEmail.category || 'General'}</div>
            </div>
          ) : null}
          <Input
            label="Titlu task"
            value={taskForm.title}
            onChange={event => setTaskForm(form => ({ ...form, title: event.target.value }))}
            required
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Descriere</label>
            <textarea
              className="min-h-[120px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
              value={taskForm.description}
              onChange={event => setTaskForm(form => ({ ...form, description: event.target.value }))}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Select
              label="Responsabil"
              value={taskForm.assigned_to}
              onChange={event => setTaskForm(form => ({ ...form, assigned_to: event.target.value }))}
              options={taskUsers.map(item => ({ value: item.id, label: item.name || item.username || item.id }))}
            />
            <Select
              label="Prioritate"
              value={taskForm.priority}
              onChange={event => setTaskForm(form => ({ ...form, priority: event.target.value }))}
              options={[
                { value: 'low', label: 'Scăzută' },
                { value: 'normal', label: 'Normală' },
                { value: 'high', label: 'Importantă' },
                { value: 'urgent', label: 'Urgentă' },
              ]}
            />
            <Input
              label="Termen"
              type="date"
              value={taskForm.due_date}
              onChange={event => setTaskForm(form => ({ ...form, due_date: event.target.value }))}
            />
          </div>
          {taskError ? <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{taskError}</div> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setTaskEmail(null)}>Renunță</Button>
            <Button type="submit" loading={taskLoading} disabled={!taskForm.title.trim() || !taskForm.assigned_to}>Creează task</Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(documentEmail)} title="Creează document din email" onClose={() => setDocumentEmail(null)}>
        <form className="grid gap-4" onSubmit={createDocumentFromEmail}>
          {documentEmail ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="font-semibold text-slate-900">{documentEmail.subject || 'Email fără subiect'}</div>
              <div className="mt-1 text-xs text-slate-500">
                De la {documentEmail.from || '-'} · {documentEmail.category_label || documentEmail.category || 'General'}
              </div>
              {documentEmail.preview ? <p className="mt-2 line-clamp-3 text-xs text-slate-600">{documentEmail.preview}</p> : null}
            </div>
          ) : null}
          <Select
            label="Tip document"
            value={documentForm.tip_id}
            onChange={event => setDocumentForm(form => ({ ...form, tip_id: event.target.value }))}
            options={documentTemplates.length
              ? documentTemplates.map(item => ({ value: item.id, label: `${item.denumire || item.id}${item.template_format ? ` · ${String(item.template_format).toUpperCase()}` : ''}` }))
              : [{ value: '', label: 'Nu există tipuri de document disponibile' }]}
          />
          <Input
            label="Titlu document"
            value={documentForm.titlu}
            onChange={event => setDocumentForm(form => ({ ...form, titlu: event.target.value }))}
            required
          />
          <div className="grid gap-3 md:grid-cols-2">
            <Select
              label="Prioritate"
              value={documentForm.prioritate}
              onChange={event => setDocumentForm(form => ({ ...form, prioritate: event.target.value }))}
              options={[
                { value: 'normal', label: 'Normală' },
                { value: 'urgent', label: 'Urgentă' },
                { value: 'critic', label: 'Critică' },
              ]}
            />
            <Input
              label="Termen limită"
              type="date"
              value={documentForm.termen_limita}
              onChange={event => setDocumentForm(form => ({ ...form, termen_limita: event.target.value }))}
            />
          </div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-700">
            Documentul se creează ca draft în modulul Documente și păstrează automat sursa emailului, categoria, expeditorul și informația despre atașamente.
          </div>
          {documentError ? <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{documentError}</div> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setDocumentEmail(null)}>Renunță</Button>
            <Button type="submit" loading={documentLoading} disabled={!documentForm.tip_id || !documentForm.titlu.trim()}>
              Creează document
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
