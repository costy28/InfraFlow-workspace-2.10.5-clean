import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../../api/client'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import { formatMoney } from '../../utils/format'
import { AccountSelect, AccountingShell, Info, Table, currentMonth, money, statusTone, today } from './accounting-shared'
export function FacturiContab({ direction = 'in' }) {
  const isIn = direction === 'in'
  const [rows, setRows] = useState([])
  const [searchParams] = useSearchParams()
  const [thirdParties, setThirdParties] = useState([])
  const [accounts, setAccounts] = useState([])
  const [costCenters, setCostCenters] = useState([])
  const [month, setMonth] = useState(searchParams.get('luna') || currentMonth())
  const [status, setStatus] = useState('')
  const [tertFilter, setTertFilter] = useState(searchParams.get(isIn ? 'furnizor' : 'client') || '')
  const [q, setQ] = useState('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [journalModal, setJournalModal] = useState(false)
  const [journalData, setJournalData] = useState(null)
  const [paymentModal, setPaymentModal] = useState(false)
  const [paymentRow, setPaymentRow] = useState(null)
  const [paymentForm, setPaymentForm] = useState({ data: today(), suma: '', cont_trezorerie: '5121', nr_document: '' })
  const [devalidateModal, setDevalidateModal] = useState(false)
  const [devalidateRow, setDevalidateRow] = useState(null)
  const [devalidateReason, setDevalidateReason] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [validatedJournal, setValidatedJournal] = useState(null)
  const [actionLoading, setActionLoading] = useState('')
  const emptyLine = () => ({ denumire: '', cont: isIn ? '628' : '704', valoare: '', tva_procent: 21 })
  const [form, setForm] = useState({ data: today(), valoare: '', tva_procent: 21, cont_cheltuiala: '628', cont_venit: '704', lines: [emptyLine()] })
  const endpoint = isIn ? '/accounting/invoices-in' : '/accounting/invoices-out'
  async function load() {
    const [an, luna] = month.split('-')
    const [a, t, c, cc] = await Promise.all([
      api.get(endpoint, { params: { an, luna: Number(luna), status: status || undefined, [isIn ? 'furnizor' : 'client']: tertFilter || undefined } }),
      api.get('/accounting/third-parties', { params: { tip: isIn ? 'furnizor' : 'client' } }),
      api.get('/accounting/chart'),
      api.get('/accounting/cost-centers')
    ])
    setRows(a.data.invoices || [])
    setThirdParties(t.data.thirdParties || [])
    setAccounts(c.data.accounts || [])
    setCostCenters(cc.data.costCenters || [])
  }
  useEffect(() => {
    setTertFilter(searchParams.get(isIn ? 'furnizor' : 'client') || '')
  }, [direction, searchParams])
  useEffect(() => { load().catch(() => {}) }, [direction, month, status, tertFilter])
  const invoiceLines = Array.isArray(form.lines) ? form.lines : []
  const thirdPartyById = useMemo(() => new Map(thirdParties.map(tert => [String(tert.id), tert])), [thirdParties])
  const visibleRows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(row => {
      const tert = thirdPartyById.get(String(row.furnizor_id || row.client_id))
      return `${row.data || ''} ${row.nr_document || ''} ${row.serie || ''} ${row.numar || ''} ${row.explicatie || ''} ${tert?.denumire || ''} ${tert?.cui || ''}`.toLowerCase().includes(needle)
    })
  }, [rows, q, thirdPartyById])
  const visibleTotals = useMemo(() => ({
    count: visibleRows.length,
    total: visibleRows.reduce((sum, row) => sum + money(row.total), 0),
    tva: visibleRows.reduce((sum, row) => sum + money(row.tva), 0),
    draft: visibleRows.filter(row => row.status === 'draft').length,
    rest: visibleRows.reduce((sum, row) => sum + invoiceRemaining(row), 0)
  }), [visibleRows])
  const valoareLines = invoiceLines.reduce((sum, line) => sum + money(line.valoare), 0)
  const tvaLines = invoiceLines.reduce((sum, line) => sum + money(line.valoare) * money(line.tva_procent) / 100, 0)
  const baseValue = invoiceLines.length ? valoareLines : money(form.valoare)
  const total = invoiceLines.length ? baseValue + tvaLines : money(form.valoare) + money(form.valoare) * money(form.tva_procent) / 100
  const mainCostCenters = costCenters.filter(center => !center.parinte_id)
  const subcenters = costCenters.filter(center => String(center.parinte_id || '') === String(form.cost_center_id || ''))
  const costCenterName = id => costCenters.find(center => String(center.id) === String(id))?.denumire || costCenters.find(center => String(center.id) === String(id))?.name || ''
  function openNew() {
    setEditing(null)
    setError('')
    setMessage('')
    setValidatedJournal(null)
    setForm({ data: today(), valoare: '', tva_procent: 21, cont_cheltuiala: '628', cont_venit: '704', cost_center_id: '', subcentru_id: '', lines: [emptyLine()] })
    setModal(true)
  }
  function openEdit(row) {
    setEditing(row)
    setError('')
    setMessage('')
    setValidatedJournal(null)
    setForm({
      tert_id: row.furnizor_id || row.client_id || '',
      nr_document: row.nr_document || row.numar || '',
      numar: row.numar || row.nr_document || '',
      data: row.data || today(),
      data_scadenta: row.data_scadenta || '',
      valoare: row.valoare || '',
      tva_procent: row.tva_procent ?? 21,
      cont_cheltuiala: row.cont_cheltuiala || '628',
      cont_venit: row.cont_venit || '704',
      cost_center_id: row.cost_center_id || '',
      subcentru_id: row.subcentru_id || '',
      lines: Array.isArray(row.lines) && row.lines.length ? row.lines.map(line => ({
        denumire: line.denumire || '',
        cont: line.cont || (isIn ? row.cont_cheltuiala || '628' : row.cont_venit || '704'),
        valoare: line.valoare || '',
        tva_procent: line.tva_procent ?? row.tva_procent ?? 21
      })) : [{ denumire: row.explicatie || '', cont: isIn ? row.cont_cheltuiala || '628' : row.cont_venit || '704', valoare: row.valoare || '', tva_procent: row.tva_procent ?? 21 }],
      explicatie: row.explicatie || ''
    })
    setModal(true)
  }
  function updateLine(index, patch) {
    const lines = [...invoiceLines]
    lines[index] = { ...lines[index], ...patch }
    setForm({ ...form, lines })
  }
  function addLine() {
    setForm({ ...form, lines: [...invoiceLines, emptyLine()] })
  }
  function removeLine(index) {
    const lines = invoiceLines.filter((_, lineIndex) => lineIndex !== index)
    setForm({ ...form, lines: lines.length ? lines : [emptyLine()] })
  }
  async function submit(event) {
    event.preventDefault()
    try {
      setError('')
      setMessage('')
      setValidatedJournal(null)
      const formHint = invoiceFormHint()
      if (formHint) {
        setError(formHint)
        return
      }
      const partyId = form.tert_id
      const payload = {
        ...form,
        furnizor_id: isIn ? partyId : undefined,
        client_id: isIn ? undefined : partyId,
        nr_document: form.nr_document || form.numar || 'DOC-1',
        numar: form.numar || undefined,
        valoare: money(baseValue),
        tva_procent: money(form.tva_procent),
        lines: invoiceLines
          .map((line, index) => ({
            nr_crt: index + 1,
            denumire: line.denumire || '',
            cont: line.cont || (isIn ? form.cont_cheltuiala || '628' : form.cont_venit || '704'),
            valoare: money(line.valoare),
            tva_procent: money(line.tva_procent)
          }))
          .filter(line => line.valoare > 0)
          .map(line => ({ ...line, denumire: line.denumire || `Linia ${line.nr_crt}` })),
        cost_center_id: form.cost_center_id || null,
        subcentru_id: form.subcentru_id || null
      }
      if (editing?.uuid) await api.patch(`${endpoint}/${editing.uuid}`, payload)
      else await api.post(endpoint, payload)
      setModal(false)
      setEditing(null)
      setMessage(editing ? 'Factura draft a fost salvată.' : 'Factura a fost creată ca draft. Următorul pas: validează factura.')
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Factura nu a putut fi salvata.')
    }
  }
  async function validate(row) {
    const hint = invoiceValidationHint(row)
    if (hint) {
      setError(hint)
      setMessage('')
      setValidatedJournal(null)
      return
    }
    setActionLoading(`validate-${row.uuid}`)
    try {
      setError('')
      setMessage('')
      setValidatedJournal(null)
      const res = await api.post(`${endpoint}/${row.uuid}/validate`)
      const journal = res.data?.journal
      setValidatedJournal(journal ? {
        id: journal.id,
        uuid: journal.uuid,
        month: row.balance_month || row.data?.slice(0, 7) || month,
        totalDebit: journal.total_debit,
        totalCredit: journal.total_credit
      } : null)
      setMessage('Factura a fost validată și nota contabilă a fost generată.')
      await load()
    } catch (err) {
      setError(errorText(err, 'Factura nu a putut fi validată. Verifică perioada, terțul, conturile și liniile facturii.'))
    } finally {
      setActionLoading('')
    }
  }
  async function storno(row) {
    if (!window.confirm('Stornezi documentul selectat?')) return
    setActionLoading(`storno-${row.uuid}`)
    try {
      setError('')
      setMessage('')
      setValidatedJournal(null)
      await api.post(`${endpoint}/${row.uuid}/storno`)
      setMessage('Factura a fost stornată, iar nota storno a fost generată.')
      await load()
    } catch (err) {
      setError(errorText(err, 'Factura nu a putut fi stornată. Verifică dacă există nota contabilă și luna este deschisă.'))
    } finally {
      setActionLoading('')
    }
  }
  async function devalidate(row) {
    setDevalidateRow(row)
    setDevalidateReason('')
    setDevalidateModal(true)
  }
  async function submitDevalidate(event) {
    event.preventDefault()
    if (!devalidateRow) return
    try {
      setError('')
      setMessage('')
      setValidatedJournal(null)
      setActionLoading(`devalidate-${devalidateRow.uuid}`)
      await api.post(`${endpoint}/${devalidateRow.uuid}/devalidate`, { motiv: devalidateReason })
      setDevalidateModal(false)
      setDevalidateRow(null)
      setMessage('Factura a fost devalidată și revine în draft.')
      await load()
    } catch (err) {
      setError(errorText(err, 'Factura nu a putut fi devalidată. Verifică dacă luna este deschisă și nota contabilă există.'))
    } finally {
      setActionLoading('')
    }
  }
  async function showJournal(row) {
    if (!row.journal_id) {
      setError('Factura nu are nota contabila atasata.')
      setMessage('')
      return
    }
    try {
      setError('')
      const res = await api.get(`/accounting/journals/${row.journal_id}`)
      setJournalData(res.data.journal)
      setJournalModal(true)
    } catch (err) {
      setError(err.response?.data?.error || 'Nota contabila nu a putut fi incarcata.')
    }
  }
  async function cancelDraft(row) {
    if (!window.confirm('Anulezi documentul draft selectat?')) return
    setActionLoading(`cancel-${row.uuid}`)
    try {
      setError('')
      setMessage('')
      setValidatedJournal(null)
      await api.delete(`${endpoint}/${row.uuid}`, { data: { motiv: 'Anulare document draft' } })
      setMessage('Factura draft a fost anulată.')
      await load()
    } catch (err) {
      setError(errorText(err, 'Factura nu a putut fi anulată. Doar documentele draft se pot anula direct.'))
    } finally {
      setActionLoading('')
    }
  }
  function invoicePaid(row) {
    return money(isIn ? row.achitat : row.incasat)
  }
  function invoiceRemaining(row) {
    return money(isIn ? row.neachitat ?? money(row.total) - money(row.achitat) : row.neincasat ?? money(row.total) - money(row.incasat))
  }
  function canPayInvoice(row) {
    return ['validat', 'partial'].includes(String(row.status || '')) && invoiceRemaining(row) > 0
  }
  function openPayment(row) {
    setPaymentRow(row)
    setPaymentForm({
      data: today(),
      suma: invoiceRemaining(row) || '',
      cont_trezorerie: '5121',
      nr_document: ''
    })
    setError('')
    setMessage('')
    setValidatedJournal(null)
    setPaymentModal(true)
  }
  async function submitPayment(event) {
    event.preventDefault()
    if (!paymentRow) return
    const amount = money(paymentForm.suma)
    const remaining = invoiceRemaining(paymentRow)
    if (!amount || amount <= 0) {
      setError(`Completează suma de ${isIn ? 'plată' : 'încasare'}.`)
      return
    }
    if (amount > remaining + 0.01) {
      setError(`Suma depășește restul facturii: ${formatMoney(remaining)}.`)
      return
    }
    setActionLoading(`payment-${paymentRow.uuid}`)
    setError('')
    setMessage('')
    try {
      const res = await api.post(`${endpoint}/${paymentRow.uuid}/${isIn ? 'pay' : 'collect'}`, {
        data: paymentForm.data || today(),
        suma: amount,
        cont_trezorerie: paymentForm.cont_trezorerie || '5121',
        nr_document: paymentForm.nr_document || undefined
      })
      const journal = res.data?.journal
      setValidatedJournal(journal ? {
        id: journal.id,
        uuid: journal.uuid,
        month: paymentForm.data?.slice(0, 7) || month,
        totalDebit: journal.total_debit,
        totalCredit: journal.total_credit
      } : null)
      setPaymentModal(false)
      setPaymentRow(null)
      setMessage(isIn ? 'Plata a fost înregistrată și nota contabilă a fost generată.' : 'Încasarea a fost înregistrată și nota contabilă a fost generată.')
      await load()
    } catch (err) {
      setError(errorText(err, isIn ? 'Plata nu a putut fi înregistrată.' : 'Încasarea nu a putut fi înregistrată.'))
    } finally {
      setActionLoading('')
    }
  }
  function invoiceValidationHint(row) {
    if (row.status !== 'draft') return 'Factura trebuie să fie în status draft pentru validare.'
    if (!row.data) return 'Completează data facturii înainte de validare.'
    if (!money(row.total) || money(row.total) <= 0) return 'Factura trebuie să aibă total pozitiv înainte de validare.'
    if (isIn && !row.furnizor_id) return 'Selectează furnizorul înainte de validare.'
    if (!isIn && !row.client_id) return 'Selectează clientul înainte de validare.'
    const mainAccount = isIn ? row.cont_cheltuiala : row.cont_venit
    if (!mainAccount) return `Completează contul ${isIn ? 'de cheltuială' : 'de venit'} înainte de validare.`
    if (accounts.length && !accountExists(mainAccount)) return `Contul ${mainAccount} nu există în planul de conturi. Alege contul din listă sau adaugă-l în Plan de conturi.`
    const lines = Array.isArray(row.lines) ? row.lines : []
    if (!lines.length) return 'Adaugă cel puțin o linie de factură înainte de validare.'
    const missingAccountLine = lines.findIndex(line => !line.cont)
    if (missingAccountLine >= 0) return `Linia ${missingAccountLine + 1}: selectează contul contabil înainte de validare.`
    const invalidValueLine = lines.findIndex(line => !money(line.valoare) || money(line.valoare) <= 0)
    if (invalidValueLine >= 0) return `Linia ${invalidValueLine + 1}: completează o valoare pozitivă înainte de validare.`
    const invalidAccountLine = accounts.length ? lines.findIndex(line => line.cont && !accountExists(line.cont)) : -1
    if (invalidAccountLine >= 0) return `Linia ${invalidAccountLine + 1}: contul ${lines[invalidAccountLine].cont} nu există în planul de conturi. Alege contul din listă sau adaugă-l în Plan de conturi.`
    return ''
  }

  function invoiceFormHint() {
    if (!thirdParties.length) return `Nu există ${isIn ? 'furnizori' : 'clienți'} în contabilitate. Creează terțul înainte de factură.`
    if (!form.tert_id) return `Selectează ${isIn ? 'furnizorul' : 'clientul'} înainte de salvare.`
    if (!(form.nr_document || form.numar || '').trim()) return 'Completează numărul documentului înainte de salvare.'
    if (!form.data) return 'Completează data facturii înainte de salvare.'
    const mainAccount = isIn ? form.cont_cheltuiala : form.cont_venit
    if (!mainAccount) return `Completează contul ${isIn ? 'de cheltuială' : 'de venit'} înainte de salvare.`
    if (accounts.length && !accountExists(mainAccount)) return `Contul ${mainAccount} nu există în planul de conturi. Alege contul din listă sau adaugă-l în Plan de conturi.`
    if (!invoiceLines.length) return 'Adaugă cel puțin o linie de factură.'
    const invalidLine = invoiceLines.findIndex(line => !money(line.valoare) || money(line.valoare) <= 0)
    if (invalidLine >= 0) return `Linia ${invalidLine + 1}: completează o valoare pozitivă.`
    const missingLineAccount = invoiceLines.findIndex(line => !line.cont)
    if (missingLineAccount >= 0) return `Linia ${missingLineAccount + 1}: selectează contul contabil.`
    const invalidAccountLine = accounts.length ? invoiceLines.findIndex(line => line.cont && !accountExists(line.cont)) : -1
    if (invalidAccountLine >= 0) return `Linia ${invalidAccountLine + 1}: contul ${invoiceLines[invalidAccountLine].cont} nu există în planul de conturi. Alege contul din listă sau adaugă-l în Plan de conturi.`
    return ''
  }

  function accountExists(symbol) {
    return accounts.some(account => account.simbol === String(symbol || '').trim() && account.activ !== false)
  }
  function errorText(err, fallback) {
    return err.response?.data?.error || err.response?.data?.message || fallback
  }
  return (
    <AccountingShell active={isIn ? 'intrare' : 'iesire'} title={isIn ? 'Facturi intrare' : 'Facturi iesire'} subtitle="Validarea genereaza automat nota contabila echilibrata." actions={<Button onClick={openNew}>+ Factura</Button>}>
      {error ? <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? (
        <div className="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
          {validatedJournal ? (
            <span className="ml-2">
              <Link className="font-semibold underline" to={`/contabilitate/registru-jurnal?luna=${validatedJournal.month}`}>Vezi registru jurnal</Link>
              <span> · </span>
              <Link className="font-semibold underline" to={`/contabilitate/balanta?luna=${validatedJournal.month}`}>Verifică balanța</Link>
            </span>
          ) : null}
        </div>
      ) : null}
      <Card>
        <div className="grid gap-3 lg:grid-cols-[180px_180px_minmax(220px,1fr)_minmax(180px,1fr)_auto]">
          <Input label="Luna" type="month" value={month} onChange={event => setMonth(event.target.value)} />
          <Select label="Status" value={status} onChange={event => setStatus(event.target.value)} options={[
            { value: '', label: 'Toate fara anulate' },
            { value: 'draft', label: 'Draft' },
            { value: 'validat', label: 'Validate' },
            { value: 'partial', label: 'Partial' },
            { value: isIn ? 'achitat' : 'incasat', label: isIn ? 'Achitate' : 'Incasate' },
            { value: 'stornat', label: 'Stornate' },
            { value: 'anulat', label: 'Anulate' }
          ]} />
          <Select label={isIn ? 'Furnizor' : 'Client'} value={tertFilter} onChange={event => setTertFilter(event.target.value)} options={[
            { value: '', label: `Toti ${isIn ? 'furnizorii' : 'clientii'}` },
            ...thirdParties.map(tert => ({ value: tert.id, label: `${tert.cod} - ${tert.denumire}` }))
          ]} />
          <Input label="Cauta" value={q} onChange={event => setQ(event.target.value)} placeholder="Document, tert, CUI..." />
          <div className="flex items-end justify-end"><Button variant="secondary" onClick={load}>Reincarca</Button></div>
        </div>
      </Card>
      <div className="grid gap-3 md:grid-cols-4">
        <Card density="compact"><div className="text-xs text-slate-500">Facturi filtrate</div><div className="text-lg font-semibold">{visibleTotals.count}</div></Card>
        <Card density="compact"><div className="text-xs text-slate-500">Total</div><div className="text-lg font-semibold">{formatMoney(visibleTotals.total)}</div></Card>
        <Card density="compact"><div className="text-xs text-slate-500">TVA</div><div className="text-lg font-semibold">{formatMoney(visibleTotals.tva)}</div></Card>
        <Card density="compact"><div className="text-xs text-slate-500">Rest deschis</div><div className="text-lg font-semibold">{formatMoney(visibleTotals.rest)}</div></Card>
      </div>
      <Table headers={['Data', 'Document', 'Tert', 'Centru cost', 'Valoare', 'TVA', 'Total', isIn ? 'Achitat' : 'Incasat', 'Rest', 'Status', 'Nota', 'Actiuni']}>
        {visibleRows.map(row => (
          <tr key={row.uuid}>
            <td className="px-3 py-2">{row.data}</td>
            <td className="px-3 py-2">{row.nr_document || `${row.serie || ''} ${row.numar || ''}`}</td>
            <td className="px-3 py-2">
              {thirdPartyById.get(String(row.furnizor_id || row.client_id))?.denumire || row.furnizor_id || row.client_id}
              {thirdPartyById.get(String(row.furnizor_id || row.client_id))?.cui ? <div className="text-xs text-slate-500">{thirdPartyById.get(String(row.furnizor_id || row.client_id))?.cui}</div> : null}
            </td>
            <td className="px-3 py-2">{costCenterName(row.subcentru_id) || costCenterName(row.cost_center_id) || '-'}</td>
            <td className="px-3 py-2">{formatMoney(row.valoare)}</td>
            <td className="px-3 py-2">{formatMoney(row.tva)}</td>
            <td className="px-3 py-2 font-semibold">{formatMoney(row.total)}</td>
            <td className="px-3 py-2">{formatMoney(invoicePaid(row))}</td>
            <td className="px-3 py-2 font-semibold">{formatMoney(invoiceRemaining(row))}</td>
            <td className="px-3 py-2"><Badge tone={statusTone(row.status)}>{row.status}</Badge></td>
            <td className="px-3 py-2">
              {row.journal_uuid ? (
                <Link className="font-semibold text-primary-700 hover:underline" to={`/contabilitate/registru-jurnal?luna=${row.balance_month || row.data?.slice(0, 7)}`}>NC {row.journal_id}</Link>
              ) : '-'}
            </td>
            <td className="px-3 py-2">
              <div className="flex flex-wrap gap-2">
                {row.status === 'draft' ? <Button size="sm" variant="secondary" onClick={() => openEdit(row)}>Edit</Button> : null}
                {row.status === 'draft' ? <Button size="sm" loading={actionLoading === `validate-${row.uuid}`} onClick={() => validate(row)}>Valideaza</Button> : null}
                {row.status === 'draft' ? <Button size="sm" variant="secondary" loading={actionLoading === `cancel-${row.uuid}`} onClick={() => cancelDraft(row)}>Anuleaza</Button> : null}
                {canPayInvoice(row) ? <Button size="sm" loading={actionLoading === `payment-${row.uuid}`} onClick={() => openPayment(row)}>{isIn ? 'Plateste' : 'Incaseaza'}</Button> : null}
                {row.journal_id ? <Button size="sm" variant="secondary" onClick={() => showJournal(row)}>Nota</Button> : null}
                {row.status === 'validat' ? <Button size="sm" variant="secondary" loading={actionLoading === `devalidate-${row.uuid}`} onClick={() => devalidate(row)}>Devalideaza</Button> : null}
                {row.status !== 'draft' && row.status !== 'stornat' && row.status !== 'anulat' ? <Button size="sm" variant="secondary" loading={actionLoading === `storno-${row.uuid}`} onClick={() => storno(row)}>Storno</Button> : null}
              </div>
            </td>
          </tr>
        ))}
      </Table>
      <Modal open={modal} title={editing ? 'Editare factura draft' : 'Factura noua'} onClose={() => setModal(false)}>
        <form className="grid gap-3" onSubmit={submit}>
          {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
            <Select label={isIn ? 'Furnizor' : 'Client'} value={form.tert_id || ''} onChange={event => setForm({ ...form, tert_id: event.target.value })} options={thirdParties.map(t => ({ value: t.id, label: `${t.cod} - ${t.denumire}` }))} required />
            <div className="flex items-end">
              <Link className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" to={isIn ? '/contabilitate/furnizori' : '/contabilitate/clienti'}>Editeaza terti</Link>
            </div>
          </div>
          <Input label="Document" value={form.nr_document || form.numar || ''} onChange={event => setForm({ ...form, nr_document: event.target.value, numar: event.target.value })} required />
          <Input label="Data" type="date" value={form.data} onChange={event => setForm({ ...form, data: event.target.value })} required />
          <Input label="Scadenta" type="date" value={form.data_scadenta || ''} onChange={event => setForm({ ...form, data_scadenta: event.target.value })} />
          <div className="grid gap-3 md:grid-cols-2">
            <Select label="Centru cost/profit" value={form.cost_center_id || ''} onChange={event => setForm({ ...form, cost_center_id: event.target.value, subcentru_id: '' })} options={[{ value: '', label: 'Fara centru' }, ...mainCostCenters.map(center => ({ value: center.id, label: `${center.cod || center.id} - ${center.denumire || center.name}` }))]} />
            <Select label="Subcentru" value={form.subcentru_id || ''} onChange={event => setForm({ ...form, subcentru_id: event.target.value })} options={[{ value: '', label: subcenters.length ? 'Fara subcentru' : 'Nu sunt subcentre' }, ...subcenters.map(center => ({ value: center.id, label: `${center.cod || center.id} - ${center.denumire || center.name}` }))]} disabled={!form.cost_center_id || !subcenters.length} />
          </div>
          <AccountSelect label={isIn ? 'Cont cheltuiala' : 'Cont venit'} value={isIn ? form.cont_cheltuiala : form.cont_venit} accounts={accounts} recommendedClasses={isIn ? [6, 3, 2] : [7]} onChange={event => setForm({ ...form, [isIn ? 'cont_cheltuiala' : 'cont_venit']: event.target.value })} required />
          <div className="rounded-md border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-sm font-semibold text-slate-800">Linii factura</div>
              <Button type="button" size="sm" variant="secondary" onClick={addLine}>+ Linie</Button>
            </div>
            <div className="grid gap-2 p-3">
              {invoiceLines.map((line, index) => (
                <div key={index} className="grid gap-2 rounded-md border border-slate-200 bg-white p-3">
                  <Input label={`Denumire linia ${index + 1}`} value={line.denumire || ''} onChange={event => updateLine(index, { denumire: event.target.value })} />
                  <div className="grid gap-2 sm:grid-cols-[minmax(220px,2fr)_minmax(120px,1fr)_minmax(96px,0.7fr)_44px]">
                    <AccountSelect label="Cont" value={line.cont || ''} accounts={accounts} recommendedClasses={isIn ? [6, 3, 2] : [7]} onChange={event => updateLine(index, { cont: event.target.value })} required />
                    <Input label="Valoare" type="number" step="0.01" value={line.valoare || ''} onChange={event => updateLine(index, { valoare: event.target.value })} />
                    <Select label="TVA" value={line.tva_procent ?? 21} onChange={event => updateLine(index, { tva_procent: event.target.value })} options={[0,5,9,19,21].map(v => ({ value: v, label: `${v}%` }))} />
                    <div className="flex items-end"><Button type="button" size="sm" variant="secondary" onClick={() => removeLine(index)}>x</Button></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <Input label="Explicatie" value={form.explicatie || ''} onChange={event => setForm({ ...form, explicatie: event.target.value })} />
          <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">Preview nota: {isIn ? `linii debit + 4426 = 401.x` : `4111.x = linii venit + 4427`} · Baza {formatMoney(baseValue)} · TVA {formatMoney(tvaLines)} · Total {formatMoney(total)}</div>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setModal(false)}>Renunta</Button><Button type="submit">{editing ? 'Salveaza modificari' : 'Salveaza draft'}</Button></div>
        </form>
      </Modal>
      <Modal open={journalModal} title="Nota contabila generata" onClose={() => setJournalModal(false)}>
        <div className="grid gap-3">
          {journalData ? (
            <>
              <div className="grid gap-2 md:grid-cols-4">
                <Info label="Document" value={journalData.nr_document || journalData.id} />
                <Info label="Data" value={journalData.data || '-'} />
                <Info label="Debit" value={formatMoney(journalData.total_debit || 0)} />
                <Info label="Credit" value={formatMoney(journalData.total_credit || 0)} />
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                Centru cost: {costCenterName(journalData.subcentru_id) || costCenterName(journalData.cost_center_id) || '-'}
              </div>
              <Table headers={['Cont', 'Denumire', 'Debit', 'Credit', 'Explicatie']}>
                {(journalData.lines || []).map(line => (
                  <tr key={line.id || `${line.cont_simbol}-${line.linie_nr}`}>
                    <td className="px-3 py-2 font-semibold">{line.cont_simbol}</td>
                    <td className="px-3 py-2">{line.denumire_cont || '-'}</td>
                    <td className="px-3 py-2 text-right">{line.debit ? formatMoney(line.debit) : '-'}</td>
                    <td className="px-3 py-2 text-right">{line.credit ? formatMoney(line.credit) : '-'}</td>
                    <td className="px-3 py-2">{line.explicatie || '-'}</td>
                  </tr>
                ))}
              </Table>
            </>
          ) : null}
          <div className="flex justify-end"><Button variant="secondary" onClick={() => setJournalModal(false)}>Inchide</Button></div>
        </div>
      </Modal>
      <Modal open={paymentModal} title={isIn ? 'Plata factura' : 'Incasare factura'} onClose={() => setPaymentModal(false)}>
        <form className="grid gap-3" onSubmit={submitPayment}>
          {paymentRow ? (
            <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
              Document {paymentRow.nr_document || paymentRow.numar || paymentRow.id} · Total {formatMoney(paymentRow.total)} · Rest {formatMoney(invoiceRemaining(paymentRow))}
            </div>
          ) : null}
          {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Data" type="date" value={paymentForm.data || today()} onChange={event => setPaymentForm({ ...paymentForm, data: event.target.value })} required />
            <Input label="Nr. document" value={paymentForm.nr_document || ''} onChange={event => setPaymentForm({ ...paymentForm, nr_document: event.target.value })} />
            <Input label="Suma" type="number" step="0.01" value={paymentForm.suma || ''} onChange={event => setPaymentForm({ ...paymentForm, suma: event.target.value })} required />
            <AccountSelect label="Cont trezorerie" value={paymentForm.cont_trezorerie || '5121'} accounts={accounts} recommendedClasses={[5]} onChange={event => setPaymentForm({ ...paymentForm, cont_trezorerie: event.target.value })} required />
          </div>
          <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
            Preview nota: {isIn
              ? `${thirdPartyById.get(String(paymentRow?.furnizor_id))?.cont_analitic_furnizor || '401.x'} = ${paymentForm.cont_trezorerie || '5121'}`
              : `${paymentForm.cont_trezorerie || '5121'} = ${thirdPartyById.get(String(paymentRow?.client_id))?.cont_analitic_client || '4111.x'}`}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setPaymentModal(false)}>Renunta</Button>
            <Button type="submit" loading={actionLoading === `payment-${paymentRow?.uuid}`}>{isIn ? 'Inregistreaza plata' : 'Inregistreaza incasarea'}</Button>
          </div>
        </form>
      </Modal>
      <Modal open={devalidateModal} title="Devalidare factura" onClose={() => setDevalidateModal(false)}>
        <form className="grid gap-3" onSubmit={submitDevalidate}>
          <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Factura revine in draft, iar nota contabila generata este marcata devalidata. Operatia este permisa doar daca luna nu este inchisa.
          </div>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Motiv devalidare
            <textarea
              className="min-h-24 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              value={devalidateReason}
              onChange={event => setDevalidateReason(event.target.value)}
              required
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setDevalidateModal(false)}>Renunta</Button>
            <Button type="submit" disabled={!devalidateReason.trim()}>Devalideaza</Button>
          </div>
        </form>
      </Modal>
    </AccountingShell>
  )
}

export default FacturiContab

