import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api/client'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import { formatMoney } from '../../utils/format'
import { AccountingShell, DropdownMenu, Table } from './accounting-shared'

const blankThirdParty = (tip) => ({
  tip,
  denumire: '',
  cui: '',
  nr_reg_com: '',
  tara: 'RO',
  judet: '',
  localitate: '',
  adresa: '',
  iban: '',
  banca: '',
  telefon: '',
  email: '',
  tva_platitor: false,
  zile_scadenta: 30,
  activ: true
})

function confirmationLabel(confirmation) {
  if (!confirmation) return 'netrimisa'
  if (confirmation.status === 'confirmata') return 'confirmata'
  if (confirmation.status === 'trimisa') return 'trimisa'
  return confirmation.status || 'draft'
}

function confirmationTone(confirmation) {
  if (!confirmation) return 'neutral'
  if (confirmation.status === 'confirmata') return Math.abs(Number(confirmation.diferenta || 0)) > 0.01 ? 'warning' : 'success'
  if (confirmation.status === 'trimisa') return 'warning'
  return 'neutral'
}

export function TertiContab({ type = 'furnizor' }) {
  const [rows, setRows] = useState([])
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [confirmationSaving, setConfirmationSaving] = useState('')
  const [receiveModal, setReceiveModal] = useState(false)
  const [receiveTarget, setReceiveTarget] = useState(null)
  const [receiveForm, setReceiveForm] = useState({ confirmed_sold: '', observatii: '' })
  const [q, setQ] = useState('')
  const [activeFilter, setActiveFilter] = useState('active')
  const [confirmationFilter, setConfirmationFilter] = useState('all')
  const [form, setForm] = useState(blankThirdParty(type))
  const title = type === 'client' ? 'Clienti' : 'Furnizori'
  const statusEndpoint = type === 'client' ? '/accounting/clients-status' : '/accounting/suppliers-status'
  const invoicePath = type === 'client' ? '/contabilitate/facturi-iesire' : '/contabilitate/facturi-intrare'
  const accountKey = type === 'client' ? 'cont_analitic_client' : 'cont_analitic_furnizor'
  const tertParam = type === 'client' ? 'client' : 'furnizor'

  async function load() {
    try {
      const res = await api.get(statusEndpoint)
      setRows(res.data.rows || [])
    } catch {
      const res = await api.get('/accounting/third-parties', { params: { tip: type } })
      setRows(res.data.thirdParties || [])
    }
  }

  useEffect(() => { load().catch(() => setRows([])) }, [type])

  function openNew() {
    setEditing(null)
    setError('')
    setMessage('')
    setForm(blankThirdParty(type))
    setModal(true)
  }

  function openEdit(row) {
    setEditing(row)
    setError('')
    setMessage('')
    setForm({
      tip: row.tip || type,
      denumire: row.denumire || '',
      cui: row.cui || '',
      email: row.email || '',
      nr_reg_com: row.nr_reg_com || '',
      tara: row.tara || 'RO',
      judet: row.judet || '',
      localitate: row.localitate || '',
      adresa: row.adresa || '',
      iban: row.iban || '',
      banca: row.banca || '',
      telefon: row.telefon || '',
      tva_platitor: Boolean(row.tva_platitor),
      zile_scadenta: row.zile_scadenta || 30,
      activ: row.activ !== false
    })
    setModal(true)
  }

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (editing?.id) {
        await api.patch(`/accounting/third-parties/${editing.id}`, form)
        setMessage('Tertul a fost actualizat.')
      } else {
        await api.post('/accounting/third-parties', { ...form, tip: type })
        setMessage('Tertul a fost creat si analiticele au fost generate.')
      }
      setModal(false)
      setEditing(null)
      setForm(blankThirdParty(type))
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Tertul nu a putut fi salvat.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(row) {
    setError('')
    setMessage('')
    try {
      await api.patch(`/accounting/third-parties/${row.id}`, { activ: row.activ === false })
      setMessage(row.activ === false ? 'Tertul a fost reactivat.' : 'Tertul a fost dezactivat pentru documente noi.')
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Statusul tertului nu a putut fi schimbat.')
    }
  }

  async function openDetails(row) {
    setError('')
    setDetailLoading(true)
    setDetail({ tert: row, invoices: [], openInvoices: [], treasury: [], totals: {} })
    try {
      const res = await api.get(`${statusEndpoint}/${row.id}`)
      setDetail(res.data || { tert: row, invoices: [], openInvoices: [], treasury: [], totals: {} })
    } catch (err) {
      setDetail(null)
      setError(err.response?.data?.error || 'Detaliile tertului nu au putut fi incarcate.')
    } finally {
      setDetailLoading(false)
    }
  }

  async function creditNoteAction(note, action) {
    const reason = action === 'devalidate' ? window.prompt('Motivul devalidarii notei de credit:', '') : ''
    if (action === 'devalidate' && !reason) return
    if (action === 'storno' && !window.confirm(`Stornezi nota de credit ${note.nr_document}?`)) return
    setError('')
    setMessage('')
    try {
      await api.post(`/accounting/credit-notes/${note.uuid}/${action}`, reason ? { motiv: reason } : {})
      setMessage(action === 'validate' ? 'Nota de credit a fost validata.' : action === 'devalidate' ? 'Nota de credit a fost devalidata.' : 'Nota de credit a fost stornata.')
      await openDetails(detail.tert)
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Actiunea asupra notei de credit nu a putut fi efectuata.')
    }
  }

  function creditNoteMenu(note) {
    return [
      ['draft', 'devalidat'].includes(note.status) ? { label: 'Valideaza nota', onClick: () => creditNoteAction(note, 'validate') } : null,
      note.status === 'validat' ? { label: 'Devalideaza nota', onClick: () => creditNoteAction(note, 'devalidate'), danger: true } : null,
      note.status === 'validat' ? { label: 'Storno nota', onClick: () => creditNoteAction(note, 'storno'), danger: true } : null
    ]
  }

  const filteredRows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter(row => {
      const haystack = `${row.cod || ''} ${row.denumire || ''} ${row.cui || ''} ${row.email || ''} ${row.telefon || ''} ${row[accountKey] || ''}`.toLowerCase()
      const activeOk = activeFilter === 'all' || (activeFilter === 'active' ? row.activ !== false : row.activ === false)
      const confirmationOk = confirmationFilter === 'all' || confirmationLabel(row.confirmation) === confirmationFilter
      return activeOk && confirmationOk && (!needle || haystack.includes(needle))
    })
  }, [rows, q, activeFilter, confirmationFilter, accountKey])

  const totals = useMemo(() => ({
    count: filteredRows.length,
    active: filteredRows.filter(row => row.activ !== false).length,
    sold: filteredRows.reduce((sum, row) => sum + Number(row.sold || 0), 0),
    overdue: filteredRows.reduce((sum, row) => sum + Number(row.scadente_depasite || 0), 0),
    overdueAmount: filteredRows.reduce((sum, row) => sum + Number(row.aging?.d1_30 || 0) + Number(row.aging?.d31_60 || 0) + Number(row.aging?.d61_90 || 0) + Number(row.aging?.d90_plus || 0), 0),
    confirmationMissing: filteredRows.filter(row => confirmationLabel(row.confirmation) === 'netrimisa').length,
    confirmationSent: filteredRows.filter(row => confirmationLabel(row.confirmation) === 'trimisa').length,
    confirmationConfirmed: filteredRows.filter(row => confirmationLabel(row.confirmation) === 'confirmata').length
  }), [filteredRows])

  async function exportExcel() {
    setError('')
    try {
      const res = await api.get(`${statusEndpoint}/export`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const link = document.createElement('a')
      link.href = url
      link.download = `Scadentar_${type === 'client' ? 'clienti' : 'furnizori'}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.response?.data?.error || 'Exportul scadentar nu a putut fi generat.')
    }
  }

  async function exportConfirmationsRegister() {
    setError('')
    try {
      const res = await api.get(`${statusEndpoint}/confirmations/export`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const link = document.createElement('a')
      link.href = url
      link.download = `Registru_confirmari_sold_${type === 'client' ? 'clienti' : 'furnizori'}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.response?.data?.error || 'Registrul confirmarilor de sold nu a putut fi generat.')
    }
  }

  async function exportDetail() {
    if (!detail?.tert?.id) return
    setError('')
    try {
      const res = await api.get(`${statusEndpoint}/${detail.tert.id}/export`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const link = document.createElement('a')
      link.href = url
      const safeName = String(detail.tert.denumire || detail.tert.cod || 'tert').replace(/[^\w.-]+/g, '_')
      link.download = `Fisa_tert_${type}_${safeName}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.response?.data?.error || 'Fisa tertului nu a putut fi exportata.')
    }
  }

  async function exportConfirmation(target = detail?.tert) {
    if (!target?.id) return
    setError('')
    try {
      const res = await api.get(`${statusEndpoint}/${target.id}/confirmation`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const link = document.createElement('a')
      link.href = url
      const safeName = String(target.denumire || target.cod || 'tert').replace(/[^\w.-]+/g, '_')
      link.download = `Confirmare_sold_${type}_${safeName}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.response?.data?.error || 'Confirmarea de sold nu a putut fi exportata.')
    }
  }

  function printConfirmation(target = detail?.tert) {
    if (!target?.id) return
    const token = localStorage.getItem('infraflow_token')
    const authQuery = token ? `?token=${encodeURIComponent(token)}` : ''
    window.open(`/api${statusEndpoint}/${target.id}/confirmation/print${authQuery}`, '_blank', 'noopener,noreferrer')
  }

  function printDetail(target = detail?.tert) {
    if (type !== 'furnizor' || !target?.id) return
    const token = localStorage.getItem('infraflow_token')
    const authQuery = token ? `?token=${encodeURIComponent(token)}` : ''
    window.open(`/api/accounting/suppliers-status/${target.id}/print${authQuery}`, '_blank', 'noopener,noreferrer')
  }

  async function markConfirmation(action, payload = {}, target = detail?.tert) {
    if (!target?.id) return
    setError('')
    setMessage('')
    setConfirmationSaving(`${action}-${target.id}`)
    try {
      const res = await api.post(`${statusEndpoint}/${target.id}/confirmation/${action}`, payload)
      if (detail?.tert?.id && String(detail.tert.id) === String(target.id)) setDetail(res.data.detail || detail)
      setMessage(action === 'sent'
        ? 'Confirmarea de sold a fost marcata ca trimisa.'
        : action === 'received'
          ? 'Confirmarea de sold a fost marcata ca primita.'
          : 'Confirmarea de sold a fost anulata.')
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Statusul confirmarii de sold nu a putut fi salvat.')
    } finally {
      setConfirmationSaving('')
    }
  }

  function openReceiveConfirmation(target = detail?.tert) {
    if (!target?.id) return
    setReceiveTarget(target)
    setReceiveForm({
      confirmed_sold: String(target?.confirmation?.confirmed_sold ?? target?.sold ?? detail?.totals?.rest ?? 0),
      observatii: target?.confirmation?.observatii || ''
    })
    setReceiveModal(true)
  }

  async function submitReceiveConfirmation(event) {
    event.preventDefault()
    await markConfirmation('received', {
      confirmed_sold: receiveForm.confirmed_sold,
      observatii: receiveForm.observatii
    }, receiveTarget || detail?.tert)
    setReceiveModal(false)
    setReceiveTarget(null)
  }

  async function cancelConfirmation(row) {
    if (!row?.id) return
    const ok = window.confirm('Anulezi ultima confirmare de sold pentru acest tert? Istoricul ramane pastrat.')
    if (!ok) return
    await markConfirmation('cancel', { motiv: 'Anulare confirmare sold' }, row)
  }

  function confirmationMenu(row) {
    return [
      { label: 'Detalii tert', onClick: () => openDetails(row) },
      { label: 'Editeaza tert', onClick: () => openEdit(row) },
      { separator: true },
      { label: 'Tipareste confirmare', onClick: () => printConfirmation(row) },
      { label: 'Export confirmare sold', onClick: () => exportConfirmation(row) },
      { label: 'Marcheaza trimisa', onClick: () => markConfirmation('sent', {}, row) },
      { label: 'Marcheaza primita', onClick: () => openReceiveConfirmation(row) },
      row.confirmation ? { label: 'Anuleaza confirmarea', onClick: () => cancelConfirmation(row), danger: true } : null,
      { separator: true },
      { label: row.activ === false ? 'Reactiveaza tert' : 'Dezactiveaza tert', onClick: () => toggleActive(row), danger: row.activ !== false }
    ]
  }

  function detailActionMenu() {
    if (!detail?.tert?.id) return []
    return [
      { label: 'Marcheaza confirmare trimisa', onClick: () => markConfirmation('sent') },
      { label: 'Marcheaza confirmare primita', onClick: () => openReceiveConfirmation() },
      detail?.confirmation ? { label: 'Anuleaza confirmarea', onClick: () => cancelConfirmation(detail.tert), danger: true } : null,
      { type: 'separator' },
      { label: 'Tipareste confirmare', onClick: printConfirmation },
      { label: 'Export confirmare sold', onClick: exportConfirmation },
      { label: 'Export fisa tert', onClick: exportDetail },
      type === 'furnizor' ? { label: 'Tipareste fisa furnizor', onClick: printDetail } : null,
      { type: 'separator' },
      { label: 'Facturi tert', to: `${invoicePath}?${tertParam}=${detail.tert.id}` },
      detail?.account ? { label: 'Fisa cont analitic', to: `/contabilitate/fisa-cont/${detail.account}` } : null,
      { label: 'Trezorerie', to: `/contabilitate/trezorerie?tert=${detail.tert.id}` },
    ].filter(Boolean)
  }

  return (
    <AccountingShell
      active={type === 'client' ? 'clienti' : 'furnizori'}
      title={title}
      subtitle="Terți contabili cu analitice generate automat."
      actions={<DropdownMenu align="right" label="Actiuni" items={[
        { label: `Adauga ${type === 'client' ? 'client' : 'furnizor'}`, onClick: openNew },
        { type: 'separator' },
        { label: 'Export scadentar', onClick: exportExcel },
        { label: 'Registru confirmari sold', onClick: exportConfirmationsRegister },
      ]} />}
    >
      {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
      <Card>
        <div className="grid gap-3 xl:grid-cols-[minmax(220px,1fr)_170px_190px_110px_150px_150px_150px]">
          <Input label="Cauta tert" value={q} onChange={event => setQ(event.target.value)} placeholder="Denumire, CUI, cont..." />
          <Select label="Status" value={activeFilter} onChange={event => setActiveFilter(event.target.value)} options={[
            { value: 'active', label: 'Activi' },
            { value: 'inactive', label: 'Inactivi' },
            { value: 'all', label: 'Toti' }
          ]} />
          <Select label="Confirmare" value={confirmationFilter} onChange={event => setConfirmationFilter(event.target.value)} options={[
            { value: 'all', label: 'Toate' },
            { value: 'netrimisa', label: 'Netrimise' },
            { value: 'trimisa', label: 'Trimise' },
            { value: 'confirmata', label: 'Confirmate' }
          ]} />
          <div className="rounded-md bg-slate-50 px-3 py-2">
            <div className="text-xs text-slate-500">Terți</div>
            <div className="font-semibold">{totals.count}</div>
          </div>
          <div className="rounded-md bg-slate-50 px-3 py-2">
            <div className="text-xs text-slate-500">Sold deschis</div>
            <div className="font-semibold">{formatMoney(totals.sold)}</div>
          </div>
          <div className="rounded-md bg-slate-50 px-3 py-2">
            <div className="text-xs text-slate-500">Scadente depasite</div>
            <div className="font-semibold">{totals.overdue}</div>
          </div>
          <div className="rounded-md bg-slate-50 px-3 py-2">
            <div className="text-xs text-slate-500">Valoare depasita</div>
            <div className="font-semibold">{formatMoney(totals.overdueAmount)}</div>
          </div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <button type="button" onClick={() => setConfirmationFilter('netrimisa')} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-left hover:bg-slate-50">
            <div className="text-xs text-slate-500">Confirmari netrimise</div>
            <div className="font-semibold">{totals.confirmationMissing}</div>
          </button>
          <button type="button" onClick={() => setConfirmationFilter('trimisa')} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-left hover:bg-amber-100">
            <div className="text-xs text-amber-700">Trimise, asteapta raspuns</div>
            <div className="font-semibold text-amber-900">{totals.confirmationSent}</div>
          </button>
          <button type="button" onClick={() => setConfirmationFilter('confirmata')} className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-left hover:bg-emerald-100">
            <div className="text-xs text-emerald-700">Confirmate</div>
            <div className="font-semibold text-emerald-900">{totals.confirmationConfirmed}</div>
          </button>
        </div>
      </Card>
      <Table headers={['Cod', 'Denumire', 'CUI', 'Analitic', 'Sold', 'Nescadent', '1-30', '31-60', '61-90', '>90', 'Facturi', 'Confirmare', 'Contact', 'Status', 'Actiuni']}>
        {filteredRows.map(row => (
          <tr key={row.id}>
            <td className="px-3 py-2 font-semibold">{row.cod}</td>
            <td className="px-3 py-2">
              <div className="font-medium">{row.denumire}</div>
              <div className="text-xs text-slate-500">{row.localitate || row.judet || '-'}</div>
            </td>
            <td className="px-3 py-2">{row.cui || '-'}</td>
            <td className="px-3 py-2">
              {row[accountKey] ? <Link className="font-semibold text-primary-700 hover:underline" to={`/contabilitate/fisa-cont/${row[accountKey]}`}>{row[accountKey]}</Link> : '-'}
            </td>
            <td className="px-3 py-2 font-semibold">{formatMoney(row.sold || 0)}</td>
            <td className="px-3 py-2">{formatMoney(row.aging?.current || 0)}</td>
            <td className={`px-3 py-2 ${Number(row.aging?.d1_30 || 0) ? 'font-semibold text-amber-700' : ''}`}>{formatMoney(row.aging?.d1_30 || 0)}</td>
            <td className={`px-3 py-2 ${Number(row.aging?.d31_60 || 0) ? 'font-semibold text-orange-700' : ''}`}>{formatMoney(row.aging?.d31_60 || 0)}</td>
            <td className={`px-3 py-2 ${Number(row.aging?.d61_90 || 0) ? 'font-semibold text-rose-700' : ''}`}>{formatMoney(row.aging?.d61_90 || 0)}</td>
            <td className={`px-3 py-2 ${Number(row.aging?.d90_plus || 0) ? 'font-semibold text-red-700' : ''}`}>{formatMoney(row.aging?.d90_plus || 0)}</td>
            <td className="px-3 py-2">
              <Link className="font-semibold text-primary-700 hover:underline" to={`${invoicePath}?${tertParam}=${row.id}`}>{row.facturi || 0}</Link>
              {row.scadente_depasite ? <div className="text-xs text-rose-600">{row.scadente_depasite} depasite</div> : null}
            </td>
            <td className="px-3 py-2">
              <Badge tone={confirmationTone(row.confirmation)}>{confirmationLabel(row.confirmation)}</Badge>
              {row.confirmation?.updated_at ? <div className="mt-1 text-xs text-slate-500">{String(row.confirmation.updated_at).slice(0, 10)}</div> : null}
            </td>
            <td className="px-3 py-2">
              <div>{row.email || '-'}</div>
              <div className="text-xs text-slate-500">{row.telefon || ''}</div>
            </td>
            <td className="px-3 py-2"><Badge tone={row.activ === false ? 'neutral' : 'success'}>{row.activ === false ? 'inactiv' : 'activ'}</Badge></td>
            <td className="px-3 py-2">
              <DropdownMenu align="right" label={confirmationSaving.endsWith(`-${row.id}`) ? 'Se salveaza...' : 'Actiuni'} items={confirmationMenu(row)} />
            </td>
          </tr>
        ))}
      </Table>
      <Modal open={modal} title={`${editing ? 'Editeaza' : 'Adauga'} ${type === 'client' ? 'client' : 'furnizor'}`} onClose={() => setModal(false)}>
        <form className="grid gap-3" onSubmit={submit}>
          {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Denumire" value={form.denumire} onChange={event => setForm({ ...form, denumire: event.target.value })} required />
            <Input label="CUI / CIF" value={form.cui} onChange={event => setForm({ ...form, cui: event.target.value })} />
            <Input label="Nr. reg. com." value={form.nr_reg_com || ''} onChange={event => setForm({ ...form, nr_reg_com: event.target.value })} />
            <Input label="Email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} />
            <Input label="Telefon" value={form.telefon || ''} onChange={event => setForm({ ...form, telefon: event.target.value })} />
            <Input label="Tara" value={form.tara || 'RO'} onChange={event => setForm({ ...form, tara: event.target.value })} maxLength={2} />
            <Input label="Judet" value={form.judet || ''} onChange={event => setForm({ ...form, judet: event.target.value })} />
            <Input label="Localitate" value={form.localitate || ''} onChange={event => setForm({ ...form, localitate: event.target.value })} />
            <Input label="IBAN" value={form.iban || ''} onChange={event => setForm({ ...form, iban: event.target.value })} />
            <Input label="Banca" value={form.banca || ''} onChange={event => setForm({ ...form, banca: event.target.value })} />
            <Input label="Zile scadenta" type="number" min="0" value={form.zile_scadenta || 0} onChange={event => setForm({ ...form, zile_scadenta: Number(event.target.value || 0) })} />
            <Select label="Tip tert" value={form.tip || type} onChange={event => setForm({ ...form, tip: event.target.value })} options={[
              { value: 'furnizor', label: 'Furnizor' },
              { value: 'client', label: 'Client' },
              { value: 'ambele', label: 'Furnizor si client' }
            ]} />
          </div>
          <Input label="Adresa" value={form.adresa || ''} onChange={event => setForm({ ...form, adresa: event.target.value })} />
          <div className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 md:grid-cols-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={Boolean(form.tva_platitor)} onChange={event => setForm({ ...form, tva_platitor: event.target.checked })} />
              Platitor TVA
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.activ !== false} onChange={event => setForm({ ...form, activ: event.target.checked })} />
              Activ pentru documente noi
            </label>
          </div>
          {editing ? (
            <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Analitice: furnizor {editing.cont_analitic_furnizor || '-'} / client {editing.cont_analitic_client || '-'}.
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal(false)}>Renunta</Button>
            <Button type="submit" loading={saving}>Salveaza</Button>
          </div>
        </form>
      </Modal>
      <Modal open={Boolean(detail)} title={`Scadentar ${detail?.tert?.denumire || ''}`} onClose={() => setDetail(null)}>
        {detailLoading ? (
          <div className="py-8 text-center text-sm text-slate-500">Se incarca detaliile...</div>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <div className="text-xs text-slate-500">Sold deschis</div>
                <div className="font-semibold">{formatMoney(detail?.totals?.rest || 0)}</div>
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <div className="text-xs text-slate-500">Depasit</div>
                <div className="font-semibold text-rose-700">{formatMoney(detail?.totals?.overdue || 0)}</div>
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <div className="text-xs text-slate-500">Facturi deschise</div>
                <div className="font-semibold">{detail?.totals?.open || 0}</div>
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <div className="text-xs text-slate-500">Analitic</div>
                <div className="font-semibold">{detail?.account || '-'}</div>
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <div className="text-xs text-slate-500">{type === 'client' ? 'Incasari' : 'Plati'}</div>
                <div className="font-semibold">{formatMoney(type === 'client' ? detail?.totals?.treasury_in || 0 : detail?.totals?.treasury_out || 0)}</div>
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <div className="text-xs text-slate-500">Operatii trezorerie</div>
                <div className="font-semibold">{detail?.totals?.treasury_count || 0}</div>
              </div>
              {type === 'furnizor' ? <div className="rounded-md bg-slate-50 px-3 py-2"><div className="text-xs text-slate-500">Note de credit</div><div className="font-semibold">{formatMoney(detail?.totals?.credit || 0)}</div></div> : null}
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {detail?.tert?.cui ? <span>CUI {detail.tert.cui}</span> : <span>CUI necompletat</span>}
              {detail?.tert?.email ? <span> · {detail.tert.email}</span> : null}
              {detail?.tert?.telefon ? <span> · {detail.tert.telefon}</span> : null}
            </div>
            <div className="grid gap-3 rounded-md border border-slate-200 bg-white px-3 py-3 text-sm md:grid-cols-[1fr_auto]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">Confirmare sold</span>
                  <Badge tone={confirmationTone(detail?.confirmation)}>{confirmationLabel(detail?.confirmation)}</Badge>
                </div>
                <div className="mt-1 text-slate-600">
                  {detail?.confirmation
                    ? `Sold ${formatMoney(detail.confirmation.sold || 0)} · deschis ${detail.confirmation.facturi_deschise || 0} facturi · actualizat ${String(detail.confirmation.updated_at || detail.confirmation.created_at || '').slice(0, 10)}`
                    : 'Nu exista confirmare de sold marcata pentru acest tert.'}
                  {Math.abs(Number(detail?.confirmation?.diferenta || 0)) > 0.01 ? ` · diferenta ${formatMoney(detail.confirmation.diferenta)}` : ''}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <DropdownMenu align="right" label={confirmationSaving ? 'Se salveaza...' : 'Actiuni confirmare'} items={detailActionMenu()} />
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <DropdownMenu align="right" label="Actiuni tert" items={detailActionMenu()} />
            </div>
            <Table headers={['Data', 'Document', 'Scadenta', 'Total', type === 'client' ? 'Incasat' : 'Achitat', 'Rest', 'Intarziere', 'Actiuni']}>
              {(detail?.openInvoices || []).map(invoice => (
                <tr key={`${invoice.id}-${invoice.nr_document}`} className="hover:bg-slate-50">
                  <td className="px-3 py-2">{invoice.data || '-'}</td>
                  <td className="px-3 py-2">
                    <div className="font-semibold">{invoice.nr_document || '-'}</div>
                    <div className="text-xs text-slate-500">{invoice.explicatie || '-'}</div>
                  </td>
                  <td className="px-3 py-2">{invoice.data_scadenta || '-'}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(invoice.total || 0)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(invoice.paid || 0)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatMoney(invoice.rest || 0)}</td>
                  <td className={`px-3 py-2 ${invoice.overdue ? 'font-semibold text-rose-700' : 'text-slate-500'}`}>
                    {invoice.overdue ? `${invoice.days_overdue} zile` : 'nescadent'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <Link className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" to={invoice.invoice_url}>Factura</Link>
                      <Link className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" to={invoice.treasury_url}>{type === 'client' ? 'Incaseaza' : 'Plateste'}</Link>
                    </div>
                  </td>
                </tr>
              ))}
              {(detail?.openInvoices || []).length ? null : (
                <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={8}>Nu exista facturi deschise pentru acest tert.</td></tr>
              )}
            </Table>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Istoric facturi</h3>
              <Table headers={['Data', 'Document', 'Scadenta', 'Status', 'Total', type === 'client' ? 'Incasat' : 'Achitat', 'Rest', 'Actiuni']}>
                {(detail?.invoices || []).slice().sort((a, b) => String(b.data || '').localeCompare(String(a.data || ''))).slice(0, 30).map(invoice => (
                  <tr key={`history-${invoice.id}-${invoice.nr_document}`} className="hover:bg-slate-50">
                    <td className="px-3 py-2">{invoice.data || '-'}</td>
                    <td className="px-3 py-2">
                      <div className="font-semibold">{invoice.nr_document || '-'}</div>
                      <div className="text-xs text-slate-500">{invoice.explicatie || '-'}</div>
                    </td>
                    <td className="px-3 py-2">{invoice.data_scadenta || '-'}</td>
                    <td className="px-3 py-2"><Badge tone={invoice.rest > 0 ? 'warning' : 'success'}>{invoice.status || '-'}</Badge></td>
                    <td className="px-3 py-2 text-right">{formatMoney(invoice.total || 0)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(invoice.paid || 0)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatMoney(invoice.rest || 0)}</td>
                    <td className="px-3 py-2">
                      <Link className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" to={invoice.invoice_url}>Factura</Link>
                    </td>
                  </tr>
                ))}
                {(detail?.invoices || []).length ? null : (
                  <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={8}>Nu exista facturi in istoricul acestui tert.</td></tr>
                )}
              </Table>
              {(detail?.invoices || []).length > 30 ? (
                <div className="mt-2 text-xs text-slate-500">Sunt afisate ultimele 30 facturi.</div>
              ) : null}
            </div>
            {type === 'furnizor' ? <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Note de credit furnizor</h3>
              <Table headers={['Data', 'Document', 'Factura', 'Status', 'Baza', 'TVA', 'Total', 'Actiuni']}>
                {(detail?.creditNotes || []).map(note => <tr key={note.uuid || note.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">{note.data || '-'}</td><td className="px-3 py-2 font-semibold">{note.nr_document || '-'}</td><td className="px-3 py-2">{note.invoice_document || '-'}</td>
                  <td className="px-3 py-2"><Badge tone={note.status === 'validat' ? 'success' : note.status === 'stornat' ? 'neutral' : 'warning'}>{note.status || '-'}</Badge></td>
                  <td className="px-3 py-2 text-right">{formatMoney(note.valoare || 0)}</td><td className="px-3 py-2 text-right">{formatMoney(note.tva || 0)}</td><td className="px-3 py-2 text-right font-semibold">{formatMoney(note.total || 0)}</td>
                  <td className="px-3 py-2"><DropdownMenu align="right" label="Actiuni" items={creditNoteMenu(note)} /></td>
                </tr>)}
                {(detail?.creditNotes || []).length ? null : <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={8}>Nu exista note de credit pentru acest furnizor.</td></tr>}
              </Table>
            </div> : null}
            {type === 'furnizor' ? <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Circuit Achizitii - Contabilitate</h3>
              <Table headers={['Comanda', 'NIR', 'Factura', 'Plata', 'Retur', 'Status circuit']}>
                {(detail?.procurement?.lifecycle || []).slice(0, 30).map(row => <tr key={row.order_uuid || row.order_id} className="hover:bg-slate-50">
                  <td className="px-3 py-2"><div className="font-semibold">{row.order_no}</div><div className="text-xs text-slate-500">{row.date || '-'} · {row.status || '-'}</div></td>
                  <td className="px-3 py-2"><Badge tone={row.receptions ? 'success' : 'warning'}>{row.receptions || 0}</Badge><div className="mt-1 text-xs">{formatMoney(row.reception_total || 0)}</div></td>
                  <td className="px-3 py-2"><Badge tone={row.invoices ? 'success' : 'warning'}>{row.invoices || 0}</Badge><div className="mt-1 text-xs">{formatMoney(row.invoice_total || 0)}</div></td>
                  <td className="px-3 py-2"><Badge tone={row.payments ? 'success' : 'neutral'}>{row.payments || 0}</Badge><div className="mt-1 text-xs">{formatMoney(row.paid_total || 0)}</div></td>
                  <td className="px-3 py-2"><Badge tone={row.returns ? 'warning' : 'neutral'}>{row.returns || 0}</Badge><div className="mt-1 text-xs">{formatMoney(row.return_total || 0)}</div></td>
                  <td className="px-3 py-2"><Badge tone={row.complete ? 'success' : 'warning'}>{row.complete ? 'Finalizat' : 'In lucru'}</Badge><div className="mt-1 text-xs text-slate-600">{row.missing_step}</div></td>
                </tr>)}
                {(detail?.procurement?.lifecycle || []).length ? null : <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={6}>Nu exista comenzi corelate cu acest furnizor.</td></tr>}
              </Table>
            </div> : null}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Miscari trezorerie</h3>
              <Table headers={['Data', 'Document', 'Operatie', 'Cont', 'Suma', 'Status', 'Factura', 'Actiuni']}>
                {(detail?.treasury || []).slice(0, 30).map(row => (
                  <tr key={`${row.uuid || row.id}-${row.nr_document}`} className="hover:bg-slate-50">
                    <td className="px-3 py-2">{row.data || '-'}</td>
                    <td className="px-3 py-2">
                      <div className="font-semibold">{row.nr_document || '-'}</div>
                      <div className="text-xs text-slate-500">{row.explicatie || '-'}</div>
                    </td>
                    <td className="px-3 py-2">{row.tip_operatie || '-'}</td>
                    <td className="px-3 py-2">
                      <div>{row.cont_trezorerie || '-'}</div>
                      <div className="text-xs text-slate-500">{row.cont_corespondent || '-'}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">{formatMoney(row.suma || 0)}</td>
                    <td className="px-3 py-2"><Badge tone={row.status === 'validat' ? 'success' : 'neutral'}>{row.status || '-'}</Badge></td>
                    <td className="px-3 py-2">{row.linked_invoice?.document || '-'}</td>
                    <td className="px-3 py-2">
                      <Link className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" to={row.treasury_url}>Trezorerie</Link>
                    </td>
                  </tr>
                ))}
                {(detail?.treasury || []).length ? null : (
                  <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={8}>Nu exista miscari de trezorerie pentru acest tert.</td></tr>
                )}
              </Table>
              {(detail?.treasury || []).length > 30 ? (
                <div className="mt-2 text-xs text-slate-500">Sunt afisate ultimele 30 operatii.</div>
              ) : null}
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setDetail(null)}>Inchide</Button>
            </div>
          </div>
        )}
      </Modal>
      <Modal open={receiveModal} title="Confirmare sold primita" onClose={() => setReceiveModal(false)}>
        <form className="grid gap-3" onSubmit={submitReceiveConfirmation}>
          <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
            Sold in evidenta: <strong>{formatMoney(receiveTarget?.sold ?? detail?.totals?.rest ?? 0)}</strong>
          </div>
          <Input
            label="Sold confirmat"
            type="number"
            step="0.01"
            value={receiveForm.confirmed_sold}
            onChange={event => setReceiveForm({ ...receiveForm, confirmed_sold: event.target.value })}
          />
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Observatii
            <textarea
              className="min-h-[96px] rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              value={receiveForm.observatii}
              onChange={event => setReceiveForm({ ...receiveForm, observatii: event.target.value })}
              placeholder="Ex: confirmat integral / diferenta explicata de plata in curs..."
            />
          </label>
          <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
            Diferenta calculata: <strong>{formatMoney(Number(receiveForm.confirmed_sold || 0) - Number(receiveTarget?.sold ?? detail?.totals?.rest ?? 0))}</strong>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => { setReceiveModal(false); setReceiveTarget(null) }}>Renunta</Button>
            <Button type="submit" loading={confirmationSaving.startsWith('received-')}>Salveaza confirmarea</Button>
          </div>
        </form>
      </Modal>
    </AccountingShell>
  )
}

export default TertiContab

