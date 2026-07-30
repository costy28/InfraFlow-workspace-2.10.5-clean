import { useEffect, useMemo, useState } from 'react'
import api from '../api/client'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'
import PageHeader from '../components/ui/PageHeader'
import Select from '../components/ui/Select'
import Table from '../components/ui/Table'
import { formatDate } from '../utils/format'

const tabs = ['Deschise', 'Completate', 'Închise', 'Toate', 'FAZ Lunar']

function today() {
  return new Date().toISOString().slice(0, 10)
}

function nowTime() {
  return new Date().toTimeString().slice(0, 5)
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7)
}

function arrayFrom(data, keys) {
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key]
  }
  return []
}

function vehicleLabel(asset) {
  return [
    asset.nr_inmatriculare || asset.registration || asset.cod,
    [asset.marca || asset.brand, asset.model].filter(Boolean).join(' ')
  ].filter(Boolean).join(' / ') || asset.name || asset.id
}

function employeeLabel(employee) {
  return [employee.nume, employee.prenume].filter(Boolean).join(' ') || employee.name || employee.fullName || `#${employee.id}`
}

function diffVariant(value) {
  const number = Number(value || 0)
  if (number <= 0) return 'green'
  if (number <= 10) return 'yellow'
  return 'red'
}

export default function FoaieParcursPage() {
  const [activeTab, setActiveTab] = useState('Deschise')
  const [trips, setTrips] = useState([])
  const [assets, setAssets] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [newModal, setNewModal] = useState(false)
  const [closeTrip, setCloseTrip] = useState(null)
  const [foaieActivaModal, setFoaieActivaModal] = useState(null) // { id, uuid, nr_foaie, data, sofer, status, km_plecare, asset_label }
  const [closingUuid, setClosingUuid] = useState(null) // uuid being closed via mecanizare
  const [signShare, setSignShare] = useState(null)
  const [filters, setFilters] = useState({ data: '', asset_id: '', luna: currentMonth() })
  const [confirmAction, setConfirmAction] = useState(null)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [newForm, setNewForm] = useState({
    nr_foaie: '',
    asset_id: '',
    sofer_id: '',
    sofer_text: '',
    data: today(),
    data_plecare: `${today()}T${nowTime()}`,
    km_plecare: '',
    combustibil_sold_initial: ''
  })
  const [closeForm, setCloseForm] = useState({
    km_sosire: '',
    data_sosire: `${today()}T${nowTime()}`,
    combustibil_primit: '',
    combustibil_sold_final: '',
    itinerariu: '',
    scop_deplasare: '',
    observatii: ''
  })

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [tripsRes, assetsRes, employeesRes] = await Promise.allSettled([
        api.get('/fleet/trip-logs'),
        api.get('/fleet-assets?tip=autovehicul'),
        api.get('/hr/employees?activ=1')
      ])
      if (tripsRes.status === 'fulfilled') setTrips(arrayFrom(tripsRes.value.data, ['trip_logs', 'items', 'data']))
      if (assetsRes.status === 'fulfilled') {
        const nextAssets = arrayFrom(assetsRes.value.data, ['assets', 'fleetAssets'])
        setAssets(nextAssets)
        setNewForm(form => ({ ...form, asset_id: form.asset_id || nextAssets[0]?.id || '' }))
      }
      if (employeesRes.status === 'fulfilled') setEmployees(arrayFrom(employeesRes.value.data, ['employees', 'items', 'data']))
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut încărca foile de parcurs.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    Promise.resolve().then(() => load())
  }, [])

  // Compute next nr hint client-side from existing trips
  const currentYear = new Date().getFullYear()
  const nextNrHint = useMemo(() => {
    const prefix = `FP-${currentYear}-`
    const nums = trips
      .filter(t => String(t.nr_foaie || '').startsWith(prefix))
      .map(t => parseInt(String(t.nr_foaie).slice(prefix.length)) || 0)
    const max = nums.length ? Math.max(...nums) : 0
    return String(max + 1).padStart(3, '0')
  }, [trips, currentYear])

  const visibleTrips = useMemo(() => {
    let rows = trips
    if (activeTab === 'Deschise') rows = rows.filter(trip => ['draft', 'deschisa', 'trimisa', 'in_lucru'].includes(trip.status))
    if (activeTab === 'Completate') rows = rows.filter(trip => ['completata', 'semnata_sofer', 'semnata_responsabil'].includes(trip.status))
    if (activeTab === 'Închise') rows = rows.filter(trip => ['inchisa', 'aprobata'].includes(trip.status))
    if (filters.data) rows = rows.filter(trip => trip.data === filters.data)
    if (filters.asset_id) rows = rows.filter(trip => String(trip.asset_id) === String(filters.asset_id))
    if (activeTab === 'FAZ Lunar') rows = rows.filter(trip => trip.status === 'inchisa' && String(trip.data || '').startsWith(filters.luna))
    return rows
  }, [trips, activeTab, filters])

  const openTrips = trips.filter(trip => ['draft', 'deschisa', 'trimisa', 'in_lucru'].includes(trip.status))
  const completedTrips = trips.filter(trip => ['completata', 'semnata_sofer', 'semnata_responsabil'].includes(trip.status))
  const fazTotals = visibleTrips.reduce((totals, trip) => ({
    km: totals.km + Number(trip.km_parcursi || 0),
    normat: totals.normat + Number(trip.consum_normat || 0),
    real: totals.real + Number(trip.consum_efectiv || 0)
  }), { km: 0, normat: 0, real: 0 })

  async function createTrip(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    try {
      const response = await api.post('/fleet/trip-logs', newForm)
      setTrips(rows => [response.data.trip_log, ...rows])
      setNewModal(false)
      setMessage('Foaia de parcurs a fost creată.')
      setNewForm(form => ({
        ...form,
        nr_foaie: '',
        sofer_id: '',
        sofer_text: '',
        data: today(),
        data_plecare: `${today()}T${nowTime()}`,
        km_plecare: '',
        combustibil_sold_initial: ''
      }))
    } catch (err) {
      if (err.response?.status === 409 && err.response?.data?.foaie_activa) {
        // Foaie activă existentă pentru acest vehicul
        setNewModal(false)
        setFoaieActivaModal(err.response.data.foaie_activa)
      } else {
        setError(err.response?.data?.error || 'Foaia nu a putut fi creată.')
      }
    }
  }

  function openCloseModal(trip) {
    setCloseTrip(trip)
    setCloseForm({
      km_sosire: '',
      data_sosire: `${today()}T${nowTime()}`,
      combustibil_primit: '',
      combustibil_sold_final: '',
      itinerariu: trip.itinerariu || '',
      scop_deplasare: trip.scop_deplasare || '',
      observatii: trip.observatii || ''
    })
  }

  async function closeTripSubmit(event) {
    event.preventDefault()
    if (!closeTrip) return
    setError('')
    setMessage('')
    try {
      const response = await api.patch(`/fleet/trip-logs/${closeTrip.uuid}/close`, closeForm)
      setTrips(rows => rows.map(row => row.uuid === closeTrip.uuid ? response.data.trip_log : row))
      setCloseTrip(null)
      setMessage('Foaia a fost închisă și este gata pentru FAZ.')
    } catch (err) {
      setError(err.response?.data?.error || 'Foaia nu a putut fi închisă.')
    }
  }

  async function closeMecanizare(trip) {
    setClosingUuid(trip.uuid)
    setError('')
    setMessage('')
    try {
      const response = await api.patch(`/fleet/trip-logs/${trip.uuid}/close-mecanizare`)
      setTrips(rows => rows.map(row => row.uuid === trip.uuid ? response.data.trip_log : row))
      setMessage(`Foaia ${trip.nr_foaie} a fost închisă.`)
    } catch (err) {
      setError(err.response?.data?.error || 'Foaia nu a putut fi închisă.')
    } finally {
      setClosingUuid(null)
    }
  }

  async function printTrip(trip) {
    try {
      const response = await api.get(`/fleet/trip-logs/${trip.uuid}/pdf`, { responseType: 'text' })
      const win = window.open('', '_blank')
      win.document.write(response.data)
      win.document.close()
    } catch (err) {
      setError(err.response?.data?.error || 'Foaia nu a putut fi deschisă pentru print.')
    }
  }

  async function sendTrip(trip) {
    try {
      await api.post(`/fleet/trip-logs/${trip.uuid}/trimite`, { sofer_id: trip.sofer_id })
      setMessage(`Foaia ${trip.nr_foaie} a fost trimisă șoferului.`)
      await load()
    } catch (err) { setError(err.response?.data?.error || 'Foaia nu a putut fi trimisă.') }
  }

  async function copySignLink(trip) {
    try {
      const response = await api.post(`/fleet/trip-logs/${trip.uuid}/sign-link`)
      setSignShare({ link: response.data.link, phone: '', email: '', nr_foaie: trip.nr_foaie })
    } catch (err) { setError(err.response?.data?.error || 'Linkul nu a putut fi generat.') }
  }

  async function approveTrip(trip) {
    try {
      await api.post(`/fleet/trip-logs/${trip.uuid}/aproba`)
      setMessage(`Foaia ${trip.nr_foaie} a fost aprobată.`)
      await load()
    } catch (err) { setError(err.response?.data?.error || 'Foaia nu a putut fi aprobată.') }
  }

  async function generateFaz() {
    setConfirmAction({
      title: 'Generează FAZ foi parcurs',
      message: `Generezi FAZ pentru ${filters.luna}?`,
      details: 'Foile închise din luna selectată vor fi incluse în FAZ și marcate ca introduse în raportul lunar.',
      confirmLabel: 'Generează FAZ',
      tone: 'warning',
      run: generateFazRequest,
      errorMessage: 'FAZ-ul lunar nu a putut fi generat.',
    })
  }

  async function generateFazRequest() {
    try {
      const response = await api.post('/fleet/trip-logs/faz-generate', { luna: filters.luna })
      setMessage(`FAZ generat: ${response.data.foi} foi, ${response.data.total_km} km.`)
      await load()
      const win = window.open('', '_blank')
      win.document.write(response.data.html)
      win.document.close()
    } catch (err) {
      setError(err.response?.data?.error || 'FAZ-ul lunar nu a putut fi generat.')
    }
  }

  async function runConfirmAction(reason) {
    if (!confirmAction?.run) return
    try {
      setConfirmLoading(true)
      setError('')
      await confirmAction.run(reason)
      setConfirmAction(null)
    } catch (err) {
      setError(err.response?.data?.error || confirmAction.errorMessage || 'Acțiunea nu a putut fi executată.')
    } finally {
      setConfirmLoading(false)
    }
  }

  const closedColumns = [
    { key: 'nr_foaie', label: 'Nr.foaie' },
    { key: 'data', label: 'Data', render: row => formatDate(row.data) },
    { key: 'asset_label', label: 'Vehicul' },
    { key: 'sofer_nume', label: 'Șofer' },
    { key: 'km_parcursi', label: 'Km parcurși' },
    { key: 'consum_normat', label: 'Consum normat' },
    { key: 'consum_efectiv', label: 'Consum efectiv' },
    { key: 'diferenta_consum', label: 'Diferență', render: row => <Badge variant={diffVariant(row.diferenta_consum)}>{Number(row.diferenta_consum || 0).toFixed(2)}</Badge> },
    { key: 'print', label: '', render: row => <Button size="sm" variant="secondary" onClick={() => printTrip(row)}>🖨️ Print</Button> },
  ]

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Foi Parcurs"
        subtitle="Deschidere dimineața, închidere seara și centralizare FAZ lunar."
        actions={[<Button key="new" onClick={() => setNewModal(true)}>+ Foaie nouă</Button>]}
      />

      {message && <div className="rounded-md bg-primary-50 px-3 py-2 text-sm text-primary-700">{message}</div>}
      {error && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      <Card>
        <div className="flex flex-wrap gap-2">
          {tabs.map(tab => (
            <Button key={tab} variant={activeTab === tab ? 'primary' : 'secondary'} onClick={() => setActiveTab(tab)}>
              {tab}
              {tab === 'Completate' && completedTrips.length > 0 && (
                <span className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">
                  {completedTrips.length}
                </span>
              )}
            </Button>
          ))}
        </div>
      </Card>

      {activeTab === 'Deschise' && (
        <div className="grid gap-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900">
            {openTrips.length} șoferi în cursă
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleTrips.map(trip => (
              <Card key={trip.uuid}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-slate-900">{trip.nr_foaie}</div>
                    <div className="mt-1 text-sm text-slate-500">{trip.asset_label}</div>
                  </div>
                  <Badge variant="yellow">ÎN CURSĂ</Badge>
                </div>
                <div className="mt-4 grid gap-1 text-sm text-slate-600">
                  <div>Șofer: <strong>{trip.sofer_nume}</strong></div>
                  <div>Ora plecare: <strong>{String(trip.data_plecare || '').slice(11, 16)}</strong></div>
                  <div>Km plecare: <strong>{trip.km_plecare}</strong></div>
                </div>
                {['draft', 'deschisa'].includes(trip.status) ? <Button className="mt-4 w-full" onClick={() => sendTrip(trip)}>Trimite șoferului</Button> : <Button className="mt-4 w-full" onClick={() => openCloseModal(trip)}>Introduceți km sosire</Button>}
              </Card>
            ))}
            {!visibleTrips.length && !loading && <Card className="text-sm text-slate-500">Nu există foi deschise.</Card>}
          </div>
        </div>
      )}

      {activeTab === 'Completate' && (
        <div className="grid gap-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900">
            🟡 {completedTrips.length} {completedTrips.length === 1 ? 'foaie completată de șofer' : 'foi completate de șoferi'} — necesită închidere mecanizare
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleTrips.map(trip => (
              <Card key={trip.uuid}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-slate-900">{trip.nr_foaie}</div>
                    <div className="mt-1 text-sm text-slate-500">{trip.asset_label}</div>
                  </div>
                  <Badge variant="yellow">🟡 Completată</Badge>
                </div>
                <div className="mt-4 grid gap-1 text-sm text-slate-600">
                  <div>Șofer: <strong>{trip.sofer_nume}</strong></div>
                  <div>Data: <strong>{formatDate(trip.data)}</strong></div>
                  <div>Km plecare: <strong>{trip.km_plecare}</strong></div>
                  {trip.km_sosire && <div>Km sosire: <strong>{trip.km_sosire}</strong></div>}
                  {trip.semnatura_responsabil_path && (
                    <div className="mt-2">
                      <div className="text-xs text-slate-400 mb-1">Semnătură șofer:</div>
                      <img
                        src={`/api/fleet/trip-logs/${trip.uuid}/semnatura`}
                        alt="Semnătură"
                        className="h-16 w-auto rounded border border-slate-200 bg-white"
                        onError={e => { e.target.style.display = 'none' }}
                      />
                    </div>
                  )}
                  {trip.completat_la && (
                    <div className="mt-1 text-xs text-slate-400">
                      Completat: {new Date(trip.completat_la).toLocaleString('ro-RO')}
                    </div>
                  )}
                </div>
                <div className="mt-4 flex gap-2">
                  {trip.status === 'semnata_sofer' ? <Button className="flex-1" onClick={() => copySignLink(trip)}>Copiază link semnare</Button> : null}
                  {trip.status === 'semnata_responsabil' ? <Button className="flex-1" onClick={() => approveTrip(trip)}>Aprobă</Button> : null}
                  {trip.status === 'completata' ? (
                  <Button
                    className="flex-1"
                    variant="primary"
                    disabled={closingUuid === trip.uuid}
                    onClick={() => closeMecanizare(trip)}
                  >
                    {closingUuid === trip.uuid ? '...' : '✅ Închide foaia'}
                  </Button>
                  ) : null}
                  <Button size="sm" variant="secondary" onClick={() => printTrip(trip)}>🖨️</Button>
                </div>
              </Card>
            ))}
            {!visibleTrips.length && !loading && (
              <Card className="text-sm text-slate-500">Nu există foi completate în așteptare.</Card>
            )}
          </div>
        </div>
      )}

      {(activeTab === 'Închise' || activeTab === 'Toate') && (
        <Card title={activeTab === 'Închise' ? 'Foi închise' : 'Toate foile'}>
          <div className="mb-4 flex flex-wrap gap-2">
            <Input className="w-full max-w-xs" label="Dată" type="date" value={filters.data} onChange={event => setFilters({ ...filters, data: event.target.value })} />
            <Select className="w-full max-w-xs" label="Vehicul" value={filters.asset_id} onChange={event => setFilters({ ...filters, asset_id: event.target.value })}>
              <option value="">Toate</option>
              {assets.map(asset => <option key={asset.id} value={asset.id}>{vehicleLabel(asset)}</option>)}
            </Select>
          </div>
          <Table columns={closedColumns} data={visibleTrips} loading={loading} />
        </Card>
      )}

      {activeTab === 'FAZ Lunar' && (
        <Card title="FAZ Lunar">
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <Input className="w-full max-w-xs" label="Lună" type="month" value={filters.luna} onChange={event => setFilters({ ...filters, luna: event.target.value })} />
            <Button onClick={generateFaz}>📊 Generează FAZ</Button>
            <Button variant="secondary" onClick={() => alert('Export Excel va fi conectat la pasul următor.')}>📥 Export Excel</Button>
          </div>
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-4"><div className="text-sm text-slate-500">Km total</div><div className="text-2xl font-semibold">{fazTotals.km}</div></div>
            <div className="rounded-lg bg-slate-50 p-4"><div className="text-sm text-slate-500">Consum normat total</div><div className="text-2xl font-semibold">{fazTotals.normat.toFixed(2)}</div></div>
            <div className="rounded-lg bg-slate-50 p-4"><div className="text-sm text-slate-500">Consum real total</div><div className="text-2xl font-semibold">{fazTotals.real.toFixed(2)}</div></div>
          </div>
          <Table columns={closedColumns} data={visibleTrips} loading={loading} />
        </Card>
      )}

      {/* Modal: Foaie nouă */}
      <Modal open={newModal} title="Foaie nouă" onClose={() => setNewModal(false)} size="lg">
        <form className="grid gap-3" onSubmit={createTrip}>
          <Input
            label="Nr. foaie de parcurs"
            value={newForm.nr_foaie}
            onChange={event => setNewForm({ ...newForm, nr_foaie: event.target.value })}
            placeholder={`FP-${currentYear}-${nextNrHint}`}
            helperText="Introduci nr. de pe formularul tipărit sau lasă gol pentru auto-generare"
          />
          <Select label="Vehicul" value={newForm.asset_id} onChange={event => setNewForm({ ...newForm, asset_id: event.target.value })}>
            {assets.map(asset => <option key={asset.id} value={asset.id}>{vehicleLabel(asset)}</option>)}
          </Select>
          <Select label="Șofer" value={newForm.sofer_id} onChange={event => setNewForm({ ...newForm, sofer_id: event.target.value, sofer_text: '' })}>
            <option value="">Text liber</option>
            {employees.map(employee => <option key={employee.id} value={employee.id}>{employeeLabel(employee)}</option>)}
          </Select>
          {!newForm.sofer_id && <Input label="Șofer text liber" value={newForm.sofer_text} onChange={event => setNewForm({ ...newForm, sofer_text: event.target.value })} />}
          <Input label="Data" type="date" value={newForm.data} onChange={event => setNewForm({ ...newForm, data: event.target.value })} />
          <Input label="Ora plecare" type="datetime-local" value={newForm.data_plecare} onChange={event => setNewForm({ ...newForm, data_plecare: event.target.value })} />
          <Input label="Km la plecare" type="number" value={newForm.km_plecare} onChange={event => setNewForm({ ...newForm, km_plecare: event.target.value })} placeholder="Auto din ultima foaie dacă rămâne gol" />
          <Input label="Combustibil sold" type="number" step="0.01" value={newForm.combustibil_sold_initial} onChange={event => setNewForm({ ...newForm, combustibil_sold_initial: event.target.value })} />
          <Button type="submit">✅ Creează foaia</Button>
        </form>
      </Modal>

      {/* Modal: Închide foaia (km sosire) */}
      <Modal open={!!closeTrip} title="Închide foaia" onClose={() => setCloseTrip(null)} size="lg">
        <form className="grid gap-3" onSubmit={closeTripSubmit}>
          <Input label="Km la sosire" type="number" value={closeForm.km_sosire} onChange={event => setCloseForm({ ...closeForm, km_sosire: event.target.value })} required />
          <Input label="Ora sosirii" type="datetime-local" value={closeForm.data_sosire} onChange={event => setCloseForm({ ...closeForm, data_sosire: event.target.value })} />
          <Input label="Combustibil primit" type="number" step="0.01" value={closeForm.combustibil_primit} onChange={event => setCloseForm({ ...closeForm, combustibil_primit: event.target.value })} />
          <Input label="Combustibil sold final" type="number" step="0.01" value={closeForm.combustibil_sold_final} onChange={event => setCloseForm({ ...closeForm, combustibil_sold_final: event.target.value })} />
          <Input label="Itinerariu" value={closeForm.itinerariu} onChange={event => setCloseForm({ ...closeForm, itinerariu: event.target.value })} />
          <Input label="Scop deplasare" value={closeForm.scop_deplasare} onChange={event => setCloseForm({ ...closeForm, scop_deplasare: event.target.value })} />
          <Input label="Observații" value={closeForm.observatii} onChange={event => setCloseForm({ ...closeForm, observatii: event.target.value })} />
          <Button type="submit">✅ Închide foaia</Button>
        </form>
      </Modal>

      {/* Modal: Foaie activă deja existentă (409) */}
      <Modal
        open={!!foaieActivaModal}
        title="⚠️ Foaie activă existentă"
        onClose={() => setFoaieActivaModal(null)}
        size="md"
      >
        {foaieActivaModal && (
          <div className="grid gap-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Există deja o foaie activă pentru acest vehicul. Nu se poate deschide o foaie nouă până când cea existentă nu este închisă.
            </div>
            <div className="grid gap-2 rounded-lg bg-slate-50 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Vehicul</span>
                <span className="font-medium">{foaieActivaModal.asset_label}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Nr. foaie</span>
                <span className="font-medium">{foaieActivaModal.nr_foaie}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Data</span>
                <span className="font-medium">{formatDate(foaieActivaModal.data)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Șofer</span>
                <span className="font-medium">{foaieActivaModal.sofer}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Km plecare</span>
                <span className="font-medium">{foaieActivaModal.km_plecare}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status</span>
                <Badge variant={foaieActivaModal.status === 'completata' ? 'yellow' : 'blue'}>
                  {foaieActivaModal.status === 'completata' ? '🟡 Completată' : 'Deschisă'}
                </Badge>
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                className="flex-1"
                onClick={() => {
                  setFoaieActivaModal(null)
                  // Navigate to the active trip: switch to Deschise/Completate tab
                  setActiveTab(foaieActivaModal.status === 'completata' ? 'Completate' : 'Deschise')
                }}
              >
                Mergi la foaia activă
              </Button>
              <Button variant="secondary" onClick={() => setFoaieActivaModal(null)}>
                Anulează
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!signShare} title="Trimite link semnare către responsabil" onClose={() => setSignShare(null)} size="md">
        {signShare ? <div className="grid gap-3">
          <Input label="Număr telefon (WhatsApp)" value={signShare.phone} onChange={event => setSignShare({ ...signShare, phone: event.target.value })} />
          <Input label="Email" type="email" value={signShare.email} onChange={event => setSignShare({ ...signShare, email: event.target.value })} />
          <div className="break-all rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{signShare.link}</div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={async () => { await navigator.clipboard.writeText(signShare.link); setMessage('Linkul a fost copiat.') }}>Copiază link</Button>
            <Button variant="secondary" onClick={() => window.open(`https://wa.me/${signShare.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Semnează foaia de parcurs ${signShare.nr_foaie}: ${signShare.link}`)}`, '_blank')}>Deschide WhatsApp</Button>
            <Button variant="secondary" onClick={() => { window.location.href = `mailto:${encodeURIComponent(signShare.email)}?subject=${encodeURIComponent(`Semnare foaie parcurs ${signShare.nr_foaie}`)}&body=${encodeURIComponent(signShare.link)}` }}>Trimite email</Button>
          </div>
        </div> : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.title}
        message={confirmAction?.message}
        details={confirmAction?.details}
        confirmLabel={confirmAction?.confirmLabel}
        cancelLabel="Renunță"
        tone={confirmAction?.tone || 'warning'}
        loading={confirmLoading}
        onCancel={() => setConfirmAction(null)}
        onConfirm={runConfirmAction}
      />
    </div>
  )
}
