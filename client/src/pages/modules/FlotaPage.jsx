import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import api from '../../api/client'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import { useAuth } from '../../hooks/useAuth'
import { exportExcel } from '../../utils/export'

const TAB_VEHICLES = '🚗 Autovehicule'
const TAB_EQUIPMENT = '🔧 Utilaje'
const TAB_REQUESTS = '📋 Solicitări'
const TAB_REPORT = '📊 Raport zilnic'
const TAB_GPS = '🗺️ GPS Live'
const TAB_ALERTS = '⚠️ Alerte'
const TAB_AUTOMINDER = '📥 Import Autominder'
const tabs = [TAB_VEHICLES, TAB_EQUIPMENT, TAB_REQUESTS, TAB_REPORT, TAB_GPS, TAB_ALERTS, TAB_AUTOMINDER]
const pageSize = 10
const mapDefaultCenter = [46.9259, 26.3709]
const DEFAULT_AUTOMINDER_CONNECTION = 'Server=.\\SQLEXPRESS;Database=autoMinder5;User Id=infraflow;Password=;Encrypt=False;TrustServerCertificate=True'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const gpsIcons = {
  in_miscare: L.divIcon({ html: '<div style="font-size:20px">🟢</div>', className: '', iconSize: [24, 24], iconAnchor: [12, 12] }),
  stationat: L.divIcon({ html: '<div style="font-size:20px">🟡</div>', className: '', iconSize: [24, 24], iconAnchor: [12, 12] }),
  oprit: L.divIcon({ html: '<div style="font-size:20px">🔴</div>', className: '', iconSize: [24, 24], iconAnchor: [12, 12] }),
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function arrayFrom(data, keys) {
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key]
  }
  return []
}

function cleanApiError(error, fallback) {
  const raw = String(error?.response?.data?.error || error?.message || fallback || 'Operațiunea nu a putut fi finalizată.')
  const loginMatch = raw.match(/Login failed for user ['"]?([^'".<]+)['"]?/i)
  if (loginMatch) return `Autentificare SQL eșuată pentru utilizatorul "${loginMatch[1]}". Verifică parola și drepturile pe baza de date.`
  if (/#<\s*CLIXML/i.test(raw)) return 'Eroare SQL Server returnată prin PowerShell. Verifică parola SQL, drepturile pe baza de date și repornește serverul după update.'
  return raw.replace(/\s+/g, ' ').trim()
}

function dateValue(value) {
  return String(value || '').slice(0, 10)
}

function daysUntil(date) {
  const value = dateValue(date)
  if (!value) return null
  const start = new Date(today())
  const end = new Date(value)
  if (Number.isNaN(end.getTime())) return null
  return Math.ceil((end - start) / 86400000)
}

function normalizeAssetKind(asset) {
  const explicit = String(asset.tip_asset || asset.tipAsset || '').toLowerCase()
  if (explicit === 'autovehicul' || explicit === 'utilaj') return explicit
  if (asset.category === 'vehicle') return 'autovehicul'
  if (asset.category === 'equipment') return 'utilaj'
  const registration = String(asset.nr_inmatriculare || asset.registration || '').toUpperCase()
  if (/^(AB|AG|AR|B|BC|BH|BN|BR|BT|BV|BZ|CJ|CL|CS|CT|CV|DB|DJ|GJ|GL|GR|HD|HR|IF|IL|IS|MH|MM|MS|NT|OT|PH|SJ|SM|SV|TM|TR|VL|VN|VS)[ -]?\d/.test(registration)) {
    return 'autovehicul'
  }
  return 'utilaj'
}

function assetCode(asset) {
  return asset.cod || asset.assetCode || asset.inventoryNo || asset.registration || asset.nr_inmatriculare || asset.id || '-'
}

function assetRegistration(asset) {
  return asset.nr_inmatriculare || asset.registration || '-'
}

function assetDepartment(asset) {
  return asset.departament || asset.department || asset.departmentName || asset.locatie || asset.location || '-'
}

function assetType(asset) {
  if (normalizeAssetKind(asset) === 'autovehicul') return asset.type || asset.tip || 'Autovehicul'
  return asset.type || asset.tip || 'Utilaj'
}

function assetLabel(asset) {
  return [assetRegistration(asset), asset.name || asset.assetName, assetType(asset)].filter(Boolean).join(' / ') || asset.name || asset.id || 'Utilaj'
}

function statusInfo(asset, requests) {
  const raw = String(asset.status || asset.stare || '').toLowerCase()
  const inspectionDays = daysUntil(asset.nextInspectionDate || asset.itpExpiresAt || asset.itp_expira_la)
  const activeRequest = requests.some(request =>
    request.assetId === asset.id &&
    dateValue(request.date || request.data) === today() &&
    !['done', 'rejected', 'canceled', 'rezolvat', 'respins', 'anulat'].includes(String(request.status || '').toLowerCase())
  )

  if (raw.includes('defect') || raw.includes('service')) return { label: 'Defect', value: 'defect', variant: 'red' }
  if (inspectionDays !== null && inspectionDays < 0) return { label: 'ITP expirat', value: 'itp_expirat', variant: 'red' }
  if (activeRequest) return { label: 'În lucru', value: 'in_lucru', variant: 'blue' }
  return { label: 'Disponibil', value: 'disponibil', variant: 'green' }
}

function requestStatusInfo(status) {
  const map = {
    new: ['Nouă', 'yellow'],
    approved: ['Aprobată', 'green'],
    planned: ['Planificată', 'blue'],
    done: ['Realizată', 'green'],
    rejected: ['Respinsă', 'red'],
    canceled: ['Anulată', 'gray'],
  }
  const [label, variant] = map[status] || [status || '-', 'gray']
  return { label, variant }
}

function alertInfo(alert) {
  const severity = String(alert.severity || alert.level || '').toLowerCase()
  const remaining = Number(alert.remainingDays ?? alert.daysLeft ?? 999)
  if (severity === 'danger' || severity === 'red' || remaining < 0) return { variant: 'red', label: 'Roșu' }
  return { variant: 'yellow', label: 'Galben' }
}

function hasExpiryWarning(asset) {
  const itp = daysUntil(asset.nextInspectionDate || asset.itpExpiresAt || asset.itp_expira_la)
  const rca = daysUntil(asset.rcaExpiresAt || asset.rca_expira_la)
  return (itp !== null && itp <= 30) || (rca !== null && rca <= 30)
}

function EmptyRow({ colSpan, loading }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-8 text-center text-sm text-slate-500">
        {loading ? 'Se încarcă...' : 'Nu există date pentru filtrele selectate.'}
      </td>
    </tr>
  )
}

function MapFlyTo({ center }) {
  const map = useMap()
  useEffect(() => {
    if (center) map.flyTo(center, 15, { duration: 0.6 })
  }, [center, map])
  return null
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

export default function FlotaPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState(TAB_VEHICLES)
  const [assets, setAssets] = useState([])
  const [requests, setRequests] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [page, setPage] = useState(1)
  const [assetModal, setAssetModal] = useState(false)
  const [requestModal, setRequestModal] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState(null)
  const [viewMode, setViewMode] = useState('list')
  const [assetFilters, setAssetFilters] = useState({ search: '', status: 'toate', department: 'toate', type: 'toate' })
  const [filters, setFilters] = useState({ status: '', date: '', assetId: '' })
  const [assetForm, setAssetForm] = useState({
    registration: '',
    name: '',
    brand: '',
    model: '',
    type: '',
    category: 'vehicle',
    tip_asset: 'autovehicul',
    nextInspectionDate: '',
    nextServiceDate: '',
  })
  const [requestForm, setRequestForm] = useState({
    date: today(),
    assetId: '',
    department: '',
    jobName: '',
    location: '',
    startTime: '08:00',
    endTime: '16:00',
    note: '',
  })
  const [reportForm, setReportForm] = useState({
    date: today(),
    assetId: '',
    hours: '',
    km: '',
    fuelLiters: '',
    jobName: '',
    operatorName: user?.name || '',
  })
  const [autominderFiles, setAutominderFiles] = useState({ parc_auto: null, lista_utilaje: null })
  const [autominderResult, setAutominderResult] = useState(null)
  const [autominderLoading, setAutominderLoading] = useState(false)
  const [autominderConnection, setAutominderConnection] = useState(DEFAULT_AUTOMINDER_CONNECTION)
  const [autominderSaving, setAutominderSaving] = useState(false)
  const [autominderPreview, setAutominderPreview] = useState(null)
  const [autominderFullResult, setAutominderFullResult] = useState(null)
  const [autominderFullLoading, setAutominderFullLoading] = useState(false)
  const [autominderStage, setAutominderStage] = useState('')
  const [autominderProgress, setAutominderProgress] = useState(0)
  const [autominderConfirm, setAutominderConfirm] = useState(false)
  const [gpsData, setGpsData] = useState(null)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [gpsSearch, setGpsSearch] = useState('')
  const [countdown, setCountdown] = useState(30)
  const [mapCenter, setMapCenter] = useState(mapDefaultCenter)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [assetsResponse, requestsResponse, alertsResponse] = await Promise.all([
        api.get('/fleet-assets'),
        api.get('/fleet-requests'),
        api.get('/fleet-alerts'),
      ])
      const nextAssets = arrayFrom(assetsResponse.data, ['assets', 'fleetAssets'])
      setAssets(nextAssets)
      setRequests(arrayFrom(requestsResponse.data, ['requests', 'fleetRequests']))
      setAlerts(arrayFrom(alertsResponse.data, ['alerts']))
      const firstAssetId = nextAssets[0]?.id || ''
      setRequestForm(current => ({ ...current, assetId: current.assetId || firstAssetId }))
      setReportForm(current => ({ ...current, assetId: current.assetId || firstAssetId, operatorName: current.operatorName || user?.name || '' }))
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut încărca datele de flotă.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    Promise.resolve().then(() => load())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setPage(1)
  }, [activeTab, filters, assetFilters])

  async function fetchGPS() {
    setGpsLoading(true)
    try {
      const response = await api.get('/integration/gps/live')
      setGpsData(response.data)
      setCountdown(30)
    } catch (err) {
      setGpsData({ error: err.response?.data?.error || 'GPS Live nu a putut fi încărcat.' })
    } finally {
      setGpsLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab !== TAB_GPS) return undefined
    fetchGPS()
    const refreshInterval = setInterval(fetchGPS, 30000)
    const countdownInterval = setInterval(() => {
      setCountdown(current => current <= 1 ? 30 : current - 1)
    }, 1000)
    return () => {
      clearInterval(refreshInterval)
      clearInterval(countdownInterval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  useEffect(() => {
    if (activeTab !== TAB_AUTOMINDER) return
    api.get('/settings')
      .then(response => {
        const saved = response.data?.settings?.autominderConnectionString
        if (saved) setAutominderConnection(saved)
      })
      .catch(() => {})
  }, [activeTab])

  const vehicleAssets = useMemo(() => assets.filter(asset => normalizeAssetKind(asset) === 'autovehicul'), [assets])
  const equipmentAssets = useMemo(() => assets.filter(asset => normalizeAssetKind(asset) === 'utilaj'), [assets])
  const activeAssets = activeTab === TAB_VEHICLES ? vehicleAssets : equipmentAssets

  const assetTypes = useMemo(() => [...new Set(activeAssets.map(assetType).filter(Boolean))], [activeAssets])
  const assetDepartments = useMemo(() => [...new Set(activeAssets.map(assetDepartment).filter(value => value && value !== '-'))], [activeAssets])

  const filteredAssets = useMemo(() => {
    return activeAssets.filter(asset => {
      const q = assetFilters.search.toLowerCase()
      const matchSearch = q.length < 2 ||
        String(asset.nr_inmatriculare || asset.registration || '').toLowerCase().includes(q) ||
        String(asset.marca || asset.brand || '').toLowerCase().includes(q) ||
        String(asset.model || '').toLowerCase().includes(q) ||
        String(asset.cod || asset.assetCode || asset.inventoryNo || '').toLowerCase().includes(q)
      const currentStatus = statusInfo(asset, requests)
      const matchStatus = !assetFilters.status || assetFilters.status === 'toate' ||
        currentStatus.value === assetFilters.status || currentStatus.label === assetFilters.status
      const matchDept = !assetFilters.department || assetFilters.department === 'toate' ||
        assetDepartment(asset).toLowerCase() === assetFilters.department.toLowerCase()
      const matchType = !assetFilters.type || assetFilters.type === 'toate' ||
        assetType(asset).toLowerCase() === assetFilters.type.toLowerCase()
      return matchSearch && matchStatus && matchDept && matchType
    })
  }, [activeAssets, assetFilters, requests])

  const filteredRequests = useMemo(() => {
    return requests.filter(request => {
      const status = String(request.status || '')
      if (filters.status && status !== filters.status) return false
      if (filters.date && dateValue(request.date || request.data) !== filters.date) return false
      if (filters.assetId && request.assetId !== filters.assetId) return false
      return true
    })
  }, [requests, filters])

  const gpsVehicles = useMemo(() => {
    const q = gpsSearch.trim().toLowerCase()
    return (gpsData?.vehicule || []).filter(vehicle =>
      !q ||
      String(vehicle.nr_inmatriculare || '').toLowerCase().includes(q) ||
      String(vehicle.locatie || '').toLowerCase().includes(q)
    )
  }, [gpsData, gpsSearch])

  const pagedAssets = filteredAssets.slice((page - 1) * pageSize, page * pageSize)
  const pagedRequests = filteredRequests.slice((page - 1) * pageSize, page * pageSize)
  const filtersActive = Object.values(assetFilters).some(value => value && value !== 'toate')
  const totalLabel = activeTab === TAB_VEHICLES ? 'vehicule' : 'utilaje'

  function openAssetModal(kind) {
    const isVehicle = kind === 'autovehicul'
    setAssetForm({
      registration: '',
      name: '',
      brand: '',
      model: '',
      type: '',
      category: isVehicle ? 'vehicle' : 'equipment',
      tip_asset: kind,
      nextInspectionDate: '',
      nextServiceDate: '',
    })
    setAssetModal(true)
  }

  async function submitAsset(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    try {
      await api.post('/fleet-assets', assetForm)
      setAssetModal(false)
      setMessage(assetForm.tip_asset === 'autovehicul' ? 'Autovehiculul a fost adăugat.' : 'Utilajul a fost adăugat.')
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Înregistrarea nu a putut fi salvată.')
    }
  }

  async function submitRequest(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    try {
      await api.post('/fleet-requests', requestForm)
      setRequestModal(false)
      setRequestForm({ date: today(), assetId: assets[0]?.id || '', department: '', jobName: '', location: '', startTime: '08:00', endTime: '16:00', note: '' })
      setMessage('Solicitarea a fost creată.')
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Solicitarea nu a putut fi salvată.')
    }
  }

  async function submitReport(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    const asset = assets.find(item => item.id === reportForm.assetId)
    try {
      await api.post('/technical/work-logs', {
        date: reportForm.date,
        assetId: reportForm.assetId,
        hours: Number(reportForm.hours || 0),
        jobName: reportForm.jobName,
        department: reportForm.jobName,
        costCenterName: reportForm.jobName,
        operatorName: reportForm.operatorName,
        note: [
          reportForm.km ? `Km parcurși: ${reportForm.km}` : '',
          reportForm.fuelLiters ? `Combustibil: ${reportForm.fuelLiters} l` : '',
        ].filter(Boolean).join(' | '),
        document: asset?.registration || asset?.name || '',
      })
      setMessage('Raportul zilnic a fost salvat.')
      setReportForm(current => ({ ...current, hours: '', km: '', fuelLiters: '', jobName: '' }))
    } catch (err) {
      setError(err.response?.data?.error || 'Raportul zilnic nu a putut fi salvat.')
    }
  }

  async function submitAutominderImport(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    setAutominderResult(null)
    if (!autominderFiles.parc_auto && !autominderFiles.lista_utilaje) {
      setError('Selectează cel puțin un fișier XML Autominder.')
      return
    }
    const formData = new FormData()
    if (autominderFiles.parc_auto) formData.append('parc_auto', autominderFiles.parc_auto)
    if (autominderFiles.lista_utilaje) formData.append('lista_utilaje', autominderFiles.lista_utilaje)
    setAutominderLoading(true)
    try {
      const response = await api.post('/integration/autominder/import-xml', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setAutominderResult(response.data)
      setMessage('Import Autominder finalizat.')
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Importul Autominder nu a putut fi finalizat.')
    } finally {
      setAutominderLoading(false)
    }
  }

  async function saveAutominderConnection() {
    setError('')
    setMessage('')
    setAutominderSaving(true)
    try {
      const response = await api.post('/integration/autominder/connection', {
        connection_string: autominderConnection
      })
      const saved = response.data?.settings?.autominderConnectionString
      if (saved && !/\*\*\*/.test(saved)) setAutominderConnection(saved)
      setMessage('Salvat!')
    } catch (err) {
      setError(cleanApiError(err, 'Connection string-ul Autominder nu a putut fi salvat.'))
    } finally {
      setAutominderSaving(false)
    }
  }

  async function testAutominderConnection(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    setAutominderPreview(null)
    setAutominderFullResult(null)
    setAutominderFullLoading(true)
    setAutominderStage('Se testează conexiunea la autoMinder5...')
    setAutominderProgress(30)
    try {
      const response = await api.post('/integration/autominder/test-connection', {
        connection_string: autominderConnection
      })
      setAutominderPreview(response.data.preview)
      setAutominderStage('Conexiune validată. Preview-ul este pregătit.')
      setAutominderProgress(100)
      setMessage('Conexiunea Autominder este funcțională.')
    } catch (err) {
      setAutominderProgress(0)
      setAutominderStage('')
      setError(cleanApiError(err, 'Conexiunea Autominder nu a putut fi testată.'))
    } finally {
      setAutominderFullLoading(false)
    }
  }

  async function applyAutominderFullImport() {
    setAutominderConfirm(false)
    setError('')
    setMessage('')
    setAutominderFullResult(null)
    setAutominderFullLoading(true)
    setAutominderProgress(10)
    setAutominderStage('Se conectează la baza Autominder...')
    try {
      setAutominderProgress(35)
      setAutominderStage('Se importă nomenclatoare, parc auto, utilaje, angajați și documente...')
      const response = await api.post('/integration/autominder/import-full', {
        connection_string: autominderConnection,
        include_history: false
      })
      setAutominderProgress(90)
      setAutominderStage('Se actualizează flota în InfraFlow...')
      setAutominderFullResult(response.data)
      setAutominderProgress(100)
      setAutominderStage('Import complet finalizat.')
      setMessage('Importul sigur Autominder a fost finalizat.')
      await load()
    } catch (err) {
      setAutominderProgress(0)
      setAutominderStage('')
      setError(cleanApiError(err, 'Importul Autominder nu a putut fi finalizat.'))
    } finally {
      setAutominderFullLoading(false)
    }
  }

  function clearAssetFilters() {
    setAssetFilters({ search: '', status: 'toate', department: 'toate', type: 'toate' })
  }

  function renderAssetList() {
    const isVehicle = activeTab === TAB_VEHICLES
    return (
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">{isVehicle ? 'Nr. înmatr.' : 'Cod'}</th>
              <th className="px-3 py-2">Marcă + Model</th>
              <th className="px-3 py-2">{isVehicle ? 'Departament' : 'Tip'}</th>
              <th className="px-3 py-2">{isVehicle ? 'Utilizator curent' : 'Ore motor'}</th>
              <th className="px-3 py-2">{isVehicle ? 'Km curent' : 'Status'}</th>
              {isVehicle && <th className="px-3 py-2">Status</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pagedAssets.length ? pagedAssets.map(asset => {
              const status = statusInfo(asset, requests)
              return (
                <tr key={asset.id} className="cursor-pointer hover:bg-primary-50/50" onClick={() => setSelectedAsset(asset)}>
                  <td className="px-3 py-2 font-medium text-slate-900">{isVehicle ? assetRegistration(asset) : assetCode(asset)}</td>
                  <td className="px-3 py-2">{[asset.marca || asset.brand, asset.model].filter(Boolean).join(' ') || asset.name || '-'}</td>
                  <td className="px-3 py-2">{isVehicle ? assetDepartment(asset) : assetType(asset)}</td>
                  <td className="px-3 py-2">{isVehicle ? (asset.currentUser || asset.utilizator_curent || '-') : `${asset.ore_motor ?? asset.currentMeter ?? asset.initialMeter ?? 0} ore`}</td>
                  <td className="px-3 py-2">{isVehicle ? `${asset.km_curent ?? asset.currentMeter ?? 0} km` : <Badge variant={status.variant}>{status.label}</Badge>}</td>
                  {isVehicle && <td className="px-3 py-2"><Badge variant={status.variant}>{status.label}</Badge></td>}
                </tr>
              )
            }) : <EmptyRow colSpan={isVehicle ? 6 : 5} loading={loading} />}
          </tbody>
        </table>
      </div>
    )
  }

  function renderAssetCards() {
    const isVehicle = activeTab === TAB_VEHICLES
    if (!pagedAssets.length) {
      return (
        <div className="rounded-lg border border-slate-200 p-6 text-center text-sm text-slate-500">
          {loading ? 'Se încarcă...' : 'Nu există date pentru filtrele selectate.'}
        </div>
      )
    }
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {pagedAssets.map(asset => {
          const status = statusInfo(asset, requests)
          return (
            <button
              key={asset.id}
              type="button"
              className="rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-primary-300 hover:bg-primary-50/40"
              onClick={() => setSelectedAsset(asset)}
            >
              <div className="flex items-start justify-between gap-2">
                <Badge variant={status.variant}>{status.label}</Badge>
                {hasExpiryWarning(asset) && <span className="text-sm text-amber-600">⚠️</span>}
              </div>
              <div className="mt-3 text-xl font-semibold text-slate-900">{isVehicle ? assetRegistration(asset) : assetCode(asset)}</div>
              <div className="mt-1 text-sm text-slate-600">{[asset.marca || asset.brand, asset.model, assetType(asset)].filter(Boolean).join(' · ') || '-'}</div>
              <div className="mt-3 grid gap-1 text-sm text-slate-500">
                <div>{isVehicle ? `Km curent: ${asset.km_curent ?? asset.currentMeter ?? 0}` : `Ore motor: ${asset.ore_motor ?? asset.currentMeter ?? asset.initialMeter ?? 0}`}</div>
                <div>Departament: {assetDepartment(asset)}</div>
              </div>
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Flotă utilaje</h2>
          <p className="text-sm text-slate-500">Autovehicule, utilaje, solicitări, rapoarte zilnice și alerte.</p>
        </div>
        {activeTab === TAB_VEHICLES && <Button onClick={() => openAssetModal('autovehicul')}>Autovehicul nou</Button>}
        {activeTab === TAB_EQUIPMENT && <Button onClick={() => openAssetModal('utilaj')}>Utilaj nou</Button>}
        {activeTab === TAB_REQUESTS && <Button onClick={() => setRequestModal(true)}>Solicitare nouă</Button>}
      </div>

      {message ? <div className="rounded-md bg-primary-50 px-3 py-2 text-sm text-primary-700">{message}</div> : null}
      {error ? <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      <Card>
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          {tabs.map(tab => (
            <Button key={tab} variant={activeTab === tab ? 'primary' : 'secondary'} onClick={() => setActiveTab(tab)}>
              {tab}
            </Button>
          ))}
        </div>

        {(activeTab === TAB_VEHICLES || activeTab === TAB_EQUIPMENT) && (
          <div className="mt-4">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Input
                className="w-full max-w-xs sm:w-64"
                label={activeTab === TAB_VEHICLES ? 'Caută nr., marcă, model' : 'Caută cod, marcă, model'}
                value={assetFilters.search}
                onChange={event => setAssetFilters({ ...assetFilters, search: event.target.value })}
                placeholder={activeTab === TAB_VEHICLES ? 'NT08...' : 'INV.1286...'}
              />
              <Select className="w-full max-w-xs sm:w-36" label="Status" value={assetFilters.status} onChange={event => setAssetFilters({ ...assetFilters, status: event.target.value })}>
                <option value="toate">Toate</option>
                <option value="disponibil">Disponibil</option>
                <option value="in_lucru">În lucru</option>
                <option value="defect">Defect</option>
                <option value="itp_expirat">ITP expirat</option>
              </Select>
              <Select className="w-full max-w-xs sm:w-36" label="Dept" value={assetFilters.department} onChange={event => setAssetFilters({ ...assetFilters, department: event.target.value })}>
                <option value="toate">Toate</option>
                {assetDepartments.map(dept => <option key={dept} value={dept}>{dept}</option>)}
              </Select>
              <Select className="w-full max-w-xs sm:w-36" label={activeTab === TAB_VEHICLES ? 'Tip' : 'Tip utilaj'} value={assetFilters.type} onChange={event => setAssetFilters({ ...assetFilters, type: event.target.value })}>
                <option value="toate">Toate</option>
                {assetTypes.map(type => <option key={type} value={type}>{type}</option>)}
              </Select>
              <div className="flex items-end gap-2">
                {filtersActive && <Button variant="ghost" onClick={clearAssetFilters}>✕</Button>}
                <span className="pb-2 text-sm font-medium text-slate-600">{filteredAssets.length} din {activeAssets.length} {totalLabel}</span>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button size="sm" variant={viewMode === 'list' ? 'primary' : 'secondary'} onClick={() => setViewMode('list')}>☰ Listă</Button>
              <Button size="sm" variant={viewMode === 'cards' ? 'primary' : 'secondary'} onClick={() => setViewMode('cards')}>⊞ Carduri</Button>
            </div>
          </div>
        )}

        {activeTab === TAB_REQUESTS && (
          <div className="mt-4 mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Input className="w-full max-w-xs" label="Dată" type="date" value={filters.date} onChange={event => setFilters({ ...filters, date: event.target.value })} />
            <Select className="w-full max-w-xs" label="Utilaj" value={filters.assetId} onChange={event => setFilters({ ...filters, assetId: event.target.value })}>
              <option value="">Toate utilajele</option>
              {assets.map(asset => <option key={asset.id} value={asset.id}>{assetLabel(asset)}</option>)}
            </Select>
            <Select className="w-full max-w-xs" label="Status" value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })}>
              <option value="">Toate statusurile</option>
              <option value="new">Nouă</option>
              <option value="approved">Aprobată</option>
              <option value="planned">Planificată</option>
              <option value="done">Realizată</option>
              <option value="rejected">Respinsă</option>
            </Select>
          </div>
        )}
      </Card>

      {(activeTab === TAB_VEHICLES || activeTab === TAB_EQUIPMENT) && (
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-slate-900">{activeTab === TAB_VEHICLES ? 'Autovehicule' : 'Utilaje'}</h3>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => exportExcel(
                filteredAssets.map(asset => ({
                  [activeTab === TAB_VEHICLES ? 'Nr. înmatriculare' : 'Cod']: activeTab === TAB_VEHICLES ? assetRegistration(asset) : assetCode(asset),
                  'Marcă': asset.brand || asset.marca || '',
                  'Model': asset.model || '',
                  'Tip': assetType(asset),
                  'Departament': assetDepartment(asset),
                  'Status': statusInfo(asset, requests).label,
                  'ITP expiră': asset.nextInspectionDate || asset.itpExpiresAt || asset.itp_expira_la || '',
                  'RCA expiră': asset.rcaExpiresAt || asset.rca_expira_la || '',
                })),
                `${activeTab === TAB_VEHICLES ? 'Autovehicule' : 'Utilaje'}_${new Date().toISOString().slice(0,10)}`
              )}>📊 Excel</Button>
              <Button onClick={() => openAssetModal(activeTab === TAB_VEHICLES ? 'autovehicul' : 'utilaj')}>
                {activeTab === TAB_VEHICLES ? '+ Autovehicul' : '+ Utilaj'}
              </Button>
            </div>
          </div>
          {viewMode === 'list' ? renderAssetList() : renderAssetCards()}
          <Pager page={page} total={filteredAssets.length} onPage={setPage} />
        </Card>
      )}

      {activeTab === TAB_REQUESTS && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Solicitări</h3>
            <Button onClick={() => setRequestModal(true)}>Solicitare nouă</Button>
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Dată</th>
                  <th className="px-3 py-2">Solicitant</th>
                  <th className="px-3 py-2">Utilaj</th>
                  <th className="px-3 py-2">Șantier</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedRequests.length ? pagedRequests.map(request => {
                  const status = requestStatusInfo(request.status)
                  return (
                    <tr key={request.id} className="hover:bg-primary-50/50">
                      <td className="px-3 py-2">{request.date || request.data || '-'}</td>
                      <td className="px-3 py-2">{request.createdByName || request.solicitant || '-'}</td>
                      <td className="px-3 py-2">{request.assetName || request.registration || '-'}</td>
                      <td className="px-3 py-2">{request.jobName || request.location || '-'}</td>
                      <td className="px-3 py-2"><Badge variant={status.variant}>{status.label}</Badge></td>
                    </tr>
                  )
                }) : <EmptyRow colSpan={5} loading={loading} />}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={filteredRequests.length} onPage={setPage} />
        </Card>
      )}

      {activeTab === TAB_REPORT && (
        <Card title="Raport zilnic">
          <form className="grid gap-3 md:grid-cols-2" onSubmit={submitReport}>
            <Input label="Dată" type="date" value={reportForm.date} onChange={event => setReportForm({ ...reportForm, date: event.target.value })} />
            <Select label="Utilaj" value={reportForm.assetId} onChange={event => setReportForm({ ...reportForm, assetId: event.target.value })} options={assets.map(asset => ({ value: asset.id, label: assetLabel(asset) }))} />
            <Input label="Ore efectuate" type="number" min="0" step="0.25" value={reportForm.hours} onChange={event => setReportForm({ ...reportForm, hours: event.target.value })} required />
            <Input label="Km parcurși" type="number" min="0" step="0.1" value={reportForm.km} onChange={event => setReportForm({ ...reportForm, km: event.target.value })} />
            <Input label="Combustibil litri" type="number" min="0" step="0.1" value={reportForm.fuelLiters} onChange={event => setReportForm({ ...reportForm, fuelLiters: event.target.value })} />
            <Input label="Șantier" value={reportForm.jobName} onChange={event => setReportForm({ ...reportForm, jobName: event.target.value })} required />
            <Input label="Operator" value={reportForm.operatorName} onChange={event => setReportForm({ ...reportForm, operatorName: event.target.value })} />
            <div className="md:col-span-2"><Button type="submit">Salvează raport</Button></div>
          </form>
        </Card>
      )}

      {activeTab === TAB_GPS && (
        <Card>
          {gpsData === null ? (
            <div className="flex h-48 items-center justify-center text-sm text-slate-500">
              Se încarcă GPS Live...
            </div>
          ) : gpsData?.configurate === false ? (
            <div className="grid gap-4 rounded-lg border border-slate-200 p-6 text-center">
              <h3 className="text-lg font-semibold text-slate-900">🗺️ GPS Live neconfigurat</h3>
              <p className="text-sm text-slate-500">Configurează utilizatorul și parola urmariregps.ro din Setări → General → GPS.</p>
              <div><Button onClick={() => navigate('/setari')}>Mergi la Setări</Button></div>
            </div>
          ) : gpsData?.login_failed ? (
            <div className="grid gap-4 rounded-lg border border-amber-100 bg-amber-50 p-6 text-center">
              <h3 className="text-lg font-semibold text-amber-900">⚠️ Autentificare GPS eșuată</h3>
              <p className="text-sm text-amber-700">{gpsData.mesaj || 'Verifică credențialele GPS din Setări → General.'}</p>
              <p className="text-xs text-amber-600">Credențialele sunt salvate — eroarea poate fi temporară (server GPS indisponibil).</p>
              <div className="flex justify-center gap-2">
                <Button variant="secondary" onClick={() => navigate('/setari')}>Verifică Setări GPS</Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3">
              {gpsData?.sesiune_expirata && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  ⚠️ Sesiunea GPS a expirat. InfraFlow va încerca re-login automat la următoarea actualizare.
                </div>
              )}
              {gpsData?.error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{gpsData.error}</div>
              )}
              {/* 0 vehicule dar login reușit → hint cu User ID */}
              {!gpsData?.sesiune_expirata && !gpsData?.error && gpsData?.total === 0 && gpsData?.configurate && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                  <div className="font-semibold">ℹ️ Login GPS reușit, dar 0 vehicule găsite</div>
                  <p className="mt-1">Cauze posibile:</p>
                  <ul className="ml-4 mt-1 list-disc text-xs text-blue-700">
                    <li><strong>User ID greșit</strong> — verificați în Setări → General → GPS → câmpul „User ID"</li>
                    <li>Contul GPS nu are vehicule alocate</li>
                    <li>Sesiunea a expirat parțial — reîncărcați pagina</li>
                  </ul>
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => navigate('/setari')} className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700">
                      Setări GPS
                    </button>
                  </div>
                </div>
              )}
              {!gpsData?.sesiune_expirata && !gpsData?.error && (
                <div className={`flex overflow-hidden rounded-lg border border-slate-200 bg-white ${gpsData?.total === 0 ? 'h-64 min-h-0' : 'h-[calc(100vh-180px)] min-h-[520px]'}`}>
                  <aside className="w-72 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50 p-3">
                    <div className="font-semibold text-slate-900">🗺️ GPS Live — {gpsData?.total || 0} vehicule</div>
                    <div className="mt-1 text-xs text-slate-500">
                      Actualizare în {countdown}s 🔄 {gpsLoading ? '· se încarcă' : ''}
                    </div>
                    <Input
                      className="mt-3"
                      label="Caută vehicul"
                      placeholder="NT-08..."
                      value={gpsSearch}
                      onChange={event => setGpsSearch(event.target.value)}
                    />
                    <div className="mt-3 grid gap-2">
                      {gpsVehicles.map(vehicle => {
                        const valid = Number.isFinite(vehicle.lat) && Number.isFinite(vehicle.lng) && vehicle.lat !== 0 && vehicle.lng !== 0
                        const statusClass = vehicle.status === 'in_miscare'
                          ? 'border-emerald-200 bg-emerald-50'
                          : vehicle.status === 'stationat'
                            ? 'border-amber-200 bg-amber-50'
                            : 'border-rose-200 bg-rose-50'
                        const statusIcon = vehicle.status === 'in_miscare' ? '🟢' : vehicle.status === 'stationat' ? '🟡' : '🔴'
                        return (
                          <button
                            type="button"
                            key={`${vehicle.nr_inmatriculare}-${vehicle.ultima_actualizare}`}
                            className={`rounded-lg border p-3 text-left text-sm transition hover:ring-2 hover:ring-primary-100 ${statusClass}`}
                            onClick={() => valid && setMapCenter([vehicle.lat, vehicle.lng])}
                          >
                            <div className="font-semibold text-slate-900">{statusIcon} {vehicle.nr_inmatriculare}</div>
                            <div className="mt-1 text-slate-600">📍 {vehicle.locatie || '-'}</div>
                            <div className="mt-1 text-slate-600">🚗 {vehicle.viteza_kmh || 0} km/h</div>
                            <div className="mt-1 text-xs text-slate-500">🕐 {vehicle.ultima_actualizare || '-'}</div>
                          </button>
                        )
                      })}
                    </div>
                  </aside>
                  <div className="min-w-0 flex-1">
                    <MapContainer center={mapDefaultCenter} zoom={13} style={{ height: '100%', width: '100%' }}>
                      <MapFlyTo center={mapCenter} />
                      <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution="© OpenStreetMap"
                      />
                      {gpsVehicles
                        .filter(vehicle => Number.isFinite(vehicle.lat) && Number.isFinite(vehicle.lng) && vehicle.lat !== 0 && vehicle.lng !== 0)
                        .map(vehicle => (
                          <Marker
                            key={`${vehicle.nr_inmatriculare}-${vehicle.lat}-${vehicle.lng}`}
                            position={[vehicle.lat, vehicle.lng]}
                            icon={gpsIcons[vehicle.status] || gpsIcons.oprit}
                          >
                            <Popup>
                              <div className="grid gap-1 text-sm">
                                <b>{vehicle.nr_inmatriculare}</b>
                                <span>{vehicle.locatie}</span>
                                <span>Viteză: {vehicle.viteza_kmh || 0} km/h</span>
                                <span>Motor: {vehicle.motor ? '🟢 Pornit' : '🔴 Oprit'}</span>
                                <span>Ultima actualizare: {vehicle.ultima_actualizare || '-'}</span>
                              </div>
                            </Popup>
                          </Marker>
                        ))}
                    </MapContainer>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {activeTab === TAB_ALERTS && (
        <Card title="Alerte flotă">
          {alerts.length > 0 && (
            <div className="mb-3 flex justify-end">
              <Button variant="secondary" onClick={() => exportExcel(
                alerts.map(alert => ({
                  'Utilaj / Vehicul': alert.assetName || alert.registration || alert.name || '',
                  'Tip alertă': alert.label || alert.type || '',
                  'Data scadenței': alert.dueDate || alert.date || alert.nextDate || '',
                  'Severitate': alertInfo(alert).label,
                })),
                `Alerte_Flota_${new Date().toISOString().slice(0,10)}`
              )}>📊 Export Excel</Button>
            </div>
          )}
          <div className="grid gap-3">
            {alerts.length ? alerts.map((alert, index) => {
              const status = alertInfo(alert)
              return (
                <div key={alert.id || `${alert.assetId}-${alert.type}-${index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
                  <div>
                    <div className="font-medium text-slate-900">{alert.assetName || alert.registration || alert.name || 'Utilaj'}</div>
                    <div className="text-sm text-slate-500">
                      {alert.label || alert.type || 'Alertă'} · {alert.dueDate || alert.date || alert.nextDate || 'fără dată'}
                    </div>
                  </div>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </div>
              )
            }) : (
              <div className="rounded-lg border border-slate-200 p-6 text-center text-sm text-slate-500">
                {loading ? 'Se încarcă...' : 'Nu există alerte active pentru flotă.'}
              </div>
            )}
          </div>
        </Card>
      )}

      {activeTab === TAB_AUTOMINDER && (
        <div className="grid gap-4">
        <Card title="Import Autominder SQL" subtitle="Importă direct din baza autoMinder5: parc auto, utilaje, angajați și documente expirabile. FAZ-urile și foile istorice sunt doar detectate în preview.">
          <form className="grid gap-4" onSubmit={testAutominderConnection}>
            <Input
              label="Connection string"
              value={autominderConnection}
              onChange={event => setAutominderConnection(event.target.value)}
              placeholder="Server=.\\SQLEXPRESS;Database=autoMinder5;User Id=infraflow;Password=parola;Encrypt=False;TrustServerCertificate=True"
              required
            />
            <p className="text-sm text-slate-500">Serverul Autominder trebuie să fie accesibil din rețea. Completează parola loginului SQL înainte de prima salvare.</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" loading={autominderSaving} onClick={saveAutominderConnection}>
                💾 Salvează connection string
              </Button>
              <Button type="submit" loading={autominderFullLoading}>🔄 Testează conexiunea</Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!autominderPreview || autominderFullLoading}
                onClick={() => setAutominderConfirm(true)}
              >
                📥 Importă date sigure
              </Button>
            </div>
          </form>

          {(autominderFullLoading || autominderStage) && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700">{autominderStage || 'Se procesează...'}</span>
                <span className="text-slate-500">{autominderProgress}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-primary-600 transition-all" style={{ width: `${autominderProgress}%` }} />
              </div>
            </div>
          )}

          {autominderPreview && (
            <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 p-5 text-sm text-blue-950">
              <h3 className="text-base font-semibold">Preview import estimat</h3>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <div>~{autominderPreview.autovehicule || 0} autovehicule</div>
                <div>~{autominderPreview.utilaje || 0} utilaje</div>
                <div>~{autominderPreview.angajati || 0} angajați</div>
                <div>~{autominderPreview.faz_utilaje || 0} FAZ-uri detectate, neimportate implicit</div>
                <div>~{autominderPreview.foi_parcurs_total || autominderPreview.foi_parcurs || 0} foi de parcurs detectate, neimportate implicit</div>
                <div>~{autominderPreview.documente_expirabile || 0} documente expirabile</div>
              </div>
              {autominderPreview.foi_parcurs_detalii && (
                <div className="mt-3 text-xs text-blue-800">
                  FoaieDeParcurs: {autominderPreview.foi_parcurs_detalii.FoaieDeParcurs || 0} ·
                  {' '}TM_FoiDeParcurs: {autominderPreview.foi_parcurs_detalii.TM_FoiDeParcurs || 0} ·
                  {' '}TP_FoiDeParcurs: {autominderPreview.foi_parcurs_detalii.TP_FoiDeParcurs || 0}
                </div>
              )}
            </div>
          )}

          {autominderFullResult && (
            <div className="mt-5 rounded-lg border border-primary-200 bg-primary-50 p-5">
              <h3 className="text-lg font-semibold text-primary-800">✅ Import Autominder finalizat!</h3>
              <div className="mt-4 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                {Object.entries(autominderFullResult.importate || {}).map(([key, value]) => (
                  <div key={key}><strong>{key.replaceAll('_', ' ')}:</strong> {value}</div>
                ))}
                <div><strong>Durată:</strong> {autominderFullResult.durata_secunde || 0}s</div>
              </div>
              <Button className="mt-4" variant="secondary" onClick={() => setActiveTab(TAB_VEHICLES)}>Vezi parcul auto</Button>
            </div>
          )}
        </Card>

        <Card title="Import Autominder XML" subtitle="Importă parc_auto.xml și lista_utilaje.xml exportate din Autominder SpreadsheetML.">
          <form className="grid gap-4" onSubmit={submitAutominderImport}>
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                type="file"
                label="Selectează parc_auto.xml"
                accept=".xml,text/xml,application/xml"
                onChange={event => setAutominderFiles({ ...autominderFiles, parc_auto: event.target.files?.[0] || null })}
              />
              <Input
                type="file"
                label="Selectează lista_utilaje.xml"
                accept=".xml,text/xml,application/xml"
                onChange={event => setAutominderFiles({ ...autominderFiles, lista_utilaje: event.target.files?.[0] || null })}
              />
            </div>
            <p className="text-sm text-slate-500">
              Ambele fișiere sunt opționale individual: poți importa doar vehiculele sau doar utilajele.
            </p>
            <div>
              <Button type="submit" loading={autominderLoading}>Importează</Button>
            </div>
          </form>

          {autominderResult && (
            <div className="mt-5 rounded-lg border border-primary-200 bg-primary-50 p-5">
              <h3 className="text-lg font-semibold text-primary-800">✅ Import finalizat!</h3>
              <div className="mt-4 grid gap-2 text-sm text-slate-700">
                <div>
                  <strong>Vehicule:</strong> {autominderResult.vehicule?.importate || 0} importate,
                  {' '}{autominderResult.vehicule?.actualizate || 0} actualizate
                </div>
                <div>
                  <strong>Utilaje:</strong> {autominderResult.utilaje?.importate || 0} importate,
                  {' '}{autominderResult.utilaje?.actualizate || 0} actualizate
                </div>
                <div><strong>Total:</strong> {autominderResult.total || 0} înregistrări adăugate/actualizate</div>
              </div>
              <Button className="mt-4" variant="secondary" onClick={() => setActiveTab(TAB_VEHICLES)}>Vezi parcul auto</Button>
            </div>
          )}

          {[...(autominderResult?.vehicule?.erori || []), ...(autominderResult?.utilaje?.erori || [])].length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <h4 className="font-semibold text-amber-900">Erori import</h4>
              <ul className="mt-2 grid gap-1 text-sm text-amber-800">
                {[...(autominderResult?.vehicule?.erori || []), ...(autominderResult?.utilaje?.erori || [])].map((item, index) => (
                  <li key={index}>Rând {item.rand}: {item.motiv}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
        </div>
      )}

      <Modal open={autominderConfirm} title="Confirmă importul complet Autominder" onClose={() => setAutominderConfirm(false)}>
        <div className="grid gap-4">
          <p className="text-sm text-slate-600">
            Importul va actualiza nomenclatoare, autovehicule, utilaje, angajați și documente expirabile. FAZ-urile și foile de parcurs istorice rămân neimportate automat până le mapăm separat.
          </p>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Verifică înainte că baza autoMinder5 este cea corectă. Datele existente sunt actualizate unde există potriviri.
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAutominderConfirm(false)}>Anulează</Button>
            <Button onClick={applyAutominderFullImport}>Da, importă datele sigure</Button>
          </div>
        </div>
      </Modal>

      <Modal open={assetModal} title={assetForm.tip_asset === 'autovehicul' ? 'Autovehicul nou' : 'Utilaj nou'} onClose={() => setAssetModal(false)}>
        <form className="grid gap-3" onSubmit={submitAsset}>
          <Select label="Categorie" value={assetForm.category} onChange={event => {
            const category = event.target.value
            setAssetForm({ ...assetForm, category, tip_asset: category === 'vehicle' ? 'autovehicul' : 'utilaj' })
          }} options={[
            { value: 'vehicle', label: 'Autovehicul' },
            { value: 'equipment', label: 'Utilaj' },
          ]} />
          <Input label={assetForm.tip_asset === 'autovehicul' ? 'Nr. înmatriculare' : 'Cod inventar / cod utilaj'} value={assetForm.registration} onChange={event => setAssetForm({ ...assetForm, registration: event.target.value })} />
          <Input label="Denumire" value={assetForm.name} onChange={event => setAssetForm({ ...assetForm, name: event.target.value })} />
          <Input label="Marcă" value={assetForm.brand} onChange={event => setAssetForm({ ...assetForm, brand: event.target.value })} />
          <Input label="Model" value={assetForm.model} onChange={event => setAssetForm({ ...assetForm, model: event.target.value })} />
          <Input label="Tip" value={assetForm.type} onChange={event => setAssetForm({ ...assetForm, type: event.target.value })} />
          <Input label="ITP/ISCIR expiră la" type="date" value={assetForm.nextInspectionDate} onChange={event => setAssetForm({ ...assetForm, nextInspectionDate: event.target.value })} />
          <Input label="Revizie la" type="date" value={assetForm.nextServiceDate} onChange={event => setAssetForm({ ...assetForm, nextServiceDate: event.target.value })} />
          <Button type="submit">Salvează</Button>
        </form>
      </Modal>

      <Modal open={requestModal} title="Solicitare nouă" onClose={() => setRequestModal(false)}>
        <form className="grid gap-3" onSubmit={submitRequest}>
          <Input label="Dată" type="date" value={requestForm.date} onChange={event => setRequestForm({ ...requestForm, date: event.target.value })} />
          <Select label="Utilaj" value={requestForm.assetId} onChange={event => setRequestForm({ ...requestForm, assetId: event.target.value })} options={assets.map(asset => ({ value: asset.id, label: assetLabel(asset) }))} />
          <Input label="Departament" value={requestForm.department} onChange={event => setRequestForm({ ...requestForm, department: event.target.value })} required />
          <Input label="Șantier" value={requestForm.jobName} onChange={event => setRequestForm({ ...requestForm, jobName: event.target.value })} required />
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Ora start" type="time" value={requestForm.startTime} onChange={event => setRequestForm({ ...requestForm, startTime: event.target.value })} />
            <Input label="Ora sfârșit" type="time" value={requestForm.endTime} onChange={event => setRequestForm({ ...requestForm, endTime: event.target.value })} />
          </div>
          <Input label="Locație" value={requestForm.location} onChange={event => setRequestForm({ ...requestForm, location: event.target.value })} />
          <Input label="Observații" value={requestForm.note} onChange={event => setRequestForm({ ...requestForm, note: event.target.value })} />
          <Button type="submit">Trimite solicitarea</Button>
        </form>
      </Modal>

      <Modal open={!!selectedAsset} title="Fișa utilajului" onClose={() => setSelectedAsset(null)} size="lg">
        {selectedAsset && (
          <div className="grid gap-3 text-sm">
            <div className="grid gap-2 rounded-lg bg-slate-50 p-3 md:grid-cols-2">
              <div><span className="text-slate-500">Denumire:</span> <b>{selectedAsset.name || '-'}</b></div>
              <div><span className="text-slate-500">{normalizeAssetKind(selectedAsset) === 'autovehicul' ? 'Nr. înmatriculare:' : 'Cod:'}</span> <b>{normalizeAssetKind(selectedAsset) === 'autovehicul' ? assetRegistration(selectedAsset) : assetCode(selectedAsset)}</b></div>
              <div><span className="text-slate-500">Marcă:</span> <b>{selectedAsset.marca || selectedAsset.brand || '-'}</b></div>
              <div><span className="text-slate-500">Model:</span> <b>{selectedAsset.model || '-'}</b></div>
              <div><span className="text-slate-500">Tip:</span> <b>{assetType(selectedAsset)}</b></div>
              <div><span className="text-slate-500">Rulaj:</span> <b>{selectedAsset.currentMeter || selectedAsset.km_curent || selectedAsset.ore_motor || 0} {selectedAsset.meterUnit === 'hours' ? 'ore' : 'km'}</b></div>
              <div><span className="text-slate-500">ITP/ISCIR:</span> <b>{selectedAsset.nextInspectionDate || '-'}</b></div>
              <div><span className="text-slate-500">Revizie:</span> <b>{selectedAsset.nextServiceDate || '-'}</b></div>
            </div>
            <p className="text-slate-600">{selectedAsset.notes || 'Nu există observații pentru această înregistrare.'}</p>
          </div>
        )}
      </Modal>
    </div>
  )
}
