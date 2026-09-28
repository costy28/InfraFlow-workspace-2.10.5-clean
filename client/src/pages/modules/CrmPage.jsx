import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import api from '../../api/client'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Badge from '../../components/ui/Badge'

const sources = ['web', 'email', 'manual', 'phone', 'import', 'api', 'referral']
const statuses = ['new', 'contacted', 'qualified', 'unqualified', 'converted', 'lost']
const activities = ['call', 'email', 'meeting', 'note', 'follow_up_result']
const emptyLead = { source: 'manual', status: 'new', qualification_status: 'pending', title: '', description: '', assigned_to: '', estimated_value: '', notes: '' }

function apiError(error, fallback) { return error?.response?.data?.error || fallback }
function formatDate(value) { return value ? new Intl.DateTimeFormat('ro-RO', { dateStyle: 'medium', timeStyle: value.includes?.('T') ? 'short' : undefined }).format(new Date(value)) : '—' }
function toInputDate(value) { return value ? String(value).slice(0, 10) : '' }
function statusTone(status) { return status === 'lost' ? 'danger' : status === 'converted' || status === 'qualified' ? 'success' : status === 'contacted' ? 'warning' : 'info' }
function label(value) { return String(value || '').replace(/_/g, ' ') || '—' }

function LeadForm({ lead, users, accounts, onSave, onClose, saving }) {
  const [form, setForm] = useState(lead || emptyLead)
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const submit = event => { event.preventDefault(); onSave(form) }
  return <form onSubmit={submit} className="grid gap-3">
    <div className="grid gap-3 md:grid-cols-2">
      <label className="grid gap-1 text-sm font-medium">Titlu<input className="rounded-md border border-slate-300 px-3 py-2" value={form.title || form.subject || ''} onChange={e => set('title', e.target.value)} required /></label>
      <label className="grid gap-1 text-sm font-medium">Sursă<select className="rounded-md border border-slate-300 px-3 py-2" value={form.source || 'manual'} onChange={e => set('source', e.target.value)}>{sources.map(item => <option key={item} value={item}>{label(item)}</option>)}</select></label>
      <label className="grid gap-1 text-sm font-medium">Responsabil<select className="rounded-md border border-slate-300 px-3 py-2" value={form.assigned_to || ''} onChange={e => set('assigned_to', e.target.value)}><option value="">Neatribuit</option>{users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
      <label className="grid gap-1 text-sm font-medium">Valoare estimată<input type="number" min="0" step="0.01" className="rounded-md border border-slate-300 px-3 py-2" value={form.estimated_value ?? ''} onChange={e => set('estimated_value', e.target.value)} /></label>
      <label className="grid gap-1 text-sm font-medium">Prospect / client<select className="rounded-md border border-slate-300 px-3 py-2" value={form.account_id || ''} onChange={e => set('account_id', e.target.value)}><option value="">Fără asociere</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
      <label className="grid gap-1 text-sm font-medium">Status<select className="rounded-md border border-slate-300 px-3 py-2" value={form.status || 'new'} onChange={e => set('status', e.target.value)}>{statuses.map(item => <option key={item} value={item}>{label(item)}</option>)}</select></label>
    </div>
    {form.status === 'lost' ? <label className="grid gap-1 text-sm font-medium">Motiv pierdere<input className="rounded-md border border-slate-300 px-3 py-2" value={form.lost_reason || ''} onChange={e => set('lost_reason', e.target.value)} required /></label> : null}
    <label className="grid gap-1 text-sm font-medium">Mesaj / descriere<textarea className="min-h-24 rounded-md border border-slate-300 px-3 py-2" value={form.description || ''} onChange={e => set('description', e.target.value)} /></label>
    <label className="grid gap-1 text-sm font-medium">Note interne<textarea className="min-h-20 rounded-md border border-slate-300 px-3 py-2" value={form.notes || ''} onChange={e => set('notes', e.target.value)} /></label>
    <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Renunță</Button><Button type="submit" disabled={saving}>{saving ? 'Se salvează…' : 'Salvează'}</Button></div>
  </form>
}

function CrmOverview({ leads, pipeline, onNavigate }) {
  const metrics = useMemo(() => ({
    fresh: leads.filter(item => item.status === 'new').length,
    contact: leads.filter(item => item.status === 'contacted').length,
    unassigned: leads.filter(item => !item.assigned_to).length,
    lost: leads.filter(item => item.status === 'lost').length,
    followUp: leads.filter(item => item.next_follow_up).length,
  }), [leads])
  const cards = [
    ['Lead-uri noi', metrics.fresh, 'new'], ['De contactat', metrics.contact, 'contacted'], ['Follow-up-uri apropiate', metrics.followUp, 'all'], ['Fără responsabil', metrics.unassigned, 'unassigned'], ['Pierdute recent', metrics.lost, 'lost'],
  ]
  const commercialCards = [
    ['Oferte de aprobat', pipeline.pending_approval, 'Aprobă sau respinge înainte de trimiterea către client.'],
    ['Așteaptă client', pipeline.awaiting_customer, 'Oferta este pregătită sau trimisă; poți urmări decizia clientului.'],
    ['Oferte acceptate', pipeline.accepted, 'Creează comanda client numai după acceptare.'],
    ['Comenzi confirmate', pipeline.confirmed_orders, 'Deschide oferta sursă pentru stoc și documentele de facturare.'],
  ]
  return <div className="grid gap-4">
    <Card title="CRM / Sales Automation" subtitle="Solicitări, prospecte, contacte și următorul follow-up — fără să dubleze Task-uri sau Contabilitatea.">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{cards.map(([title, value, filter]) => <button key={title} type="button" onClick={() => onNavigate(filter)} className="rounded-lg border border-slate-200 p-4 text-left hover:border-primary-300 hover:bg-primary-50"><div className="text-sm text-slate-500">{title}</div><div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div></button>)}</div>
    </Card>
    <Card title="Flux comercial" subtitle="De la ofertă la comandă, stoc și facturare. Deschide doar etapa care cere atenție.">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{commercialCards.map(([title, value, description]) => <Link key={title} to="/crm/oferte" className="rounded-lg border border-slate-200 p-4 hover:border-primary-300 hover:bg-primary-50"><div className="text-sm text-slate-500">{title}</div><div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div><p className="mt-2 text-xs leading-relaxed text-slate-500">{description}</p></Link>)}</div>
    </Card>
    <Card title="Următorul pas" subtitle="Creează o solicitare, pregătește oferta pentru prospect și delegă follow-up-ul către persoana potrivită.">
      <div className="flex flex-wrap gap-2"><Link to="/crm/leads"><Button>Deschide lead-uri</Button></Link><Link to="/crm/clients"><Button variant="secondary">Prospecte și contacte</Button></Link><Link to="/crm/oferte"><Button variant="secondary">Oferte comerciale</Button></Link></div>
    </Card>
  </div>
}

function LeadsList({ leads, users, accounts, onRefresh }) {
  const navigate = useNavigate()
  const [filters, setFilters] = useState({ status: '', source: '', assigned_to: '', q: '' })
  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const filtered = leads.filter(item => (!filters.status || item.status === filters.status) && (!filters.source || item.source === filters.source) && (!filters.assigned_to || item.assigned_to === filters.assigned_to) && (!filters.q || `${item.title} ${item.account_name || ''} ${item.contact_name || ''}`.toLowerCase().includes(filters.q.toLowerCase())))
  async function save(form) {
    setSaving(true); setError('')
    try { await api.post('/crm/leads', form); setCreateOpen(false); await onRefresh() } catch (err) { setError(apiError(err, 'Lead-ul nu a putut fi creat.')) } finally { setSaving(false) }
  }
  return <div className="grid gap-4">
    <Card title="Lead-uri / solicitări" subtitle="Păstrează fiecare oportunitate în aceeași listă, de la primul contact până la calificare." actions={<Button onClick={() => setCreateOpen(true)}>+ Lead nou</Button>}>
      <div className="mb-4 grid gap-2 md:grid-cols-4"><input className="rounded-md border border-slate-300 px-3 py-2" placeholder="Caută…" value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} /><select className="rounded-md border border-slate-300 px-3 py-2" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}><option value="">Toate statusurile</option>{statuses.map(item => <option key={item}>{item}</option>)}</select><select className="rounded-md border border-slate-300 px-3 py-2" value={filters.source} onChange={e => setFilters(f => ({ ...f, source: e.target.value }))}><option value="">Toate sursele</option>{sources.map(item => <option key={item}>{item}</option>)}</select><select className="rounded-md border border-slate-300 px-3 py-2" value={filters.assigned_to} onChange={e => setFilters(f => ({ ...f, assigned_to: e.target.value }))}><option value="">Toți responsabilii</option>{users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead className="border-b text-left text-slate-500"><tr><th className="p-2">Dată</th><th className="p-2">Sursă</th><th className="p-2">Titlu</th><th className="p-2">Prospect / contact</th><th className="p-2">Status</th><th className="p-2">Responsabil</th><th className="p-2">Valoare</th><th className="p-2">Ultima activitate</th><th className="p-2">Follow-up</th></tr></thead><tbody>{filtered.map(item => <tr key={item.id} className="cursor-pointer border-b hover:bg-slate-50" onClick={() => navigate(`/crm/leads/${item.id}`)}><td className="p-2">{formatDate(item.created_at)}</td><td className="p-2 capitalize">{item.source}</td><td className="p-2 font-medium">{item.title}</td><td className="p-2">{item.account_name || '—'}{item.contact_name ? ` · ${item.contact_name}` : ''}</td><td className="p-2"><Badge tone={statusTone(item.status)}>{label(item.status)}</Badge></td><td className="p-2">{users.find(user => String(user.id) === String(item.assigned_to))?.name || 'Neatribuit'}</td><td className="p-2">{item.estimated_value == null ? '—' : `${item.estimated_value} ${item.currency || 'RON'}`}</td><td className="p-2">{formatDate(item.last_activity_at)}</td><td className="p-2">{formatDate(item.next_follow_up)}</td></tr>)}{!filtered.length ? <tr><td colSpan="9" className="p-6 text-center text-slate-500">Nu există lead-uri pentru filtrul ales.</td></tr> : null}</tbody></table></div>
    </Card>
    <Modal open={createOpen} title="Lead nou" onClose={() => { setCreateOpen(false); setError('') }} size="lg"><LeadForm users={users} accounts={accounts} onSave={save} onClose={() => setCreateOpen(false)} saving={saving} />{error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}</Modal>
  </div>
}

function LeadDetails({ users, accounts, onRefresh }) {
  const routeParams = useParams()
  // CRM este montat prin ruta-părinte `/crm/*`; React Router expune atunci
  // traseul rămas în `*`, nu într-un parametru numit `id`.
  // Păstrăm și variantele explicite pentru o eventuală rută copil viitoare.
  const id = routeParams.id || routeParams.leadId || String(routeParams['*'] || '').match(/^leads\/([^/]+)$/)?.[1] || ''
  const navigate = useNavigate()
  const [lead, setLead] = useState(null)
  const [error, setError] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const [followOpen, setFollowOpen] = useState(false)
  const [convertOpen, setConvertOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activity, setActivity] = useState({ activity_type: 'call', subject: '', notes: '', outcome: '' })
  const [followUp, setFollowUp] = useState({ title: '', due_date: '', assigned_to: '' })
  const [conversion, setConversion] = useState({ status: 'qualified', account: { name: '', email: '', phone: '' }, contact: { display_name: '', email: '', phone: '' } })
  async function load() { try { const response = await api.get(`/crm/leads/${id}`); setLead(response.data.lead) } catch (err) { setError(apiError(err, 'Lead-ul nu a putut fi încărcat.')) } }
  useEffect(() => { load() }, [id])
  async function saveLead(form) { setSaving(true); try { await api.patch(`/crm/leads/${id}`, form); setEditOpen(false); await load(); await onRefresh() } catch (err) { setError(apiError(err, 'Lead-ul nu a putut fi actualizat.')) } finally { setSaving(false) } }
  async function markStatus(status) { setSaving(true); try { await api.patch(`/crm/leads/${id}`, { status }); await load(); await onRefresh() } catch (err) { setError(apiError(err, 'Statusul nu a putut fi actualizat.')) } finally { setSaving(false) } }
  async function action(path, body = {}) { setSaving(true); try { await api.post(`/crm/leads/${id}/${path}`, body); setFollowOpen(false); setConvertOpen(false); await load(); await onRefresh() } catch (err) { setError(apiError(err, 'Acțiunea nu a putut fi finalizată.')) } finally { setSaving(false) } }
  async function addActivity(event) { event.preventDefault(); setSaving(true); try { await api.post('/crm/activities', { ...activity, lead_id: id, account_id: lead.account_id, contact_id: lead.contact_id }); setActivityOpen(false); setActivity({ activity_type: 'call', subject: '', notes: '', outcome: '' }); await load(); await onRefresh() } catch (err) { setError(apiError(err, 'Activitatea nu a putut fi adăugată.')) } finally { setSaving(false) } }
  if (error && !lead) return <Card title="CRM"><p className="text-red-600">{error}</p><Button className="mt-3" variant="secondary" onClick={() => navigate('/crm/leads')}>Înapoi</Button></Card>
  if (!lead) return <Card title="Fișa lead-ului"><p className="text-slate-500">Se încarcă…</p></Card>
  return <div className="grid gap-4"><Card title={lead.title} subtitle={`Lead #${lead.id} · creat ${formatDate(lead.created_at)}`} actions={<div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => setEditOpen(true)}>Editează</Button><Button size="sm" variant="secondary" disabled={saving} onClick={() => markStatus('contacted')}>Marchează contactat</Button><Button size="sm" variant="secondary" onClick={() => { setConversion({ status: 'qualified', account: { name: lead.account_name || lead.title, email: '', phone: '' }, contact: { display_name: lead.contact_name || '', email: '', phone: '' } }); setConvertOpen(true) }}>Califică / convertește</Button><Button size="sm" variant="danger" disabled={saving} onClick={() => markStatus('lost')}>Marchează pierdut</Button><Button size="sm" onClick={() => setFollowOpen(true)}>Creează follow-up</Button></div>}><div className="grid gap-3 text-sm md:grid-cols-3"><div><span className="text-slate-500">Status</span><div className="mt-1"><Badge tone={statusTone(lead.status)}>{label(lead.status)}</Badge></div></div><div><span className="text-slate-500">Prospect / contact</span><div className="mt-1 font-medium">{lead.account_name || 'Neasociat'}{lead.contact_name ? ` · ${lead.contact_name}` : ''}</div></div><div><span className="text-slate-500">Valoare estimată</span><div className="mt-1 font-medium">{lead.estimated_value ?? '—'} {lead.estimated_value != null ? lead.currency : ''}</div></div><div><span className="text-slate-500">Responsabil</span><div className="mt-1 font-medium">{users.find(user => String(user.id) === String(lead.assigned_to))?.name || 'Neatribuit'}</div></div><div><span className="text-slate-500">Sursă</span><div className="mt-1 capitalize">{lead.source}</div></div><div><span className="text-slate-500">Următor follow-up</span><div className="mt-1">{formatDate(lead.next_follow_up)}</div></div></div>{lead.description ? <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{lead.description}</p> : null}{lead.notes ? <p className="mt-3 whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm text-slate-600">{lead.notes}</p> : null}</Card>
    <div className="grid gap-4 lg:grid-cols-2"><Card title="Timeline activități" actions={<Button size="sm" variant="secondary" onClick={() => setActivityOpen(true)}>+ Activitate</Button>}>{lead.activities?.length ? <div className="grid gap-3">{lead.activities.map(item => <div key={item.id} className="border-l-2 border-primary-300 pl-3"><div className="flex justify-between gap-2"><strong className="text-sm">{item.subject}</strong><span className="text-xs text-slate-500">{formatDate(item.occurred_at)}</span></div><div className="mt-1 text-xs uppercase text-primary-700">{label(item.activity_type)}</div>{item.notes ? <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{item.notes}</p> : null}{item.outcome ? <p className="mt-1 text-sm text-slate-700">Rezultat: {item.outcome}</p> : null}</div>)}</div> : <p className="text-sm text-slate-500">Nu există încă activități.</p>}</Card><Card title="Task-uri follow-up">{lead.tasks?.length ? <div className="grid gap-2">{lead.tasks.map(task => <Link key={task.id} to={`/taskuri?source_type=crm_lead&source_id=${lead.id}`} className="rounded-md border border-slate-200 p-3 text-sm hover:bg-slate-50"><strong>{task.title}</strong><div className="mt-1 text-slate-500">{task.status} · termen {task.due_date || 'nesetat'}</div></Link>)}</div> : <p className="text-sm text-slate-500">Nu există follow-up-uri. Creează unul pentru a nu pierde următorul pas.</p>}</Card></div>
    <Modal open={editOpen} title="Editează lead" onClose={() => setEditOpen(false)} size="lg"><LeadForm lead={lead} users={users} accounts={accounts} onSave={saveLead} onClose={() => setEditOpen(false)} saving={saving} /></Modal>
    <Modal open={activityOpen} title="Adaugă activitate" onClose={() => setActivityOpen(false)}><form onSubmit={addActivity} className="grid gap-3"><label className="grid gap-1 text-sm font-medium">Tip<select className="rounded-md border border-slate-300 px-3 py-2" value={activity.activity_type} onChange={e => setActivity(a => ({ ...a, activity_type: e.target.value }))}>{activities.map(item => <option key={item}>{label(item)}</option>)}</select></label><label className="grid gap-1 text-sm font-medium">Subiect<input required className="rounded-md border border-slate-300 px-3 py-2" value={activity.subject} onChange={e => setActivity(a => ({ ...a, subject: e.target.value }))} /></label><label className="grid gap-1 text-sm font-medium">Note<textarea className="min-h-24 rounded-md border border-slate-300 px-3 py-2" value={activity.notes} onChange={e => setActivity(a => ({ ...a, notes: e.target.value }))} /></label><label className="grid gap-1 text-sm font-medium">Rezultat<input className="rounded-md border border-slate-300 px-3 py-2" value={activity.outcome} onChange={e => setActivity(a => ({ ...a, outcome: e.target.value }))} /></label><Button disabled={saving}>Salvează activitatea</Button></form></Modal>
    <Modal open={followOpen} title="Creează follow-up" onClose={() => setFollowOpen(false)}><form onSubmit={e => { e.preventDefault(); action('follow-up', followUp) }} className="grid gap-3"><label className="grid gap-1 text-sm font-medium">Titlu<input required className="rounded-md border border-slate-300 px-3 py-2" value={followUp.title || `Follow-up: ${lead.title}`} onChange={e => setFollowUp(f => ({ ...f, title: e.target.value }))} /></label><label className="grid gap-1 text-sm font-medium">Responsabil<select className="rounded-md border border-slate-300 px-3 py-2" value={followUp.assigned_to || lead.assigned_to || ''} onChange={e => setFollowUp(f => ({ ...f, assigned_to: e.target.value }))}><option value="">Responsabilul lead-ului</option>{users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label><label className="grid gap-1 text-sm font-medium">Termen<input type="date" required className="rounded-md border border-slate-300 px-3 py-2" value={followUp.due_date} onChange={e => setFollowUp(f => ({ ...f, due_date: e.target.value }))} /></label><Button disabled={saving}>Creează în Task-uri</Button></form></Modal>
    <Modal open={convertOpen} title="Califică / convertește" onClose={() => setConvertOpen(false)}><form onSubmit={e => { e.preventDefault(); action('convert', conversion) }} className="grid gap-3"><p className="text-sm text-slate-500">Creează sau leagă prospectul și contactul comercial. Nu creează terț contabil.</p><label className="grid gap-1 text-sm font-medium">Rezultat<select className="rounded-md border border-slate-300 px-3 py-2" value={conversion.status} onChange={e => setConversion(c => ({ ...c, status: e.target.value }))}><option value="qualified">Calificat</option><option value="converted">Convertit</option></select></label><label className="grid gap-1 text-sm font-medium">Denumire prospect<input required className="rounded-md border border-slate-300 px-3 py-2" value={conversion.account.name} onChange={e => setConversion(c => ({ ...c, account: { ...c.account, name: e.target.value } }))} /></label><div className="grid gap-3 md:grid-cols-2"><label className="grid gap-1 text-sm font-medium">Email prospect<input type="email" className="rounded-md border border-slate-300 px-3 py-2" value={conversion.account.email} onChange={e => setConversion(c => ({ ...c, account: { ...c.account, email: e.target.value } }))} /></label><label className="grid gap-1 text-sm font-medium">Telefon prospect<input className="rounded-md border border-slate-300 px-3 py-2" value={conversion.account.phone} onChange={e => setConversion(c => ({ ...c, account: { ...c.account, phone: e.target.value } }))} /></label></div><label className="grid gap-1 text-sm font-medium">Nume contact (opțional)<input className="rounded-md border border-slate-300 px-3 py-2" value={conversion.contact.display_name} onChange={e => setConversion(c => ({ ...c, contact: { ...c.contact, display_name: e.target.value } }))} /></label><div className="grid gap-3 md:grid-cols-2"><label className="grid gap-1 text-sm font-medium">Email contact<input type="email" className="rounded-md border border-slate-300 px-3 py-2" value={conversion.contact.email} onChange={e => setConversion(c => ({ ...c, contact: { ...c.contact, email: e.target.value } }))} /></label><label className="grid gap-1 text-sm font-medium">Telefon contact<input className="rounded-md border border-slate-300 px-3 py-2" value={conversion.contact.phone} onChange={e => setConversion(c => ({ ...c, contact: { ...c.contact, phone: e.target.value } }))} /></label></div><Button disabled={saving}>Finalizează conversia</Button></form></Modal>
    {error ? <p className="text-sm text-red-600">{error}</p> : null}
  </div>
}

function Clients({ accounts, onRefresh }) {
  const [contacts, setContacts] = useState([])
  const [modal, setModal] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', lifecycle_status: 'prospect', email: '', phone: '' })
  useEffect(() => { api.get('/crm/contacts').then(r => setContacts(r.data.contacts || [])).catch(err => setError(apiError(err, 'Contactele nu au putut fi încărcate.'))) }, [])
  async function save(event) { event.preventDefault(); setSaving(true); try { if (modal === 'account') await api.post('/crm/accounts', form); else await api.post('/crm/contacts', form); setModal(''); setForm({ name: '', lifecycle_status: 'prospect', email: '', phone: '' }); await onRefresh(); const r = await api.get('/crm/contacts'); setContacts(r.data.contacts || []) } catch (err) { setError(apiError(err, 'Datele nu au putut fi salvate.')) } finally { setSaving(false) } }
  return <div className="grid gap-4"><Card title="Prospecte și clienți" subtitle="Un prospect CRM poate exista independent. Legătura cu terțul contabil devine opțională ulterior." actions={<div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => { setForm({ account_id: '', display_name: '', email: '', phone: '' }); setModal('contact') }}>+ Contact</Button><Button size="sm" onClick={() => { setForm({ name: '', lifecycle_status: 'prospect', email: '', phone: '' }); setModal('account') }}>+ Prospect</Button></div>}><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-sm"><thead className="border-b text-left text-slate-500"><tr><th className="p-2">Denumire</th><th className="p-2">Tip</th><th className="p-2">CIF</th><th className="p-2">Email</th><th className="p-2">Telefon</th></tr></thead><tbody>{accounts.map(account => <tr key={account.id} className="border-b"><td className="p-2 font-medium">{account.name}</td><td className="p-2"><Badge tone={account.type === 'customer' ? 'success' : 'info'}>{account.type}</Badge></td><td className="p-2">{account.tax_id || '—'}</td><td className="p-2">{account.email || '—'}</td><td className="p-2">{account.phone || '—'}</td></tr>)}</tbody></table></div></Card><Card title="Contacte"><div className="grid gap-2">{contacts.map(contact => <div key={contact.id} className="rounded-md border border-slate-200 p-3 text-sm"><strong>{contact.display_name}</strong><span className="ml-2 text-slate-500">{contact.account_name || 'Fără prospect'}</span><div className="mt-1 text-slate-500">{contact.email || contact.phone || contact.mobile || 'Fără date de contact'}</div></div>)}{!contacts.length ? <p className="text-sm text-slate-500">Nu există contacte.</p> : null}</div></Card><Modal open={Boolean(modal)} title={modal === 'account' ? 'Prospect nou' : 'Contact nou'} onClose={() => setModal('')}><form onSubmit={save} className="grid gap-3">{modal === 'account' ? <><label className="grid gap-1 text-sm font-medium">Denumire<input required className="rounded-md border border-slate-300 px-3 py-2" value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></label><label className="grid gap-1 text-sm font-medium">Tip<select className="rounded-md border border-slate-300 px-3 py-2" value={form.lifecycle_status || 'prospect'} onChange={e => setForm(f => ({ ...f, lifecycle_status: e.target.value }))}><option value="prospect">Prospect</option><option value="customer">Client</option></select></label></> : <><label className="grid gap-1 text-sm font-medium">Nume contact<input required className="rounded-md border border-slate-300 px-3 py-2" value={form.display_name || ''} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} /></label><label className="grid gap-1 text-sm font-medium">Prospect<select className="rounded-md border border-slate-300 px-3 py-2" value={form.account_id || ''} onChange={e => setForm(f => ({ ...f, account_id: e.target.value }))}><option value="">Fără asociere</option>{accounts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></>}<label className="grid gap-1 text-sm font-medium">Email<input type="email" className="rounded-md border border-slate-300 px-3 py-2" value={form.email || ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></label><label className="grid gap-1 text-sm font-medium">Telefon<input className="rounded-md border border-slate-300 px-3 py-2" value={form.phone || ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></label><Button disabled={saving}>Salvează</Button></form></Modal>{error ? <p className="text-sm text-red-600">{error}</p> : null}</div>
}

export default function CrmPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [leads, setLeads] = useState([])
  const [accounts, setAccounts] = useState([])
  const [users, setUsers] = useState([])
  const [pipeline, setPipeline] = useState({ pending_approval: 0, awaiting_customer: 0, accepted: 0, confirmed_orders: 0 })
  const [error, setError] = useState('')
  async function load() { try { const [leadRes, accountRes, usersRes, dashboardRes] = await Promise.all([api.get('/crm/leads'), api.get('/crm/accounts'), api.get('/tasks/assignees'), api.get('/crm/dashboard')]); setLeads(leadRes.data.leads || []); setAccounts(accountRes.data.accounts || []); setUsers(usersRes.data.users || []); setPipeline(dashboardRes.data.pipeline || { pending_approval: 0, awaiting_customer: 0, accepted: 0, confirmed_orders: 0 }); setError('') } catch (err) { setError(apiError(err, 'CRM nu este disponibil. Verifică activarea modulului și migrarea MSSQL.')) } }
  useEffect(() => { load() }, [])
  if (error) return <Card title="CRM / Sales Automation"><p className="text-red-600">{error}</p></Card>
  if (/^\/crm\/leads\/[^/]+$/.test(location.pathname)) return <LeadDetails users={users} accounts={accounts} onRefresh={load} />
  if (location.pathname.startsWith('/crm/leads')) return <LeadsList leads={leads} users={users} accounts={accounts} onRefresh={load} />
  if (location.pathname.startsWith('/crm/clients')) return <Clients accounts={accounts} onRefresh={load} />
  return <CrmOverview leads={leads} pipeline={pipeline} onNavigate={filter => navigate(filter === 'all' ? '/crm/leads' : `/crm/leads?filter=${filter}`)} />
}
