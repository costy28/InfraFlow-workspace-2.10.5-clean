import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../../api/client'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'

const tabs = ['Registratură', 'Corespondență', 'Ședințe']
const pageSize = 10
const fallbackDepartments = [
  'Mecanizare',
  'Tehnic',
  'Achiziții',
  'Gestiune',
  'HR',
  'Salubrizare',
  'Siguranța Circ.',
  'Sediu',
  'Asfalt',
  'Betoane',
  'Canalizare',
  'Contabilitate',
  'Juridic',
  'Arhivă',
]

function today() {
  return new Date().toISOString().slice(0, 10)
}

function nowLocal() {
  const value = new Date()
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset())
  return value.toISOString().slice(0, 16)
}

function arrayFrom(data, keys) {
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key]
  }
  return Array.isArray(data) ? data : []
}

function dateValue(value) {
  return String(value || '').slice(0, 10)
}

function dateTimeValue(value) {
  return String(value || '').replace('T', ' ').slice(0, 16)
}

function isOverdue(date) {
  const value = dateValue(date)
  return value ? value < today() : false
}

function statusBadge(status, dueDate) {
  if (isOverdue(dueDate) && status !== 'raspuns_dat') return { label: 'Termen depășit', variant: 'red' }
  const raw = String(status || '').toLowerCase()
  if (['repartizat', 'programat', 'inregistrat'].includes(raw)) return { label: status || 'Înregistrat', variant: 'blue' }
  if (['raspuns_dat', 'finalizat'].includes(raw)) return { label: status || 'Finalizat', variant: 'green' }
  if (['urgent', 'intarziat'].includes(raw)) return { label: status || 'Urgent', variant: 'red' }
  return { label: status || '-', variant: 'gray' }
}

function Pager({ page, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
      <span className="text-slate-500">Pagina {page} din {pages}</span>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</Button>
        <Button variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Următor</Button>
      </div>
    </div>
  )
}

function EmptyRow({ colSpan, loading }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-8 text-center text-sm text-slate-500">
        {loading ? 'Se încarcă...' : 'Nu există date pentru tabul selectat.'}
      </td>
    </tr>
  )
}

export default function SecretariatPage() {
  const [activeTab, setActiveTab] = useState('Registratură')
  const [registry, setRegistry] = useState([])
  const [overdue, setOverdue] = useState([])
  const [appointments, setAppointments] = useState([])
  const [departments, setDepartments] = useState([])
  const [users, setUsers] = useState([])
  const [nextNumber, setNextNumber] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState('')
  const [selectedAppointment, setSelectedAppointment] = useState(null)
  const [filters, setFilters] = useState({ tip: '', status: '', de_la: '', pana_la: '' })
  const [registryForm, setRegistryForm] = useState({
    tip: 'intrare_externa',
    expeditor: '',
    destinatar: '',
    cui_expeditor: '',
    cui_destinatar: '',
    dept_emitent: '',
    dept_expeditor: '',
    subiect: '',
    dept_destinatar: '',
    user_responsabil: '',
    semnat_de: '',
    nr_referinta_intern: '',
    trimite_email: false,
    termen_raspuns: '',
  })
  const [appointmentForm, setAppointmentForm] = useState({
    tip: '',
    titlu: '',
    data_start: nowLocal(),
    data_sfarsit: '',
    participanti: '',
    ordine_zi: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = {
        tip: filters.tip || undefined,
        status: filters.status || undefined,
        de_la: filters.de_la || undefined,
        pana_la: filters.pana_la || undefined,
      }
      const [registryRes, overdueRes, appointmentsRes] = await Promise.all([
        api.get('/secretariat/registry', { params }),
        api.get('/secretariat/overdue'),
        api.get('/secretariat/appointments'),
      ])
      setRegistry(arrayFrom(registryRes.data, ['registry', 'items', 'data']))
      setOverdue(arrayFrom(overdueRes.data, ['overdue', 'items', 'data']))
      setAppointments(arrayFrom(appointmentsRes.data, ['appointments', 'items', 'data']))
      const [departmentsRes, usersRes] = await Promise.allSettled([
        api.get('/departments'),
        api.get('/users'),
      ])
      if (departmentsRes.status === 'fulfilled') {
        setDepartments(arrayFrom(departmentsRes.value.data, ['departments', 'items', 'data']))
      }
      if (usersRes.status === 'fulfilled') {
        setUsers(arrayFrom(usersRes.value.data, ['users', 'items', 'data']).filter(user => user.active !== false))
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut încărca datele de secretariat.')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const pagedRegistry = useMemo(() => registry.slice((page - 1) * pageSize, page * pageSize), [registry, page])
  const pagedOverdue = useMemo(() => overdue.slice((page - 1) * pageSize, page * pageSize), [overdue, page])
  const sortedAppointments = useMemo(() => {
    return [...appointments].sort((a, b) => String(a.data_start || '').localeCompare(String(b.data_start || '')))
  }, [appointments])
  const pagedAppointments = useMemo(() => sortedAppointments.slice((page - 1) * pageSize, page * pageSize), [sortedAppointments, page])
  const departmentOptions = useMemo(() => {
    const fromApi = departments.map(dept => ({
      value: dept.id || dept.cod || dept.denumire || dept.name,
      label: dept.denumire || dept.name || dept.cod || dept.id,
    })).filter(item => item.value && item.label)
    return fromApi.length ? fromApi : fallbackDepartments.map(name => ({ value: name, label: name }))
  }, [departments])
  const userOptions = useMemo(() => {
    return users.map(user => ({
      value: user.id,
      label: user.name || [user.prenume, user.nume].filter(Boolean).join(' ') || user.username || user.id,
    })).filter(item => item.value && item.label)
  }, [users])

  function selectTab(tab) {
    setActiveTab(tab)
    setPage(1)
    setMessage('')
    setError('')
  }

  function updateFilter(key, value) {
    setFilters(prev => ({ ...prev, [key]: value }))
    setPage(1)
  }

  async function openRegistryModal() {
    setError('')
    setMessage('')
    try {
      const res = await api.post('/secretariat/registry/next-number', { tip: registryForm.tip })
      setNextNumber(res.data)
    } catch {
      setNextNumber(null)
    }
    setModal('registry')
  }

  async function saveRegistry(event) {
    event.preventDefault()
    setError('')
    try {
      await api.post('/secretariat/registry', registryForm)
      setMessage('Înregistrarea a fost salvată.')
      setModal('')
      setNextNumber(null)
      setRegistryForm({
        tip: 'intrare_externa',
        expeditor: '',
        destinatar: '',
        cui_expeditor: '',
        cui_destinatar: '',
        dept_emitent: '',
        dept_expeditor: '',
        subiect: '',
        dept_destinatar: '',
        user_responsabil: '',
        semnat_de: '',
        nr_referinta_intern: '',
        trimite_email: false,
        termen_raspuns: '',
      })
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Înregistrarea nu a putut fi salvată.')
    }
  }

  async function saveAppointment(event) {
    event.preventDefault()
    setError('')
    try {
      const participanti = appointmentForm.participanti
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
      await api.post('/secretariat/appointments', { ...appointmentForm, participanti })
      setMessage('Ședința a fost salvată.')
      setModal('')
      setAppointmentForm({
        tip: '',
        titlu: '',
        data_start: nowLocal(),
        data_sfarsit: '',
        participanti: '',
        ordine_zi: '',
      })
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Ședința nu a putut fi salvată.')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Secretariat</h1>
          <p className="text-sm text-slate-500">Registratură, corespondență repartizată și ședințe.</p>
        </div>
        <Button onClick={activeTab === 'Ședințe' ? () => setModal('appointment') : openRegistryModal}>
          {activeTab === 'Ședințe' ? 'Ședință nouă' : 'Înregistrare nouă'}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map(tab => (
          <Button key={tab} variant={activeTab === tab ? 'primary' : 'secondary'} onClick={() => selectTab(tab)}>
            {tab}
          </Button>
        ))}
      </div>

      {error ? <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {message ? <div className="rounded-md border border-primary-100 bg-primary-50 px-4 py-3 text-sm text-primary-700">{message}</div> : null}

      {activeTab === 'Registratură' && (
        <Card title="Registratură" subtitle="Documente de intrare și ieșire." loading={loading} actions={<Button size="sm" onClick={openRegistryModal}>Înregistrare nouă</Button>}>
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <Select label="Tip" value={filters.tip} onChange={event => updateFilter('tip', event.target.value)}>
              <option value="">Toate</option>
              <option value="intrare_externa">Intrare externă</option>
              <option value="iesire_externa">Ieșire externă</option>
              <option value="intrare_interna">Intrare internă</option>
              <option value="iesire_interna">Ieșire internă</option>
            </Select>
            <Select label="Status" value={filters.status} onChange={event => updateFilter('status', event.target.value)}>
              <option value="">Toate</option>
              <option value="inregistrat">Înregistrat</option>
              <option value="repartizat">Repartizat</option>
              <option value="raspuns_dat">Răspuns dat</option>
            </Select>
            <Input label="De la" type="date" value={filters.de_la} onChange={event => updateFilter('de_la', event.target.value)} />
            <Input label="Până la" type="date" value={filters.pana_la} onChange={event => updateFilter('pana_la', event.target.value)} />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Nr înregistrare</th>
                  <th className="px-3 py-2">Dată</th>
                  <th className="px-3 py-2">Tip</th>
                  <th className="px-3 py-2">Expeditor/Destinatar</th>
                  <th className="px-3 py-2">Subiect</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedRegistry.length === 0 ? <EmptyRow colSpan={6} loading={loading} /> : pagedRegistry.map(item => {
                  const badge = statusBadge(item.status)
                  return (
                    <tr key={item.id || item.uuid} className="hover:bg-slate-50">
                      <td className="px-3 py-3 font-medium text-slate-800">{item.nr_inregistrare || '-'}</td>
                      <td className="px-3 py-3">{dateValue(item.data_inregistrare || item.created_at) || '-'}</td>
                      <td className="px-3 py-3">{item.tip || '-'}</td>
                      <td className="px-3 py-3">{item.expeditor || item.destinatar || '-'}</td>
                      <td className="px-3 py-3">{item.subiect || '-'}</td>
                      <td className="px-3 py-3"><Badge variant={badge.variant}>{badge.label}</Badge></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={registry.length} onPage={setPage} />
        </Card>
      )}

      {activeTab === 'Corespondență' && (
        <Card title="Corespondență" subtitle="Documente repartizate cu termen de răspuns depășit." loading={loading}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Nr înregistrare</th>
                  <th className="px-3 py-2">Subiect</th>
                  <th className="px-3 py-2">Departament</th>
                  <th className="px-3 py-2">Termen răspuns</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedOverdue.length === 0 ? <EmptyRow colSpan={5} loading={loading} /> : pagedOverdue.map(item => {
                  const badge = statusBadge(item.status, item.termen_raspuns)
                  return (
                    <tr key={item.id || `${item.registry_id}-${item.termen_raspuns}`} className="hover:bg-slate-50">
                      <td className="px-3 py-3 font-medium text-slate-800">{item.nr_inregistrare || item.registry_id || '-'}</td>
                      <td className="px-3 py-3">{item.subiect || '-'}</td>
                      <td className="px-3 py-3">{item.dept_nume || item.dept_destinatar_name || item.dept_id || '-'}</td>
                      <td className="px-3 py-3">{dateValue(item.termen_raspuns) || '-'}</td>
                      <td className="px-3 py-3"><Badge variant={badge.variant}>{badge.label}</Badge></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={overdue.length} onPage={setPage} />
        </Card>
      )}

      {activeTab === 'Ședințe' && (
        <Card title="Ședințe" subtitle="Ședințe planificate și minute." loading={loading} actions={<Button size="sm" onClick={() => setModal('appointment')}>Ședință nouă</Button>}>
          <div className="grid gap-3">
            {pagedAppointments.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Nu există ședințe planificate.</div>
            ) : pagedAppointments.map(item => {
              const badge = statusBadge(item.status)
              return (
                <button
                  key={item.id || item.uuid}
                  type="button"
                  className="rounded-lg border border-slate-200 p-4 text-left transition hover:border-primary-200 hover:bg-primary-50/40"
                  onClick={() => setSelectedAppointment(item)}
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="font-semibold text-slate-900">{item.titlu || 'Ședință fără titlu'}</div>
                      <div className="mt-1 text-sm text-slate-500">{dateTimeValue(item.data_start)} • {item.tip || '-'}</div>
                    </div>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                  {item.ordine_zi ? <div className="mt-3 text-sm text-slate-600">{item.ordine_zi}</div> : null}
                </button>
              )
            })}
          </div>
          <Pager page={page} total={appointments.length} onPage={setPage} />
        </Card>
      )}

      <Modal open={modal === 'registry'} title="Înregistrare nouă" onClose={() => setModal('')}>
        <form className="grid gap-4" onSubmit={saveRegistry}>
          <div className="rounded-md border border-primary-100 bg-primary-50 px-4 py-3 text-sm text-primary-700">
            Număr următor: <strong>{nextNumber?.format || 'se va genera la salvare'}</strong>
          </div>
          <Select label="Tip" value={registryForm.tip} onChange={async event => {
            const tip = event.target.value
            setRegistryForm({ ...registryForm, tip })
            try {
              const res = await api.post('/secretariat/registry/next-number', { tip })
              setNextNumber(res.data)
            } catch {
              setNextNumber(null)
            }
          }}>
            <option value="intrare_externa">INTRARE externă</option>
            <option value="iesire_externa">IEȘIRE externă</option>
            <option value="intrare_interna">INTRARE internă</option>
            <option value="iesire_interna">IEȘIRE internă</option>
          </Select>
          {registryForm.tip === 'intrare_externa' && (
            <div className="grid gap-4 md:grid-cols-2">
              <Input label="Expeditor (firmă/persoană)" value={registryForm.expeditor} onChange={event => setRegistryForm({ ...registryForm, expeditor: event.target.value })} />
              <Input label="CUI expeditor" value={registryForm.cui_expeditor} onChange={event => setRegistryForm({ ...registryForm, cui_expeditor: event.target.value })} />
            </div>
          )}
          {registryForm.tip === 'iesire_externa' && (
            <div className="grid gap-4 md:grid-cols-2">
              <Input label="Destinatar" value={registryForm.destinatar} onChange={event => setRegistryForm({ ...registryForm, destinatar: event.target.value })} />
              <Input label="CUI destinatar" value={registryForm.cui_destinatar} onChange={event => setRegistryForm({ ...registryForm, cui_destinatar: event.target.value })} />
              <Input label="Departament emitent" value={registryForm.dept_emitent} onChange={event => setRegistryForm({ ...registryForm, dept_emitent: event.target.value })} />
              <Input label="Semnat de" value={registryForm.semnat_de} onChange={event => setRegistryForm({ ...registryForm, semnat_de: event.target.value })} />
              <Input label="Nr. referință intern" value={registryForm.nr_referinta_intern} onChange={event => setRegistryForm({ ...registryForm, nr_referinta_intern: event.target.value })} />
            </div>
          )}
          {(registryForm.tip === 'intrare_interna' || registryForm.tip === 'iesire_interna') && (
            <div className="grid gap-4 md:grid-cols-2">
              <Select label="Departament expeditor" value={registryForm.dept_expeditor} onChange={event => setRegistryForm({ ...registryForm, dept_expeditor: event.target.value })}>
                <option value="">Alege departament</option>
                {departmentOptions.map(dept => <option key={dept.value} value={dept.value}>{dept.label}</option>)}
              </Select>
              <Select label="Departament destinatar" value={registryForm.dept_destinatar} onChange={event => setRegistryForm({ ...registryForm, dept_destinatar: event.target.value })}>
                <option value="">Alege departament</option>
                {departmentOptions.map(dept => <option key={dept.value} value={dept.value}>{dept.label}</option>)}
              </Select>
              {registryForm.tip === 'iesire_interna' ? <Input label="Semnat de" value={registryForm.semnat_de} onChange={event => setRegistryForm({ ...registryForm, semnat_de: event.target.value })} /> : null}
            </div>
          )}
          <Input label="Subiect" value={registryForm.subiect} onChange={event => setRegistryForm({ ...registryForm, subiect: event.target.value })} />
          <div className="grid gap-4 md:grid-cols-3">
            <Select label="Departament" value={registryForm.dept_destinatar} onChange={event => setRegistryForm({ ...registryForm, dept_destinatar: event.target.value })}>
              <option value="">Fără repartizare</option>
              {departmentOptions.map(dept => <option key={dept.value} value={dept.value}>{dept.label}</option>)}
            </Select>
            <Select label="Repartizat către" value={registryForm.user_responsabil} onChange={event => setRegistryForm({ ...registryForm, user_responsabil: event.target.value })}>
              <option value="">Neasignat</option>
              {userOptions.map(user => <option key={user.value} value={user.value}>{user.label}</option>)}
            </Select>
            <Input label="Termen răspuns" type="date" value={registryForm.termen_raspuns} onChange={event => setRegistryForm({ ...registryForm, termen_raspuns: event.target.value })} />
          </div>
          <Input label="Atașament scanat (cale fișier)" value={registryForm.fisier_path || ''} onChange={event => setRegistryForm({ ...registryForm, fisier_path: event.target.value })} />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={registryForm.trimite_email} onChange={event => setRegistryForm({ ...registryForm, trimite_email: event.target.checked })} />
            Trimite notificare email
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal('')}>Renunță</Button>
            <Button type="submit">Salvează</Button>
          </div>
        </form>
      </Modal>

      <Modal open={modal === 'appointment'} title="Ședință nouă" onClose={() => setModal('')}>
        <form className="grid gap-4" onSubmit={saveAppointment}>
          <Input label="Titlu" value={appointmentForm.titlu} onChange={event => setAppointmentForm({ ...appointmentForm, titlu: event.target.value })} />
          <Input label="Tip" value={appointmentForm.tip} onChange={event => setAppointmentForm({ ...appointmentForm, tip: event.target.value })} />
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Începe la" type="datetime-local" value={appointmentForm.data_start} onChange={event => setAppointmentForm({ ...appointmentForm, data_start: event.target.value })} />
            <Input label="Se termină la" type="datetime-local" value={appointmentForm.data_sfarsit} onChange={event => setAppointmentForm({ ...appointmentForm, data_sfarsit: event.target.value })} />
          </div>
          <Input label="Participanți (separați prin virgulă)" value={appointmentForm.participanti} onChange={event => setAppointmentForm({ ...appointmentForm, participanti: event.target.value })} />
          <Input label="Ordinea de zi" value={appointmentForm.ordine_zi} onChange={event => setAppointmentForm({ ...appointmentForm, ordine_zi: event.target.value })} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal('')}>Renunță</Button>
            <Button type="submit">Salvează</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!selectedAppointment} title="Detalii ședință" onClose={() => setSelectedAppointment(null)}>
        {selectedAppointment ? (
          <div className="space-y-4 text-sm">
            <div>
              <div className="text-xs font-semibold uppercase text-slate-400">Titlu</div>
              <div className="mt-1 font-semibold text-slate-900">{selectedAppointment.titlu || '-'}</div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-xs font-semibold uppercase text-slate-400">Începe</div>
                <div className="mt-1 text-slate-700">{dateTimeValue(selectedAppointment.data_start) || '-'}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase text-slate-400">Se termină</div>
                <div className="mt-1 text-slate-700">{dateTimeValue(selectedAppointment.data_sfarsit) || '-'}</div>
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase text-slate-400">Ordinea de zi</div>
              <div className="mt-1 whitespace-pre-wrap text-slate-700">{selectedAppointment.ordine_zi || '-'}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase text-slate-400">Minuta</div>
              <div className="mt-1 whitespace-pre-wrap text-slate-700">{selectedAppointment.minuta || 'Minuta nu este completată.'}</div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
