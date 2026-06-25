import { useEffect, useMemo, useState } from 'react'
import api from '../../api/client'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import { AccountSelect, AccountingShell, DropdownMenu, Table } from './accounting-shared'

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

export default SabloaneNote
