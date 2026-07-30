import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/client'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import DropdownMenu from '../../components/ui/DropdownMenu'
import ContextHelp from '../../components/ui/ContextHelp'
import { exportExcel } from '../../utils/export'

const tabGroups = [
  { label: 'Parc', tabs: ['Parc Utilaje', 'Planificare'] },
  { label: 'Operatiuni', tabs: ['Bonuri Lucru', 'Alimentări', 'Alimentări PIUSI', 'Intervenții'] },
  { label: 'Scadente', tabs: ['Revizii predictive', 'Alerte & ISCIR', 'Scadențe & Asigurări'] },
  { label: 'Rapoarte', tabs: ['Cost/oră', 'FAZ Lunar', 'Raport Lunar'] },
]

function today() { return new Date().toISOString().slice(0, 10) }
function currentMonth() { return new Date().toISOString().slice(0, 7) }
function money(value) { return `${Number(value || 0).toFixed(2)} RON` }
function flattenCostCenters(items, level = 0) {
  return items.flatMap(item => [{ ...item, _level: level }, ...flattenCostCenters(item.subcentre || item.children || [], level + 1)])
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
}

function statusTone(status) {
  if (status === 'service')     return 'danger'
  if (status === 'alocat')      return 'warning'
  if (status === 'liber')       return 'success'
  if (status === 'planificat')  return 'primary'
  if (status === 'activ')       return 'success'
  if (status === 'finalizat')   return 'neutral'
  if (status === 'anulat')      return 'danger'
  if (status === 'deschis')     return 'warning'
  if (status === 'in_lucru')    return 'warning'
  if (status === 'trimisa')     return 'primary'
  if (status === 'deschisa')    return 'warning'
  if (status === 'completata')  return 'warning'
  if (status === 'inchisa')     return 'success'
  return 'neutral'
}

function statusLabel(status) {
  const map = {
    service: '🔧 Service', alocat: '🟡 Alocat', liber: '🟢 Liber',
    planificat: '📋 Planificat', activ: '▶️ Activ', finalizat: '✅ Finalizat',
    anulat: '❌ Anulat', deschis: '🟡 Deschis', in_lucru: '🔧 În lucru',
    deschisa: '🟡 Deschisă', trimisa: '📨 Trimisă', completata: '🟡 Completată', inchisa: '✅ Închisă',
    approved: '✅ Aprobat', rejected: '❌ Respins', new: '🆕 Nou',
    done: '✅ Finalizat',
  }
  return map[status] || status
}

function alertColor(days) {
  if (days === null) return ''
  if (days < 0) return 'text-rose-700 font-semibold'
  if (days <= 7) return 'text-rose-600 font-semibold'
  if (days <= 30) return 'text-amber-600'
  return ''
}

const emptyPlanForm = {
  date: today(), asset_id: '', department: '', job_name: '',
  operator: '', ora_start: '06:00', ora_sfarsit: '14:00', observatii: '',
}

const emptyWoForm = {
  date: today(), asset_id: '', operator: '', activitate: '', locatie: '',
  ore_lucrate: '', km_parcursi: '', consum_carburant: '', consum_normat: '', cost_center_id: '', observatii: '',
}

const emptyIntForm = {
  asset_id: '', data_intrare: today(), data_iesire: '', tip: 'reparatie',
  descriere: '', cost: '', cost_piese: '', cost_manopera: '', cost_extern: '',
  mecanic: '', furnizor: '', nr_factura: '', km_ore: '', cost_center_id: '',
  next_service_date: '', next_service_meter: '', iscir_expira_la: '',
}

const emptyFuelForm = {
  data: today(), asset_id: '', nr_document: '', furnizor: '',
  cantitate_litri: '', pret_litru: '', valoare_totala: '',
  km_ore: '', sofer_operator: '', cost_center_id: '', observatii: '',
}

const scadenteTabs = ['Expirări', 'RCA/CASCO', 'ITP', 'Taxe', 'ISCIR', 'Raport']

const emptyFleetDocForm = {
  asset_id: '',
  tip: 'RCA',
  asigurator: '',
  nr_polita: '',
  valoare_prima: '',
  valoare_asig: '',
  valabila_de_la: today(),
  perioada_luni: '12',
  data_expirarii: '',
  notif_zile: '15',
  clasa_bm: 'B6',
  carte_verde_pos: '',
  carte_verde_data: '',
  planificat_pe: today(),
  executat: false,
  executat_pe: '',
  odometru_la_itp: '',
  furnizor: '',
  valoare_fara_tva: '',
  cota_tva: '19',
  nr_factura: '',
  data_factura: '',
  data_scadenta: '',
  factura_platita: false,
  rezultat: '',
  valabila_de_la_taxa: today(),
  nr_document: '',
  tip_autorizare: 'verificare_periodica',
  nr_autorizare: '',
  data_emitere: '',
  inspector: '',
  organism: 'ISCIR',
  fisier_path: '',
  observatii: '',
}

export default function MecanizarePage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('Dashboard')
  const [assets, setAssets] = useState([])
  const [costCenters, setCostCenters] = useState([])
  const [assetStatus, setAssetStatus] = useState({})
  const [dashboard, setDashboard] = useState(null)
  const [plannings, setPlannings] = useState([])
  const [workOrders, setWorkOrders] = useState([])
  const [fuelLogs, setFuelLogs] = useState([])
  const [fuelTotals, setFuelTotals] = useState({ cantitate_litri: 0, valoare_totala: 0 })
  const [piusiFuelRows, setPiusiFuelRows] = useState([])
  const [piusiReport, setPiusiReport] = useState(null)
  const [interventions, setInterventions] = useState([])
  const [revisionRows, setRevisionRows] = useState([])
  const [mechanizationAlerts, setMechanizationAlerts] = useState([])
  const [costHour, setCostHour] = useState(null)
  const [fazReport, setFazReport] = useState(null)
  const [raport, setRaport] = useState(null)
  const [requests, setRequests] = useState([])
  const [tripLogs, setTripLogs] = useState([])

  // filters
  const [planDate, setPlanDate] = useState(today())
  const [woLuna, setWoLuna] = useState(currentMonth())
  const [fuelLuna, setFuelLuna] = useState(currentMonth())
  const [piusiFilters, setPiusiFilters] = useState({ de_la: `${currentMonth()}-01`, pana_la: today(), asset_id: '', procesat: '' })
  const [costLuna, setCostLuna] = useState(currentMonth())
  const [fazLuna, setFazLuna] = useState(currentMonth())
  const [fazAssetId, setFazAssetId] = useState('')
  const [raportLuna, setRaportLuna] = useState(currentMonth())
  const [searchAsset, setSearchAsset] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterTip, setFilterTip] = useState('')
  const [scadenteSubtab, setScadenteSubtab] = useState('Expirări')
  const [scadente, setScadente] = useState(null)
  const [fleetDocModal, setFleetDocModal] = useState(false)
  const [fleetDocKind, setFleetDocKind] = useState('asigurare')
  const [fleetDocForm, setFleetDocForm] = useState(emptyFleetDocForm)

  // modals
  const [planModal, setPlanModal] = useState(false)
  const [planForm, setPlanForm] = useState(emptyPlanForm)
  const [planEditing, setPlanEditing] = useState(null)

  const [woModal, setWoModal] = useState(false)
  const [woForm, setWoForm] = useState(emptyWoForm)
  const [woEditing, setWoEditing] = useState(null)

  const [fuelModal, setFuelModal] = useState(false)
  const [fuelForm, setFuelForm] = useState(emptyFuelForm)
  const [fuelEditing, setFuelEditing] = useState(null)

  const [intModal, setIntModal] = useState(false)
  const [intForm, setIntForm] = useState(emptyIntForm)
  const [intEditing, setIntEditing] = useState(null)

  const [reqModal, setReqModal] = useState(false)
  const [reqItem, setReqItem] = useState(null)
  const [reqForm, setReqForm] = useState({ status: 'approved', asset_id: '', observatii: '' })

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirmAction, setConfirmAction] = useState(null)
  const [confirmLoading, setConfirmLoading] = useState(false)

  // ── load ────────────────────────────────────────────────────────────────────
  async function loadAll() {
    setLoading(true); setError('')
    try {
      const [assetsRes, statusRes, dashRes, reqRes, tripsRes] = await Promise.all([
        api.get('/fleet-assets', { params: { tip: '' } }),
        api.get('/mechanization/asset-status'),
        api.get('/mechanization/dashboard'),
        api.get('/fleet-requests'),
        api.get('/fleet/trip-logs'),
      ])
      setAssets((assetsRes.data?.assets || []))
      api.get('/controlling/cost-centers').then(r => setCostCenters(Array.isArray(r.data) ? r.data : (r.data?.centers || []))).catch(() => setCostCenters([]))
      setAssetStatus(statusRes.data || {})
      setDashboard(dashRes.data || {})
      setRequests((reqRes.data?.requests || []))
      setTripLogs(tripsRes.data?.trip_logs || [])
    } catch (err) {
      setError(err.response?.data?.error || 'Eroare la încărcare.')
    } finally { setLoading(false) }
  }

  async function loadPlannings() {
    try {
      const res = await api.get('/mechanization/plannings', { params: { date: planDate } })
      setPlannings(Array.isArray(res.data) ? res.data : [])
    } catch { setPlannings([]) }
  }

  async function loadWorkOrders() {
    try {
      const res = await api.get('/mechanization/work-orders', { params: { luna: woLuna } })
      setWorkOrders(Array.isArray(res.data) ? res.data : [])
    } catch { setWorkOrders([]) }
  }

  async function loadFuelLogs() {
    try {
      const res = await api.get('/mechanization/fuel-logs', { params: { luna: fuelLuna } })
      setFuelLogs(res.data?.fuelLogs || [])
      setFuelTotals(res.data?.totals || { cantitate_litri: 0, valoare_totala: 0 })
    } catch {
      setFuelLogs([])
      setFuelTotals({ cantitate_litri: 0, valoare_totala: 0 })
    }
  }

  async function loadInterventions() {
    try {
      const res = await api.get('/mechanization/interventions')
      setInterventions(Array.isArray(res.data) ? res.data : [])
    } catch { setInterventions([]) }
  }

  async function loadRevisions() {
    try {
      const res = await api.get('/mechanization/revisions/predictive')
      setRevisionRows(res.data?.revisions || [])
    } catch { setRevisionRows([]) }
  }

  async function loadMechanizationAlerts() {
    try {
      const res = await api.get('/mechanization/alerts')
      setMechanizationAlerts(res.data?.alerts || [])
    } catch { setMechanizationAlerts([]) }
  }

  async function loadCostHour() {
    try {
      const res = await api.get('/mechanization/cost-hour', { params: { luna: costLuna } })
      setCostHour(res.data)
    } catch { setCostHour(null) }
  }

  async function loadFazReport() {
    try {
      const res = await api.get('/mechanization/faz-lunar', { params: { luna: fazLuna, asset_id: fazAssetId || undefined } })
      setFazReport(res.data)
    } catch { setFazReport(null) }
  }

  async function loadRaport() {
    try {
      const res = await api.get('/mechanization/raport-lunar', { params: { luna: raportLuna } })
      setRaport(res.data)
    } catch { setRaport(null) }
  }

  async function loadPiusiFuelRows() {
    try {
      const res = await api.get('/integration/piusi/alimentari', { params: piusiFilters })
      setPiusiFuelRows(res.data?.alimentari || [])
      const report = await api.get('/integration/piusi/raport-comparativ', { params: { luna: (piusiFilters.de_la || currentMonth()).slice(0, 7), asset_id: piusiFilters.asset_id || undefined } })
      setPiusiReport(report.data || null)
    } catch {
      setPiusiFuelRows([])
      setPiusiReport(null)
    }
  }

  async function loadScadente() {
    try {
      const res = await api.get('/fleet/scadente')
      setScadente(res.data || {})
    } catch { setScadente(null) }
  }

  useEffect(() => { loadAll() }, [])
  useEffect(() => { if (activeTab === 'Planificare')  loadPlannings() }, [activeTab, planDate])
  useEffect(() => { if (activeTab === 'Bonuri Lucru') loadWorkOrders() }, [activeTab, woLuna])
  useEffect(() => { if (activeTab === 'Alimentări') loadFuelLogs() }, [activeTab, fuelLuna])
  useEffect(() => { if (activeTab === 'Alimentări PIUSI') loadPiusiFuelRows() }, [activeTab, piusiFilters])
  useEffect(() => { if (activeTab === 'Intervenții')  loadInterventions() }, [activeTab])
  useEffect(() => { if (activeTab === 'Revizii predictive') loadRevisions() }, [activeTab])
  useEffect(() => { if (activeTab === 'Alerte & ISCIR') loadMechanizationAlerts() }, [activeTab])
  useEffect(() => { if (activeTab === 'Scadențe & Asigurări') loadScadente() }, [activeTab])
  useEffect(() => { if (activeTab === 'Cost/oră') loadCostHour() }, [activeTab, costLuna])
  useEffect(() => { if (activeTab === 'FAZ Lunar') loadFazReport() }, [activeTab, fazLuna, fazAssetId])
  useEffect(() => { if (activeTab === 'Raport Lunar') loadRaport() }, [activeTab, raportLuna])

  // ── computed ────────────────────────────────────────────────────────────────
  const equipment = useMemo(() => assets.filter(a => a.category === 'equipment'), [assets])
  const vehicles  = useMemo(() => assets.filter(a => a.category === 'vehicle'),   [assets])

  const filteredAssets = useMemo(() => {
    let list = assets
    if (filterTip === 'utilaj')     list = equipment
    if (filterTip === 'vehicul')    list = vehicles
    if (filterStatus) list = list.filter(a => assetStatus[a.id] === filterStatus)
    if (searchAsset)  list = list.filter(a => [a.name, a.registration, a.cod].join(' ').toLowerCase().includes(searchAsset.toLowerCase()))
    return list
  }, [assets, equipment, vehicles, filterTip, filterStatus, searchAsset, assetStatus])

  const assetOptions = useMemo(() =>
    [{ value: '', label: 'Alege utilaj / vehicul…' }, ...assets.map(a => ({
      value: String(a.id),
      label: [a.name, a.registration].filter(Boolean).join(' / ')
    }))]
  , [assets])

  const costCenterOptions = useMemo(() => {
    const flat = flattenCostCenters(costCenters)
    return [{ value: '', label: 'Fără centru cost explicit' }, ...flat.map(center => ({
      value: String(center.id),
      label: `${'  '.repeat(center._level)}${center.denumire || center.name || center.cod}`
    }))]
  }, [costCenters])

  // ── actions ─────────────────────────────────────────────────────────────────
  async function savePlanning(ev) {
    ev.preventDefault(); setError('')
    try {
      if (planEditing) {
        await api.patch(`/mechanization/plannings/${planEditing.id}`, planForm)
      } else {
        await api.post('/mechanization/plannings', planForm)
      }
      setPlanModal(false); setPlanEditing(null); setPlanForm(emptyPlanForm)
      await loadPlannings()
    } catch (err) { setError(err.response?.data?.error || 'Eroare la salvare.') }
  }

  async function deletePlanning(id) {
    setConfirmAction({
      title: 'Șterge planificarea',
      message: 'Ștergi această planificare?',
      details: 'Planificarea va fi scoasă din calendarul operațional al utilajelor. Verifică dacă nu este deja folosită în activitatea zilei.',
      confirmLabel: 'Șterge planificarea',
      tone: 'danger',
      run: () => deletePlanningRequest(id),
      errorMessage: 'Eroare la ștergere.',
    })
  }

  async function deletePlanningRequest(id) {
    try { await api.delete(`/mechanization/plannings/${id}`); await loadPlannings() }
    catch { setError('Eroare la ștergere.') }
  }

  async function updatePlanStatus(id, status) {
    try { await api.patch(`/mechanization/plannings/${id}`, { status }); await loadPlannings() }
    catch { setError('Eroare la actualizare status.') }
  }

  async function saveWorkOrder(ev) {
    ev.preventDefault(); setError('')
    try {
      if (woEditing) {
        await api.patch(`/mechanization/work-orders/${woEditing.id}`, woForm)
      } else {
        await api.post('/mechanization/work-orders', woForm)
      }
      setWoModal(false); setWoEditing(null); setWoForm(emptyWoForm)
      await loadWorkOrders()
    } catch (err) { setError(err.response?.data?.error || 'Eroare la salvare.') }
  }

  async function deleteWorkOrder(id) {
    setConfirmAction({
      title: 'Șterge bon de lucru',
      message: 'Ștergi acest bon de lucru?',
      details: 'Bonul nu va mai intra în centralizările operaționale. Dacă reprezintă activitate reală, verifică înainte de confirmare.',
      confirmLabel: 'Șterge bonul',
      tone: 'danger',
      run: () => deleteWorkOrderRequest(id),
      errorMessage: 'Eroare la ștergere.',
    })
  }

  async function deleteWorkOrderRequest(id) {
    try { await api.delete(`/mechanization/work-orders/${id}`); await loadWorkOrders() }
    catch { setError('Eroare la ștergere.') }
  }

  async function closeWorkOrder(id) {
    try { await api.patch(`/mechanization/work-orders/${id}`, { status: 'inchis' }); await loadWorkOrders() }
    catch { setError('Eroare.') }
  }

  async function saveFuelLog(ev) {
    ev.preventDefault(); setError('')
    try {
      if (fuelEditing) {
        await api.patch(`/mechanization/fuel-logs/${fuelEditing.id}`, fuelForm)
      } else {
        await api.post('/mechanization/fuel-logs', fuelForm)
      }
      setFuelModal(false); setFuelEditing(null); setFuelForm(emptyFuelForm)
      await loadFuelLogs()
      await loadAll()
    } catch (err) { setError(err.response?.data?.error || 'Eroare la salvare alimentare.') }
  }

  async function deleteFuelLog(id) {
    setConfirmAction({
      title: 'Șterge alimentare',
      message: 'Ștergi această alimentare?',
      details: 'Alimentarea va fi eliminată din raportarea mecanizării și poate modifica totalurile de carburant.',
      confirmLabel: 'Șterge alimentarea',
      tone: 'danger',
      run: () => deleteFuelLogRequest(id),
      errorMessage: 'Eroare la ștergere alimentare.',
    })
  }

  async function deleteFuelLogRequest(id) {
    try { await api.delete(`/mechanization/fuel-logs/${id}`); await loadFuelLogs() }
    catch { setError('Eroare la ștergere alimentare.') }
  }

  async function saveIntervention(ev) {
    ev.preventDefault(); setError('')
    try {
      if (intEditing) {
        await api.patch(`/mechanization/interventions/${intEditing.id}`, intForm)
      } else {
        await api.post('/mechanization/interventions', intForm)
      }
      setIntModal(false); setIntEditing(null); setIntForm(emptyIntForm)
      await loadInterventions()
      await loadAll()
    } catch (err) { setError(err.response?.data?.error || 'Eroare la salvare.') }
  }

  async function closeIntervention(id) {
    try {
      await api.patch(`/mechanization/interventions/${id}`, { data_iesire: today(), status: 'finalizat' })
      await loadInterventions(); await loadAll()
    } catch { setError('Eroare.') }
  }

  async function saveRequest(ev) {
    ev.preventDefault(); setError('')
    try {
      await api.patch(`/mechanization/requests/${reqItem.id}`, reqForm)
      setReqModal(false); setReqItem(null)
      await loadAll()
    } catch (err) { setError(err.response?.data?.error || 'Eroare la salvare.') }
  }

  async function importPiusiInFaz() {
    const count = piusiFuelRows.filter(row => row.asset_id && row.procesat !== true).length
    if (!count) { setError('Nu există alimentări PIUSI mapate și neprocesate.'); return }
    setConfirmAction({
      title: 'Importă alimentări PIUSI',
      message: `Importi ${count} alimentări PIUSI în FAZ/alimentări mecanizare?`,
      details: 'Vor fi preluate doar alimentările mapate pe utilaj/vehicul și neprocesate încă.',
      confirmLabel: 'Importă în FAZ',
      tone: 'warning',
      run: importPiusiInFazRequest,
      errorMessage: 'Importul PIUSI în FAZ a eșuat.',
    })
  }

  async function importPiusiInFazRequest() {
    setError('')
    try {
      await api.post('/integration/piusi/import-faz', { ids: piusiFuelRows.filter(row => row.asset_id && row.procesat !== true).map(row => row.id) })
      await loadPiusiFuelRows()
      await loadFuelLogs()
    } catch (err) {
      setError(err.response?.data?.error || 'Importul PIUSI în FAZ a eșuat.')
    }
  }

  function calcFleetDocExpiry(startValue, monthsValue) {
    if (!startValue) return ''
    const d = new Date(`${startValue}T00:00:00`)
    d.setMonth(d.getMonth() + Number(monthsValue || 12))
    d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
  }

  function openFleetDoc(kind, preset = {}) {
    const next = {
      ...emptyFleetDocForm,
      ...preset,
      asset_id: preset.asset_id ? String(preset.asset_id) : '',
    }
    if (kind === 'asigurare' && !next.data_expirarii) {
      next.data_expirarii = calcFleetDocExpiry(next.valabila_de_la, next.perioada_luni)
    }
    setFleetDocKind(kind)
    setFleetDocForm(next)
    setFleetDocModal(true)
  }

  async function saveFleetDoc(ev) {
    ev.preventDefault(); setError('')
    try {
      if (fleetDocKind === 'asigurare') {
        await api.post('/fleet/asigurari', {
          asset_id: fleetDocForm.asset_id,
          tip: fleetDocForm.tip,
          asigurator: fleetDocForm.asigurator,
          nr_polita: fleetDocForm.nr_polita,
          valoare_prima: fleetDocForm.valoare_prima,
          valoare_asig: fleetDocForm.valoare_asig,
          valabila_de_la: fleetDocForm.valabila_de_la,
          perioada_luni: fleetDocForm.perioada_luni,
          data_expirarii: fleetDocForm.data_expirarii,
          notif_zile: fleetDocForm.notif_zile,
          clasa_bm: fleetDocForm.clasa_bm,
          carte_verde_pos: fleetDocForm.carte_verde_pos,
          carte_verde_data: fleetDocForm.carte_verde_data,
          fisier_path: fleetDocForm.fisier_path,
          observatii: fleetDocForm.observatii,
        })
      } else if (fleetDocKind === 'itp') {
        await api.post('/fleet/itp', fleetDocForm)
      } else if (fleetDocKind === 'taxa') {
        await api.post('/fleet/taxe', {
          asset_id: fleetDocForm.asset_id,
          tip: fleetDocForm.tip,
          valabila_de_la: fleetDocForm.valabila_de_la_taxa,
          data_expirarii: fleetDocForm.data_expirarii,
          notif_zile: fleetDocForm.notif_zile,
          valoare: fleetDocForm.valoare_prima,
          nr_document: fleetDocForm.nr_document,
          fisier_path: fleetDocForm.fisier_path,
          observatii: fleetDocForm.observatii,
        })
      } else {
        await api.post('/fleet/iscir', {
          asset_id: fleetDocForm.asset_id,
          tip_autorizare: fleetDocForm.tip_autorizare,
          nr_autorizare: fleetDocForm.nr_autorizare,
          data_emitere: fleetDocForm.data_emitere,
          data_expirarii: fleetDocForm.data_expirarii,
          notif_zile: fleetDocForm.notif_zile,
          inspector: fleetDocForm.inspector,
          organism: fleetDocForm.organism,
          fisier_path: fleetDocForm.fisier_path,
          observatii: fleetDocForm.observatii,
        })
      }
      setFleetDocModal(false)
      setFleetDocForm(emptyFleetDocForm)
      await loadScadente()
    } catch (err) {
      setError(err.response?.data?.error || 'Documentul nu a putut fi salvat.')
    }
  }

  async function downloadFleetReport(path, filename) {
    try {
      const res = await api.get(path, { params: { an: new Date().getFullYear(), format: 'xlsx' }, responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Raportul Excel nu a putut fi descărcat.')
    }
  }

  async function generateMechanizationFaz() {
    setConfirmAction({
      title: 'Generează FAZ mecanizare',
      message: `Generezi FAZ mecanizare pentru ${fazLuna}?`,
      details: 'Raportul lunar va centraliza activitatea, alimentările și costurile pentru filtrele selectate.',
      confirmLabel: 'Generează FAZ',
      tone: 'warning',
      run: generateMechanizationFazRequest,
      errorMessage: 'Generarea FAZ a eșuat.',
    })
  }

  async function generateMechanizationFazRequest() {
    setError('')
    try {
      const res = await api.post('/mechanization/faz-lunar/generate', {
        luna: fazLuna,
        asset_id: fazAssetId || undefined,
      })
      setFazReport(res.data)
      const win = window.open('', '_blank')
      win.document.write(res.data.html)
      win.document.close()
      win.focus()
    } catch (err) {
      setError(err.response?.data?.error || 'FAZ-ul mecanizare nu a putut fi generat.')
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

  // ── print raport lunar ───────────────────────────────────────────────────────
  function printRaport() {
    if (!raport) return
    const rows = raport.rows.map(r =>
      `<tr><td>${r.asset_name}</td><td class="n">${r.zile_lucrate}</td><td class="n">${r.ore_total.toFixed(1)}</td><td class="n">${r.km_total.toFixed(0)}</td><td class="n">${r.consum_total.toFixed(1)}</td><td class="n">${r.consum_normat_total.toFixed(1)}</td><td class="n ${r.diferenta_consum > 0 ? 'red' : ''}">${r.diferenta_consum.toFixed(1)}</td></tr>`
    ).join('')
    const t = raport.totals
    const html = `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>Raport Lunar Mecanizare ${raport.luna}</title>
<style>body{font-family:Arial,sans-serif;font-size:10pt;margin:1.5cm}h2{text-align:center;margin-bottom:4px}p.sub{text-align:center;color:#555;margin:0 0 12px}
table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:4px 6px;font-size:9pt}th{background:#f0f0f0;text-align:center}
.n{text-align:right}.red{color:red;font-weight:bold}.total{background:#e8e8e8;font-weight:bold}
@media print{body{margin:1cm}}</style></head><body>
<h2>RAPORT DE ACTIVITATE UTILAJE — ${raport.luna}</h2>
<p class="sub">Total service: ${raport.costService.toFixed(2)} RON</p>
<table>
<thead><tr><th>Utilaj / Vehicul</th><th>Zile lucrate</th><th>Ore lucru</th><th>Km parcurși</th><th>Cons. real (L)</th><th>Cons. normat (L)</th><th>Diferență (L)</th></tr></thead>
<tbody>${rows}
<tr class="total"><td>TOTAL</td><td class="n">${t.zile_lucrate}</td><td class="n">${t.ore_total.toFixed(1)}</td><td class="n">${t.km_total.toFixed(0)}</td><td class="n">${t.consum_total.toFixed(1)}</td><td class="n">${t.consum_normat_total.toFixed(1)}</td><td class="n ${t.diferenta_consum > 0 ? 'red' : ''}">${t.diferenta_consum.toFixed(1)}</td></tr>
</tbody></table>
</body></html>`
    const win = window.open('', '_blank')
    win.document.write(html); win.document.close(); win.focus()
    setTimeout(() => win.print(), 400)
  }

  // ─────────────────────────────────────────────────────────────────────────────

  const mechanizationHelp = useMemo(() => {
    const openRequestStatuses = ['new', 'nou', 'deschisa', 'trimisa', 'in_lucru', 'pending']
    const pendingRequests = requests.filter(request => openRequestStatuses.includes(String(request.status || '').toLowerCase())).length
    const openWorkOrders = workOrders.filter(order => !['inchis', 'finalizat', 'anulat', 'closed', 'done'].includes(String(order.status || '').toLowerCase())).length
    const unmappedPiusiRows = piusiFuelRows.filter(row => !row.asset_id && row.procesat !== true).length
    const serviceAssets = assets.filter(asset => assetStatus[asset.id] === 'service').length
    const dashboardAlerts = Number(dashboard?.stats?.alerteDocumente || dashboard?.stats?.alerts || dashboard?.alerte || 0)
    const scadenteAlerts = Array.isArray(scadente?.expirari) ? scadente.expirari.length : 0
    const alertCount = Math.max(dashboardAlerts, mechanizationAlerts.length, scadenteAlerts, serviceAssets)
    const steps = [
      {
        key: 'requests',
        label: `Cereri parc · ${pendingRequests}`,
        hint: 'Aprobă cererile și alocă vehicule/utilaje înainte să pornească lucrul.',
        done: pendingRequests === 0,
        onClick: () => setActiveTab('Parc Utilaje'),
      },
      {
        key: 'planning',
        label: `Planificări · ${plannings.length}`,
        hint: 'Planificarea leagă utilajul, operatorul și lucrarea zilei.',
        done: plannings.length > 0,
        onClick: () => setActiveTab('Planificare'),
      },
      {
        key: 'work-orders',
        label: openWorkOrders ? `Bonuri deschise · ${openWorkOrders}` : 'Bonuri închise',
        hint: 'Bonurile închise alimentează FAZ-ul și costurile pe utilaj.',
        done: workOrders.length > 0 && openWorkOrders === 0,
        onClick: () => setActiveTab('Bonuri Lucru'),
      },
      {
        key: 'fuel',
        label: unmappedPiusiRows ? `PIUSI nemapate · ${unmappedPiusiRows}` : 'Alimentări curate',
        hint: 'Alimentările PIUSI trebuie mapate pe utilaj înainte de rapoarte.',
        done: unmappedPiusiRows === 0,
        onClick: () => setActiveTab(unmappedPiusiRows ? 'Alimentări PIUSI' : 'Alimentări'),
      },
      {
        key: 'alerts',
        label: alertCount ? `Scadențe/service · ${alertCount}` : 'Scadențe curate',
        hint: 'RCA, ITP, ISCIR și service-ul trebuie ținute la zi înainte de exploatare.',
        done: alertCount === 0,
        onClick: () => setActiveTab('Scadențe & Asigurări'),
      },
    ]
    const nextStep = steps.find(step => !step.done) || steps[0]
    return {
      steps,
      nextAction: nextStep ? {
        label: 'Deschide recomandarea',
        onClick: nextStep.onClick,
        variant: 'secondary',
      } : null,
      tone: pendingRequests || openWorkOrders || unmappedPiusiRows || alertCount ? 'warning' : 'success',
    }
  }, [requests, plannings.length, workOrders, piusiFuelRows, assets, assetStatus, dashboard, mechanizationAlerts.length, scadente])

  const demoTrip = tripLogs.find(trip => trip.nr_foaie === 'FP-2026-KIOSK-001')
  const completedDemoTrips = tripLogs.filter(trip => ['completata', 'semnata_sofer', 'semnata_responsabil'].includes(trip.status))

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">⚙️ Mecanizare</h1>
          <p className="text-sm text-slate-500">Parc utilaje, planificare, bonuri de lucru, intervenții</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate('/foi-parcurs')}>Foi Parcurs</Button>
          <DropdownMenu align="right" label="Meniu" items={[
            { label: 'Registru FAZ utilaje', onClick: () => navigate('/faz-utilaje') },
            { label: 'Kiosk sofer', onClick: () => window.open('/kiosk', '_blank') },
          ]} />
        </div>
      </div>

      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div> : null}

      <ContextHelp
        eyebrow="Ghid mecanizare"
        title="Ține parcul în ordine: cereri → planificare → bonuri → alimentări → scadențe"
        description="Mecanizarea funcționează bine când utilajele sunt planificate, bonurile se închid lunar, alimentările sunt mapate și scadențele nu ajung urgente."
        icon="⚙️"
        tone={mechanizationHelp.tone}
        steps={mechanizationHelp.steps}
        tips={[
          'Bonurile de lucru închise sunt baza pentru FAZ și cost/oră.',
          'Alimentările nemapate strică raportul de consum și diferențele normate.',
          'Un utilaj cu scadență critică trebuie verificat înainte de alocare.',
        ]}
        nextAction={mechanizationHelp.nextAction}
        compact
      />

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('Dashboard')}
          className={`inline-flex h-[var(--control-height)] items-center rounded-[var(--radius-control)] border px-[var(--control-px)] text-sm font-semibold transition ${
            activeTab === 'Dashboard' ? 'border-primary-700 bg-primary-700 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50'
          }`}
        >
          Dashboard
        </button>
        {tabGroups.map(group => {
          const items = group.tabs.map(tab => ({ label: tab, active: activeTab === tab, onClick: () => setActiveTab(tab) }))
          const activeItem = items.find(item => item.active)
          return (
            <DropdownMenu
              key={group.label}
              label={activeItem ? `${group.label}: ${activeItem.label}` : group.label}
              active={Boolean(activeItem)}
              items={items}
            />
          )
        })}
      </div>

      {/* ── DASHBOARD ─────────────────────────────────────────────────────────── */}
      {activeTab === 'Dashboard' ? (
        <div className="grid gap-4">
          {/* KPI cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 2xl:grid-cols-7">
            {[
              { label: 'Total utilaje', value: dashboard?.stats?.totalUtilaje ?? '…', icon: '🏗️' },
              { label: 'Total vehicule', value: dashboard?.stats?.totalVehicule ?? '…', icon: '🚗' },
              { label: 'Alocate azi', value: dashboard?.stats?.alocateAzi ?? '…', icon: '🟡', tone: 'amber' },
              { label: 'În service', value: dashboard?.stats?.inService ?? '…', icon: '🔧', tone: 'rose' },
              { label: 'Alerte documente', value: dashboard?.stats?.alerteDocumente ?? '…', icon: '⚠️', tone: 'rose' },
              { label: `Cost ${dashboard?.luna || 'lună'}`, value: dashboard ? money(dashboard?.stats?.costLuna) : '…', icon: '💰', small: true },
              { label: `Litri ${dashboard?.luna || 'lună'}`, value: dashboard ? `${Number(dashboard?.stats?.litriLuna || 0).toFixed(2)} L` : '…', icon: '⛽', small: true },
            ].map(k => (
              <Card key={k.label} className="text-center">
                <div className="text-2xl">{k.icon}</div>
                <div className={`${k.small ? 'text-xl' : 'text-3xl'} font-bold ${k.tone === 'rose' && Number(k.value) > 0 ? 'text-rose-600' : k.tone === 'amber' && Number(k.value) > 0 ? 'text-amber-600' : 'text-slate-900'}`}>{k.value}</div>
                <div className="text-xs text-slate-500">{k.label}</div>
              </Card>
            ))}
          </div>

          <Card className="border-emerald-200 bg-emerald-50/60">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase text-emerald-700">Demo mecanizare → șofer</div>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">Foaia șoferului Ion Popescu</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Șeful de mecanizare trimite foaia, șoferul o completează din Kiosk, apoi mecanizarea o închide pentru FAZ.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => navigate('/foi-parcurs')}>Deschide Foi Parcurs</Button>
                <Button variant="secondary" onClick={() => window.open('/kiosk', '_blank')}>Kiosk șofer</Button>
              </div>
            </div>
            <div className="mt-4 grid gap-3 text-sm md:grid-cols-4">
              <div className="rounded-md border border-white bg-white p-3 shadow-sm">
                <div className="text-xs font-semibold uppercase text-slate-500">Foaie demo</div>
                <div className="mt-1 font-semibold text-slate-900">{demoTrip?.nr_foaie || 'FP-2026-KIOSK-001'}</div>
                <div className="mt-1 text-slate-500">{demoTrip?.asset_label || 'NT-01-ABC'}</div>
              </div>
              <div className="rounded-md border border-white bg-white p-3 shadow-sm">
                <div className="text-xs font-semibold uppercase text-slate-500">Status</div>
                <div className="mt-2"><Badge tone={statusTone(demoTrip?.status)}>{statusLabel(demoTrip?.status || 'deschisa')}</Badge></div>
              </div>
              <div className="rounded-md border border-white bg-white p-3 shadow-sm">
                <div className="text-xs font-semibold uppercase text-slate-500">Șofer</div>
                <div className="mt-1 font-semibold text-slate-900">{demoTrip?.sofer_nume || 'Ion Popescu'}</div>
                <div className="mt-1 text-slate-500">Kiosk: sofer1 / demo123</div>
              </div>
              <div className="rounded-md border border-white bg-white p-3 shadow-sm">
                <div className="text-xs font-semibold uppercase text-slate-500">De închis</div>
                <div className="mt-1 text-2xl font-bold text-slate-900">{completedDemoTrips.length}</div>
                <div className="mt-1 text-slate-500">foi completate de șoferi</div>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Planificări azi */}
            <Card>
              <div className="mb-3 text-sm font-semibold text-slate-700">📋 Planificări astăzi</div>
              {(dashboard?.planningsToday || []).length === 0
                ? <p className="text-sm text-slate-400">Nicio planificare pentru astăzi.</p>
                : (dashboard?.planningsToday || []).map(p => (
                  <div key={p.id} className="flex items-center justify-between gap-2 border-b border-slate-100 py-2 text-sm last:border-0">
                    <div>
                      <span className="font-medium text-slate-800">{p.asset_name}</span>
                      <span className="ml-2 text-slate-500">{p.department}{p.job_name ? ` — ${p.job_name}` : ''}</span>
                      <span className="ml-2 text-xs text-slate-400">{p.ora_start}–{p.ora_sfarsit}</span>
                    </div>
                    <Badge tone={statusTone(p.status)}>{statusLabel(p.status)}</Badge>
                  </div>
                ))
              }
            </Card>

            {/* Solicitări în așteptare */}
            <Card>
              <div className="mb-3 text-sm font-semibold text-slate-700">📥 Solicitări în așteptare ({(requests.filter(r => r.status === 'new')).length})</div>
              {requests.filter(r => r.status === 'new').length === 0
                ? <p className="text-sm text-slate-400">Nicio solicitare în așteptare.</p>
                : requests.filter(r => r.status === 'new').slice(0, 6).map(r => (
                  <div key={r.id} className="flex items-center justify-between gap-2 border-b border-slate-100 py-2 text-sm last:border-0">
                    <div>
                      <span className="font-medium text-slate-800">{r.assetName || r.category}</span>
                      <span className="ml-2 text-slate-500">{r.department}</span>
                      <span className="ml-2 text-xs text-slate-400">{r.date} {r.startTime}–{r.endTime}</span>
                    </div>
                    <Button size="sm" onClick={() => { setReqItem(r); setReqForm({ status: 'approved', asset_id: '', observatii: '' }); setReqModal(true) }}>Procesează</Button>
                  </div>
                ))
              }
            </Card>

            {/* Alerte documente */}
            <Card>
              <div className="mb-3 text-sm font-semibold text-slate-700">⚠️ Alerte documente utilaje</div>
              {(dashboard?.alerts || []).length === 0
                ? <p className="text-sm text-slate-400">Toate documentele sunt valabile.</p>
                : (dashboard?.alerts || []).map((a, idx) => (
                  <div key={idx} className={`flex items-center justify-between gap-2 border-b border-slate-100 py-2 text-sm last:border-0 ${a.days < 0 ? 'text-rose-700' : 'text-amber-700'}`}>
                    <div>
                      <span className="font-medium">{a.asset_name}</span>
                      <span className="ml-2 text-xs">{a.label}</span>
                    </div>
                    <span className="text-xs font-semibold">
                      {a.days < 0 ? `Expirat ${Math.abs(a.days)}z` : `${a.days}z rămase`}
                    </span>
                  </div>
                ))
              }
            </Card>

            {/* Bonuri recente */}
            <Card>
              <div className="mb-3 text-sm font-semibold text-slate-700">🧾 Bonuri de lucru recente</div>
              {(dashboard?.recentWorkOrders || []).length === 0
                ? <p className="text-sm text-slate-400">Niciun bon de lucru.</p>
                : (dashboard?.recentWorkOrders || []).map(wo => (
                  <div key={wo.id} className="flex items-center justify-between gap-2 border-b border-slate-100 py-2 text-sm last:border-0">
                    <div>
                      <span className="font-medium text-slate-800">{wo.asset_name}</span>
                      <span className="ml-2 text-slate-500">{wo.activitate}</span>
                      <span className="ml-2 text-xs text-slate-400">{wo.date}</span>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      <div>{wo.ore_lucrate}h</div>
                      <Badge tone={statusTone(wo.status)}>{statusLabel(wo.status)}</Badge>
                    </div>
                  </div>
                ))
              }
            </Card>

            {/* Top cost/oră */}
            <Card>
              <div className="mb-3 text-sm font-semibold text-slate-700">💰 Top cost/oră {dashboard?.luna || ''}</div>
              {(dashboard?.topCostHour || []).length === 0
                ? <p className="text-sm text-slate-400">Nu există costuri calculate pentru luna curentă.</p>
                : (dashboard?.topCostHour || []).map(row => (
                  <div key={row.asset_id} className="flex items-center justify-between gap-2 border-b border-slate-100 py-2 text-sm last:border-0">
                    <div>
                      <span className="font-medium text-slate-800">{row.asset_name}</span>
                      <span className="ml-2 text-xs text-slate-400">{Number(row.ore_total || 0).toFixed(1)}h</span>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-slate-900">{money(row.cost_ora)}/h</div>
                      <div className="text-xs text-slate-500">{money(row.cost_total)}</div>
                    </div>
                  </div>
                ))
              }
            </Card>

            {/* Consum peste normă */}
            <Card>
              <div className="mb-3 text-sm font-semibold text-slate-700">⛽ Consum peste normă {dashboard?.luna || ''}</div>
              {(dashboard?.highConsumption || []).length === 0
                ? <p className="text-sm text-slate-400">Nu sunt depășiri de consum în luna curentă.</p>
                : (dashboard?.highConsumption || []).map(wo => (
                  <div key={wo.id} className="flex items-center justify-between gap-2 border-b border-slate-100 py-2 text-sm last:border-0">
                    <div>
                      <span className="font-medium text-slate-800">{wo.asset_name}</span>
                      <span className="ml-2 text-slate-500">{wo.activitate || 'Bon lucru'}</span>
                      <span className="ml-2 text-xs text-slate-400">{wo.date}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-rose-600">+{Number(wo.diferenta_consum || 0).toFixed(2)} L</div>
                      <div className="text-xs text-slate-500">{Number(wo.diferenta_procent || 0).toFixed(1)}%</div>
                    </div>
                  </div>
                ))
              }
            </Card>

            {/* Intervenții deschise */}
            <Card>
              <div className="mb-3 text-sm font-semibold text-slate-700">🔧 Intervenții deschise</div>
              {(dashboard?.openInterventions || []).length === 0
                ? <p className="text-sm text-slate-400">Nu există intervenții în lucru.</p>
                : (dashboard?.openInterventions || []).map(item => (
                  <div key={item.id} className="flex items-center justify-between gap-2 border-b border-slate-100 py-2 text-sm last:border-0">
                    <div>
                      <span className="font-medium text-slate-800">{item.asset_name || item.asset_id}</span>
                      <span className="ml-2 text-slate-500">{item.tip || 'intervenție'}</span>
                      <span className="ml-2 text-xs text-slate-400">{item.data_intrare}</span>
                    </div>
                    <div className="text-right">
                      <Badge tone="warning">În lucru</Badge>
                      <div className="text-xs text-slate-500">{item.mecanic || item.furnizor || '—'}</div>
                    </div>
                  </div>
                ))
              }
            </Card>
          </div>
        </div>
      ) : null}

      {/* ── PARC UTILAJE ─────────────────────────────────────────────────────── */}
      {activeTab === 'Parc Utilaje' ? (
        <div className="grid gap-4">
          <Card>
            <div className="grid gap-3 sm:grid-cols-4">
              <Input label="Caută" value={searchAsset} onChange={e => setSearchAsset(e.target.value)} placeholder="Nume, nr. înmatriculare…" />
              <Select label="Tip" value={filterTip} onChange={e => setFilterTip(e.target.value)} options={[
                { value: '', label: 'Toate' },
                { value: 'utilaj', label: 'Utilaje' },
                { value: 'vehicul', label: 'Autovehicule' },
              ]} />
              <Select label="Status" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} options={[
                { value: '', label: 'Toate statusurile' },
                { value: 'liber', label: '🟢 Liber' },
                { value: 'alocat', label: '🟡 Alocat' },
                { value: 'service', label: '🔧 Service' },
              ]} />
              <div className="flex items-end">
                <span className="text-sm text-slate-500">{filteredAssets.length} înregistrări</span>
              </div>
            </div>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredAssets.map(asset => {
              const status = assetStatus[asset.id] || 'liber'
              const itp = asset.nextInspectionDate
              const service = asset.nextServiceDate
              const itpDays = daysUntil(itp)
              const servDays = daysUntil(service)
              return (
                <Card key={asset.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-900">{asset.name || asset.registration}</div>
                      <div className="text-xs text-slate-500">{asset.registration || '—'} · {asset.type || asset.tip_asset || '—'}</div>
                      <div className="text-xs text-slate-400">{asset.brand || ''} {asset.model || ''} {asset.year ? `(${asset.year})` : ''}</div>
                    </div>
                    <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
                    <div className="rounded bg-slate-50 px-2 py-1">
                      <div className="text-slate-400">Contor</div>
                      <div className="font-medium">{asset.currentMeter ?? '—'} {asset.meterUnit === 'hours' ? 'ore' : 'km'}</div>
                    </div>
                    <div className="rounded bg-slate-50 px-2 py-1">
                      <div className="text-slate-400">Combustibil</div>
                      <div className="font-medium">{asset.fuelType || '—'} · {asset.standardConsumption ?? '—'} L/h</div>
                    </div>
                    {itp ? (
                      <div className={`rounded px-2 py-1 ${itpDays !== null && itpDays <= 30 ? 'bg-amber-50' : 'bg-slate-50'}`}>
                        <div className="text-slate-400">ITP / Inspecție</div>
                        <div className={`font-medium ${alertColor(itpDays)}`}>{itp}{itpDays !== null && itpDays <= 30 ? ` (${itpDays < 0 ? 'exp.' : itpDays + 'z'})` : ''}</div>
                      </div>
                    ) : null}
                    {service ? (
                      <div className={`rounded px-2 py-1 ${servDays !== null && servDays <= 30 ? 'bg-amber-50' : 'bg-slate-50'}`}>
                        <div className="text-slate-400">Service planif.</div>
                        <div className={`font-medium ${alertColor(servDays)}`}>{service}{servDays !== null && servDays <= 30 ? ` (${servDays < 0 ? 'dep.' : servDays + 'z'})` : ''}</div>
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      className="rounded bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      onClick={() => navigate(`/fleet/asset/${asset.id}`)}
                    >Fișă completă</button>
                    <button
                      className="rounded bg-primary-50 px-2 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100"
                      onClick={() => { setPlanForm({ ...emptyPlanForm, asset_id: String(asset.id) }); setPlanEditing(null); setPlanModal(true) }}
                    >📋 Planifică</button>
                    <button
                      className="rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                      onClick={() => { setWoForm({ ...emptyWoForm, asset_id: String(asset.id) }); setWoEditing(null); setWoModal(true) }}
                    >🧾 Bon lucru</button>
                    <button
                      className="rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                      onClick={() => { setFuelForm({ ...emptyFuelForm, asset_id: String(asset.id) }); setFuelEditing(null); setFuelModal(true) }}
                    >⛽ Alimentare</button>
                    <button
                      className="rounded bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
                      onClick={() => { setIntForm({ ...emptyIntForm, asset_id: String(asset.id) }); setIntEditing(null); setIntModal(true) }}
                    >🔧 Intervenție</button>
                  </div>
                </Card>
              )
            })}
            {filteredAssets.length === 0 ? (
              <div className="col-span-3 rounded-xl border-2 border-dashed border-slate-200 py-16 text-center text-sm text-slate-400">
                {loading ? 'Se încarcă…' : 'Nu s-au găsit utilaje / vehicule.'}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ── PLANIFICARE ──────────────────────────────────────────────────────── */}
      {activeTab === 'Planificare' ? (
        <div className="grid gap-4">
          <Card>
            <div className="flex flex-wrap items-end gap-3">
              <Input label="Data" type="date" value={planDate} onChange={e => setPlanDate(e.target.value)} />
              <Button onClick={() => { setPlanForm({ ...emptyPlanForm, date: planDate }); setPlanEditing(null); setPlanModal(true) }}>+ Planificare nouă</Button>
              <span className="ml-auto text-sm text-slate-500">{plannings.length} planificări în {planDate}</span>
            </div>
          </Card>

          {plannings.length === 0 ? (
            <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-16 text-sm text-slate-400">
              Nicio planificare pentru {planDate}. Apasă + Planificare nouă.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Utilaj</th>
                    <th className="px-3 py-2">Departament / Lucrare</th>
                    <th className="px-3 py-2">Operator</th>
                    <th className="px-3 py-2">Interval</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {plannings.map(p => (
                    <tr key={p.id}>
                      <td className="px-3 py-2 font-medium text-slate-800">{p.asset_name}</td>
                      <td className="px-3 py-2">
                        <div>{p.department || '—'}</div>
                        {p.job_name ? <div className="text-xs text-slate-400">{p.job_name}</div> : null}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{p.operator || '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{p.ora_start} – {p.ora_sfarsit}</td>
                      <td className="px-3 py-2"><Badge tone={statusTone(p.status)}>{statusLabel(p.status)}</Badge></td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          {p.status === 'planificat' ? (
                            <>
                              <button className="rounded bg-green-50 px-2 py-1 text-xs text-green-700 hover:bg-green-100" onClick={() => updatePlanStatus(p.id, 'activ')}>▶️ Start</button>
                              <button className="rounded bg-slate-50 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100" onClick={() => updatePlanStatus(p.id, 'anulat')}>❌</button>
                            </>
                          ) : p.status === 'activ' ? (
                            <button className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100" onClick={() => updatePlanStatus(p.id, 'finalizat')}>✅ Finalizat</button>
                          ) : null}
                          <button className="text-xs text-primary-600 hover:underline" onClick={() => { setPlanEditing(p); setPlanForm({ ...p }); setPlanModal(true) }}>✏️</button>
                          <button className="text-xs text-rose-500 hover:underline" onClick={() => deletePlanning(p.id)}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {/* ── BONURI LUCRU ────────────────────────────────────────────────────── */}
      {activeTab === 'Bonuri Lucru' ? (
        <div className="grid gap-4">
          <Card>
            <div className="flex flex-wrap items-end gap-3">
              <Input label="Luna" type="month" value={woLuna} onChange={e => setWoLuna(e.target.value)} />
              <Button onClick={() => { setWoForm({ ...emptyWoForm }); setWoEditing(null); setWoModal(true) }}>+ Bon nou</Button>
              <DropdownMenu label="Export" items={[{ label: 'Export Excel', onClick: () => exportExcel(
                workOrders.map(w => ({
                  'Data': w.date, 'Utilaj': w.asset_name, 'Operator': w.operator,
                  'Activitate': w.activitate, 'Locație': w.locatie,
                  'Ore lucrate': w.ore_lucrate, 'Km parcurși': w.km_parcursi,
                  'Consum real (L)': w.consum_carburant, 'Consum normat (L)': w.consum_normat,
                  'Status': w.status,
                })),
                `BonuriLucru_${woLuna}`
              ) }]} />
            </div>
          </Card>

          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Utilaj</th>
                  <th className="px-3 py-2">Operator</th>
                  <th className="px-3 py-2">Activitate / Locație</th>
                  <th className="px-3 py-2 text-right">Ore</th>
                  <th className="px-3 py-2 text-right">Km</th>
                  <th className="px-3 py-2 text-right">Cons.(L)</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {workOrders.length ? workOrders.map(wo => (
                  <tr key={wo.id}>
                    <td className="px-3 py-2">{wo.date}</td>
                    <td className="px-3 py-2 font-medium">{wo.asset_name}</td>
                    <td className="px-3 py-2">{wo.operator || '—'}</td>
                    <td className="px-3 py-2">
                      <div>{wo.activitate || '—'}</div>
                      {wo.locatie ? <div className="text-xs text-slate-400">{wo.locatie}</div> : null}
                    </td>
                    <td className="px-3 py-2 text-right">{wo.ore_lucrate || '—'}</td>
                    <td className="px-3 py-2 text-right">{wo.km_parcursi || '—'}</td>
                    <td className="px-3 py-2 text-right">{wo.consum_carburant || '—'}</td>
                    <td className="px-3 py-2"><Badge tone={statusTone(wo.status)}>{statusLabel(wo.status)}</Badge></td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        {wo.status === 'deschis' ? <button className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100" onClick={() => closeWorkOrder(wo.id)}>✅ Închide</button> : null}
                        <button className="text-xs text-primary-600 hover:underline" onClick={() => { setWoEditing(wo); setWoForm({ ...wo }); setWoModal(true) }}>✏️</button>
                        <button className="text-xs text-rose-500 hover:underline" onClick={() => deleteWorkOrder(wo.id)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan="9" className="px-3 py-8 text-center text-sm text-slate-400">Niciun bon de lucru pentru {woLuna}.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* ── ALIMENTĂRI ───────────────────────────────────────────────────────── */}
      {activeTab === 'Alimentări' ? (
        <div className="grid gap-4">
          <Card>
            <div className="flex flex-wrap items-end gap-3">
              <Input label="Luna" type="month" value={fuelLuna} onChange={e => setFuelLuna(e.target.value)} />
              <Button onClick={() => { setFuelForm({ ...emptyFuelForm }); setFuelEditing(null); setFuelModal(true) }}>+ Alimentare</Button>
              <DropdownMenu label="Export" items={[{ label: 'Export Excel', onClick: () => exportExcel(
                fuelLogs.map(f => ({
                  'Data': f.data, 'Utilaj': f.asset_name, 'Document': f.nr_document,
                  'Furnizor': f.furnizor, 'Litri': f.cantitate_litri, 'Preț/l': f.pret_litru,
                  'Valoare': f.valoare_totala, 'Km/Ore': f.km_ore, 'Operator': f.sofer_operator,
                })),
                `Alimentari_${fuelLuna}`
              ) }]} />
              <div className="ml-auto text-sm text-slate-500">
                Total: <strong className="text-slate-800">{Number(fuelTotals.cantitate_litri || 0).toFixed(2)} L</strong>
                <span className="mx-2">·</span>
                <strong className="text-slate-800">{Number(fuelTotals.valoare_totala || 0).toFixed(2)} RON</strong>
              </div>
            </div>
          </Card>

          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Utilaj</th>
                  <th className="px-3 py-2">Document / Furnizor</th>
                  <th className="px-3 py-2 text-right">Litri</th>
                  <th className="px-3 py-2 text-right">Preț/l</th>
                  <th className="px-3 py-2 text-right">Valoare</th>
                  <th className="px-3 py-2 text-right">Km/Ore</th>
                  <th className="px-3 py-2">Operator</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {fuelLogs.length ? fuelLogs.map(f => (
                  <tr key={f.id}>
                    <td className="px-3 py-2">{f.data}</td>
                    <td className="px-3 py-2 font-medium">{f.asset_name}</td>
                    <td className="px-3 py-2">
                      <div>{f.nr_document || '—'}</div>
                      <div className="text-xs text-slate-400">{f.furnizor || '—'}</div>
                    </td>
                    <td className="px-3 py-2 text-right">{Number(f.cantitate_litri || 0).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">{f.pret_litru ? Number(f.pret_litru).toFixed(2) : '—'}</td>
                    <td className="px-3 py-2 text-right font-semibold">{Number(f.valoare_totala || 0).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">{f.km_ore || '—'}</td>
                    <td className="px-3 py-2">{f.sofer_operator || '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button className="text-xs text-primary-600 hover:underline" onClick={() => { setFuelEditing(f); setFuelForm({ ...f }); setFuelModal(true) }}>✏️</button>
                        <button className="text-xs text-rose-500 hover:underline" onClick={() => deleteFuelLog(f.id)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan="9" className="px-3 py-8 text-center text-sm text-slate-400">Nicio alimentare în {fuelLuna}.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* ── ALIMENTĂRI PIUSI ────────────────────────────────────────────────── */}
      {activeTab === 'Alimentări PIUSI' ? (
        <div className="grid gap-4">
          <Card>
            <div className="flex flex-wrap items-end gap-3">
              <Input label="De la" type="date" value={piusiFilters.de_la} onChange={e => setPiusiFilters(f => ({ ...f, de_la: e.target.value }))} />
              <Input label="Până la" type="date" value={piusiFilters.pana_la} onChange={e => setPiusiFilters(f => ({ ...f, pana_la: e.target.value }))} />
              <Select label="Utilaj / Vehicul" value={piusiFilters.asset_id} onChange={e => setPiusiFilters(f => ({ ...f, asset_id: e.target.value }))} options={assetOptions} />
              <Select label="Procesat" value={piusiFilters.procesat} onChange={e => setPiusiFilters(f => ({ ...f, procesat: e.target.value }))} options={[
                { value: '', label: 'Toate' },
                { value: 'false', label: 'Neprocesate' },
                { value: 'true', label: 'Procesate' },
              ]} />
              <Button onClick={importPiusiInFaz}>📥 Import în FAZ</Button>
              <DropdownMenu label="Actiuni" items={[{ label: 'Reincarca', onClick: loadPiusiFuelRows }]} />
            </div>
          </Card>

          {piusiReport ? (
            <div className="grid gap-3 md:grid-cols-3">
              <Card className="text-center">
                <div className="text-2xl font-bold text-slate-900">{Number(piusiReport.totals?.piusi_litri || 0).toFixed(2)} L</div>
                <div className="text-xs text-slate-500">PIUSI pompă</div>
              </Card>
              <Card className="text-center">
                <div className="text-2xl font-bold text-slate-900">{Number(piusiReport.totals?.faz_litri || 0).toFixed(2)} L</div>
                <div className="text-xs text-slate-500">FAZ / alimentări</div>
              </Card>
              <Card className="text-center">
                <div className={`text-2xl font-bold ${Number(piusiReport.totals?.diferenta_litri || 0) ? 'text-rose-600' : 'text-green-700'}`}>{Number(piusiReport.totals?.diferenta_litri || 0).toFixed(2)} L</div>
                <div className="text-xs text-slate-500">Diferență</div>
              </Card>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Data / Ora</th>
                  <th className="px-3 py-2">Vehicul</th>
                  <th className="px-3 py-2">Cod PIUSI</th>
                  <th className="px-3 py-2 text-right">Cantitate</th>
                  <th className="px-3 py-2 text-right">Odometru</th>
                  <th className="px-3 py-2">Cheie</th>
                  <th className="px-3 py-2">Procesat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {piusiFuelRows.length ? piusiFuelRows.map(row => (
                  <tr key={row.id || row.piusi_id_prog}>
                    <td className="px-3 py-2">
                      <div>{String(row.data_ora || '').slice(0, 10)}</div>
                      <div className="text-xs text-slate-400">{String(row.data_ora || '').slice(11, 16)}</div>
                    </td>
                    <td className="px-3 py-2">
                      {row.asset_id ? assetOptions.find(opt => String(opt.value) === String(row.asset_id))?.label || row.asset_id : <span className="text-rose-600">Nemapat</span>}
                    </td>
                    <td className="px-3 py-2">{row.operator_cod || '—'}</td>
                    <td className="px-3 py-2 text-right font-semibold">{Number(row.cantitate_litri || 0).toFixed(2)} L</td>
                    <td className="px-3 py-2 text-right">{row.odometru || '—'}</td>
                    <td className="px-3 py-2">{row.serial_cheie || '—'}</td>
                    <td className="px-3 py-2">
                      {row.procesat ? <Badge tone="success">FAZ</Badge> : row.asset_id ? <Badge tone="warning">pending</Badge> : <Badge tone="danger">nemapat</Badge>}
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan="7" className="px-3 py-8 text-center text-sm text-slate-400">Nu există alimentări PIUSI pentru filtrul ales.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* ── INTERVENȚII ───────────────────────────────────────────────────────── */}
      {activeTab === 'Intervenții' ? (
        <div className="grid gap-4">
          <Card>
            <div className="flex flex-wrap items-end gap-3">
              <Button onClick={() => { setIntForm({ ...emptyIntForm }); setIntEditing(null); setIntModal(true) }}>+ Intervenție nouă</Button>
              <DropdownMenu label="Export" items={[{ label: 'Export Excel', onClick: () => exportExcel(
                interventions.map(i => ({
                  'Utilaj': i.asset_name, 'Tip': i.tip, 'Dată intrare': i.data_intrare,
                  'Dată ieșire': i.data_iesire || '—', 'Descriere': i.descriere,
                  'Piese (RON)': i.cost_piese, 'Manoperă (RON)': i.cost_manopera,
                  'Extern (RON)': i.cost_extern, 'Cost total (RON)': i.cost_total || i.cost,
                  'Furnizor': i.furnizor, 'Factură': i.nr_factura, 'Mecanic': i.mecanic, 'Status': i.status,
                })),
                `Interventii_${currentMonth()}`
              ) }]} />
              <div className="flex gap-2 ml-auto text-sm text-slate-500 items-end">
                <span>Total service: <strong className="text-slate-800">{interventions.reduce((s, i) => s + (Number(i.cost_total || i.cost) || 0), 0).toFixed(2)} RON</strong></span>
                <span>În lucru: <strong className="text-rose-600">{interventions.filter(i => i.status === 'in_lucru').length}</strong></span>
              </div>
            </div>
          </Card>

          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Utilaj</th>
                  <th className="px-3 py-2">Tip</th>
                  <th className="px-3 py-2">Intrare</th>
                  <th className="px-3 py-2">Ieșire</th>
                  <th className="px-3 py-2">Descriere</th>
                  <th className="px-3 py-2">Mecanic</th>
                  <th className="px-3 py-2 text-right">Cost</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {interventions.length ? interventions.map(i => (
                  <tr key={i.id} className={i.status === 'in_lucru' ? 'bg-amber-50/30' : ''}>
                    <td className="px-3 py-2 font-medium">{i.asset_name}</td>
                    <td className="px-3 py-2"><Badge tone={i.tip === 'accident' ? 'danger' : i.tip === 'revizie' ? 'primary' : 'neutral'}>{i.tip}</Badge></td>
                    <td className="px-3 py-2">{i.data_intrare}</td>
                    <td className="px-3 py-2">{i.data_iesire || '—'}</td>
                    <td className="px-3 py-2 max-w-xs truncate text-slate-600">{i.descriere || '—'}</td>
                    <td className="px-3 py-2">{i.mecanic || '—'}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      {i.cost_total || i.cost ? `${Number(i.cost_total || i.cost).toFixed(2)} RON` : '—'}
                      {i.nr_factura ? <div className="text-xs text-slate-400">{i.nr_factura}</div> : null}
                    </td>
                    <td className="px-3 py-2"><Badge tone={statusTone(i.status)}>{statusLabel(i.status)}</Badge></td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        {i.status === 'in_lucru' ? <button className="rounded bg-green-50 px-2 py-1 text-xs text-green-700 hover:bg-green-100" onClick={() => closeIntervention(i.id)}>✅ Finalizat</button> : null}
                        <button className="text-xs text-primary-600 hover:underline" onClick={() => { setIntEditing(i); setIntForm({ ...i }); setIntModal(true) }}>✏️</button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan="9" className="px-3 py-8 text-center text-sm text-slate-400">Nicio intervenție înregistrată.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* ── REVIZII PREDICTIVE ───────────────────────────────────────────────── */}
      {activeTab === 'Revizii predictive' ? (
        <div className="grid gap-4">
          <Card>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-800">Revizii cu calcul predictiv</div>
                <div className="text-sm text-slate-500">Scadențe calculate din ultima revizie, dată, contor și intervale salvate pe utilaj.</div>
              </div>
              <DropdownMenu label="Actiuni" items={[{ label: 'Reincarca', onClick: loadRevisions }]} />
            </div>
          </Card>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Utilaj</th>
                  <th className="px-3 py-2 text-right">Contor curent</th>
                  <th className="px-3 py-2">Ultima revizie</th>
                  <th className="px-3 py-2">Următoarea revizie</th>
                  <th className="px-3 py-2 text-right">Rămas</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {revisionRows.length ? revisionRows.map(r => (
                  <tr key={r.asset_id}>
                    <td className="px-3 py-2 font-medium">{r.asset_name}</td>
                    <td className="px-3 py-2 text-right">{r.current_meter || '—'} {r.meter_unit}</td>
                    <td className="px-3 py-2">
                      <div>{r.last_revision_date || '—'}</div>
                      {r.last_revision_meter ? <div className="text-xs text-slate-400">{r.last_revision_meter} {r.meter_unit}</div> : null}
                    </td>
                    <td className="px-3 py-2">
                      <div>{r.next_service_date || '—'}</div>
                      {r.next_service_meter ? <div className="text-xs text-slate-400">{r.next_service_meter} {r.meter_unit}</div> : null}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.remaining_days !== null && r.remaining_days !== undefined ? <div className={alertColor(r.remaining_days)}>{r.remaining_days < 0 ? `${Math.abs(r.remaining_days)} zile depășit` : `${r.remaining_days} zile`}</div> : null}
                      {r.remaining_meter !== null && r.remaining_meter !== undefined ? <div className={r.remaining_meter <= 0 ? 'text-rose-700 font-semibold' : 'text-slate-500'}>{r.remaining_meter} {r.meter_unit}</div> : null}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={r.status === 'scadent' ? 'danger' : r.status === 'curand' ? 'warning' : 'success'}>
                        {r.status === 'scadent' ? 'Scadent' : r.status === 'curand' ? 'În curând' : 'OK'}
                      </Badge>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan="6" className="px-3 py-8 text-center text-sm text-slate-400">Nu există date pentru calculul reviziilor.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* ── ALERTE & ISCIR ───────────────────────────────────────────────────── */}
      {activeTab === 'Alerte & ISCIR' ? (
        <div className="grid gap-4">
          <Card>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-800">Alerte documente, revizii și ISCIR</div>
                <div className="text-sm text-slate-500">Afișează scadențele sub 30 de zile și reviziile depășite la contor.</div>
              </div>
              <DropdownMenu label="Actiuni" items={[{ label: 'Reincarca', onClick: loadMechanizationAlerts }]} />
            </div>
          </Card>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Utilaj</th>
                  <th className="px-3 py-2">Alertă</th>
                  <th className="px-3 py-2">Scadență</th>
                  <th className="px-3 py-2">Contor</th>
                  <th className="px-3 py-2">Severitate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mechanizationAlerts.length ? mechanizationAlerts.map((a, idx) => (
                  <tr key={`${a.asset_id}-${a.type}-${idx}`}>
                    <td className="px-3 py-2 font-medium">{a.asset_name}</td>
                    <td className="px-3 py-2">{a.label}</td>
                    <td className={`px-3 py-2 ${alertColor(a.days)}`}>
                      {a.date ? `${a.date} (${a.days < 0 ? 'expirat' : `${a.days} zile`})` : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {a.meter ? `${a.current_meter || 0} / ${a.meter} ${a.meter_unit || ''}` : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={a.severity === 'expirat' || a.severity === 'critic' ? 'danger' : 'warning'}>{a.severity || 'warning'}</Badge>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan="5" className="px-3 py-8 text-center text-sm text-slate-400">Nu există alerte active.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* ── SCADENȚE & ASIGURĂRI ────────────────────────────────────────────── */}
      {activeTab === 'Scadențe & Asigurări' ? (
        <div className="grid gap-4">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-800">Scadențe documente flotă</div>
                <div className="text-sm text-slate-500">RCA/CASCO, ITP, taxe, rovignete și autorizații ISCIR pentru autovehicule și utilaje.</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => openFleetDoc('asigurare')}>+ RCA/CASCO</Button>
                <DropdownMenu align="right" label="Actiuni" items={[
                  { label: 'Adauga ITP', onClick: () => openFleetDoc('itp') },
                  { label: 'Adauga taxa', onClick: () => openFleetDoc('taxa') },
                  { label: 'Adauga ISCIR', onClick: () => openFleetDoc('iscir') },
                  { separator: true },
                  { label: 'Reincarca', onClick: loadScadente },
                ]} />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-1 border-t border-slate-100 pt-3">
              {scadenteTabs.map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setScadenteSubtab(tab)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium ${scadenteSubtab === tab ? 'bg-primary-600 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </Card>

          {scadenteSubtab === 'Expirări' ? (
            <div className="grid gap-3 xl:grid-cols-4">
              {[
                { key: 'expirate', title: '🔴 Expirate', tone: 'border-rose-200 bg-rose-50' },
                { key: 'curand_7_zile', title: '🟠 Expiră în 7 zile', tone: 'border-orange-200 bg-orange-50' },
                { key: 'curand_30_zile', title: '🟡 Expiră în 30 zile', tone: 'border-amber-200 bg-amber-50' },
                { key: 'curand_60_zile', title: '🟢 Expiră în 60 zile', tone: 'border-emerald-200 bg-emerald-50' },
              ].map(group => (
                <div key={group.key} className={`rounded-xl border p-3 ${group.tone}`}>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="font-semibold text-slate-800">{group.title}</div>
                    <Badge tone={group.key === 'expirate' ? 'danger' : group.key === 'curand_7_zile' ? 'warning' : 'neutral'}>{(scadente?.[group.key] || []).length}</Badge>
                  </div>
                  <div className="grid gap-2">
                    {(scadente?.[group.key] || []).length ? scadente[group.key].map(item => (
                      <div key={item.id} className="rounded-lg border border-white/70 bg-white p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-semibold text-slate-900">{item.tip}</div>
                            <div className="text-sm text-slate-600">{item.asset}</div>
                          </div>
                          <Badge tone={item.urgent ? 'danger' : 'warning'}>{item.zile <= 0 ? 'urgent' : `${item.zile} zile`}</Badge>
                        </div>
                        <div className="mt-2 text-xs text-slate-500">
                          Scadență: <strong>{item.data}</strong>
                          {item.asigurator ? <span> · {item.asigurator}</span> : null}
                          {item.furnizor ? <span> · {item.furnizor}</span> : null}
                        </div>
                        <button
                          type="button"
                          className="mt-3 text-xs font-semibold text-primary-700 hover:underline"
                          onClick={() => openFleetDoc(item.category === 'asigurare' ? 'asigurare' : item.category, { asset_id: item.asset_id, tip: item.tip })}
                        >
                          Reînnoiește
                        </button>
                      </div>
                    )) : (
                      <div className="rounded-lg border border-dashed border-white/80 bg-white/70 p-4 text-center text-sm text-slate-400">Nicio scadență.</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {scadenteSubtab !== 'Expirări' && scadenteSubtab !== 'Raport' ? (
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-800">{scadenteSubtab}</div>
                  <div className="text-sm text-slate-500">Adaugă rapid documente noi. Lista completă apare în panoul de expirări în funcție de scadență.</div>
                </div>
                <Button onClick={() => openFleetDoc(scadenteSubtab === 'RCA/CASCO' ? 'asigurare' : scadenteSubtab === 'ITP' ? 'itp' : scadenteSubtab === 'Taxe' ? 'taxa' : 'iscir')}>
                  + Înregistrare nouă
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                {assets.slice(0, 8).map(asset => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => openFleetDoc(scadenteSubtab === 'RCA/CASCO' ? 'asigurare' : scadenteSubtab === 'ITP' ? 'itp' : scadenteSubtab === 'Taxe' ? 'taxa' : 'iscir', { asset_id: asset.id })}
                    className="rounded-lg border border-slate-200 bg-white p-3 text-left text-sm hover:border-primary-300 hover:bg-primary-50"
                  >
                    <div className="font-semibold text-slate-800">{asset.name || asset.registration || asset.cod}</div>
                    <div className="text-xs text-slate-500">{asset.registration || asset.cod || 'Fără număr'}</div>
                  </button>
                ))}
              </div>
            </Card>
          ) : null}

          {scadenteSubtab === 'Raport' ? (
            <Card>
              <div className="mb-3 font-semibold text-slate-800">Rapoarte autoMinder</div>
              <DropdownMenu label="Export" items={[
                { label: 'Export asigurari', onClick: () => downloadFleetReport('/fleet/raport-asigurari', `Raport_asigurari_${new Date().getFullYear()}.xlsx`) },
                { label: 'Export ITP', onClick: () => downloadFleetReport('/fleet/raport-itp', `Raport_ITP_${new Date().getFullYear()}.xlsx`) },
                { label: 'Plan reinnoire anual', onClick: () => downloadFleetReport('/fleet/raport-scadente-anuale', `Plan_reinnoire_${new Date().getFullYear()}.xlsx`) },
              ]} />
            </Card>
          ) : null}
        </div>
      ) : null}

      {/* ── COST/ORĂ ─────────────────────────────────────────────────────────── */}
      {activeTab === 'Cost/oră' ? (
        <div className="grid gap-4">
          <Card>
            <div className="flex flex-wrap items-end gap-3">
              <Input label="Luna" type="month" value={costLuna} onChange={e => setCostLuna(e.target.value)} />
              <Button onClick={loadCostHour}>Calculează</Button>
              {costHour ? (
                <DropdownMenu label="Export" items={[{
                  label: 'Export Excel',
                  onClick: () => exportExcel(
                    (costHour.rows || []).map(r => ({
                      'Utilaj': r.asset_name, 'Ore': r.ore_total,
                      'Cost carburant': r.cost_carburant, 'Cost reparații': r.cost_reparatii,
                      'Cost total': r.cost_total, 'Cost/oră': r.cost_ora,
                    })),
                    `CostOra_${costLuna}`
                  ),
                }]} />
              ) : null}
            </div>
          </Card>
          {costHour ? (
            <>
              <div className="grid gap-3 sm:grid-cols-4">
                {[
                  { label: 'Ore total', value: Number(costHour.totals?.ore_total || 0).toFixed(1), icon: '⏱️' },
                  { label: 'Carburant', value: Number(costHour.totals?.cost_carburant || 0).toFixed(2) + ' RON', icon: '⛽' },
                  { label: 'Reparații', value: Number(costHour.totals?.cost_reparatii || 0).toFixed(2) + ' RON', icon: '🔧' },
                  { label: 'Cost/oră mediu', value: Number(costHour.totals?.cost_ora || 0).toFixed(2) + ' RON', icon: '💰' },
                ].map(k => (
                  <Card key={k.label} className="text-center">
                    <div className="text-xl">{k.icon}</div>
                    <div className="text-2xl font-bold text-slate-900">{k.value}</div>
                    <div className="text-xs text-slate-500">{k.label}</div>
                  </Card>
                ))}
              </div>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Utilaj</th>
                      <th className="px-3 py-2 text-right">Ore</th>
                      <th className="px-3 py-2 text-right">Carburant</th>
                      <th className="px-3 py-2 text-right">Reparații</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2 text-right">Cost/oră</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(costHour.rows || []).map(r => (
                      <tr key={r.asset_id}>
                        <td className="px-3 py-2 font-medium">{r.asset_name}</td>
                        <td className="px-3 py-2 text-right">{Number(r.ore_total || 0).toFixed(1)}</td>
                        <td className="px-3 py-2 text-right">{Number(r.cost_carburant || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">{Number(r.cost_reparatii || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-semibold">{Number(r.cost_total || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-primary-700">{Number(r.cost_ora || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-16 text-sm text-slate-400">
              ↑ Alege luna și apasă Calculează
            </div>
          )}
        </div>
      ) : null}

      {/* ── FAZ LUNAR ────────────────────────────────────────────────────────── */}
      {activeTab === 'FAZ Lunar' ? (
        <div className="grid gap-4">
          <Card>
            <div className="flex flex-wrap items-end gap-3">
              <Input label="Luna" type="month" value={fazLuna} onChange={e => setFazLuna(e.target.value)} />
              <Select label="Utilaj / Vehicul" value={fazAssetId} onChange={e => setFazAssetId(e.target.value)} options={assetOptions} />
              <Button onClick={loadFazReport}>Previzualizează</Button>
              {fazReport ? (
                <>
                  <Button onClick={generateMechanizationFaz}>🖨️ Generează / Print</Button>
                </>
              ) : null}
              <DropdownMenu label="Actiuni" items={[
                { label: 'Registru FAZ', onClick: () => navigate('/faz-utilaje') },
                fazReport ? {
                  label: 'Export Excel',
                  onClick: () => exportExcel(
                    (fazReport.rows || []).map(r => ({
                      'Data': r.data,
                      'Utilaj': r.asset_name,
                      'Operator': r.operator,
                      'Activitate': r.activitate,
                      'Locație': r.locatie,
                      'Ore LE': r.ore_lucru_efectiv,
                      'Km': r.km_parcursi,
                      'Motorină reală': r.motorina_l,
                      'Alimentări': r.alimentari_l,
                      'Consum normat': r.consum_normat,
                      'Diferență': r.diferenta_motorina,
                      'Cost carburant': r.cost_carburant,
                      'Cost service': r.cost_service,
                    })),
                    `FAZ_Mecanizare_${fazLuna}`
                  ),
                } : null,
              ]} />
              {fazReport?.generated ? (
                <span className="ml-auto text-xs text-slate-500">
                  Ultima generare: {new Date(fazReport.generated.generated_at).toLocaleString('ro-RO')}
                </span>
              ) : null}
            </div>
          </Card>

          {fazReport ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  { label: 'Bonuri incluse', value: (fazReport.rows || []).length, icon: '🧾' },
                  { label: 'Ore LE', value: Number(fazReport.totals?.ore_lucru_efectiv || 0).toFixed(2), icon: '⏱️' },
                  { label: 'Km', value: Number(fazReport.totals?.km_parcursi || 0).toFixed(2), icon: '🛣️' },
                  { label: 'Motorină reală', value: Number(fazReport.totals?.motorina_l || 0).toFixed(2) + ' L', icon: '⛽' },
                  { label: 'Diferență normat', value: Number(fazReport.totals?.diferenta_motorina || 0).toFixed(2) + ' L', icon: '📊', tone: Number(fazReport.totals?.diferenta_motorina || 0) > 0 ? 'rose' : '' },
                ].map(k => (
                  <Card key={k.label} className="text-center">
                    <div className="text-xl">{k.icon}</div>
                    <div className={`text-2xl font-bold ${k.tone === 'rose' ? 'text-rose-600' : 'text-slate-900'}`}>{k.value}</div>
                    <div className="text-xs text-slate-500">{k.label}</div>
                  </Card>
                ))}
              </div>

              <Card>
                <div className="grid gap-3 text-sm md:grid-cols-4">
                  <div>Alimentări: <strong>{Number(fazReport.totals?.alimentari_l || 0).toFixed(2)} L</strong></div>
                  <div>Consum normat: <strong>{Number(fazReport.totals?.consum_normat || 0).toFixed(2)} L</strong></div>
                  <div>Cost carburant: <strong>{Number(fazReport.totals?.cost_carburant || 0).toFixed(2)} RON</strong></div>
                  <div>Cost service: <strong>{Number(fazReport.totals?.cost_service || 0).toFixed(2)} RON</strong></div>
                </div>
              </Card>

              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Data</th>
                      <th className="px-3 py-2 text-left">Utilaj</th>
                      <th className="px-3 py-2 text-left">Operator</th>
                      <th className="px-3 py-2 text-left">Activitate / Locație</th>
                      <th className="px-3 py-2 text-right">Ore</th>
                      <th className="px-3 py-2 text-right">Km</th>
                      <th className="px-3 py-2 text-right">Motorină</th>
                      <th className="px-3 py-2 text-right">Normat</th>
                      <th className="px-3 py-2 text-right">Dif.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(fazReport.rows || []).length ? fazReport.rows.map(row => (
                      <tr key={`${row.data}-${row.asset_id}-${row.nr}`}>
                        <td className="px-3 py-2">{row.data}</td>
                        <td className="px-3 py-2 font-medium">{row.asset_name}</td>
                        <td className="px-3 py-2">{row.operator || '—'}</td>
                        <td className="px-3 py-2">
                          <div>{row.activitate || '—'}</div>
                          {row.locatie ? <div className="text-xs text-slate-400">{row.locatie}</div> : null}
                        </td>
                        <td className="px-3 py-2 text-right">{Number(row.ore_lucru_efectiv || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">{Number(row.km_parcursi || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">{Number(row.motorina_l || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">{Number(row.consum_normat || 0).toFixed(2)}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${Number(row.diferenta_motorina || 0) > 0 ? 'text-rose-600' : 'text-green-700'}`}>
                          {Number(row.diferenta_motorina || 0).toFixed(2)}
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan="9" className="px-3 py-8 text-center text-sm text-slate-400">Nu există bonuri de lucru pentru FAZ în {fazLuna}.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-16 text-sm text-slate-400">
              ↑ Alege luna și apasă Previzualizează
            </div>
          )}
        </div>
      ) : null}

      {/* ── RAPORT LUNAR ─────────────────────────────────────────────────────── */}
      {activeTab === 'Raport Lunar' ? (
        <div className="grid gap-4">
          <Card>
            <div className="flex flex-wrap items-end gap-3">
              <Input label="Luna" type="month" value={raportLuna} onChange={e => setRaportLuna(e.target.value)} />
              <Button onClick={loadRaport}>📊 Generează</Button>
              {raport ? (
                <DropdownMenu label="Actiuni raport" items={[
                  { label: 'Print / PDF', onClick: printRaport },
                  {
                    label: 'Export Excel',
                    onClick: () => exportExcel(
                      (raport.rows || []).map(r => ({
                        'Utilaj': r.asset_name,
                        'Zile lucrate': r.zile_lucrate,
                        'Ore lucru': r.ore_total,
                        'Km parcurși': r.km_total,
                        'Consum real (L)': r.consum_total,
                        'Consum normat (L)': r.consum_normat_total,
                        'Diferență (L)': r.diferenta_consum,
                        'Cost carburant': r.cost_carburant,
                        'Cost service': r.cost_service,
                        'Cost/oră': r.cost_ora,
                      })),
                      `RaportMecanizare_${raportLuna}`
                    ),
                  },
                ]} />
              ) : null}
            </div>
          </Card>

          {raport ? (
            <>
              {/* Summary cards */}
              <div className="grid gap-3 sm:grid-cols-4">
                {[
                  { label: 'Utilaje active', value: raport.rows.length, icon: '🏗️' },
                  { label: 'Total ore lucru', value: raport.totals.ore_total.toFixed(1) + 'h', icon: '⏱️' },
                  { label: 'Total km', value: raport.totals.km_total.toFixed(0), icon: '🛣️' },
                  { label: 'Cost service', value: raport.costService.toFixed(2) + ' RON', icon: '🔧', tone: raport.costService > 0 ? 'rose' : '' },
                  { label: 'Cost/oră mediu', value: Number(raport.totals.cost_ora || 0).toFixed(2) + ' RON', icon: '💰' },
                ].map(k => (
                  <Card key={k.label} className="text-center">
                    <div className="text-xl">{k.icon}</div>
                    <div className={`text-2xl font-bold ${k.tone === 'rose' ? 'text-rose-600' : 'text-slate-900'}`}>{k.value}</div>
                    <div className="text-xs text-slate-500">{k.label}</div>
                  </Card>
                ))}
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Utilaj / Vehicul</th>
                      <th className="px-3 py-2 text-right">Zile lucrate</th>
                      <th className="px-3 py-2 text-right">Ore lucru</th>
                      <th className="px-3 py-2 text-right">Km parcurși</th>
                      <th className="px-3 py-2 text-right">Cons. real (L)</th>
                      <th className="px-3 py-2 text-right">Cons. normat (L)</th>
                      <th className="px-3 py-2 text-right">Diferență (L)</th>
                      <th className="px-3 py-2 text-right">Cost/oră</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {raport.rows.map(r => (
                      <tr key={r.asset_id}>
                        <td className="px-3 py-2 font-medium text-slate-800">{r.asset_name}</td>
                        <td className="px-3 py-2 text-right">{r.zile_lucrate}</td>
                        <td className="px-3 py-2 text-right">{r.ore_total.toFixed(1)}</td>
                        <td className="px-3 py-2 text-right">{r.km_total.toFixed(0)}</td>
                        <td className="px-3 py-2 text-right">{r.consum_total.toFixed(1)}</td>
                        <td className="px-3 py-2 text-right">{r.consum_normat_total.toFixed(1)}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${r.diferenta_consum > 0 ? 'text-rose-600' : 'text-green-700'}`}>
                          {r.diferenta_consum > 0 ? '+' : ''}{r.diferenta_consum.toFixed(1)}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-primary-700">{Number(r.cost_ora || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                    {/* Totals */}
                    <tr className="bg-slate-100 font-semibold text-slate-900">
                      <td className="px-3 py-2">TOTAL</td>
                      <td className="px-3 py-2 text-right">{raport.totals.zile_lucrate}</td>
                      <td className="px-3 py-2 text-right">{raport.totals.ore_total.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right">{raport.totals.km_total.toFixed(0)}</td>
                      <td className="px-3 py-2 text-right">{raport.totals.consum_total.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right">{raport.totals.consum_normat_total.toFixed(1)}</td>
                      <td className={`px-3 py-2 text-right ${raport.totals.diferenta_consum > 0 ? 'text-rose-600' : 'text-green-700'}`}>
                        {raport.totals.diferenta_consum > 0 ? '+' : ''}{raport.totals.diferenta_consum.toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-right">{Number(raport.totals.cost_ora || 0).toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Service table */}
              {raport.interventionsInMonth.length > 0 ? (
                <Card>
                  <div className="mb-3 text-sm font-semibold text-slate-700">🔧 Intervenții în {raportLuna} — total: {raport.costService.toFixed(2)} RON</div>
                  <div className="overflow-hidden rounded-lg border border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                          <th className="px-3 py-2 text-left">Utilaj</th>
                          <th className="px-3 py-2 text-left">Tip</th>
                          <th className="px-3 py-2 text-left">Intrare / Ieșire</th>
                          <th className="px-3 py-2 text-left">Descriere</th>
                          <th className="px-3 py-2 text-right">Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {raport.interventionsInMonth.map(i => (
                          <tr key={i.id}>
                            <td className="px-3 py-2 font-medium">{i.asset_name}</td>
                            <td className="px-3 py-2">{i.tip}</td>
                            <td className="px-3 py-2">{i.data_intrare} — {i.data_iesire || '…'}</td>
                            <td className="px-3 py-2 text-slate-500">{i.descriere || '—'}</td>
                            <td className="px-3 py-2 text-right font-semibold">{i.cost ? `${i.cost} RON` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              ) : null}
            </>
          ) : (
            <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-16 text-sm text-slate-400">
              ↑ Alege luna și apasă Generează
            </div>
          )}
        </div>
      ) : null}

      {/* ── MODAL DOCUMENT FLOTĂ ─────────────────────────────────────────────── */}
      <Modal open={fleetDocModal} title={
        fleetDocKind === 'asigurare' ? 'Poliță asigurare nouă' :
        fleetDocKind === 'itp' ? 'Inspecție ITP nouă' :
        fleetDocKind === 'taxa' ? 'Taxă / Rovignetă nouă' :
        'Autorizație ISCIR nouă'
      } onClose={() => setFleetDocModal(false)} size="lg">
        <form className="grid gap-3" onSubmit={saveFleetDoc}>
          <div className="grid gap-3 md:grid-cols-2">
            <Select label="Utilaj / Vehicul" value={fleetDocForm.asset_id} onChange={e => setFleetDocForm({ ...fleetDocForm, asset_id: e.target.value })} options={assetOptions} required />

            {fleetDocKind === 'asigurare' ? (
              <>
                <Select label="Tip poliță" value={fleetDocForm.tip} onChange={e => setFleetDocForm({ ...fleetDocForm, tip: e.target.value })} options={[
                  { value: 'RCA', label: 'RCA' },
                  { value: 'CASCO', label: 'CASCO' },
                  { value: 'CMR', label: 'CMR' },
                  { value: 'carte_verde', label: 'Carte verde' },
                  { value: 'alta', label: 'Altă asigurare' },
                ]} />
                <Input label="Asigurator" value={fleetDocForm.asigurator} onChange={e => setFleetDocForm({ ...fleetDocForm, asigurator: e.target.value })} placeholder="ex: ALLIANZ, OMNIASIG" />
                <Input label="Nr. poliță" value={fleetDocForm.nr_polita} onChange={e => setFleetDocForm({ ...fleetDocForm, nr_polita: e.target.value })} />
                <Input label="Valoare primă (LEI)" type="number" step="0.01" value={fleetDocForm.valoare_prima} onChange={e => setFleetDocForm({ ...fleetDocForm, valoare_prima: e.target.value })} />
                <Input label="Valoare asigurată" type="number" step="0.01" value={fleetDocForm.valoare_asig} onChange={e => setFleetDocForm({ ...fleetDocForm, valoare_asig: e.target.value })} />
                <Input label="Valabil de la" type="date" value={fleetDocForm.valabila_de_la} onChange={e => setFleetDocForm({ ...fleetDocForm, valabila_de_la: e.target.value, data_expirarii: calcFleetDocExpiry(e.target.value, fleetDocForm.perioada_luni) })} required />
                <Input label="Perioadă (luni)" type="number" min="1" value={fleetDocForm.perioada_luni} onChange={e => setFleetDocForm({ ...fleetDocForm, perioada_luni: e.target.value, data_expirarii: calcFleetDocExpiry(fleetDocForm.valabila_de_la, e.target.value) })} />
                <Input label="Data expirării" type="date" value={fleetDocForm.data_expirarii} onChange={e => setFleetDocForm({ ...fleetDocForm, data_expirarii: e.target.value })} required />
                <Input label="Notificare în avans (zile)" type="number" min="1" value={fleetDocForm.notif_zile} onChange={e => setFleetDocForm({ ...fleetDocForm, notif_zile: e.target.value })} />
                <Select label="Clasa B/M" value={fleetDocForm.clasa_bm} onChange={e => setFleetDocForm({ ...fleetDocForm, clasa_bm: e.target.value })} options={['B1','B2','B3','B4','B5','B6','B7','B8','M1','M2','M3','M4','M5','M6','M7','M8'].map(v => ({ value: v, label: v }))} />
                <Input label="Carte verde posesor" value={fleetDocForm.carte_verde_pos} onChange={e => setFleetDocForm({ ...fleetDocForm, carte_verde_pos: e.target.value })} />
                <Input label="Carte verde data" type="date" value={fleetDocForm.carte_verde_data} onChange={e => setFleetDocForm({ ...fleetDocForm, carte_verde_data: e.target.value })} />
              </>
            ) : null}

            {fleetDocKind === 'itp' ? (
              <>
                <Input label="ITP planificat pe" type="date" value={fleetDocForm.planificat_pe} onChange={e => setFleetDocForm({ ...fleetDocForm, planificat_pe: e.target.value })} required />
                <Input label="Notificare în avans (zile)" type="number" min="1" value={fleetDocForm.notif_zile} onChange={e => setFleetDocForm({ ...fleetDocForm, notif_zile: e.target.value })} />
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <input type="checkbox" checked={fleetDocForm.executat} onChange={e => setFleetDocForm({ ...fleetDocForm, executat: e.target.checked })} />
                  ITP executat
                </label>
                <Input label="ITP executat pe" type="date" value={fleetDocForm.executat_pe} onChange={e => setFleetDocForm({ ...fleetDocForm, executat_pe: e.target.value })} />
                <Input label="Odometru la ITP" type="number" value={fleetDocForm.odometru_la_itp} onChange={e => setFleetDocForm({ ...fleetDocForm, odometru_la_itp: e.target.value })} />
                <Input label="Furnizor" value={fleetDocForm.furnizor} onChange={e => setFleetDocForm({ ...fleetDocForm, furnizor: e.target.value })} />
                <Input label="Valoare fără TVA" type="number" step="0.01" value={fleetDocForm.valoare_fara_tva} onChange={e => setFleetDocForm({ ...fleetDocForm, valoare_fara_tva: e.target.value })} />
                <Input label="TVA (%)" type="number" step="0.01" value={fleetDocForm.cota_tva} onChange={e => setFleetDocForm({ ...fleetDocForm, cota_tva: e.target.value })} />
                <Input label="Nr. factură" value={fleetDocForm.nr_factura} onChange={e => setFleetDocForm({ ...fleetDocForm, nr_factura: e.target.value })} />
                <Input label="Data factură" type="date" value={fleetDocForm.data_factura} onChange={e => setFleetDocForm({ ...fleetDocForm, data_factura: e.target.value })} />
                <Input label="Data scadență" type="date" value={fleetDocForm.data_scadenta} onChange={e => setFleetDocForm({ ...fleetDocForm, data_scadenta: e.target.value })} />
                <Select label="Rezultat" value={fleetDocForm.rezultat} onChange={e => setFleetDocForm({ ...fleetDocForm, rezultat: e.target.value })} options={[
                  { value: '', label: 'Necompletat' },
                  { value: 'admis', label: 'Admis' },
                  { value: 'respins', label: 'Respins' },
                ]} />
              </>
            ) : null}

            {fleetDocKind === 'taxa' ? (
              <>
                <Select label="Tip taxă" value={fleetDocForm.tip} onChange={e => setFleetDocForm({ ...fleetDocForm, tip: e.target.value })} options={[
                  { value: 'rovigneta', label: 'Rovignetă' },
                  { value: 'taxa_pod', label: 'Taxă pod' },
                  { value: 'taxa_drum', label: 'Taxă drum' },
                  { value: 'impozit_auto', label: 'Impozit auto' },
                  { value: 'alta', label: 'Altă taxă' },
                ]} />
                <Input label="Valabilă de la" type="date" value={fleetDocForm.valabila_de_la_taxa} onChange={e => setFleetDocForm({ ...fleetDocForm, valabila_de_la_taxa: e.target.value })} />
                <Input label="Data expirării" type="date" value={fleetDocForm.data_expirarii} onChange={e => setFleetDocForm({ ...fleetDocForm, data_expirarii: e.target.value })} required />
                <Input label="Notificare în avans (zile)" type="number" min="1" value={fleetDocForm.notif_zile} onChange={e => setFleetDocForm({ ...fleetDocForm, notif_zile: e.target.value })} />
                <Input label="Valoare (LEI)" type="number" step="0.01" value={fleetDocForm.valoare_prima} onChange={e => setFleetDocForm({ ...fleetDocForm, valoare_prima: e.target.value })} />
                <Input label="Nr. document" value={fleetDocForm.nr_document} onChange={e => setFleetDocForm({ ...fleetDocForm, nr_document: e.target.value })} />
              </>
            ) : null}

            {fleetDocKind === 'iscir' ? (
              <>
                <Select label="Tip autorizare" value={fleetDocForm.tip_autorizare} onChange={e => setFleetDocForm({ ...fleetDocForm, tip_autorizare: e.target.value })} options={[
                  { value: 'RSVTI', label: 'RSVTI' },
                  { value: 'verificare_periodica', label: 'Verificare periodică' },
                  { value: 'autorizare_initiala', label: 'Autorizare inițială' },
                ]} />
                <Input label="Nr. autorizare" value={fleetDocForm.nr_autorizare} onChange={e => setFleetDocForm({ ...fleetDocForm, nr_autorizare: e.target.value })} />
                <Input label="Data emitere" type="date" value={fleetDocForm.data_emitere} onChange={e => setFleetDocForm({ ...fleetDocForm, data_emitere: e.target.value })} />
                <Input label="Data expirării" type="date" value={fleetDocForm.data_expirarii} onChange={e => setFleetDocForm({ ...fleetDocForm, data_expirarii: e.target.value })} required />
                <Input label="Notificare în avans (zile)" type="number" min="1" value={fleetDocForm.notif_zile} onChange={e => setFleetDocForm({ ...fleetDocForm, notif_zile: e.target.value })} />
                <Input label="Inspector" value={fleetDocForm.inspector} onChange={e => setFleetDocForm({ ...fleetDocForm, inspector: e.target.value })} />
                <Input label="Organism" value={fleetDocForm.organism} onChange={e => setFleetDocForm({ ...fleetDocForm, organism: e.target.value })} />
              </>
            ) : null}

            <Input label="Fișier atașat (cale)" value={fleetDocForm.fisier_path} onChange={e => setFleetDocForm({ ...fleetDocForm, fisier_path: e.target.value })} placeholder="scan/polita.pdf" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Observații</label>
            <textarea className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" rows={3} value={fleetDocForm.observatii} onChange={e => setFleetDocForm({ ...fleetDocForm, observatii: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setFleetDocModal(false)}>Renunță</Button>
            <Button type="submit">Salvează</Button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL PLANIFICARE ────────────────────────────────────────────────── */}
      <Modal open={planModal} title={planEditing ? 'Editează planificare' : 'Planificare nouă'} onClose={() => { setPlanModal(false); setPlanEditing(null) }} size="lg">
        <form className="grid gap-3" onSubmit={savePlanning}>
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Data" type="date" value={planForm.date} onChange={e => setPlanForm({ ...planForm, date: e.target.value })} required />
            <Select label="Utilaj / Vehicul" value={planForm.asset_id} onChange={e => setPlanForm({ ...planForm, asset_id: e.target.value })} options={assetOptions} required />
            <Input label="Departament" value={planForm.department} onChange={e => setPlanForm({ ...planForm, department: e.target.value })} placeholder="ex: Asternere, Betoane…" />
            <Input label="Lucrare / Obiectiv" value={planForm.job_name} onChange={e => setPlanForm({ ...planForm, job_name: e.target.value })} placeholder="ex: DN7 km 12" />
            <Input label="Operator / Șofer" value={planForm.operator} onChange={e => setPlanForm({ ...planForm, operator: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <Input label="Ora start" type="time" value={planForm.ora_start} onChange={e => setPlanForm({ ...planForm, ora_start: e.target.value })} />
              <Input label="Ora final" type="time" value={planForm.ora_sfarsit} onChange={e => setPlanForm({ ...planForm, ora_sfarsit: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Observații</label>
            <textarea className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" rows={2} value={planForm.observatii} onChange={e => setPlanForm({ ...planForm, observatii: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => { setPlanModal(false); setPlanEditing(null) }}>Renunță</Button>
            <Button type="submit">{planEditing ? 'Actualizează' : 'Salvează'}</Button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL BON LUCRU ──────────────────────────────────────────────────── */}
      <Modal open={woModal} title={woEditing ? 'Editează bon de lucru' : 'Bon de lucru nou'} onClose={() => { setWoModal(false); setWoEditing(null) }} size="lg">
        <form className="grid gap-3" onSubmit={saveWorkOrder}>
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Data" type="date" value={woForm.date} onChange={e => setWoForm({ ...woForm, date: e.target.value })} required />
            <Select label="Utilaj / Vehicul" value={woForm.asset_id} onChange={e => setWoForm({ ...woForm, asset_id: e.target.value })} options={assetOptions} required />
            <Input label="Operator / Șofer" value={woForm.operator} onChange={e => setWoForm({ ...woForm, operator: e.target.value })} />
            <Input label="Activitate" value={woForm.activitate} onChange={e => setWoForm({ ...woForm, activitate: e.target.value })} placeholder="ex: Transport asfalt, Nivelare…" />
            <Input label="Locație" value={woForm.locatie} onChange={e => setWoForm({ ...woForm, locatie: e.target.value })} placeholder="ex: DN7 km 12" />
            <Input label="Ore lucrate" type="number" step="0.5" min="0" value={woForm.ore_lucrate} onChange={e => setWoForm({ ...woForm, ore_lucrate: e.target.value })} />
            <Input label="Km parcurși" type="number" min="0" value={woForm.km_parcursi} onChange={e => setWoForm({ ...woForm, km_parcursi: e.target.value })} />
            <Input label="Consum real (L)" type="number" step="0.1" min="0" value={woForm.consum_carburant} onChange={e => setWoForm({ ...woForm, consum_carburant: e.target.value })} />
            <Input label="Consum normat (L)" type="number" step="0.1" min="0" value={woForm.consum_normat} onChange={e => setWoForm({ ...woForm, consum_normat: e.target.value })} />
            <Select label="Centru cost" value={woForm.cost_center_id || ''} onChange={e => setWoForm({ ...woForm, cost_center_id: e.target.value })} options={costCenterOptions} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Observații</label>
            <textarea className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" rows={2} value={woForm.observatii} onChange={e => setWoForm({ ...woForm, observatii: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => { setWoModal(false); setWoEditing(null) }}>Renunță</Button>
            <Button type="submit">{woEditing ? 'Actualizează' : 'Salvează'}</Button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL ALIMENTARE ─────────────────────────────────────────────────── */}
      <Modal open={fuelModal} title={fuelEditing ? 'Editează alimentare' : 'Alimentare carburant'} onClose={() => { setFuelModal(false); setFuelEditing(null) }} size="lg">
        <form className="grid gap-3" onSubmit={saveFuelLog}>
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Data" type="date" value={fuelForm.data} onChange={e => setFuelForm({ ...fuelForm, data: e.target.value })} required />
            <Select label="Utilaj / Vehicul" value={fuelForm.asset_id} onChange={e => setFuelForm({ ...fuelForm, asset_id: e.target.value })} options={assetOptions} required />
            <Input label="Nr. document / bon" value={fuelForm.nr_document} onChange={e => setFuelForm({ ...fuelForm, nr_document: e.target.value })} />
            <Input label="Furnizor" value={fuelForm.furnizor} onChange={e => setFuelForm({ ...fuelForm, furnizor: e.target.value })} />
            <Input label="Cantitate (litri)" type="number" step="0.01" min="0" value={fuelForm.cantitate_litri} onChange={e => setFuelForm({ ...fuelForm, cantitate_litri: e.target.value })} required />
            <Input label="Preț/litru" type="number" step="0.01" min="0" value={fuelForm.pret_litru} onChange={e => setFuelForm({ ...fuelForm, pret_litru: e.target.value })} />
            <Input label="Valoare totală (RON)" type="number" step="0.01" min="0" value={fuelForm.valoare_totala} onChange={e => setFuelForm({ ...fuelForm, valoare_totala: e.target.value })} placeholder="se calculează automat dacă rămâne gol" />
            <Input label="Km/Ore la alimentare" type="number" step="0.1" min="0" value={fuelForm.km_ore} onChange={e => setFuelForm({ ...fuelForm, km_ore: e.target.value })} />
            <Input label="Șofer / Operator" value={fuelForm.sofer_operator} onChange={e => setFuelForm({ ...fuelForm, sofer_operator: e.target.value })} />
            <Select label="Centru cost" value={fuelForm.cost_center_id || ''} onChange={e => setFuelForm({ ...fuelForm, cost_center_id: e.target.value })} options={costCenterOptions} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Observații</label>
            <textarea className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" rows={2} value={fuelForm.observatii} onChange={e => setFuelForm({ ...fuelForm, observatii: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => { setFuelModal(false); setFuelEditing(null) }}>Renunță</Button>
            <Button type="submit">{fuelEditing ? 'Actualizează' : 'Salvează'}</Button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL INTERVENȚIE ────────────────────────────────────────────────── */}
      <Modal open={intModal} title={intEditing ? 'Editează intervenție' : 'Intervenție nouă'} onClose={() => { setIntModal(false); setIntEditing(null) }} size="lg">
        <form className="grid gap-3" onSubmit={saveIntervention}>
          <div className="grid gap-3 md:grid-cols-2">
            <Select label="Utilaj / Vehicul" value={intForm.asset_id} onChange={e => setIntForm({ ...intForm, asset_id: e.target.value })} options={assetOptions} required />
            <Select label="Tip intervenție" value={intForm.tip} onChange={e => setIntForm({ ...intForm, tip: e.target.value })} options={[
              { value: 'reparatie', label: 'Reparație' },
              { value: 'revizie', label: 'Revizie periodică' },
              { value: 'ITP', label: 'ITP / Inspecție' },
              { value: 'ISCIR', label: 'ISCIR' },
              { value: 'accident', label: 'Accident / Avarie' },
              { value: 'altele', label: 'Altele' },
            ]} />
            <Input label="Dată intrare" type="date" value={intForm.data_intrare} onChange={e => setIntForm({ ...intForm, data_intrare: e.target.value })} required />
            <Input label="Dată ieșire (la finalizare)" type="date" value={intForm.data_iesire} onChange={e => setIntForm({ ...intForm, data_iesire: e.target.value })} />
            <Input label="Mecanic / Service" value={intForm.mecanic} onChange={e => setIntForm({ ...intForm, mecanic: e.target.value })} placeholder="ex: Atelier intern, Auto Service SRL" />
            <Input label="Furnizor" value={intForm.furnizor || ''} onChange={e => setIntForm({ ...intForm, furnizor: e.target.value })} />
            <Input label="Nr. factură / deviz" value={intForm.nr_factura || ''} onChange={e => setIntForm({ ...intForm, nr_factura: e.target.value })} />
            <Input label="Km/Ore intervenție" type="number" step="0.1" min="0" value={intForm.km_ore || ''} onChange={e => setIntForm({ ...intForm, km_ore: e.target.value })} />
            <Select label="Centru cost" value={intForm.cost_center_id || ''} onChange={e => setIntForm({ ...intForm, cost_center_id: e.target.value })} options={costCenterOptions} />
            <Input label="Cost piese (RON)" type="number" step="0.01" min="0" value={intForm.cost_piese || ''} onChange={e => setIntForm({ ...intForm, cost_piese: e.target.value })} />
            <Input label="Cost manoperă (RON)" type="number" step="0.01" min="0" value={intForm.cost_manopera || ''} onChange={e => setIntForm({ ...intForm, cost_manopera: e.target.value })} />
            <Input label="Cost extern (RON)" type="number" step="0.01" min="0" value={intForm.cost_extern || ''} onChange={e => setIntForm({ ...intForm, cost_extern: e.target.value })} />
            <Input label="Cost total (fallback)" type="number" step="0.01" min="0" value={intForm.cost || ''} onChange={e => setIntForm({ ...intForm, cost: e.target.value })} />
            <Input label="Următoarea revizie la data" type="date" value={intForm.next_service_date || ''} onChange={e => setIntForm({ ...intForm, next_service_date: e.target.value })} />
            <Input label="Următoarea revizie la km/ore" type="number" step="0.1" min="0" value={intForm.next_service_meter || ''} onChange={e => setIntForm({ ...intForm, next_service_meter: e.target.value })} />
            <Input label="ISCIR expiră la" type="date" value={intForm.iscir_expira_la || ''} onChange={e => setIntForm({ ...intForm, iscir_expira_la: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Descriere / Lucrări efectuate</label>
            <textarea className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" rows={3} value={intForm.descriere} onChange={e => setIntForm({ ...intForm, descriere: e.target.value })} placeholder="Describe lucrările efectuate, piesele înlocuite etc." />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => { setIntModal(false); setIntEditing(null) }}>Renunță</Button>
            <Button type="submit">{intEditing ? 'Actualizează' : 'Salvează'}</Button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL PROCESARE SOLICITARE ───────────────────────────────────────── */}
      <Modal open={reqModal} title="Procesează solicitare mecanizare" onClose={() => { setReqModal(false); setReqItem(null) }}>
        {reqItem ? (
          <form className="grid gap-3" onSubmit={saveRequest}>
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <div className="font-semibold text-slate-800">{reqItem.assetName || reqItem.category} — {reqItem.department}</div>
              <div className="text-slate-500">{reqItem.date} {reqItem.startTime}–{reqItem.endTime}</div>
              {reqItem.jobName ? <div className="text-slate-400 text-xs">{reqItem.jobName}</div> : null}
            </div>
            <Select label="Răspuns" value={reqForm.status} onChange={e => setReqForm({ ...reqForm, status: e.target.value })} options={[
              { value: 'approved', label: '✅ Aprobat' },
              { value: 'rejected', label: '❌ Respins' },
              { value: 'planned', label: '📋 Planificat' },
            ]} />
            {reqForm.status === 'approved' || reqForm.status === 'planned' ? (
              <Select label="Alocă utilaj (opțional)" value={reqForm.asset_id} onChange={e => setReqForm({ ...reqForm, asset_id: e.target.value })} options={assetOptions} />
            ) : null}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Observații</label>
              <textarea className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" rows={2} value={reqForm.observatii} onChange={e => setReqForm({ ...reqForm, observatii: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => { setReqModal(false); setReqItem(null) }}>Renunță</Button>
              <Button type="submit">Salvează</Button>
            </div>
          </form>
        ) : null}
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
