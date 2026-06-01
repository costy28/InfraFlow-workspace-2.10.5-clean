import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, FileText, X } from 'lucide-react'
import api from '../../api/client'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
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
  descriere: '',
  template_html: '',
  activ: true,
}

export default function DocumentePage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('Inbox')
  const [documents, setDocuments] = useState([])
  const [templates, setTemplates] = useState([])
  const [selected, setSelected] = useState(null)
  const [details, setDetails] = useState({ document: null, steps: [], audit: [] })
  const [confirm, setConfirm] = useState(null)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [templateModal, setTemplateModal] = useState(false)
  const [templateEditing, setTemplateEditing] = useState(null)
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm)
  const [templateSaving, setTemplateSaving] = useState(false)
  const userRoles = Array.from(new Set([...(Array.isArray(user?.roles) ? user.roles : []), user?.role].filter(Boolean).map(String)))
  const isAdmin = userRoles.some(role => ['superadmin', 'admin'].includes(role))

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
    try {
      const response = await api.get(`/documents/${document.uuid}`)
      setDetails({
        document: response.data.document || document,
        steps: arrayFrom(response.data, ['steps']),
        audit: arrayFrom(response.data, ['audit']),
      })
    } catch (err) {
      setDetails({ document, steps: [], audit: [] })
      setError(err.response?.data?.error || 'Nu am putut încărca detaliile documentului.')
    }
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
      descriere: template.descriere || '',
      template_html: template.template_html || '',
      activ: template.activ !== false,
    } : emptyTemplateForm)
    setTemplateModal(true)
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
      if (templateEditing) await api.put(`/documents/templates/${templateEditing.id}`, payload)
      else await api.post('/documents/templates', payload)
      setTemplateModal(false)
      setTemplateEditing(null)
      setTemplateForm(emptyTemplateForm)
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

  const currentUserStep = details.steps.find(step =>
    step.status === 'asteptare' && String(step.user_responsabil) === String(userId(user))
  )

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Documente</h1>
          <p className="text-sm text-slate-600">Circuit electronic, aprobări și template-uri de documente.</p>
        </div>
        <Button variant="secondary" onClick={load}>Reîncarcă</Button>
      </div>

      {error && <Card className="border-rose-200 bg-rose-50 text-sm text-rose-700">{error}</Card>}

      <div className="flex flex-wrap gap-2">
        {tabs.map(tab => (
          <Button key={tab} variant={activeTab === tab ? 'primary' : 'secondary'} onClick={() => setActiveTab(tab)}>
            {tab}
          </Button>
        ))}
      </div>

      {activeTab === 'Template-uri' ? (
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Template-uri documente</h2>
              <p className="text-xs text-slate-500">Editor vizual cu variabile pentru firmă, angajat, document și semnături.</p>
            </div>
            {isAdmin ? <Button onClick={() => openTemplateModal()}>+ Template nou</Button> : null}
          </div>
          <Table
            columns={[
              { key: 'id', label: 'Cod' },
              { key: 'denumire', label: 'Denumire' },
              { key: 'categorie', label: 'Categorie', render: row => row.categorie || 'Alt' },
              { key: 'serie_prefix', label: 'Serie' },
              { key: 'nr_curent', label: 'Nr. curent' },
              { key: 'activ', label: 'Status', render: row => <Badge tone={row.activ === false ? 'neutral' : 'success'}>{row.activ === false ? 'inactiv' : 'activ'}</Badge> },
              { key: 'actions', label: '', render: row => isAdmin ? (
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => openTemplateModal(row)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteTemplate(row)}>Dezactivează</Button>
                </div>
              ) : null },
            ]}
            rows={templates}
            empty={loading ? 'Se încarcă...' : 'Nu există template-uri.'}
          />
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
          <Card>
            <Table
              columns={[
                { key: 'nr_document', label: 'Nr. document' },
                { key: 'tip_id', label: 'Tip' },
                { key: 'creat_de', label: 'Inițiator' },
                { key: 'created_at', label: 'Trimis la', render: row => formatDate(row.updated_at || row.created_at) },
                { key: 'prioritate', label: 'Prioritate', render: row => <Badge tone={toneFor(row.prioritate)}>{label(row.prioritate)}</Badge> },
                { key: 'actions', label: '', render: row => <Button variant="ghost" onClick={() => openDetails(row)}>Detalii</Button> },
              ]}
              rows={visibleDocuments}
              empty={loading ? 'Se încarcă...' : 'Nu există documente.'}
            />
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
                  <Badge tone={toneFor(details.document.status)}>{label(details.document.status)}</Badge>
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
                  <iframe
                    title="PDF document"
                    className="h-80 w-full rounded-lg border border-slate-200 bg-slate-50"
                    src={`/api/documents/${details.document.uuid}/pdf`}
                  />
                  <Button variant="secondary" onClick={() => window.open(`/api/documents/${details.document.uuid}/pdf`, '_blank')}>
                    Deschide documentul
                  </Button>
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

      <Modal open={templateModal} title={templateEditing ? 'Editare template' : 'Template nou'} onClose={() => setTemplateModal(false)} size="lg">
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
            Descriere
            <input className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" value={templateForm.descriere} onChange={event => setTemplateForm(form => ({ ...form, descriere: event.target.value }))} />
          </label>
          <div className="grid gap-1 text-sm font-medium text-slate-700">
            Conținut
            <DocumentTemplateEditor value={templateForm.template_html} onChange={template_html => setTemplateForm(form => ({ ...form, template_html }))} />
          </div>
          <label className="flex items-center justify-between rounded-md border border-slate-200 p-3 text-sm font-medium text-slate-700">
            Activ
            <input type="checkbox" checked={templateForm.activ} onChange={event => setTemplateForm(form => ({ ...form, activ: event.target.checked }))} />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setTemplateModal(false)}>Anulează</Button>
            <Button type="submit" disabled={templateSaving}>{templateSaving ? 'Se salvează...' : 'Salvează'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
