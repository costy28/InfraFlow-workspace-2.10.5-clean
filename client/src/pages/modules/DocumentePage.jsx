import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Download, Eye, FileText, Mail, Star, UploadCloud, X } from 'lucide-react'
import api from '../../api/client'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import DropdownMenu from '../../components/ui/DropdownMenu'
import DocumentTemplateEditor from '../../components/forms/DocumentTemplateEditor'
import Modal from '../../components/ui/Modal'
import Table from '../../components/ui/Table'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { formatDate } from '../../utils/format'
import { useAuth } from '../../hooks/useAuth'

const tabs = ['Inbox', 'Ale mele', 'Toate', 'Template-uri']

function arrayFrom(data, keys) {
  if (Array.isArray(data)) return data
  for (const key of keys) if (Array.isArray(data?.[key])) return data[key]
  return []
}

function toneFor(value) {
  const text = String(value || '').toLowerCase()
  if (['critic', 'critica', 'urgent', 'respins'].includes(text)) return 'danger'
  if (['in_circuit', 'asteptare', 'urgent'].includes(text)) return 'warning'
  if (['aprobat', 'avizat', 'semnat'].includes(text)) return 'success'
  return 'neutral'
}

function label(value) {
  return String(value || '-').replaceAll('_', ' ')
}

function stepIcon(status) {
  if (['aprobat', 'avizat', 'semnat'].includes(status)) return '✅'
  if (status === 'respins') return '❌'
  return '⏳'
}

function workflowEvaluationTone(evaluation) {
  const status = String(evaluation?.status || '').toLowerCase()
  if (status === 'skipped') return 'neutral'
  if (status === 'missing') return 'warning'
  if (status === 'applies') return 'success'
  return 'info'
}

function workflowEvaluationLabel(evaluation) {
  const status = String(evaluation?.status || '').toLowerCase()
  if (status === 'skipped') return 'sărit de regulă'
  if (status === 'missing') return 'date lipsă'
  if (status === 'applies') return 'se aplică'
  if (status === 'unknown') return 'neclar'
  return 'evaluat'
}

function workflowRuleLabel(rule, fallback = '') {
  if (!rule || rule.field === 'always') return fallback || 'mereu'
  const fields = {
    estimated_value: 'valoare estimată',
    department: 'departament',
    priority: 'prioritate',
    country: 'țară',
    cost_center: 'centru cost',
    source: 'sursă',
  }
  return `${fields[rule.field] || rule.field} ${rule.operator || '='} ${rule.value ?? ''}`.trim()
}

function workflowScenarioSummary(scenario = {}) {
  const items = [
    ['Tip', scenario.document_type],
    ['Valoare', scenario.value],
    ['Departament', scenario.department],
    ['Prioritate', scenario.priority],
    ['Țară', scenario.country],
    ['Centru cost', scenario.cost_center],
    ['Sursă', scenario.source],
  ].filter(([, value]) => String(value ?? '').trim())
  return items
}

function auditMeta(entry = {}) {
  if (entry.meta && typeof entry.meta === 'object') return entry.meta
  if (entry.meta_json && typeof entry.meta_json === 'object') return entry.meta_json
  if (entry.meta_json && typeof entry.meta_json === 'string') {
    try {
      return JSON.parse(entry.meta_json)
    } catch {
      return {}
    }
  }
  return {}
}

function auditActionLabel(entry = {}) {
  const action = String(entry.actiune || '').toLowerCase()
  if (action === 'creat') return 'Document creat'
  if (action === 'submis') return 'Lansat în circuit'
  if (['aprobat', 'aprobare'].includes(action)) return 'Aprobare'
  if (['avizat', 'avizare'].includes(action)) return 'Avizare'
  if (['respins', 'respingere'].includes(action)) return 'Respingere'
  if (action === 'retras') return 'Retras'
  return label(action || 'eveniment')
}

function auditTone(entry = {}) {
  const action = String(entry.actiune || '').toLowerCase()
  if (['respins', 'respingere'].includes(action)) return 'danger'
  if (['aprobat', 'aprobare', 'avizat', 'avizare'].includes(action)) return 'success'
  if (['submis', 'retras'].includes(action)) return 'warning'
  return 'neutral'
}

function userId(user) {
  return user?.id || user?.userId || user?.username
}

function documentIsWatched(document, user) {
  if (!document) return false
  if (document.watched_by_me) return true
  const data = documentDataObject(document)
  const watchers = Array.isArray(data.watchers) ? data.watchers.map(String) : []
  return watchers.includes(String(userId(user)))
}

function documentTaskSourceId(document) {
  return document?.uuid || document?.id || document?.nr_document || ''
}

function documentSelectionKey(document) {
  return String(document?.uuid || document?.id || document?.nr_document || '')
}

function openDocumentTasksPage(document) {
  const documentId = documentTaskSourceId(document)
  const query = documentId ? `?source_type=document&source_id=${encodeURIComponent(String(documentId))}` : ''
  window.location.href = `/taskuri${query}`
}

function templateIdFromName(value) {
  return String(value || 'TPL')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24) || 'TPL'
}

const emptyTemplateForm = {
  id: '',
  denumire: '',
  categorie: 'Adeverință',
  tip_document: 'generic',
  template_format: 'html',
  descriere: '',
  template_html: '',
  activ: true,
}

const emptyDocumentForm = {
  tip_id: '',
  titlu: '',
  prioritate: 'normal',
  date_json_text: '{\n  "continut": "Text document"\n}',
  launch: false,
}

function variableLabel(value) {
  const labels = {
    'societate.nume': 'Societate',
    'societate.cui': 'CUI societate',
    'societate.adresa': 'Adresă societate',
    'document.numar': 'Număr document',
    'document.data': 'Data documentului',
    'document.titlu': 'Titlu document',
    'furnizor.denumire': 'Furnizor',
    'client.denumire': 'Client',
    'factura.numar': 'Număr factură',
    'factura.data': 'Data facturii',
    'factura.total': 'Total factură',
    'utilaj.cod': 'Cod utilaj',
    'utilaj.denumire': 'Denumire utilaj',
    'sofer.nume': 'Șofer / operator',
    continut: 'Conținut',
    total: 'Total',
    intocmit_de: 'Întocmit de',
  }
  return labels[value] || String(value || '').replaceAll('.', ' / ').replaceAll('_', ' ')
}

function sampleValueForVariable(value) {
  if (value.includes('data')) return new Date().toISOString().slice(0, 10)
  if (value.includes('total')) return '0,00 RON'
  if (value.includes('continut')) return 'Text document'
  if (value.includes('societate')) return ''
  return ''
}

function defaultFieldValues(variables = []) {
  return Object.fromEntries((variables || []).map(variable => [variable, sampleValueForVariable(variable)]))
}

function defaultJsonForTemplate(template) {
  const values = defaultFieldValues(template?.variables || [])
  if (Object.keys(values).length === 0) values.continut = 'Text document'
  return JSON.stringify(values, null, 2)
}

function documentDataObject(document) {
  return document?.date_json && typeof document.date_json === 'object'
    ? document.date_json
    : (() => {
        try {
          return JSON.parse(document?.date_json || '{}')
        } catch {
          return {}
        }
      })()
}

function emailSourceForDocument(document) {
  const data = documentDataObject(document)
  if (data?.source_type !== 'email') return null
  return {
    id: data.source_id || '',
    label: data.source_label || data.email_subject || 'Email ERP',
    url: data.source_url || '/mesaje',
    from: data.email_from || '',
    to: data.email_to || '',
    subject: data.email_subject || '',
    receivedAt: data.email_received_at || '',
    category: data.email_category_label || data.email_category || '',
    importance: data.email_importance || '',
    preview: data.email_preview || '',
    hasAttachments: Boolean(data.email_has_attachments),
    attachmentsCount: Number(data.email_attachments_count || 0),
    attachmentName: data.email_attachment_name || '',
    attachmentSize: Number(data.email_attachment_size || 0),
    attachmentType: data.email_attachment_type || '',
    attachmentDownloadUrl: data.email_attachment_download_url || '',
    attachmentDownloadAvailable: Boolean(data.email_attachment_download_available),
  }
}

function taskTone(status) {
  if (status === 'done') return 'success'
  if (status === 'cancelled') return 'neutral'
  if (status === 'blocked') return 'danger'
  if (status === 'in_progress') return 'warning'
  return 'info'
}

function workflowStepTitle(step = {}) {
  return step.workflow_name || step.name || step.tip || `Pas ${step.nr_pas || '?'}`
}

function workflowStepResponsible(step = {}) {
  return step.user_responsabil || step.rol_responsabil || step.workflow_actor_ref || '-'
}

function dueDateForWorkflowStep(step = {}) {
  const hours = Number(step.termen_ore || step.deadline_hours || 0)
  if (!Number.isFinite(hours) || hours <= 0) return ''
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function documentStatus(document) {
  return String(document?.status || '').toLowerCase()
}

function documentPriority(document) {
  return String(document?.prioritate || document?.priority || '').toLowerCase()
}

function documentDueDate(document) {
  const value = document?.termen_limita || document?.due_date || document?.deadline || ''
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function documentDueMeta(document) {
  const due = documentDueDate(document)
  if (!due) return { label: 'fără termen', tone: 'neutral', sort: 99 }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const day = new Date(due)
  day.setHours(0, 0, 0, 0)
  const diffDays = Math.round((day - today) / 86400000)
  if (diffDays < 0) return { label: `întârziat ${Math.abs(diffDays)}z`, tone: 'danger', sort: 0 }
  if (diffDays === 0) return { label: 'azi', tone: 'danger', sort: 1 }
  if (diffDays === 1) return { label: 'mâine', tone: 'warning', sort: 2 }
  if (diffDays <= 3) return { label: `${diffDays} zile`, tone: 'warning', sort: 3 + diffDays }
  return { label: formatDate(due), tone: 'neutral', sort: 20 + diffDays }
}

function documentAgeHours(document) {
  const value = document?.updated_at || document?.created_at || document?.createdAt
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 3600000))
}

function documentIsInCircuit(document) {
  return ['in_circuit', 'asteptare', 'in_asteptare'].includes(documentStatus(document))
}

function documentIsBlocked(document) {
  const hours = documentAgeHours(document)
  return documentIsInCircuit(document) && hours !== null && hours >= 48
}

function documentIsUrgent(document) {
  return ['urgent', 'critic', 'critica'].includes(documentPriority(document))
}

function documentIsDueSoon(document) {
  const due = documentDueMeta(document)
  return due.sort <= 6
}

const templateTypes = [
  ['generic', 'General'],
  ['referat', 'Referat'],
  ['comanda', 'Comandă'],
  ['factura', 'Factură'],
  ['contract', 'Contract'],
  ['proces_verbal', 'Proces verbal'],
  ['adeverinta', 'Adeverință'],
  ['faz', 'FAZ utilaj'],
  ['foaie_parcurs', 'Foaie parcurs'],
]

const wordTemplateVariables = [
  ['document.numar', 'Număr document'],
  ['document.data', 'Data documentului'],
  ['document.titlu', 'Titlu document'],
  ['societate.nume', 'Denumire societate'],
  ['societate.cui', 'CUI societate'],
  ['societate.adresa', 'Adresă societate'],
  ['continut', 'Conținut liber'],
  ['intocmit_de', 'Întocmit de'],
  ['angajat_nume', 'Angajat'],
  ['angajat_marca', 'Marcă angajat'],
  ['angajat_functie', 'Funcție angajat'],
  ['angajat_departament', 'Departament angajat'],
]

export default function DocumentePage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('Inbox')
  const [documents, setDocuments] = useState([])
  const [templates, setTemplates] = useState([])
  const [selected, setSelected] = useState(null)
  const [details, setDetails] = useState({ document: null, steps: [], audit: [] })
  const [documentHtml, setDocumentHtml] = useState('')
  const [documentHtmlLoading, setDocumentHtmlLoading] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [templateModal, setTemplateModal] = useState(false)
  const [templateEditing, setTemplateEditing] = useState(null)
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm)
  const [templateUploadFile, setTemplateUploadFile] = useState(null)
  const [templateAdvancedOpen, setTemplateAdvancedOpen] = useState(false)
  const [templatePreview, setTemplatePreview] = useState(null)
  const [documentModal, setDocumentModal] = useState(false)
  const [documentEditing, setDocumentEditing] = useState(null)
  const [documentForm, setDocumentForm] = useState(emptyDocumentForm)
  const [documentTemplates, setDocumentTemplates] = useState([])
  const [documentFieldValues, setDocumentFieldValues] = useState({})
  const [documentPreview, setDocumentPreview] = useState(null)
  const [documentPreviewVisible, setDocumentPreviewVisible] = useState(false)
  const [documentSaving, setDocumentSaving] = useState(false)
  const [taskUsers, setTaskUsers] = useState([])
  const [taskDocument, setTaskDocument] = useState(null)
  const [taskForm, setTaskForm] = useState({ title: '', description: '', assigned_to: '', priority: 'normal', due_date: '' })
  const [taskSaving, setTaskSaving] = useState(false)
  const [taskError, setTaskError] = useState('')
  const [bulkTaskOpen, setBulkTaskOpen] = useState(false)
  const [bulkTaskForm, setBulkTaskForm] = useState({ assigned_to: '', priority: 'normal', due_date: '', title_prefix: 'Urmărește documentul' })
  const [bulkTaskSaving, setBulkTaskSaving] = useState(false)
  const [bulkTaskError, setBulkTaskError] = useState('')
  const [selectedDocumentKeys, setSelectedDocumentKeys] = useState([])
  const [relatedTasks, setRelatedTasks] = useState([])
  const [relatedTasksLoading, setRelatedTasksLoading] = useState(false)
  const [relatedEmails, setRelatedEmails] = useState([])
  const [relatedEmailsLoading, setRelatedEmailsLoading] = useState(false)
  const [sourceAttachmentError, setSourceAttachmentError] = useState('')
  const [pendingDocumentParam, setPendingDocumentParam] = useState(() => new URLSearchParams(window.location.search).get('document') || '')
  const [templateSaving, setTemplateSaving] = useState(false)
  const [confirmAction, setConfirmAction] = useState(null)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [documentAssistantExpanded, setDocumentAssistantExpanded] = useState(false)
  const [documentQuickFilter, setDocumentQuickFilter] = useState('all')
  const userRoles = Array.from(new Set([...(Array.isArray(user?.roles) ? user.roles : []), user?.role].filter(Boolean).map(String)))
  const isAdmin = userRoles.some(role => ['superadmin', 'admin'].includes(role))
  const canEditDocument = useCallback(document => (
    document?.status === 'draft' && String(document.creat_de) === String(userId(user))
  ), [user])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      if (activeTab === 'Template-uri') {
        const response = await api.get('/documents/templates')
        setTemplates(arrayFrom(response.data, ['templates']))
        setDocuments([])
        return
      }
      const endpoint = activeTab === 'Inbox' ? '/documents/inbox' : '/documents'
      const response = await api.get(endpoint)
      const rows = arrayFrom(response.data, ['documents'])
      setDocuments(rows)
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut încărca documentele.')
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  useEffect(() => {
    Promise.resolve().then(() => load())
  }, [load])

  const baseVisibleDocuments = useMemo(() => {
    if (activeTab !== 'Ale mele') return documents
    const id = userId(user)
    return documents.filter(document => String(document.creat_de) === String(id))
  }, [activeTab, documents, user])

  const documentQuickFilters = useMemo(() => {
    const rows = baseVisibleDocuments || []
    return [
      { key: 'all', label: 'Toate', count: rows.length, predicate: () => true },
      { key: 'action', label: 'Cer acțiune', count: rows.filter(document => documentIsInCircuit(document) || documentStatus(document) === 'draft').length, predicate: document => documentIsInCircuit(document) || documentStatus(document) === 'draft' },
      { key: 'blocked', label: 'Blocate', count: rows.filter(documentIsBlocked).length, predicate: documentIsBlocked },
      { key: 'due', label: 'Scadente', count: rows.filter(documentIsDueSoon).length, predicate: documentIsDueSoon },
      { key: 'urgent', label: 'Urgente', count: rows.filter(documentIsUrgent).length, predicate: documentIsUrgent },
      { key: 'watched', label: 'Urmărite', count: rows.filter(document => documentIsWatched(document, user)).length, predicate: document => documentIsWatched(document, user) },
      { key: 'draft', label: 'Drafturi', count: rows.filter(document => documentStatus(document) === 'draft').length, predicate: document => documentStatus(document) === 'draft' },
      { key: 'email', label: 'Din email', count: rows.filter(document => Boolean(emailSourceForDocument(document))).length, predicate: document => Boolean(emailSourceForDocument(document)) },
    ]
  }, [baseVisibleDocuments, user])

  const visibleDocuments = useMemo(() => {
    if (activeTab === 'Template-uri') return baseVisibleDocuments
    const filter = documentQuickFilters.find(item => item.key === documentQuickFilter) || documentQuickFilters[0]
    return baseVisibleDocuments.filter(filter.predicate)
  }, [activeTab, baseVisibleDocuments, documentQuickFilter, documentQuickFilters])

  const selectedDocuments = useMemo(() => {
    const keys = new Set(selectedDocumentKeys)
    return baseVisibleDocuments.filter(document => keys.has(documentSelectionKey(document)))
  }, [baseVisibleDocuments, selectedDocumentKeys])

  const allVisibleSelected = visibleDocuments.length > 0 && visibleDocuments.every(document => selectedDocumentKeys.includes(documentSelectionKey(document)))

  useEffect(() => {
    const available = new Set(baseVisibleDocuments.map(documentSelectionKey))
    setSelectedDocumentKeys(keys => keys.filter(key => available.has(key)))
  }, [baseVisibleDocuments])

  useEffect(() => {
    if (activeTab === 'Template-uri' && documentQuickFilter !== 'all') {
      setDocumentQuickFilter('all')
    }
  }, [activeTab, documentQuickFilter])

  useEffect(() => {
    if (!pendingDocumentParam || loading || activeTab === 'Template-uri') return
    const target = baseVisibleDocuments.find(document =>
      String(document.uuid || '') === String(pendingDocumentParam) ||
      String(document.id || '') === String(pendingDocumentParam) ||
      String(document.nr_document || '') === String(pendingDocumentParam)
    )
    if (target) {
      setPendingDocumentParam('')
      setDocumentQuickFilter('all')
      Promise.resolve().then(() => openDetails(target))
      return
    }
    if (activeTab !== 'Toate') setActiveTab('Toate')
  }, [pendingDocumentParam, loading, activeTab, baseVisibleDocuments])

  async function openDetails(document) {
    setSelected(document)
    setError('')
    setDocumentHtml('')
    setRelatedTasks([])
    setRelatedEmails([])
    setDocumentHtmlLoading(true)
    setRelatedTasksLoading(true)
    setRelatedEmailsLoading(true)
    try {
      const response = await api.get(`/documents/${document.uuid}`)
      const currentDocument = response.data.document || document
      setDetails({
        document: currentDocument,
        steps: arrayFrom(response.data, ['steps']),
        audit: arrayFrom(response.data, ['audit']),
      })
      const documentId = documentTaskSourceId(currentDocument)
      const [htmlResponse, tasksResponse, emailsResponse] = await Promise.all([
        api.get(`/documents/${document.uuid}/pdf`, { responseType: 'text' }),
        documentId
          ? api.get('/tasks', { params: { source_type: 'document', source_id: String(documentId) } }).catch(() => ({ data: { tasks: [] } }))
          : Promise.resolve({ data: { tasks: [] } }),
        documentId
          ? api.get('/messaging/email/links', { params: { target_type: 'document', target_id: String(documentId) } }).catch(() => ({ data: { emails: [] } }))
          : Promise.resolve({ data: { emails: [] } }),
      ])
      setDocumentHtml(String(htmlResponse.data || ''))
      setRelatedTasks(arrayFrom(tasksResponse.data, ['tasks']))
      setRelatedEmails(arrayFrom(emailsResponse.data, ['emails']))
    } catch (err) {
      setDetails({ document, steps: [], audit: [] })
      setError(err.response?.data?.error || 'Nu am putut încărca detaliile documentului.')
    } finally {
      setDocumentHtmlLoading(false)
      setRelatedTasksLoading(false)
      setRelatedEmailsLoading(false)
    }
  }

  async function toggleWatchDocument(document) {
    if (!document?.uuid) return
    const nextWatched = !documentIsWatched(document, user)
    try {
      const response = await api.post(`/documents/${document.uuid}/watch`, { watched: nextWatched })
      const updated = response.data?.document || { ...document, watched_by_me: nextWatched }
      setDocuments(rows => rows.map(row => String(row.uuid) === String(document.uuid) ? { ...row, ...updated } : row))
      setSelected(current => current && String(current.uuid) === String(document.uuid) ? { ...current, ...updated } : current)
      setDetails(current => current.document && String(current.document.uuid) === String(document.uuid)
        ? { ...current, document: { ...current.document, ...updated } }
        : current)
    } catch (err) {
      setError(err.response?.data?.error || 'Documentul nu a putut fi actualizat ca urmărit.')
    }
  }

  function openDocumentHtml() {
    if (!documentHtml) return
    const blob = new Blob([documentHtml], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener,noreferrer')
    window.setTimeout(() => URL.revokeObjectURL(url), 30000)
  }

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

  async function openTaskFromDocument(document, options = {}) {
    setTaskDocument(document)
    setTaskError('')
    const rows = taskUsers.length ? taskUsers : await loadTaskUsers()
    const step = options.step || null
    const documentLabel = document.nr_document || document.titlu || document.uuid || document.id
    const priority = document.prioritate === 'critic' ? 'urgent' : (document.prioritate === 'urgent' ? 'high' : 'normal')
    setTaskForm({
      title: options.title || (step ? `Deblochează pasul ${step.nr_pas || ''} pentru ${documentLabel}` : `Verifică documentul ${documentLabel}`),
      description: [
        `Document: ${document.nr_document || '-'}`,
        document.titlu ? `Titlu: ${document.titlu}` : '',
        document.tip_id ? `Tip: ${document.tip_id}` : '',
        document.prioritate ? `Prioritate document: ${label(document.prioritate)}` : '',
        step ? `Pas circuit: ${step.nr_pas || '-'} · ${workflowStepTitle(step)}` : '',
        step ? `Responsabil pas: ${workflowStepResponsible(step)}` : '',
        options.reason ? `Motiv: ${options.reason}` : '',
        emailSourceForDocument(document) ? 'Sursă inițială: Email ERP' : '',
      ].filter(Boolean).join('\n'),
      assigned_to: options.assigned_to || step?.user_responsabil || userId(user) || rows[0]?.id || '',
      priority: options.priority || priority,
      due_date: options.due_date || (step ? dueDateForWorkflowStep(step) : ''),
    })
  }

  async function createTaskFromDocument(event) {
    event.preventDefault()
    if (!taskDocument) return
    setTaskSaving(true)
    setTaskError('')
    try {
      const documentId = documentTaskSourceId(taskDocument)
      await api.post('/tasks', {
        ...taskForm,
        source_type: 'document',
        source_id: String(documentId || ''),
        source_label: `${taskDocument.nr_document || 'Document'}${taskDocument.titlu ? ` · ${taskDocument.titlu}` : ''}`,
        source_url: documentId ? `/documente?document=${encodeURIComponent(String(documentId))}` : '/documente',
      })
      setTaskDocument(null)
      if (details.document && String(documentTaskSourceId(details.document)) === String(documentId || '')) {
        const tasksResponse = await api.get('/tasks', { params: { source_type: 'document', source_id: String(documentId) } }).catch(() => ({ data: { tasks: [] } }))
        setRelatedTasks(arrayFrom(tasksResponse.data, ['tasks']))
      }
    } catch (err) {
      setTaskError(err.response?.data?.error || 'Task-ul nu a putut fi creat din document.')
    } finally {
      setTaskSaving(false)
    }
  }

  function toggleDocumentSelection(document) {
    const key = documentSelectionKey(document)
    if (!key) return
    setSelectedDocumentKeys(keys => keys.includes(key) ? keys.filter(item => item !== key) : [...keys, key])
  }

  function toggleVisibleSelection() {
    const visibleKeys = visibleDocuments.map(documentSelectionKey).filter(Boolean)
    if (!visibleKeys.length) return
    if (visibleKeys.every(key => selectedDocumentKeys.includes(key))) {
      setSelectedDocumentKeys(keys => keys.filter(key => !visibleKeys.includes(key)))
    } else {
      setSelectedDocumentKeys(keys => Array.from(new Set([...keys, ...visibleKeys])))
    }
  }

  async function openBulkTaskModal() {
    setBulkTaskError('')
    const rows = taskUsers.length ? taskUsers : await loadTaskUsers()
    const urgent = selectedDocuments.some(document => documentIsUrgent(document) || documentIsBlocked(document))
    setBulkTaskForm(form => ({
      ...form,
      assigned_to: form.assigned_to || userId(user) || rows[0]?.id || '',
      priority: urgent ? 'urgent' : 'normal',
    }))
    setBulkTaskOpen(true)
  }

  async function createBulkTasks(event) {
    event.preventDefault()
    if (!selectedDocuments.length) return
    setBulkTaskSaving(true)
    setBulkTaskError('')
    try {
      await Promise.all(selectedDocuments.map(document => {
        const documentId = documentTaskSourceId(document)
        return api.post('/tasks', {
          title: `${bulkTaskForm.title_prefix || 'Urmărește documentul'} ${document.nr_document || document.titlu || documentId}`,
          description: [
            `Document: ${document.nr_document || '-'}`,
            document.titlu ? `Titlu: ${document.titlu}` : '',
            document.tip_id ? `Tip: ${document.tip_id}` : '',
            document.status ? `Status: ${label(document.status)}` : '',
            document.prioritate ? `Prioritate document: ${label(document.prioritate)}` : '',
            `Creat din acțiune în masă Documente (${selectedDocuments.length} documente selectate).`,
          ].filter(Boolean).join('\n'),
          assigned_to: bulkTaskForm.assigned_to,
          priority: bulkTaskForm.priority,
          due_date: bulkTaskForm.due_date,
          source_type: 'document',
          source_id: String(documentId || ''),
          source_label: `${document.nr_document || 'Document'}${document.titlu ? ` · ${document.titlu}` : ''}`,
          source_url: documentId ? `/documente?document=${encodeURIComponent(String(documentId))}` : '/documente',
        })
      }))
      setBulkTaskOpen(false)
      setSelectedDocumentKeys([])
      if (details.document) {
        const documentId = documentTaskSourceId(details.document)
        const tasksResponse = await api.get('/tasks', { params: { source_type: 'document', source_id: String(documentId) } }).catch(() => ({ data: { tasks: [] } }))
        setRelatedTasks(arrayFrom(tasksResponse.data, ['tasks']))
      }
    } catch (err) {
      setBulkTaskError(err.response?.data?.error || 'Task-urile nu au putut fi create pentru documentele selectate.')
    } finally {
      setBulkTaskSaving(false)
    }
  }

  function exportSelectedDocumentsCsv() {
    const rows = selectedDocuments.length ? selectedDocuments : visibleDocuments
    if (!rows.length) return
    const headers = ['nr_document', 'titlu', 'tip', 'status', 'prioritate', 'termen', 'actualizat_la', 'sursa']
    const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`
    const lines = [
      headers.join(','),
      ...rows.map(document => [
        document.nr_document || '',
        document.titlu || '',
        document.tip_id || '',
        label(document.status),
        label(document.prioritate),
        document.termen_limita || '',
        document.updated_at || document.created_at || '',
        emailSourceForDocument(document) ? 'Email ERP' : '',
      ].map(escape).join(',')),
    ]
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `Documente_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  async function processDocument(action) {
    if (!selected) return
    setError('')
    try {
      await api.post(`/documents/${selected.uuid}/${action}`, { comentariu: comment, comment })
      setConfirm(null)
      setComment('')
      await load()
      await openDetails(selected)
    } catch (err) {
      setError(err.response?.data?.error || 'Acțiunea nu a putut fi aplicată.')
    }
  }

  function openTemplateModal(template = null) {
    setTemplateEditing(template)
    setTemplateForm(template ? {
      id: template.id || '',
      denumire: template.denumire || '',
      categorie: template.categorie || 'Adeverință',
      tip_document: template.tip_document || 'generic',
      template_format: template.template_format || 'html',
      descriere: template.descriere || '',
      template_html: template.template_html || '',
      activ: template.activ !== false,
    } : emptyTemplateForm)
    setTemplateUploadFile(null)
    setTemplateAdvancedOpen(Boolean(template?.template_html && !template?.fisier_model_name))
    setTemplateModal(true)
  }

  async function launchSelectedDocument() {
    if (!details.document?.uuid) return
    setError('')
    try {
      await api.post(`/documents/${details.document.uuid}/launch`, {})
      await load()
      await openDetails(details.document)
    } catch (err) {
      setError(err.response?.data?.error || 'Documentul nu a putut fi lansat în circuit.')
    }
  }

  async function loadDocumentTemplates() {
    const response = await api.get('/documents/template-catalog')
    const rows = arrayFrom(response.data, ['templates'])
    setDocumentTemplates(rows)
    return rows
  }

  async function openDocumentModal() {
    setError('')
    try {
      const rows = await loadDocumentTemplates()
      const first = rows[0]
      const fieldValues = defaultFieldValues(first?.variables || [])
      setDocumentEditing(null)
      setDocumentForm({
        ...emptyDocumentForm,
        tip_id: first?.id || '',
        titlu: first?.denumire || '',
        date_json_text: first ? defaultJsonForTemplate(first) : emptyDocumentForm.date_json_text,
      })
      setDocumentFieldValues(fieldValues)
      setDocumentPreview(null)
      setDocumentPreviewVisible(false)
      setDocumentModal(true)
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut încărca template-urile disponibile.')
    }
  }

  async function openDocumentEdit(document) {
    setError('')
    try {
      if (!canEditDocument(document)) {
        setError('Documentul poate fi editat doar cat timp este draft si doar de initiator.')
        return
      }
      const rows = await loadDocumentTemplates()
      const template = rows.find(item => item.id === document.tip_id)
      const data = documentDataObject(document)
      const fieldValues = Object.fromEntries((template?.variables || []).map(variable => [
        variable,
        data[variable] ?? sampleValueForVariable(variable)
      ]))
      setDocumentEditing(document)
      setDocumentForm({
        ...emptyDocumentForm,
        tip_id: document.tip_id || '',
        titlu: document.titlu || '',
        prioritate: document.prioritate || 'normal',
        date_json_text: JSON.stringify(data, null, 2),
        launch: false,
      })
      setDocumentFieldValues(fieldValues)
      setDocumentPreview(null)
      setDocumentPreviewVisible(false)
      setDocumentModal(true)
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut pregati documentul pentru editare.')
    }
  }

  function parseDocumentData() {
    try {
      return { ...JSON.parse(documentForm.date_json_text || '{}'), ...documentFieldValues }
    } catch {
      throw new Error('Datele documentului trebuie să fie JSON valid.')
    }
  }

  async function previewNewDocument() {
    setError('')
    try {
      if (!documentForm.tip_id) throw new Error('Alege un template.')
      const response = await api.post(`/documents/templates/${documentForm.tip_id}/preview`, { data: parseDocumentData() })
      setDocumentPreview(response.data?.html || '')
      setDocumentPreviewVisible(true)
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Previzualizarea nu a putut fi generată.')
    }
  }

  const selectedDocumentTemplate = documentTemplates.find(template => template.id === documentForm.tip_id)

  async function saveNewDocument(event) {
    event.preventDefault()
    setError('')
    setDocumentSaving(true)
    try {
      const payload = {
        tip_id: documentForm.tip_id,
        titlu: documentForm.titlu,
        prioritate: documentForm.prioritate,
        date_json: parseDocumentData(),
      }
      const response = documentEditing?.uuid
        ? await api.patch(`/documents/${documentEditing.uuid}`, payload)
        : await api.post('/documents', payload)
      const document = response.data?.document
      if (documentForm.launch && document?.uuid) {
        await api.post(`/documents/${document.uuid}/launch`, {})
      }
      setDocumentModal(false)
      setDocumentEditing(null)
      setDocumentForm(emptyDocumentForm)
      setDocumentPreview(null)
      setDocumentPreviewVisible(false)
      await load()
      if (document?.uuid) await openDetails(document)
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Documentul nu a putut fi creat.')
    } finally {
      setDocumentSaving(false)
    }
  }

  async function saveTemplate(event) {
    event.preventDefault()
    setError('')
    setTemplateSaving(true)
    try {
      const payload = {
        ...templateForm,
        id: templateForm.id || templateIdFromName(templateForm.denumire),
        serie_prefix: templateForm.id || templateIdFromName(templateForm.denumire),
      }
      const response = templateEditing
        ? await api.put(`/documents/templates/${templateEditing.id}`, payload)
        : await api.post('/documents/templates', payload)
      const saved = response.data?.template || payload
      if (templateUploadFile) {
        const formData = new FormData()
        formData.append('file', templateUploadFile)
        await api.post(`/documents/templates/${saved.id}/upload-model`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }
      setTemplateModal(false)
      setTemplateEditing(null)
      setTemplateForm(emptyTemplateForm)
      setTemplateUploadFile(null)
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Template-ul nu a putut fi salvat.')
    } finally {
      setTemplateSaving(false)
    }
  }

  async function deleteTemplate(template) {
    setConfirmAction({
      title: 'Dezactivează template',
      message: `Dezactivezi template-ul ${template.denumire || template.id}?`,
      details: 'Template-ul nu va mai fi folosit pentru documente noi. Documentele generate anterior rămân păstrate.',
      confirmLabel: 'Dezactivează',
      tone: 'warning',
      run: () => deleteTemplateRequest(template),
      errorMessage: 'Template-ul nu a putut fi dezactivat.',
    })
  }

  async function deleteTemplateRequest(template) {
    try {
      await api.delete(`/documents/templates/${template.id}`)
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Template-ul nu a putut fi dezactivat.')
    }
  }

  async function runConfirmAction(reason) {
    if (!confirmAction?.run) return
    try {
      setConfirmLoading(true)
      setError('')
      await confirmAction.run(reason)
      setConfirmAction(null)
    } catch (err) {
      setError(err.response?.data?.error || confirmAction.errorMessage || 'Acțiunea nu a putut fi executată.')
    } finally {
      setConfirmLoading(false)
    }
  }

  async function previewTemplate(template) {
    setError('')
    try {
      const response = await api.post(`/documents/templates/${template.id}/preview`, {
        data: {
          furnizor: { denumire: 'Furnizor exemplu SRL' },
          client: { denumire: 'Client exemplu SA' },
          total: '1.250,00 RON',
          continut: 'Text demonstrativ generat pentru verificarea modelului.',
          utilaj: { cod: 'IF-UTIL-01', denumire: 'Buldoexcavator' },
          sofer_nume: 'Operator demo',
        },
      })
      setTemplatePreview({ template, html: response.data?.html || '' })
    } catch (err) {
      setError(err.response?.data?.error || 'Previzualizarea nu a putut fi generată.')
    }
  }

  function downloadTemplate(template) {
    window.open(`/api/documents/templates/${template.id}/download-model`, '_blank')
  }

  async function downloadSourceAttachment(source) {
    if (!source?.attachmentDownloadAvailable || !source?.attachmentDownloadUrl) return
    try {
      setSourceAttachmentError('')
      const endpoint = String(source.attachmentDownloadUrl).replace(/^\/api(?=\/)/, '')
      const response = await api.get(endpoint, { responseType: 'blob' })
      const blob = new Blob([response.data], {
        type: response.headers?.['content-type'] || source.attachmentType || 'application/octet-stream',
      })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = source.attachmentName || 'atasament-email'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setSourceAttachmentError(err.response?.data?.error || 'Atașamentul sursă nu a putut fi descărcat.')
    }
  }

  const selectedWaitingStep = details.steps.find(step => String(step.status || '').toLowerCase() === 'asteptare') || null
  const currentUserStep = details.steps.find(step =>
    step.status === 'asteptare' && String(step.user_responsabil) === String(userId(user))
  )
  const selectedOpenTasks = relatedTasks.filter(task => !['done', 'cancelled'].includes(String(task.status || '').toLowerCase()))
  const selectedEmailSource = emailSourceForDocument(details.document)
  const selectedWorkflowSnapshot = documentDataObject(details.document)?.workflow_snapshot || null

  const documentAssistant = useMemo(() => {
    const currentRows = visibleDocuments || []
    const selectedDocument = details.document
    const inboxCount = activeTab === 'Inbox' ? currentRows.length : null
    const templateCount = activeTab === 'Template-uri' ? templates.length : null
    const draftCount = currentRows.filter(item => String(item.status || '').toLowerCase() === 'draft').length
    const flowCount = currentRows.filter(item => ['in_circuit', 'asteptare', 'in_asteptare'].includes(String(item.status || '').toLowerCase())).length
    const urgentCount = currentRows.filter(item => ['urgent', 'critic', 'critica'].includes(String(item.prioritate || item.priority || '').toLowerCase())).length
    const rejectedCount = currentRows.filter(item => String(item.status || '').toLowerCase() === 'respins').length
    const emailCount = currentRows.filter(item => emailSourceForDocument(item)).length
    const watchedCount = currentRows.filter(item => documentIsWatched(item, user)).length
    const selectedOpenTasks = relatedTasks.filter(task => !['done', 'cancelled'].includes(String(task.status || '').toLowerCase())).length
    const selectedWaitingSteps = details.steps.filter(step => String(step.status || '').toLowerCase() === 'asteptare').length

    const openFirst = (predicate, fallbackTab = activeTab) => () => {
      const target = currentRows.find(predicate)
      if (target) openDetails(target)
      else setActiveTab(fallbackTab)
    }

    const cards = [
      {
        key: 'inbox',
        label: 'Inbox',
        value: inboxCount === null ? 'vezi' : inboxCount,
        hint: inboxCount === null ? 'documente primite spre avizare' : (inboxCount ? 'așteaptă acțiune' : 'nimic în așteptare'),
        tone: inboxCount && inboxCount > 0 ? 'warning' : 'success',
        action: () => setActiveTab('Inbox'),
      },
      {
        key: 'urgent',
        label: 'Urgente',
        value: urgentCount,
        hint: urgentCount ? 'prioritate mare' : 'fără urgențe în listă',
        tone: urgentCount ? 'danger' : 'success',
        action: urgentCount ? openFirst(item => ['urgent', 'critic', 'critica'].includes(String(item.prioritate || item.priority || '').toLowerCase())) : () => setActiveTab('Toate'),
      },
      {
        key: 'draft',
        label: 'Drafturi',
        value: draftCount,
        hint: draftCount ? 'de finalizat/lansat' : 'drafturi curate',
        tone: draftCount ? 'warning' : 'success',
        action: draftCount ? openFirst(item => String(item.status || '').toLowerCase() === 'draft', 'Ale mele') : () => setActiveTab('Ale mele'),
      },
      {
        key: 'email',
        label: 'Email sursă',
        value: emailCount,
        hint: emailCount ? 'documente venite din email' : 'nimic legat în lista curentă',
        tone: emailCount ? 'info' : 'neutral',
        action: emailCount ? openFirst(item => emailSourceForDocument(item)) : () => setActiveTab('Toate'),
      },
      {
        key: 'watched',
        label: 'Urmărite',
        value: watchedCount,
        hint: watchedCount ? 'sub radarul tău' : 'nimic urmărit în listă',
        tone: watchedCount ? 'info' : 'neutral',
        action: watchedCount ? openFirst(item => documentIsWatched(item, user)) : () => setDocumentQuickFilter('watched'),
      },
      {
        key: 'templates',
        label: 'Template-uri',
        value: templateCount === null ? 'vezi' : templateCount,
        hint: templateCount === 0 ? 'lipsește modelul de pornire' : 'modele Word/HTML',
        tone: templateCount === 0 ? 'warning' : 'neutral',
        action: () => setActiveTab('Template-uri'),
      },
    ]

    const steps = [
      {
        key: 'approval',
        label: currentUserStep ? 'Ai un pas de aprobare pe documentul curent' : (inboxCount ? `Inbox aprobare (${inboxCount})` : 'Inbox aprobare verificat'),
        hint: currentUserStep ? 'Poți aproba sau respinge documentul selectat.' : 'Documentele primite spre avizare sunt primul blocaj de închis.',
        done: !currentUserStep && inboxCount === 0,
        action: currentUserStep ? () => setConfirm('approve') : () => setActiveTab('Inbox'),
      },
      {
        key: 'flow',
        label: selectedDocument ? `Circuit curent: ${selectedWaitingSteps} pași în așteptare` : `Documente în circuit: ${flowCount}`,
        hint: selectedDocument ? 'Urmărește cine trebuie să avizeze documentul selectat.' : 'Documentele în circuit au nevoie de trasabilitate și eventual task-uri.',
        done: selectedDocument ? selectedWaitingSteps === 0 : flowCount === 0,
        action: selectedDocument ? undefined : (flowCount ? openFirst(item => ['in_circuit', 'asteptare', 'in_asteptare'].includes(String(item.status || '').toLowerCase())) : () => setActiveTab('Toate')),
      },
      {
        key: 'tasks',
        label: selectedDocument ? `Task-uri pe document: ${selectedOpenTasks}` : 'Creează task din document când apare blocaj',
        hint: selectedDocument ? 'Task-urile legate țin responsabilul și termenul lângă document.' : 'Din orice document poți crea o sarcină urmărită în Task-uri.',
        done: selectedDocument ? selectedOpenTasks > 0 : false,
        action: selectedDocument ? () => openTaskFromDocument(selectedDocument) : undefined,
      },
      {
        key: 'templates',
        label: templateCount === null ? 'Verifică template-urile' : `Template-uri disponibile: ${templateCount}`,
        hint: 'Modelele Word sunt recomandate pentru utilizatori reali; HTML rămâne compatibilitate.',
        done: templateCount !== 0,
        action: () => setActiveTab('Template-uri'),
      },
    ]

    let primary
    if (currentUserStep) {
      primary = {
        tone: 'warning',
        title: 'Ai un document selectat care îți cere aprobare.',
        description: 'Comentariul rămâne disponibil înainte de decizie; dacă documentul e corect, îl poți aproba direct.',
        label: 'Aprobă documentul',
        onClick: () => setConfirm('approve'),
      }
    } else if (inboxCount && inboxCount > 0) {
      primary = {
        tone: 'warning',
        title: `Inbox documente: ${inboxCount} elemente de verificat.`,
        description: 'Închide întâi documentele primite spre avizare, apoi lucrează pe documente noi sau template-uri.',
        label: 'Deschide Inbox',
        onClick: () => setActiveTab('Inbox'),
      }
    } else if (urgentCount > 0) {
      primary = {
        tone: 'danger',
        title: `Există ${urgentCount} documente cu prioritate mare în lista curentă.`,
        description: 'Deschide primul document urgent și decide dacă are nevoie de aprobare, task sau clarificare.',
        label: 'Vezi urgentul',
        onClick: openFirst(item => ['urgent', 'critic', 'critica'].includes(String(item.prioritate || item.priority || '').toLowerCase())),
      }
    } else if (draftCount > 0) {
      primary = {
        tone: 'warning',
        title: `Ai ${draftCount} documente draft de finalizat.`,
        description: 'Un draft neterminat nu intră în circuit și poate rămâne invizibil pentru restul echipei.',
        label: 'Vezi draft',
        onClick: openFirst(item => String(item.status || '').toLowerCase() === 'draft', 'Ale mele'),
      }
    } else if (templateCount === 0) {
      primary = {
        tone: 'warning',
        title: 'Nu există încă template-uri disponibile.',
        description: 'Pentru lucru comercial real, template-urile Word trebuie să fie punctul de pornire.',
        label: 'Deschide Template-uri',
        onClick: () => setActiveTab('Template-uri'),
      }
    } else {
      primary = {
        tone: 'success',
        title: 'Documentele arată ordonat în contextul curent.',
        description: 'Poți crea un document nou, verifica legăturile cu emailuri/taskuri sau întreține template-urile.',
        label: 'Document nou',
        onClick: openDocumentModal,
      }
    }

    return {
      cards,
      steps,
      primary,
      tone: primary.tone === 'danger' ? 'danger' : (primary.tone === 'warning' ? 'warning' : 'success'),
      summary: selectedDocument
        ? 'Pentru documentul selectat vezi într-un loc circuitul, emailurile sursă și task-urile legate.'
        : 'Prioritizez Inbox-ul, urgențele, drafturile și template-urile ca să nu pierzi firul documentelor.',
      rejectedCount,
    }
  }, [
    activeTab,
    currentUserStep,
    details.document,
    details.steps,
    relatedTasks,
    templates.length,
    user,
    visibleDocuments,
  ])

  const documentSimpleFlow = useMemo(() => {
    const currentRows = visibleDocuments || []
    const selectedDocument = details.document
    const incomingCount = currentRows.filter(item =>
      activeTab === 'Inbox' ||
      emailSourceForDocument(item) ||
      ['inbox', 'primit', 'in_circuit', 'asteptare', 'in_asteptare'].includes(String(item.status || '').toLowerCase())
    ).length
    const draftCount = currentRows.filter(item => String(item.status || '').toLowerCase() === 'draft').length
    const flowCount = currentRows.filter(item => ['in_circuit', 'asteptare', 'in_asteptare'].includes(String(item.status || '').toLowerCase())).length
    const approvedCount = currentRows.filter(item => ['aprobat', 'avizat', 'semnat', 'finalizat'].includes(String(item.status || '').toLowerCase())).length
    const linkedEmailCount = currentRows.filter(item => emailSourceForDocument(item)).length
    const selectedOpenTasks = relatedTasks.filter(task => !['done', 'cancelled'].includes(String(task.status || '').toLowerCase())).length

    const openFirstDocument = (predicate, fallbackTab = 'Toate') => {
      const target = currentRows.find(predicate)
      if (target) openDetails(target)
      else setActiveTab(fallbackTab)
    }

    const steps = [
      {
        key: 'incoming',
        icon: '📥',
        title: 'Intrare',
        value: incomingCount,
        done: incomingCount === 0,
        hint: incomingCount ? 'documente care trebuie verificate sau preluate' : 'nu sunt intrări noi în filtrul curent',
        action: () => setActiveTab('Inbox'),
        cta: 'Vezi Inbox',
      },
      {
        key: 'classify',
        icon: '🏷️',
        title: 'Clasificare',
        value: templates.length,
        done: templates.length > 0 && draftCount === 0,
        hint: draftCount ? `${draftCount} drafturi de completat / lansat` : 'template-uri pregătite pentru documente noi',
        action: draftCount
          ? () => openFirstDocument(item => String(item.status || '').toLowerCase() === 'draft', 'Ale mele')
          : () => setActiveTab('Template-uri'),
        cta: draftCount ? 'Vezi draft' : 'Template-uri',
      },
      {
        key: 'flow',
        icon: '✅',
        title: 'Circuit',
        value: flowCount,
        done: flowCount === 0 && !currentUserStep,
        hint: currentUserStep ? 'ai un pas de aprobare pe documentul selectat' : (flowCount ? 'documente aflate în aprobare' : 'nu există circuit blocat'),
        action: currentUserStep
          ? () => setConfirm('approve')
          : () => openFirstDocument(item => ['in_circuit', 'asteptare', 'in_asteptare'].includes(String(item.status || '').toLowerCase())),
        cta: currentUserStep ? 'Aprobă' : 'Vezi circuit',
      },
      {
        key: 'links',
        icon: '🔗',
        title: 'Legături',
        value: selectedDocument ? selectedOpenTasks : linkedEmailCount,
        done: selectedDocument ? selectedOpenTasks > 0 : linkedEmailCount > 0,
        hint: selectedDocument ? 'task-uri legate de documentul selectat' : 'documente venite din email în filtrul curent',
        action: selectedDocument ? () => openTaskFromDocument(selectedDocument) : () => openFirstDocument(item => emailSourceForDocument(item)),
        cta: selectedDocument ? 'Task document' : 'Vezi email',
      },
      {
        key: 'archive',
        icon: '🗄️',
        title: 'Arhivare',
        value: approvedCount,
        done: approvedCount > 0,
        hint: approvedCount ? 'documente finalizate / aprobate în filtrul curent' : 'finalizarea devine dosar auditabil',
        action: () => setActiveTab('Toate'),
        cta: 'Vezi toate',
      },
    ]

    const nextStep = steps.find(step => !step.done) || steps[steps.length - 1]
    return { steps, nextStep }
  }, [
    activeTab,
    currentUserStep,
    details.document,
    relatedTasks,
    templates.length,
    visibleDocuments,
  ])

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Documente</h1>
          <p className="text-sm text-slate-600">Circuit electronic, aprobări și template-uri de documente.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button className="w-full sm:w-auto" onClick={openDocumentModal}>+ Document nou</Button>
          <DropdownMenu className="w-full sm:w-auto" align="right" label="Actiuni" items={[
            { label: 'Reincarca', onClick: load },
            isAdmin ? { label: 'Template nou', onClick: () => openTemplateModal() } : null,
          ]} />
        </div>
      </div>

      {error && <Card className="border-rose-200 bg-rose-50 text-sm text-rose-700">{error}</Card>}

      <Card
        title="Asistent documente"
        subtitle="Ține la vedere Inbox-ul, urgențele, drafturile, template-urile și legăturile cu email/task."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={documentAssistant.tone}>{documentAssistant.tone === 'danger' ? 'intervenție' : documentAssistant.tone === 'warning' ? 'atenție' : 'sub control'}</Badge>
            <Button size="sm" variant="secondary" onClick={() => setDocumentAssistantExpanded(value => !value)}>
              {documentAssistantExpanded ? 'Ascunde detalii' : 'Vezi detalii'}
            </Button>
          </div>
        }
      >
        <div className="grid gap-3">
          <div className={`rounded-2xl border p-4 ${documentAssistant.tone === 'danger' ? 'border-rose-200 bg-rose-50' : documentAssistant.tone === 'warning' ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={documentAssistant.primary.tone}>următorul pas</Badge>
                  <div className="font-semibold text-slate-900">{documentAssistant.primary.title}</div>
                </div>
                <p className="mt-2 text-sm text-slate-700">{documentAssistant.primary.description}</p>
                <p className="mt-1 text-xs text-slate-500">{documentAssistant.summary}</p>
              </div>
              <Button size="sm" variant={documentAssistant.primary.tone === 'danger' ? 'primary' : 'secondary'} onClick={documentAssistant.primary.onClick}>
                {documentAssistant.primary.label}
              </Button>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {documentAssistant.cards.map(item => (
              <button
                key={item.key}
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-primary-300 hover:bg-primary-50"
                onClick={item.action}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase text-slate-500">{item.label}</span>
                  <Badge tone={item.tone}>{item.value}</Badge>
                </div>
                <div className="mt-1 text-xs text-slate-500">{item.hint}</div>
              </button>
            ))}
          </div>

          {documentAssistantExpanded ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="grid gap-2">
                {documentAssistant.steps.map(step => (
                  <button
                    key={step.key}
                    type="button"
                    disabled={!step.action}
                    onClick={step.action}
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${step.done ? 'border-primary-100 bg-primary-50 text-primary-800' : 'border-slate-200 bg-white text-slate-700'} hover:border-primary-200 hover:bg-white disabled:cursor-default disabled:opacity-70`}
                  >
                    <span className="mt-0.5">{step.done ? '✓' : '○'}</span>
                    <span>
                      <span className="block font-medium">{step.label}</span>
                      <span className="block text-xs text-slate-500">{step.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">De reținut</div>
                <ul className="grid gap-2 text-sm text-slate-700">
                  <li>Template-urile Word sunt fluxul recomandat pentru utilizatori reali; HTML rămâne compatibilitate.</li>
                  <li>Documentele lansate în circuit păstrează pașii, istoricul și deciziile de aprobare.</li>
                  <li>Un document poate deveni rapid task sau poate păstra legătura cu emailul din care a pornit.</li>
                </ul>
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      <Card
        title="Flux simplu Documente"
        subtitle="Intrare → clasificare → circuit → legături → arhivare. Utilizatorul vede ordinea firească, nu trebuie să ghicească tabul corect."
        actions={<Badge tone={documentSimpleFlow.nextStep.done ? 'success' : 'warning'}>următorul pas: {documentSimpleFlow.nextStep.title}</Badge>}
      >
        <div className="grid gap-3 lg:grid-cols-5">
          {documentSimpleFlow.steps.map((step, index) => (
            <button
              key={step.key}
              type="button"
              onClick={step.action}
              className={`rounded-2xl border p-3 text-left transition hover:border-primary-300 hover:bg-primary-50 ${step.done ? 'border-emerald-100 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{String(index + 1).padStart(2, '0')}</div>
                  <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <span>{step.icon}</span>
                    <span>{step.title}</span>
                  </div>
                </div>
                <Badge tone={step.done ? 'success' : 'warning'}>{step.value}</Badge>
              </div>
              <p className="min-h-[2.5rem] text-xs text-slate-600">{step.hint}</p>
              <div className="mt-3 text-xs font-semibold text-primary-700">{step.cta}</div>
            </button>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        {tabs.map(tab => (
          <Button key={tab} variant={activeTab === tab ? 'primary' : 'secondary'} onClick={() => setActiveTab(tab)}>
            {tab}
          </Button>
        ))}
      </div>

      {activeTab !== 'Template-uri' ? (
        <Card className="border-slate-200 bg-white">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">Filtre rapide documente</div>
              <div className="text-xs text-slate-500">
                Arată doar ce ai nevoie acum: blocaje, scadențe, urgențe, drafturi sau documente venite din email.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {documentQuickFilters.map(filter => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setDocumentQuickFilter(filter.key)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                    documentQuickFilter === filter.key
                      ? 'border-primary-700 bg-primary-700 text-white shadow-sm'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-primary-200 hover:bg-primary-50'
                  }`}
                >
                  <span>{filter.label}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${
                    documentQuickFilter === filter.key
                      ? 'bg-white/20 text-white'
                      : filter.count
                        ? 'bg-primary-100 text-primary-800'
                        : 'bg-slate-200 text-slate-500'
                  }`}>
                    {filter.count}
                  </span>
                </button>
              ))}
            </div>
          </div>
          {documentQuickFilter !== 'all' ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary-100 bg-primary-50 px-3 py-2 text-sm text-primary-800">
              <span>
                Filtru activ: <strong>{documentQuickFilters.find(item => item.key === documentQuickFilter)?.label}</strong> · {visibleDocuments.length} documente afișate.
              </span>
              <button type="button" className="text-xs font-semibold underline" onClick={() => setDocumentQuickFilter('all')}>
                Resetează filtrul
              </button>
            </div>
          ) : null}
          <div className="mt-3 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-600">
              <strong>{selectedDocuments.length}</strong> documente selectate
              {selectedDocuments.length ? <span className="text-slate-400"> · acțiunile se aplică doar selecției</span> : <span className="text-slate-400"> · exportul folosește lista filtrată dacă nu selectezi nimic</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={toggleVisibleSelection} disabled={!visibleDocuments.length}>
                {allVisibleSelected ? 'Deselectează lista' : 'Selectează lista'}
              </Button>
              <Button size="sm" variant="secondary" onClick={exportSelectedDocumentsCsv} disabled={!visibleDocuments.length && !selectedDocuments.length}>
                Export CSV
              </Button>
              <Button size="sm" onClick={openBulkTaskModal} disabled={!selectedDocuments.length}>
                Creează task-uri
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {activeTab === 'Template-uri' ? (
        <Card>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Template-uri documente</h2>
              <p className="text-xs text-slate-500">Modele Word ca sursă principală; editorul aplicației rămâne pentru previzualizare și compatibilitate.</p>
            </div>
            {isAdmin ? <Button className="w-full sm:w-auto" onClick={() => openTemplateModal()}>+ Template nou</Button> : null}
          </div>
          <div className="grid gap-3 md:hidden">
            {loading ? <p className="text-sm text-slate-500">Se încarcă...</p> : templates.length === 0 ? (
              <p className="text-sm text-slate-500">Nu există template-uri.</p>
            ) : templates.map(template => (
              <div key={template.id} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold uppercase text-slate-500">{template.id}</div>
                    <div className="truncate text-base font-semibold text-slate-900">{template.denumire || '-'}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      {templateTypes.find(([value]) => value === template.tip_document)?.[1] || 'General'} · {template.categorie || 'Alt'}
                    </div>
                  </div>
                  <Badge tone={template.activ === false ? 'neutral' : 'success'}>{template.activ === false ? 'inactiv' : 'activ'}</Badge>
                </div>
                {template.fisier_model_name ? (
                  <button type="button" className="text-left text-sm font-medium text-primary-700 underline" onClick={() => downloadTemplate(template)}>
                    {template.fisier_model_name}
                  </button>
                ) : null}
                {isAdmin ? (
                  <DropdownMenu label="Actiuni template" items={[
                    { label: 'Preview', onClick: () => previewTemplate(template) },
                    { label: 'Editeaza', onClick: () => openTemplateModal(template) },
                    template.fisier_model_path ? { label: 'Descarca model', onClick: () => downloadTemplate(template) } : null,
                    { separator: true },
                    { label: 'Dezactiveaza', danger: true, onClick: () => deleteTemplate(template) },
                  ]} />
                ) : null}
              </div>
            ))}
          </div>
          <div className="hidden md:block">
            <Table
              columns={[
                { key: 'id', label: 'Cod' },
                { key: 'denumire', label: 'Denumire' },
                { key: 'tip_document', label: 'Tip', render: row => templateTypes.find(([value]) => value === row.tip_document)?.[1] || 'General' },
                { key: 'categorie', label: 'Categorie', render: row => row.categorie || 'Alt' },
                { key: 'fisier_model_name', label: 'Model', render: row => row.fisier_model_name ? (
                  <button type="button" className="text-left text-primary-700 hover:underline" onClick={() => downloadTemplate(row)}>
                    {row.fisier_model_name}
                  </button>
                ) : <span className="text-slate-400">-</span> },
                { key: 'serie_prefix', label: 'Serie' },
                { key: 'activ', label: 'Status', render: row => <Badge tone={row.activ === false ? 'neutral' : 'success'}>{row.activ === false ? 'inactiv' : 'activ'}</Badge> },
                { key: 'actions', label: '', render: row => isAdmin ? (
                  <div className="flex justify-end">
                    <DropdownMenu align="right" label="Actiuni" items={[
                      { label: 'Preview', onClick: () => previewTemplate(row) },
                      row.fisier_model_path ? { label: 'Descarca model', onClick: () => downloadTemplate(row) } : null,
                      { label: 'Editeaza', onClick: () => openTemplateModal(row) },
                      { separator: true },
                      { label: 'Dezactiveaza', danger: true, onClick: () => deleteTemplate(row) },
                    ]} />
                  </div>
                ) : null },
              ]}
              rows={templates}
              empty={loading ? 'Se încarcă...' : 'Nu există template-uri.'}
            />
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
          <Card>
            <div className="grid gap-3 md:hidden">
              {loading ? <p className="text-sm text-slate-500">Se încarcă...</p> : visibleDocuments.length === 0 ? (
                <p className="text-sm text-slate-500">Nu există documente.</p>
              ) : visibleDocuments.map(document => (
                <div
                  key={document.uuid || document.id}
                  className={`grid gap-2 rounded-lg border bg-white p-3 text-left transition hover:border-primary-300 hover:bg-primary-50 ${
                    selectedDocumentKeys.includes(documentSelectionKey(document)) ? 'border-primary-300 ring-2 ring-primary-100' : 'border-slate-200'
                  }`}
                >
                  <button type="button" className="flex items-start justify-between gap-3 text-left" onClick={() => openDetails(document)}>
                    <div className="min-w-0">
                      <label className="mb-2 inline-flex items-center gap-2 text-xs font-semibold text-slate-600" onClick={event => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedDocumentKeys.includes(documentSelectionKey(document))}
                          onChange={() => toggleDocumentSelection(document)}
                        />
                        Selectează
                      </label>
                      <div className="text-xs font-semibold uppercase text-slate-500">{document.tip_id}</div>
                      <div className="break-words text-base font-semibold text-slate-900">{document.nr_document}</div>
                      <div className="mt-1 text-sm text-slate-500">{formatDate(document.updated_at || document.created_at)}</div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Badge tone={toneFor(document.status)}>{label(document.status)}</Badge>
                        <Badge tone={documentDueMeta(document).tone}>{documentDueMeta(document).label}</Badge>
                        {documentIsWatched(document, user) ? <Badge tone="info">urmărit</Badge> : null}
                        {documentIsBlocked(document) ? <Badge tone="danger">{documentAgeHours(document)}h blocat</Badge> : null}
                      </div>
                      {emailSourceForDocument(document) ? (
                        <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                          <Mail size={12} /> Email ERP
                        </div>
                      ) : null}
                    </div>
                    <Badge tone={toneFor(document.prioritate)}>{label(document.prioritate)}</Badge>
                  </button>
                  <Button
                    size="sm"
                    variant={documentIsWatched(document, user) ? 'primary' : 'secondary'}
                    onClick={() => toggleWatchDocument(document)}
                  >
                    <Star size={14} className={documentIsWatched(document, user) ? 'fill-current' : ''} />
                    {documentIsWatched(document, user) ? 'Urmărit' : 'Urmărește'}
                  </Button>
                  <DropdownMenu label="Actiuni document" items={[
                    { label: 'Detalii', onClick: () => openDetails(document) },
                    { label: documentIsWatched(document, user) ? 'Nu mai urmări' : 'Urmărește', onClick: () => toggleWatchDocument(document) },
                    { label: 'Creează task', onClick: () => openTaskFromDocument(document) },
                    canEditDocument(document) ? { label: 'Editeaza', onClick: () => openDocumentEdit(document) } : null,
                  ]} />
                </div>
              ))}
            </div>
            <div className="hidden md:block">
              <Table
                columns={[
                  { key: 'select', label: (
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleVisibleSelection}
                      aria-label="Selectează documentele afișate"
                    />
                  ), render: row => (
                    <input
                      type="checkbox"
                      checked={selectedDocumentKeys.includes(documentSelectionKey(row))}
                      onChange={() => toggleDocumentSelection(row)}
                      aria-label={`Selectează ${row.nr_document || row.titlu || 'document'}`}
                    />
                  ) },
                  { key: 'watched', label: '', render: row => (
                    <button
                      type="button"
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition ${
                        documentIsWatched(row, user)
                          ? 'border-amber-200 bg-amber-50 text-amber-700'
                          : 'border-slate-200 bg-white text-slate-400 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700'
                      }`}
                      title={documentIsWatched(row, user) ? 'Document urmărit' : 'Urmărește documentul'}
                      onClick={() => toggleWatchDocument(row)}
                    >
                      <Star size={15} className={documentIsWatched(row, user) ? 'fill-current' : ''} />
                    </button>
                  ) },
                  { key: 'nr_document', label: 'Nr. document' },
                  { key: 'tip_id', label: 'Tip' },
                  { key: 'source', label: 'Sursă', render: row => {
                    const emailSource = emailSourceForDocument(row)
                    return emailSource ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                        <Mail size={12} /> Email ERP
                      </span>
                    ) : <span className="text-slate-400">-</span>
                  } },
                  { key: 'creat_de', label: 'Inițiator' },
                  { key: 'created_at', label: 'Trimis la', render: row => formatDate(row.updated_at || row.created_at) },
                  { key: 'status', label: 'Status', render: row => (
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={toneFor(row.status)}>{label(row.status)}</Badge>
                      {documentIsBlocked(row) ? <Badge tone="danger">{documentAgeHours(row)}h</Badge> : null}
                    </div>
                  ) },
                  { key: 'termen_limita', label: 'Termen', render: row => {
                    const due = documentDueMeta(row)
                    return <Badge tone={due.tone}>{due.label}</Badge>
                  } },
                  { key: 'prioritate', label: 'Prioritate', render: row => <Badge tone={toneFor(row.prioritate)}>{label(row.prioritate)}</Badge> },
                  { key: 'actions', label: '', render: row => (
                    <div className="flex justify-end">
                      <DropdownMenu align="right" label="Actiuni" items={[
                        { label: 'Detalii', onClick: () => openDetails(row) },
                        { label: documentIsWatched(row, user) ? 'Nu mai urmări' : 'Urmărește', onClick: () => toggleWatchDocument(row) },
                        { label: 'Creează task', onClick: () => openTaskFromDocument(row) },
                        canEditDocument(row) ? { label: 'Editeaza', onClick: () => openDocumentEdit(row) } : null,
                      ]} />
                    </div>
                  ) },
                ]}
                rows={visibleDocuments}
                empty={loading ? 'Se încarcă...' : 'Nu există documente.'}
              />
            </div>
          </Card>

          <Card className="grid gap-4">
            {details.document ? (
              <>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                      <FileText size={18} /> {details.document.tip_id}
                    </div>
                    <h2 className="mt-1 text-xl font-semibold text-slate-900">{details.document.nr_document}</h2>
                    <p className="text-sm text-slate-600">{details.document.titlu || 'Document fără titlu'}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant={documentIsWatched(details.document, user) ? 'primary' : 'secondary'}
                      onClick={() => toggleWatchDocument(details.document)}
                    >
                      <Star size={14} className={documentIsWatched(details.document, user) ? 'fill-current' : ''} />
                      {documentIsWatched(details.document, user) ? 'Urmărit' : 'Urmărește'}
                    </Button>
                    <DropdownMenu align="right" label="Actiuni" items={[
                      { label: documentIsWatched(details.document, user) ? 'Nu mai urmări' : 'Urmărește', onClick: () => toggleWatchDocument(details.document) },
                      { label: 'Creează task', onClick: () => openTaskFromDocument(details.document) },
                      canEditDocument(details.document) ? { label: 'Editeaza', onClick: () => openDocumentEdit(details.document) } : null,
                      { label: 'Deschide documentul', disabled: !documentHtml, onClick: openDocumentHtml },
                    ]} />
                    <Badge tone={toneFor(details.document.status)}>{label(details.document.status)}</Badge>
                  </div>
                </div>

                <div className="grid gap-3">
                  <div className={`rounded-xl border p-3 ${
                    currentUserStep
                      ? 'border-amber-200 bg-amber-50'
                      : selectedWaitingStep
                        ? 'border-blue-100 bg-blue-50'
                        : details.document.status === 'draft'
                          ? 'border-slate-200 bg-slate-50'
                          : details.document.status === 'respins'
                            ? 'border-red-100 bg-red-50'
                            : 'border-emerald-100 bg-emerald-50'
                  }`}>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Următorul pas</div>
                        {currentUserStep ? (
                          <>
                            <h3 className="mt-1 text-base font-semibold text-amber-950">Documentul așteaptă decizia ta.</h3>
                            <p className="mt-1 text-sm text-amber-900">
                              Pas {currentUserStep.nr_pas}: {workflowStepTitle(currentUserStep)}. Verifică documentul și aprobă sau respinge cu motiv.
                            </p>
                          </>
                        ) : selectedWaitingStep ? (
                          <>
                            <h3 className="mt-1 text-base font-semibold text-blue-950">Documentul este în circuit și așteaptă un responsabil.</h3>
                            <p className="mt-1 text-sm text-blue-900">
                              Pas {selectedWaitingStep.nr_pas}: {workflowStepTitle(selectedWaitingStep)} · responsabil {workflowStepResponsible(selectedWaitingStep)}.
                              {selectedOpenTasks.length ? ` Există deja ${selectedOpenTasks.length} task-uri deschise pe acest document.` : ' Poți crea un task de urmărire direct către responsabil.'}
                            </p>
                          </>
                        ) : details.document.status === 'draft' ? (
                          <>
                            <h3 className="mt-1 text-base font-semibold text-slate-900">Documentul este draft.</h3>
                            <p className="mt-1 text-sm text-slate-600">
                              Completează-l și lansează-l în circuit când este pregătit pentru aprobare.
                            </p>
                          </>
                        ) : details.document.status === 'respins' ? (
                          <>
                            <h3 className="mt-1 text-base font-semibold text-red-950">Documentul este respins.</h3>
                            <p className="mt-1 text-sm text-red-900">Verifică istoricul deciziilor și creează un task dacă trebuie refăcut sau clarificat.</p>
                          </>
                        ) : (
                          <>
                            <h3 className="mt-1 text-base font-semibold text-emerald-950">Nu există pas deschis în circuit.</h3>
                            <p className="mt-1 text-sm text-emerald-900">Documentul nu cere acțiune imediată. Poți verifica auditul, PDF-ul sau arhivarea.</p>
                          </>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {currentUserStep ? (
                          <>
                            <Button type="button" onClick={() => setConfirm('approve')}><Check size={16} /> Aprobă</Button>
                            <Button type="button" variant="secondary" onClick={() => setConfirm('reject')}><X size={16} /> Respinge</Button>
                          </>
                        ) : selectedWaitingStep ? (
                          <>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => openTaskFromDocument(details.document, {
                                step: selectedWaitingStep,
                                reason: 'Pas de circuit în așteptare',
                                assigned_to: selectedWaitingStep.user_responsabil || '',
                                priority: details.document.prioritate === 'normal' ? 'high' : undefined,
                              })}
                            >
                              + Task responsabil
                            </Button>
                            <Button type="button" variant="secondary" onClick={() => openDocumentTasksPage(details.document)}>Vezi task-uri</Button>
                          </>
                        ) : details.document.status === 'draft' && canEditDocument(details.document) ? (
                          <>
                            <Button type="button" onClick={launchSelectedDocument}>Lansează în circuit</Button>
                            <Button type="button" variant="secondary" onClick={() => openDocumentEdit(details.document)}>Editează draft</Button>
                          </>
                        ) : (
                          <Button type="button" variant="secondary" onClick={() => openTaskFromDocument(details.document)}>+ Task</Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {selectedEmailSource ? (
                    <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm font-semibold text-blue-800">
                            <Mail size={16} /> Document creat din email
                          </div>
                          <div className="mt-1 break-words text-sm font-medium text-slate-900">
                            {selectedEmailSource.subject || selectedEmailSource.label}
                          </div>
                          <div className="mt-1 text-xs text-slate-600">
                            De la {selectedEmailSource.from || '-'}
                            {selectedEmailSource.to ? ` către ${selectedEmailSource.to}` : ''}
                            {selectedEmailSource.receivedAt ? ` · ${formatDate(selectedEmailSource.receivedAt)}` : ''}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {selectedEmailSource.category ? <Badge tone="neutral">{selectedEmailSource.category}</Badge> : null}
                            {selectedEmailSource.importance ? <Badge tone={selectedEmailSource.importance === 'urgent' ? 'danger' : 'warning'}>{label(selectedEmailSource.importance)}</Badge> : null}
                            {selectedEmailSource.hasAttachments ? <Badge tone="info">{selectedEmailSource.attachmentsCount || 1} ataș.</Badge> : null}
                          </div>
                          {selectedEmailSource.attachmentName ? (
                            <div className="mt-2 flex flex-col gap-2 rounded-md border border-blue-100 bg-white px-3 py-2 text-xs text-blue-800 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0">
                                Atașament sursă: <strong>{selectedEmailSource.attachmentName}</strong>
                                {selectedEmailSource.attachmentSize ? ` · ${Math.ceil(selectedEmailSource.attachmentSize / 1024)} KB` : ''}
                                {selectedEmailSource.attachmentType ? ` · ${selectedEmailSource.attachmentType}` : ''}
                                {!selectedEmailSource.attachmentDownloadAvailable ? ' · doar metadata' : ''}
                              </div>
                              {selectedEmailSource.attachmentDownloadAvailable && selectedEmailSource.attachmentDownloadUrl ? (
                                <Button type="button" size="sm" variant="secondary" className="w-full justify-center sm:w-auto" onClick={() => downloadSourceAttachment(selectedEmailSource)}>
                                  <Download size={14} /> Descarcă atașamentul
                                </Button>
                              ) : null}
                            </div>
                          ) : null}
                          {sourceAttachmentError ? (
                            <p className="mt-2 text-xs text-red-600">{sourceAttachmentError}</p>
                          ) : null}
                          {selectedEmailSource.preview ? (
                            <p className="mt-2 line-clamp-3 text-xs text-slate-600">{selectedEmailSource.preview}</p>
                          ) : null}
                        </div>
                        <Button type="button" variant="secondary" onClick={() => { window.location.href = selectedEmailSource.id ? `/mesaje?email=${encodeURIComponent(String(selectedEmailSource.id))}` : selectedEmailSource.url }}>
                          Deschide Inbox
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800">Emailuri legate</h3>
                        <p className="text-xs text-slate-500">Mesaje din Inbox ERP asociate explicit acestui document.</p>
                      </div>
                      <Badge tone={relatedEmails.length ? 'info' : 'neutral'}>{relatedEmails.length} emailuri</Badge>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {relatedEmailsLoading ? (
                        <p className="text-sm text-slate-500">Se încarcă emailurile legate...</p>
                      ) : relatedEmails.length === 0 ? (
                        <p className="text-sm text-slate-500">Nu există emailuri legate manual de acest document.</p>
                      ) : relatedEmails.slice(0, 5).map(email => (
                        <div key={email.id} className="flex flex-col gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-sm font-semibold text-blue-900">
                              <Mail size={14} /> <span className="truncate">{email.subject || email.from || `Email ${email.id}`}</span>
                            </div>
                            <div className="mt-1 text-xs text-slate-600">
                              {email.from || '-'} · {formatDate(email.received_at || email.created_at)}
                            </div>
                            {email.preview ? <div className="mt-1 line-clamp-2 text-xs text-slate-500">{email.preview}</div> : null}
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-2">
                            <Badge tone={email.importance === 'urgent' ? 'danger' : email.importance === 'high' ? 'warning' : 'neutral'} size="sm">{label(email.importance || 'normal')}</Badge>
                            <Button type="button" size="sm" variant="secondary" onClick={() => { window.location.href = `/mesaje?email=${encodeURIComponent(String(email.id))}` }}>Inbox</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800">Task-uri legate</h3>
                        <p className="text-xs text-slate-500">Sarcini create direct din acest document.</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={relatedTasks.length ? 'info' : 'neutral'}>{relatedTasks.length} task-uri</Badge>
                        <Button type="button" size="sm" variant="secondary" onClick={() => openDocumentTasksPage(details.document)}>
                          Vezi în Task-uri
                        </Button>
                        <Button type="button" size="sm" variant="secondary" onClick={() => openTaskFromDocument(details.document)}>
                          + Task
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {relatedTasksLoading ? (
                        <p className="text-sm text-slate-500">Se încarcă task-urile legate...</p>
                      ) : relatedTasks.length === 0 ? (
                        <p className="text-sm text-slate-500">Nu există task-uri legate de acest document.</p>
                      ) : relatedTasks.slice(0, 5).map(task => (
                        <div key={task.id} className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-900">{task.title}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              Responsabil: {task.assigned_to_name || task.assigned_to || '-'}
                              {task.due_date ? ` · termen ${task.due_date}` : ''}
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-2">
                            <Badge tone={taskTone(task.status)} size="sm">{label(task.status || 'open')}</Badge>
                            <Badge tone={task.priority === 'urgent' ? 'danger' : task.priority === 'high' ? 'warning' : 'neutral'} size="sm">
                              {label(task.priority || 'normal')}
                            </Badge>
                          </div>
                        </div>
                      ))}
                      {relatedTasks.length > 5 ? (
                        <Button type="button" size="sm" variant="secondary" onClick={() => openDocumentTasksPage(details.document)}>
                          Vezi toate task-urile
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {selectedWorkflowSnapshot ? (
                    <div className="rounded-xl border border-primary-100 bg-primary-50/70 p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-primary-900">Flux aplicat documentului</h3>
                          <p className="mt-1 text-sm text-primary-800">
                            {selectedWorkflowSnapshot.label || selectedWorkflowSnapshot.document_type || 'Workflow configurabil'}
                          </p>
                          <p className="mt-1 text-xs text-primary-700">
                            Snapshot salvat la lansare
                            {selectedWorkflowSnapshot.captured_at ? ` · ${formatDate(selectedWorkflowSnapshot.captured_at)}` : ''}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge tone="success">v{selectedWorkflowSnapshot.version || 1}</Badge>
                          <Badge tone="info">{(selectedWorkflowSnapshot.steps || []).length} pași</Badge>
                          {(selectedWorkflowSnapshot.skipped_steps || []).length ? (
                            <Badge tone="neutral">{(selectedWorkflowSnapshot.skipped_steps || []).length} săriți</Badge>
                          ) : null}
                        </div>
                      </div>
                      {workflowScenarioSummary(selectedWorkflowSnapshot.scenario).length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {workflowScenarioSummary(selectedWorkflowSnapshot.scenario).map(([name, value]) => (
                            <span key={name} className="rounded-full border border-primary-100 bg-white/80 px-2 py-1 text-xs text-primary-800">
                              <strong>{name}:</strong> {value}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-3 grid gap-2">
                        {(selectedWorkflowSnapshot.steps || []).slice(0, 6).map(step => (
                          <div key={`${selectedWorkflowSnapshot.flow_id || 'flow'}-${step.nr_pas}`} className="rounded-lg border border-primary-100 bg-white/80 px-3 py-2 text-xs text-slate-700">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-slate-900">Pas {step.nr_pas}: {step.name || 'Aprobare'}</span>
                              <Badge tone={workflowEvaluationTone(step.condition_evaluation)} size="sm">
                                {workflowEvaluationLabel(step.condition_evaluation)}
                              </Badge>
                            </div>
                            <div className="mt-1 text-slate-500">
                              {label(step.actor_type || 'rol')} · {step.actor_ref || step.rol_responsabil || step.user_responsabil || '-'}
                              {' · '}{workflowRuleLabel(step.condition_rule, step.condition)}
                            </div>
                          </div>
                        ))}
                      </div>
                      {(selectedWorkflowSnapshot.skipped_steps || []).length ? (
                        <div className="mt-3 rounded-lg border border-slate-200 bg-white/80 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-semibold text-slate-900">Pași săriți de regulile workflow</div>
                            <Badge tone="neutral" size="sm">{selectedWorkflowSnapshot.condition_engine || 'safe'}</Badge>
                          </div>
                          <div className="mt-2 grid gap-2">
                            {(selectedWorkflowSnapshot.skipped_steps || []).map((step, index) => {
                              const evaluation = step.condition_evaluation || {}
                              return (
                                <div key={`${selectedWorkflowSnapshot.flow_id || 'flow'}-skipped-${step.nr_pas_initial || index}`} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge tone="neutral" size="sm">sărit</Badge>
                                    <span className="font-semibold text-slate-900">Pas inițial {step.nr_pas_initial}: {step.name || 'Aprobare'}</span>
                                  </div>
                                  <div className="mt-1">
                                    Regulă: <strong>{workflowRuleLabel(step.condition_rule, step.condition)}</strong>
                                    {String(evaluation.actual ?? '').trim() || String(evaluation.expected ?? '').trim() ? (
                                      <span>
                                        {' '}· actual: <strong>{String(evaluation.actual ?? '-')}</strong>
                                        {' '}· așteptat: <strong>{String(evaluation.expected ?? '-')}</strong>
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 rounded-lg border border-emerald-100 bg-white/80 px-3 py-2 text-xs text-emerald-800">
                          Niciun pas nu a fost sărit de reguli pentru scenariul acestui document.
                        </div>
                      )}
                    </div>
                  ) : null}

                  <h3 className="text-sm font-semibold text-slate-800">Circuit aprobare</h3>
                  <div className="grid gap-2">
                    {details.steps.length === 0 ? (
                      <p className="text-sm text-slate-500">Circuitul nu este disponibil pentru acest document.</p>
                    ) : details.steps.map(step => (
                      <div key={step.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                        <span className="text-lg">{stepIcon(step.status)}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-slate-800">Pas {step.nr_pas} · {label(step.tip)}</div>
                          <div className="text-xs text-slate-500">Responsabil: {step.user_responsabil || step.rol_responsabil || '-'}</div>
                        </div>
                        <Badge tone={toneFor(step.status)}>{label(step.status)}</Badge>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800">Istoric decizii / audit circuit</h3>
                        <p className="text-xs text-slate-500">Urma deciziilor reale: lansare, aprobare, respingere și status rezultat.</p>
                      </div>
                      <Badge tone={details.audit.length ? 'info' : 'neutral'}>{details.audit.length} evenimente</Badge>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {details.audit.length === 0 ? (
                        <p className="text-sm text-slate-500">Nu există încă evenimente de audit pentru acest document.</p>
                      ) : details.audit.map(entry => {
                        const meta = auditMeta(entry)
                        return (
                          <div key={entry.id || `${entry.actiune}-${entry.created_at}`} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge tone={auditTone(entry)} size="sm">{auditActionLabel(entry)}</Badge>
                                  {meta.step_nr ? <span className="text-xs font-semibold text-slate-700">Pas {meta.step_nr}</span> : null}
                                  {meta.final_decision ? <Badge tone="success" size="sm">decizie finală</Badge> : null}
                                </div>
                                <div className="mt-1 text-sm font-medium text-slate-900">
                                  {meta.step_name || entry.comentariu || auditActionLabel(entry)}
                                </div>
                                <div className="mt-1 text-xs text-slate-500">
                                  Utilizator: {entry.user_id || '-'} · {entry.created_at ? formatDate(entry.created_at) : '-'}
                                </div>
                                {entry.comentariu ? (
                                  <div className="mt-2 rounded-md border border-white bg-white px-2 py-1 text-xs text-slate-600">
                                    {entry.comentariu}
                                  </div>
                                ) : null}
                              </div>
                              <div className="grid shrink-0 gap-1 text-xs text-slate-500 sm:text-right">
                                <span>Status: <strong className="text-slate-800">{label(entry.status_vechi)} → {label(entry.status_nou)}</strong></span>
                                {meta.next_step_nr ? <span>Următorul pas: <strong className="text-slate-800">{meta.next_step_nr}</strong></span> : null}
                                {meta.next_user ? <span>Următor responsabil: <strong className="text-slate-800">{meta.next_user}</strong></span> : null}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <div className="grid gap-2">
                  <h3 className="text-sm font-semibold text-slate-800">PDF document</h3>
                  {documentHtmlLoading ? (
                    <div className="flex h-80 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500">
                      Se încarcă documentul...
                    </div>
                  ) : (
                    <iframe
                      title="PDF document"
                      className="h-80 w-full rounded-lg border border-slate-200 bg-slate-50"
                      srcDoc={documentHtml || '<p style="font-family:Arial;padding:24px;color:#64748b">Documentul nu a putut fi generat.</p>'}
                    />
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500">Selectează un document pentru detalii.</p>
            )}
          </Card>
        </div>
      )}

      <Modal open={documentModal} title={documentEditing ? 'Editare document draft' : 'Document nou din template'} onClose={() => setDocumentModal(false)} size="xl">
        <form className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]" onSubmit={saveNewDocument}>
          <div className="grid content-start gap-3">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Template
              <select
                className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                value={documentForm.tip_id}
                disabled={Boolean(documentEditing)}
                onChange={event => {
                  const selectedTemplate = documentTemplates.find(template => template.id === event.target.value)
                  const fieldValues = defaultFieldValues(selectedTemplate?.variables || [])
                  setDocumentForm(form => ({
                    ...form,
                    tip_id: event.target.value,
                    titlu: form.titlu || selectedTemplate?.denumire || '',
                    date_json_text: selectedTemplate ? defaultJsonForTemplate(selectedTemplate) : form.date_json_text,
                  }))
                  setDocumentFieldValues(fieldValues)
                  setDocumentPreview(null)
                  setDocumentPreviewVisible(false)
                }}
                required
              >
                <option value="">Alege template</option>
                {documentTemplates.map(template => (
                  <option key={template.id} value={template.id}>
                    {template.denumire || template.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Titlu document
              <input
                className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                value={documentForm.titlu}
                onChange={event => setDocumentForm(form => ({ ...form, titlu: event.target.value }))}
                required
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Prioritate
              <select
                className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                value={documentForm.prioritate}
                onChange={event => setDocumentForm(form => ({ ...form, prioritate: event.target.value }))}
              >
                <option value="normal">Normală</option>
                <option value="urgent">Urgentă</option>
                <option value="critic">Critică</option>
              </select>
            </label>
            {selectedDocumentTemplate?.variables?.length ? (
              <div className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3">
                <div>
                  <div className="text-sm font-semibold text-slate-800">Câmpuri din template</div>
                  <div className="text-xs text-slate-500">Generate automat din variabilele găsite în model.</div>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {selectedDocumentTemplate.variables.map(variable => (
                    <label key={variable} className="grid gap-1 text-xs font-medium text-slate-600">
                      {variableLabel(variable)}
                      <input
                        className="h-9 rounded-md border border-slate-300 px-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                        value={documentFieldValues[variable] || ''}
                        onChange={event => {
                          setDocumentFieldValues(values => ({ ...values, [variable]: event.target.value }))
                          setDocumentPreview(null)
                        }}
                        placeholder={`{{${variable}}}`}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Date / variabile document (avansat)
              <textarea
                className="min-h-36 rounded-md border border-slate-300 px-3 py-2 font-mono text-xs outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 md:min-h-64"
                value={documentForm.date_json_text}
                onChange={event => {
                  setDocumentForm(form => ({ ...form, date_json_text: event.target.value }))
                  setDocumentPreview(null)
                  setDocumentPreviewVisible(false)
                }}
              />
            </label>
            <label className="flex items-center justify-between rounded-md border border-slate-200 p-3 text-sm font-medium text-slate-700">
              Lansează direct în circuit
              <input type="checkbox" checked={documentForm.launch} onChange={event => setDocumentForm(form => ({ ...form, launch: event.target.checked }))} />
            </label>
            <div className="grid gap-2 sm:grid-cols-3 lg:flex lg:flex-wrap lg:justify-end">
              <Button type="button" variant="secondary" className="w-full lg:w-auto" onClick={() => setDocumentModal(false)}>Anulează</Button>
              <Button type="button" variant="secondary" className="w-full lg:w-auto" onClick={previewNewDocument}>Previzualizează</Button>
              <Button type="submit" className="w-full lg:w-auto" disabled={documentSaving}>{documentSaving ? 'Se salvează...' : documentEditing ? 'Salvează modificări' : 'Creează document'}</Button>
            </div>
            <div className={`grid content-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 lg:hidden ${documentPreviewVisible || documentPreview ? '' : 'hidden'}`}>
              <div className="text-sm font-semibold text-slate-700">Preview</div>
              {documentPreview ? (
                <div className="max-h-[52dvh] overflow-auto rounded-md border border-slate-200 bg-white p-4 text-sm leading-6" dangerouslySetInnerHTML={{ __html: documentPreview }} />
              ) : (
                <div className="flex min-h-40 items-center justify-center rounded-md border border-dashed border-slate-300 bg-white text-sm text-slate-500">
                  Generează preview înainte de salvare.
                </div>
              )}
            </div>
          </div>
          <div className="hidden min-h-96 content-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 lg:grid">
            <div className="text-sm font-semibold text-slate-700">Preview</div>
            {documentPreview ? (
              <div className="max-h-[65vh] overflow-auto rounded-md border border-slate-200 bg-white p-6 text-sm leading-6" dangerouslySetInnerHTML={{ __html: documentPreview }} />
            ) : (
              <div className="flex min-h-80 items-center justify-center rounded-md border border-dashed border-slate-300 bg-white text-sm text-slate-500">
                Generează preview înainte de salvare.
              </div>
            )}
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(confirm)} title={confirm === 'approve' ? 'Confirmă aprobarea' : 'Confirmă respingerea'} onClose={() => setConfirm(null)}>
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Comentariu
            <textarea
              className="min-h-28 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              value={comment}
              onChange={event => setComment(event.target.value)}
              placeholder={confirm === 'reject' ? 'Motivul respingerii este obligatoriu.' : 'Comentariu opțional'}
            />
          </label>
          <Button onClick={() => processDocument(confirm)} disabled={confirm === 'reject' && !comment.trim()}>
            Confirmă
          </Button>
        </div>
      </Modal>

      <Modal open={templateModal} title={templateEditing ? 'Editare template document' : 'Template document nou'} onClose={() => setTemplateModal(false)} size="xl">
        <form className="grid gap-3" onSubmit={saveTemplate}>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Denumire template
            <input className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" value={templateForm.denumire} onChange={event => setTemplateForm(form => ({ ...form, denumire: event.target.value }))} required />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Categorie
            <select className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" value={templateForm.categorie} onChange={event => setTemplateForm(form => ({ ...form, categorie: event.target.value }))}>
              <option>Adeverință</option>
              <option>Contract</option>
              <option>Referat</option>
              <option>Notă internă</option>
              <option>Proces verbal</option>
              <option>Decizie</option>
              <option>Dispoziție</option>
              <option>Altele</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Tip document
            <select className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" value={templateForm.tip_document} onChange={event => setTemplateForm(form => ({ ...form, tip_document: event.target.value }))}>
              {templateTypes.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Descriere
            <input className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" value={templateForm.descriere} onChange={event => setTemplateForm(form => ({ ...form, descriere: event.target.value }))} />
          </label>
          <div className="grid gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 md:p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-950">
                  <UploadCloud size={18} /> Model Word pentru utilizatori
                </div>
                <p className="mt-1 text-xs text-emerald-800">
                  Recomandat: pregătești documentul în Word, introduci variabilele cu acolade duble, apoi încarci fișierul `.docx`.
                  InfraFlow păstrează modelul original pentru descărcare și dosar.
                </p>
              </div>
              {templateEditing?.fisier_model_path ? (
                <Button type="button" size="sm" variant="secondary" className="w-full sm:w-auto" onClick={() => downloadTemplate(templateEditing)}>
                  <Download size={14} /> Descarcă modelul curent
                </Button>
              ) : null}
            </div>
            <label className="grid gap-2 rounded-lg border border-dashed border-emerald-300 bg-white/70 p-3 text-sm font-medium text-slate-700">
              <span>Încarcă / înlocuiește modelul</span>
              <input
                type="file"
                accept=".docx,.xml,.html,.htm"
                className="w-full min-w-0 text-sm"
                onChange={event => {
                  const file = event.target.files?.[0] || null
                  setTemplateUploadFile(file)
                  if (file && !/\.docx$/i.test(file.name)) setTemplateAdvancedOpen(true)
                }}
              />
              <span className="text-xs font-normal text-slate-500">
                {templateUploadFile ? `Selectat: ${templateUploadFile.name}` : templateEditing?.fisier_model_name ? `Model curent: ${templateEditing.fisier_model_name}` : 'Alege preferabil un fișier .docx. XML/HTML rămân acceptate pentru compatibilitate.'}
              </span>
            </label>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase text-emerald-900">Variabile uzuale pentru Word</div>
              <div className="flex flex-wrap gap-2">
                {wordTemplateVariables.map(([key, description]) => (
                  <button
                    key={key}
                    type="button"
                    title={description}
                    className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-xs font-medium text-emerald-900 hover:border-emerald-400"
                    onClick={() => navigator.clipboard?.writeText(`{{${key}}}`)}
                  >
                    {`{{${key}}}`}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-emerald-800">
                Click pe o variabilă o copiază în clipboard, dacă browserul permite. În Word o lipești exact ca text: <code className="rounded bg-white px-1">{'{{document.numar}}'}</code>.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-800">Compatibilitate aplicație / previzualizare</div>
                <p className="text-xs text-slate-500">
                  Zona aceasta este pentru administratori sau template-uri vechi. Utilizatorii normali lucrează cu fișierul Word de mai sus.
                </p>
              </div>
              <Button type="button" size="sm" variant="secondary" className="w-full sm:w-auto" onClick={() => setTemplateAdvancedOpen(open => !open)}>
                {templateAdvancedOpen ? 'Ascunde editorul tehnic' : 'Arată editorul tehnic'}
              </Button>
            </div>
            {templateAdvancedOpen ? (
              <div className="mt-3 grid gap-1 text-sm font-medium text-slate-700">
                Conținut pentru previzualizare / fallback
                <DocumentTemplateEditor value={templateForm.template_html} onChange={template_html => setTemplateForm(form => ({ ...form, template_html }))} />
              </div>
            ) : null}
          </div>
          <label className="flex items-center justify-between rounded-md border border-slate-200 p-3 text-sm font-medium text-slate-700">
            Activ
            <input type="checkbox" checked={templateForm.activ} onChange={event => setTemplateForm(form => ({ ...form, activ: event.target.checked }))} />
          </label>
          <div className="grid gap-2 sm:flex sm:justify-end">
            <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={() => setTemplateModal(false)}>Anulează</Button>
            <Button type="submit" className="w-full sm:w-auto" disabled={templateSaving}>{templateSaving ? 'Se salvează...' : 'Salvează'}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(templatePreview)} title={`Preview ${templatePreview?.template?.denumire || ''}`} onClose={() => setTemplatePreview(null)} size="xl">
        <div className="min-h-96 rounded-md border border-slate-200 bg-white p-8 text-sm leading-6 shadow-inner" dangerouslySetInnerHTML={{ __html: templatePreview?.html || '' }} />
      </Modal>

      <Modal open={Boolean(taskDocument)} title="Creează task din document" onClose={() => setTaskDocument(null)}>
        <form className="grid gap-4" onSubmit={createTaskFromDocument}>
          {taskDocument ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="font-semibold text-slate-900">{taskDocument.nr_document || 'Document'}</div>
              <div className="mt-1 text-xs text-slate-500">{taskDocument.titlu || taskDocument.tip_id || '-'}</div>
            </div>
          ) : null}
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Titlu task
            <input
              className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              value={taskForm.title}
              onChange={event => setTaskForm(form => ({ ...form, title: event.target.value }))}
              required
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Descriere
            <textarea
              className="min-h-28 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              value={taskForm.description}
              onChange={event => setTaskForm(form => ({ ...form, description: event.target.value }))}
            />
          </label>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Responsabil
              <select
                className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                value={taskForm.assigned_to}
                onChange={event => setTaskForm(form => ({ ...form, assigned_to: event.target.value }))}
                required
              >
                <option value="">Alege responsabil</option>
                {taskUsers.map(item => (
                  <option key={item.id} value={item.id}>{item.name || item.username || item.id}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Prioritate
              <select
                className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                value={taskForm.priority}
                onChange={event => setTaskForm(form => ({ ...form, priority: event.target.value }))}
              >
                <option value="low">Scăzută</option>
                <option value="normal">Normală</option>
                <option value="high">Importantă</option>
                <option value="urgent">Urgentă</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Termen
              <input
                type="date"
                className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                value={taskForm.due_date}
                onChange={event => setTaskForm(form => ({ ...form, due_date: event.target.value }))}
              />
            </label>
          </div>
          <div className="rounded-lg border border-primary-100 bg-primary-50 p-3 text-xs text-primary-700">
            Task-ul va păstra legătura către document. Din Task-uri, butonul „Deschide sursa” va reveni direct aici.
          </div>
          {taskError ? <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{taskError}</div> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setTaskDocument(null)}>Renunță</Button>
            <Button type="submit" loading={taskSaving} disabled={!taskForm.title.trim() || !taskForm.assigned_to}>Creează task</Button>
          </div>
        </form>
      </Modal>

      <Modal open={bulkTaskOpen} title="Creează task-uri pentru documentele selectate" onClose={() => setBulkTaskOpen(false)}>
        <form className="grid gap-4" onSubmit={createBulkTasks}>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="font-semibold text-slate-900">{selectedDocuments.length} documente selectate</div>
            <div className="mt-2 grid max-h-36 gap-1 overflow-auto text-xs text-slate-600">
              {selectedDocuments.slice(0, 8).map(document => (
                <div key={documentSelectionKey(document)} className="truncate">
                  {document.nr_document || 'Document'} · {document.titlu || document.tip_id || '-'}
                </div>
              ))}
              {selectedDocuments.length > 8 ? <div className="text-slate-400">+ {selectedDocuments.length - 8} documente...</div> : null}
            </div>
          </div>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Prefix titlu task
            <input
              className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              value={bulkTaskForm.title_prefix}
              onChange={event => setBulkTaskForm(form => ({ ...form, title_prefix: event.target.value }))}
              required
            />
          </label>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Responsabil
              <select
                className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                value={bulkTaskForm.assigned_to}
                onChange={event => setBulkTaskForm(form => ({ ...form, assigned_to: event.target.value }))}
                required
              >
                <option value="">Alege responsabil</option>
                {taskUsers.map(item => (
                  <option key={item.id} value={item.id}>{item.name || item.username || item.id}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Prioritate
              <select
                className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                value={bulkTaskForm.priority}
                onChange={event => setBulkTaskForm(form => ({ ...form, priority: event.target.value }))}
              >
                <option value="low">Scăzută</option>
                <option value="normal">Normală</option>
                <option value="high">Importantă</option>
                <option value="urgent">Urgentă</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Termen
              <input
                type="date"
                className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                value={bulkTaskForm.due_date}
                onChange={event => setBulkTaskForm(form => ({ ...form, due_date: event.target.value }))}
              />
            </label>
          </div>
          <div className="rounded-lg border border-primary-100 bg-primary-50 p-3 text-xs text-primary-700">
            Se creează câte un task pentru fiecare document selectat, fiecare cu legătură directă către dosarul documentului.
          </div>
          {bulkTaskError ? <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{bulkTaskError}</div> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setBulkTaskOpen(false)}>Renunță</Button>
            <Button type="submit" loading={bulkTaskSaving} disabled={!selectedDocuments.length || !bulkTaskForm.assigned_to || !bulkTaskForm.title_prefix.trim()}>
              Creează {selectedDocuments.length} task-uri
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.title}
        message={confirmAction?.message}
        details={confirmAction?.details}
        confirmLabel={confirmAction?.confirmLabel}
        cancelLabel="Renunță"
        tone={confirmAction?.tone || 'warning'}
        loading={confirmLoading}
        onCancel={() => setConfirmAction(null)}
        onConfirm={runConfirmAction}
      />
    </div>
  )
}
