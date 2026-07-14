import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Download, Eye, FileText, UploadCloud, X } from 'lucide-react'
import api from '../../api/client'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import ContextHelp from '../../components/ui/ContextHelp'
import DropdownMenu from '../../components/ui/DropdownMenu'
import DocumentTemplateEditor from '../../components/forms/DocumentTemplateEditor'
import Modal from '../../components/ui/Modal'
import Table from '../../components/ui/Table'
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

function userId(user) {
  return user?.id || user?.userId || user?.username
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
  const [templateSaving, setTemplateSaving] = useState(false)
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

  const visibleDocuments = useMemo(() => {
    if (activeTab !== 'Ale mele') return documents
    const id = userId(user)
    return documents.filter(document => String(document.creat_de) === String(id))
  }, [activeTab, documents, user])

  async function openDetails(document) {
    setSelected(document)
    setError('')
    setDocumentHtml('')
    setDocumentHtmlLoading(true)
    try {
      const response = await api.get(`/documents/${document.uuid}`)
      setDetails({
        document: response.data.document || document,
        steps: arrayFrom(response.data, ['steps']),
        audit: arrayFrom(response.data, ['audit']),
      })
      const htmlResponse = await api.get(`/documents/${document.uuid}/pdf`, { responseType: 'text' })
      setDocumentHtml(String(htmlResponse.data || ''))
    } catch (err) {
      setDetails({ document, steps: [], audit: [] })
      setError(err.response?.data?.error || 'Nu am putut încărca detaliile documentului.')
    } finally {
      setDocumentHtmlLoading(false)
    }
  }

  function openDocumentHtml() {
    if (!documentHtml) return
    const blob = new Blob([documentHtml], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener,noreferrer')
    window.setTimeout(() => URL.revokeObjectURL(url), 30000)
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
    if (!window.confirm(`Dezactivezi template-ul ${template.denumire || template.id}?`)) return
    try {
      await api.delete(`/documents/templates/${template.id}`)
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Template-ul nu a putut fi dezactivat.')
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
          sofer_nume: 'Ion Popescu',
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

  const currentUserStep = details.steps.find(step =>
    step.status === 'asteptare' && String(step.user_responsabil) === String(userId(user))
  )

  const documentContextHelp = useMemo(() => {
    const inboxCount = activeTab === 'Inbox' ? visibleDocuments.length : null
    const templateCount = activeTab === 'Template-uri' ? templates.length : null
    const steps = [
      {
        key: 'inbox',
        label: inboxCount === null ? 'Inbox aprobare' : `Inbox aprobare · ${inboxCount}`,
        hint: inboxCount && inboxCount > 0 ? 'Ai documente care așteaptă acțiune.' : 'Verifică documentele primite spre avizare.',
        done: inboxCount === 0,
        onClick: () => setActiveTab('Inbox'),
      },
      {
        key: 'new-document',
        label: 'Document nou',
        hint: 'Alege template-ul, completează datele și lansează circuitul.',
        done: false,
        onClick: openDocumentModal,
      },
      {
        key: 'templates',
        label: templateCount === null ? 'Template-uri Word' : `Template-uri Word · ${templateCount}`,
        hint: 'Modelele Word sunt sursa principală pentru documente comerciale ușor de întreținut.',
        done: templateCount !== 0,
        onClick: () => setActiveTab('Template-uri'),
      },
    ]
    const nextStep = activeTab !== 'Inbox'
      ? steps[0]
      : (visibleDocuments.length > 0 ? steps[0] : steps[1])
    return { steps, nextStep }
  }, [activeTab, visibleDocuments.length, templates.length])

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

      <ContextHelp
        eyebrow="Ghid documente"
        icon="📄"
        tone={visibleDocuments.length > 0 && activeTab === 'Inbox' ? 'warning' : 'info'}
        title="Documentele merg cel mai bine când modelul Word, datele și circuitul sunt clare."
        description="Pentru utilizator: alege documentul din Inbox sau creează unul nou. Pentru administrator: întreține template-urile Word, iar aplicația le folosește în flux."
        compact
        steps={documentContextHelp.steps}
        tips={[
          'Template-urile Word sunt fluxul principal; editorul HTML rămâne doar pentru compatibilitate.',
          'Documentele lansate în circuit păstrează pașii și istoricul de aprobare.',
        ]}
        nextAction={documentContextHelp.nextStep ? {
          label: `Deschide: ${documentContextHelp.nextStep.label}`,
          onClick: documentContextHelp.nextStep.onClick,
        } : null}
      />

      <div className="flex flex-wrap gap-2">
        {tabs.map(tab => (
          <Button key={tab} variant={activeTab === tab ? 'primary' : 'secondary'} onClick={() => setActiveTab(tab)}>
            {tab}
          </Button>
        ))}
      </div>

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
                  className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-primary-300 hover:bg-primary-50"
                >
                  <button type="button" className="flex items-start justify-between gap-3 text-left" onClick={() => openDetails(document)}>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase text-slate-500">{document.tip_id}</div>
                      <div className="break-words text-base font-semibold text-slate-900">{document.nr_document}</div>
                      <div className="mt-1 text-sm text-slate-500">{formatDate(document.updated_at || document.created_at)}</div>
                    </div>
                    <Badge tone={toneFor(document.prioritate)}>{label(document.prioritate)}</Badge>
                  </button>
                  <DropdownMenu label="Actiuni document" items={[
                    { label: 'Detalii', onClick: () => openDetails(document) },
                    canEditDocument(document) ? { label: 'Editeaza', onClick: () => openDocumentEdit(document) } : null,
                  ]} />
                </div>
              ))}
            </div>
            <div className="hidden md:block">
              <Table
                columns={[
                  { key: 'nr_document', label: 'Nr. document' },
                  { key: 'tip_id', label: 'Tip' },
                  { key: 'creat_de', label: 'Inițiator' },
                  { key: 'created_at', label: 'Trimis la', render: row => formatDate(row.updated_at || row.created_at) },
                  { key: 'prioritate', label: 'Prioritate', render: row => <Badge tone={toneFor(row.prioritate)}>{label(row.prioritate)}</Badge> },
                  { key: 'actions', label: '', render: row => (
                    <div className="flex justify-end">
                      <DropdownMenu align="right" label="Actiuni" items={[
                        { label: 'Detalii', onClick: () => openDetails(row) },
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
                    <DropdownMenu align="right" label="Actiuni" items={[
                      canEditDocument(details.document) ? { label: 'Editeaza', onClick: () => openDocumentEdit(details.document) } : null,
                      { label: 'Deschide documentul', disabled: !documentHtml, onClick: openDocumentHtml },
                    ]} />
                    <Badge tone={toneFor(details.document.status)}>{label(details.document.status)}</Badge>
                  </div>
                </div>

                <div className="grid gap-3">
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

                {currentUserStep && (
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => setConfirm('approve')}><Check size={16} /> Aprobă</Button>
                    <Button variant="secondary" onClick={() => setConfirm('reject')}><X size={16} /> Respinge</Button>
                  </div>
                )}
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
    </div>
  )
}
