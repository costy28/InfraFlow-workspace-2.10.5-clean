import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import api from '../../api/client'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import ConfirmDialog from '../../components/ui/ConfirmDialog'

const today = () => new Date().toISOString().slice(0, 10)
const emptyLine = () => ({ item_type: 'custom', item_reference: '', description: '', quantity: 1, unit: 'buc', unit_price: 0, discount_percent: 0, tax_percent: 21, notes: '' })
const newForm = () => ({ title: '', account_id: '', contact_id: '', currency: 'RON', issue_date: today(), valid_until: '', payment_terms: '', delivery_terms: '', notes_internal: '', notes_client: '', lines: [emptyLine()] })
const money = (value) => Number(value || 0).toFixed(2)
const invoiceAccountingLink = (invoice) => {
  const query = new URLSearchParams({ q: String(invoice?.uuid || '') })
  if (invoice?.an && invoice?.luna) query.set('luna', `${invoice.an}-${String(invoice.luna).padStart(2, '0')}`)
  return `/contabilitate/facturi-iesire?${query.toString()}`
}
const statusLabel = { draft: 'Draft', pending_approval: 'În aprobare', approved: 'Aprobată', sent: 'Trimisă', accepted: 'Acceptată de client', declined: 'Refuzată de client', rejected_internal: 'Respinsă intern', cancelled: 'Anulată' }
const stageLabel = { pending_approval: 'Oferte de aprobat', awaiting_customer: 'Oferte care așteaptă clientul', accepted: 'Oferte acceptate de client', confirmed_order: 'Oferte cu comandă confirmată' }
const auditLabel = {
  'crm:quote_created': 'Ofertă creată', 'crm:quote_updated': 'Ofertă actualizată', 'crm:quote_lines_changed': 'Poziții ofertă modificate', 'crm:quote_submitted_approval': 'Ofertă trimisă spre aprobare', 'crm:quote_approved': 'Ofertă aprobată intern', 'crm:quote_rejected_internal': 'Ofertă respinsă intern', 'crm:quote_sent': 'Ofertă trimisă pe email', 'crm:quote_public_link_created': 'Link client generat', 'crm:quote_public_link_revoked': 'Link client revocat', 'crm:quote_public_decision': 'Decizie client înregistrată', 'crm:customer_order_created': 'Comandă client creată', 'crm:customer_order_inventory_checked': 'Stoc verificat', 'crm:customer_order_procurement_requested': 'Necesar trimis către Achiziții', 'crm:customer_order_proforma_created': 'Proformă creată', 'crm:customer_order_invoice_draft_created': 'Factură draft creată în Contabilitate', 'crm:oblio_invoice_issued': 'Factură emisă în Oblio'
}
function auditDescription(entry) {
  const details = entry?.details || {}
  const parts = [details.order_number ? `Comandă ${details.order_number}` : '', details.quote_number ? `Ofertă ${details.quote_number}` : '', details.revision ? `Revizia ${details.revision}` : '', details.providerDocumentId ? `Document ${details.providerDocumentId}` : '', Number.isFinite(Number(details.lines)) ? `${details.lines} poziții` : '', details.idempotent ? 'operațiune reluată fără duplicare' : ''].filter(Boolean)
  return parts.join(' · ')
}

function localTotals(lines) {
  return (lines || []).reduce((total, line) => {
    const subtotal = Number(line.quantity || 0) * Number(line.unit_price || 0)
    const discount = subtotal * Number(line.discount_percent || 0) / 100
    const tax = (subtotal - discount) * Number(line.tax_percent || 0) / 100
    return { subtotal: total.subtotal + subtotal, discount: total.discount + discount, tax: total.tax + tax, total: total.total + subtotal - discount + tax }
  }, { subtotal: 0, discount: 0, tax: 0, total: 0 })
}

function Field({ label, children }) { return <label className="grid gap-1 text-sm font-medium text-slate-700">{label}{children}</label> }

export default function CrmQuotesPage() {
  const routeParams = useParams()
  // Pagina este montată prin `/crm/oferte/*`. Pentru o rută wildcard,
  // identificatorul ofertei se află în `*`, iar `noua` nu este un ID.
  const wildcardPath = String(routeParams['*'] || '')
  const id = routeParams.id || routeParams.quoteId || (/^\d+$/.test(wildcardPath) ? wildcardPath : '')
  const location = useLocation()
  const navigate = useNavigate()
  const isNew = wildcardPath === 'noua' || location.pathname.endsWith('/noua')
  const selectedStage = new URLSearchParams(location.search).get('stage') || ''
  const [quotes, setQuotes] = useState([])
  const [accounts, setAccounts] = useState([])
  const [contacts, setContacts] = useState([])
  const [quote, setQuote] = useState(null)
  const [audit, setAudit] = useState([])
  const [form, setForm] = useState(newForm)
  const [filters, setFilters] = useState({ q: '', status: '', expired: false })
  const [email, setEmail] = useState({ to: '', cc: '', bcc: '', subject: '', body: '', include_public_link: false, public_link_expires_in_days: 14 })
  const [publicLinks, setPublicLinks] = useState([])
  const [customerOrder, setCustomerOrder] = useState(null)
  const [inventoryCheck, setInventoryCheck] = useState(null)
  const [procurementRequirements, setProcurementRequirements] = useState([])
  const [billingDocuments, setBillingDocuments] = useState([])
  const [billingClients, setBillingClients] = useState([])
  const [publicLinkDays, setPublicLinkDays] = useState(14)
  const [newPublicUrl, setNewPublicUrl] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [oblioInvoiceConfirmation, setOblioInvoiceConfirmation] = useState(false)

  const selectedContacts = useMemo(() => contacts.filter(contact => !form.account_id || String(contact.account_id) === String(form.account_id)), [contacts, form.account_id])
  const totals = useMemo(() => localTotals(form.lines), [form.lines])

  async function load() {
    setError('')
    try {
      const params = { ...(filters.q ? { q: filters.q } : {}), ...(filters.status ? { status: filters.status } : {}), ...(selectedStage ? { stage: selectedStage } : {}), ...(filters.expired ? { expired: 'true' } : {}) }
      const workspaceResult = await api.get('/crm/quotes/workspace', { params: { ...params, ...(id ? { quote_id: id } : {}) } })
      const workspace = workspaceResult.data || {}
      setQuotes(workspace.quotes || [])
      setAccounts(workspace.accounts || [])
      setContacts(workspace.contacts || [])
      if (workspace.quote) {
        const loaded = workspace.quote
        setQuote(loaded)
        setAudit(workspace.audit || [])
        setForm({ ...newForm(), ...loaded, account_id: loaded.account_id || '', contact_id: loaded.contact_id || '', lines: loaded.lines?.length ? loaded.lines : [emptyLine()] })
        setEmail({ to: loaded.contact_email || loaded.account_email || '', cc: '', bcc: '', subject: `Oferta ${loaded.quote_number} / Rev. ${loaded.revision_number}`, body: `<p>Bună ziua,</p><p>Vă transmitem oferta ${loaded.quote_number}.</p>`, include_public_link: false, public_link_expires_in_days: 14 })
        setPublicLinks(workspace.public_links || [])
        setCustomerOrder(workspace.customer_order || null)
        setInventoryCheck(workspace.inventory_check || null)
        setProcurementRequirements(workspace.procurement_requirements || [])
        if (workspace.customer_order) {
          api.get(`/crm/customer-orders/${workspace.customer_order.id}/billing-documents`).then(result => setBillingDocuments(result.data.documents || [])).catch(() => setBillingDocuments([]))
          api.get('/crm/billing/clients').then(result => setBillingClients(result.data.clients || [])).catch(() => setBillingClients([]))
        } else { setBillingDocuments([]); setBillingClients([]) }
      } else {
        setQuote(null); setAudit([]); setPublicLinks([]); setCustomerOrder(null); setInventoryCheck(null); setProcurementRequirements([]); setBillingDocuments([]); setBillingClients([]); setNewPublicUrl(''); if (isNew) setForm(newForm())
      }
    } catch (requestError) { setError(requestError.response?.data?.error || 'CRM Oferte indisponibil.') }
  }
  useEffect(() => { load() }, [id, location.search, filters.status, filters.expired])

  function setLine(index, patch) { setForm(current => ({ ...current, lines: current.lines.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line) })) }
  function removeLine(index) { setForm(current => ({ ...current, lines: current.lines.filter((_, lineIndex) => lineIndex !== index) })) }
  function moveLine(index, direction) {
    setForm(current => {
      const target = index + direction
      if (target < 0 || target >= current.lines.length) return current
      const lines = [...current.lines]; [lines[index], lines[target]] = [lines[target], lines[index]]
      return { ...current, lines }
    })
  }
  function changeAccount(accountId) { setForm(current => ({ ...current, account_id: accountId, contact_id: selectedContacts.some(c => String(c.id) === String(current.contact_id) && String(c.account_id) === String(accountId)) ? current.contact_id : '' })) }
  function changeStatusFilter(status) {
    setFilters(current => ({ ...current, status }))
    if (selectedStage) navigate('/crm/oferte')
  }

  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      const result = id ? await api.patch(`/crm/quotes/${id}`, form) : await api.post('/crm/quotes', form)
      navigate(`/crm/oferte/${result.data.quote.id}`)
    } catch (requestError) { setError(requestError.response?.data?.error || 'Oferta nu a putut fi salvată.') } finally { setBusy(false) }
  }
  async function action(path, body = {}) {
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await api.post(`/crm/quotes/${id}/${path}`, body)
      if (path === 'generate-document') {
        const preview = window.open('', '_blank', 'noopener,noreferrer')
        if (preview) { preview.document.open(); preview.document.write(result.data.html); preview.document.close(); preview.focus() }
        setNotice('Documentul print-ready a fost generat și legat de această revizie.')
      } else if (path === 'revision') navigate(`/crm/oferte/${result.data.quote.id}`)
      else if (path === 'customer-order') {
        setCustomerOrder(result.data.order)
        setInventoryCheck(null); setProcurementRequirements([]); setBillingDocuments([])
        setNotice(result.data.idempotent ? `Comanda ${result.data.order.order_number} exista deja pentru această ofertă acceptată.` : `Comanda client ${result.data.order.order_number} a fost creată din această ofertă acceptată.`)
      }
      else { setNotice(path === 'send' ? 'Oferta a fost trimisă și înregistrată în Inbox ERP.' : 'Acțiunea a fost înregistrată.'); await load() }
    } catch (requestError) { setError(requestError.response?.data?.error || 'Acțiunea a eșuat.') } finally { setBusy(false) }
  }
  async function checkInventory() {
    if (!customerOrder) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await api.post(`/crm/customer-orders/${customerOrder.id}/inventory-check`)
      setInventoryCheck(result.data.check || null)
      const summary = result.data.check?.result?.summary || {}
      setNotice(summary.material_lines ? `Stoc verificat: ${summary.sufficient_lines || 0} poziții disponibile, ${summary.shortage_lines || 0} cu deficit. Stocul nu a fost modificat.` : 'Comanda nu conține poziții de tip material; stocul nu se aplică.')
    } catch (requestError) { setError(requestError.response?.data?.error || 'Stocul nu a putut fi verificat.') } finally { setBusy(false) }
  }
  async function createProcurementRequirements() {
    if (!customerOrder) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await api.post(`/crm/customer-orders/${customerOrder.id}/procurement-requirements`)
      setProcurementRequirements(result.data.requirements || [])
      setNotice(result.data.idempotent ? 'Necesarul activ pentru acest deficit există deja; nu a fost duplicat.' : `${result.data.created || 0} necesar(e) au fost create în Achiziții pentru deficitul confirmat.`)
    } catch (requestError) { setError(requestError.response?.data?.error || 'Necesarul de aprovizionare nu a putut fi creat.') } finally { setBusy(false) }
  }
  async function createBillingDocument(kind) {
    if (!customerOrder) return
    setBusy(true); setError(''); setNotice('')
    try {
      const path = kind === 'proforma' ? 'proforma' : 'invoice-draft'
      const result = await api.post(`/crm/customer-orders/${customerOrder.id}/${path}`)
      const document = result.data.document
      setBillingDocuments(current => [document, ...current.filter(item => String(item.id) !== String(document.id))])
      if (kind === 'proforma') setNotice(result.data.idempotent ? `Proforma ${document.provider_document_id} există deja pentru această comandă.` : `Proforma ${document.provider_document_id} a fost creată.`)
      else setNotice(result.data.idempotent ? 'Factura draft există deja în Contabilitate.' : `Factura draft ${result.data.invoice?.serie || 'IF'}-${result.data.invoice?.numar || ''} a fost creată în Contabilitate. Valideaz-o separat, după controlul contabil.`)
    } catch (requestError) { setError(requestError.response?.data?.error || 'Documentul de facturare nu a putut fi creat.') } finally { setBusy(false) }
  }
  async function emitInvoiceInOblio() {
    if (!customerOrder) return
    setOblioInvoiceConfirmation(false)
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await api.post(`/crm/customer-orders/${customerOrder.id}/oblio/invoice`, { confirmed: true })
      const document = result.data.document
      setBillingDocuments(current => [document, ...current.filter(item => String(item.id) !== String(document.id))])
      setNotice(result.data.idempotent ? `Factura Oblio ${document.provider_document_id} există deja.` : `Factura Oblio ${document.provider_document_id} a fost emisă.`)
      await load()
    } catch (requestError) { setError(requestError.response?.data?.error || 'Factura nu a putut fi emisă în Oblio.') } finally { setBusy(false) }
  }
  async function linkAccountingClient(value) {
    if (!customerOrder) return
    setBusy(true); setError(''); setNotice('')
    try {
      await api.patch(`/crm/accounts/${customerOrder.account_id}`, { accounting_third_party_id: value || '' })
      setCustomerOrder(current => ({ ...current, accounting_third_party_id: value ? Number(value) : null }))
      setNotice(value ? 'Terțul contabil a fost legat de clientul CRM. Poți crea factura draft.' : 'Legătura cu terțul contabil a fost eliminată.')
    } catch (requestError) { setError(requestError.response?.data?.error || 'Terțul contabil nu a putut fi legat.') } finally { setBusy(false) }
  }
  async function createPublicLink() {
    setBusy(true); setError(''); setNotice(''); setNewPublicUrl('')
    try {
      const result = await api.post(`/crm/quotes/${id}/public-link`, { expires_in_days: Number(publicLinkDays) })
      setNewPublicUrl(result.data.url || '')
      setNotice('Linkul securizat a fost generat. Copiază-l acum; din motive de securitate nu se mai afișează ulterior.')
      if (navigator.clipboard?.writeText && result.data.url) await navigator.clipboard.writeText(result.data.url)
      const linksResult = await api.get(`/crm/quotes/${id}/public-links`)
      setPublicLinks(linksResult.data.links || [])
    } catch (requestError) { setError(requestError.response?.data?.error || 'Linkul public nu a putut fi generat.') } finally { setBusy(false) }
  }
  async function revokePublicLink(linkId) {
    setBusy(true); setError(''); setNotice('')
    try {
      await api.post(`/crm/quotes/${id}/public-links/${linkId}/revoke`)
      setNotice('Linkul public a fost revocat.')
      const linksResult = await api.get(`/crm/quotes/${id}/public-links`)
      setPublicLinks(linksResult.data.links || [])
    } catch (requestError) { setError(requestError.response?.data?.error || 'Linkul public nu a putut fi revocat.') } finally { setBusy(false) }
  }

  if (!id && !isNew) return <Card title="Oferte" subtitle="Drafturi, aprobări și oferte trimise. Detaliile se deschid doar la click." actions={<Link to="/crm/oferte/noua"><Button>+ Ofertă nouă</Button></Link>}>
    {selectedStage ? <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded border border-primary-200 bg-primary-50 p-3 text-sm text-primary-900"><span>Filtru rapid: <strong>{stageLabel[selectedStage] || 'Flux comercial'}</strong></span><Link to="/crm/oferte" className="font-medium underline">Șterge filtrul rapid</Link></div> : null}
    <div className="mb-4 grid gap-2 md:grid-cols-4"><input value={filters.q} placeholder="Caută număr, titlu, client" onChange={event => setFilters(current => ({ ...current, q: event.target.value }))} onKeyDown={event => event.key === 'Enter' && load()} /><select value={filters.status} onChange={event => changeStatusFilter(event.target.value)}><option value="">Toate statusurile</option>{Object.entries(statusLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={filters.expired} onChange={event => setFilters(current => ({ ...current, expired: event.target.checked }))} />Doar expirate</label><Button variant="secondary" onClick={load}>Aplică filtre</Button></div>
    {error ? <p className="mb-3 text-red-600">{error}</p> : null}
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>Număr</th><th>Rev.</th><th>Client</th><th>Valabilitate</th><th>Status</th><th>Comandă</th><th className="text-right">Total</th></tr></thead><tbody>{quotes.map(item => <tr className="cursor-pointer border-t hover:bg-slate-50" onClick={() => navigate(`/crm/oferte/${item.id}`)} key={item.id}><td>{item.quote_number}</td><td>{item.revision_number}</td><td>{item.account_name}</td><td>{item.valid_until || '—'}</td><td>{statusLabel[item.status] || item.status}</td><td>{item.customer_order_number ? <span className="font-medium text-emerald-800">{item.customer_order_number}{item.customer_order_status === 'confirmed' ? ' · confirmată' : ''}</span> : '—'}</td><td className="text-right">{money(item.total)} {item.currency}</td></tr>)}{!quotes.length ? <tr><td colSpan="7" className="py-6 text-center text-slate-500">Nu există oferte pentru filtrul selectat.</td></tr> : null}</tbody></table></div>
  </Card>

  if (id && quote && quote.status !== 'draft') return <div className="grid gap-4">
    <Card title={`${quote.quote_number} / Rev. ${quote.revision_number}`} subtitle={`${statusLabel[quote.status] || quote.status} · ${quote.account_name}`} actions={<div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={busy} onClick={() => action('generate-document')}>Print / PDF</Button>{quote.status === 'pending_approval' ? <><Button disabled={busy} onClick={() => action('approve')}>Aprobă</Button><Button variant="secondary" disabled={busy} onClick={() => action('reject', { reason: 'Respins intern' })}>Respinge</Button></> : null}{quote.status === 'accepted' ? <Button disabled={busy} onClick={() => action('customer-order')}>Creează comandă client</Button> : null}{['approved', 'sent', 'accepted', 'declined', 'rejected_internal'].includes(quote.status) ? <Button variant="secondary" disabled={busy} onClick={() => action('revision')}>Creează revizie</Button> : null}</div>}>
      {error ? <p className="mb-3 text-red-600">{error}</p> : null}{notice ? <p className="mb-3 text-emerald-700">{notice}</p> : null}
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>#</th><th>Descriere</th><th>Cant.</th><th>Preț</th><th>Discount</th><th>TVA</th><th className="text-right">Total</th></tr></thead><tbody>{quote.lines.map(line => <tr className="border-t" key={line.id}><td>{line.position}</td><td>{line.description}</td><td>{line.quantity} {line.unit}</td><td>{money(line.unit_price)}</td><td>{money(line.discount_percent)}%</td><td>{money(line.tax_percent)}%</td><td className="text-right">{money(line.line_total)} {quote.currency}</td></tr>)}</tbody></table></div>
      <p className="mt-4 text-right font-bold">Total: {money(quote.total)} {quote.currency}</p>
      {quote.document_path ? <p className="mt-3 text-sm text-slate-600">Documentul este atașat acestei revizii în dosarul controlat al aplicației.</p> : null}
      {customerOrder ? <div className="mt-3 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><strong>Comandă client: {customerOrder.order_number}</strong><span className="ml-2">Creată din {quote.quote_number}, Rev. {quote.revision_number}.</span></div> : null}
    </Card>
    {customerOrder ? <Card title="Stoc și aprovizionare" subtitle="Verificarea este un instantaneu informativ: nu rezervă și nu modifică stocul. Deficitul se trimite manual în Achiziții ca necesar, nu ca o comandă către furnizor." actions={<div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={busy} onClick={checkInventory}>Verifică stocul</Button><Button disabled={busy || !inventoryCheck?.result?.procurement_candidates?.length} onClick={createProcurementRequirements}>Creează necesar în Achiziții</Button></div>}>
      {!inventoryCheck ? <p className="text-sm text-slate-500">Nu s-a făcut încă o verificare a stocului pentru comanda {customerOrder.order_number}.</p> : <div className="grid gap-3"><div className="rounded bg-slate-50 p-3 text-sm"><strong>{inventoryCheck.result?.check_status === 'sufficient' ? 'Stoc suficient' : inventoryCheck.result?.check_status === 'not_applicable' ? 'Stoc neaplicabil' : 'Necesită atenție'}</strong><span className="ml-2">Verificat la {inventoryCheck.checked_at ? new Date(inventoryCheck.checked_at).toLocaleString('ro-RO') : '—'} · fără rezervare automată.</span></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>Poziție</th><th>Stare</th><th>Cerut</th><th>Disponibil</th><th>Deficit</th></tr></thead><tbody>{(inventoryCheck.result?.lines || []).map(line => <tr className="border-t" key={line.line_id}><td>{line.description}</td><td>{line.status === 'sufficient' ? 'Disponibil' : line.status === 'shortage' ? 'Deficit' : line.status === 'unmapped' ? 'Nemapat' : 'Neaplicabil'}</td><td>{line.requested_quantity} {line.unit}</td><td>{line.available_quantity == null ? '—' : `${line.available_quantity} ${line.unit}`}</td><td>{line.shortage_quantity == null ? '—' : `${line.shortage_quantity} ${line.unit}`}</td></tr>)}</tbody></table></div>{inventoryCheck.result?.summary?.unmapped_lines ? <p className="text-sm text-amber-700">Unele materiale nu sunt mapate sigur în catalog. Nu a fost creat automat niciun necesar pentru ele.</p> : null}</div>}
      {procurementRequirements.length ? <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><strong>Necesare în Achiziții:</strong> {procurementRequirements.map(item => `${item.itemName} · ${item.amount} ${item.unit}`).join(' | ')}. Achizițiile aleg furnizorul și emit comanda separat.</div> : null}
    </Card> : null}
    {customerOrder ? <Card title="Proformă și facturare" subtitle="Proforma este comercială. Factura se creează numai ca draft în Contabilitate; validarea, nota contabilă și e-Factura rămân pași controlați acolo." actions={<div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={busy} onClick={() => createBillingDocument('proforma')}>Creează proformă</Button><Button disabled={busy} onClick={() => createBillingDocument('invoice')}>Creează factură draft</Button><Button variant="secondary" disabled={busy} onClick={() => setOblioInvoiceConfirmation(true)}>Emite factură în Oblio</Button></div>}>
      <div className="mb-3 grid gap-1 text-sm"><label className="font-medium text-slate-700">Terț contabil pentru client</label><select value={customerOrder.accounting_third_party_id || ''} disabled={busy} onChange={event => linkAccountingClient(event.target.value)}><option value="">Alege terțul client din Contabilitate</option>{billingClients.map(client => <option key={client.id} value={client.id}>{client.denumire}{client.cui ? ` · ${client.cui}` : ''}</option>)}</select><p className="text-slate-500">Proforma poate fi creată independent. Factura draft folosește terțul ales și rămâne în controlul Contabilității.</p></div>
      {billingDocuments.length ? <div className="grid gap-2">{billingDocuments.map(document => <div className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm" key={document.id}><span><strong>{document.document_kind === 'proforma' ? 'Proformă' : document.provider_key === 'oblio' ? 'Factură Oblio' : 'Factură draft'}</strong><span className="ml-2">{document.provider_document_id || 'în pregătire'} · {document.status === 'issued' ? 'emisă' : document.status}</span></span>{document.document_kind === 'invoice_draft' && document.response?.invoice?.uuid ? <Link className="font-medium text-emerald-800 underline" to={invoiceAccountingLink(document.response.invoice)}>Deschide în Contabilitate</Link> : document.response?.link ? <a className="font-medium text-emerald-800 underline" href={document.response.link} target="_blank" rel="noreferrer">Deschide în Oblio</a> : null}</div>)}</div> : <p className="text-sm text-slate-500">Nu există încă proformă sau factură draft pentru această comandă.</p>}
    </Card> : null}
    {['approved', 'sent'].includes(quote.status) ? <Card title="Link public securizat" subtitle="Clientul vede doar această ofertă și revizie. Linkul este o credențială temporară; valoarea lui se arată o singură dată, imediat după generare."><div className="flex flex-wrap items-end gap-3"><Field label="Valabilitate"><select value={publicLinkDays} onChange={event => setPublicLinkDays(event.target.value)}><option value="7">7 zile</option><option value="14">14 zile</option><option value="30">30 zile</option><option value="60">60 zile</option><option value="90">90 zile</option></select></Field><Button disabled={busy} onClick={createPublicLink}>Generează / regenerează link</Button></div>{newPublicUrl ? <div className="mt-4 rounded border border-emerald-200 bg-emerald-50 p-3"><p className="text-sm font-medium text-emerald-900">Link nou, copiat în clipboard:</p><div className="mt-2 flex flex-wrap gap-2"><input readOnly value={newPublicUrl} className="min-w-[280px] flex-1" /><Button type="button" variant="secondary" onClick={() => navigator.clipboard?.writeText(newPublicUrl)}>Copiază</Button></div></div> : null}<div className="mt-4 grid gap-2">{publicLinks.length ? publicLinks.map(link => <div className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm" key={link.id}><span>Link #{link.id} · revizia {link.quote_revision} · <strong>{link.status === 'active' ? 'activ' : link.status === 'used' ? 'decizie înregistrată' : link.status === 'revoked' ? 'revocat' : link.status}</strong> · expiră {link.expires_at ? new Date(link.expires_at).toLocaleString('ro-RO') : '—'}</span>{link.status === 'active' ? <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => revokePublicLink(link.id)}>Revocă</Button> : null}</div>) : <p className="text-sm text-slate-500">Nu există încă link public pentru această revizie.</p>}</div></Card> : null}
    {quote.status === 'approved' ? <Card title="Trimite oferta prin email" subtitle="Oferta print-ready este atașată automat și mesajul rămâne legat de revizia exactă în Inbox ERP."><div className="grid gap-3 md:grid-cols-2"><Field label="Către"><input type="email" value={email.to} onChange={event => setEmail(current => ({ ...current, to: event.target.value }))} /></Field><Field label="CC"><input value={email.cc} onChange={event => setEmail(current => ({ ...current, cc: event.target.value }))} /></Field><Field label="BCC"><input value={email.bcc} onChange={event => setEmail(current => ({ ...current, bcc: event.target.value }))} /></Field><Field label="Subiect"><input value={email.subject} onChange={event => setEmail(current => ({ ...current, subject: event.target.value }))} /></Field></div><Field label="Mesaj"><textarea rows="5" value={email.body} onChange={event => setEmail(current => ({ ...current, body: event.target.value }))} /></Field><label className="mt-3 flex flex-wrap items-center gap-2 text-sm"><input type="checkbox" checked={email.include_public_link} onChange={event => setEmail(current => ({ ...current, include_public_link: event.target.checked }))} />Include linkul securizat pentru acceptare/refuz <select value={email.public_link_expires_in_days} disabled={!email.include_public_link} onChange={event => setEmail(current => ({ ...current, public_link_expires_in_days: Number(event.target.value) }))}><option value="7">7 zile</option><option value="14">14 zile</option><option value="30">30 zile</option></select></label><div className="mt-3"><Button disabled={busy || !email.to} onClick={() => action('send', email)}>Trimite oferta</Button></div></Card> : null}
    <Card title="Activitate și audit" subtitle="Istoricul explicat al operațiunilor pentru această ofertă și revizie."><div className="grid gap-2">{audit.length ? audit.map(entry => <div className="rounded border p-3 text-sm" key={entry.id || `${entry.at}-${entry.action}`}><div className="flex flex-wrap justify-between gap-2"><strong>{auditLabel[entry.action] || 'Activitate CRM'}</strong><span className="text-slate-500">{entry.at || entry.created_at ? new Date(entry.at || entry.created_at).toLocaleString('ro-RO') : '—'}</span></div>{auditDescription(entry) ? <p className="mt-1 text-slate-600">{auditDescription(entry)}</p> : null}<p className="mt-1 text-xs text-slate-400">Cod audit: {entry.action}</p></div>) : <p className="text-slate-500">Nu există încă evenimente de audit pentru această revizie.</p>}</div></Card>
    <ConfirmDialog
      open={oblioInvoiceConfirmation}
      title="Emiți factura în Oblio?"
      message="Va fi creată o factură reală în contul Oblio configurat."
      details="InfraFlow cere mai întâi factura draft din Contabilitate, nu modifică stocul în Oblio și nu trimite automat documentul în SPV. Anularea sau corecția ulterioară se face conform regulilor din Oblio și Contabilitate."
      confirmLabel="Emite factura"
      tone="warning"
      loading={busy}
      onCancel={() => setOblioInvoiceConfirmation(false)}
      onConfirm={emitInvoiceInOblio}
    />
  </div>

  return <form onSubmit={save} className="grid gap-4">
    <Card title={id ? 'Editează draftul' : 'Ofertă nouă'} subtitle="Calculele finale sunt refăcute pe server la fiecare salvare.">
      {error ? <p className="mb-3 text-red-600">{error}</p> : null}{notice ? <p className="mb-3 text-emerald-700">{notice}</p> : null}
      <div className="grid gap-3 md:grid-cols-2"><Field label="Titlu"><input required value={form.title || ''} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} /></Field><Field label="Client"><select required value={form.account_id || ''} onChange={event => changeAccount(event.target.value)}><option value="">Alege clientul</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></Field><Field label="Contact"><select value={form.contact_id || ''} onChange={event => setForm(current => ({ ...current, contact_id: event.target.value }))}><option value="">Fără contact selectat</option>{selectedContacts.map(contact => <option key={contact.id} value={contact.id}>{contact.display_name}{contact.email ? ` · ${contact.email}` : ''}</option>)}</select></Field><Field label="Monedă"><input maxLength="3" value={form.currency || 'RON'} onChange={event => setForm(current => ({ ...current, currency: event.target.value.toUpperCase() }))} /></Field><Field label="Data emiterii"><input type="date" value={form.issue_date || ''} onChange={event => setForm(current => ({ ...current, issue_date: event.target.value }))} /></Field><Field label="Valabil până la"><input type="date" value={form.valid_until || ''} onChange={event => setForm(current => ({ ...current, valid_until: event.target.value }))} /></Field><Field label="Condiții plată"><input value={form.payment_terms || ''} onChange={event => setForm(current => ({ ...current, payment_terms: event.target.value }))} /></Field><Field label="Condiții livrare"><input value={form.delivery_terms || ''} onChange={event => setForm(current => ({ ...current, delivery_terms: event.target.value }))} /></Field></div>
    </Card>
    <Card title="Poziții ofertă" subtitle="Pozițiile se pot adăuga, edita, șterge și reordona înainte de aprobare."><div className="grid gap-3">{form.lines.map((line, index) => <div className="rounded border p-3" key={`${index}-${line.id || 'new'}`}><div className="mb-2 flex justify-between gap-2"><strong>Poziția {index + 1}</strong><div className="flex gap-2"><Button type="button" variant="secondary" disabled={index === 0} onClick={() => moveLine(index, -1)}>↑</Button><Button type="button" variant="secondary" disabled={index === form.lines.length - 1} onClick={() => moveLine(index, 1)}>↓</Button><Button type="button" variant="secondary" disabled={form.lines.length === 1} onClick={() => removeLine(index)}>Șterge</Button></div></div><div className="grid gap-2 md:grid-cols-4"><Field label="Tip"><select value={line.item_type || 'custom'} onChange={event => setLine(index, { item_type: event.target.value })}><option value="custom">Liberă</option><option value="material">Material</option><option value="service">Serviciu</option></select></Field><Field label="Referință"><input value={line.item_reference || ''} onChange={event => setLine(index, { item_reference: event.target.value })} /></Field><Field label="Cantitate"><input min="0.0001" step="0.0001" type="number" value={line.quantity} onChange={event => setLine(index, { quantity: event.target.value })} /></Field><Field label="UM"><input value={line.unit || ''} onChange={event => setLine(index, { unit: event.target.value })} /></Field><div className="md:col-span-2"><Field label="Descriere"><input required value={line.description || ''} onChange={event => setLine(index, { description: event.target.value })} /></Field></div><Field label="Preț unitar"><input min="0" step="0.01" type="number" value={line.unit_price} onChange={event => setLine(index, { unit_price: event.target.value })} /></Field><Field label="Discount %"><input min="0" max="100" step="0.01" type="number" value={line.discount_percent || 0} onChange={event => setLine(index, { discount_percent: event.target.value })} /></Field><Field label="TVA %"><input min="0" max="100" step="0.01" type="number" value={line.tax_percent || 0} onChange={event => setLine(index, { tax_percent: event.target.value })} /></Field><div className="self-end rounded bg-slate-50 p-2 text-sm font-semibold">Total local: {money(localTotals([line]).total)} {form.currency}</div><div className="md:col-span-2"><Field label="Notă poziție"><input value={line.notes || ''} onChange={event => setLine(index, { notes: event.target.value })} /></Field></div></div></div>)}</div><Button type="button" className="mt-3" variant="secondary" onClick={() => setForm(current => ({ ...current, lines: [...current.lines, emptyLine()] }))}>+ Adaugă poziție</Button><div className="mt-4 grid gap-2 rounded bg-slate-50 p-3 text-sm md:grid-cols-4"><span>Subtotal: <strong>{money(totals.subtotal)}</strong></span><span>Discount: <strong>{money(totals.discount)}</strong></span><span>TVA: <strong>{money(totals.tax)}</strong></span><span>Total estimat: <strong>{money(totals.total)} {form.currency}</strong></span></div></Card>
    <Card title="Note"><div className="grid gap-3 md:grid-cols-2"><Field label="Notă internă"><textarea rows="4" value={form.notes_internal || ''} onChange={event => setForm(current => ({ ...current, notes_internal: event.target.value }))} /></Field><Field label="Notă pentru client"><textarea rows="4" value={form.notes_client || ''} onChange={event => setForm(current => ({ ...current, notes_client: event.target.value }))} /></Field></div></Card>
    <div className="flex flex-wrap gap-2"><Button disabled={busy}>Salvează draftul</Button>{id ? <Button type="button" variant="secondary" disabled={busy} onClick={() => action('submit-approval')}>Trimite spre aprobare</Button> : null}<Link to="/crm/oferte"><Button type="button" variant="secondary">Renunță</Button></Link></div>
  </form>
}
