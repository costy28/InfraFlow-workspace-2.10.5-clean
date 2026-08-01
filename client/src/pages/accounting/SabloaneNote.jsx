import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/client'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import Card from '../../components/ui/Card'
import Modal from '../../components/ui/Modal'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import { AccountSelect, AccountingShell, DropdownMenu, Info, Table } from './accounting-shared'

const blankTemplate = {
  source: 'intrare',
  label: '',
  description: '',
  main_account: '628',
  line_account: '628',
  vat_account: '4426',
  party_account: '401.x',
  preview: '',
  activ: true
}

export function SabloaneNote() {
  const [templates, setTemplates] = useState([])
  const [accounts, setAccounts] = useState([])
  const [source, setSource] = useState('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(blankTemplate)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const navigate = useNavigate()
  const filtered = useMemo(() => source ? templates.filter(template => template.source === source) : templates, [templates, source])

  useEffect(() => { load() }, [])

  async function load() {
    const [templatesRes, chartRes] = await Promise.all([
      api.get('/accounting/journal-templates'),
      api.get('/accounting/chart')
    ])
    setTemplates(templatesRes.data.templates || [])
    setAccounts(chartRes.data.accounts || [])
  }

  function openNew() {
    setEditing(null)
    setError('')
    setMessage('')
    setForm(blankTemplate)
    setModal(true)
  }

  function openEdit(template) {
    setEditing(template)
    setError('')
    setMessage('')
    setForm({
      source: template.source || 'intrare',
      label: template.label || '',
      description: template.description || '',
      main_account: template.main_account || '',
      line_account: template.line_account || template.main_account || '',
      vat_account: template.vat_account || '',
      party_account: template.party_account || '',
      preview: template.preview || '',
      activ: template.activ !== false
    })
    setModal(true)
  }

  function updateForm(patch) {
    const next = { ...form, ...patch }
    if (patch.source === 'intrare') {
      if (!form.vat_account || form.vat_account === '4427') next.vat_account = '4426'
      if (!form.party_account || form.party_account === '4111.x') next.party_account = '401.x'
    }
    if (patch.source === 'iesire') {
      if (!form.vat_account || form.vat_account === '4426') next.vat_account = '4427'
      if (!form.party_account || form.party_account === '401.x') next.party_account = '4111.x'
    }
    setForm(next)
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    try {
      if (editing?.system) throw new Error('Sabloanele de sistem nu se editeaza direct. Creeaza un sablon custom pornind de la aceeasi regula.')
      if (editing?.key) await api.patch(`/accounting/journal-templates/${editing.key}`, form)
      else await api.post('/accounting/journal-templates', form)
      setModal(false)
      setEditing(null)
      setMessage(editing ? 'Sablonul a fost actualizat.' : 'Sablonul a fost creat.')
      await load()
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Sablonul nu a putut fi salvat.')
    }
  }

  async function toggleActive(template) {
    if (template.system) return
    setError('')
    setMessage('')
    try {
      await api.patch(`/accounting/journal-templates/${template.key}`, { ...template, activ: template.activ === false })
      setMessage(template.activ === false ? 'Sablonul a fost reactivat.' : 'Sablonul a fost dezactivat.')
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Statusul sablonului nu a putut fi schimbat.')
    }
  }

  function templateMenu(template) {
    if (template.system) {
      return [
        { label: 'Sablon de sistem', disabled: true },
        { label: 'Creeaza sablon custom', onClick: openNew }
      ]
    }
    return [
      { label: 'Editeaza sablon', onClick: () => openEdit(template) },
      {
        label: template.activ === false ? 'Activeaza sablon' : 'Dezactiveaza sablon',
        onClick: () => toggleActive(template),
        danger: template.activ !== false
      }
    ]
  }

  const templatesSummary = buildTemplatesSummary({ templates, filtered, source, accounts })
  const templatesFlow = buildTemplatesFlow({
    summary: templatesSummary,
    source,
    openNew,
    clearFilter: () => setSource(''),
    openIncoming: () => navigate('/contabilitate/facturi-intrare'),
    openOutgoing: () => navigate('/contabilitate/facturi-iesire')
  })

  return (
    <AccountingShell
      active="sabloane"
      title="Sabloane note contabile"
      subtitle="Reguli rapide pentru completarea conturilor pe facturi."
      actions={<DropdownMenu align="right" label="Actiuni" items={[
        { label: 'Sablon nou', onClick: openNew },
        { type: 'separator' },
        { label: 'Facturi intrare', to: '/contabilitate/facturi-intrare' },
        { label: 'Facturi iesire', to: '/contabilitate/facturi-iesire' }
      ]} />}
    >
      {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge tone={templatesFlow.tone}>{templatesFlow.badge}</Badge>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Șabloane contabile simplificate</span>
            </div>
            <h3 className="text-lg font-semibold text-slate-900">{templatesFlow.title}</h3>
            <p className="mt-1 max-w-4xl text-sm text-slate-500">{templatesFlow.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={templatesFlow.primaryAction}>{templatesFlow.primaryLabel}</Button>
            <Button variant="secondary" onClick={load}>Reîncarcă</Button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {templatesFlow.steps.map((step, index) => (
            <button
              key={step.key}
              type="button"
              onClick={step.onClick}
              className={`rounded-lg border px-4 py-3 text-left transition hover:shadow-sm ${step.active ? 'border-emerald-300 bg-emerald-50' : step.tone === 'warning' ? 'border-amber-200 bg-amber-50' : step.tone === 'danger' ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">{index + 1}</span>
                <Badge tone={step.tone}>{step.status}</Badge>
              </div>
              <div className="mt-3 font-semibold text-slate-900">{step.title}</div>
              <p className="mt-1 text-sm text-slate-500">{step.detail}</p>
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Info label="Șabloane afișate" value={`${templatesSummary.filteredTemplates} / ${templatesSummary.totalTemplates}`} />
          <Info label="Custom active" value={templatesSummary.customActive} />
          <Info label="De sistem" value={templatesSummary.systemTemplates} />
          <Info label="Conturi disponibile" value={templatesSummary.accountsCount} />
        </div>
      </Card>
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-md border border-slate-200 bg-white p-3 shadow-sm">
        <Select label="Tip document" value={source} onChange={event => setSource(event.target.value)} options={[
          { value: '', label: 'Toate' },
          { value: 'intrare', label: 'Facturi intrare' },
          { value: 'iesire', label: 'Facturi iesire' }
        ]} />
        <DropdownMenu align="right" label="Actiuni" items={[
          { label: 'Sablon nou', onClick: openNew }
        ]} />
      </div>
      <Table headers={['Tip', 'Denumire', 'Nota', 'Cont linie', 'TVA', 'Tert', 'Status', 'Actiuni']}>
        {filtered.map(template => (
          <tr key={template.key}>
            <td className="px-3 py-2">{template.source === 'intrare' ? 'Intrare' : 'Iesire'}</td>
            <td className="px-3 py-2">
              <div className="font-semibold">{template.label}</div>
              <div className="text-xs text-slate-500">{template.description || '-'}</div>
            </td>
            <td className="px-3 py-2">{template.preview || '-'}</td>
            <td className="px-3 py-2 font-mono">{template.line_account}</td>
            <td className="px-3 py-2 font-mono">{template.vat_account}</td>
            <td className="px-3 py-2 font-mono">{template.party_account}</td>
            <td className="px-3 py-2">
              <Badge tone={template.activ === false ? 'danger' : template.system ? 'info' : 'success'}>{template.activ === false ? 'inactiv' : template.system ? 'sistem' : 'custom'}</Badge>
            </td>
            <td className="px-3 py-2">
              <DropdownMenu align="right" label="Actiuni" items={templateMenu(template)} />
            </td>
          </tr>
        ))}
      </Table>
      <Modal open={modal} title={editing ? 'Editare sablon' : 'Sablon nou'} onClose={() => setModal(false)}>
        <form className="grid gap-3" onSubmit={submit}>
          {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          <div className="grid gap-3 md:grid-cols-2">
            <Select label="Tip" value={form.source} onChange={event => updateForm({ source: event.target.value })} options={[
              { value: 'intrare', label: 'Factura intrare' },
              { value: 'iesire', label: 'Factura iesire' }
            ]} />
            <Input label="Denumire" value={form.label} onChange={event => updateForm({ label: event.target.value })} required />
          </div>
          <Input label="Descriere" value={form.description} onChange={event => updateForm({ description: event.target.value })} />
          <div className="grid gap-3 md:grid-cols-2">
            <AccountSelect label="Cont principal" value={form.main_account} accounts={accounts} recommendedClasses={form.source === 'intrare' ? [6, 3, 2] : [7]} onChange={event => updateForm({ main_account: event.target.value, line_account: form.line_account || event.target.value })} required />
            <AccountSelect label="Cont linie" value={form.line_account} accounts={accounts} recommendedClasses={form.source === 'intrare' ? [6, 3, 2] : [7]} onChange={event => updateForm({ line_account: event.target.value })} required />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <AccountSelect label="Cont TVA" value={form.vat_account} accounts={accounts} recommendedClasses={[4]} onChange={event => updateForm({ vat_account: event.target.value })} required />
            <Input label="Cont tert afisat" value={form.party_account} onChange={event => updateForm({ party_account: event.target.value })} placeholder="401.x / 4111.x" />
          </div>
          <Input label="Preview" value={form.preview} onChange={event => updateForm({ preview: event.target.value })} placeholder={form.source === 'intrare' ? `${form.line_account || '628'} + 4426 = 401.x` : `4111.x = ${form.line_account || '704'} + 4427`} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal(false)}>Renunta</Button>
            <Button type="submit">{editing ? 'Salveaza' : 'Creeaza'}</Button>
          </div>
        </form>
      </Modal>
    </AccountingShell>
  )
}

function buildTemplatesSummary({ templates, filtered, source, accounts }) {
  const systemTemplates = templates.filter(template => template.system).length
  const customTemplates = templates.filter(template => !template.system).length
  const inactiveTemplates = templates.filter(template => template.activ === false).length
  const activeTemplates = templates.filter(template => template.activ !== false).length
  const customActive = templates.filter(template => !template.system && template.activ !== false).length
  const incomingTemplates = templates.filter(template => template.source === 'intrare').length
  const outgoingTemplates = templates.filter(template => template.source === 'iesire').length
  const sourceLabel = source === 'intrare' ? 'Facturi intrare' : source === 'iesire' ? 'Facturi ieșire' : 'Toate documentele'

  return {
    totalTemplates: templates.length,
    filteredTemplates: filtered.length,
    systemTemplates,
    customTemplates,
    inactiveTemplates,
    activeTemplates,
    customActive,
    incomingTemplates,
    outgoingTemplates,
    accountsCount: accounts.length,
    sourceLabel,
    hasSourceFilter: Boolean(source),
  }
}

function buildTemplatesFlow({ summary, source, openNew, clearFilter, openIncoming, openOutgoing }) {
  const steps = [
    {
      key: 'source',
      title: 'Alege tipul documentului',
      detail: summary.hasSourceFilter
        ? `Filtrul curent arată doar: ${summary.sourceLabel}.`
        : 'Vezi toate șabloanele, apoi filtrează pe facturi de intrare sau ieșire.',
      status: summary.hasSourceFilter ? 'filtrat' : 'toate',
      tone: summary.hasSourceFilter ? 'info' : 'neutral',
      active: summary.hasSourceFilter,
      onClick: clearFilter,
    },
    {
      key: 'templates',
      title: 'Verifică șabloanele active',
      detail: `${summary.activeTemplates} active, ${summary.inactiveTemplates} inactive. Șabloanele de sistem rămân reper, cele custom se adaptează firmei.`,
      status: summary.activeTemplates ? 'ok' : 'necesar',
      tone: summary.activeTemplates ? 'success' : 'warning',
      active: summary.activeTemplates > 0,
      onClick: openNew,
    },
    {
      key: 'accounts',
      title: 'Controlează conturile folosite',
      detail: summary.accountsCount
        ? `${summary.accountsCount} conturi disponibile în planul de conturi pentru selecții rapide.`
        : 'Încarcă sau verifică planul de conturi înainte să creezi șabloane noi.',
      status: summary.accountsCount ? 'pregătit' : 'lipsă',
      tone: summary.accountsCount ? 'success' : 'warning',
      active: summary.accountsCount > 0,
      onClick: openNew,
    },
    {
      key: 'usage',
      title: 'Folosește pe facturi',
      detail: 'După validare, șablonul completează mai repede conturile din facturile de intrare sau ieșire.',
      status: 'următor',
      tone: 'info',
      active: summary.customActive > 0 || summary.systemTemplates > 0,
      onClick: source === 'iesire' ? openOutgoing : openIncoming,
    },
  ]

  if (!summary.totalTemplates) {
    return {
      badge: 'Start',
      tone: 'warning',
      title: 'Creează primul șablon contabil',
      description: 'Șabloanele transformă contabilizarea repetitivă într-o alegere simplă: tip document, cont linie, TVA și terț.',
      primaryLabel: 'Șablon nou',
      primaryAction: openNew,
      steps,
    }
  }

  if (summary.hasSourceFilter && !summary.filteredTemplates) {
    return {
      badge: 'Filtru gol',
      tone: 'warning',
      title: `Nu există șabloane pentru ${summary.sourceLabel}`,
      description: 'Poți curăța filtrul ca să vezi toate șabloanele sau poți crea unul nou pentru acest tip de document.',
      primaryLabel: 'Curăță filtrul',
      primaryAction: clearFilter,
      steps,
    }
  }

  if (!summary.customActive) {
    return {
      badge: 'Doar sistem',
      tone: 'info',
      title: 'Pornești de la șabloanele de sistem',
      description: 'Șabloanele de sistem sunt bune ca reper, dar pentru o firmă reală merită create variante custom cu conturile folosite frecvent.',
      primaryLabel: 'Creează șablon custom',
      primaryAction: openNew,
      steps,
    }
  }

  return {
    badge: 'Pregătit',
    tone: 'success',
    title: `${summary.filteredTemplates} șabloane disponibile pentru ${summary.sourceLabel}`,
    description: 'Zona este pregătită: alege tipul documentului, verifică șabloanele active și folosește-le la facturi ca să reduci introducerea manuală.',
    primaryLabel: source === 'iesire' ? 'Deschide facturi ieșire' : 'Deschide facturi intrare',
    primaryAction: source === 'iesire' ? openOutgoing : openIncoming,
    steps,
  }
}

export default SabloaneNote
