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
  const [correlationFilter, setCorrelationFilter] = useState(searchParams.get('corelare') || '')
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
  const [settlementModal, setSettlementModal] = useState(false)
  const [settlementData, setSettlementData] = useState(null)
  const [settlementAmounts, setSettlementAmounts] = useState({})
  const [settlementLoading, setSettlementLoading] = useState(false)
  const [serverSummary, setServerSummary] = useState({ advances: {} })
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
    setCorrelationFilter(searchParams.get('corelare') || '')
    setTertFilter(searchParams.get('tert_id') || '')
    setQ(searchParams.get('q') || '')
  }, [searchParams])

  useEffect(() => { load() }, [month, status, tipFilter, operationFilter, correlationFilter, tertFilter])

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
      api.get('/accounting/treasury', { params: { an, luna: Number(luna), status: status || undefined, tip: tipFilter || undefined, operatie: operationFilter || undefined, corelare: correlationFilter || undefined, tert_id: tertFilter || undefined } }),
      api.get('/accounting/third-parties'),
      api.get('/accounting/chart'),
      api.get('/accounting/invoices-in'),
      api.get('/accounting/invoices-out')
    ]).then(([treasuryRes, tertRes, chartRes, invoicesInRes, invoicesOutRes]) => {
      setRows(treasuryRes.data.treasury || [])
      setServerSummary(treasuryRes.data.summary || { advances: {} })
      setThirdParties(tertRes.data.thirdParties || [])
      setAccounts(chartRes.data.accounts || [])
      setOpenInvoicesIn((invoicesInRes.data.invoices || []).filter(invoice => ['validat', 'partial'].includes(invoice.status) && invoiceRemaining(invoice, 'intrare') > 0))
      setOpenInvoicesOut((invoicesOutRes.data.invoices || []).filter(invoice => ['validat', 'partial'].includes(invoice.status) && invoiceRemaining(invoice, 'iesire') > 0))
    }).catch(() => {
      setRows([])
      setServerSummary({ advances: {} })
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
      corelare_tip: 'neclasificat',
      corelare_observatii: '',
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
      return `${row.id || ''} ${row.uuid || ''} ${row.data || ''} ${row.tip || ''} ${row.tip_operatie || ''} ${row.nr_document || ''} ${row.cont_trezorerie || ''} ${row.cont_corespondent || ''} ${row.corelare_label || ''} ${row.explicatie || ''} ${tert?.denumire || ''} ${tert?.cui || ''}`.toLowerCase().includes(needle)
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
  const openInvoiceSummary = useMemo(() => {
    const suppliers = openInvoicesIn.map(invoice => ({ ...invoice, rest: invoiceRemaining(invoice, 'intrare'), type: 'intrare' }))
    const clients = openInvoicesOut.map(invoice => ({ ...invoice, rest: invoiceRemaining(invoice, 'iesire'), type: 'iesire' }))
    return {
      suppliers,
      clients,
      supplierTotal: suppliers.reduce((sum, invoice) => sum + invoice.rest, 0),
      clientTotal: clients.reduce((sum, invoice) => sum + invoice.rest, 0),
      overdueSuppliers: suppliers.filter(invoice => invoice.data_scadenta && invoice.data_scadenta < today()).length,
      overdueClients: clients.filter(invoice => invoice.data_scadenta && invoice.data_scadenta < today()).length,
      priority: [...suppliers, ...clients]
        .sort((a, b) => {
          const aDue = a.data_scadenta || '9999-12-31'
          const bDue = b.data_scadenta || '9999-12-31'
          return aDue.localeCompare(bDue) || b.rest - a.rest
        })
        .slice(0, 6)
    }
  }, [openInvoicesIn, openInvoicesOut])
  const treasuryFlow = useMemo(() => {
    const drafts = visibleRows.filter(row => row.status === 'draft')
    const firstDraftWithSuggestion = drafts.find(row => (row.suggested_matches || []).length)
    const firstDraft = drafts[0]
    const firstDraftHint = firstDraft ? treasuryValidationHint(firstDraft) : ''
    const firstAdvance = visibleRows.find(row => row.status === 'validat' && row.corelare_tip === 'avans' && !row.linked_invoice && (row.suggested_matches || []).length)
    const firstAllocatable = visibleRows.find(row => row.status === 'validat' && row.tert_id && !row.linked_invoice && money(row.available_total ?? row.suma - money(row.allocated_total)) > 0)
    const firstSupplier = openInvoiceSummary.suppliers[0]
    const firstClient = openInvoiceSummary.clients[0]

    let next = {
      title: visibleRows.length ? 'Trezoreria filtrată este curată operațional' : 'Adaugă prima operație de trezorerie',
      text: visibleRows.length
        ? 'Nu am găsit drafturi, sugestii sau avansuri de stins în filtrul curent. Poți verifica registrul jurnal sau balanța.'
        : 'Pornește cu registrul, tipul operației, conturile și suma. Poți salva și valida din același formular.',
      label: visibleRows.length ? 'Vezi registru jurnal' : 'Operație nouă',
      to: visibleRows.length ? `/contabilitate/registru-jurnal?luna=${month}` : '',
      onClick: visibleRows.length ? null : openNew,
      tone: 'success'
    }

    if (firstDraftWithSuggestion) {
      const suggestion = firstDraftWithSuggestion.suggested_matches[0]
      next = {
        title: 'Există o potrivire probabilă cu factură',
        text: `Operația ${firstDraftWithSuggestion.nr_document || firstDraftWithSuggestion.id} poate fi legată de ${suggestion.document}.`,
        label: 'Leagă factura sugerată',
        onClick: () => attachSuggestedInvoice(firstDraftWithSuggestion, suggestion),
        tone: 'info'
      }
    } else if (firstDraft && firstDraftHint) {
      next = {
        title: 'Primul draft are date lipsă',
        text: firstDraftHint,
        label: 'Corectează draftul',
        onClick: () => openEdit(firstDraft),
        tone: 'warning'
      }
    } else if (firstDraft) {
      next = {
        title: `${drafts.length} draft${drafts.length === 1 ? '' : 'uri'} gata de validare`,
        text: 'Validarea generează nota contabilă și actualizează scadențarul/avansurile.',
        label: 'Validează primul draft',
        onClick: () => validate(firstDraft),
        tone: 'info'
      }
    } else if (firstAdvance) {
      const suggestion = firstAdvance.suggested_matches[0]
      next = {
        title: 'Avans de stins cu factură',
        text: `Avansul ${firstAdvance.nr_document || firstAdvance.id} poate fi stins cu ${suggestion.document}.`,
        label: 'Stinge avansul',
        onClick: () => settleAdvance(firstAdvance, suggestion),
        tone: 'warning'
      }
    } else if (firstAllocatable) {
      next = {
        title: 'Operație de alocat pe facturi',
        text: `Suma disponibilă este ${formatMoney(money(firstAllocatable.available_total ?? firstAllocatable.suma - money(firstAllocatable.allocated_total)))}.`,
        label: 'Alocă pe facturi',
        onClick: () => openSettlement(firstAllocatable),
        tone: 'warning'
      }
    } else if (firstSupplier) {
      next = {
        title: 'Factură furnizor de plătit',
        text: `${invoiceDocument(firstSupplier)} are rest ${formatMoney(firstSupplier.rest)}.`,
        label: 'Pregătește plata',
        onClick: () => openInvoiceOperation(firstSupplier, 'intrare'),
        tone: 'warning'
      }
    } else if (firstClient) {
      next = {
        title: 'Factură client de încasat',
        text: `${invoiceDocument(firstClient)} are rest ${formatMoney(firstClient.rest)}.`,
        label: 'Pregătește încasarea',
        onClick: () => openInvoiceOperation(firstClient, 'iesire'),
        tone: 'warning'
      }
    }

    return {
      next,
      steps: [
        { label: 'Drafturi', done: !drafts.length, detail: drafts.length ? `${drafts.length} de validat` : 'OK' },
        { label: 'Sugestii', done: !firstDraftWithSuggestion, detail: firstDraftWithSuggestion ? 'potrivire găsită' : 'OK' },
        { label: 'Facturi furnizor', done: !openInvoiceSummary.suppliers.length, detail: openInvoiceSummary.suppliers.length ? `${openInvoiceSummary.suppliers.length} deschise` : 'OK' },
        { label: 'Facturi client', done: !openInvoiceSummary.clients.length, detail: openInvoiceSummary.clients.length ? `${openInvoiceSummary.clients.length} deschise` : 'OK' },
        { label: 'Avansuri', done: !serverSummary.advances?.count, detail: serverSummary.advances?.count ? `${serverSummary.advances.count} nestinse` : 'OK' },
        { label: 'Neclasificate', done: !visibleRows.some(row => row.corelare_tip === 'neclasificat' && row.status === 'validat'), detail: visibleRows.filter(row => row.corelare_tip === 'neclasificat' && row.status === 'validat').length || 'OK' }
      ]
    }
  }, [month, openInvoiceSummary, serverSummary.advances, visibleRows])

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
          corelare: correlationFilter || undefined,
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

  function openInvoiceOperation(invoice, type) {
    const next = defaultForm()
    if (type === 'intrare') {
      const tert = tertById.get(String(invoice.furnizor_id))
      next.tip_operatie = 'plata'
      next.tert_id = invoice.furnizor_id || ''
      next.cont_corespondent = tert?.cont_analitic_furnizor || '401'
      next.suma = invoiceRemaining(invoice, 'intrare')
      next.nr_document = invoice.nr_document || invoiceDocument(invoice)
      next.invoice_in_id = invoice.id
      next.explicatie = `Plata factura ${invoiceDocument(invoice)}`
    } else {
      const tert = tertById.get(String(invoice.client_id))
      next.tip_operatie = 'incasare'
      next.tert_id = invoice.client_id || ''
      next.cont_corespondent = tert?.cont_analitic_client || '4111'
      next.suma = invoiceRemaining(invoice, 'iesire')
      next.nr_document = invoiceDocument(invoice)
      next.invoice_out_id = invoice.id
      next.explicatie = `Incasare factura ${invoiceDocument(invoice)}`
    }
    setEditing(null)
    setError('')
    setMessage(type === 'intrare' ? 'Plata a fost pregătită din factura furnizor.' : 'Încasarea a fost pregătită din factura client.')
    setValidatedJournal(null)
    setForm(next)
    setModal(true)
  }

  function updateForm(patch) {
    const next = { ...form, ...patch }
    if (patch.tip === 'casa' && (!form.cont_trezorerie || form.cont_trezorerie === '5121')) next.cont_trezorerie = '5311'
    if (patch.tip === 'banca' && (!form.cont_trezorerie || form.cont_trezorerie === '5311')) next.cont_trezorerie = '5121'
    if (patch.tip_operatie === 'incasare') {
      if (!form.cont_corespondent || form.cont_corespondent === '401') next.cont_corespondent = '4111'
      next.invoice_in_id = ''
      if (next.corelare_tip === 'factura') next.corelare_tip = 'neclasificat'
    }
    if (patch.tip_operatie === 'plata') {
      if (!form.cont_corespondent || form.cont_corespondent === '4111') next.cont_corespondent = '401'
      next.invoice_out_id = ''
      if (next.corelare_tip === 'factura') next.corelare_tip = 'neclasificat'
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
        next.corelare_tip = 'factura'
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
        next.corelare_tip = 'factura'
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
        next.corelare_tip = 'neclasificat'
      }
    }
    if ((Object.prototype.hasOwnProperty.call(patch, 'invoice_in_id') && !patch.invoice_in_id) || (Object.prototype.hasOwnProperty.call(patch, 'invoice_out_id') && !patch.invoice_out_id)) {
      if (!next.invoice_in_id && !next.invoice_out_id && next.corelare_tip === 'factura') next.corelare_tip = 'neclasificat'
    }
    if (patch.corelare_tip === 'avans' && !next.invoice_in_id && !next.invoice_out_id) {
      next.cont_corespondent = next.tip_operatie === 'incasare' ? '419' : '409'
    }
    if (patch.corelare_tip === 'neclasificat' && ['409', '419'].includes(next.cont_corespondent)) {
      next.cont_corespondent = next.tip_operatie === 'incasare' ? '4111' : '401'
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
    if (row.corelare_tip === 'factura' && !row.invoice_in_id && !row.invoice_out_id) return 'Alege factura legată sau marchează operația ca avans/corecție.'
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

  async function attachSuggestedInvoice(row, suggestion) {
    if (!row?.uuid || !suggestion?.id) return
    setActionLoading(`match-${row.uuid}`)
    setError('')
    setMessage('')
    setValidatedJournal(null)
    try {
      const payload = suggestion.tip === 'intrare'
        ? { invoice_in_id: suggestion.id, invoice_out_id: null }
        : { invoice_out_id: suggestion.id, invoice_in_id: null }
      await api.patch(`/accounting/treasury/${row.uuid}`, payload)
      setMessage(`Operația a fost legată de factura ${suggestion.document}. Verifică și validează când e în regulă.`)
      load()
    } catch (err) {
      setError(errorText(err, 'Factura sugerată nu a putut fi legată. Verifică dacă operația este draft și tipul este corect.'))
    } finally {
      setActionLoading('')
    }
  }

  async function settleAdvance(row, suggestion) {
    if (!row?.uuid || !suggestion?.id) return
    setActionLoading(`settle-${row.uuid}`)
    setError('')
    setMessage('')
    setValidatedJournal(null)
    try {
      const payload = suggestion.tip === 'intrare'
        ? { invoice_in_id: suggestion.id, invoice_out_id: null }
        : { invoice_out_id: suggestion.id, invoice_in_id: null }
      await api.post(`/accounting/treasury/${row.uuid}/settle-advance`, payload)
      setMessage(`Avansul a fost stins cu factura ${suggestion.document}.`)
      load()
    } catch (err) {
      setError(errorText(err, 'Avansul nu a putut fi stins. Verifică factura sugerată, suma rămasă și luna contabilă.'))
    } finally {
      setActionLoading('')
    }
  }

  async function openSettlement(row) {
    setSettlementLoading(true)
    setSettlementData(null)
    setSettlementAmounts({})
    setError('')
    setSettlementModal(true)
    try {
      const res = await api.get(`/accounting/treasury/${row.uuid}/settlement-preview`)
      setSettlementData(res.data)
    } catch (err) {
      setSettlementModal(false)
      setError(errorText(err, 'Operația nu poate fi pregătită pentru stingerea facturilor.'))
    } finally {
      setSettlementLoading(false)
    }
  }

  function allocateOldestFirst() {
    let available = money(settlementData?.totals?.available)
    const next = {}
    for (const invoice of settlementData?.invoices || []) {
      if (available <= 0) break
      const amount = Math.min(available, money(invoice.rest))
      if (amount > 0) next[invoice.id] = amount.toFixed(2)
      available = money(available - amount)
    }
    setSettlementAmounts(next)
  }

  async function submitSettlement() {
    const allocations = Object.entries(settlementAmounts)
      .map(([invoice_id, suma]) => ({ invoice_id, suma: money(suma) }))
      .filter(item => item.suma > 0)
    if (!allocations.length) {
      setError('Completează cel puțin o sumă de alocat pe factură.')
      return
    }
    setSettlementLoading(true)
    setError('')
    try {
      await api.post(`/accounting/treasury/${settlementData.treasury.uuid}/allocate`, { allocations })
      setSettlementModal(false)
      setMessage(`Au fost stinse ${allocations.length} facturi. Restul nealocat rămâne avans.`)
      load()
    } catch (err) {
      setError(errorText(err, 'Stingerea facturilor nu a putut fi salvată.'))
    } finally {
      setSettlementLoading(false)
    }
  }

  async function reverseSettlement(groupUuid) {
    setSettlementLoading(true)
    setError('')
    try {
      await api.post(`/accounting/settlement-groups/${groupUuid}/reverse`, { motiv: 'Corecție alocare facturi' })
      const res = await api.get(`/accounting/treasury/${settlementData.treasury.uuid}/settlement-preview`)
      setSettlementData(res.data)
      setSettlementAmounts({})
      setMessage('Grupul de stingeri a fost anulat, iar soldurile facturilor au fost refăcute.')
      load()
    } catch (err) {
      setError(errorText(err, 'Stingerea nu a putut fi anulată. Verifică dacă luna este deschisă.'))
    } finally {
      setSettlementLoading(false)
    }
  }

  async function classifyTreasury(row, type) {
    setActionLoading(`classify-${row.uuid}`)
    setError('')
    setMessage('')
    setValidatedJournal(null)
    try {
      const label = type === 'avans' ? 'avans' : type === 'corectie' ? 'corecție' : 'neclasificată'
      await api.post(`/accounting/treasury/${row.uuid}/classify`, {
        corelare_tip: type,
        observatii: type === 'avans'
          ? 'Marcat ca avans fara factura la momentul inregistrarii.'
          : type === 'corectie'
            ? 'Marcat ca diferenta/corectie fara factura directa.'
            : ''
      })
      setMessage(`Operația a fost marcată ca ${label}.`)
      load()
    } catch (err) {
      setError(errorText(err, 'Operația nu a putut fi clasificată. Verifică dacă luna este deschisă.'))
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
    const canAllocate = row.status === 'validat' && row.tert_id && !row.linked_invoice && money(row.available_total ?? row.suma - money(row.allocated_total)) > 0
    const bestSuggestion = (row.suggested_matches || [])[0]
    const canSettleAdvance = row.status === 'validat' && row.corelare_tip === 'avans' && !row.linked_invoice && bestSuggestion
    const invoiceLink = row.linked_invoice
      ? row.linked_invoice.tip === 'intrare'
        ? `/contabilitate/facturi-intrare?factura=${row.linked_invoice.id}`
        : `/contabilitate/facturi-iesire?factura=${row.linked_invoice.id}`
      : ''
    return [
      canValidate ? { label: 'Editeaza operatia', onClick: () => openEdit(row) } : null,
      canValidate && bestSuggestion ? { label: `Leaga factura sugerata ${bestSuggestion.document}`, onClick: () => attachSuggestedInvoice(row, bestSuggestion) } : null,
      canSettleAdvance ? { label: `Stinge avans cu ${bestSuggestion.document}`, onClick: () => settleAdvance(row, bestSuggestion) } : null,
      canAllocate ? { label: 'Aloca pe mai multe facturi', onClick: () => openSettlement(row) } : null,
      canValidate ? { label: 'Valideaza si genereaza nota', onClick: () => validate(row) } : null,
      canValidate ? { label: 'Anuleaza draft', onClick: () => cancelDraft(row), danger: true } : null,
      !row.linked_invoice && row.tert_id ? { label: 'Marcheaza ca avans', onClick: () => classifyTreasury(row, 'avans') } : null,
      !row.linked_invoice && row.tert_id ? { label: 'Marcheaza ca corectie', onClick: () => classifyTreasury(row, 'corectie') } : null,
      row.corelare_tip && !['neclasificat', 'factura'].includes(row.corelare_tip) ? { label: 'Scoate marcajul avans/corectie', onClick: () => classifyTreasury(row, 'neclasificat') } : null,
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
    <AccountingShell
      active="trezorerie"
      title="Trezorerie"
      subtitle="Registru de casa, jurnal de banca si deconturi cu note contabile generate."
      actions={<DropdownMenu align="right" label="Actiuni" items={[
        { label: 'Operatie noua', onClick: openNew },
        { label: 'Reincarca lista', onClick: load },
        { label: 'Export Excel', onClick: exportExcel },
        { type: 'separator' },
        { label: 'Facturi intrare', to: `/contabilitate/facturi-intrare?luna=${month}` },
        { label: 'Facturi iesire', to: `/contabilitate/facturi-iesire?luna=${month}` },
        { label: 'Registru jurnal', to: `/contabilitate/registru-jurnal?luna=${month}` }
      ]} />}
    >
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
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
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
          <Select label="Corelare" value={correlationFilter} onChange={event => setCorrelationFilter(event.target.value)} options={[
            { value: '', label: 'Toate' },
            { value: 'factura', label: 'Facturi' },
            { value: 'avans_nestins', label: 'Avansuri nestinse' },
            { value: 'avans', label: 'Toate avansurile' },
            { value: 'corectie', label: 'Corectii' },
            { value: 'neclasificat', label: 'Neclasificate' }
          ]} />
          <Select label="Tert" value={tertFilter} onChange={event => setTertFilter(event.target.value)} options={[
            { value: '', label: 'Toti tertii' },
            ...thirdParties.map(tert => ({ value: tert.id, label: `${tert.cod} - ${tert.denumire}` }))
          ]} />
          <Input label="Cauta" value={q} onChange={event => setQ(event.target.value)} placeholder="Document, tert, cont..." />
        </div>
      </Card>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-primary-700">Flux simplu trezorerie</div>
            <h3 className="mt-1 text-base font-semibold text-slate-900">{treasuryFlow.next.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{treasuryFlow.next.text}</p>
          </div>
          {treasuryFlow.next.to ? (
            <Link className="inline-flex h-[var(--control-height)] items-center rounded-[var(--radius-control)] bg-primary-700 px-[var(--control-px)] text-sm font-semibold text-white shadow-sm transition hover:bg-primary-800" to={treasuryFlow.next.to}>
              {treasuryFlow.next.label}
            </Link>
          ) : (
            <Button type="button" onClick={treasuryFlow.next.onClick}>{treasuryFlow.next.label}</Button>
          )}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
          {treasuryFlow.steps.map(step => (
            <div key={step.label} className={`rounded-md border px-3 py-2 ${step.done ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">{step.label}</div>
                <Badge tone={step.done ? 'success' : 'warning'}>{step.done ? 'OK' : 'Pas'}</Badge>
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{step.detail}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-xs text-slate-500">
          Firul simplu: factură deschisă → plată/încasare pregătită → corelare factură/avans → validare → notă contabilă.
        </div>
      </Card>
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
        <Card density="compact"><div className="text-xs text-slate-500">Operatii</div><div className="text-lg font-semibold">{totals.count}</div></Card>
        <Card density="compact"><div className="text-xs text-slate-500">Incasari</div><div className="text-lg font-semibold">{formatMoney(totals.incasari)}</div></Card>
        <Card density="compact"><div className="text-xs text-slate-500">Plati</div><div className="text-lg font-semibold">{formatMoney(totals.plati)}</div></Card>
        <Card density="compact"><div className="text-xs text-slate-500">Diferenta</div><div className="text-lg font-semibold">{formatMoney(totals.diferenta)}</div></Card>
        <Card density="compact"><div className="text-xs text-slate-500">Drafturi</div><div className="text-lg font-semibold">{totals.drafturi}</div></Card>
        <Card density="compact"><div className="text-xs text-slate-500">Avansuri nestinse</div><div className="text-lg font-semibold">{serverSummary.advances?.count || 0}</div></Card>
        <Card density="compact"><div className="text-xs text-slate-500">Sold avansuri</div><div className="text-lg font-semibold">{formatMoney(money(serverSummary.advances?.incasari) - money(serverSummary.advances?.plati))}</div></Card>
      </div>
      {serverSummary.advances?.count ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>{serverSummary.advances.count} avansuri validate asteapta factura: incasari {formatMoney(serverSummary.advances.incasari)} · plati {formatMoney(serverSummary.advances.plati)}.</span>
          <Button variant="secondary" size="sm" onClick={() => setCorrelationFilter(correlationFilter === 'avans_nestins' ? '' : 'avans_nestins')}>
            {correlationFilter === 'avans_nestins' ? 'Arata toate' : 'Vezi avansurile'}
          </Button>
        </div>
      ) : null}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Facturi deschise pentru trezorerie</h3>
            <p className="text-sm text-slate-500">Plăți și încasări pregătite direct din facturile validate cu rest.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge tone={openInvoiceSummary.overdueSuppliers ? 'danger' : openInvoiceSummary.suppliers.length ? 'warning' : 'success'}>
              Furnizori {formatMoney(openInvoiceSummary.supplierTotal)}
            </Badge>
            <Badge tone={openInvoiceSummary.overdueClients ? 'danger' : openInvoiceSummary.clients.length ? 'warning' : 'success'}>
              Clienți {formatMoney(openInvoiceSummary.clientTotal)}
            </Badge>
          </div>
        </div>
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          <div className="rounded-md border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-sm font-semibold text-slate-800">De plătit furnizori</div>
              <Badge tone={openInvoiceSummary.overdueSuppliers ? 'danger' : openInvoiceSummary.suppliers.length ? 'warning' : 'success'}>{openInvoiceSummary.suppliers.length}</Badge>
            </div>
            <div className="divide-y divide-slate-100">
              {openInvoiceSummary.suppliers.slice(0, 4).map(invoice => (
                <div key={`in-${invoice.id}`} className="grid gap-2 px-3 py-2 text-sm md:grid-cols-[minmax(160px,1fr)_110px_120px] md:items-center">
                  <div>
                    <div className="font-semibold text-slate-900">{invoiceDocument(invoice)}</div>
                    <div className="text-xs text-slate-500">{tertById.get(String(invoice.furnizor_id))?.denumire || 'Furnizor'} · scadent {invoice.data_scadenta || '-'}</div>
                  </div>
                  <div className="font-semibold text-slate-900">{formatMoney(invoice.rest)}</div>
                  <DropdownMenu align="right" label="Actiuni" items={[
                    { label: 'Pregateste plata', onClick: () => openInvoiceOperation(invoice, 'intrare') },
                    { label: 'Deschide factura', to: `/contabilitate/facturi-intrare?luna=${month}&q=${encodeURIComponent(invoiceDocument(invoice))}` },
                    { label: 'Fisa furnizor', to: `/contabilitate/furnizori?furnizor=${invoice.furnizor_id}` }
                  ]} />
                </div>
              ))}
              {openInvoiceSummary.suppliers.length ? null : <div className="px-3 py-5 text-sm text-slate-500">Nu sunt facturi furnizor deschise.</div>}
            </div>
          </div>
          <div className="rounded-md border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-sm font-semibold text-slate-800">De încasat clienți</div>
              <Badge tone={openInvoiceSummary.overdueClients ? 'danger' : openInvoiceSummary.clients.length ? 'warning' : 'success'}>{openInvoiceSummary.clients.length}</Badge>
            </div>
            <div className="divide-y divide-slate-100">
              {openInvoiceSummary.clients.slice(0, 4).map(invoice => (
                <div key={`out-${invoice.id}`} className="grid gap-2 px-3 py-2 text-sm md:grid-cols-[minmax(160px,1fr)_110px_120px] md:items-center">
                  <div>
                    <div className="font-semibold text-slate-900">{invoiceDocument(invoice)}</div>
                    <div className="text-xs text-slate-500">{tertById.get(String(invoice.client_id))?.denumire || 'Client'} · scadent {invoice.data_scadenta || '-'}</div>
                  </div>
                  <div className="font-semibold text-slate-900">{formatMoney(invoice.rest)}</div>
                  <DropdownMenu align="right" label="Actiuni" items={[
                    { label: 'Pregateste incasarea', onClick: () => openInvoiceOperation(invoice, 'iesire') },
                    { label: 'Deschide factura', to: `/contabilitate/facturi-iesire?luna=${month}&q=${encodeURIComponent(invoiceDocument(invoice))}` },
                    { label: 'Fisa client', to: `/contabilitate/clienti?client=${invoice.client_id}` }
                  ]} />
                </div>
              ))}
              {openInvoiceSummary.clients.length ? null : <div className="px-3 py-5 text-sm text-slate-500">Nu sunt facturi client deschise.</div>}
            </div>
          </div>
        </div>
      </Card>
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
              {!row.linked_invoice && row.corelare_tip && row.corelare_tip !== 'neclasificat' ? (
                <div className="mt-1">
                  <Badge tone={row.corelare_tip === 'avans' ? 'warning' : row.corelare_tip === 'corectie' ? 'info' : 'muted'}>
                    {row.corelare_label || row.corelare_tip}
                  </Badge>
                </div>
              ) : null}
              {money(row.allocated_total) > 0 ? (
                <div className="mt-1 text-xs text-emerald-700">
                  alocat {formatMoney(row.allocated_total)} · disponibil {formatMoney(row.available_total)}
                </div>
              ) : null}
              {!row.linked_invoice && row.suggested_matches?.length ? (
                <div className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                  Posibil: {row.suggested_matches[0].document} · {formatMoney(row.suggested_matches[0].rest)} · {row.suggested_matches[0].motiv}
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
            <Select label="Corelare" value={form.corelare_tip || 'neclasificat'} onChange={event => updateForm({ corelare_tip: event.target.value })} options={[
              { value: 'neclasificat', label: 'De corelat ulterior' },
              { value: 'factura', label: 'Factura legata' },
              { value: 'avans', label: 'Avans' },
              { value: 'corectie', label: 'Corectie / diferenta' }
            ]} />
            <AccountSelect label="Cont trezorerie" value={form.cont_trezorerie || ''} accounts={accounts} recommendedClasses={[5]} onChange={event => updateForm({ cont_trezorerie: event.target.value })} required />
            <AccountSelect label="Cont corespondent" value={form.cont_corespondent || ''} accounts={accounts} recommendedClasses={[4, 5, 6, 7]} onChange={event => updateForm({ cont_corespondent: event.target.value })} required />
          </div>
          {['avans', 'corectie'].includes(form.corelare_tip) ? (
            <Input label="Observatii corelare" value={form.corelare_observatii || ''} onChange={event => updateForm({ corelare_observatii: event.target.value })} />
          ) : null}
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
      <Modal open={settlementModal} title="Alocare plată pe facturi" onClose={() => setSettlementModal(false)}>
        {settlementLoading && !settlementData ? (
          <div className="py-8 text-center text-sm text-slate-500">Se pregătesc facturile deschise...</div>
        ) : settlementData ? (
          <div className="grid gap-4">
            {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
            <div className="grid gap-3 sm:grid-cols-3">
              <Card density="compact"><div className="text-xs text-slate-500">Valoare operație</div><div className="font-semibold">{formatMoney(settlementData.totals.operation)}</div></Card>
              <Card density="compact"><div className="text-xs text-slate-500">Deja alocat</div><div className="font-semibold">{formatMoney(settlementData.totals.allocated)}</div></Card>
              <Card density="compact"><div className="text-xs text-slate-500">Disponibil</div><div className="font-semibold text-primary-800">{formatMoney(settlementData.totals.available)}</div></Card>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Facturi deschise</h3>
                <p className="text-sm text-slate-500">Poți împărți suma între facturile aceluiași terț.</p>
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={allocateOldestFirst}>Distribuie după scadență</Button>
            </div>
            <Table headers={['Document', 'Data', 'Scadență', 'Rest', 'Alocă']}>
              {(settlementData.invoices || []).map(invoice => (
                <tr key={invoice.id}>
                  <td className="px-3 py-2 font-semibold">{invoice.document}</td>
                  <td className="px-3 py-2">{invoice.data || '-'}</td>
                  <td className="px-3 py-2">{invoice.data_scadenta || '-'}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(invoice.rest)}</td>
                  <td className="px-3 py-2">
                    <input
                      aria-label={`Alocare ${invoice.document}`}
                      className="w-32 rounded-md border border-slate-300 px-2 py-1 text-right text-sm"
                      type="number"
                      min="0"
                      max={invoice.rest}
                      step="0.01"
                      value={settlementAmounts[invoice.id] || ''}
                      onChange={event => setSettlementAmounts(current => ({ ...current, [invoice.id]: event.target.value }))}
                    />
                  </td>
                </tr>
              ))}
              {(settlementData.invoices || []).length ? null : <tr><td className="px-3 py-5 text-center text-slate-500" colSpan={5}>Nu există facturi deschise pentru acest terț.</td></tr>}
            </Table>
            {(settlementData.settlements || []).length ? (
              <div className="grid gap-2">
                <h3 className="text-base font-semibold text-slate-900">Alocări existente</h3>
                <Table headers={['Data', 'Factură', 'Suma', 'Sursa', 'Acțiuni']}>
                  {(settlementData.settlements || []).map(item => (
                    <tr key={item.uuid}>
                      <td className="px-3 py-2">{item.data || '-'}</td>
                      <td className="px-3 py-2">{item.invoice_document || '-'}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(item.suma)}</td>
                      <td className="px-3 py-2"><Badge tone={item.source_type === 'avans' ? 'warning' : 'success'}>{item.source_type}</Badge></td>
                      <td className="px-3 py-2"><Button type="button" size="sm" variant="secondary" onClick={() => reverseSettlement(item.group_uuid)}>Anulează grupul</Button></td>
                    </tr>
                  ))}
                </Table>
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setSettlementModal(false)}>Închide</Button>
              <Button type="button" loading={settlementLoading} disabled={!settlementData.totals.available || !(settlementData.invoices || []).length} onClick={submitSettlement}>Salvează stingerea</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </AccountingShell>
  )
}

export default Trezorerie
