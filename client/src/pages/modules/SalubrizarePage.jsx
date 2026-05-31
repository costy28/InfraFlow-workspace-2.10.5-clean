import { useEffect, useMemo, useState } from 'react'
import api from '../../api/client'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'

const tabs = ['Colectări', 'Rute', 'Zone', 'Rapoarte']
const pageSize = 10

function today() {
  return new Date().toISOString().slice(0, 10)
}

function currentMonth() {
  return today().slice(0, 7)
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

function numberRo(value, decimals = 0) {
  return Number(value || 0).toLocaleString('ro-RO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function statusInfo(status) {
  const raw = String(status || '').toLowerCase()
  if (['finalizat', 'done', 'completed'].includes(raw)) return { label: 'Finalizat', variant: 'green' }
  if (['in_executie', 'in lucru', 'in_lucru'].includes(raw)) return { label: 'În execuție', variant: 'blue' }
  if (['anulat', 'respins', 'canceled'].includes(raw)) return { label: 'Anulat', variant: 'red' }
  return { label: status || 'Planificat', variant: 'yellow' }
}

function routeName(routes, id) {
  const route = routes.find(item => String(item.id) === String(id) || String(item.uuid) === String(id))
  return route?.denumire || route?.name || id || '-'
}

function zoneName(zones, id) {
  const zone = zones.find(item => String(item.id) === String(id) || String(item.uuid) === String(id))
  return zone?.denumire || zone?.name || id || '-'
}

function wasteRecords(collection) {
  return arrayFrom(collection, ['waste_records', 'wasteRecords', 'deseuri', 'records'])
}

function collectionKg(collection) {
  const direct = collection.cantitate_kg || collection.total_kg || collection.quantityKg
  if (direct !== undefined && direct !== null && direct !== '') return Number(direct || 0)
  return wasteRecords(collection).reduce((sum, item) => sum + Number(item.cantitate_kg || item.total_kg || item.quantity || 0), 0)
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
        {loading ? 'Se incarca...' : 'Nu exista date pentru tabul selectat.'}
      </td>
    </tr>
  )
}

export default function SalubrizarePage() {
  const [activeTab, setActiveTab] = useState('Colectări')
  const [collections, setCollections] = useState([])
  const [routes, setRoutes] = useState([])
  const [zones, setZones] = useState([])
  const [routeStops, setRouteStops] = useState([])
  const [selectedCollection, setSelectedCollection] = useState(null)
  const [selectedRoute, setSelectedRoute] = useState(null)
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [reportLoading, setReportLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [page, setPage] = useState(1)
  const [collectionModal, setCollectionModal] = useState(false)
  const [routeModal, setRouteModal] = useState(false)
  const [zoneModal, setZoneModal] = useState(false)
  const [filters, setFilters] = useState({ data: '', route_id: '', status: '' })
  const [reportFilters, setReportFilters] = useState({ luna: currentMonth(), zona_id: '' })
  const [collectionForm, setCollectionForm] = useState({ data: today(), route_id: '', zone_id: '', echipaj: '', ora_start: '', observatii: '' })
  const [routeForm, setRouteForm] = useState({ cod: '', denumire: '', zone_id: '', tip: '', frecventa: '', km_traseu: '' })
  const [zoneForm, setZoneForm] = useState({ cod: '', denumire: '', tip: '', suprafata_mp: '', localitate: '', descriere: '' })

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [collectionsRes, routesRes, zonesRes] = await Promise.all([
        api.get('/sanitation/collections', { params: filters }),
        api.get('/sanitation/routes'),
        api.get('/sanitation/zones'),
      ])
      setCollections(arrayFrom(collectionsRes.data, ['collections', 'items', 'data']))
      setRoutes(arrayFrom(routesRes.data, ['routes', 'items', 'data']))
      setZones(arrayFrom(zonesRes.data, ['zones', 'items', 'data']))
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut incarca datele de salubrizare.')
    } finally {
      setLoading(false)
    }
  }

  async function loadReport() {
    setReportLoading(true)
    setError('')
    try {
      const res = await api.get('/sanitation/reports/monthly', { params: reportFilters })
      setReport(res.data || null)
    } catch (err) {
      setError(err.response?.data?.error || 'Raportul lunar nu a putut fi incarcat.')
    } finally {
      setReportLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  useEffect(() => {
    if (activeTab === 'Rapoarte') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadReport()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, reportFilters])

  const pagedCollections = useMemo(() => collections.slice((page - 1) * pageSize, page * pageSize), [collections, page])
  const pagedRoutes = useMemo(() => routes.slice((page - 1) * pageSize, page * pageSize), [routes, page])
  const pagedZones = useMemo(() => zones.slice((page - 1) * pageSize, page * pageSize), [zones, page])

  function selectTab(tab) {
    setActiveTab(tab)
    setPage(1)
  }

  async function openRoute(route) {
    setSelectedRoute(route)
    setRouteStops([])
    try {
      const res = await api.get(`/sanitation/routes/${route.id || route.uuid}/stops`)
      setRouteStops(arrayFrom(res.data, ['stops', 'items', 'data']))
    } catch {
      setRouteStops([])
    }
  }

  async function saveCollection(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    try {
      await api.post('/sanitation/collections', collectionForm)
      setMessage('Colectarea a fost salvată.')
      setCollectionModal(false)
      setCollectionForm({ data: today(), route_id: '', zone_id: '', echipaj: '', ora_start: '', observatii: '' })
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Colectarea nu a putut fi salvată.')
    }
  }

  async function saveRoute(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    try {
      await api.post('/sanitation/routes', routeForm)
      setMessage('Ruta a fost salvată.')
      setRouteModal(false)
      setRouteForm({ cod: '', denumire: '', zone_id: '', tip: '', frecventa: '', km_traseu: '' })
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Ruta nu a putut fi salvată.')
    }
  }

  async function saveZone(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    try {
      await api.post('/sanitation/zones', zoneForm)
      setMessage('Zona a fost salvată.')
      setZoneModal(false)
      setZoneForm({ cod: '', denumire: '', tip: '', suprafata_mp: '', localitate: '', descriere: '' })
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Zona nu a putut fi salvată.')
    }
  }

  async function generateReport() {
    setError('')
    try {
      const res = await api.post('/sanitation/reports/generate', reportFilters, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const link = document.createElement('a')
      link.href = url
      link.download = `raport_salubrizare_${reportFilters.luna}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.response?.data?.error || 'Raportul ADI nu a putut fi generat.')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Salubrizare</h1>
          <p className="text-sm text-slate-500">Colectări, rute, zone și raportare lunară ADI.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setRouteModal(true)}>Rută nouă</Button>
          <Button onClick={() => setCollectionModal(true)}>Colectare nouă</Button>
        </div>
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

      {activeTab === 'Colectări' && (
        <Card
          title="Colectări"
          subtitle="Colectări planificate și executate."
          loading={loading}
          actions={<Button size="sm" onClick={() => setCollectionModal(true)}>Colectare nouă</Button>}
        >
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <Input label="Dată" type="date" value={filters.data} onChange={event => setFilters({ ...filters, data: event.target.value })} />
            <Select label="Rută" value={filters.route_id} onChange={event => setFilters({ ...filters, route_id: event.target.value })}>
              <option value="">Toate rutele</option>
              {routes.map(route => (
                <option key={route.id || route.uuid} value={route.id || route.uuid}>{route.denumire || route.name || route.cod}</option>
              ))}
            </Select>
            <Select label="Status" value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })}>
              <option value="">Toate</option>
              <option value="planificat">Planificat</option>
              <option value="in_executie">În execuție</option>
              <option value="finalizat">Finalizat</option>
            </Select>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Dată</th>
                  <th className="px-3 py-2">Rută</th>
                  <th className="px-3 py-2">Echipaj</th>
                  <th className="px-3 py-2 text-right">Cantitate kg</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedCollections.length === 0 ? <EmptyRow colSpan={5} loading={loading} /> : pagedCollections.map(collection => {
                  const status = statusInfo(collection.status)
                  return (
                    <tr key={collection.uuid || collection.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelectedCollection(collection)}>
                      <td className="px-3 py-3">{dateValue(collection.data || collection.date)}</td>
                      <td className="px-3 py-3 font-medium text-slate-800">{collection.route_denumire || collection.routeName || routeName(routes, collection.route_id)}</td>
                      <td className="px-3 py-3">{collection.echipaj || collection.crew || collection.sef_santier_nume || '-'}</td>
                      <td className="px-3 py-3 text-right">{numberRo(collectionKg(collection))}</td>
                      <td className="px-3 py-3"><Badge variant={status.variant}>{status.label}</Badge></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={collections.length} onPage={setPage} />
        </Card>
      )}

      {activeTab === 'Rute' && (
        <Card
          title="Rute"
          subtitle="Trasee de colectare și frecvențe."
          loading={loading}
          actions={<Button size="sm" onClick={() => setRouteModal(true)}>Rută nouă</Button>}
        >
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Cod</th>
                  <th className="px-3 py-2">Denumire</th>
                  <th className="px-3 py-2">Zonă</th>
                  <th className="px-3 py-2">Tip</th>
                  <th className="px-3 py-2">Frecvență</th>
                  <th className="px-3 py-2 text-right">Km traseu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedRoutes.length === 0 ? <EmptyRow colSpan={6} loading={loading} /> : pagedRoutes.map(route => (
                  <tr key={route.id || route.uuid} className="cursor-pointer hover:bg-slate-50" onClick={() => openRoute(route)}>
                    <td className="px-3 py-3 font-medium text-slate-800">{route.cod || route.code || '-'}</td>
                    <td className="px-3 py-3">{route.denumire || route.name || '-'}</td>
                    <td className="px-3 py-3">{route.zona_denumire || route.zoneName || zoneName(zones, route.zone_id)}</td>
                    <td className="px-3 py-3">{route.tip || route.type || '-'}</td>
                    <td className="px-3 py-3">{route.frecventa || route.frequency || '-'}</td>
                    <td className="px-3 py-3 text-right">{numberRo(route.km_traseu || route.km || route.distance_km, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={routes.length} onPage={setPage} />
        </Card>
      )}

      {activeTab === 'Zone' && (
        <Card
          title="Zone"
          subtitle="Zone de operare salubrizare."
          loading={loading}
          actions={<Button size="sm" onClick={() => setZoneModal(true)}>Zonă nouă</Button>}
        >
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Denumire</th>
                  <th className="px-3 py-2">Tip</th>
                  <th className="px-3 py-2 text-right">Suprafață m²</th>
                  <th className="px-3 py-2">Localitate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedZones.length === 0 ? <EmptyRow colSpan={4} loading={loading} /> : pagedZones.map(zone => (
                  <tr key={zone.id || zone.uuid} className="hover:bg-slate-50">
                    <td className="px-3 py-3 font-medium text-slate-800">{zone.denumire || zone.name || '-'}</td>
                    <td className="px-3 py-3">{zone.tip || zone.type || '-'}</td>
                    <td className="px-3 py-3 text-right">{numberRo(zone.suprafata_mp || zone.area_sqm || zone.surface)}</td>
                    <td className="px-3 py-3">{zone.localitate || zone.city || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={zones.length} onPage={setPage} />
        </Card>
      )}

      {activeTab === 'Rapoarte' && (
        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <Card title="Filtre raport" subtitle="Raport lunar pentru ADI.">
            <div className="grid gap-4">
              <Input label="Luna" type="month" value={reportFilters.luna} onChange={event => setReportFilters({ ...reportFilters, luna: event.target.value })} />
              <Select label="Zonă" value={reportFilters.zona_id} onChange={event => setReportFilters({ ...reportFilters, zona_id: event.target.value })}>
                <option value="">Toate zonele</option>
                {zones.map(zone => (
                  <option key={zone.id || zone.uuid} value={zone.id || zone.uuid}>{zone.denumire || zone.name}</option>
                ))}
              </Select>
              <Button onClick={generateReport}>Generează raport ADI</Button>
            </div>
          </Card>
          <Card title="Totaluri" subtitle="Colectări, cantități și kilometri." loading={reportLoading}>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="text-sm text-slate-500">Colectări</div>
                <div className="mt-1 text-3xl font-semibold text-slate-900">{numberRo(report?.total_colectari)}</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="text-sm text-slate-500">Kilometri</div>
                <div className="mt-1 text-3xl font-semibold text-slate-900">{numberRo(report?.total_km, 2)}</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="text-sm text-slate-500">Luna</div>
                <div className="mt-1 text-3xl font-semibold text-slate-900">{report?.luna || reportFilters.luna}</div>
              </div>
            </div>
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Tip deșeu</th>
                    <th className="px-3 py-2 text-right">Total kg</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {arrayFrom(report, ['pe_tip_deseu', 'waste']).length === 0 ? <EmptyRow colSpan={2} loading={reportLoading} /> : arrayFrom(report, ['pe_tip_deseu', 'waste']).map(item => (
                    <tr key={item.tip_deseu || item.waste_type}>
                      <td className="px-3 py-3 font-medium text-slate-800">{item.tip_deseu || item.waste_type}</td>
                      <td className="px-3 py-3 text-right">{numberRo(item.total_kg || item.cantitate_kg, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      <Modal open={!!selectedCollection} title="Detalii colectare" size="lg" onClose={() => setSelectedCollection(null)}>
        {selectedCollection ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md bg-slate-50 p-3 text-sm">
                <div className="text-slate-500">Rută</div>
                <div className="mt-1 font-semibold">{selectedCollection.route_denumire || routeName(routes, selectedCollection.route_id)}</div>
              </div>
              <div className="rounded-md bg-slate-50 p-3 text-sm">
                <div className="text-slate-500">Status</div>
                <div className="mt-1 font-semibold">{selectedCollection.status || '-'}</div>
              </div>
              <div className="rounded-md bg-slate-50 p-3 text-sm">
                <div className="text-slate-500">Kg total</div>
                <div className="mt-1 font-semibold">{numberRo(collectionKg(selectedCollection))}</div>
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase text-slate-500">Tipuri deșeuri</h3>
              {wasteRecords(selectedCollection).length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Nu sunt detalii de deșeuri pe această colectare.</div>
              ) : (
                <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
                  {wasteRecords(selectedCollection).map(record => (
                    <div key={record.id || record.tip_deseu || record.waste_type} className="grid gap-2 p-3 text-sm md:grid-cols-3">
                      <div className="font-medium text-slate-800">{record.tip_deseu || record.waste_type}</div>
                      <div>{numberRo(record.cantitate_kg || record.total_kg, 2)} kg</div>
                      <div className="text-slate-500">{record.destinatie || record.destination || '-'}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={!!selectedRoute} title="Puncte rută" size="lg" onClose={() => setSelectedRoute(null)}>
        {selectedRoute ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{selectedRoute.denumire || selectedRoute.name}</h2>
              <p className="text-sm text-slate-500">{selectedRoute.cod || selectedRoute.code || ''}</p>
            </div>
            {routeStops.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Nu există puncte configurate pentru rută.</div>
            ) : (
              <ol className="space-y-2">
                {routeStops.map((stop, index) => (
                  <li key={stop.id || index} className="rounded-md border border-slate-200 p-3 text-sm">
                    <div className="font-medium text-slate-800">{index + 1}. {stop.denumire || stop.name || stop.adresa || stop.address || 'Punct rută'}</div>
                    <div className="text-slate-500">{stop.adresa || stop.address || [stop.gps_lat, stop.gps_lng].filter(Boolean).join(', ') || '-'}</div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal open={collectionModal} title="Colectare nouă" onClose={() => setCollectionModal(false)}>
        <form className="grid gap-4" onSubmit={saveCollection}>
          <Input label="Dată" type="date" value={collectionForm.data} onChange={event => setCollectionForm({ ...collectionForm, data: event.target.value })} />
          <Select label="Rută" value={collectionForm.route_id} onChange={event => {
            const route = routes.find(item => String(item.id || item.uuid) === String(event.target.value))
            setCollectionForm({ ...collectionForm, route_id: event.target.value, zone_id: route?.zone_id || collectionForm.zone_id })
          }}>
            <option value="">Alege ruta</option>
            {routes.map(route => (
              <option key={route.id || route.uuid} value={route.id || route.uuid}>{route.denumire || route.name || route.cod}</option>
            ))}
          </Select>
          <Input label="Echipaj" value={collectionForm.echipaj} onChange={event => setCollectionForm({ ...collectionForm, echipaj: event.target.value })} />
          <Input label="Ora start" type="time" value={collectionForm.ora_start} onChange={event => setCollectionForm({ ...collectionForm, ora_start: event.target.value })} />
          <Input label="Observații" value={collectionForm.observatii} onChange={event => setCollectionForm({ ...collectionForm, observatii: event.target.value })} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCollectionModal(false)}>Renunță</Button>
            <Button type="submit">Salvează colectarea</Button>
          </div>
        </form>
      </Modal>

      <Modal open={routeModal} title="Rută nouă" onClose={() => setRouteModal(false)}>
        <form className="grid gap-4" onSubmit={saveRoute}>
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Cod" value={routeForm.cod} onChange={event => setRouteForm({ ...routeForm, cod: event.target.value })} />
            <Input label="Denumire" value={routeForm.denumire} onChange={event => setRouteForm({ ...routeForm, denumire: event.target.value })} />
            <Select label="Zonă" value={routeForm.zone_id} onChange={event => setRouteForm({ ...routeForm, zone_id: event.target.value })}>
              <option value="">Alege zona</option>
              {zones.map(zone => (
                <option key={zone.id || zone.uuid} value={zone.id || zone.uuid}>{zone.denumire || zone.name}</option>
              ))}
            </Select>
            <Input label="Tip" value={routeForm.tip} onChange={event => setRouteForm({ ...routeForm, tip: event.target.value })} />
            <Input label="Frecvență" value={routeForm.frecventa} onChange={event => setRouteForm({ ...routeForm, frecventa: event.target.value })} />
            <Input label="Km traseu" type="number" step="0.01" value={routeForm.km_traseu} onChange={event => setRouteForm({ ...routeForm, km_traseu: event.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setRouteModal(false)}>Renunță</Button>
            <Button type="submit">Salvează ruta</Button>
          </div>
        </form>
      </Modal>

      <Modal open={zoneModal} title="Zonă nouă" onClose={() => setZoneModal(false)}>
        <form className="grid gap-4" onSubmit={saveZone}>
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Cod" value={zoneForm.cod} onChange={event => setZoneForm({ ...zoneForm, cod: event.target.value })} />
            <Input label="Denumire" value={zoneForm.denumire} onChange={event => setZoneForm({ ...zoneForm, denumire: event.target.value })} />
            <Input label="Tip" value={zoneForm.tip} onChange={event => setZoneForm({ ...zoneForm, tip: event.target.value })} />
            <Input label="Suprafață m²" type="number" value={zoneForm.suprafata_mp} onChange={event => setZoneForm({ ...zoneForm, suprafata_mp: event.target.value })} />
            <Input label="Localitate" value={zoneForm.localitate} onChange={event => setZoneForm({ ...zoneForm, localitate: event.target.value })} />
            <Input label="Descriere" value={zoneForm.descriere} onChange={event => setZoneForm({ ...zoneForm, descriere: event.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setZoneModal(false)}>Renunță</Button>
            <Button type="submit">Salvează zona</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
