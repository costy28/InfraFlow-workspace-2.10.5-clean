import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, Snowflake, Upload } from 'lucide-react'
import api from '../../api/client'
import { useAuth } from '../../hooks/useAuth'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Modal from '../../components/ui/Modal'
import Table from '../../components/ui/Table'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import { formatDate, formatMoney, formatTone } from '../../utils/format'

const tabs = ['Dashboard', 'Jurnal zilnic', 'Fișe traseu', 'Timp dispoziție', 'Raport lunar', 'Configurare']
const MC_PER_CUPA = 0.8
const DENSITATE_NISIP = 1.6
const DENSITATE_SARE = 1.2
const DENSITATE_CACL = 1.2
const FACTOR_PRACTIC = 0.625

const interventionOptions = [
  { value: 'fara_interventie', label: 'Fără intervenție' },
  { value: 'monitorizare', label: 'Monitorizare' },
  { value: 'preventiv', label: 'Preventiv' },
  { value: 'interventie', label: 'Intervenție' },
  { value: 'interventie_urgenta', label: 'Intervenție urgentă' },
]

const materialOptions = [
  { value: '', label: 'Fără material' },
  { value: 'nisip', label: 'Nisip' },
  { value: 'sare', label: 'Sare' },
  { value: 'cacl', label: 'CaCl₂' },
  { value: 'mixt', label: 'Mixt' },
]

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

function defaultSeasonForm() {
  const year = new Date().getFullYear()
  return {
    denumire: `Iarna ${year}-${year + 1}`,
    data_start: `${year}-11-15`,
    data_sfarsit: `${year + 1}-04-15`,
    factor_corectie_material: 0.625,
  }
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7)
}

function isSnowSeason(date = new Date()) {
  const month = date.getMonth() + 1
  const day = date.getDate()
  return (month === 11 && day >= 15) || month === 12 || month === 1 || month === 2 || month === 3 || (month === 4 && day <= 15)
}

function arrayFrom(value, keys = []) {
  if (Array.isArray(value)) return value
  for (const key of keys) if (Array.isArray(value?.[key])) return value[key]
  return []
}

function labelize(value) {
  return String(value || '-').replaceAll('_', ' ')
}

function statusTone(status) {
  const value = String(status || '').toLowerCase()
  if (['aprobat', 'validat_gps', 'completat', 'generat'].includes(value)) return 'success'
  if (['trimis', 'in_lucru', 'interventie', 'preventiv', 'draft'].includes(value)) return 'warning'
  if (['respins', 'urgent', 'interventie_urgenta'].includes(value)) return 'danger'
  return 'neutral'
}

function recommendationTone(color) {
  const value = String(color || '').toLowerCase()
  if (value.includes('ros') || value.includes('red')) return 'danger'
  if (value.includes('galben') || value.includes('yellow')) return 'warning'
  return 'success'
}

function getWeatherCurrent(weather) {
  return weather?.current || weather?.meteo || weather || {}
}

function weatherValue(weather, key, fallbackKey) {
  const current = getWeatherCurrent(weather)
  return current[key] ?? weather?.[key] ?? (fallbackKey ? current[fallbackKey] ?? weather?.[fallbackKey] : null)
}

function getWeatherLabel(weather) {
  return weather?.stare?.label || weather?.conditii || weather?.weather || weather?.label || 'Condiții meteo'
}

function getWeatherIcon(weather) {
  return weather?.stare?.icon || weather?.icon || '🌨️'
}

function nameOf(user) {
  if (!user) return ''
  return user.name || user.fullName || user.username || [user.nume, user.prenume].filter(Boolean).join(' ')
}

function numberRo(value, decimals = 2) {
  return Number(value || 0).toLocaleString('ro-RO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function calcOre(start, end) {
  if (!start || !end) return 0
  const [sh, sm] = String(start).split(':').map(Number)
  const [eh, em] = String(end).split(':').map(Number)
  let startMinutes = sh * 60 + (sm || 0)
  let endMinutes = eh * 60 + (em || 0)
  if (endMinutes <= startMinutes) endMinutes += 24 * 60
  return Number(((endMinutes - startMinutes) / 60).toFixed(2))
}

function calcOreNoapte(start, end) {
  if (!start || !end) return 0
  const [sh, sm] = String(start).split(':').map(Number)
  const [eh, em] = String(end).split(':').map(Number)
  let startMinutes = sh * 60 + (sm || 0)
  let endMinutes = eh * 60 + (em || 0)
  if (endMinutes <= startMinutes) endMinutes += 24 * 60
  let total = 0
  for (let minute = startMinutes; minute < endMinutes; minute += 15) {
    const dayMinute = minute % (24 * 60)
    if (dayMinute >= 22 * 60 || dayMinute < 6 * 60) total += 15
  }
  return Number((total / 60).toFixed(2))
}

function materialFormula(material, cupe) {
  if (material === 'nisip') return Number((cupe * MC_PER_CUPA * DENSITATE_NISIP * FACTOR_PRACTIC).toFixed(3))
  if (material === 'sare') return Number((cupe * MC_PER_CUPA * DENSITATE_SARE * FACTOR_PRACTIC).toFixed(3))
  if (material === 'cacl') return Number((cupe * MC_PER_CUPA * DENSITATE_CACL * FACTOR_PRACTIC).toFixed(3))
  return 0
}

function routeLineRows(sheets) {
  return sheets.flatMap(sheet => arrayFrom(sheet.linii, ['lines', 'route_lines']).map(line => ({ ...line, sheet_id: sheet.id, faz: sheet.nr_faz })))
}

function routeTotals(sheets) {
  return sheets.reduce((acc, sheet) => {
    acc.cupe_nisip += Number(sheet.total_cupe_nisip || 0)
    acc.cupe_sare += Number(sheet.total_cupe_sare || 0)
    acc.cupe_cacl += Number(sheet.total_cupe_cacl || 0)
    acc.nisip += Number(sheet.nisip_consumat_to || 0)
    acc.sare += Number(sheet.sare_consumata_to || 0)
    acc.cacl += Number(sheet.cacl_consumat_to || 0)
    return acc
  }, { cupe_nisip: 0, cupe_sare: 0, cupe_cacl: 0, nisip: 0, sare: 0, cacl: 0 })
}

function SheetLineEditor({ line, index, onChange, onRemove }) {
  const update = field => event => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value
    onChange(index, field, value)
  }

  return (
    <div className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-8">
      <Input label="Strada" value={line.denumire} onChange={update('denumire')} />
      <Input label="Ora plec." type="time" value={line.ora_plecare} onChange={update('ora_plecare')} />
      <label className="flex h-10 items-center gap-2 self-end rounded-md border border-slate-300 px-3 text-sm text-slate-700">
        <input type="checkbox" checked={Boolean(line.lama)} onChange={update('lama')} />
        Lamă
      </label>
      <Input label="Nr.cupe" type="number" min="0" value={line.nr_cupe_material} onChange={update('nr_cupe_material')} />
      <Select label="Material" value={line.tip_material} onChange={update('tip_material')} options={materialOptions} />
      <Input label="Treceri" type="number" min="0" value={line.nr_treceri_material} onChange={update('nr_treceri_material')} />
      <Input label="Ora sos." type="time" value={line.ora_sosire} onChange={update('ora_sosire')} />
      <Button type="button" variant="ghost" className="self-end" onClick={() => onRemove(index)}>Șterge</Button>
    </div>
  )
}

export default function DeszapezirePage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('Dashboard')
  const [weather, setWeather] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [seasons, setSeasons] = useState([])
  const [sectors, setSectors] = useState([])
  const [manualZones, setManualZones] = useState([])
  const [recipes, setRecipes] = useState([])
  const [dutyLogs, setDutyLogs] = useState([])
  const [routeSheets, setRouteSheets] = useState([])
  const [standby, setStandby] = useState([])
  const [fleetAssets, setFleetAssets] = useState([])
  const [employees, setEmployees] = useState([])
  const [selectedLog, setSelectedLog] = useState(null)
  const [monthlyReport, setMonthlyReport] = useState(null)
  const [generatedReport, setGeneratedReport] = useState(null)
  const [reportMonth, setReportMonth] = useState(currentMonth())
  const [journalMonth, setJournalMonth] = useState(currentMonth())
  const [journalStatus, setJournalStatus] = useState('')
  const [selectedSeasonId, setSelectedSeasonId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [modal, setModal] = useState('')
  const [gpsResult, setGpsResult] = useState(null)

  const [journalForm, setJournalForm] = useState({ data: todayDate(), conditii_meteo: '', tip_interventie: 'fara_interventie', observatii: '' })
  const [sheetForm, setSheetForm] = useState({
    utilaj_id: '',
    nr_faz: '',
    deservent_1_id: '',
    deservent_2_id: '',
    schimb: 'zi',
    ora_start: '08:00',
    ora_sfarsit: '20:00',
    linii: [],
  })
  const [standbyForm, setStandbyForm] = useState({ angajat_id: '', tip_standby: 'asteptare_sediu', ora_start: '20:00', ora_sfarsit: '08:00', observatii: '' })
  const [seasonForm, setSeasonForm] = useState(defaultSeasonForm())
  const [zoneForm, setZoneForm] = useState({ denumire: '', tip: 'trotuar', suprafata_m2: '', zona: '' })
  const [recipeForm, setRecipeForm] = useState({ denumire: '', tip_tratament: 'sare', mc_per_cupa: 0.8, densitate: 1.2, factor_corectie: 0.625 })

  const inSeason = isSnowSeason()
  const activeSeason = useMemo(() => seasons.find(season => String(season.id) === String(selectedSeasonId)) || seasons.find(season => season.activ !== false) || seasons[0] || null, [seasons, selectedSeasonId])
  const activeSeasonId = activeSeason?.id || selectedSeasonId || dashboard?.sezon?.id || ''
  const todayLog = useMemo(() => dutyLogs.find(log => String(log.data).slice(0, 10) === todayDate()), [dutyLogs])
  const filteredDutyLogs = useMemo(() => dutyLogs
    .filter(log => !journalMonth || String(log.data || '').slice(0, 7) === journalMonth)
    .filter(log => !journalStatus || log.status === journalStatus)
    .sort((a, b) => String(b.data).localeCompare(String(a.data))), [dutyLogs, journalMonth, journalStatus])
  const totals = useMemo(() => routeTotals(routeSheets), [routeSheets])
  const recommendation = weather?.recomandare || dashboard?.meteo_curent?.recomandare || {}
  const monthStats = dashboard?.luna_curenta || {}
  const standbyCalc = useMemo(() => ({
    ore: calcOre(standbyForm.ora_start, standbyForm.ora_sfarsit),
    oreNoapte: calcOreNoapte(standbyForm.ora_start, standbyForm.ora_sfarsit),
  }), [standbyForm.ora_start, standbyForm.ora_sfarsit])
  const sheetPreview = useMemo(() => sheetForm.linii.reduce((acc, line) => {
    const cupe = Number(line.nr_cupe_material || 0)
    if (line.tip_material === 'nisip') acc.nisip += cupe
    if (line.tip_material === 'sare') acc.sare += cupe
    if (line.tip_material === 'cacl') acc.cacl += cupe
    if (line.tip_material === 'mixt') {
      acc.sare += cupe / 2
      acc.cacl += cupe / 2
    }
    return acc
  }, { nisip: 0, sare: 0, cacl: 0 }), [sheetForm.linii])
  const noSeasonConfigured = !loading && seasons.length === 0

  async function loadWeather() {
    const response = await api.get('/snow-removal/weather')
    const data = response.data?.disponibil === false ? null : response.data
    setWeather(data)
    setJournalForm(form => ({
      ...form,
      conditii_meteo: getWeatherLabel(data),
      tip_interventie: data?.recomandare?.tip || form.tip_interventie,
    }))
  }

  const loadRouteSheets = useCallback(async (logUuid) => {
    if (!logUuid) {
      setRouteSheets([])
      return
    }
    const response = await api.get(`/snow-removal/duty-logs/${logUuid}/route-sheets`)
    setRouteSheets(arrayFrom(response.data, ['route_sheets', 'routeSheets', 'items']))
  }, [])

  const loadStandby = useCallback(async (logUuid) => {
    if (!logUuid) {
      setStandby([])
      return
    }
    const response = await api.get(`/snow-removal/duty-logs/${logUuid}/standby`)
    setStandby(arrayFrom(response.data, ['standby_logs', 'standbyLogs', 'items']))
  }, [])

  const selectLog = useCallback(async (log) => {
    setSelectedLog(log)
    await Promise.all([loadRouteSheets(log?.uuid), loadStandby(log?.uuid)])
  }, [loadRouteSheets, loadStandby])

  const loadConfigForSeason = useCallback(async (seasonId) => {
    if (!seasonId) return
    const [sectorsRes, zonesRes, recipesRes] = await Promise.allSettled([
      api.get(`/snow-removal/seasons/${seasonId}/street-sectors`),
      api.get(`/snow-removal/seasons/${seasonId}/manual-zones`),
      api.get('/snow-removal/recipes', { params: { season_id: seasonId } }),
    ])
    if (sectorsRes.status === 'fulfilled') setSectors(arrayFrom(sectorsRes.value.data))
    if (zonesRes.status === 'fulfilled') setManualZones(arrayFrom(zonesRes.value.data))
    if (recipesRes.status === 'fulfilled') setRecipes(arrayFrom(recipesRes.value.data))
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [weatherRes, dashboardRes, seasonsRes, logsRes, fleetRes, employeesRes] = await Promise.allSettled([
        api.get('/snow-removal/weather'),
        api.get('/snow-removal/dashboard'),
        api.get('/snow-removal/seasons'),
        api.get('/snow-removal/duty-logs'),
        api.get('/fleet-assets').catch(() => ({ data: {} })),
        api.get('/hr/employees').catch(() => ({ data: {} })),
      ])
      if (weatherRes.status === 'fulfilled') {
        const data = weatherRes.value.data?.disponibil === false ? null : weatherRes.value.data
        setWeather(data)
        setJournalForm(form => ({ ...form, conditii_meteo: getWeatherLabel(data), tip_interventie: data?.recomandare?.tip || form.tip_interventie }))
      }
      if (dashboardRes.status === 'fulfilled') setDashboard(dashboardRes.value.data)
      let nextSeasons = []
      if (seasonsRes.status === 'fulfilled') {
        nextSeasons = arrayFrom(seasonsRes.value.data, ['seasons', 'items'])
        setSeasons(nextSeasons)
      }
      if (fleetRes.status === 'fulfilled') setFleetAssets(arrayFrom(fleetRes.value.data, ['assets', 'items', 'data']))
      if (employeesRes.status === 'fulfilled') setEmployees(arrayFrom(employeesRes.value.data, ['employees', 'items', 'data']))
      if (logsRes.status === 'fulfilled') {
        const logs = arrayFrom(logsRes.value.data, ['duty_logs', 'dutyLogs', 'items'])
        setDutyLogs(logs)
        const nextSelected = logs.find(log => String(log.data).slice(0, 10) === todayDate()) || logs[0] || null
        if (nextSelected) await selectLog(nextSelected)
      }
      const seasonId = selectedSeasonId || nextSeasons.find(season => season.activ !== false)?.id || nextSeasons[0]?.id || ''
      if (seasonId) {
        setSelectedSeasonId(String(seasonId))
        await loadConfigForSeason(seasonId)
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut încărca datele de deszăpezire.')
    } finally {
      setLoading(false)
    }
  }, [loadConfigForSeason, selectLog, selectedSeasonId])

  const loadMonthlyReport = useCallback(async () => {
    if (!activeSeasonId || !reportMonth) return
    try {
      const response = await api.get('/snow-removal/reports/monthly', { params: { season_id: activeSeasonId, luna: reportMonth } })
      setMonthlyReport(response.data?.raport || response.data)
    } catch {
      setMonthlyReport(null)
    }
  }, [activeSeasonId, reportMonth])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData()
  }, [loadData])

  useEffect(() => {
    Promise.resolve().then(() => loadMonthlyReport())
  }, [loadMonthlyReport])

  function openJournalModal() {
    setJournalForm(form => ({ ...form, data: todayDate(), conditii_meteo: getWeatherLabel(weather), tip_interventie: weather?.recomandare?.tip || form.tip_interventie }))
    setModal('journal')
  }

  function openSheetModal() {
    const rows = sectors
      .filter(sector => !sheetForm.utilaj_id || !sector.utilaj_default_id || String(sector.utilaj_default_id) === String(sheetForm.utilaj_id))
      .slice(0, 8)
      .map((sector, index) => ({
        sector_id: sector.id,
        denumire: sector.denumire,
        ora_plecare: '',
        lama: index % 2 === 0,
        nr_treceri_lama: index % 2 === 0 ? 1 : 0,
        nr_cupe_material: 0,
        tip_material: sector.tip_tratament === 'clorura' ? 'cacl' : 'sare',
        nr_treceri_material: 1,
        ora_sosire: '',
      }))
    setSheetForm(form => ({ ...form, linii: rows.length ? rows : [{ sector_id: '', denumire: '', ora_plecare: '', lama: false, nr_treceri_lama: 0, nr_cupe_material: 0, tip_material: 'sare', nr_treceri_material: 1, ora_sosire: '' }] }))
    setModal('sheet')
  }

  async function createJournal(event) {
    event.preventDefault()
    setSaving(true)
    try {
      const response = await api.post('/snow-removal/duty-logs', {
        season_id: activeSeasonId,
        data: journalForm.data,
        ofiter_serviciu_id: user?.id,
        conditii_meteo: journalForm.conditii_meteo,
        conditii_meteo_auto: weather ? JSON.stringify(weather) : null,
        tip_interventie: journalForm.tip_interventie,
        observatii: journalForm.observatii,
      })
      setModal('')
      setMessage('Jurnalul a fost creat.')
      await loadData()
      await selectLog(response.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Jurnalul nu a putut fi creat.')
    } finally {
      setSaving(false)
    }
  }

  async function submitLog() {
    if (!selectedLog) return
    try {
      const response = await api.post(`/snow-removal/duty-logs/${selectedLog.uuid}/submit`)
      setSelectedLog(response.data)
      setMessage('Jurnalul a fost trimis spre aprobare.')
      await loadData()
    } catch (err) {
      setError(err.response?.data?.error || 'Jurnalul nu a putut fi trimis.')
    }
  }

  async function approveLog() {
    if (!selectedLog) return
    try {
      const response = await api.post(`/snow-removal/duty-logs/${selectedLog.uuid}/approve`)
      setSelectedLog(response.data)
      setMessage('Jurnalul a fost aprobat.')
      await loadData()
    } catch (err) {
      setError(err.response?.data?.error || 'Jurnalul nu a putut fi aprobat.')
    }
  }

  function updateSheetLine(index, field, value) {
    setSheetForm(form => ({ ...form, linii: form.linii.map((line, rowIndex) => rowIndex === index ? { ...line, [field]: value } : line) }))
  }

  async function createRouteSheet(event) {
    event.preventDefault()
    if (!selectedLog) return
    setSaving(true)
    try {
      await api.post(`/snow-removal/duty-logs/${selectedLog.uuid}/route-sheets`, {
        ...sheetForm,
        ora_start: sheetForm.schimb === 'zi' ? '08:00' : '20:00',
        ora_sfarsit: sheetForm.schimb === 'zi' ? '20:00' : '08:00',
        linii: sheetForm.linii.map((line, index) => ({
          ...line,
          nr_crt: index + 1,
          nr_cupe_material: Number(line.nr_cupe_material || 0),
          nr_treceri_lama: Number(line.nr_treceri_lama || 0),
          nr_treceri_material: Number(line.nr_treceri_material || 0),
          observatii: line.denumire,
        })),
      })
      setModal('')
      setMessage('Fișa FAZ a fost salvată.')
      await selectLog(selectedLog)
      await loadData()
    } catch (err) {
      setError(err.response?.data?.error || 'Fișa nu a putut fi salvată.')
    } finally {
      setSaving(false)
    }
  }

  async function importGps(sheet, file) {
    if (!file) return
    const data = new FormData()
    data.append('file', file)
    try {
      const response = await api.post(`/snow-removal/route-sheets/${sheet.uuid}/gps-import`, data)
      setGpsResult(response.data)
      setMessage(`GPS importat: ${response.data.km} km, ${response.data.ore_motor} ore motor.`)
      await selectLog(selectedLog)
    } catch (err) {
      setError(err.response?.data?.error || 'Importul GPS a eșuat.')
    }
  }

  async function createStandby(event) {
    event.preventDefault()
    if (!selectedLog) return
    try {
      await api.post(`/snow-removal/duty-logs/${selectedLog.uuid}/standby`, standbyForm)
      setModal('')
      setMessage('Timpul la dispoziție a fost salvat.')
      await selectLog(selectedLog)
    } catch (err) {
      setError(err.response?.data?.error || 'Timpul la dispoziție nu a putut fi salvat.')
    }
  }

  async function generateMonthlyReport() {
    try {
      const response = await api.post('/snow-removal/reports/monthly/generate', { season_id: activeSeasonId, luna: reportMonth })
      setGeneratedReport(response.data)
      setMonthlyReport(response.data.raport)
      setMessage('Raportul lunar a fost generat.')
    } catch (err) {
      setError(err.response?.data?.error || 'Raportul nu a putut fi generat.')
    }
  }

  function openReportPdf() {
    const uuid = generatedReport?.raport?.uuid || monthlyReport?.uuid
    if (!uuid) {
      setError('Generează raportul înainte de deschiderea PDF.')
      return
    }
    window.open(`/api/snow-removal/reports/monthly/${uuid}/pdf`, '_blank')
  }

  async function createSeason(event) {
    event.preventDefault()
    const response = await api.post('/snow-removal/seasons', seasonForm)
    setSeasons(current => [...current, response.data])
    setSelectedSeasonId(String(response.data.id))
    setSeasonForm(defaultSeasonForm())
    setMessage('Sezonul a fost creat.')
  }

  async function importSectors(file) {
    if (!file || !activeSeasonId) return
    const data = new FormData()
    data.append('file', file)
    const response = await api.post(`/snow-removal/seasons/${activeSeasonId}/street-sectors/import-excel`, data)
    setMessage(`Import sectoare: ${response.data.importate} rânduri.`)
    await loadConfigForSeason(activeSeasonId)
  }

  async function createZone(event) {
    event.preventDefault()
    await api.post(`/snow-removal/seasons/${activeSeasonId}/manual-zones`, zoneForm)
    setZoneForm({ denumire: '', tip: 'trotuar', suprafata_m2: '', zona: '' })
    setMessage('Zona manuală a fost creată.')
    await loadConfigForSeason(activeSeasonId)
  }

  async function createRecipe(event) {
    event.preventDefault()
    await api.post('/snow-removal/recipes', { ...recipeForm, season_id: activeSeasonId })
    setRecipeForm({ denumire: '', tip_tratament: 'sare', mc_per_cupa: 0.8, densitate: 1.2, factor_corectie: 0.625 })
    setMessage('Rețeta a fost creată.')
    await loadConfigForSeason(activeSeasonId)
  }

  if (!inSeason && !noSeasonConfigured) {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <Snowflake className="text-primary-700" size={28} />
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Sezon inactiv</h1>
            <p className="text-sm text-slate-600">Modulul de deszăpezire este activ între 15 noiembrie și 15 aprilie.</p>
          </div>
        </div>
      </Card>
    )
  }

  const weatherCurrent = getWeatherCurrent(weather)
  const report = monthlyReport || {}

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Deszăpezire</h1>
          <p className="text-sm text-slate-600">Jurnale zilnice, fișe FAZ, timp la dispoziție și rapoarte oficiale.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={loadData}><RefreshCw size={16} /> Reîncarcă</Button>
          <Button onClick={openJournalModal}><Plus size={16} /> Jurnal nou</Button>
        </div>
      </div>

      {error ? <Card className="border-rose-200 bg-rose-50 text-sm text-rose-700">{error}</Card> : null}
      {message ? <Card className="border-primary-100 bg-primary-50 text-sm text-primary-700">{message}</Card> : null}

      {noSeasonConfigured ? (
        <Card className="border-primary-200 bg-primary-50">
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">❄️ Modul Deszăpezire activ</h2>
              <p className="mt-1 text-sm text-slate-600">
                Nu există niciun sezon configurat. Creează sezonul pentru a putea introduce jurnale, fișe traseu și rapoarte.
              </p>
              <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-4">
                <span>Denumire: {seasonForm.denumire}</span>
                <span>Start: 15.11.{String(seasonForm.data_start).slice(0, 4)}</span>
                <span>Sfârșit: 15.04.{String(seasonForm.data_sfarsit).slice(0, 4)}</span>
                <span>Factor: {seasonForm.factor_corectie_material}</span>
              </div>
            </div>
            <Button onClick={createSeason}>+ Creează sezon {new Date().getFullYear()}-{new Date().getFullYear() + 1}</Button>
          </div>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {tabs.map(tab => <Button key={tab} variant={activeTab === tab ? 'primary' : 'secondary'} onClick={() => setActiveTab(tab)}>{tab}</Button>)}
      </div>

      {activeTab === 'Dashboard' && (
        <div className="grid gap-4">
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card title="Meteo Piatra-Neamț" loading={loading}>
              <div className="grid gap-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="flex items-center gap-4">
                    <span className="text-5xl">{getWeatherIcon(weather)}</span>
                    <div>
                      <div className="text-3xl font-semibold text-slate-900">
                        🌡️ {weatherValue(weather, 'temperature_2m', 'temperatura') ?? '-'}°C
                      </div>
                      <div className="text-sm text-slate-500">Resimțită {weatherValue(weather, 'apparent_temperature') ?? '-'}°C</div>
                      <div className="font-medium text-slate-800">{getWeatherLabel(weather)}</div>
                    </div>
                  </div>
                  <Button variant="secondary" onClick={loadWeather}><RefreshCw size={16} /> Actualizează</Button>
                </div>
                <div className="flex flex-wrap gap-4 text-sm text-slate-700">
                  <span>💨 Vânt {weatherValue(weather, 'windspeed_10m') ?? weatherCurrent.vant_kmh ?? '-'} km/h</span>
                  <span>💧 Umiditate {weatherValue(weather, 'relativehumidity_2m') ?? '-'}%</span>
                </div>
                <div className={`rounded-lg border p-4 ${
                  recommendationTone(recommendation.culoare) === 'danger'
                    ? 'border-rose-200 bg-rose-50 text-rose-800'
                    : recommendationTone(recommendation.culoare) === 'warning'
                      ? 'border-amber-200 bg-amber-50 text-amber-800'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                }`}>
                  <div className="font-semibold">Recomandare: {labelize(recommendation.tip || 'monitorizare')}</div>
                  <div className="mt-1 text-sm">{recommendation.motiv || 'Monitorizare și pregătire utilaje.'}</div>
                </div>
              </div>
            </Card>

            <Card title="Status jurnal azi">
              {todayLog ? (
                <div className="grid gap-3">
                  <div className="text-xl font-semibold text-slate-900">Jurnal existent</div>
                  <Badge tone={statusTone(todayLog.status)}>{labelize(todayLog.status)}</Badge>
                  <Button variant="secondary" onClick={() => { selectLog(todayLog); setActiveTab('Jurnal zilnic') }}>Deschide jurnal</Button>
                </div>
              ) : (
                <div className="grid gap-3">
                  <div className="text-xl font-semibold text-amber-800">Jurnal lipsă</div>
                  <Button onClick={openJournalModal}>Creează jurnal azi</Button>
                </div>
              )}
            </Card>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card><div className="text-sm text-slate-500">Zile intervenție</div><div className="mt-2 text-2xl font-semibold">{monthStats.zile_interventie || 0}</div></Card>
            <Card><div className="text-sm text-slate-500">Zile dispoziție</div><div className="mt-2 text-2xl font-semibold">{monthStats.zile_dispozitie || 0}</div></Card>
            <Card><div className="text-sm text-slate-500">Sare totală</div><div className="mt-2 text-2xl font-semibold">{formatTone(monthStats.sare_to)}</div></Card>
            <Card><div className="text-sm text-slate-500">CaCl₂ total</div><div className="mt-2 text-2xl font-semibold">{formatTone(monthStats.cacl_to)}</div></Card>
          </div>
        </div>
      )}

      {activeTab === 'Jurnal zilnic' && (
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.4fr]">
          <Card title="Jurnale" actions={<Button onClick={openJournalModal}>Jurnal nou</Button>}>
            <div className="mb-3 grid gap-3 md:grid-cols-2">
              <Input label="Lună" type="month" value={journalMonth} onChange={event => setJournalMonth(event.target.value)} />
              <Select label="Status" value={journalStatus} onChange={event => setJournalStatus(event.target.value)}>
                <option value="">Toate</option>
                <option value="draft">Draft</option>
                <option value="trimis">Trimis</option>
                <option value="aprobat">Aprobat</option>
              </Select>
            </div>
            <Table
              columns={[
                { key: 'data', label: 'Dată', render: row => formatDate(row.data) },
                { key: 'ofiter_serviciu_id', label: 'Ofițer' },
                { key: 'tip_interventie', label: 'Intervenție', render: row => <Badge tone={statusTone(row.tip_interventie)}>{labelize(row.tip_interventie)}</Badge> },
                { key: 'status', label: 'Status', render: row => <Badge tone={statusTone(row.status)}>{labelize(row.status)}</Badge> },
              ]}
              rows={filteredDutyLogs}
              onRowClick={selectLog}
              empty="Nu există jurnale."
            />
          </Card>

          <Card title={selectedLog ? `Jurnal ${formatDate(selectedLog.data)}` : 'Detalii jurnal'} actions={selectedLog ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={submitLog}>Trimite spre aprobare</Button>
              <Button size="sm" onClick={approveLog}>Aprobă</Button>
            </div>
          ) : null}>
            {selectedLog ? (
              <div className="grid gap-5">
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-slate-800">I. Intervenții</h3>
                  <Table
                    columns={[
                      { key: 'faz', label: 'FAZ' },
                      { key: 'observatii', label: 'Strada', render: row => row.observatii || row.sector_id || '-' },
                      { key: 'ora_plecare', label: 'Plecare' },
                      { key: 'lama', label: 'Lamă', render: row => row.lama ? 'Da' : 'Nu' },
                      { key: 'nr_cupe_material', label: 'Cupe' },
                      { key: 'tip_material', label: 'Material', render: row => labelize(row.tip_material) },
                      { key: 'ora_sosire', label: 'Sosire' },
                    ]}
                    rows={routeLineRows(routeSheets)}
                    empty="Nu există intervenții."
                  />
                </section>

                <section>
                  <h3 className="mb-2 text-sm font-semibold text-slate-800">II. Utilaje la dispoziție</h3>
                  <Table
                    columns={[
                      { key: 'nr_faz', label: 'FAZ' },
                      { key: 'utilaj_id', label: 'Utilaj' },
                      { key: 'schimb', label: 'Schimb' },
                      { key: 'ore_functionare_motor', label: 'Ore motor' },
                      { key: 'ore_stationare_baza', label: 'Ore staționare' },
                      { key: 'km_parcursi', label: 'Km' },
                    ]}
                    rows={routeSheets}
                    empty="Nu există utilaje pe jurnal."
                  />
                </section>

                <section>
                  <h3 className="mb-2 text-sm font-semibold text-slate-800">III. Echipa</h3>
                  <Table
                    columns={[
                      { key: 'angajat_id', label: 'Angajat' },
                      { key: 'tip_standby', label: 'Tip' },
                      { key: 'ore_totale', label: 'Ore lucru/așteptare' },
                      { key: 'ore_noapte', label: 'Ore noapte' },
                    ]}
                    rows={standby}
                    empty="Nu există personal standby."
                  />
                </section>

                <section className="rounded-lg border border-slate-200 p-4">
                  <h3 className="mb-3 text-sm font-semibold text-slate-800">IV. Situație materiale</h3>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>Nisip: {totals.cupe_nisip} cupe × 0.8mc × 1.6to/mc × 0.625 = <strong>{numberRo(totals.nisip, 3)} tone</strong></div>
                    <div>Sare: {totals.cupe_sare} cupe × 0.8mc × 1.2to/mc × 0.625 = <strong>{numberRo(totals.sare, 3)} tone</strong></div>
                    <div>CaCl₂: {totals.cupe_cacl} cupe × 0.8mc × 1.2to/mc × 0.625 = <strong>{numberRo(totals.cacl, 3)} tone</strong></div>
                  </div>
                </section>

                <section>
                  <h3 className="mb-2 text-sm font-semibold text-slate-800">V. Stoc material</h3>
                  <Table
                    columns={[
                      { key: 'material', label: 'Material' },
                      { key: 'intrare', label: 'Intrare' },
                      { key: 'consum', label: 'Consum' },
                      { key: 'predare', label: 'Predare' },
                    ]}
                    rows={[
                      { id: 'nisip', material: 'Nisip', intrare: formatTone(selectedLog.stoc_intrare_nisip_to), consum: formatTone(selectedLog.consum_nisip_to), predare: formatTone(selectedLog.stoc_predare_nisip_to) },
                      { id: 'sare', material: 'Sare', intrare: formatTone(selectedLog.stoc_intrare_sare_to), consum: formatTone(selectedLog.consum_sare_to), predare: formatTone(selectedLog.stoc_predare_sare_to) },
                      { id: 'cacl', material: 'CaCl₂', intrare: formatTone(selectedLog.stoc_intrare_cacl_to), consum: formatTone(selectedLog.consum_cacl_to), predare: formatTone(selectedLog.stoc_predare_cacl_to) },
                    ]}
                  />
                </section>

                <section>
                  <h3 className="mb-2 text-sm font-semibold text-slate-800">VI. Observații</h3>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">{selectedLog.observatii || 'Nu sunt observații.'}</div>
                </section>
              </div>
            ) : <p className="text-sm text-slate-500">Selectează un jurnal.</p>}
          </Card>
        </div>
      )}

      {activeTab === 'Fișe traseu' && (
        <div className="grid gap-4">
          <Card className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <Select label="Jurnal" value={selectedLog?.uuid || ''} onChange={event => selectLog(dutyLogs.find(log => log.uuid === event.target.value))}>
              <option value="">Alege jurnal</option>
              {dutyLogs.map(log => <option key={log.uuid} value={log.uuid}>{formatDate(log.data)} · {labelize(log.status)}</option>)}
            </Select>
            <Button onClick={openSheetModal} disabled={!selectedLog}><Plus size={16} /> Fișă nouă</Button>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {routeSheets.map(sheet => (
              <Card key={sheet.uuid || sheet.id}>
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <h2 className="font-semibold text-slate-900">FAZ {sheet.nr_faz || '-'}</h2>
                    <p className="text-sm text-slate-500">Utilaj {sheet.utilaj_id || '-'} · {labelize(sheet.schimb)} · Deservenți {sheet.deservent_1_id || '-'} {sheet.deservent_2_id || ''}</p>
                  </div>
                  <Badge tone={statusTone(sheet.status)}>{labelize(sheet.status)}</Badge>
                </div>
                <div className="mb-3 grid gap-3 sm:grid-cols-3">
                  <div>Total cupe sare: <strong>{sheet.total_cupe_sare || 0} × 600kg = {numberRo((sheet.total_cupe_sare || 0) * 600, 0)} kg</strong></div>
                  <div>Total cupe CaCl₂: <strong>{sheet.total_cupe_cacl || 0} × 600kg = {numberRo((sheet.total_cupe_cacl || 0) * 600, 0)} kg</strong></div>
                  <div>Km GPS: <strong>{sheet.km_parcursi || 0}</strong></div>
                </div>
                <Table
                  columns={[
                    { key: 'observatii', label: 'Strada', render: row => row.observatii || row.sector_id || '-' },
                    { key: 'ora_plecare', label: 'Plecare' },
                    { key: 'lama', label: 'Lamă', render: row => row.lama ? 'Da' : 'Nu' },
                    { key: 'nr_cupe_material', label: 'Cupe' },
                    { key: 'tip_material', label: 'Material', render: row => labelize(row.tip_material) },
                    { key: 'ora_sosire', label: 'Sosire' },
                  ]}
                  rows={arrayFrom(sheet.linii, ['lines', 'route_lines'])}
                  empty="Fișa nu are linii."
                />
                <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
                  <Upload size={16} /> Import GPS
                  <input className="hidden" type="file" accept=".csv,.xlsx,.xls" onChange={event => importGps(sheet, event.target.files?.[0])} />
                </label>
              </Card>
            ))}
          </div>
          {gpsResult ? <Card className="border-primary-100 bg-primary-50 text-sm text-primary-700">GPS: {gpsResult.tracks_importate} puncte, {gpsResult.km} km, {gpsResult.ore_motor} ore motor, {gpsResult.ore_stationare} ore staționare.</Card> : null}
        </div>
      )}

      {activeTab === 'Timp dispoziție' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
          <Card title="Timp la dispoziție" actions={<Button onClick={() => setModal('standby')}>Adaugă</Button>}>
            <Table
              columns={[
                { key: 'angajat_id', label: 'Angajat' },
                { key: 'tip_standby', label: 'Tip', render: row => labelize(row.tip_standby) },
                { key: 'ora_start', label: 'Start' },
                { key: 'ora_sfarsit', label: 'Sfârșit' },
                { key: 'ore_totale', label: 'Ore totale' },
                { key: 'ore_noapte', label: 'Ore noapte' },
              ]}
              rows={standby}
              empty="Nu există înregistrări standby."
            />
          </Card>
          <Card title="Calcul rapid">
            <div className="grid gap-2 text-sm">
              <div>Ore totale formular: <strong>{standbyCalc.ore}</strong></div>
              <div>Ore noapte 22-06: <strong>{standbyCalc.oreNoapte}</strong></div>
              <div className="text-slate-500">Calculul final se salvează pe server la adăugare.</div>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'Raport lunar' && (
        <div className="grid gap-4">
          <Card className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <Select label="Sezon" value={String(activeSeasonId || '')} onChange={event => { setSelectedSeasonId(event.target.value); loadConfigForSeason(event.target.value) }}>
              <option value="">Alege sezon</option>
              {seasons.map(season => <option key={season.id} value={season.id}>{season.denumire}</option>)}
            </Select>
            <Input label="Lună" type="month" value={reportMonth} onChange={event => setReportMonth(event.target.value)} />
            <div className="flex gap-2">
              <Button onClick={generateMonthlyReport}>Generează raport</Button>
              <Button variant="secondary" onClick={openReportPdf}>PDF</Button>
            </div>
          </Card>
          <Card title="Preview raport oficial">
            <div className="grid gap-4">
              <section className="grid gap-3 md:grid-cols-3">
                <div>Zile calendaristice: <strong>{new Date(Number(reportMonth.slice(0, 4)), Number(reportMonth.slice(5, 7)), 0).getDate()}</strong></div>
                <div>Zile intervenție: <strong>{report.zile_interventie || 0}</strong></div>
                <div>Zile dispoziție: <strong>{report.zile_dispozitie || 0}</strong></div>
              </section>
              <Table
                columns={[
                  { key: 'material', label: 'Materiale consumate' },
                  { key: 'total', label: 'Total' },
                ]}
                rows={[
                  { id: 'sare', material: 'Sare', total: formatTone(report.sare_totala_to) },
                  { id: 'cacl', material: 'CaCl₂', total: formatTone(report.cacl_total_to) },
                  { id: 'nisip', material: 'Nisip', total: formatTone(report.nisip_total_to) },
                ]}
              />
              <Table
                columns={[
                  { key: 'categorie', label: 'Personal / Costuri' },
                  { key: 'valoare', label: 'Valoare' },
                ]}
                rows={[
                  { id: 'ore_interventie', categorie: 'Ore intervenție', valoare: report.ore_interventie_active || 0 },
                  { id: 'ore_dispozitie', categorie: 'Ore dispoziție', valoare: report.ore_dispozitie || 0 },
                  { id: 'cost', categorie: 'Cost total', valoare: formatMoney(report.cost_total) },
                ]}
              />
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'Configurare' && (
        <div className="grid gap-4">
          <Card title="Sezoane">
            <form className="mb-4 grid gap-3 md:grid-cols-4" onSubmit={createSeason}>
              <Input label="Denumire" value={seasonForm.denumire} onChange={event => setSeasonForm(f => ({ ...f, denumire: event.target.value }))} />
              <Input label="Start" type="date" value={seasonForm.data_start} onChange={event => setSeasonForm(f => ({ ...f, data_start: event.target.value }))} />
              <Input label="Sfârșit" type="date" value={seasonForm.data_sfarsit} onChange={event => setSeasonForm(f => ({ ...f, data_sfarsit: event.target.value }))} />
              <Input label="Factor corecție" type="number" step="0.001" value={seasonForm.factor_corectie_material} onChange={event => setSeasonForm(f => ({ ...f, factor_corectie_material: event.target.value }))} />
              <Button className="self-end" type="submit">Adaugă sezon</Button>
            </form>
            <Table columns={[{ key: 'denumire', label: 'Denumire' }, { key: 'data_start', label: 'Start' }, { key: 'data_sfarsit', label: 'Sfârșit' }]} rows={seasons} />
          </Card>

          <Card title="Sectoare și zone manuale">
            <div className="mb-4 flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
                <Upload size={16} /> Import Excel caiet sarcini
                <input className="hidden" type="file" accept=".xlsx,.xls" onChange={event => importSectors(event.target.files?.[0])} />
              </label>
            </div>
            <form className="mb-4 grid gap-3 md:grid-cols-5" onSubmit={createZone}>
              <Input label="Zonă" value={zoneForm.denumire} onChange={event => setZoneForm(f => ({ ...f, denumire: event.target.value }))} />
              <Input label="Tip" value={zoneForm.tip} onChange={event => setZoneForm(f => ({ ...f, tip: event.target.value }))} />
              <Input label="Suprafață m²" type="number" value={zoneForm.suprafata_m2} onChange={event => setZoneForm(f => ({ ...f, suprafata_m2: event.target.value }))} />
              <Input label="Sector" value={zoneForm.zona} onChange={event => setZoneForm(f => ({ ...f, zona: event.target.value }))} />
              <Button className="self-end" type="submit">Adaugă zonă</Button>
            </form>
            <Table columns={[{ key: 'denumire', label: 'Sector' }, { key: 'suprafata_m2', label: 'Suprafață' }, { key: 'tip_tratament', label: 'Tratament' }]} rows={sectors.slice(0, 20)} empty="Nu există sectoare importate." />
            <div className="mt-4">
              <Table columns={[{ key: 'denumire', label: 'Zonă manuală' }, { key: 'tip', label: 'Tip' }, { key: 'suprafata_m2', label: 'Suprafață' }]} rows={manualZones} empty="Nu există zone manuale." />
            </div>
          </Card>

          <Card title="Rețete material">
            <form className="mb-4 grid gap-3 md:grid-cols-6" onSubmit={createRecipe}>
              <Input label="Denumire" value={recipeForm.denumire} onChange={event => setRecipeForm(f => ({ ...f, denumire: event.target.value }))} />
              <Select label="Tip" value={recipeForm.tip_tratament} onChange={event => setRecipeForm(f => ({ ...f, tip_tratament: event.target.value }))} options={[{ value: 'sare', label: 'Sare' }, { value: 'cacl', label: 'CaCl₂' }, { value: 'nisip', label: 'Nisip' }]} />
              <Input label="mc/cupă" type="number" step="0.001" value={recipeForm.mc_per_cupa} onChange={event => setRecipeForm(f => ({ ...f, mc_per_cupa: event.target.value }))} />
              <Input label="Densitate" type="number" step="0.001" value={recipeForm.densitate} onChange={event => setRecipeForm(f => ({ ...f, densitate: event.target.value }))} />
              <Input label="Factor" type="number" step="0.001" value={recipeForm.factor_corectie} onChange={event => setRecipeForm(f => ({ ...f, factor_corectie: event.target.value }))} />
              <Button className="self-end" type="submit">Adaugă rețetă</Button>
            </form>
            <Table columns={[{ key: 'denumire', label: 'Denumire' }, { key: 'tip_tratament', label: 'Tip' }, { key: 'mc_per_cupa', label: 'mc/cupă' }, { key: 'densitate', label: 'Densitate' }, { key: 'factor_corectie', label: 'Factor' }]} rows={recipes} />
          </Card>
        </div>
      )}

      <Modal open={modal === 'journal'} title="Jurnal nou" size="lg" onClose={() => setModal('')}>
        <form className="grid gap-4" onSubmit={createJournal}>
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Data" type="date" value={journalForm.data} onChange={event => setJournalForm(f => ({ ...f, data: event.target.value }))} />
            <Input label="Ofițer serviciu" value={nameOf(user)} readOnly />
          </div>
          <Input label="Condiții meteo" value={journalForm.conditii_meteo} onChange={event => setJournalForm(f => ({ ...f, conditii_meteo: event.target.value }))} />
          <Select label="Tip intervenție" value={journalForm.tip_interventie} onChange={event => setJournalForm(f => ({ ...f, tip_interventie: event.target.value }))} options={interventionOptions} />
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Observații
            <textarea className="min-h-24 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100" value={journalForm.observatii} onChange={event => setJournalForm(f => ({ ...f, observatii: event.target.value }))} />
          </label>
          <Button type="submit" disabled={saving || !activeSeasonId}>{saving ? 'Se salvează...' : 'Salvează jurnal'}</Button>
        </form>
      </Modal>

      <Modal open={modal === 'sheet'} title="Fișă traseu FAZ" size="xl" onClose={() => setModal('')}>
        <form className="grid max-h-[75vh] gap-4 overflow-y-auto pr-1" onSubmit={createRouteSheet}>
          <div className="grid gap-4 md:grid-cols-3">
            <Select label="Utilaj" value={sheetForm.utilaj_id} onChange={event => setSheetForm(f => ({ ...f, utilaj_id: event.target.value }))}>
              <option value="">Alege utilaj</option>
              {fleetAssets.map(asset => <option key={asset.id} value={asset.id}>{asset.nr_inmatriculare || asset.registration || asset.denumire || asset.name || asset.id}</option>)}
            </Select>
            <Input label="Nr. FAZ" value={sheetForm.nr_faz} onChange={event => setSheetForm(f => ({ ...f, nr_faz: event.target.value }))} />
            <Select label="Schimb" value={sheetForm.schimb} onChange={event => setSheetForm(f => ({ ...f, schimb: event.target.value }))} options={[{ value: 'zi', label: 'Zi (8-20)' }, { value: 'noapte', label: 'Noapte (20-8)' }]} />
            <Select label="Deservent 1" value={sheetForm.deservent_1_id} onChange={event => setSheetForm(f => ({ ...f, deservent_1_id: event.target.value }))}>
              <option value="">Alege angajat</option>
              {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.nume || emp.name || `${emp.prenume || ''} ${emp.nume || ''}` || emp.id}</option>)}
            </Select>
            <Select label="Deservent 2" value={sheetForm.deservent_2_id} onChange={event => setSheetForm(f => ({ ...f, deservent_2_id: event.target.value }))}>
              <option value="">Fără</option>
              {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.nume || emp.name || `${emp.prenume || ''} ${emp.nume || ''}` || emp.id}</option>)}
            </Select>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            Total cupe sare: {numberRo(sheetPreview.sare, 1)} × 600kg = <strong>{numberRo(sheetPreview.sare * 600, 0)} kg</strong> ·
            Total cupe CaCl₂: {numberRo(sheetPreview.cacl, 1)} × 600kg = <strong>{numberRo(sheetPreview.cacl * 600, 0)} kg</strong> ·
            Nisip: <strong>{numberRo(materialFormula('nisip', sheetPreview.nisip), 3)} tone</strong>
          </div>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">Străzi</h3>
            <Button type="button" variant="secondary" onClick={() => setSheetForm(f => ({ ...f, linii: [...f.linii, { sector_id: '', denumire: '', ora_plecare: '', lama: false, nr_treceri_lama: 0, nr_cupe_material: 0, tip_material: 'sare', nr_treceri_material: 1, ora_sosire: '' }] }))}>Adaugă stradă</Button>
          </div>
          {sheetForm.linii.map((line, index) => <SheetLineEditor key={index} line={line} index={index} onChange={updateSheetLine} onRemove={rowIndex => setSheetForm(f => ({ ...f, linii: f.linii.filter((_, i) => i !== rowIndex) }))} />)}
          <Button type="submit" disabled={saving}>{saving ? 'Se salvează...' : 'Salvează fișa'}</Button>
        </form>
      </Modal>

      <Modal open={modal === 'standby'} title="Timp la dispoziție" onClose={() => setModal('')}>
        <form className="grid gap-4" onSubmit={createStandby}>
          <Select label="Angajat" value={standbyForm.angajat_id} onChange={event => setStandbyForm(f => ({ ...f, angajat_id: event.target.value }))}>
            <option value="">Alege angajat</option>
            {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.nume || emp.name || `${emp.prenume || ''} ${emp.nume || ''}` || emp.id}</option>)}
          </Select>
          <Select label="Tip" value={standbyForm.tip_standby} onChange={event => setStandbyForm(f => ({ ...f, tip_standby: event.target.value }))}>
            <option value="consemn_acasa">Consemn acasă</option>
            <option value="asteptare_sediu">Așteptare sediu</option>
            <option value="asteptare_teren">Așteptare teren</option>
          </Select>
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Ora start" type="time" value={standbyForm.ora_start} onChange={event => setStandbyForm(f => ({ ...f, ora_start: event.target.value }))} />
            <Input label="Ora sfârșit" type="time" value={standbyForm.ora_sfarsit} onChange={event => setStandbyForm(f => ({ ...f, ora_sfarsit: event.target.value }))} />
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">Ore totale: <strong>{standbyCalc.ore}</strong> · Ore noapte: <strong>{standbyCalc.oreNoapte}</strong></div>
          <Input label="Observații" value={standbyForm.observatii} onChange={event => setStandbyForm(f => ({ ...f, observatii: event.target.value }))} />
          <Button type="submit">Salvează</Button>
        </form>
      </Modal>
    </div>
  )
}
