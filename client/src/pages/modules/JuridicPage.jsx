import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../../api/client'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'

const tabs = ['Contracte', 'Litigii', 'Calendar', 'Avize juridice']
const pageSize = 10

function today() {
  return new Date().toISOString().slice(0, 10)
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

function daysUntil(date) {
  const value = dateValue(date)
  if (!value) return null
  const end = new Date(value)
  if (Number.isNaN(end.getTime())) return null
  return Math.ceil((end - new Date(today())) / 86400000)
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('ro-RO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' RON'
}

function statusBadge(status) {
  const raw = String(status || '').toLowerCase()
  if (['semnat', 'in_executie', 'în execuție', 'activ', 'finalizat', 'aprobat'].includes(raw)) {
    return { label: status || 'Activ', variant: 'green' }
  }
  if (['draft', 'negociere', 'in_analiza', 'în analiză'].includes(raw)) {
    return { label: status || 'Draft', variant: 'blue' }
  }
  if (['expirat', 'suspendat', 'inchis', 'închis', 'pierdut'].includes(raw)) {
    return { label: status || 'Închis', variant: 'red' }
  }
  return { label: status || '-', variant: 'gray' }
}

function deadlineBadge(date) {
  const days = daysUntil(date)
  if (days === null) return { label: '-', variant: 'gray' }
  if (days < 0) return { label: `${Math.abs(days)} zile întârziere`, variant: 'red' }
  if (days < 3) return { label: `${days} zile`, variant: 'red' }
  if (days <= 30) return { label: `${days} zile`, variant: 'yellow' }
  return { label: `${days} zile`, variant: 'green' }
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

export default function JuridicPage() {
  const [activeTab, setActiveTab] = useState('Contracte')
  const [contracts, setContracts] = useState([])
  const [expiringContracts, setExpiringContracts] = useState([])
  const [litigation, setLitigation] = useState([])
  const [calendar, setCalendar] = useState([])
  const [opinions, setOpinions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState('')
  const [contractFilters, setContractFilters] = useState({ tip: '', status: '' })
  const [contractForm, setContractForm] = useState({
    nr_contract: '',
    tip: '',
    partener: '',
    valoare: '',
    data_semnare: today(),
    data_start: today(),
    data_sfarsit: '',
    status: 'draft',
  })
  const [litigationForm, setLitigationForm] = useState({
    nr_dosar: '',
    instanta: '',
    obiect: '',
    parte_adversa: '',
    status: 'activ',
    termen_urmator: '',
    observatii: '',
  })
  const [opinionForm, setOpinionForm] = useState({
    titlu: '',
    continut: '',
    departament_solicitant: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = {
        tip: contractFilters.tip || undefined,
        status: contractFilters.status || undefined,
      }
      const [contractsRes, expiringRes, litigationRes, calendarRes, opinionsRes] = await Promise.all([
        api.get('/legal/contracts', { params }),
        api.get('/legal/contracts/expiring'),
        api.get('/legal/litigation'),
        api.get('/legal/calendar'),
        api.get('/legal/opinions'),
      ])
      setContracts(arrayFrom(contractsRes.data, ['contracts', 'items', 'data']))
      setExpiringContracts(arrayFrom(expiringRes.data, ['contracts', 'items', 'data']))
      setLitigation(arrayFrom(litigationRes.data, ['litigation', 'items', 'data']))
      setCalendar(arrayFrom(calendarRes.data, ['calendar', 'items', 'data']))
      setOpinions(arrayFrom(opinionsRes.data, ['opinions', 'items', 'data']))
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut încărca datele juridice.')
    } finally {
      setLoading(false)
    }
  }, [contractFilters])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const pagedContracts = useMemo(() => contracts.slice((page - 1) * pageSize, page * pageSize), [contracts, page])
  const pagedLitigation = useMemo(() => litigation.slice((page - 1) * pageSize, page * pageSize), [litigation, page])
  const sortedCalendar = useMemo(() => {
    return [...calendar].sort((a, b) => String(a.data_termen || '').localeCompare(String(b.data_termen || '')))
  }, [calendar])
  const pagedOpinions = useMemo(() => opinions.slice((page - 1) * pageSize, page * pageSize), [opinions, page])

  function selectTab(tab) {
    setActiveTab(tab)
    setPage(1)
    setMessage('')
    setError('')
  }

  async function save(endpoint, payload, reset, successMessage) {
    setError('')
    setMessage('')
    try {
      await api.post(endpoint, payload)
      setMessage(successMessage)
      setModal('')
      reset()
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Înregistrarea nu a putut fi salvată.')
    }
  }

  function updateFilter(key, value) {
    setContractFilters(prev => ({ ...prev, [key]: value }))
    setPage(1)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Juridic</h1>
          <p className="text-sm text-slate-500">Contracte, litigii, termene judiciare și avize juridice.</p>
        </div>
        <Button onClick={() => setModal(activeTab === 'Litigii' ? 'litigation' : activeTab === 'Avize juridice' ? 'opinion' : 'contract')}>
          {activeTab === 'Litigii' ? 'Litigiu nou' : activeTab === 'Avize juridice' ? 'Aviz nou' : 'Contract nou'}
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

      {activeTab === 'Contracte' && (
        <div className="space-y-4">
          <Card title="Contracte ce expiră în 30 zile" subtitle="Scadențe importante pentru urmărire juridică." loading={loading}>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {expiringContracts.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 md:col-span-2 xl:col-span-3">
                  Nu există contracte cu expirare în următoarele 30 de zile.
                </div>
              ) : expiringContracts.map(item => {
                const deadline = deadlineBadge(item.data_sfarsit)
                return (
                  <div key={item.id || item.uuid} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900">{item.nr_contract || 'Contract fără număr'}</div>
                        <div className="mt-1 text-sm text-slate-500">{item.partener || item.parte_contractanta || '-'}</div>
                      </div>
                      <Badge variant={deadline.variant}>{deadline.label}</Badge>
                    </div>
                    <div className="mt-3 text-xs text-slate-500">Expiră la {dateValue(item.data_sfarsit) || '-'}</div>
                  </div>
                )
              })}
            </div>
          </Card>

          <Card title="Contracte" subtitle="Registrul contractelor și starea lor." loading={loading} actions={<Button size="sm" onClick={() => setModal('contract')}>Contract nou</Button>}>
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <Select label="Tip" value={contractFilters.tip} onChange={event => updateFilter('tip', event.target.value)}>
                <option value="">Toate tipurile</option>
                <option value="achizitie">Achiziție</option>
                <option value="prestari">Prestări servicii</option>
                <option value="lucrari">Lucrări</option>
                <option value="inchiriere">Închiriere</option>
              </Select>
              <Select label="Status" value={contractFilters.status} onChange={event => updateFilter('status', event.target.value)}>
                <option value="">Toate statusurile</option>
                <option value="draft">Draft</option>
                <option value="semnat">Semnat</option>
                <option value="in_executie">În execuție</option>
                <option value="expirat">Expirat</option>
                <option value="inchis">Închis</option>
              </Select>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Nr contract</th>
                    <th className="px-3 py-2">Tip</th>
                    <th className="px-3 py-2">Parte contractantă</th>
                    <th className="px-3 py-2 text-right">Valoare</th>
                    <th className="px-3 py-2">Data start</th>
                    <th className="px-3 py-2">Expiră la</th>
                    <th className="px-3 py-2">Zile</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedContracts.length === 0 ? <EmptyRow colSpan={8} loading={loading} /> : pagedContracts.map(item => {
                    const status = statusBadge(item.status)
                    const deadline = deadlineBadge(item.data_sfarsit)
                    return (
                      <tr key={item.id || item.uuid} className="hover:bg-slate-50">
                        <td className="px-3 py-3 font-medium text-slate-800">{item.nr_contract || '-'}</td>
                        <td className="px-3 py-3">{item.tip || '-'}</td>
                        <td className="px-3 py-3">{item.partener || item.parte_contractanta || '-'}</td>
                        <td className="px-3 py-3 text-right">{formatMoney(item.valoare)}</td>
                        <td className="px-3 py-3">{dateValue(item.data_start) || '-'}</td>
                        <td className="px-3 py-3">{dateValue(item.data_sfarsit) || '-'}</td>
                        <td className="px-3 py-3"><Badge variant={deadline.variant}>{deadline.label}</Badge></td>
                        <td className="px-3 py-3"><Badge variant={status.variant}>{status.label}</Badge></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pager page={page} total={contracts.length} onPage={setPage} />
          </Card>
        </div>
      )}

      {activeTab === 'Litigii' && (
        <Card title="Litigii" subtitle="Dosare, instanțe și termene următoare." loading={loading} actions={<Button size="sm" onClick={() => setModal('litigation')}>Litigiu nou</Button>}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Nr dosar</th>
                  <th className="px-3 py-2">Instanță</th>
                  <th className="px-3 py-2">Parte adversă</th>
                  <th className="px-3 py-2">Tip</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Termen următor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedLitigation.length === 0 ? <EmptyRow colSpan={6} loading={loading} /> : pagedLitigation.map(item => {
                  const status = statusBadge(item.status)
                  const deadline = deadlineBadge(item.termen_urmator)
                  return (
                    <tr key={item.id || item.uuid} className="hover:bg-slate-50">
                      <td className="px-3 py-3 font-medium text-slate-800">{item.nr_dosar || '-'}</td>
                      <td className="px-3 py-3">{item.instanta || '-'}</td>
                      <td className="px-3 py-3">{item.parte_adversa || '-'}</td>
                      <td className="px-3 py-3">{item.tip || item.obiect || '-'}</td>
                      <td className="px-3 py-3"><Badge variant={status.variant}>{status.label}</Badge></td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span>{dateValue(item.termen_urmator) || '-'}</span>
                          <Badge variant={deadline.variant}>{deadline.label}</Badge>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={litigation.length} onPage={setPage} />
        </Card>
      )}

      {activeTab === 'Calendar' && (
        <Card title="Calendar" subtitle="Termene judiciare în următoarele 30 de zile." loading={loading}>
          <div className="grid gap-3">
            {sortedCalendar.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Nu există termene judiciare în următoarele 30 de zile.</div>
            ) : sortedCalendar.map(item => {
              const deadline = deadlineBadge(item.data_termen)
              return (
                <div key={item.id || `${item.nr_dosar}-${item.data_termen}`} className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-semibold text-slate-900">{item.nr_dosar || 'Dosar fără număr'}</div>
                    <div className="mt-1 text-sm text-slate-500">{item.instanta || '-'} • {item.parte_adversa || '-'}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-700">{dateValue(item.data_termen) || '-'}</span>
                    <Badge variant={deadline.variant}>{Number(daysUntil(item.data_termen)) < 3 ? 'Urgent' : deadline.label}</Badge>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {activeTab === 'Avize juridice' && (
        <Card title="Avize juridice" subtitle="Solicitări și avize juridice emise." loading={loading} actions={<Button size="sm" onClick={() => setModal('opinion')}>Aviz nou</Button>}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Subiect</th>
                  <th className="px-3 py-2">Departament solicitant</th>
                  <th className="px-3 py-2">Dată</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedOpinions.length === 0 ? <EmptyRow colSpan={3} loading={loading} /> : pagedOpinions.map(item => (
                  <tr key={item.id || item.uuid} className="hover:bg-slate-50">
                    <td className="px-3 py-3 font-medium text-slate-800">{item.titlu || item.subiect || '-'}</td>
                    <td className="px-3 py-3">{item.department_name || item.dept_solicitant || item.departament_solicitant || item.solicitant_id || '-'}</td>
                    <td className="px-3 py-3">{dateValue(item.created_at || item.data) || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={opinions.length} onPage={setPage} />
        </Card>
      )}

      <Modal open={modal === 'contract'} title="Contract nou" onClose={() => setModal('')}>
        <form className="grid gap-4" onSubmit={event => {
          event.preventDefault()
          save('/legal/contracts', contractForm, () => setContractForm({
            nr_contract: '',
            tip: '',
            partener: '',
            valoare: '',
            data_semnare: today(),
            data_start: today(),
            data_sfarsit: '',
            status: 'draft',
          }), 'Contractul a fost salvat.')
        }}>
          <Input label="Nr contract" value={contractForm.nr_contract} onChange={event => setContractForm({ ...contractForm, nr_contract: event.target.value })} />
          <Select label="Tip" value={contractForm.tip} onChange={event => setContractForm({ ...contractForm, tip: event.target.value })}>
            <option value="">Selectează tipul</option>
            <option value="achizitie">Achiziție</option>
            <option value="prestari">Prestări servicii</option>
            <option value="lucrari">Lucrări</option>
            <option value="inchiriere">Închiriere</option>
          </Select>
          <Input label="Parte contractantă" value={contractForm.partener} onChange={event => setContractForm({ ...contractForm, partener: event.target.value })} />
          <Input label="Valoare" type="number" step="0.01" value={contractForm.valoare} onChange={event => setContractForm({ ...contractForm, valoare: event.target.value })} />
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Data start" type="date" value={contractForm.data_start} onChange={event => setContractForm({ ...contractForm, data_start: event.target.value })} />
            <Input label="Expiră la" type="date" value={contractForm.data_sfarsit} onChange={event => setContractForm({ ...contractForm, data_sfarsit: event.target.value })} />
          </div>
          <Select label="Status" value={contractForm.status} onChange={event => setContractForm({ ...contractForm, status: event.target.value })}>
            <option value="draft">Draft</option>
            <option value="semnat">Semnat</option>
            <option value="in_executie">În execuție</option>
            <option value="expirat">Expirat</option>
            <option value="inchis">Închis</option>
          </Select>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal('')}>Renunță</Button>
            <Button type="submit">Salvează</Button>
          </div>
        </form>
      </Modal>

      <Modal open={modal === 'litigation'} title="Litigiu nou" onClose={() => setModal('')}>
        <form className="grid gap-4" onSubmit={event => {
          event.preventDefault()
          save('/legal/litigation', litigationForm, () => setLitigationForm({
            nr_dosar: '',
            instanta: '',
            obiect: '',
            parte_adversa: '',
            status: 'activ',
            termen_urmator: '',
            observatii: '',
          }), 'Litigiul a fost salvat.')
        }}>
          <Input label="Nr dosar" value={litigationForm.nr_dosar} onChange={event => setLitigationForm({ ...litigationForm, nr_dosar: event.target.value })} />
          <Input label="Instanță" value={litigationForm.instanta} onChange={event => setLitigationForm({ ...litigationForm, instanta: event.target.value })} />
          <Input label="Obiect / tip litigiu" value={litigationForm.obiect} onChange={event => setLitigationForm({ ...litigationForm, obiect: event.target.value })} />
          <Input label="Parte adversă" value={litigationForm.parte_adversa} onChange={event => setLitigationForm({ ...litigationForm, parte_adversa: event.target.value })} />
          <div className="grid gap-4 md:grid-cols-2">
            <Select label="Status" value={litigationForm.status} onChange={event => setLitigationForm({ ...litigationForm, status: event.target.value })}>
              <option value="activ">Activ</option>
              <option value="suspendat">Suspendat</option>
              <option value="inchis">Închis</option>
            </Select>
            <Input label="Termen următor" type="date" value={litigationForm.termen_urmator} onChange={event => setLitigationForm({ ...litigationForm, termen_urmator: event.target.value })} />
          </div>
          <Input label="Observații" value={litigationForm.observatii} onChange={event => setLitigationForm({ ...litigationForm, observatii: event.target.value })} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal('')}>Renunță</Button>
            <Button type="submit">Salvează</Button>
          </div>
        </form>
      </Modal>

      <Modal open={modal === 'opinion'} title="Aviz juridic nou" onClose={() => setModal('')}>
        <form className="grid gap-4" onSubmit={event => {
          event.preventDefault()
          save('/legal/opinions', opinionForm, () => setOpinionForm({
            titlu: '',
            continut: '',
            departament_solicitant: '',
          }), 'Avizul juridic a fost salvat.')
        }}>
          <Input label="Subiect" value={opinionForm.titlu} onChange={event => setOpinionForm({ ...opinionForm, titlu: event.target.value })} />
          <Input label="Departament solicitant" value={opinionForm.departament_solicitant} onChange={event => setOpinionForm({ ...opinionForm, departament_solicitant: event.target.value })} />
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Conținut
            <textarea
              className="min-h-28 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              value={opinionForm.continut}
              onChange={event => setOpinionForm({ ...opinionForm, continut: event.target.value })}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal('')}>Renunță</Button>
            <Button type="submit">Salvează</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
