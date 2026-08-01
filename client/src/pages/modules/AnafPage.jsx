import { useEffect, useMemo, useState } from 'react'
import { Download, FileText, Search, X } from 'lucide-react'
import api from '../../api/client'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import { useAuth } from '../../hooks/useAuth'

const tabs = ['🔍 Căutare CIF', '📄 Facturi e-Factura', '📦 Parteneri', '🔐 Conectare SPV']

const STATUS_LABEL = {
  draft: { label: 'Draft', tone: 'neutral' },
  validata: { label: 'Validată', tone: 'success' },
  trimisa_spv: { label: 'Trimisă SPV', tone: 'warning' },
  acceptata: { label: 'Acceptată', tone: 'success' },
  respinsa: { label: 'Respinsă', tone: 'danger' },
}

const EMPTY_INVOICE = {
  numar_factura: '',
  data_factura: '',
  data_scadenta: '',
  tip: 'emisa',
  partenerCif: '',
  partenerDenumire: '',
  partenerAdresa: '',
  emitentIban: '',
  emitentBanca: '',
  moneda: 'RON',
  mentiuni: '',
  linii: [{ descriere: '', cantitate: 1, unitateMasura: 'BUC', pretUnitar: 0, cotaTVA: 21 }],
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function addDays(dateStr, days) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function roiNumber(n) {
  return Number(n || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function buildAnafFlow({ summary, showLookup, showInvoices, showPartners, showSpv, createInvoice }) {
  const steps = [
    {
      key: 'partner',
      title: 'Verifică partenerul',
      detail: summary.partners
        ? `${summary.partners} parteneri sunt salvați din verificări CIF.`
        : 'Caută CIF/CUI înainte de facturare, ca datele să nu fie scrise manual greșit.',
      status: summary.partners ? 'date' : 'start',
      tone: summary.partners ? 'success' : 'warning',
      active: summary.partners > 0,
      onClick: showLookup,
    },
    {
      key: 'draft',
      title: 'Pregătește factura',
      detail: summary.invoices
        ? `${summary.invoices} facturi e-Factura în anul filtrat; ${summary.draft} drafturi.`
        : 'Creează factura din datele partenerului sau din factura contabilă de ieșire.',
      status: summary.draft ? 'draft' : summary.invoices ? 'ok' : 'de creat',
      tone: summary.draft ? 'warning' : summary.invoices ? 'success' : 'info',
      active: summary.invoices > 0 && !summary.draft,
      onClick: summary.invoices ? showInvoices : createInvoice,
    },
    {
      key: 'xml',
      title: 'Descarcă XML / trimite',
      detail: summary.validated
        ? `${summary.validated} facturi validate pot fi descărcate ca XML și trimise în SPV.`
        : 'Validează factura înainte de XML, ca documentul trimis să fie controlat.',
      status: summary.validated ? 'de trimis' : 'control',
      tone: summary.validated ? 'warning' : 'info',
      active: summary.validated === 0 && summary.invoices > 0,
      onClick: showInvoices,
    },
    {
      key: 'receipt',
      title: 'Arhivează recipisa',
      detail: summary.sent
        ? `${summary.sent} facturi sunt marcate trimise; atașează răspunsul SPV.`
        : summary.accepted
          ? `${summary.accepted} facturi au răspuns acceptat.`
          : 'După upload în SPV, atașează recipisa și marchează acceptată/respinsă.',
      status: summary.sent ? 'așteaptă' : summary.accepted ? 'acceptate' : 'recipisă',
      tone: summary.sent ? 'warning' : summary.accepted ? 'success' : 'info',
      active: summary.sent === 0 && summary.accepted > 0,
      onClick: showInvoices,
    },
    {
      key: 'spv',
      title: 'Conectare SPV',
      detail: summary.spvConfigured
        ? summary.spvAuthorized ? 'SPV este configurat și autorizat pentru pașii următori.' : 'SPV este configurat, dar autorizarea nu este finalizată.'
        : 'Pentru automatizare viitoare, configurează aplicația ANAF. Manualul XML rămâne disponibil.',
      status: summary.spvAuthorized ? 'activ' : summary.spvConfigured ? 'configurat' : 'manual',
      tone: summary.spvAuthorized ? 'success' : summary.spvConfigured ? 'warning' : 'neutral',
      active: summary.spvAuthorized,
      onClick: showSpv,
    },
  ]

  if (!summary.partners) {
    return {
      badge: 'Start',
      tone: 'warning',
      title: 'Începe cu verificarea partenerului',
      description: 'Pentru e-Factura, cea mai bună scurtătură este să aduci datele din CIF/CUI și abia apoi să pregătești factura.',
      primaryLabel: 'Caută CIF/CUI',
      primaryAction: showLookup,
      steps,
    }
  }

  if (!summary.invoices) {
    return {
      badge: 'Pregătire',
      tone: 'info',
      title: 'Ai parteneri, urmează prima factură',
      description: 'Creează factura e-Factura sau pregătește-o din factura contabilă de ieșire. XML-ul trebuie să plece doar după validare.',
      primaryLabel: 'Factură nouă',
      primaryAction: createInvoice,
      steps,
    }
  }

  if (summary.draft) {
    return {
      badge: 'Drafturi',
      tone: 'warning',
      title: `${summary.draft} facturi sunt încă draft`,
      description: 'Completează liniile, verifică TVA-ul și validează factura înainte de generarea XML.',
      primaryLabel: 'Vezi drafturi',
      primaryAction: () => showInvoices('draft'),
      steps,
    }
  }

  if (summary.validated) {
    return {
      badge: 'XML',
      tone: 'warning',
      title: `${summary.validated} facturi validate așteaptă XML/SPV`,
      description: 'Descarcă XML-ul, încarcă în SPV sau marchează factura ca trimisă dacă upload-ul a fost făcut manual.',
      primaryLabel: 'Vezi validate',
      primaryAction: () => showInvoices('validata'),
      steps,
    }
  }

  if (summary.sent) {
    return {
      badge: 'Recipise',
      tone: 'warning',
      title: `${summary.sent} facturi așteaptă răspuns SPV`,
      description: 'Atașează recipisa primită din SPV și marchează documentul acceptat sau respins.',
      primaryLabel: 'Vezi trimise',
      primaryAction: () => showInvoices('trimisa_spv'),
      steps,
    }
  }

  return {
    badge: 'La zi',
    tone: 'success',
    title: 'Fluxul e-Factura este la zi',
    description: 'Facturile filtrate nu au pași evidenți blocați. Poți verifica partenerii, SPV-ul sau dosarul fiscal.',
    primaryLabel: summary.spvAuthorized ? 'Vezi facturi' : 'Verifică SPV',
    primaryAction: summary.spvAuthorized ? showInvoices : showSpv,
    steps,
  }
}

export default function AnafPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState(tabs[0])
  const [error, setError] = useState('')

  // ── CIF Lookup ──
  const [cif, setCif] = useState('')
  const [cifResult, setCifResult] = useState(null)
  const [cifLoading, setCifLoading] = useState(false)
  const [cifError, setCifError] = useState('')

  // ── Facturi ──
  const [invoices, setInvoices] = useState([])
  const [invLoading, setInvLoading] = useState(false)
  const [invModal, setInvModal] = useState(false)
  const [invForm, setInvForm] = useState({ ...EMPTY_INVOICE, data_factura: today(), data_scadenta: addDays(today(), 30) })
  const [invSaving, setInvSaving] = useState(false)
  const [invError, setInvError] = useState('')
  const [editingInvoice, setEditingInvoice] = useState(null)
  const [validatedEditUnlocked, setValidatedEditUnlocked] = useState(false)
  const [implicitVat, setImplicitVat] = useState(21)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()))
  const [responseInvoice, setResponseInvoice] = useState(null)
  const [responseForm, setResponseForm] = useState({ status: 'acceptata', receipt_no: '', message: '', file: null })

  // ── Parteneri ──
  const [partners, setPartners] = useState([])
  const [partLoading, setPartLoading] = useState(false)
  const [spv, setSpv] = useState({})
  const [spvForm, setSpvForm] = useState({ client_id: '', client_secret: '', redirect_uri: '' })
  const [spvCode, setSpvCode] = useState('')
  const [spvState, setSpvState] = useState('')
  const isAdmin = ['admin', 'superadmin'].includes(user?.role)
  const invoiceReadOnly = Boolean(editingInvoice && editingInvoice.status !== 'draft' && !(editingInvoice.status === 'validata' && validatedEditUnlocked && isAdmin))

  function newInvoiceForm(vat = implicitVat) {
    return {
      ...EMPTY_INVOICE,
      data_factura: today(),
      data_scadenta: addDays(today(), 30),
      linii: [{ descriere: '', cantitate: 1, unitateMasura: 'BUC', pretUnitar: 0, cotaTVA: Number(vat) }],
    }
  }

  function invoiceToForm(invoice) {
    return {
      numar_factura: invoice.numar_factura || '',
      data_factura: invoice.data_factura || today(),
      data_scadenta: invoice.data_scadenta || invoice.data_factura || today(),
      tip: invoice.tip || 'emisa',
      partenerCif: invoice.partener?.cif || '',
      partenerDenumire: invoice.partener?.denumire || '',
      partenerAdresa: invoice.partener?.adresa || '',
      emitentIban: invoice.emitent?.iban || '',
      emitentBanca: invoice.emitent?.banca || '',
      moneda: invoice.moneda || 'RON',
      mentiuni: invoice.mentiuni || '',
      linii: (invoice.linii || []).map(line => ({ ...line })),
    }
  }

  function openNewInvoice(prefill = {}) {
    setEditingInvoice(null)
    setValidatedEditUnlocked(false)
    setInvForm({ ...newInvoiceForm(), ...prefill })
    setInvError('')
    setInvModal(true)
  }

  function openExistingInvoice(invoice) {
    setEditingInvoice(invoice)
    setValidatedEditUnlocked(false)
    setInvForm(invoiceToForm(invoice))
    setInvError('')
    setInvModal(true)
  }

  async function loadInvoices() {
    setInvLoading(true)
    try {
      const res = await api.get('/anaf/invoices', { params: { status: filterStatus || undefined, year: filterYear || undefined } })
      setInvoices(res.data.invoices || [])
    } catch { setInvoices([]) } finally { setInvLoading(false) }
  }

  async function loadPartners() {
    setPartLoading(true)
    try {
      const res = await api.get('/anaf/partners')
      setPartners(res.data.partners || [])
    } catch { setPartners([]) } finally { setPartLoading(false) }
  }

  async function loadSpv() {
    try { const res = await api.get('/anaf/spv/diagnostic'); setSpv(res.data); setSpvForm(form => ({ ...form, client_id: res.data.client_id || '', redirect_uri: res.data.redirect_uri || '' })) } catch (err) { setError(err.response?.data?.error || 'Diagnosticul SPV nu a putut fi incarcat.') }
  }

  useEffect(() => {
    Promise.resolve().then(() => {
      if (activeTab === tabs[1]) loadInvoices()
      if (activeTab === tabs[2]) loadPartners()
      if (activeTab === tabs[3]) loadSpv()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, filterStatus, filterYear])

  useEffect(() => {
    Promise.resolve().then(() => {
      loadInvoices()
      loadPartners()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    api.get('/anaf/settings')
      .then(response => setImplicitVat(Number(response.data.tva_implicit ?? 21)))
      .catch(() => setImplicitVat(21))
  }, [])

  async function saveSpv(e) {
    e.preventDefault(); setError('')
    try { const res = await api.put('/anaf/spv/config', spvForm); setSpv(res.data); setSpvForm(form => ({ ...form, client_secret: '' })) } catch (err) { setError(err.response?.data?.error || 'Configurarea SPV nu a putut fi salvata.') }
  }

  async function authorizeSpv() {
    try { const res = await api.post('/anaf/spv/authorization-url'); setSpvState(res.data.state); window.open(res.data.url, '_blank', 'noopener,noreferrer') } catch (err) { setError(err.response?.data?.error || 'Autorizarea SPV nu a putut fi pornita.') }
  }

  async function exchangeSpvCode() {
    try { const res = await api.post('/anaf/spv/exchange-code', { code: spvCode, state: spvState }); setSpv(res.data); setSpvCode('') } catch (err) { setError(err.response?.data?.error || 'Codul ANAF nu a putut fi schimbat cu token.') }
  }

  // ── Lookup CIF ──
  async function lookupCif(e) {
    e.preventDefault()
    if (!cif.trim()) return
    setCifLoading(true)
    setCifError('')
    setCifResult(null)
    try {
      const res = await api.post('/anaf/partners/lookup', { cif })
      setCifResult(res.data)
    } catch (err) {
      setCifError(err.response?.data?.error || 'ANAF nu a returnat date.')
    } finally {
      setCifLoading(false)
    }
  }

  function prefillFromCif() {
    if (!cifResult) return
    openNewInvoice({
      partenerCif: cifResult.cif,
      partenerDenumire: cifResult.denumire,
      partenerAdresa: cifResult.adresa,
    })
    setActiveTab(tabs[1])
  }

  // ── Creare factură ──
  async function createInvoice(e) {
    e.preventDefault()
    setInvSaving(true)
    setInvError('')
    try {
      if (editingInvoice) await api.patch(`/anaf/invoices/${editingInvoice.id}`, invForm)
      else await api.post('/anaf/invoices', invForm)
      setInvModal(false)
      setEditingInvoice(null)
      setValidatedEditUnlocked(false)
      setInvForm(newInvoiceForm())
      await loadInvoices()
    } catch (err) {
      setInvError(err.response?.data?.error || 'Factura nu a putut fi creată.')
    } finally {
      setInvSaving(false)
    }
  }

  // ── Download XML ──
  async function downloadXml(invoice) {
    try {
      const res = await api.get(`/anaf/invoices/${invoice.id}/xml`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `factura-${invoice.numar_factura}.xml`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.response?.data?.error || 'Eroare la generarea XML.')
    }
  }

  // ── Actualizare status ──
  async function updateStatus(invoice, status) {
    try {
      await api.patch(`/anaf/invoices/${invoice.id}`, { status })
      await loadInvoices()
    } catch (err) {
      const details = err.response?.data?.errors?.join(' ')
      setError(details || err.response?.data?.error || 'Statusul nu a putut fi actualizat.')
    }
  }

  async function saveSpvResponse(event) {
    event.preventDefault()
    if (!responseForm.file) { setError('Ataseaza recipisa sau raspunsul primit din SPV.'); return }
    try {
      const body = new FormData()
      body.append('status', responseForm.status)
      body.append('receipt_no', responseForm.receipt_no)
      body.append('message', responseForm.message)
      body.append('file', responseForm.file)
      await api.post(`/anaf/invoices/${responseInvoice.id}/response`, body)
      setResponseInvoice(null)
      setResponseForm({ status: 'acceptata', receipt_no: '', message: '', file: null })
      await loadInvoices()
    } catch (err) { setError(err.response?.data?.error || 'Raspunsul SPV nu a putut fi arhivat.') }
  }

  async function downloadSpvResponse(invoice) {
    try {
      const response = await api.get(`/anaf/invoices/${invoice.id}/response`, { responseType: 'blob' })
      const url = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = invoice.response_original_name || `Raspuns_SPV_${invoice.numar_factura}`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) { setError(err.response?.data?.error || 'Raspunsul SPV nu a putut fi descarcat.') }
  }

  // ── Linii factură ──
  function updateLine(index, field, value) {
    const linii = [...invForm.linii]
    linii[index] = { ...linii[index], [field]: field === 'descriere' || field === 'unitateMasura' ? value : Number(value) }
    linii[index].valoareFaraTVA = +(linii[index].cantitate * linii[index].pretUnitar).toFixed(2)
    linii[index].valoareTVA = +(linii[index].valoareFaraTVA * linii[index].cotaTVA / 100).toFixed(2)
    setInvForm(f => ({ ...f, linii }))
  }

  function addLine() {
    setInvForm(f => ({ ...f, linii: [...f.linii, { descriere: '', cantitate: 1, unitateMasura: 'BUC', pretUnitar: 0, cotaTVA: implicitVat, valoareFaraTVA: 0, valoareTVA: 0 }] }))
  }

  function removeLine(index) {
    setInvForm(f => ({ ...f, linii: f.linii.filter((_, i) => i !== index) }))
  }

  const totalFaraTVA = useMemo(() => invForm.linii.reduce((s, l) => s + (l.valoareFaraTVA || 0), 0), [invForm.linii])
  const totalTVA = useMemo(() => invForm.linii.reduce((s, l) => s + (l.valoareTVA || 0), 0), [invForm.linii])
  const flowSummary = useMemo(() => ({
    partners: partners.length,
    invoices: invoices.length,
    draft: invoices.filter(invoice => invoice.status === 'draft').length,
    validated: invoices.filter(invoice => invoice.status === 'validata').length,
    sent: invoices.filter(invoice => invoice.status === 'trimisa_spv').length,
    accepted: invoices.filter(invoice => invoice.status === 'acceptata').length,
    rejected: invoices.filter(invoice => invoice.status === 'respinsa').length,
    spvConfigured: Boolean(spv.configured),
    spvAuthorized: Boolean(spv.authorized),
  }), [partners.length, invoices, spv.configured, spv.authorized])
  function showInvoices(status = '') {
    setFilterStatus(status)
    setActiveTab(tabs[1])
  }
  const anafFlow = buildAnafFlow({
    summary: flowSummary,
    showLookup: () => setActiveTab(tabs[0]),
    showInvoices,
    showPartners: () => setActiveTab(tabs[2]),
    showSpv: () => setActiveTab(tabs[3]),
    createInvoice: () => { setActiveTab(tabs[1]); openNewInvoice() },
  })

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">ANAF / e-Factura</h2>
          <p className="text-sm text-slate-500">Lookup CIF, facturi electronice UBL 2.1 (CIUS-RO), parteneri.</p>
        </div>
        {activeTab === tabs[1] && (
          <Button onClick={() => openNewInvoice()}>+ Factură nouă</Button>
        )}
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
          <button onClick={() => setError('')}><X size={14} /></button>
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge tone={anafFlow.tone}>{anafFlow.badge}</Badge>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Flux e-Factura simplificat</span>
            </div>
            <h3 className="text-lg font-semibold text-slate-900">{anafFlow.title}</h3>
            <p className="mt-1 max-w-4xl text-sm text-slate-500">{anafFlow.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setActiveTab(tabs[2])}>Parteneri</Button>
            <Button onClick={anafFlow.primaryAction}>{anafFlow.primaryLabel}</Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <div className="rounded-[var(--radius-control)] border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Parteneri</div>
            <div className="mt-1 font-semibold text-slate-900">{flowSummary.partners}</div>
          </div>
          <div className="rounded-[var(--radius-control)] border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Facturi</div>
            <div className="mt-1 font-semibold text-slate-900">{flowSummary.invoices}</div>
          </div>
          <div className="rounded-[var(--radius-control)] border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Draft / validate</div>
            <div className="mt-1 font-semibold text-slate-900">{flowSummary.draft} / {flowSummary.validated}</div>
          </div>
          <div className="rounded-[var(--radius-control)] border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Trimise SPV</div>
            <div className="mt-1 font-semibold text-slate-900">{flowSummary.sent}</div>
          </div>
          <div className="rounded-[var(--radius-control)] border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">SPV</div>
            <div className="mt-1"><Badge tone={flowSummary.spvAuthorized ? 'success' : flowSummary.spvConfigured ? 'warning' : 'neutral'}>{flowSummary.spvAuthorized ? 'activ' : flowSummary.spvConfigured ? 'configurat' : 'manual'}</Badge></div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-5">
          {anafFlow.steps.map((step, index) => (
            <button
              type="button"
              key={step.key}
              onClick={step.onClick}
              className={`rounded-[var(--radius-panel)] border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${
                step.active
                  ? 'border-emerald-200 bg-emerald-50'
                  : step.tone === 'warning'
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-slate-200 bg-white'
              }`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary-700 text-xs font-bold text-white">{index + 1}</span>
                <Badge tone={step.tone}>{step.status}</Badge>
              </div>
              <div className="font-semibold text-slate-900">{step.title}</div>
              <div className="mt-1 text-xs leading-5 text-slate-600">{step.detail}</div>
            </button>
          ))}
        </div>
      </Card>

      {/* Tabs */}
      <Card>
        <div className="flex flex-wrap gap-2">
          {tabs.map(tab => (
            <Button key={tab} variant={activeTab === tab ? 'primary' : 'secondary'} onClick={() => setActiveTab(tab)}>
              {tab}
            </Button>
          ))}
        </div>
      </Card>

      {/* ── TAB: LOOKUP CIF ── */}
      {activeTab === tabs[0] && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="mb-4 text-base font-semibold text-slate-900">Căutare după CIF/CUI</h3>
            <form className="grid gap-3" onSubmit={lookupCif}>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    label="CIF / CUI"
                    value={cif}
                    onChange={e => setCif(e.target.value)}
                    placeholder="ex: 12345678 sau RO12345678"
                  />
                </div>
                <div className="flex items-end">
                  <Button type="submit" disabled={cifLoading || !cif.trim()}>
                    <Search size={16} /> {cifLoading ? 'Se caută...' : 'Caută'}
                  </Button>
                </div>
              </div>
              {cifError && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{cifError}</p>}
            </form>

            {cifResult && (
              <div className="mt-4 grid gap-3">
                <div className="rounded-xl border border-primary-200 bg-primary-50 p-4">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div>
                      <div className="text-lg font-bold text-slate-900">{cifResult.denumire}</div>
                      <div className="text-sm text-slate-500">CIF: RO{cifResult.cif}</div>
                    </div>
                    <Badge tone={cifResult.platitorTVA ? 'success' : 'neutral'}>
                      {cifResult.platitorTVA ? '✓ Plătitor TVA' : 'Non-TVA'}
                    </Badge>
                  </div>
                  <div className="grid gap-1 text-sm text-slate-700">
                    {cifResult.nrRegCom && <div><span className="text-slate-500">Reg. Com:</span> {cifResult.nrRegCom}</div>}
                    {cifResult.adresa && <div><span className="text-slate-500">Adresă:</span> {cifResult.adresa}</div>}
                    {cifResult.telefon && <div><span className="text-slate-500">Telefon:</span> {cifResult.telefon}</div>}
                    {cifResult.stare && <div><span className="text-slate-500">Stare:</span> {cifResult.stare}</div>}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button onClick={prefillFromCif}>📄 Creează factură</Button>
                    <Button variant="secondary" onClick={() => setCifResult(null)}>Șterge</Button>
                  </div>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <h3 className="mb-3 text-base font-semibold text-slate-900">ℹ️ Despre e-Factura</h3>
            <div className="grid gap-3 text-sm text-slate-600">
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="font-semibold text-slate-800">Ce este e-Factura?</div>
                <p className="mt-1">Sistemul național de facturare electronică RO-e-Factura obligă firmele să transmită facturile B2B prin SPV (Spațiul Privat Virtual) ANAF.</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="font-semibold text-slate-800">Format XML CIUS-RO</div>
                <p className="mt-1">InfraFlow generează XML conform standardului UBL 2.1 / CIUS-RO 1.0.1, gata de upload în SPV.</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="font-semibold text-slate-800">Flux operare</div>
                <ol className="mt-1 list-decimal list-inside space-y-1">
                  <li>Caută partenerul după CIF</li>
                  <li>Creează factura cu liniile de produse/servicii</li>
                  <li>Descarcă XML generat</li>
                  <li>Încarcă în SPV ANAF (spv.anaf.ro)</li>
                </ol>
              </div>
            </div>
          </Card>
        </div>
      )}

      {activeTab === tabs[3] && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="mb-2 text-base font-semibold">Conectare OAuth ANAF</h3>
            <p className="mb-4 text-sm text-slate-500">Completeaza datele aplicatiei inregistrate la ANAF. Secretul si tokenurile sunt criptate local.</p>
            <form className="grid gap-3" onSubmit={saveSpv}>
              <Input label="Client ID" value={spvForm.client_id} onChange={e => setSpvForm({ ...spvForm, client_id: e.target.value })} />
              <Input label="Secret client" type="password" value={spvForm.client_secret} onChange={e => setSpvForm({ ...spvForm, client_secret: e.target.value })} placeholder={spv.configured ? 'Salvat - completeaza doar pentru schimbare' : ''} />
              <Input label="URL redirectare" value={spvForm.redirect_uri} onChange={e => setSpvForm({ ...spvForm, redirect_uri: e.target.value })} />
              <div className="flex flex-wrap gap-2"><Button type="submit">Salveaza</Button><Button type="button" variant="secondary" disabled={!spv.configured} onClick={authorizeSpv}>Deschide autorizarea ANAF</Button></div>
            </form>
            {spvState && <div className="mt-4 grid gap-2"><Input label="Codul returnat de ANAF" value={spvCode} onChange={e => setSpvCode(e.target.value)} /><Button disabled={!spvCode} onClick={exchangeSpvCode}>Finalizeaza conectarea</Button></div>}
          </Card>
          <Card>
            <h3 className="mb-3 text-base font-semibold">Stare conexiune</h3>
            <div className="grid gap-2 text-sm"><div className="flex justify-between"><span>Configurare</span><Badge tone={spv.configured ? 'success' : 'warning'}>{spv.configured ? 'completa' : 'incompleta'}</Badge></div><div className="flex justify-between"><span>Autorizare</span><Badge tone={spv.authorized ? 'success' : 'neutral'}>{spv.authorized ? 'activa' : 'neautorizata'}</Badge></div>{spv.token_expires_at && <div>Token valabil pana la: {new Date(spv.token_expires_at).toLocaleString('ro-RO')}</div>}</div>
            <p className="mt-4 text-sm text-slate-500">Pana la autorizarea completa, XML-ul poate fi descarcat si incarcat manual in SPV, iar recipisa poate fi atasata facturii.</p>
          </Card>
        </div>
      )}

      {/* ── TAB: FACTURI ── */}
      {activeTab === tabs[1] && (
        <Card>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Select
              label="Status"
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              options={[
                { value: '', label: 'Toate statusurile' },
                ...Object.entries(STATUS_LABEL).map(([v, { label }]) => ({ value: v, label })),
              ]}
            />
            <Select
              label="An"
              value={filterYear}
              onChange={e => setFilterYear(e.target.value)}
              options={[
                { value: '', label: 'Toți anii' },
                ...Array.from({ length: 4 }, (_, i) => {
                  const y = String(new Date().getFullYear() - i)
                  return { value: y, label: y }
                }),
              ]}
            />
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Număr</th>
                  <th className="px-3 py-2">Dată</th>
                  <th className="px-3 py-2">Partener</th>
                  <th className="px-3 py-2 text-right">Total RON</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Acțiuni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invLoading ? (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Se încarcă...</td></tr>
                ) : invoices.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">Nu există facturi pentru filtrele selectate.</td></tr>
                ) : invoices.map(inv => {
                  const st = STATUS_LABEL[inv.status] || { label: inv.status, tone: 'neutral' }
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <FileText size={14} className="text-slate-400" />
                          {inv.numar_factura}
                        </div>
                        {inv.accounting_invoice_uuid ? <div className="mt-1 text-[11px] text-emerald-700">Legata la contabilitate</div> : null}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{inv.data_factura}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-800">{inv.partener?.denumire || '-'}</div>
                        <div className="text-xs text-slate-400">CIF: {inv.partener?.cif || '-'}</div>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-900">
                        {roiNumber(inv.totalCuTVA)}
                        <div className="text-xs font-normal text-slate-400">TVA: {roiNumber(inv.totalTVA)}</div>
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => openExistingInvoice(inv)}
                            className="rounded-md border border-slate-200 px-2 py-1 text-xs hover:border-primary-300 hover:text-primary-700"
                          >
                            Deschide
                          </button>
                          <button
                            onClick={() => downloadXml(inv)}
                            className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs hover:border-primary-300 hover:text-primary-700"
                            title="Descarcă XML"
                          >
                            <Download size={12} /> XML
                          </button>
                          {inv.status === 'draft' && (
                            <button
                              onClick={() => updateStatus(inv, 'validata')}
                              className="rounded-md border border-primary-200 bg-primary-50 px-2 py-1 text-xs text-primary-700 hover:bg-primary-100"
                            >
                              Validează
                            </button>
                          )}
                          {inv.status === 'validata' && (
                            <button
                              onClick={() => updateStatus(inv, 'trimisa_spv')}
                              className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700 hover:bg-amber-100"
                            >
                              Marcheaz. trimisă
                            </button>
                          )}
                          {inv.status === 'trimisa_spv' && (
                            <button
                              onClick={() => { setResponseInvoice(inv); setResponseForm({ status: 'acceptata', receipt_no: '', message: '', file: null }) }}
                              className="rounded-md border border-primary-200 bg-primary-50 px-2 py-1 text-xs text-primary-700 hover:bg-primary-100"
                            >Raspuns SPV</button>
                          )}
                          {inv.response_path && <button onClick={() => downloadSpvResponse(inv)} className="rounded-md border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50">Recipisa</button>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── TAB: PARTENERI ── */}
      {activeTab === tabs[2] && (
        <Card>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">CIF</th>
                  <th className="px-3 py-2">Denumire</th>
                  <th className="px-3 py-2">Adresă</th>
                  <th className="px-3 py-2">TVA</th>
                  <th className="px-3 py-2">Actualizat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {partLoading ? (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">Se încarcă...</td></tr>
                ) : partners.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400">
                    Niciun partener salvat. Caută după CIF pentru a adăuga automat.
                  </td></tr>
                ) : partners.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium">RO{p.cif}</td>
                    <td className="px-3 py-2 font-medium text-slate-900">{p.denumire}</td>
                    <td className="px-3 py-2 text-slate-500 max-w-xs truncate">{p.adresa || '-'}</td>
                    <td className="px-3 py-2"><Badge tone={p.platitorTVA ? 'success' : 'neutral'}>{p.platitorTVA ? 'Da' : 'Nu'}</Badge></td>
                    <td className="px-3 py-2 text-xs text-slate-400">{(p.updated_at || p.created_at || '').slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── MODAL FACTURĂ ── */}
      <Modal open={invModal} title={editingInvoice ? `Factură ${editingInvoice.numar_factura}` : 'Factură e-Factura nouă'} onClose={() => setInvModal(false)} size="xl">
        <form onSubmit={createInvoice}>
          {invoiceReadOnly && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Factura este validată și se afișează în mod readonly.</div>}
          {editingInvoice?.status === 'validata' && isAdmin && !validatedEditUnlocked && <div className="mb-4"><Button type="button" variant="secondary" onClick={() => setValidatedEditUnlocked(true)}>Editează</Button></div>}
          <fieldset disabled={invoiceReadOnly} className={invoiceReadOnly ? 'opacity-75' : ''}>
          <div className="grid gap-4 md:grid-cols-3">
            <Input label="Număr factură" value={invForm.numar_factura} onChange={e => setInvForm(f => ({ ...f, numar_factura: e.target.value }))} placeholder="IF-2026-0001 (auto dacă gol)" />
            <Input label="Dată emitere" type="date" value={invForm.data_factura} onChange={e => setInvForm(f => ({ ...f, data_factura: e.target.value }))} required />
            <Input label="Scadență" type="date" value={invForm.data_scadenta} onChange={e => setInvForm(f => ({ ...f, data_scadenta: e.target.value }))} />
          </div>

          <div className="mt-4 rounded-lg border border-slate-200 p-3">
            <div className="mb-3 text-xs font-semibold uppercase text-slate-500">Partener (client)</div>
            <div className="grid gap-3 md:grid-cols-3">
              <Input label="CIF partener" value={invForm.partenerCif} onChange={e => setInvForm(f => ({ ...f, partenerCif: e.target.value }))} placeholder="12345678" />
              <Input label="Denumire" value={invForm.partenerDenumire} onChange={e => setInvForm(f => ({ ...f, partenerDenumire: e.target.value }))} required />
              <Input label="Adresă" value={invForm.partenerAdresa} onChange={e => setInvForm(f => ({ ...f, partenerAdresa: e.target.value }))} />
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-slate-200 p-3">
            <div className="mb-3 text-xs font-semibold uppercase text-slate-500">Cont bancar emitent</div>
            <div className="grid gap-3 md:grid-cols-2">
              <Input label="IBAN" value={invForm.emitentIban} onChange={e => setInvForm(f => ({ ...f, emitentIban: e.target.value }))} placeholder="RO49AAAA1B31007593840000" />
              <Input label="Bancă" value={invForm.emitentBanca} onChange={e => setInvForm(f => ({ ...f, emitentBanca: e.target.value }))} />
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase text-slate-500">Linii factură</div>
              <Button type="button" variant="secondary" onClick={addLine} disabled={invoiceReadOnly}>+ Linie</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5">Descriere</th>
                    <th className="px-2 py-1.5 w-16">Cant.</th>
                    <th className="px-2 py-1.5 w-16">UM</th>
                    <th className="px-2 py-1.5 w-24">Preț/um</th>
                    <th className="px-2 py-1.5 w-16">TVA%</th>
                    <th className="px-2 py-1.5 w-24 text-right">Val. fără TVA</th>
                    <th className="px-2 py-1.5 w-6"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invForm.linii.map((line, i) => (
                    <tr key={i}>
                      <td className="px-1 py-1">
                        <input className="w-full rounded border border-slate-200 px-2 py-1 text-xs" value={line.descriere} onChange={e => updateLine(i, 'descriere', e.target.value)} placeholder="Serviciu / produs..." />
                      </td>
                      <td className="px-1 py-1">
                        <input className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-right" type="number" min="0" step="0.001" value={line.cantitate} onChange={e => updateLine(i, 'cantitate', e.target.value)} />
                      </td>
                      <td className="px-1 py-1">
                        <input className="w-full rounded border border-slate-200 px-2 py-1 text-xs" value={line.unitateMasura} onChange={e => updateLine(i, 'unitateMasura', e.target.value)} />
                      </td>
                      <td className="px-1 py-1">
                        <input className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-right" type="number" min="0" step="0.01" value={line.pretUnitar} onChange={e => updateLine(i, 'pretUnitar', e.target.value)} />
                      </td>
                      <td className="px-1 py-1">
                        <select className="w-full rounded border border-slate-200 px-1 py-1 text-xs" value={line.cotaTVA} onChange={e => updateLine(i, 'cotaTVA', e.target.value)}>
                          <option value={21}>21%</option>
                          <option value={19}>19%</option>
                          <option value={9}>9%</option>
                          <option value={5}>5%</option>
                          <option value={0}>0%</option>
                        </select>
                      </td>
                      <td className="px-1 py-1 text-right font-medium text-slate-700">{roiNumber(line.valoareFaraTVA)}</td>
                      <td className="px-1 py-1">
                        {invForm.linii.length > 1 && (
                          <button type="button" onClick={() => removeLine(i)} className="text-slate-300 hover:text-rose-500">
                            <X size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex justify-end gap-8 rounded-lg bg-slate-50 px-4 py-2 text-sm">
              <div className="text-slate-500">Bază impozabilă: <span className="font-semibold text-slate-800">{roiNumber(totalFaraTVA)} RON</span></div>
              <div className="text-slate-500">TVA: <span className="font-semibold text-slate-800">{roiNumber(totalTVA)} RON</span></div>
              <div className="text-slate-500">Total: <span className="text-lg font-bold text-primary-700">{roiNumber(totalFaraTVA + totalTVA)} RON</span></div>
            </div>
          </div>

          <div className="mt-4">
            <Input label="Mențiuni / Note" value={invForm.mentiuni} onChange={e => setInvForm(f => ({ ...f, mentiuni: e.target.value }))} placeholder="Termen plată, mențiuni speciale..." />
          </div>
          </fieldset>

          {invError && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{invError}</p>}

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setInvModal(false)}>Anulează</Button>
            {!invoiceReadOnly && <Button type="submit" disabled={invSaving}>
              {invSaving ? 'Se salvează...' : editingInvoice ? '💾 Salvează modificările' : '💾 Salvează factura'}
            </Button>}
          </div>
        </form>
      </Modal>
      <Modal open={Boolean(responseInvoice)} title={`Raspuns SPV - ${responseInvoice?.numar_factura || ''}`} onClose={() => setResponseInvoice(null)} size="md">
        <form className="grid gap-3" onSubmit={saveSpvResponse}>
          <Select label="Rezultat" value={responseForm.status} onChange={event => setResponseForm(current => ({ ...current, status: event.target.value }))} options={[{ value: 'acceptata', label: 'Acceptata' }, { value: 'respinsa', label: 'Respinsa' }]} />
          <Input label="Numar recipisa" value={responseForm.receipt_no} onChange={event => setResponseForm(current => ({ ...current, receipt_no: event.target.value }))} />
          <Input label="Mesaj / observatii" value={responseForm.message} onChange={event => setResponseForm(current => ({ ...current, message: event.target.value }))} />
          <label className="grid gap-1 text-sm"><span className="font-medium text-slate-700">Fisier PDF, XML, ZIP sau TXT</span><input type="file" accept=".pdf,.xml,.zip,.txt" onChange={event => setResponseForm(current => ({ ...current, file: event.target.files?.[0] || null }))} /></label>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setResponseInvoice(null)}>Renunta</Button><Button type="submit">Arhiveaza raspunsul</Button></div>
        </form>
      </Modal>
    </div>
  )
}
