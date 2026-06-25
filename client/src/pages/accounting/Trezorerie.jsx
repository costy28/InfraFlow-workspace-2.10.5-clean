import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../../api/client'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import { formatMoney } from '../../utils/format'
import { AccountSelect, AccountingShell, DropdownMenu, Table, currentMonth, money, statusTone, today } from './accounting-shared'
export function Trezorerie() {
  const [rows, setRows] = useState([])
  const [searchParams] = useSearchParams()
  const [thirdParties, setThirdParties] = useState([])
  const [accounts, setAccounts] = useState([])
  const [openInvoicesIn, setOpenInvoicesIn] = useState([])
  const [openInvoicesOut, setOpenInvoicesOut] = useState([])
  const [month, setMonth] = useState(searchParams.get('luna') || currentMonth())
  const [status, setStatus] = useState(searchParams.get('status') || '')
  const [tipFilter, setTipFilter] = useState(searchParams.get('tip') || '')
  const [operationFilter, setOperationFilter] = useState(searchParams.get('operatie') || '')
  const [tertFilter, setTertFilter] = useState(searchParams.get('tert_id') || '')
  const [q, setQ] = useState(searchParams.get('q') || '')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [validatedJournal, setValidatedJournal] = useState(null)
  const [actionLoading, setActionLoading] = useState('')
  const [autoOpenKey, setAutoOpenKey] = useState('')
  const [savingMode, setSavingMode] = useState('')
  const [journalModal, setJournalModal] = useState(false)
  const [journalData, setJournalData] = useState(null)
  const [journalLoading, setJournalLoading] = useState(false)
  const tertById = useMemo(() => new Map(thirdParties.map(tert => [String(tert.id), tert])), [thirdParties])
  const invoiceChoices = useMemo(() => {
    const source = form.tip_operatie === 'incasare' ? openInvoicesOut : openInvoicesIn
    const tertKey = form.tip_operatie === 'incasare' ? 'client_id' : 'furnizor_id'
    return source.filter(invoice => !form.tert_id || String(invoice[tertKey]) === String(form.tert_id))
  }, [form.tip_operatie, form.tert_id, openInvoicesIn, openInvoicesOut])

  useEffect(() => {
    setMonth(searchParams.get('luna') || currentMonth())
    setStatus(searchParams.get('status') || '')
    setTipFilter(searchParams.get('tip') || '')
    setOperationFilter(searchParams.get('operatie') || '')
    setTertFilter(searchParams.get('tert_id') || '')
    setQ(searchParams.get('q') || '')
  }, [searchParams])

  useEffect(() => { load() }, [month, status, tipFilter, operationFilter, tertFilter])

  useEffect(() => {
    const shouldOpen = searchParams.get('new') === '1'
    const invoiceInId = searchParams.get('invoice_in_id') || ''
    const invoiceOutId = searchParams.get('invoice_out_id') || ''
    const key = `${invoiceInId || invoiceOutId}-${month}-${operationFilter}`
    if (!shouldOpen || (!invoiceInId && !invoiceOutId) || autoOpenKey === key) return
    const invoiceIn = invoiceInId ? openInvoicesIn.find(item => String(item.id) === String(invoiceInId)) : null
    const invoiceOut = invoiceOutId ? openInvoicesOut.find(item => String(item.id) === String(invoiceOutId)) : null
    if ((invoiceInId && !invoiceIn) || (invoiceOutId && !invoiceOut)) {
      if (openInvoicesIn.length || openInvoicesOut.length) {
        setAutoOpenKey(key)
        setError('Factura selectata nu mai are rest deschis sau nu este validata.')
      }
      return
    }
    const next = defaultForm()
    if (invoiceIn) {
      const tert = tertById.get(String(invoiceIn.furnizor_id))
      next.tip_operatie = 'plata'
      next.tert_id = invoiceIn.furnizor_id || ''
      next.cont_corespondent = tert?.cont_analitic_furnizor || '401'
      next.suma = invoiceRemaining(invoiceIn, 'intrare')
      next.nr_document = invoiceIn.nr_document || ''
      next.invoice_in_id = invoiceIn.id
      next.explicatie = `Plata factura ${invoiceDocument(invoiceIn)}`
    }
    if (invoiceOut) {
      const tert = tertById.get(String(invoiceOut.client_id))
      next.tip_operatie = 'incasare'
      next.tert_id = invoiceOut.client_id || ''
      next.cont_corespondent = tert?.cont_analitic_client || '4111'
      next.suma = invoiceRemaining(invoiceOut, 'iesire')
      next.nr_document = invoiceDocument(invoiceOut)
      next.invoice_out_id = invoiceOut.id
      next.explicatie = `Incasare factura ${invoiceDocument(invoiceOut)}`
    }
    setAutoOpenKey(key)
    setEditing(null)
    setError('')
    setMessage('Operația a fost pregatită din scadentar. Verifică documentul și salvează draftul.')
    setValidatedJournal(null)
    setForm(next)
    setModal(true)
  }, [searchParams, openInvoicesIn, openInvoicesOut, tertById, month, operationFilter, autoOpenKey])

  function load() {
    const [an, luna] = month.split('-')
    Promise.all([
      api.get('/accounting/treasury', { params: { an, luna: Number(luna), status: status || undefined, tip: tipFilter || undefined, operatie: operationFilter || undefined, tert_id: tertFilter || undefined } }),
      api.get('/accounting/third-parties'),
      api.get('/accounting/chart'),
      api.get('/accounting/invoices-in'),
      api.get('/accounting/invoices-out')
    ]).then(([treasuryRes, tertRes, chartRes, invoicesInRes, invoicesOutRes]) => {
      setRows(treasuryRes.data.treasury || [])
      setThirdParties(tertRes.data.thirdParties || [])
      setAccounts(chartRes.data.accounts || [])
      setOpenInvoicesIn((invoicesInRes.data.invoices || []).filter(invoice => ['validat', 'partial'].includes(invoice.status) && invoiceRemaining(invoice, 'intrare') > 0))
      setOpenInvoicesOut((invoicesOutRes.data.invoices || []).filter(invoice => ['validat', 'partial'].includes(invoice.status) && invoiceRemaining(invoice, 'iesire') > 0))
    }).catch(() => {
      setRows([])
      setThirdParties([])
      setAccounts([])
      setOpenInvoicesIn([])
      setOpenInvoicesOut([])
    })
  }

  function defaultForm() {
    return {
      tip: 'banca',
      tip_operatie: 'plata',
      data: today(),
      nr_document: '',
      tert_id: '',
      cont_trezorerie: '5121',
      cont_corespondent: '401',
      suma: '',
      invoice_in_id: '',
      invoice_out_id: '',
      explicatie: ''
    }
  }

  function invoiceRemaining(invoice, type) {
    if (type === 'intrare') return money(invoice.neachitat ?? money(invoice.total) - money(invoice.achitat))
    return money(invoice.neincasat ?? money(invoice.total) - money(invoice.incasat))
  }

  function invoiceDocument(invoice) {
    return invoice.numar || invoice.nr_document || `ID ${invoice.id}`
  }

  function invoiceOptionLabel(invoice, type) {
    const tertId = type === 'iesire' ? invoice.client_id : invoice.furnizor_id
    const tert = tertById.get(String(tertId))
    return `${invoiceDocument(invoice)} - ${tert?.denumire || 'tert'} - rest ${formatMoney(invoiceRemaining(invoice, type))}`
  }

  const visibleRows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(row => {
      const tert = tertById.get(String(row.tert_id))
      return `${row.id || ''} ${row.uuid || ''} ${row.data || ''} ${row.tip || ''} ${row.tip_operatie || ''} ${row.nr_document || ''} ${row.cont_trezorerie || ''} ${row.cont_corespondent || ''} ${row.explicatie || ''} ${tert?.denumire || ''} ${tert?.cui || ''}`.toLowerCase().includes(needle)
    })
  }, [rows, q, tertById])

  const totals = useMemo(() => {
    const incasari = visibleRows.filter(row => row.tip_operatie === 'incasare').reduce((sum, row) => sum + money(row.suma), 0)
    const plati = visibleRows.filter(row => row.tip_operatie === 'plata').reduce((sum, row) => sum + money(row.suma), 0)
    return {
      count: visibleRows.length,
      incasari,
      plati,
      diferenta: incasari - plati,
      drafturi: visibleRows.filter(row => row.status === 'draft').length
    }
  }, [visibleRows])

  async function exportExcel() {
    const [an, luna] = month.split('-')
    setError('')
    try {
      const res = await api.get('/accounting/treasury/export', {
        params: {
          an,
          luna: Number(luna),
          status: status || undefined,
          tip: tipFilter || undefined,
          operatie: operationFilter || undefined,
          tert_id: tertFilter || undefined
        },
        responseType: 'blob'
      })
      const url = URL.createObjectURL(res.data)
      const link = document.createElement('a')
      link.href = url
      link.download = `Trezorerie_${an}_${String(luna).padStart(2, '0')}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.response?.data?.error || 'Exportul trezoreriei nu a putut fi generat.')
    }
  }

  function openNew() {
    setEditing(null)
    setError('')
    setMessage('')
    setValidatedJournal(null)
    setForm(defaultForm())
    setModal(true)
  }

  function openEdit(row) {
    setEditing(row)
    setError('')
    setMessage('')
    setValidatedJournal(null)
    setForm({ ...defaultForm(), ...row, tert_id: row.tert_id || '', invoice_in_id: row.invoice_in_id || '', invoice_out_id: row.invoice_out_id || '' })
    setModal(true)
  }

  function updateForm(patch) {
    const next = { ...form, ...patch }
    if (patch.tip === 'casa' && (!form.cont_trezorerie || form.cont_trezorerie === '5121')) next.cont_trezorerie = '5311'
    if (patch.tip === 'banca' && (!form.cont_trezorerie || form.cont_trezorerie === '5311')) next.cont_trezorerie = '5121'
    if (patch.tip_operatie === 'incasare') {
      if (!form.cont_corespondent || form.cont_corespondent === '401') next.cont_corespondent = '4111'
      next.invoice_in_id = ''
    }
    if (patch.tip_operatie === 'plata') {
      if (!form.cont_corespondent || form.cont_corespondent === '4111') next.cont_corespondent = '401'
      next.invoice_out_id = ''
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'invoice_in_id')) {
      next.invoice_out_id = ''
      const invoice = openInvoicesIn.find(item => String(item.id) === String(patch.invoice_in_id))
      if (invoice) {
        const tert = tertById.get(String(invoice.furnizor_id))
        next.tip_operatie = 'plata'
        next.tert_id = invoice.furnizor_id || ''
        next.cont_corespondent = tert?.cont_analitic_furnizor || next.cont_corespondent || '401'
        next.suma = invoiceRemaining(invoice, 'intrare')
        next.nr_document = next.nr_document || invoice.nr_document || ''
        next.explicatie = next.explicatie || `Plata factura ${invoiceDocument(invoice)}`
      }
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'invoice_out_id')) {
      next.invoice_in_id = ''
      const invoice = openInvoicesOut.find(item => String(item.id) === String(patch.invoice_out_id))
      if (invoice) {
        const tert = tertById.get(String(invoice.client_id))
        next.tip_operatie = 'incasare'
        next.tert_id = invoice.client_id || ''
        next.cont_corespondent = tert?.cont_analitic_client || next.cont_corespondent || '4111'
        next.suma = invoiceRemaining(invoice, 'iesire')
        next.nr_document = next.nr_document || invoiceDocument(invoice)
        next.explicatie = next.explicatie || `Incasare factura ${invoiceDocument(invoice)}`
      }
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'tert_id')) {
      const activeInvoice = next.invoice_in_id
        ? openInvoicesIn.find(item => String(item.id) === String(next.invoice_in_id))
        : openInvoicesOut.find(item => String(item.id) === String(next.invoice_out_id))
      const tertKey = next.invoice_in_id ? 'furnizor_id' : 'client_id'
      if (activeInvoice && String(activeInvoice[tertKey]) !== String(patch.tert_id || '')) {
        next.invoice_in_id = ''
        next.invoice_out_id = ''
      }
    }
    setForm(next)
  }

  async function submit(event, validateAfterSave = false) {
    event.preventDefault()
    setError('')
    setMessage('')
    setValidatedJournal(null)
    setSavingMode(validateAfterSave ? 'save-validate' : 'save')
    const hint = treasuryValidationHint({ ...form, status: 'draft' })
    if (hint) {
      setError(hint)
      setSavingMode('')
      return
    }
    try {
      const payload = { ...form, tert_id: form.tert_id || null, invoice_in_id: form.invoice_in_id || null, invoice_out_id: form.invoice_out_id || null }
      const saveRes = editing
        ? await api.patch(`/accounting/treasury/${editing.uuid}`, payload)
        : await api.post('/accounting/treasury', payload)
      const savedTreasury = saveRes.data?.treasury
      if (validateAfterSave && savedTreasury?.uuid) {
        const validateRes = await api.post(`/accounting/treasury/${savedTreasury.uuid}/validate`)
        const journal = validateRes.data?.journal
        setValidatedJournal(journal ? {
          id: journal.id,
          uuid: journal.uuid,
          month: savedTreasury.balance_month || savedTreasury.data?.slice(0, 7) || month,
          totalDebit: journal.total_debit,
          totalCredit: journal.total_credit
        } : null)
      }
      setModal(false)
      setMessage(validateAfterSave
        ? 'Operația a fost salvată, validată și nota contabilă a fost generată.'
        : editing ? 'Operația de trezorerie a fost salvată.' : 'Operația de trezorerie a fost creată ca draft. Următorul pas: validează operația.')
      load()
    } catch (err) {
      setError(err.response?.data?.error || (validateAfterSave ? 'Operația nu a putut fi salvată și validată.' : 'Operatia nu a putut fi salvata.'))
    } finally {
      setSavingMode('')
    }
  }

  function treasuryValidationHint(row) {
    if (row.status !== 'draft') return 'Operația trebuie să fie în status draft pentru validare.'
    if (!row.data) return 'Completează data operației înainte de validare.'
    if (!money(row.suma) || money(row.suma) <= 0) return 'Completează o sumă pozitivă înainte de validare.'
    if (!row.cont_trezorerie) return 'Completează contul de trezorerie, de exemplu 5121 pentru bancă sau 5311 pentru casă.'
    if (accounts.length && !accountExists(row.cont_trezorerie)) return `Contul de trezorerie ${row.cont_trezorerie} nu există în planul de conturi. Alege contul din listă sau adaugă-l în Plan de conturi.`
    if (!row.cont_corespondent) return 'Completează contul corespondent înainte de validare.'
    if (accounts.length && !accountExists(row.cont_corespondent)) return `Contul corespondent ${row.cont_corespondent} nu există în planul de conturi. Alege contul din listă sau adaugă-l în Plan de conturi.`
    if (row.invoice_in_id && row.tip_operatie !== 'plata') return 'Factura de intrare se poate stinge doar prin plată.'
    if (row.invoice_out_id && row.tip_operatie !== 'incasare') return 'Factura de ieșire se poate stinge doar prin încasare.'
    return ''
  }

  function accountExists(symbol) {
    return accounts.some(account => account.simbol === String(symbol || '').trim() && account.activ !== false)
  }

  function errorText(err, fallback) {
    return err.response?.data?.error || err.response?.data?.message || fallback
  }

  async function validate(row) {
    const hint = treasuryValidationHint(row)
    if (hint) {
      setError(hint)
      setMessage('')
      return
    }
    setActionLoading(`validate-${row.uuid}`)
    setError('')
    setMessage('')
    setValidatedJournal(null)
    try {
      const res = await api.post(`/accounting/treasury/${row.uuid}/validate`)
      const journal = res.data?.journal
      setValidatedJournal(journal ? {
        id: journal.id,
        uuid: journal.uuid,
        month: row.balance_month || row.data?.slice(0, 7) || month,
        totalDebit: journal.total_debit,
        totalCredit: journal.total_credit
      } : null)
      setMessage('Operația a fost validată și nota contabilă a fost generată.')
      load()
    } catch (err) {
      setError(errorText(err, 'Operația nu a putut fi validată. Verifică perioada, conturile și soldurile.'))
    } finally {
      setActionLoading('')
    }
  }

  async function devalidate(row) {
    setActionLoading(`devalidate-${row.uuid}`)
    setError('')
    setMessage('')
    setValidatedJournal(null)
    try {
      await api.post(`/accounting/treasury/${row.uuid}/devalidate`, { motiv: 'Corectie document trezorerie' })
      setMessage('Operația a fost devalidată și revine în draft.')
      load()
    } catch (err) {
      setError(errorText(err, 'Operația nu a putut fi devalidată. Verifică dacă luna este deschisă și nota contabilă există.'))
    } finally {
      setActionLoading('')
    }
  }

  async function cancelDraft(row) {
    setActionLoading(`cancel-${row.uuid}`)
    setError('')
    setMessage('')
    setValidatedJournal(null)
    try {
      await api.delete(`/accounting/treasury/${row.uuid}`)
      setMessage('Operația draft a fost anulată.')
      load()
    } catch (err) {
      setError(errorText(err, 'Operația nu a putut fi anulată. Doar documentele draft se pot anula direct.'))
    } finally {
      setActionLoading('')
    }
  }

  async function openJournal(row) {
    if (!row?.journal_uuid) return
    setJournalLoading(true)
    setJournalData(null)
    setError('')
    setJournalModal(true)
    try {
      const res = await api.get(`/accounting/journals/${row.journal_uuid}`)
      setJournalData(res.data?.journal || null)
    } catch (err) {
      setJournalModal(false)
      setError(errorText(err, 'Nota contabilă nu a putut fi încărcată.'))
    } finally {
      setJournalLoading(false)
    }
  }

  function rowActionMenu(row) {
    const rowMonth = row.balance_month || row.data?.slice(0, 7) || month
    const canValidate = row.status === 'draft'
    const canDevalidate = row.status === 'validat'
    const invoiceLink = row.linked_invoice
      ? row.linked_invoice.tip === 'intrare'
        ? `/contabilitate/facturi-intrare?factura=${row.linked_invoice.id}`
        : `/contabilitate/facturi-iesire?factura=${row.linked_invoice.id}`
      : ''
    return [
      canValidate ? { label: 'Editeaza operatia', onClick: () => openEdit(row) } : null,
      canValidate ? { label: 'Valideaza si genereaza nota', onClick: () => validate(row) } : null,
      canValidate ? { label: 'Anuleaza draft', onClick: () => cancelDraft(row), danger: true } : null,
      canDevalidate ? { label: 'Devalideaza', onClick: () => devalidate(row), danger: true } : null,
      { separator: true },
      row.journal_uuid ? { label: 'Vezi nota contabila', onClick: () => openJournal(row) } : null,
      row.journal_uuid ? { label: 'Deschide registru jurnal', to: `/contabilitate/registru-jurnal?luna=${rowMonth}&note=${row.journal_uuid}` } : null,
      invoiceLink ? { label: 'Deschide factura legata', to: invoiceLink } : null,
      { separator: true },
      row.cont_trezorerie ? { label: `Fisa cont ${row.cont_trezorerie}`, to: `/contabilitate/fisa-cont/${row.cont_trezorerie}?de_la=${rowMonth}-01&pana_la=${rowMonth}-31` } : null,
      row.cont_corespondent ? { label: `Fisa cont ${row.cont_corespondent}`, to: `/contabilitate/fisa-cont/${row.cont_corespondent}?de_la=${rowMonth}-01&pana_la=${rowMonth}-31` } : null
    ]
  }

  return (
    <AccountingShell active="trezorerie" title="Trezorerie" subtitle="Registru de casa, jurnal de banca si deconturi cu note contabile generate." actions={<><Button onClick={openNew}>+ Operatie</Button><DropdownMenu align="right" label="Export" items={[{ label: 'Export Excel', onClick: exportExcel }]} /></>}>
      {error ? <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      {message ? (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
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
        <div className="grid gap-3 xl:grid-cols-[160px_160px_160px_160px_minmax(220px,1fr)_minmax(180px,1fr)_auto]">
          <Input label="Luna" type="month" value={month} onChange={event => setMonth(event.target.value)} />
          <Select label="Status" value={status} onChange={event => setStatus(event.target.value)} options={[
            { value: '', label: 'Toate fara anulate' },
            { value: 'draft', label: 'Draft' },
            { value: 'validat', label: 'Validate' },
            { value: 'anulat', label: 'Anulate' }
          ]} />
          <Select label="Registru" value={tipFilter} onChange={event => setTipFilter(event.target.value)} options={[
            { value: '', label: 'Toate' },
            { value: 'banca', label: 'Banca' },
            { value: 'casa', label: 'Casa' },
            { value: 'decont', label: 'Decont' }
          ]} />
          <Select label="Operatie" value={operationFilter} onChange={event => setOperationFilter(event.target.value)} options={[
            { value: '', label: 'Toate' },
            { value: 'incasare', label: 'Incasari' },
            { value: 'plata', label: 'Plati' }
          ]} />
          <Select label="Tert" value={tertFilter} onChange={event => setTertFilter(event.target.value)} options={[
            { value: '', label: 'Toti tertii' },
            ...thirdParties.map(tert => ({ value: tert.id, label: `${tert.cod} - ${tert.denumire}` }))
          ]} />
          <Input label="Cauta" value={q} onChange={event => setQ(event.target.value)} placeholder="Document, tert, cont..." />
          <div className="flex items-end justify-end"><Button variant="secondary" onClick={load}>Reincarca</Button></div>
        </div>
      </Card>
      <div className="grid gap-3 md:grid-cols-5">
        <Card density="compact"><div className="text-xs text-slate-500">Operatii</div><div className="text-lg font-semibold">{totals.count}</div></Card>
        <Card density="compact"><div className="text-xs text-slate-500">Incasari</div><div className="text-lg font-semibold">{formatMoney(totals.incasari)}</div></Card>
        <Card density="compact"><div className="text-xs text-slate-500">Plati</div><div className="text-lg font-semibold">{formatMoney(totals.plati)}</div></Card>
        <Card density="compact"><div className="text-xs text-slate-500">Diferenta</div><div className="text-lg font-semibold">{formatMoney(totals.diferenta)}</div></Card>
        <Card density="compact"><div className="text-xs text-slate-500">Drafturi</div><div className="text-lg font-semibold">{totals.drafturi}</div></Card>
      </div>
      <Table headers={['Data', 'Tip', 'Operatie', 'Document', 'Tert', 'Cont', 'Corespondent', 'Suma', 'Status', 'Nota', 'Actiuni']}>
        {visibleRows.map(row => (
          <tr key={row.uuid}>
            <td className="px-3 py-2">{row.data}</td>
            <td className="px-3 py-2 capitalize">{row.tip}</td>
            <td className="px-3 py-2 capitalize">{row.tip_operatie}</td>
            <td className="px-3 py-2">{row.nr_document || '-'}</td>
            <td className="px-3 py-2">
              {row.tert_id ? tertById.get(String(row.tert_id))?.denumire || row.tert_id : '-'}
              {row.linked_invoice ? (
                <div className="text-xs text-slate-500">
                  factura {row.linked_invoice.tip}: {row.linked_invoice.document || row.linked_invoice.id}
                </div>
              ) : null}
            </td>
            <td className="px-3 py-2"><Link className="font-semibold text-primary-700 hover:underline" to={`/contabilitate/fisa-cont/${row.cont_trezorerie}?de_la=${month}-01&pana_la=${month}-31`}>{row.cont_trezorerie}</Link></td>
            <td className="px-3 py-2">{row.cont_corespondent ? <Link className="font-semibold text-primary-700 hover:underline" to={`/contabilitate/fisa-cont/${row.cont_corespondent}?de_la=${month}-01&pana_la=${month}-31`}>{row.cont_corespondent}</Link> : '-'}</td>
            <td className="px-3 py-2">{formatMoney(row.suma)}</td>
            <td className="px-3 py-2"><Badge tone={statusTone(row.status)}>{row.status}</Badge></td>
            <td className="px-3 py-2">
              {row.journal_uuid ? (
                <button className="font-semibold text-primary-700 hover:underline" type="button" onClick={() => openJournal(row)}>NC {row.journal_id}</button>
              ) : '-'}
            </td>
            <td className="px-3 py-2">
              <DropdownMenu align="right" label={actionLoading.endsWith(`-${row.uuid}`) ? 'Se lucreaza...' : 'Actiuni'} items={rowActionMenu(row)} />
            </td>
          </tr>
        ))}
      </Table>
      <Modal open={modal} title={editing ? 'Editare operatie trezorerie' : 'Operatie trezorerie noua'} onClose={() => setModal(false)}>
        <form className="grid gap-3" onSubmit={submit}>
          {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          <div className="grid gap-3 md:grid-cols-2">
            <Select label="Registru" value={form.tip || 'banca'} onChange={event => updateForm({ tip: event.target.value })} options={[
              { value: 'banca', label: 'Jurnal banca' },
              { value: 'casa', label: 'Registru casa' },
              { value: 'decont', label: 'Decont' }
            ]} />
            <Select label="Operatie" value={form.tip_operatie || 'plata'} onChange={event => updateForm({ tip_operatie: event.target.value })} options={[
              { value: 'plata', label: 'Plata' },
              { value: 'incasare', label: 'Incasare' }
            ]} />
            <Input label="Data" type="date" value={form.data || today()} onChange={event => updateForm({ data: event.target.value })} required />
            <Input label="Nr. document" value={form.nr_document || ''} onChange={event => updateForm({ nr_document: event.target.value })} />
            <Select label="Tert optional" value={form.tert_id || ''} onChange={event => updateForm({ tert_id: event.target.value })} options={[{ value: '', label: 'Fara tert' }, ...thirdParties.map(tert => ({ value: tert.id, label: `${tert.cod} - ${tert.denumire}` }))]} />
            <Select
              label={form.tip_operatie === 'incasare' ? 'Factura client deschisa' : 'Factura furnizor deschisa'}
              value={form.tip_operatie === 'incasare' ? form.invoice_out_id || '' : form.invoice_in_id || ''}
              onChange={event => updateForm(form.tip_operatie === 'incasare' ? { invoice_out_id: event.target.value } : { invoice_in_id: event.target.value })}
              options={[
                { value: '', label: 'Fara factura legata' },
                ...invoiceChoices.map(invoice => ({
                  value: invoice.id,
                  label: invoiceOptionLabel(invoice, form.tip_operatie === 'incasare' ? 'iesire' : 'intrare')
                }))
              ]}
            />
            <Input label="Suma" type="number" step="0.01" value={form.suma || ''} onChange={event => updateForm({ suma: event.target.value })} required />
            <AccountSelect label="Cont trezorerie" value={form.cont_trezorerie || ''} accounts={accounts} recommendedClasses={[5]} onChange={event => updateForm({ cont_trezorerie: event.target.value })} required />
            <AccountSelect label="Cont corespondent" value={form.cont_corespondent || ''} accounts={accounts} recommendedClasses={[4, 5, 6, 7]} onChange={event => updateForm({ cont_corespondent: event.target.value })} required />
          </div>
          <Input label="Explicatie" value={form.explicatie || ''} onChange={event => updateForm({ explicatie: event.target.value })} />
          <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
            Preview nota: {form.tip_operatie === 'incasare'
              ? `${form.cont_trezorerie || '5121'} = ${form.cont_corespondent || '4111'}`
              : `${form.cont_corespondent || '401'} = ${form.cont_trezorerie || '5121'}`} · {formatMoney(form.suma || 0)}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal(false)}>Renunta</Button>
            <Button type="submit" loading={savingMode === 'save'}>{editing ? 'Salveaza modificari' : 'Salveaza draft'}</Button>
            <Button type="button" loading={savingMode === 'save-validate'} onClick={(event) => submit(event, true)}>Salveaza si valideaza</Button>
          </div>
        </form>
      </Modal>
      <Modal open={journalModal} title="Nota contabila" onClose={() => setJournalModal(false)}>
        {journalLoading ? (
          <div className="py-8 text-center text-sm text-slate-500">Se incarca nota...</div>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <div className="text-xs text-slate-500">Document</div>
                <div className="font-semibold">{journalData?.nr_document || `NC ${journalData?.id || '-'}`}</div>
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <div className="text-xs text-slate-500">Data</div>
                <div className="font-semibold">{journalData?.data || '-'}</div>
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <div className="text-xs text-slate-500">Debit</div>
                <div className="font-semibold">{formatMoney(journalData?.total_debit || 0)}</div>
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <div className="text-xs text-slate-500">Credit</div>
                <div className="font-semibold">{formatMoney(journalData?.total_credit || 0)}</div>
              </div>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {journalData?.explicatie || 'Fara explicatie.'}
            </div>
            <Table headers={['Cont', 'Denumire', 'Debit', 'Credit', 'Explicatie']}>
              {(journalData?.lines || []).map(line => (
                <tr key={line.id || `${line.cont_simbol}-${line.linie_nr}`} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <Link className="font-semibold text-primary-700 hover:underline" to={`/contabilitate/fisa-cont/${line.cont_simbol}?de_la=${month}-01&pana_la=${month}-31`}>{line.cont_simbol}</Link>
                  </td>
                  <td className="px-3 py-2">{line.denumire_cont || '-'}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(line.debit || 0)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(line.credit || 0)}</td>
                  <td className="px-3 py-2">{line.explicatie || '-'}</td>
                </tr>
              ))}
              {(journalData?.lines || []).length ? null : (
                <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={5}>Nota nu are linii disponibile.</td></tr>
              )}
            </Table>
            <div className="flex justify-end gap-2">
              <Link className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" to={`/contabilitate/registru-jurnal?luna=${journalData?.data?.slice(0, 7) || month}&note=${journalData?.uuid || ''}`}>Deschide in registru</Link>
              <Button variant="secondary" onClick={() => setJournalModal(false)}>Inchide</Button>
            </div>
          </div>
        )}
      </Modal>
    </AccountingShell>
  )
}

export default Trezorerie
