import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import api from '../../api/client'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'

const today = () => new Date().toISOString().slice(0, 10)
const emptyLine = () => ({ item_type: 'custom', item_reference: '', description: '', quantity: 1, unit: 'buc', unit_price: 0, discount_percent: 0, tax_percent: 21, notes: '' })
const newForm = () => ({ title: '', account_id: '', contact_id: '', currency: 'RON', issue_date: today(), valid_until: '', payment_terms: '', delivery_terms: '', notes_internal: '', notes_client: '', lines: [emptyLine()] })
const money = (value) => Number(value || 0).toFixed(2)
const statusLabel = { draft: 'Draft', pending_approval: 'În aprobare', approved: 'Aprobată', sent: 'Trimisă', accepted: 'Acceptată de client', declined: 'Refuzată de client', rejected_internal: 'Respinsă intern', cancelled: 'Anulată' }

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
  const [quotes, setQuotes] = useState([])
  const [accounts, setAccounts] = useState([])
  const [contacts, setContacts] = useState([])
  const [quote, setQuote] = useState(null)
  const [audit, setAudit] = useState([])
  const [form, setForm] = useState(newForm)
  const [filters, setFilters] = useState({ q: '', status: '', expired: false })
  const [email, setEmail] = useState({ to: '', cc: '', bcc: '', subject: '', body: '', include_public_link: false, public_link_expires_in_days: 14 })
  const [publicLinks, setPublicLinks] = useState([])
  const [publicLinkDays, setPublicLinkDays] = useState(14)
  const [newPublicUrl, setNewPublicUrl] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const selectedContacts = useMemo(() => contacts.filter(contact => !form.account_id || String(contact.account_id) === String(form.account_id)), [contacts, form.account_id])
  const totals = useMemo(() => localTotals(form.lines), [form.lines])

  async function load() {
    setError('')
    try {
      const params = { ...(filters.q ? { q: filters.q } : {}), ...(filters.status ? { status: filters.status } : {}), ...(filters.expired ? { expired: 'true' } : {}) }
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
        setEmail({ to: loaded.contact_email || '', cc: '', bcc: '', subject: `Oferta ${loaded.quote_number} / Rev. ${loaded.revision_number}`, body: `<p>Bună ziua,</p><p>Vă transmitem oferta ${loaded.quote_number}.</p>`, include_public_link: false, public_link_expires_in_days: 14 })
        setPublicLinks(workspace.public_links || [])
      } else {
        setQuote(null); setAudit([]); setPublicLinks([]); setNewPublicUrl(''); if (isNew) setForm(newForm())
      }
    } catch (requestError) { setError(requestError.response?.data?.error || 'CRM Oferte indisponibil.') }
  }
  useEffect(() => { load() }, [id, filters.status, filters.expired])

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
      else { setNotice(path === 'send' ? 'Oferta a fost trimisă și înregistrată în Inbox ERP.' : 'Acțiunea a fost înregistrată.'); await load() }
    } catch (requestError) { setError(requestError.response?.data?.error || 'Acțiunea a eșuat.') } finally { setBusy(false) }
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
    <div className="mb-4 grid gap-2 md:grid-cols-4"><input value={filters.q} placeholder="Caută număr, titlu, client" onChange={event => setFilters(current => ({ ...current, q: event.target.value }))} onKeyDown={event => event.key === 'Enter' && load()} /><select value={filters.status} onChange={event => setFilters(current => ({ ...current, status: event.target.value }))}><option value="">Toate statusurile</option>{Object.entries(statusLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={filters.expired} onChange={event => setFilters(current => ({ ...current, expired: event.target.checked }))} />Doar expirate</label><Button variant="secondary" onClick={load}>Aplică filtre</Button></div>
    {error ? <p className="mb-3 text-red-600">{error}</p> : null}
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>Număr</th><th>Rev.</th><th>Client</th><th>Valabilitate</th><th>Status</th><th className="text-right">Total</th></tr></thead><tbody>{quotes.map(item => <tr className="cursor-pointer border-t hover:bg-slate-50" onClick={() => navigate(`/crm/oferte/${item.id}`)} key={item.id}><td>{item.quote_number}</td><td>{item.revision_number}</td><td>{item.account_name}</td><td>{item.valid_until || '—'}</td><td>{statusLabel[item.status] || item.status}</td><td className="text-right">{money(item.total)} {item.currency}</td></tr>)}{!quotes.length ? <tr><td colSpan="6" className="py-6 text-center text-slate-500">Nu există oferte pentru filtrul selectat.</td></tr> : null}</tbody></table></div>
  </Card>

  if (id && quote && quote.status !== 'draft') return <div className="grid gap-4">
    <Card title={`${quote.quote_number} / Rev. ${quote.revision_number}`} subtitle={`${statusLabel[quote.status] || quote.status} · ${quote.account_name}`} actions={<div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={busy} onClick={() => action('generate-document')}>Print / PDF</Button>{quote.status === 'pending_approval' ? <><Button disabled={busy} onClick={() => action('approve')}>Aprobă</Button><Button variant="secondary" disabled={busy} onClick={() => action('reject', { reason: 'Respins intern' })}>Respinge</Button></> : null}{['approved', 'sent', 'accepted', 'declined', 'rejected_internal'].includes(quote.status) ? <Button variant="secondary" disabled={busy} onClick={() => action('revision')}>Creează revizie</Button> : null}</div>}>
      {error ? <p className="mb-3 text-red-600">{error}</p> : null}{notice ? <p className="mb-3 text-emerald-700">{notice}</p> : null}
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>#</th><th>Descriere</th><th>Cant.</th><th>Preț</th><th>Discount</th><th>TVA</th><th className="text-right">Total</th></tr></thead><tbody>{quote.lines.map(line => <tr className="border-t" key={line.id}><td>{line.position}</td><td>{line.description}</td><td>{line.quantity} {line.unit}</td><td>{money(line.unit_price)}</td><td>{money(line.discount_percent)}%</td><td>{money(line.tax_percent)}%</td><td className="text-right">{money(line.line_total)} {quote.currency}</td></tr>)}</tbody></table></div>
      <p className="mt-4 text-right font-bold">Total: {money(quote.total)} {quote.currency}</p>
      {quote.document_path ? <p className="mt-3 text-sm text-slate-600">Documentul este atașat acestei revizii în dosarul controlat al aplicației.</p> : null}
    </Card>
    {['approved', 'sent'].includes(quote.status) ? <Card title="Link public securizat" subtitle="Clientul vede doar această ofertă și revizie. Linkul este o credențială temporară; valoarea lui se arată o singură dată, imediat după generare."><div className="flex flex-wrap items-end gap-3"><Field label="Valabilitate"><select value={publicLinkDays} onChange={event => setPublicLinkDays(event.target.value)}><option value="7">7 zile</option><option value="14">14 zile</option><option value="30">30 zile</option><option value="60">60 zile</option><option value="90">90 zile</option></select></Field><Button disabled={busy} onClick={createPublicLink}>Generează / regenerează link</Button></div>{newPublicUrl ? <div className="mt-4 rounded border border-emerald-200 bg-emerald-50 p-3"><p className="text-sm font-medium text-emerald-900">Link nou, copiat în clipboard:</p><div className="mt-2 flex flex-wrap gap-2"><input readOnly value={newPublicUrl} className="min-w-[280px] flex-1" /><Button type="button" variant="secondary" onClick={() => navigator.clipboard?.writeText(newPublicUrl)}>Copiază</Button></div></div> : null}<div className="mt-4 grid gap-2">{publicLinks.length ? publicLinks.map(link => <div className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm" key={link.id}><span>Link #{link.id} · revizia {link.quote_revision} · <strong>{link.status === 'active' ? 'activ' : link.status === 'used' ? 'decizie înregistrată' : link.status === 'revoked' ? 'revocat' : link.status}</strong> · expiră {link.expires_at ? new Date(link.expires_at).toLocaleString('ro-RO') : '—'}</span>{link.status === 'active' ? <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => revokePublicLink(link.id)}>Revocă</Button> : null}</div>) : <p className="text-sm text-slate-500">Nu există încă link public pentru această revizie.</p>}</div></Card> : null}
    {quote.status === 'approved' ? <Card title="Trimite oferta prin email" subtitle="Oferta print-ready este atașată automat și mesajul rămâne legat de revizia exactă în Inbox ERP."><div className="grid gap-3 md:grid-cols-2"><Field label="Către"><input type="email" value={email.to} onChange={event => setEmail(current => ({ ...current, to: event.target.value }))} /></Field><Field label="CC"><input value={email.cc} onChange={event => setEmail(current => ({ ...current, cc: event.target.value }))} /></Field><Field label="BCC"><input value={email.bcc} onChange={event => setEmail(current => ({ ...current, bcc: event.target.value }))} /></Field><Field label="Subiect"><input value={email.subject} onChange={event => setEmail(current => ({ ...current, subject: event.target.value }))} /></Field></div><Field label="Mesaj"><textarea rows="5" value={email.body} onChange={event => setEmail(current => ({ ...current, body: event.target.value }))} /></Field><label className="mt-3 flex flex-wrap items-center gap-2 text-sm"><input type="checkbox" checked={email.include_public_link} onChange={event => setEmail(current => ({ ...current, include_public_link: event.target.checked }))} />Include linkul securizat pentru acceptare/refuz <select value={email.public_link_expires_in_days} disabled={!email.include_public_link} onChange={event => setEmail(current => ({ ...current, public_link_expires_in_days: Number(event.target.value) }))}><option value="7">7 zile</option><option value="14">14 zile</option><option value="30">30 zile</option></select></label><div className="mt-3"><Button disabled={busy || !email.to} onClick={() => action('send', email)}>Trimite oferta</Button></div></Card> : null}
    <Card title="Activitate și audit" subtitle="Istoricul operațiunilor pentru această ofertă și revizie."><div className="grid gap-2">{audit.length ? audit.map(entry => <div className="rounded border p-3 text-sm" key={entry.id || `${entry.at}-${entry.action}`}><strong>{entry.action}</strong><span className="ml-2 text-slate-500">{entry.at || entry.created_at || ''}</span></div>) : <p className="text-slate-500">Nu există încă evenimente de audit pentru această revizie.</p>}</div></Card>
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
