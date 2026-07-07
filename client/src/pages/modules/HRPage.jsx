import { useEffect, useMemo, useRef, useState } from 'react'
import api from '../../api/client'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import { exportExcel, exportPdf } from '../../utils/export'
import { useAuth } from '../../hooks/useAuth'

const SURSA_BADGE = {
  'autominder':    { label: 'AM',     color: 'blue',   title: 'Import Autominder' },
  'import':        { label: 'CSV',    color: 'green',  title: 'Import CSV/Excel' },
  'manual':        { label: 'HR',     color: 'purple', title: 'Creat manual' },
  'autominder+hr': { label: 'AM+HR',  color: 'teal',   title: 'Autominder + completat HR' },
}

function SursaBadge({ sursa }) {
  const info = SURSA_BADGE[sursa]
  if (!info) return null
  const colors = {
    blue:   'bg-blue-100 text-blue-700',
    green:  'bg-green-100 text-green-700',
    purple: 'bg-purple-100 text-purple-700',
    teal:   'bg-teal-100 text-teal-700',
  }
  return (
    <span
      title={info.title}
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${colors[info.color] || 'bg-slate-100 text-slate-600'}`}
    >
      {info.label}
    </span>
  )
}

const ALL_HR_TABS = [
  { id: 'Dashboard HR',       perm: 'hr:view' },
  { id: 'Angajați',           perm: 'hr:employees_manage' },
  { id: 'Pontaj',             perm: 'hr:timesheets_view' },
  { id: 'Pontaj Avansat',     perm: 'hr:timesheets_view' },
  { id: 'Ture & Program',     perm: 'hr:timesheets_view' },
  { id: 'Tichete masă',       perm: 'hr:manage' },
  { id: 'Overview pontaje',   perm: 'hr:timesheets_manage' },
  { id: 'Concedii',           perm: 'hr:leave_manage' },
  { id: 'Autorizații',        perm: 'hr:authorizations_manage' },
  { id: '🦺 Echipamente',      perm: 'echipamente:gestionar', fallbackPerm: 'hr:view' },
  { id: 'Training & Evaluări',perm: 'hr:training' },
  { id: 'Organigramă',        perm: 'hr:view' },
  { id: 'Documente HR',       perm: 'hr:contracts_manage' },
]

function currentMonth() {
  return new Date().toISOString().slice(0, 7)
}

function arrayFrom(data, keys) {
  if (Array.isArray(data)) return data
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key]
  }
  return []
}

function fullName(item) {
  return [item?.nume, item?.prenume].filter(Boolean).join(' ') || item?.name || 'Angajat'
}

function daysInMonth(month) {
  const [year, value] = month.split('-').map(Number)
  return Array.from({ length: new Date(year, value, 0).getDate() }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`)
}

function timesheetTone(value) {
  const raw = typeof value === 'object' ? value?.tip : value
  const text = String(raw || '').toLowerCase()
  if (['co', 'concediu', 'concediu_odihna'].includes(text)) return 'bg-amber-100 text-amber-900'
  if (['nemotivat', 'absent'].includes(text)) return 'bg-rose-100 text-rose-900'
  if (Number(raw) > 0 || ['lucru', 'prezent'].includes(text)) return 'bg-primary-50 text-primary-700'
  return 'bg-slate-100 text-slate-400'
}

function timesheetLabel(value) {
  if (typeof value === 'object') return value?.tip || value?.ore_lucrate || '-'
  return Number(value) > 0 ? Number(value) : '-'
}

function authTone(item) {
  if (item.expirat || Number(item.zile_pana_expirare) < 0) return 'danger'
  if (item.alert || Number(item.zile_pana_expirare) <= 30) return 'warning'
  return 'success'
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
}

function alertTone(days) {
  if (days === null) return null
  if (days < 0) return 'danger'
  if (days <= 30) return 'warning'
  return null
}

function infoCnp(cnp) {
  const value = String(cnp || '').replace(/[^0-9]/g, '')
  if (!/^\d{13}$/.test(value)) return null
  const s = Number(value[0])
  const century = { 1: 1900, 2: 1900, 3: 1800, 4: 1800, 5: 2000, 6: 2000, 7: 2000, 8: 2000, 9: 1900 }[s]
  const year = century + Number(value.slice(1, 3))
  const month = Number(value.slice(3, 5))
  const day = Number(value.slice(5, 7))
  const birth = new Date(year, month - 1, day)
  if (birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth.getDate() !== day) return null
  let age = new Date().getFullYear() - year
  const now = new Date()
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age -= 1
  return { sex: s % 2 ? 'M' : 'F', data_nasterii: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, varsta: age }
}

const emptyEmployeeForm = {
  cnp: '', nume: '', prenume: '', marca: '', functia: '',
  department_id: '', tip_contract: 'CIM_nedeterminat',
  data_angajare: '', email: '', telefon: '', activ: true,
  adresa: '', stare_civila: '', iban: '', salariu_baza: '',
  data_expirare_contract: '', data_expirare_permis: '',
  data_expirare_iscir: '', adeverinta_medicala: '',
  nr_copii_intretinere: 0, casa_sanatate: '',
  functie_cor: '', nivel_studii: '', norma_ore_zi: 8,
  deducere_personala: '',
  permis_conducere_categorii: '', permis_conducere_expira: '',
  apt_medical_expira: '', acord_gdpr: false, data_acord_gdpr: '',
  act_identitate_tip: 'CI', act_identitate_serie: '', act_identitate_numar: '',
  act_identitate_eliberat_de: '', act_identitate_data_eliberare: '', act_identitate_valabil_pana: '',
  zile_co_drept: 21,
}

function AlertRow({ label, date, icon }) {
  const days = daysUntil(date)
  const tone = alertTone(days)
  if (!tone) return null
  return (
    <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${tone === 'danger' ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'}`}>
      <span className="text-xl">{icon}</span>
      <div className="flex-1 text-sm">
        <div className={`font-semibold ${tone === 'danger' ? 'text-rose-800' : 'text-amber-800'}`}>{label}</div>
        <div className={tone === 'danger' ? 'text-rose-600' : 'text-amber-600'}>
          {days < 0 ? `Expirat de ${Math.abs(days)} zile` : `Expiră în ${days} zile (${date})`}
        </div>
      </div>
    </div>
  )
}

function OrgChart({ employees, departments, onClickEmployee }) {
  const byDept = useMemo(() => {
    const map = new Map()
    // Add a bucket for employees without department
    employees.filter(e => e.activ !== false && e.activ !== 0).forEach(emp => {
      const deptId = String(emp.department_id || emp.dept_id || '__none__')
      const deptName = emp.department_name || emp.department || (deptId === '__none__' ? 'Fără departament' : deptId)
      if (!map.has(deptId)) map.set(deptId, { name: deptName, employees: [] })
      map.get(deptId).employees.push(emp)
    })
    return [...map.entries()].map(([id, val]) => ({ id, ...val }))
  }, [employees])

  return (
    <div className="overflow-auto">
      <div className="flex flex-nowrap items-start gap-4 pb-4">
        {byDept.map(dept => (
          <div key={dept.id} className="flex-shrink-0">
            <div className="mb-3 rounded-xl border-2 border-primary-300 bg-primary-50 px-4 py-2 text-center text-sm font-bold text-primary-800 shadow-sm">
              {dept.name}
              <div className="text-xs font-normal text-primary-500">{dept.employees.length} angajați</div>
            </div>
            <div className="ml-6 border-l-2 border-dashed border-slate-300 pl-4">
              <div className="grid gap-2">
                {dept.employees.map(emp => (
                  <button
                    key={emp.id}
                    className="group flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 text-left text-sm shadow-sm transition hover:border-primary-400 hover:shadow-md active:scale-95"
                    onClick={() => onClickEmployee(emp)}
                  >
                    {emp.photo_url
                      ? <img src={emp.photo_url} alt="" className="h-9 w-9 rounded-full object-cover ring-1 ring-slate-200" onError={e => { e.target.style.display='none' }} />
                      : <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg">👤</div>
                    }
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-800 group-hover:text-primary-700">{fullName(emp)}</div>
                      <div className="truncate text-xs text-slate-400">{emp.functia || '—'}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
        {byDept.length === 0 ? <p className="py-12 text-sm text-slate-400">Nu există angajați activi.</p> : null}
      </div>
    </div>
  )
}

function EmployeeFilesPanel({ employeeId, canManage, onError }) {
  const [items, setItems] = useState([])
  const [file, setFile] = useState(null)
  const [type, setType] = useState('contract')
  const [busy, setBusy] = useState(false)
  async function loadFiles() {
    try { const response = await api.get(`/hr/employees/${employeeId}/files`); setItems(response.data?.items || []) } catch (error) { onError(error.response?.data?.error || 'Dosarul electronic nu a putut fi incarcat.') }
  }
  useEffect(() => { if (employeeId) loadFiles() }, [employeeId])
  async function uploadFile() {
    if (!file) return
    try {
      setBusy(true)
      const form = new FormData(); form.append('file', file); form.append('tip', type); form.append('denumire', file.name)
      await api.post(`/hr/employees/${employeeId}/files`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
      setFile(null); await loadFiles()
    } catch (error) { onError(error.response?.data?.error || 'Documentul nu a putut fi incarcat.') } finally { setBusy(false) }
  }
  async function downloadFile(item) {
    try {
      const response = await api.get(`/hr/employees/${employeeId}/files/${item.id}/download`, { responseType: 'blob' })
      const url = URL.createObjectURL(response.data); const anchor = document.createElement('a'); anchor.href = url; anchor.download = item.file_name; anchor.click(); URL.revokeObjectURL(url)
    } catch (error) { onError(error.response?.data?.error || 'Documentul nu a putut fi descarcat.') }
  }
  return <div className="rounded-lg border border-slate-200 p-3"><div className="mb-3 flex items-center justify-between"><div><div className="font-semibold">Dosar electronic</div><div className="text-xs text-slate-500">Contracte, acte, diplome si documente medicale.</div></div><Button size="sm" variant="secondary" onClick={loadFiles}>Reincarca</Button></div>{canManage ? <div className="mb-3 grid gap-2 sm:grid-cols-[180px_1fr_auto]"><Select value={type} onChange={event => setType(event.target.value)} options={[{value:'contract',label:'Contract'}, {value:'act_aditional',label:'Act aditional'}, {value:'identitate',label:'Act identitate'}, {value:'medical',label:'Medical'}, {value:'diploma',label:'Diploma'}, {value:'altul',label:'Altul'}]} /><Input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx" onChange={event => setFile(event.target.files?.[0] || null)} /><Button onClick={uploadFile} disabled={!file || busy}>{busy ? 'Se incarca...' : 'Incarca'}</Button></div> : null}<div className="grid gap-2">{items.map(item => <div key={item.id} className="flex items-center justify-between gap-2 rounded border border-slate-100 px-3 py-2 text-sm"><div><strong>{item.denumire}</strong><div className="text-xs text-slate-500">{item.tip} · {Math.ceil(Number(item.file_size || 0) / 1024)} KB</div></div><Button size="sm" variant="secondary" onClick={() => downloadFile(item)}>Descarca</Button></div>)}{!items.length ? <div className="text-sm text-slate-500">Nu exista documente incarcate.</div> : null}</div></div>
}

export default function HRPage() {
  const { user } = useAuth()

  // Calculare tabs accesibile pe baza permisiunilor utilizatorului
  const hasPerm = (perm) =>
    ['superadmin', 'admin'].includes(user?.role) ||
    (Array.isArray(user?.permissions) && user.permissions.includes(perm))

  const tabs = ALL_HR_TABS.filter(t => hasPerm(t.perm) || (t.fallbackPerm && hasPerm(t.fallbackPerm))).map(t => t.id)

  const [activeTab, setActiveTab] = useState(() => tabs[0] || 'Dashboard HR')
  const [employees, setEmployees] = useState([])
  const [configuredDepartments, setConfiguredDepartments] = useState([])
  const [monthlySheet, setMonthlySheet] = useState([])
  const [leaves, setLeaves] = useState([])
  const [authorizations, setAuthorizations] = useState([])
  const [timesheetOverview, setTimesheetOverview] = useState([])
  const [stats, setStats] = useState(null)
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [employeeDetails, setEmployeeDetails] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [transferHistory, setTransferHistory] = useState([])
  const [employeeForm, setEmployeeForm] = useState(emptyEmployeeForm)
  const [employeeModal, setEmployeeModal] = useState(false)
  const [importModal, setImportModal] = useState(false)
  const [nexusExportModal, setNexusExportModal] = useState(false)
  const [nexusExportForm, setNexusExportForm] = useState({ luna: currentMonth(), dept_id: '' })
  const [importFile, setImportFile] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const [deadlineDate, setDeadlineDate] = useState('')
  const [timesheetLock, setTimesheetLock] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [photoFile, setPhotoFile] = useState(null)
  const [coBalance, setCoBalance] = useState(null)
  const [adeverintaTip, setAdeverintaTip] = useState('salariat')
  const [adeverintaData, setAdeverintaData] = useState(null)
  // Pontaj avansat
  const [raportLunar, setRaportLunar] = useState(null)
  const [raportEmployee, setRaportEmployee] = useState('')
  const [overtimeBank, setOvertimeBank] = useState(null)
  const [compensateModal, setCompensateModal] = useState(false)
  const [compensateForm, setCompensateForm] = useState({ tip: 'timp_liber', ore: '', data: new Date().toISOString().slice(0, 10) })
  // Ture & Program
  const [tures, setTures] = useState([])
  const [scheduleEmployees, setScheduleEmployees] = useState([])
  const [scheduleData, setScheduleData] = useState({})
  const [scheduleMonth, setScheduleMonth] = useState(currentMonth())
  const [scheduleDept, setScheduleDept] = useState('')
  const [shiftModal, setShiftModal] = useState(false)
  const [shiftForm, setShiftForm] = useState({ nume: '', ora_start: '08:00', ora_sfarsit: '16:00', ore_normale: 8, culoare: '#3B82F6' })
  // Tichete masă
  const [mealMonth, setMealMonth] = useState(currentMonth())
  const [mealDept, setMealDept] = useState('')
  const [mealRows, setMealRows] = useState([])
  const [mealConfig, setMealConfig] = useState({ valoare_tichet: 40 })
  // Training & Evaluări
  const [evaluations, setEvaluations] = useState([])
  const [scadentar, setScadentar] = useState([])
  const [evalForm, setEvalForm] = useState({ employee_id: '', data_evaluare: '', tip: 'periodica', calificativ: 'B', punctaj: '', observatii: '', obiective: '', recomandari: '' })
  const [evalModal, setEvalModal] = useState(false)
  const [evalEditing, setEvalEditing] = useState(null)
  const [equipmentTab, setEquipmentTab] = useState('Necesar per Departament')
  const [equipmentRows, setEquipmentRows] = useState([])
  const [equipmentOrder, setEquipmentOrder] = useState([])
  const [equipmentExpiry, setEquipmentExpiry] = useState([])
  const [equipmentCatalog, setEquipmentCatalog] = useState([])
  const [equipmentSuppliers, setEquipmentSuppliers] = useState([])
  const [catalogModal, setCatalogModal] = useState(false)
  const [catalogEditing, setCatalogEditing] = useState(null)
  const [catalogForm, setCatalogForm] = useState({ denumire: '', categorie: 'protectie', are_marime: true, are_serie: false, are_expirare: true, durata_luni: 12, valoare_inventar: 0, cod_articol: '', furnizor_id: '', marimi: '', activ: true })
  const [employeeEquipment, setEmployeeEquipment] = useState(null)
  const [dotareModal, setDotareModal] = useState(false)
  const [dotareForm, setDotareForm] = useState({ angajat_id: '', tip_id: '', marime: '', numar_serie: '', valoare_inventar: '', data_dotare: new Date().toISOString().slice(0, 10), cantitate: 1, stare: 'nou', observatii: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({ dept_id: '', activ: '', luna: currentMonth(), tip: '', alert: '' })
  const photoInputRef = useRef()
  const userPermissions = Array.isArray(user?.permissions) ? user.permissions : []
  const userRoles = Array.from(new Set([...(Array.isArray(user?.roles) ? user.roles : []), user?.role].filter(Boolean).map(String)))
  const isAdmin = userRoles.some(role => ['superadmin', 'admin'].includes(role))
  const hasPermission = permission => isAdmin || userPermissions.includes(permission)
  const isHRPontaj = hasPermission('hr:manage') || hasPermission('hr:timesheets_manage')
  const isSefPontaj = hasPermission('hr:timesheet_dept')
  const canUsePontaj = isHRPontaj || isSefPontaj
  const canManageEquipment = isAdmin || hasPermission('echipamente:gestionar') || hasPermission('hr:manage')
  const ownDepartmentKey = user?.departmentId || user?.department_id || user?.dept_id || user?.department || user?.departament || ''

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [employeesRes, departmentsRes, sheetRes, leavesRes, authRes, statsRes] = await Promise.all([
        api.get('/hr/employees'),
        api.get('/departments').catch(() => ({ data: { departments: [] } })),
        api.get('/hr/timesheets/monthly-sheet', { params: { luna: filters.luna, dept_id: (!isHRPontaj && isSefPontaj ? ownDepartmentKey : filters.dept_id) || undefined } }).catch(() => ({ data: [] })),
        api.get('/hr/leave-requests').catch(() => ({ data: [] })),
        api.get('/hr/authorizations').catch(() => ({ data: [] })),
        api.get('/hr/stats').catch(() => ({ data: {} })),
      ])
      setEmployees(arrayFrom(employeesRes.data, ['employees', 'items']))
      setConfiguredDepartments(arrayFrom(departmentsRes.data, ['departments', 'items']))
      setMonthlySheet(arrayFrom(sheetRes.data, ['rows', 'sheet', 'items']))
      setLeaves(arrayFrom(leavesRes.data, ['leave_requests', 'requests', 'items']))
      setAuthorizations(arrayFrom(authRes.data, ['authorizations', 'items']))
      setStats(statsRes.data || {})
      const overviewRes = await api.get('/hr/timesheets/overview', { params: { luna: filters.luna } }).catch(() => ({ data: [] }))
      setTimesheetOverview(arrayFrom(overviewRes.data, ['overview', 'items']))
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut incarca datele HR.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    Promise.resolve().then(() => load())
  }, [filters.luna, filters.dept_id])

  useEffect(() => {
    if (activeTab === 'Pontaj' && !canUsePontaj) setActiveTab('Dashboard HR')
  }, [activeTab, canUsePontaj])

  useEffect(() => {
    if (activeTab === 'Training & Evaluări') loadTrainingData()
  }, [activeTab])

  useEffect(() => {
    if (activeTab === 'Ture & Program') loadScheduleData()
  }, [activeTab, scheduleMonth, scheduleDept])

  useEffect(() => {
    if (activeTab === 'Tichete masă') loadMealTickets()
  }, [activeTab, mealMonth, mealDept])

  useEffect(() => {
    if (activeTab === '🦺 Echipamente') loadEquipmentData()
  }, [activeTab])

  async function openEmployee(employee) {
    setSelectedEmployee(employee)
    setEmployeeDetails(null)
    setCoBalance(null)
    setEditMode(false)
    setPhotoPreview(null)
    setPhotoFile(null)
    setEmployeeEquipment(null)
    try {
      const [detailsRes, coRes, equipmentRes, transfersRes] = await Promise.all([
        api.get(`/hr/employees/${employee.id}`),
        api.get(`/hr/employees/${employee.id}/co-balance`).catch(() => ({ data: null })),
        api.get(`/hr/echipamente/angajat/${employee.id}`).catch(() => ({ data: null })),
        api.get(`/hr/employees/${employee.id}/transfers`).catch(() => ({ data: [] })),
      ])
      setEmployeeDetails(detailsRes.data)
      setEditForm({ ...detailsRes.data, department_transfer_date: new Date().toISOString().slice(0, 10), department_transfer_reason: '' })
      setCoBalance(coRes.data)
      setEmployeeEquipment(equipmentRes.data)
      setTransferHistory(arrayFrom(transfersRes.data, ['transfers', 'items']))
    } catch {
      setEmployeeDetails(employee)
      setEditForm({ ...employee })
    }
  }

  async function loadRaportLunar(employeeId, luna) {
    if (!employeeId) return
    try {
      const [response, bankRes] = await Promise.all([
        api.get(`/hr/timesheets/raport-lunar/${employeeId}`, { params: { luna } }),
        api.get('/hr/overtime-bank', { params: { employee_id: employeeId } }).catch(() => ({ data: null })),
      ])
      setRaportLunar(response.data)
      setOvertimeBank(bankRes.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Eroare la încărcarea raportului.')
    }
  }

  async function loadScheduleData() {
    try {
      const [turesRes, scheduleRes] = await Promise.all([
        api.get('/hr/tures'),
        api.get('/hr/schedule', { params: { luna: scheduleMonth, department: scheduleDept || undefined } }),
      ])
      setTures(arrayFrom(turesRes.data, ['tures', 'items']))
      setScheduleEmployees(arrayFrom(scheduleRes.data?.employees || scheduleRes.data, ['employees', 'items']))
      setScheduleData(scheduleRes.data?.schedule || {})
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut încărca turele.')
    }
  }

  async function createShift(event) {
    event.preventDefault()
    try {
      await api.post('/hr/tures', shiftForm)
      setShiftModal(false)
      setShiftForm({ nume: '', ora_start: '08:00', ora_sfarsit: '16:00', ore_normale: 8, culoare: '#3B82F6' })
      await loadScheduleData()
    } catch (err) {
      setError(err.response?.data?.error || 'Tura nu a putut fi creată.')
    }
  }

  async function setScheduleShift(employeeId, data, turaId) {
    try {
      await api.post('/hr/schedule', { employee_id: employeeId, data, tura_id: turaId || null, department: scheduleDept || undefined })
      setScheduleData(prev => ({ ...prev, [`${employeeId}:${data}`]: turaId || null }))
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut salva tura.')
    }
  }

  async function loadMealTickets() {
    try {
      const [configRes, rowsRes] = await Promise.all([
        api.get('/hr/meal-tickets/config'),
        api.get('/hr/meal-tickets', { params: { luna: mealMonth, department: mealDept || undefined } }),
      ])
      setMealConfig(configRes.data || { valoare_tichet: 40 })
      setMealRows(arrayFrom(rowsRes.data?.rows || rowsRes.data, ['rows', 'items']))
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut calcula tichetele de masă.')
    }
  }

  async function saveMealConfig() {
    try {
      await api.post('/hr/meal-tickets/config', mealConfig)
      await loadMealTickets()
    } catch (err) {
      setError(err.response?.data?.error || 'Valoarea tichetului nu a putut fi salvată.')
    }
  }

  async function exportMealTicketsCsv() {
    const response = await api.get('/hr/meal-tickets/export', {
      params: { luna: mealMonth, department: mealDept || undefined },
      responseType: 'blob',
    })
    const url = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url
    link.download = `tichete-masa-${mealMonth}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  async function exportNexusTimesheet(event) {
    event.preventDefault()
    try {
      const deptId = (!isHRPontaj && isSefPontaj ? ownDepartmentKey : nexusExportForm.dept_id) || undefined
      const response = await api.get('/hr/timesheets/export-nexus', {
        params: { luna: nexusExportForm.luna, dept_id: deptId },
        responseType: 'blob',
      })
      const url = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      const department = departments.find(item => String(item.value) === String(deptId))?.label || 'Toate_departamentele'
      const [year, month] = nexusExportForm.luna.split('-').map(Number)
      const monthName = new Intl.DateTimeFormat('ro-RO', { month: 'long' }).format(new Date(year, month - 1, 1)).toUpperCase()
      link.href = url
      link.download = `Pontaj_${department.replace(/[^a-zA-Z0-9_-]+/g, '_')}_${monthName}_${year}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setNexusExportModal(false)
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut exporta pontajul Nexus.')
    }
  }

  async function loadEquipmentData() {
    try {
      const [reportRes, expiryRes, catalogRes] = await Promise.all([
        api.get('/hr/echipamente/raport-necesar'),
        api.get('/hr/echipamente/expirari', { params: { zile: 90 } }),
        api.get('/echipamente/catalog'),
      ])
      setEquipmentRows(reportRes.data.rows || [])
      setEquipmentOrder(reportRes.data.comanda || [])
      setEquipmentExpiry(expiryRes.data.rows || [])
      setEquipmentCatalog(catalogRes.data.catalog || [])
      setEquipmentSuppliers(catalogRes.data.furnizori || [])
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut încărca echipamentele.')
    }
  }

  async function loadEmployeeEquipment(employeeId) {
    const response = await api.get(`/hr/echipamente/angajat/${employeeId}`)
    setEmployeeEquipment(response.data)
  }

  async function saveEmployeeSizes(tipId, marime) {
    if (!employeeDetails) return
    const response = await api.put(`/hr/echipamente/angajat/${employeeDetails.id}/marimi`, { marimi: { [tipId]: marime } })
    setEmployeeEquipment(response.data)
  }

  async function saveDotare(event) {
    event.preventDefault()
    await api.post('/hr/echipamente/dotare', dotareForm)
    setDotareModal(false)
    if (employeeDetails) await loadEmployeeEquipment(employeeDetails.id)
    await loadEquipmentData()
  }

  function openCatalogModal(item = null) {
    setCatalogEditing(item)
    setCatalogForm(item ? { ...item, marimi: (item.marimi || []).join(', ') } : { denumire: '', categorie: 'protectie', are_marime: true, are_serie: false, are_expirare: true, durata_luni: 12, valoare_inventar: 0, cod_articol: '', furnizor_id: '', marimi: '', activ: true })
    setCatalogModal(true)
  }

  async function saveCatalogItem(event) {
    event.preventDefault()
    const payload = { ...catalogForm, durata_luni: Number(catalogForm.durata_luni || 0), valoare_inventar: Number(catalogForm.valoare_inventar || 0), marimi: String(catalogForm.marimi || '').split(',').map(item => item.trim()).filter(Boolean) }
    if (catalogEditing) await api.put(`/echipamente/catalog/${catalogEditing.id}`, payload)
    else await api.post('/echipamente/catalog', payload)
    setCatalogModal(false)
    await loadEquipmentData()
    if (employeeDetails) await loadEmployeeEquipment(employeeDetails.id)
  }

  async function setReturnedEquipment(item, predat) {
    await api.post(`/hr/echipamente/dotari/${item.id}/predare`, { predat })
    if (employeeDetails) await loadEmployeeEquipment(employeeDetails.id)
  }

  async function exportEquipmentOrder() {
    const response = await api.get('/hr/echipamente/comanda-excel', { responseType: 'blob' })
    const url = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url
    link.download = `Comanda_echipamente_${new Date().toISOString().slice(0, 10)}.xlsx`
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url)
  }

  async function createEquipmentReferat() {
    const response = await api.post('/hr/echipamente/creeaza-referat', {})
    setError('')
    window.alert(`Referat ${response.data.referat.serie}/${response.data.referat.numar} creat în status draft.`)
  }

  async function compensateOvertime(event) {
    event.preventDefault()
    if (!raportEmployee) return
    try {
      await api.post('/hr/overtime-bank/compensate', { ...compensateForm, employee_id: raportEmployee })
      setCompensateModal(false)
      setCompensateForm({ tip: 'timp_liber', ore: '', data: new Date().toISOString().slice(0, 10) })
      const response = await api.get('/hr/overtime-bank', { params: { employee_id: raportEmployee } })
      setOvertimeBank(response.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Compensarea nu a putut fi salvată.')
    }
  }

  async function loadTrainingData() {
    try {
      const [evalsRes, scadRes] = await Promise.all([
        api.get('/hr/evaluations'),
        api.get('/hr/training/scadentar'),
      ])
      setEvaluations(Array.isArray(evalsRes.data) ? evalsRes.data : [])
      setScadentar(Array.isArray(scadRes.data) ? scadRes.data : [])
    } catch { /* ignore */ }
  }

  async function saveEvaluation(event) {
    event.preventDefault()
    setError('')
    try {
      if (evalEditing) {
        await api.patch(`/hr/evaluations/${evalEditing.id}`, evalForm)
      } else {
        await api.post('/hr/evaluations', evalForm)
      }
      setEvalModal(false)
      setEvalEditing(null)
      setEvalForm({ employee_id: '', data_evaluare: '', tip: 'periodica', calificativ: 'B', punctaj: '', observatii: '', obiective: '', recomandari: '' })
      await loadTrainingData()
    } catch (err) {
      setError(err.response?.data?.error || 'Eroare la salvarea evaluării.')
    }
  }

  async function deleteEvaluation(id) {
    if (!window.confirm('Ștergi evaluarea?')) return
    try {
      await api.delete(`/hr/evaluations/${id}`)
      await loadTrainingData()
    } catch { setError('Eroare la ștergere.') }
  }

  function identityText(emp) {
    const tip = emp.act_identitate_tip || 'CI'
    const serie = String(emp.act_identitate_serie || '').toUpperCase()
    const numar = emp.act_identitate_numar || ''
    const eliberatDe = emp.act_identitate_eliberat_de || ''
    if (!serie && !numar && !eliberatDe) return 'posesor/posesoare al/a BI/CI seria ____ nr. __________'
    return `posesor/posesoare al/a ${tip} seria ${serie || '____'} nr. ${numar || '__________'}${eliberatDe ? `, eliberat/ă de ${eliberatDe}` : ''}`
  }

  function printGeneratedHtml(html, data = {}) {
    const generatedAt = data.data_generare || data.data || new Date().toISOString().slice(0, 10)
    const docNo = data.numar || data.nr_cim || '____'
    const footer = `<div style="position:fixed;bottom:10mm;left:0;right:0;width:100%;text-align:center;font-size:8pt;color:#999;border-top:1px solid #ddd;padding-top:4pt;background:white">Document generat electronic din aplicația InfraFlow la data de ${generatedAt}. Nr. ${docNo}.</div>`
    const output = String(html || '').replace('</body>', `${footer}</body>`)
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(output)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 400)
  }

  function printCIM(data) {
    if (!data) return
    const emp = data.angajat || {}
    const co = data.company || {}
    const contract = data.contract || {}
    const html = `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>CIM</title>
<style>
  body{font-family:Times New Roman,serif;font-size:11pt;margin:2cm;color:#000}
  h2{text-align:center;font-size:14pt;margin:8px 0}
  h3{font-size:12pt;margin:12px 0 4px}
  p,li{margin:4px 0;line-height:1.7}
  .bold{font-weight:bold}
  table{width:100%;border-collapse:collapse;margin:8px 0}
  td,th{border:1px solid #555;padding:4px 8px;font-size:10pt}
  .signatures{margin-top:48px;display:flex;justify-content:space-between}
  .signatures div{text-align:center;min-width:180px}
  @media print{body{margin:1.5cm 2cm}}
</style></head><body>
<h2>CONTRACT INDIVIDUAL DE MUNCĂ</h2>
<p style="text-align:center">Nr. <span class="bold">${data.nr_cim}</span> / data: <span class="bold">${data.data_generare}</span></p>
<hr>
<h3>I. ANGAJATOR</h3>
<table><tr><td><strong>Denumire</strong></td><td>${co.denumire}</td><td><strong>CUI</strong></td><td>${co.cui}</td></tr>
<tr><td><strong>Adresă</strong></td><td colspan="3">${co.adresa}</td></tr>
<tr><td><strong>Nr. înregistrare</strong></td><td>${co.nr_inregistrare || '—'}</td><td><strong>Reprezentant legal</strong></td><td>${co.reprezentant} (${co.functie_reprezentant})</td></tr></table>
<h3>II. SALARIAT</h3>
<table><tr><td><strong>Nume și prenume</strong></td><td>${emp.prenume || ''} ${emp.nume || ''}</td><td><strong>CNP</strong></td><td>${emp.cnp || '—'}</td></tr>
<tr><td><strong>Adresă domiciliu</strong></td><td colspan="3">${emp.adresa || '—'}</td></tr>
<tr><td><strong>Stare civilă</strong></td><td>${emp.stare_civila || '—'}</td><td><strong>Nr. marcă</strong></td><td>${emp.marca || '—'}</td></tr></table>
<h3>III. OBIECTUL CONTRACTULUI</h3>
<p>Angajatorul angajează salariatul în funcția de <span class="bold">${emp.functia || '—'}</span>, în cadrul departamentului <span class="bold">${emp.department_name || '—'}</span>.</p>
<h3>IV. DURATA CONTRACTULUI</h3>
<p>Tip contract: <span class="bold">${emp.tip_contract || contract.tip || '—'}</span></p>
<p>Data începerii activității: <span class="bold">${emp.data_angajare || '—'}</span></p>
${emp.data_expirare_contract ? `<p>Data încetării (determinat): <span class="bold">${emp.data_expirare_contract}</span></p>` : ''}
<h3>V. LOCUL DE MUNCĂ</h3>
<p>Loc de muncă: sediu angajator / teren — conform specificului activității.</p>
<h3>VI. DURATA MUNCII</h3>
<p>Program de lucru: <span class="bold">8 ore/zi, 40 ore/săptămână</span></p>
<h3>VII. SALARIUL</h3>
<p>Salariu de bază brut lunar: <span class="bold">${emp.salariu_baza ? emp.salariu_baza + ' RON' : '_____ RON'}</span></p>
<h3>VIII. CONCEDIU</h3>
<p>Durata concediului anual de odihnă: <span class="bold">${emp.zile_co_drept ?? 21} zile lucrătoare</span></p>
<h3>IX. ALTE CLAUZE</h3>
<p>Salariatul se obligă să respecte regulamentul intern, normele SSM și PSI ale angajatorului.</p>
<div class="signatures">
  <div><p><strong>ANGAJATOR</strong></p><p>${co.reprezentant}</p><p>Semnătură: ________________</p><p>Data: ${data.data_generare}</p></div>
  <div><p><strong>SALARIAT</strong></p><p>${emp.prenume || ''} ${emp.nume || ''}</p><p>Semnătură: ________________</p><p>Data: ________________</p></div>
</div>
</body></html>`
    printGeneratedHtml(html, data)
  }

  async function loadAdeverinta(employeeId) {
    try {
      const response = await api.get(`/hr/employees/${employeeId}/adeverinta`, { params: { tip: adeverintaTip } })
      setAdeverintaData(response.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Eroare la generare adeverință.')
    }
  }

  function printAdeverinta(data) {
    if (!data) return
    const emp = data.angajat || {}
    const co = data.company || {}
    const tipLabels = {
      venit: 'ADEVERINȚĂ DE VENIT',
      vechime: 'ADEVERINȚĂ DE VECHIME ÎN MUNCĂ',
      casa_sanatate: 'ADEVERINȚĂ ASIGURAT CASA DE SĂNĂTATE',
      concediu_medical: 'ADEVERINȚĂ CONCEDIU MEDICAL',
      functie: 'ADEVERINȚĂ FUNCȚIE',
      salariat: 'ADEVERINȚĂ DE SALARIAT',
    }
    const tipLabel = tipLabels[data.tip] || 'ADEVERINȚĂ'
    const extraText = {
      vechime: `<p>Numitul/Numita <span class="bold">${emp.prenume || ''} ${emp.nume || ''}</span> are o vechime în muncă de <span class="bold">${data.vechime?.ani || 0} ani și ${data.vechime?.luni || 0} luni</span>, calculată de la data angajării <span class="bold">${emp.data_angajare || '____________________'}</span>.</p>`,
      casa_sanatate: `<p>Prezenta adeverință atestă calitatea de salariat asigurat pentru casa de sănătate <span class="bold">${emp.casa_sanatate || '____________________'}</span>, cu CNP <span class="bold">${emp.cnp || '_______________'}</span>.</p>`,
      concediu_medical: `<p>Salariatul/a a beneficiat de <span class="bold">${data.zile_concediu_medical_12_luni || 0} zile</span> concediu medical în perioada ultimelor 12 luni.</p>`,
      functie: `<p>Salariatul/a ocupă funcția de <span class="bold">${emp.functia || '____________________'}</span> în departamentul <span class="bold">${emp.department_name || '____________________'}</span>.</p>`,
    }[data.tip] || ''
    const bodyHtml = `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>${tipLabel}</title>
<style>
  body { font-family: Times New Roman, serif; font-size: 12pt; margin: 2cm; color: #000; }
  h2 { text-align: center; text-transform: uppercase; margin-bottom: 6px; }
  .nr { text-align: center; color: #555; margin-bottom: 24px; }
  p { margin: 6px 0; line-height: 1.8; }
  .bold { font-weight: bold; }
  .signature { margin-top: 48px; display: flex; justify-content: space-between; }
  .signature div { text-align: center; min-width: 180px; }
  @media print { body { margin: 1.5cm 2cm; } }
</style></head><body>
<h2>${co.denumire || 'Societatea'}</h2>
<p style="text-align:center">${co.adresa || ''} ${co.cui ? '· CUI: ' + co.cui : ''}</p>
<hr style="margin:16px 0">
<h2>${tipLabel}</h2>
<div class="nr">Nr. ${data.numar} / ${data.data}</div>
<p>Subsemnatul/a, <span class="bold">${co.reprezentant || '____________________'}</span>, în calitate de <span class="bold">${co.functie_reprezentant || 'Director General'}</span> al ${co.denumire || '____________________'},</p>
<p>certifică prin prezenta că <span class="bold">${emp.prenume || ''} ${emp.nume || ''}</span>, ${identityText(emp)}, CNP <span class="bold">${emp.cnp || '_______________'}</span>,</p>
<p>este ${String(emp.activ !== false ? 'angajat(ă)' : 'a fost angajat(ă)')} în cadrul societății noastre, în funcția de <span class="bold">${emp.functia || '____________________'}</span>,</p>
<p>cu contract individual de muncă tip <span class="bold">${emp.tip_contract || '____________________'}</span>, începând cu data de <span class="bold">${emp.data_angajare || '____________________'}</span>.</p>
${data.tip === 'venit' && emp.salariu_baza ? `<p>Salariul brut de bază este de <span class="bold">${emp.salariu_baza} RON</span>.</p>` : ''}
${extraText}
<p>Adeverința se eliberează la cererea persoanei în cauză, pentru a-i servi <span class="bold">la toate instituțiile unde va fi prezentată</span>.</p>
<div class="signature">
  <div><p>Director General</p><p>${co.reprezentant || '____________________'}</p><p>Semnătură: ________________</p></div>
  <div><p>Responsabil HR</p><p>____________________</p><p>Semnătură: ________________</p></div>
</div>
</body></html>`
    printGeneratedHtml(bodyHtml, data)
  }

  function printFisaPost(data) {
    if (!data) return
    const emp = data.angajat || {}
    const co = data.company || {}
    const html = `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>Fișa postului</title>
<style>body{font-family:Times New Roman,serif;font-size:11pt;margin:2cm;color:#000}h2{text-align:center;font-size:14pt;margin:8px 0}h3{font-size:12pt;margin:10px 0 4px;border-bottom:1px solid #999;padding-bottom:3px}p,li{margin:4px 0;line-height:1.7}table{width:100%;border-collapse:collapse;margin:8px 0}td,th{border:1px solid #888;padding:4px 8px;font-size:10pt}.sig{margin-top:40px;display:flex;justify-content:space-between}.sig div{text-align:center;min-width:160px}@media print{body{margin:1.5cm 2cm}}</style></head><body>
<h2>${co.denumire || 'SOCIETATEA'}</h2>
<h2>FIȘA POSTULUI</h2>
<p style="text-align:center;color:#555">Data: ${data.data || new Date().toISOString().slice(0,10)}</p>
<h3>I. Identificarea postului</h3>
<table>
  <tr><td width="40%"><strong>Denumirea postului</strong></td><td>${emp.functia || '______________________________'}</td></tr>
  <tr><td><strong>Titular post</strong></td><td>${emp.prenume || ''} ${emp.nume || ''}</td></tr>
  <tr><td><strong>Departament / Compartiment</strong></td><td>${emp.department_name || '______________________________'}</td></tr>
  <tr><td><strong>Subordonat față de</strong></td><td>Șeful departamentului / Director General</td></tr>
  <tr><td><strong>Normă de lucru</strong></td><td>${emp.norma_ore_zi || 8} ore/zi, 5 zile/săptămână</td></tr>
  <tr><td><strong>Tip contract</strong></td><td>${emp.tip_contract || 'nedeterminat'}</td></tr>
</table>
<h3>II. Cerințe pentru ocuparea postului</h3>
<table>
  <tr><td width="40%"><strong>Nivel studii</strong></td><td>${emp.nivel_studii || '______________________________'}</td></tr>
  <tr><td><strong>Experiență necesară</strong></td><td>Minim 1 an în domeniu</td></tr>
  <tr><td><strong>Calificări / Autorizații</strong></td><td>Conform specificațiilor postului</td></tr>
</table>
<h3>III. Atribuții principale</h3>
<ol>
  <li>Îndeplinirea sarcinilor specifice funcției conform instrucțiunilor primite.</li>
  <li>Respectarea regulamentului intern și a normelor de conduită.</li>
  <li>Participarea la training-uri obligatorii SSM și PSI.</li>
  <li>Raportarea incidentelor și neconformităților șefului ierarhic.</li>
  <li>Menținerea confidențialității datelor prelucrate.</li>
</ol>
<h3>IV. Responsabilități</h3>
<ul>
  <li>Răspunde de calitatea muncii prestate și de utilizarea corectă a echipamentelor.</li>
  <li>Răspunde de respectarea normelor SSM și PSI la locul de muncă.</li>
  <li>Răspunde de protecția datelor cu caracter personal conform GDPR.</li>
</ul>
<h3>V. Competențe necesare</h3>
<ul>
  <li>Capacitate de organizare și planificare</li>
  <li>Abilități de comunicare și lucru în echipă</li>
  <li>Cunoașterea legislației aplicabile domeniului</li>
</ul>
<div class="sig">
  <div><p><strong>ANGAJATOR</strong></p><p>${co.reprezentant || '______________________'}</p><p>${co.functie_reprezentant || 'Director General'}</p><br><p>Semnătură: ________________</p></div>
  <div><p><strong>AM LUAT LA CUNOȘTINȚĂ</strong></p><p>${emp.prenume || ''} ${emp.nume || ''}</p><br><p>Semnătură: ________________</p><p>Data: ________________</p></div>
</div>
</body></html>`
    printGeneratedHtml(html, data)
  }

  function printActAditional(data) {
    if (!data) return
    const emp = data.angajat || {}
    const co = data.company || {}
    const azi = new Date().toISOString().slice(0, 10)
    const html = `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>Act adițional CIM</title>
<style>body{font-family:Times New Roman,serif;font-size:11pt;margin:2cm}h2{text-align:center;font-size:13pt;margin:8px 0}p,li{margin:5px 0;line-height:1.8}.bold{font-weight:bold}.sig{margin-top:48px;display:flex;justify-content:space-between}.sig div{text-align:center;min-width:180px}@media print{body{margin:1.5cm 2cm}}</style></head><body>
<h2>ACT ADIȚIONAL</h2>
<h2>la Contractul Individual de Muncă</h2>
<p style="text-align:center;color:#555">Nr. ____ / ${azi}</p>
<p>Între:</p>
<p><span class="bold">${co.denumire || '______________________'}</span>, CUI ${co.cui || '____________'}, cu sediul în ${co.adresa || '______________________'}, reprezentată de <span class="bold">${co.reprezentant || '______________________'}</span>, în calitate de ${co.functie_reprezentant || 'Director General'}, denumit în continuare <strong>Angajator</strong>,</p>
<p>și</p>
<p><span class="bold">${emp.prenume || ''} ${emp.nume || ''}</span>, CNP <span class="bold">${emp.cnp || '_______________'}</span>, domiciliat(ă) în ${emp.adresa || '______________________'}, denumit(ă) în continuare <strong>Salariat</strong>,</p>
<p>s-a convenit modificarea Contractului Individual de Muncă după cum urmează:</p>
<p>1. Începând cu data de <span class="bold">____________________</span>, se modifică/completează CIM cu următoarele prevederi:</p>
<p style="margin-left:2em">□ Funcția: <span class="bold">____________________________________</span></p>
<p style="margin-left:2em">□ Salariu de bază brut: <span class="bold">____________ RON</span></p>
<p style="margin-left:2em">□ Departament: <span class="bold">____________________________________</span></p>
<p style="margin-left:2em">□ Altele: ________________________________________________________________</p>
<p>2. Celelalte prevederi ale CIM rămân neschimbate.</p>
<p>Prezentul act adițional face parte integrantă din CIM și produce efecte de la data semnării.</p>
<div class="sig">
  <div><p><strong>ANGAJATOR</strong></p><p>${co.repreztant || co.reprezentant || '______________________'}</p><br><p>Semnătură: ________________</p><p>Data: ${azi}</p></div>
  <div><p><strong>SALARIAT</strong></p><p>${emp.prenume || ''} ${emp.nume || ''}</p><br><p>Semnătură: ________________</p><p>Data: ________________</p></div>
</div>
</body></html>`
    printGeneratedHtml(html, data)
  }

  function printNotaLichidare(data) {
    if (!data) return
    const emp = data.angajat || {}
    const co = data.company || {}
    const azi = new Date().toISOString().slice(0, 10)
    const inventar = data.inventar || {}
    const inventoryRows = rows => (rows || []).map((item, index) => `<tr><td>${index + 1}</td><td>${item.tip_denumire || ''}</td><td>${item.marime || '-'}</td><td>${item.numar_serie || '-'}</td><td>${item.cantitate || 1}</td><td>${Number(item.valoare_inventar || 0).toFixed(2)} lei</td><td>□</td></tr>`).join('') || '<tr><td colspan="7">Nu există obiecte active de predat.</td></tr>'
    const html = `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>Notă de lichidare</title>
<style>body{font-family:Times New Roman,serif;font-size:11pt;margin:2cm}h2{text-align:center;font-size:13pt;margin:8px 0}p{margin:5px 0;line-height:1.7}table{width:100%;border-collapse:collapse;margin:12px 0}td,th{border:1px solid #888;padding:5px 8px;font-size:10pt}th{background:#f0f0f0;text-align:center}.sig{margin-top:40px;display:flex;justify-content:space-between}.sig div{text-align:center;min-width:150px}@media print{body{margin:1.5cm 2cm}}</style></head><body>
<h2>${co.denumire || 'SOCIETATEA'}</h2>
<h2>NOTĂ DE LICHIDARE</h2>
<p style="text-align:center;color:#555">Nr. ____ / ${azi}</p>
<table>
  <tr><td width="40%"><strong>Salariat</strong></td><td>${emp.prenume || ''} ${emp.nume || ''}</td></tr>
  <tr><td><strong>CNP</strong></td><td>${emp.cnp || '_______________'}</td></tr>
  <tr><td><strong>Funcția</strong></td><td>${emp.functia || '______________________'}</td></tr>
  <tr><td><strong>Departament</strong></td><td>${emp.department_name || '______________________'}</td></tr>
  <tr><td><strong>Data angajării</strong></td><td>${emp.data_angajare || '______________________'}</td></tr>
  <tr><td><strong>Data încetării CIM</strong></td><td>______________________</td></tr>
  <tr><td><strong>Motiv încetare</strong></td><td>□ Demisie &nbsp;&nbsp; □ Concediere &nbsp;&nbsp; □ Acord părți &nbsp;&nbsp; □ Altele</td></tr>
</table>
<p><strong>Situație obligații salariat față de angajator:</strong></p>
<table>
  <tr><th>Nr.</th><th>Compartiment</th><th>Obiect predare</th><th>Vizat (Da/Nu)</th><th>Semnătura</th></tr>
  <tr><td>1</td><td>Gestionar / Magazioner</td><td>Echipamente / Materiale primite</td><td></td><td></td></tr>
  <tr><td>2</td><td>IT / Parc auto</td><td>Telefon / Laptop / Auto</td><td></td><td></td></tr>
  <tr><td>3</td><td>Contabilitate</td><td>Avansuri / Deconturi</td><td></td><td></td></tr>
  <tr><td>4</td><td>HR</td><td>Echipament protecție / Acces</td><td></td><td></td></tr>
  <tr><td>5</td><td>Șef departament</td><td>Documentații / Dosare</td><td></td><td></td></tr>
</table>
<p><strong>Gestionar — Echipamente de predat:</strong></p>
<table>
  <tr><th>Nr.</th><th>Obiect</th><th>Mărime</th><th>Nr. serie</th><th>Cant.</th><th>Valoare</th><th>Predat</th></tr>
  ${inventoryRows(inventar.echipamente_protectie)}
</table>
<p><strong>Gestionar — Scule și obiecte inventar de predat:</strong></p>
<table>
  <tr><th>Nr.</th><th>Obiect</th><th>Mărime</th><th>Nr. serie</th><th>Cant.</th><th>Valoare</th><th>Predat</th></tr>
  ${inventoryRows([...(inventar.scule_unelte || []), ...(inventar.alte_obiecte || [])])}
</table>
<p><strong>Total valoare în răspundere: ${Number(inventar.total_valoare || 0).toFixed(2)} lei</strong></p>
<p>Zile concediu de odihnă neefectuate: ______ zile &nbsp;&nbsp; Zile CO efectuate în plus: ______ zile</p>
<p>Sume de plătit salariatului: ____________ RON &nbsp;&nbsp; Sume reținute: ____________ RON</p>
<div class="sig">
  <div><p>Director General</p><p>${co.reprezentant || '______________'}</p><br><p>Semnătură: _____________</p></div>
  <div><p>Responsabil HR</p><p>______________</p><br><p>Semnătură: _____________</p></div>
  <div><p>Salariat</p><p>${emp.prenume || ''} ${emp.nume || ''}</p><br><p>Semnătură: _____________</p></div>
</div>
</body></html>`
    printGeneratedHtml(html, data)
  }

  function printCerereAngajare(data) {
    if (!data) return
    const emp = data.angajat || {}
    const co = data.company || {}
    const azi = new Date().toISOString().slice(0, 10)
    const html = `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>Cerere angajare</title>
<style>body{font-family:Times New Roman,serif;font-size:11pt;margin:2cm}h2{text-align:center;margin:8px 0}p,li{margin:5px 0;line-height:1.7}table{width:100%;border-collapse:collapse;margin:8px 0}td{border:1px solid #bbb;padding:4px 8px}@media print{body{margin:1.5cm 2cm}}</style></head><body>
<p>Către,</p>
<p><strong>${co.denumire || '____________________'}</strong></p>
<p style="text-align:right">${azi}</p>
<h2>CERERE DE ANGAJARE</h2>
<p>Subsemnatul(a) <strong>${emp.prenume || '____________________'} ${emp.nume || '____________________'}</strong>, CNP <strong>${emp.cnp || '_______________'}</strong>, domiciliat(ă) în <strong>${emp.adresa || '____________________'}</strong>, telefon <strong>${emp.telefon || '____________________'}</strong>, email <strong>${emp.email || '____________________'}</strong>,</p>
<p>solicit angajarea în cadrul societății dumneavoastră pe postul de: <strong>${emp.functia || '____________________'}</strong></p>
<p>în departamentul: <strong>${emp.department_name || '____________________'}</strong></p>
<p>Declar că am luat cunoștință de condițiile postului și accept condițiile de angajare.</p>
<p>Atașez la prezenta cerere următoarele documente:</p>
<ul>
  <li>□ Curriculum Vitae</li>
  <li>□ Copie Buletin/Carte de identitate</li>
  <li>□ Cazier judiciar</li>
  <li>□ Adeverință medicală</li>
  <li>□ Copii diplome și certificate</li>
  <li>□ Fotografii tip buletin (2 buc.)</li>
  <li>□ Alte documente: ____________________</li>
</ul>
<br>
<p style="text-align:right">Semnătură: ________________</p>
<p style="text-align:right">${emp.prenume || ''} ${emp.nume || ''}</p>
</body></html>`
    printGeneratedHtml(html, data)
  }

  function printDecizieConc(data) {
    if (!data) return
    const emp = data.angajat || {}
    const co = data.company || {}
    const azi = new Date().toISOString().slice(0, 10)
    const html = `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>Decizie concediere</title>
<style>body{font-family:Times New Roman,serif;font-size:11pt;margin:2cm}h2{text-align:center;font-size:13pt;margin:8px 0}p,li{margin:5px 0;line-height:1.8}.bold{font-weight:bold}.sig{margin-top:48px;display:flex;justify-content:space-between}.sig div{text-align:center;min-width:180px}@media print{body{margin:1.5cm 2cm}}</style></head><body>
<h2>${co.denumire || 'SOCIETATEA'}</h2>
<h2>DECIZIE DE CONCEDIERE</h2>
<p style="text-align:center;color:#555">Nr. ____ / ${azi}</p>
<p>Subsemnatul(a), <span class="bold">${co.reprezentant || '______________________'}</span>, în calitate de ${co.functie_reprezentant || 'Director General'} al <span class="bold">${co.denumire || '____________________'}</span>,</p>
<p>Având în vedere:</p>
<ul>
  <li>Prevederile Codului Muncii (Legea nr. 53/2003, republicată), art. ______</li>
  <li>Motivul: □ Desființarea postului &nbsp;&nbsp; □ Necorespundere profesională &nbsp;&nbsp; □ Alte motive prevăzute de lege</li>
  <li>Referatul / Nota internă nr. ____ din ____________________</li>
</ul>
<p><strong>DISPUNE:</strong></p>
<p>Art. 1. Începând cu data de <span class="bold">____________________</span>, se încetează contractul individual de muncă al salariatului/ei <span class="bold">${emp.prenume || ''} ${emp.nume || ''}</span>, CNP <span class="bold">${emp.cnp || '_______________'}</span>, angajat(ă) în funcția de <span class="bold">${emp.functia || '______________________'}</span>, departamentul <span class="bold">${emp.department_name || '______________________'}</span>.</p>
<p>Art. 2. Temeiul legal: Codul Muncii, art. ______</p>
<p>Art. 3. Salariatul beneficiază de un preaviz de <span class="bold">______ zile lucrătoare</span>.</p>
<p>Art. 4. Prezenta decizie poate fi contestată la instanța judecătorească competentă în termen de 30 de zile de la comunicare.</p>
<p>Art. 5. Departamentul HR și Contabilitate vor lua măsurile necesare pentru aplicarea prezentei decizii.</p>
<div class="sig">
  <div><p><strong>DIRECTOR GENERAL</strong></p><p>${co.reprezentant || '______________________'}</p><br><p>Semnătură și ștampilă: ____________</p><p>Data: ${azi}</p></div>
  <div><p><strong>AM PRIMIT UN EXEMPLAR</strong></p><p>${emp.prenume || ''} ${emp.nume || ''}</p><br><p>Semnătură: ________________</p><p>Data: ________________</p></div>
</div>
</body></html>`
    printGeneratedHtml(html, data)
  }

  function printNotificarePrv(data) {
    if (!data) return
    const emp = data.angajat || {}
    const co = data.company || {}
    const azi = new Date().toISOString().slice(0, 10)
    const html = `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>Notificare preaviz</title>
<style>body{font-family:Times New Roman,serif;font-size:11pt;margin:2cm}h2{text-align:center;font-size:13pt;margin:8px 0}p,li{margin:5px 0;line-height:1.8}.bold{font-weight:bold}.sig{margin-top:48px}@media print{body{margin:1.5cm 2cm}}</style></head><body>
<h2>${co.denumire || 'SOCIETATEA'}</h2>
<h2>NOTIFICARE PREAVIZ CONCEDIERE</h2>
<p style="text-align:center;color:#555">Nr. ____ / ${azi}</p>
<p>Stimată Doamnă / Stimate Domn,</p>
<p><span class="bold">${emp.prenume || '____________________'} ${emp.nume || '____________________'}</span></p>
<p>Prin prezenta vă notificăm că societatea <span class="bold">${co.denumire || '____________________'}</span> intenționează să înceteze contractul individual de muncă nr. <span class="bold">____________________</span> încheiat cu dumneavoastră, în temeiul art. ______ din Codul Muncii.</p>
<p>Motivul concedierii: <span class="bold">____________________</span></p>
<p>Durata preavizului este de <span class="bold">______ zile lucrătoare</span>, calculat de la data comunicării prezentei notificări.</p>
<p>Ultima zi de activitate va fi: <span class="bold">____________________</span></p>
<p>Pe durata preavizului vă veți prezenta la serviciu conform programului normal de lucru.</p>
<p>Aveți dreptul să vă adresați instanțelor judecătorești competente dacă considerați că această notificare contravine dispozițiilor legale.</p>
<div class="sig">
  <p style="margin-top:40px"><strong>${co.denumire || '____________________'}</strong></p>
  <p>${co.reprezentant || '______________________'}, ${co.functie_reprezentant || 'Director General'}</p>
  <p>Semnătură și ștampilă: ________________ &nbsp;&nbsp;&nbsp; Data: ${azi}</p>
  <br><br>
  <p><strong>Confirmare de primire:</strong></p>
  <p>Subsemnatul/a ${emp.prenume || ''} ${emp.nume || ''} confirm primirea prezentei notificări.</p>
  <p>Semnătură: ________________ &nbsp;&nbsp;&nbsp; Data: ________________</p>
</div>
</body></html>`
    printGeneratedHtml(html, data)
  }

  function printCerereConc(data, tip) {
    if (!data) return
    const emp = data.angajat || {}
    const co = data.company || {}
    const azi = new Date().toISOString().slice(0, 10)
    const tipLabels = { co: 'CONCEDIU DE ODIHNĂ', fara_plata: 'CONCEDIU FĂRĂ PLATĂ', fam: 'CONCEDIU PENTRU EVENIMENTE FAMILIALE' }
    const tipLabel = tipLabels[tip] || 'CONCEDIU'
    const html = `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>Cerere ${tipLabel}</title>
<style>body{font-family:Times New Roman,serif;font-size:11pt;margin:2cm}h2{text-align:center;margin:8px 0}p{margin:5px 0;line-height:1.8}.bold{font-weight:bold}@media print{body{margin:1.5cm 2cm}}</style></head><body>
<p>Subsemnatul(a): <span class="bold">${emp.prenume || ''} ${emp.nume || ''}</span></p>
<p>Funcția: <span class="bold">${emp.functia || '______________________'}</span> &nbsp;&nbsp;&nbsp; Departament: <span class="bold">${emp.department_name || '______________________'}</span></p>
<br>
<h2>CERERE ${tipLabel}</h2>
<br>
<p>Vă rog să-mi aprobați ${tipLabel.toLowerCase()} în perioada:</p>
<p>De la: <span class="bold">____________________</span> &nbsp;&nbsp;&nbsp; Până la: <span class="bold">____________________</span></p>
<p>Număr zile lucrătoare: <span class="bold">______</span></p>
${tip === 'co' ? `<p>Sold zile CO disponibile: <span class="bold">${emp.zile_co_drept || '__'} zile</span></p>` : ''}
${tip === 'fam' ? `<p>Motivul concediului: □ Naștere copil &nbsp; □ Căsătorie &nbsp; □ Deces rudă &nbsp; □ Altele: ____________________</p>` : ''}
${tip === 'fara_plata' ? `<p>Motivul solicitării: ____________________</p>` : ''}
<p>Persoana care mă înlocuiește: <span class="bold">____________________</span></p>
<br>
<p style="text-align:right">${azi}</p>
<p style="text-align:right">Semnătură: ________________</p>
<p style="text-align:right">${emp.prenume || ''} ${emp.nume || ''}</p>
<br><br>
<p><strong>AVIZ ȘEF DEPARTAMENT:</strong> □ Aprobat &nbsp;&nbsp; □ Respins &nbsp;&nbsp; Data: ________________ &nbsp;&nbsp; Semnătură: ________________</p>
<p><strong>DECIZIE HR:</strong> □ Aprobat &nbsp;&nbsp; □ Respins &nbsp;&nbsp; Data: ________________ &nbsp;&nbsp; Semnătură: ________________</p>
</body></html>`
    printGeneratedHtml(html, data)
  }

  function printDeclDeduceri(data) {
    if (!data) return
    const emp = data.angajat || {}
    const co = data.company || {}
    const azi = new Date().toISOString().slice(0, 10)
    const html = `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>Declarație deduceri</title>
<style>body{font-family:Times New Roman,serif;font-size:11pt;margin:2cm}h2{text-align:center;margin:8px 0}p,li{margin:5px 0;line-height:1.8}table{width:100%;border-collapse:collapse;margin:10px 0}td{border:1px solid #bbb;padding:4px 8px}@media print{body{margin:1.5cm 2cm}}</style></head><body>
<p>Angajator: <strong>${co.denumire || '____________________'}</strong> &nbsp;&nbsp; CUI: ${co.cui || '____________'}</p>
<br>
<h2>DECLARAȚIE</h2>
<h2>privind deducerile personale pentru impozit pe venit din salarii</h2>
<br>
<p>Subsemnatul(a) <strong>${emp.prenume || ''} ${emp.nume || ''}</strong>, CNP <strong>${emp.cnp || '_______________'}</strong>,</p>
<p>angajat(ă) în funcția de <strong>${emp.functia || '______________________'}</strong>, declar pe propria răspundere că:</p>
<p>1. Aceasta este/nu este funcția de bază: □ DA &nbsp;&nbsp; □ NU</p>
<p>2. Număr persoane în întreținere: <strong>${emp.nr_copii_intretinere || '____'}</strong></p>
<table>
  <tr><td><strong>Nr. crt.</strong></td><td><strong>Nume și prenume persoană în întreținere</strong></td><td><strong>CNP</strong></td><td><strong>Grad rudenie</strong></td></tr>
  <tr><td>1</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
  <tr><td>2</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
  <tr><td>3</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
</table>
<p>3. Deducere personală lunară solicitată: <strong>${emp.deducere_personala ? emp.deducere_personala + ' RON' : '______ RON'}</strong></p>
<p>Mă angajez să comunic orice modificare a datelor de mai sus în termen de 15 zile.</p>
<p>Declar că toate informațiile de mai sus sunt corecte și complete.</p>
<p style="margin-top:32px;text-align:right">Data: ${azi} &nbsp;&nbsp;&nbsp;&nbsp; Semnătură: ________________</p>
<p style="text-align:right">${emp.prenume || ''} ${emp.nume || ''}</p>
</body></html>`
    printGeneratedHtml(html, data)
  }

  function printNotaGDPR(data) {
    if (!data) return
    const emp = data.angajat || {}
    const co = data.company || {}
    const azi = new Date().toISOString().slice(0, 10)
    const html = `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>Notă GDPR</title>
<style>body{font-family:Arial,sans-serif;font-size:10pt;margin:2cm;line-height:1.6}h2{text-align:center;font-size:13pt}h3{font-size:11pt;margin:10px 0 4px;color:#333}p,li{margin:4px 0}@media print{body{margin:1.5cm 2cm}}</style></head><body>
<h2>NOTĂ DE INFORMARE</h2>
<h2>privind prelucrarea datelor cu caracter personal</h2>
<p style="text-align:center;color:#666">conform Regulamentului (UE) 2016/679 — GDPR</p>
<h3>1. Identitatea operatorului</h3>
<p><strong>${co.denumire || '____________________'}</strong>, CUI: ${co.cui || '____________'}, sediu: ${co.adresa || '______________________'}, denumit în continuare <strong>Operator</strong>.</p>
<h3>2. Datele prelucrate</h3>
<p>Prelucrăm următoarele categorii de date: date de identificare (nume, CNP, CI), date de contact, date de angajare, date financiare (salariu, IBAN), date biometrice (fotografie), date privind sănătatea (adeverință medicală).</p>
<h3>3. Scopul prelucrării</h3>
<ul>
  <li>Executarea contractului individual de muncă</li>
  <li>Respectarea obligațiilor legale (REGES, ITM, ANAF)</li>
  <li>Calculul și plata salariilor</li>
  <li>Gestionarea concediilor și absențelor</li>
  <li>Securitatea muncii (SSM/PSI)</li>
</ul>
<h3>4. Temeiul legal</h3>
<p>Art. 6(1)(b) GDPR — executarea contractului; Art. 6(1)(c) — obligație legală; Art. 6(1)(f) — interese legitime.</p>
<h3>5. Destinatarii datelor</h3>
<p>Date transmise către: ITM, ANAF, casele de asigurări, bănci (pentru plata salariului), contabili externi. Nu transmitem date în afara UE.</p>
<h3>6. Durata stocării</h3>
<p>Datele sunt păstrate pe durata contractului și minim 50 de ani după încetare, conform prevederilor legale privind arhivarea documentelor de muncă.</p>
<h3>7. Drepturile dumneavoastră</h3>
<p>Aveți dreptul de: acces, rectificare, ștergere (în limitele legii), restricționare, portabilitate, opoziție. Reclamații: Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal (ANSPDCP).</p>
<br>
<p><strong>Confirm că am primit și înțeles prezenta notă de informare:</strong></p>
<p>Nume și prenume: <strong>${emp.prenume || ''} ${emp.nume || ''}</strong></p>
<p>Semnătură: ________________ &nbsp;&nbsp;&nbsp;&nbsp; Data: ${azi}</p>
</body></html>`
    printGeneratedHtml(html, data)
  }

  function printDeclFunctieBaza(data) {
    if (!data) return
    const emp = data.angajat || {}
    const co = data.company || {}
    const azi = new Date().toISOString().slice(0, 10)
    const html = `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>Declarație funcție de bază</title>
<style>body{font-family:Times New Roman,serif;font-size:11pt;margin:2cm}h2{text-align:center;margin:8px 0}p,li{margin:6px 0;line-height:1.8}@media print{body{margin:1.5cm 2cm}}</style></head><body>
<p>Angajator: <strong>${co.denumire || '____________________'}</strong></p>
<br>
<h2>DECLARAȚIE</h2>
<h2>privind funcția/locul de muncă de bază</h2>
<br>
<p>Subsemnatul(a) <strong>${emp.prenume || ''} ${emp.nume || ''}</strong>, CNP <strong>${emp.cnp || '_______________'}</strong>, domiciliat(ă) în ${emp.adresa || '______________________'},</p>
<p>în calitate de salariat al/a ${co.denumire || '____________________'}, angajat(ă) în funcția de <strong>${emp.functia || '______________________'}</strong>, declar pe proprie răspundere că:</p>
<br>
<p>□ <strong>DA</strong> — Prezentul loc de muncă reprezintă <strong>funcția de bază</strong> unde îmi desfășor activitatea de muncă și unde solicit acordarea deducerilor personale la calculul impozitului pe venit.</p>
<br>
<p>□ <strong>NU</strong> — Prezentul loc de muncă nu reprezintă funcția de bază. Funcția de bază o dețin la: ____________________</p>
<br>
<p>Mă angajez să comunic orice modificare a situației de mai sus în termen de 5 zile lucrătoare.</p>
<p>Declar că informațiile furnizate sunt corecte și complete, cunoscând că falsul în declarații este infracțiune pedepsită de lege.</p>
<p style="margin-top:40px;text-align:right">Data: <strong>${azi}</strong></p>
<p style="text-align:right">Semnătură: ________________</p>
<p style="text-align:right"><strong>${emp.prenume || ''} ${emp.nume || ''}</strong></p>
</body></html>`
    printGeneratedHtml(html, data)
  }

  async function saveEmployeeEdit() {
    try {
      const payload = { ...editForm }
      delete payload.photo_url
      delete payload.department_transfer_date
      delete payload.department_transfer_reason
      const previousDepartment = String(employeeDetails.department_id || '')
      const nextDepartment = String(editForm.department_id || '')
      const departmentChanged = previousDepartment !== nextDepartment
      delete payload.department_id
      if (departmentChanged && !nextDepartment) throw new Error('Alege departamentul nou.')
      if (departmentChanged && !String(editForm.department_transfer_reason || '').trim()) throw new Error('Completeaza motivul transferului.')
      await api.patch(`/hr/employees/${selectedEmployee.id}`, payload)

      if (departmentChanged) {
        await api.post(`/hr/employees/${selectedEmployee.id}/transfer`, {
          department_nou: nextDepartment,
          data_transfer: editForm.department_transfer_date || new Date().toISOString().slice(0, 10),
          motiv: editForm.department_transfer_reason
        })
      }

      if (photoFile) {
        const fd = new FormData()
        fd.append('photo', photoFile)
        const photoRes = await api.post(`/hr/employees/${selectedEmployee.id}/photo`, fd)
        // Cache-busting: adaugă timestamp la URL pentru a forța reîncărcarea imaginii
        const freshPhotoUrl = (photoRes.data.photo_url || '') + '?t=' + Date.now()
        const updatedEmp = { ...selectedEmployee, photo_url: freshPhotoUrl }
        setEmployees(emps => emps.map(e => e.id === updatedEmp.id ? updatedEmp : e))
        setEmployeeDetails(updatedEmp)
        setPhotoPreview(null)
        setPhotoFile(null)
      }

      setEditMode(false)
      await load()
      const [response, transfersResponse] = await Promise.all([
        api.get(`/hr/employees/${selectedEmployee.id}`),
        api.get(`/hr/employees/${selectedEmployee.id}/transfers`).catch(() => ({ data: [] }))
      ])
      // Păstrează cache-busting dacă photo_url vine fără timestamp
      const details = response.data
      if (details.photo_url && !details.photo_url.includes('?t=')) {
        details.photo_url = details.photo_url + '?t=' + Date.now()
      }
      setEmployeeDetails(details)
      setTransferHistory(arrayFrom(transfersResponse.data, ['transfers', 'items']))
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Eroare la salvare.')
    }
  }

  async function validateMonth() {
    try {
      const employeeIds = scopedMonthlySheet.map(row => row.employee_id || row.id).filter(Boolean)
      await api.post('/hr/timesheets/validate', { employee_ids: employeeIds, luna: filters.luna })
      await load()
    } catch (err) { setError(err.response?.data?.error || 'Pontajul nu a putut fi validat.') }
  }

  async function loadTimesheetLock() {
    const response = await api.get('/hr/timesheets/lock', { params: { luna: filters.luna } })
    setTimesheetLock(response.data)
  }

  async function toggleTimesheetLock() {
    try {
      const locked = timesheetLock?.locked
      const motiv = window.prompt(locked ? 'Motivul deblocarii pontajului:' : 'Motivul inchiderii pontajului:', locked ? '' : 'Pontaj lunar verificat si inchis')
      if (!motiv) return
      await api.post(locked ? '/hr/timesheets/unlock' : '/hr/timesheets/lock', { luna: filters.luna, motiv })
      await loadTimesheetLock()
    } catch (err) { setError(err.response?.data?.error || 'Starea pontajului nu a putut fi schimbata.') }
  }

  async function createEmployee(event) {
    event.preventDefault()
    setError('')
    try {
      await api.post('/hr/employees', employeeForm)
      setEmployeeModal(false)
      setEmployeeForm(emptyEmployeeForm)
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Angajatul nu a putut fi creat.')
    }
  }

  async function importEmployees(event) {
    event.preventDefault()
    if (!importFile) return
    const data = new FormData()
    data.append('file', importFile)
    try {
      const response = await api.post('/hr/employees/import', data)
      setImportResult(response.data)
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Importul nu a putut fi rulat.')
    }
  }

  async function downloadTemplate() {
    const response = await api.get('/hr/employees/template', { responseType: 'blob' })
    const url = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url
    link.download = 'template-angajati.xlsx'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  async function submitDepartmentTimesheet() {
    await api.post('/hr/timesheets/submit-department', { luna: filters.luna, department_cod: (!isHRPontaj && isSefPontaj ? ownDepartmentKey : filters.dept_id) || undefined, status: 'finalizat' })
    await load()
  }

  async function setDeadline() {
    await api.post('/hr/timesheets/set-deadline', { luna: filters.luna, deadline_date: deadlineDate, send_reminder: false })
    await load()
  }

  async function sendReminder() {
    await api.post('/hr/timesheets/send-reminder', { luna: filters.luna, deadline_date: deadlineDate })
  }

  async function approveLeave(uuid) {
    try {
      await api.post(`/hr/leave-requests/${uuid}/approve`)
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Eroare la aprobare.')
    }
  }

  async function rejectLeave(uuid) {
    try {
      await api.post(`/hr/leave-requests/${uuid}/reject`, { motiv: '' })
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Eroare la respingere.')
    }
  }

  const departments = useMemo(() => {
    const map = new Map()
    configuredDepartments.forEach(department => {
      const id = department.id || department.department_id || department.cod || department.code
      const name = department.name || department.nume || department.denumire || department.cod || department.code
      if (id && name && department.active !== false) map.set(String(id), String(name))
    })
    employees.forEach(employee => {
      const id = employee.department_id || employee.dept_id || employee.department_name
      if (id) map.set(String(id), employee.department_name || employee.department || String(id))
    })
    return [...map.entries()].map(([value, label]) => ({ value, label }))
  }, [configuredDepartments, employees])

  const employeeDepartmentKey = employee => String(employee.department_id || employee.dept_id || employee.department_name || employee.department || '')

  const filteredEmployees = useMemo(() => employees.filter(employee => {
    const effectiveDept = !isHRPontaj && isSefPontaj ? ownDepartmentKey : filters.dept_id
    if (effectiveDept && employeeDepartmentKey(employee) !== String(effectiveDept)) return false
    if (filters.activ !== '' && String(employee.activ ? 1 : 0) !== filters.activ) return false
    return true
  }), [employees, filters, isHRPontaj, isSefPontaj, ownDepartmentKey])

  const scopedMonthlySheet = useMemo(() => {
    if (isHRPontaj || !isSefPontaj || !ownDepartmentKey) return monthlySheet
    const allowedIds = new Set(filteredEmployees.map(employee => String(employee.id)))
    return monthlySheet.filter(row => allowedIds.has(String(row.employee_id || row.id)) || employeeDepartmentKey(row) === String(ownDepartmentKey))
  }, [monthlySheet, filteredEmployees, isHRPontaj, isSefPontaj, ownDepartmentKey])

  const visibleTabs = useMemo(() => tabs.filter(tab => tab !== 'Pontaj' || canUsePontaj), [canUsePontaj])

  const filteredAuth = useMemo(() => authorizations.filter(item => {
    if (filters.tip && String(item.tip || item.tip_autorizatie || '') !== filters.tip) return false
    if (filters.alert === 'alert' && !(item.alert || item.expirat)) return false
    if (filters.alert === 'expirat' && !item.expirat) return false
    return true
  }), [authorizations, filters])

  const authTypes = useMemo(() => [...new Set(authorizations.map(item => item.tip || item.tip_autorizatie).filter(Boolean))], [authorizations])
  const monthDays = daysInMonth(filters.luna)

  // Dashboard HR alerts derived from employees
  const dashboardAlerts = useMemo(() => {
    const alerts = []
    employees.forEach(emp => {
      const name = fullName(emp)
      const dc = daysUntil(emp.data_expirare_contract)
      if (alertTone(dc)) alerts.push({ key: `${emp.id}-contract`, label: `${name} — Contract expiră`, date: emp.data_expirare_contract, icon: '📄', days: dc })
      const dp = daysUntil(emp.permis_conducere_expira || emp.data_expirare_permis)
      if (alertTone(dp)) alerts.push({ key: `${emp.id}-permis`, label: `${name} — Permis de conducere`, date: emp.permis_conducere_expira || emp.data_expirare_permis, icon: '🪪', days: dp })
      const di = daysUntil(emp.data_expirare_iscir)
      if (alertTone(di)) alerts.push({ key: `${emp.id}-iscir`, label: `${name} — ISCIR`, date: emp.data_expirare_iscir, icon: '⚙️', days: di })
      const dm = daysUntil(emp.apt_medical_expira || emp.adeverinta_medicala)
      if (alertTone(dm)) alerts.push({ key: `${emp.id}-medical`, label: `${name} — Apt medical`, date: emp.apt_medical_expira || emp.adeverinta_medicala, icon: '🏥', days: dm })
      const dai = daysUntil(emp.act_identitate_valabil_pana)
      if (dai !== null && dai <= 60) alerts.push({ key: `${emp.id}-act-id`, label: `${name} — Act identitate`, date: emp.act_identitate_valabil_pana, icon: '🪪', days: dai })
    })
    return alerts.sort((a, b) => (a.days ?? 999) - (b.days ?? 999))
  }, [employees])

  const pendingLeaves = useMemo(() => leaves.filter(l => l.status === 'cerut' || l.status === 'pending'), [leaves])

  if (tabs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-500">
        <div className="mb-4 text-5xl">🔒</div>
        <h2 className="text-lg font-semibold text-slate-700">Nu ai acces la modulul HR</h2>
        <p className="mt-1 text-sm">Contactează administratorul pentru permisiunile necesare.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">HR</h2>
          <p className="text-sm text-slate-500">Angajați, pontaj, concedii și autorizații.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setImportModal(true)}>📥 Import din CSV/Excel</Button>
          <Button onClick={() => setEmployeeModal(true)}>+ Angajat nou</Button>
        </div>
      </div>

      {error ? <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      <Card>
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          {visibleTabs.map(tab => (
            <Button key={tab} variant={activeTab === tab ? 'primary' : 'secondary'} onClick={() => setActiveTab(tab)}>
              {tab === 'Dashboard HR' && dashboardAlerts.length > 0 ? `${tab} 🔴` : tab}
            </Button>
          ))}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Select label="Departament" value={filters.dept_id} onChange={event => setFilters({ ...filters, dept_id: event.target.value })} options={[{ value: '', label: 'Toate departamentele' }, ...departments]} />
          {activeTab === 'Angajați' ? (
            <Select label="Activ" value={filters.activ} onChange={event => setFilters({ ...filters, activ: event.target.value })} options={[{ value: '', label: 'Toți' }, { value: '1', label: 'Activi' }, { value: '0', label: 'Inactivi' }]} />
          ) : null}
          {activeTab === 'Pontaj' ? <Input label="Luna" type="month" value={filters.luna} onChange={event => setFilters({ ...filters, luna: event.target.value })} /> : null}
          {activeTab === 'Autorizații' ? (
            <>
              <Select label="Tip" value={filters.tip} onChange={event => setFilters({ ...filters, tip: event.target.value })} options={[{ value: '', label: 'Toate tipurile' }, ...authTypes.map(type => ({ value: type, label: type }))]} />
              <Select label="Status alertă" value={filters.alert} onChange={event => setFilters({ ...filters, alert: event.target.value })} options={[{ value: '', label: 'Toate' }, { value: 'alert', label: 'Alertă 30 zile' }, { value: 'expirat', label: 'Expirat' }]} />
            </>
          ) : null}
        </div>
      </Card>

      {/* ─── DASHBOARD HR ─────────────────────────────────── */}
      {activeTab === 'Dashboard HR' ? (
        <div className="grid gap-4">
          {/* KPI cards */}
          {stats ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'Total angajați activi', value: stats.total_angajati ?? '-', icon: '👥' },
                { label: 'Prezenți azi', value: stats.prezenti_azi ?? '-', icon: '✅' },
                { label: 'În concediu', value: stats.in_concediu ?? '-', icon: '🏖️' },
                { label: 'Autorizații expiră 30 zile', value: stats.autorizatii_expira_30_zile ?? '-', icon: '⚠️' },
              ].map(kpi => (
                <Card key={kpi.label}>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{kpi.icon}</span>
                    <div>
                      <div className="text-2xl font-bold text-slate-900">{kpi.value}</div>
                      <div className="text-xs text-slate-500">{kpi.label}</div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : null}

          {/* Cereri concediu în așteptare */}
          {pendingLeaves.length > 0 ? (
            <Card>
              <div className="mb-3 text-sm font-semibold text-slate-700">⏳ Cereri de concediu în așteptare ({pendingLeaves.length})</div>
              <div className="grid gap-2">
                {pendingLeaves.map(item => (
                  <div key={item.uuid || item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    <div className="text-sm">
                      <span className="font-medium text-slate-800">{item.tip}</span>
                      <span className="ml-2 text-slate-600">{item.data_start} → {item.data_sfarsit}</span>
                      {item.zile ? <span className="ml-2 text-slate-500">({item.zile} zile lucr.)</span> : null}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => approveLeave(item.uuid || item.id)}>✅ Aprobă</Button>
                      <Button size="sm" variant="secondary" onClick={() => rejectLeave(item.uuid || item.id)}>❌ Respinge</Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {/* Alerte documente / expirari */}
          <Card>
            <div className="mb-3 text-sm font-semibold text-slate-700">
              🔔 Alerte expirări ({dashboardAlerts.length})
            </div>
            {dashboardAlerts.length === 0 ? (
              <p className="text-sm text-slate-400">Nu există expirări iminente. Toate documentele sunt la zi.</p>
            ) : (
              <div className="grid gap-2">
                {dashboardAlerts.map(a => (
                  <AlertRow key={a.key} label={a.label} date={a.date} icon={a.icon} />
                ))}
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {/* ─── ANGAJAȚI ─────────────────────────────────────── */}
      {activeTab === 'Angajați' ? (
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-slate-700">{filteredEmployees.length} angajați</span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => exportExcel(
                filteredEmployees.map(emp => ({
                  'Marcă': emp.marca || '',
                  'Nume': fullName(emp),
                  'Funcție': emp.functia || '',
                  'Departament': emp.department_name || emp.department || '',
                  'Tip contract': emp.tip_contract || emp.contract_type || '',
                  'Data angajare': emp.data_angajare || '',
                  'Email': emp.email || '',
                  'Telefon': emp.telefon || '',
                  'Activ': (emp.activ === false || emp.activ === 0) ? 'Nu' : 'Da',
                })),
                `Angajati_${new Date().toISOString().slice(0,10)}`
              )}>📊 Excel</Button>
              <Button variant="secondary" onClick={() => exportPdf({
                title: 'Lista Angajați',
                subtitle: `Total: ${filteredEmployees.length} angajați`,
                columns: [
                  { key: 'Marcă', label: 'Marcă' },
                  { key: 'Nume', label: 'Nume' },
                  { key: 'Funcție', label: 'Funcție' },
                  { key: 'Departament', label: 'Departament' },
                  { key: 'Activ', label: 'Activ' },
                ],
                rows: filteredEmployees.map(emp => ({
                  'Marcă': emp.marca || '',
                  'Nume': fullName(emp),
                  'Funcție': emp.functia || '',
                  'Departament': emp.department_name || emp.department || '',
                  'Activ': (emp.activ === false || emp.activ === 0) ? 'Nu' : 'Da',
                })),
              })}>🖨️ PDF</Button>
            </div>
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Nume</th>
                  <th className="px-3 py-2">Funcție</th>
                  <th className="px-3 py-2">Departament</th>
                  <th className="px-3 py-2">Tip contract</th>
                  <th className="px-3 py-2">Sursă</th>
                  <th className="px-3 py-2">Alerte</th>
                  <th className="px-3 py-2">Activ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEmployees.length ? filteredEmployees.map(employee => {
                  const hasAlert = alertTone(daysUntil(employee.data_expirare_contract)) ||
                    alertTone(daysUntil(employee.permis_conducere_expira || employee.data_expirare_permis)) ||
                    alertTone(daysUntil(employee.data_expirare_iscir)) ||
                    alertTone(daysUntil(employee.apt_medical_expira || employee.adeverinta_medicala))
                  return (
                    <tr key={employee.id} className="cursor-pointer hover:bg-primary-50/50" onClick={() => openEmployee(employee)}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {employee.photo_url
                            ? <img src={employee.photo_url} alt="" className="h-7 w-7 rounded-full object-cover" onError={e => { e.target.style.display='none' }} />
                            : <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-xs text-slate-500">👤</div>
                          }
                          <span className="font-medium text-slate-900">{fullName(employee)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">{employee.functia || '-'}</td>
                      <td className="px-3 py-2">{employee.department_name || employee.department || '-'}</td>
                      <td className="px-3 py-2">{employee.tip_contract || employee.contract_type || '-'}</td>
                      <td className="px-3 py-2"><SursaBadge sursa={employee.sursa || employee.source} /></td>
                      <td className="px-3 py-2">{hasAlert ? <span className="text-amber-500">⚠️</span> : <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2"><Badge tone={employee.activ === false || employee.activ === 0 ? 'neutral' : 'success'}>{employee.activ === false || employee.activ === 0 ? 'Nu' : 'Da'}</Badge></td>
                    </tr>
                  )
                }) : <tr><td colSpan="7" className="px-3 py-8 text-center text-sm text-slate-500">{loading ? 'Se incarca...' : 'Nu exista angajați.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* ─── PONTAJ ───────────────────────────────────────── */}
      {activeTab === 'Pontaj' && canUsePontaj ? (
        <Card>
          <div className="mb-3 rounded-lg border border-primary-100 bg-primary-50 p-3 text-sm text-primary-800">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="font-semibold">Pontaj {filters.luna} {filters.dept_id ? `— ${filters.dept_id}` : ''}</div>
                <div>Termen limită: {deadlineDate || 'nesetat'}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={submitDepartmentTimesheet}>✅ Marchează ca Finalizat</Button>
                <Button size="sm" variant="secondary" onClick={validateMonth}>Validează luna</Button>
                <Button size="sm" variant="secondary" onClick={() => {
                  const rows = scopedMonthlySheet.map(row => {
                    const obj = { 'Angajat': fullName(row) }
                    monthDays.forEach(day => {
                      const val = row.zile?.[day]
                      obj[day.slice(-2)] = typeof val === 'object' ? (val?.tip || val?.ore_lucrate || '') : (val ?? '')
                    })
                    return obj
                  })
                  exportExcel(rows, `Pontaj_${filters.luna}${filters.dept_id ? '_' + filters.dept_id : ''}`, `Pontaj ${filters.luna}`)
                }}>📊 Excel</Button>
                <Button size="sm" variant="secondary" onClick={() => {
                  setNexusExportForm({ luna: filters.luna, dept_id: (!isHRPontaj && isSefPontaj ? ownDepartmentKey : filters.dept_id) || '' })
                  setNexusExportModal(true)
                }}>📥 Export Nexus</Button>
              </div>
            </div>
          </div>
          <div className="overflow-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-left uppercase text-slate-500">
                <tr><th className="sticky left-0 bg-slate-50 px-3 py-2">Angajat</th>{monthDays.map(day => <th key={day} className="px-2 py-2 text-center">{day.slice(-2)}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {scopedMonthlySheet.length ? scopedMonthlySheet.map(row => (
                  <tr key={row.employee_id || row.id}>
                    <td className="sticky left-0 bg-white px-3 py-2 font-medium">{fullName(row)}</td>
                    {monthDays.map(day => <td key={day} className="p-1 text-center"><span className={`inline-flex min-w-7 justify-center rounded px-1 py-1 ${timesheetTone(row.zile?.[day])}`}>{timesheetLabel(row.zile?.[day])}</span></td>)}
                  </tr>
                )) : <tr><td className="px-3 py-8 text-sm text-slate-500" colSpan={monthDays.length + 1}>{loading ? 'Se incarca...' : 'Nu exista pontaj.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* ─── OVERVIEW PONTAJE ─────────────────────────────── */}
      {activeTab === 'Overview pontaje' ? (
        <Card>
          <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <Input label="Termen limită" type="date" value={deadlineDate} onChange={event => setDeadlineDate(event.target.value)} />
            <div className="flex items-end"><Button variant="secondary" onClick={setDeadline}>📅 Setează termen limită</Button></div>
            <div className="flex items-end"><Button onClick={sendReminder}>🔔 Trimite reminder nedefinalizați</Button></div>
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr><th className="px-3 py-2">Departament</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Completat la</th><th className="px-3 py-2">Procent</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {timesheetOverview.length ? timesheetOverview.map(item => (
                  <tr key={item.department_cod || item.department}>
                    <td className="px-3 py-2 font-medium">{item.department}</td>
                    <td className="px-3 py-2"><Badge tone={item.status === 'finalizat' ? 'success' : item.status === 'in_lucru' ? 'warning' : 'neutral'}>{item.status}</Badge></td>
                    <td className="px-3 py-2">{item.completat_la || '-'}</td>
                    <td className="px-3 py-2">{item.procent || 0}%</td>
                  </tr>
                )) : <tr><td colSpan="4" className="px-3 py-8 text-center text-sm text-slate-500">{loading ? 'Se incarca...' : 'Nu exista overview.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* ─── CONCEDII ─────────────────────────────────────── */}
      {activeTab === 'Concedii' ? (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">Cereri de concediu</span>
          </div>
          <div className="grid gap-2">
            {leaves.length ? leaves.map(item => (
              <div key={item.uuid || item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">{item.tip}</span>
                  <span className="ml-2 text-slate-500">{item.data_start} — {item.data_sfarsit}</span>
                  {item.zile ? <span className="ml-2 text-xs text-slate-400">({item.zile} zile)</span> : null}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={item.status === 'aprobata' ? 'success' : item.status === 'respinsa' ? 'danger' : 'warning'}>{item.status || 'cerut'}</Badge>
                  {(item.status === 'cerut' || item.status === 'pending') ? (
                    <>
                      <Button size="sm" onClick={() => approveLeave(item.uuid || item.id)}>✅ Aprobă</Button>
                      <Button size="sm" variant="secondary" onClick={() => rejectLeave(item.uuid || item.id)}>❌ Respinge</Button>
                    </>
                  ) : null}
                </div>
              </div>
            )) : <p className="text-sm text-slate-500">{loading ? 'Se incarca...' : 'Nu exista cereri de concediu.'}</p>}
          </div>
        </Card>
      ) : null}

      {/* ─── AUTORIZAȚII ──────────────────────────────────── */}
      {activeTab === 'Autorizații' ? (
        <Card>
          <div className="mb-3 flex justify-end">
            <Button variant="secondary" onClick={() => exportExcel(
              filteredAuth.map(item => ({
                'Angajat': item.angajat || item.employee_name || item.employee_id || '',
                'Tip autorizație': item.tip || item.tip_autorizatie || '',
                'Număr': item.nr || item.numar || '',
                'Expiră la': item.data_expirare || '',
                'Status': item.expirat ? 'Expirat' : item.alert ? 'Expiră în 30 zile' : 'Valid',
              })),
              `Autorizatii_${new Date().toISOString().slice(0,10)}`
            )}>📊 Export Excel</Button>
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr><th className="px-3 py-2">Angajat</th><th className="px-3 py-2">Tip autorizație</th><th className="px-3 py-2">Nr</th><th className="px-3 py-2">Expiră la</th><th className="px-3 py-2">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAuth.length ? filteredAuth.map(item => (
                  <tr key={item.id}>
                    <td className="px-3 py-2">{item.angajat || item.employee_name || item.employee_id}</td>
                    <td className="px-3 py-2">{item.tip || item.tip_autorizatie}</td>
                    <td className="px-3 py-2">{item.nr || item.numar || '-'}</td>
                    <td className="px-3 py-2">{item.data_expirare || '-'}</td>
                    <td className="px-3 py-2"><Badge tone={authTone(item)}>{item.expirat ? 'Expirat' : item.alert ? 'Expiră în 30 zile' : 'Valid'}</Badge></td>
                  </tr>
                )) : <tr><td colSpan="5" className="px-3 py-8 text-center text-sm text-slate-500">{loading ? 'Se incarca...' : 'Nu exista autorizații.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* ─── PONTAJ AVANSAT ───────────────────────────────── */}
      {activeTab === 'Pontaj Avansat' ? (
        <div className="grid gap-4">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><div className="font-semibold">Inchidere pontaj {filters.luna}</div><div className="text-sm text-slate-500">{timesheetLock?.locked ? 'Luna este inchisa. Modificarile sunt blocate.' : 'Luna este deschisa pentru completare si validare.'}</div></div>
              <div className="flex gap-2"><Button variant="secondary" onClick={loadTimesheetLock}>Verifica stare</Button>{hasPerm('hr:timesheets_validate') ? <Button variant={timesheetLock?.locked ? 'secondary' : 'primary'} onClick={toggleTimesheetLock}>{timesheetLock?.locked ? 'Deblocheaza luna' : 'Inchide luna'}</Button> : null}</div>
            </div>
          </Card>
          <Card>
            <div className="grid gap-3 md:grid-cols-3">
              <Select label="Angajat" value={raportEmployee} onChange={e => setRaportEmployee(e.target.value)}
                options={[{ value: '', label: 'Alege angajat…' }, ...filteredEmployees.map(emp => ({ value: String(emp.id), label: fullName(emp) }))]} />
              <Input label="Luna" type="month" value={filters.luna} onChange={e => setFilters({ ...filters, luna: e.target.value })} />
              <div className="flex items-end">
                <Button onClick={() => loadRaportLunar(raportEmployee, filters.luna)} disabled={!raportEmployee}>📊 Generează raport</Button>
              </div>
            </div>
          </Card>

          {raportLunar ? (
            <Card>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-bold text-slate-900">{fullName(raportLunar.employee)} — {raportLunar.luna}</div>
                  <div className="text-sm text-slate-500">{raportLunar.employee?.functia || ''} · {raportLunar.employee?.department_name || ''}</div>
                </div>
                <Button variant="secondary" onClick={() => {
                  const rows = raportLunar.zile.map(z => ({
                    'Data': z.date, 'Tip': z.tip, 'Ore lucru': z.ore_lucrate,
                    'Ore sup. S1 (+75%)': z.ore_suplimentare_s1, 'Ore sup. S2 (+100%)': z.ore_suplimentare_s2,
                    'Ore noapte (+25%)': z.ore_noapte, 'Observații': z.observatii || '',
                  }))
                  exportExcel(rows, `Pontaj_${raportLunar.employee?.nume}_${raportLunar.luna}`)
                }}>📊 Export Excel</Button>
              </div>

              {/* Sumar sporuri */}
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                {[
                  { label: 'Ore lucru normale', value: raportLunar.totals.ore_lucru, icon: '⏱️' },
                  { label: 'Ore suplimentare S1 (+75%)', value: raportLunar.totals.ore_suplimentare_s1, icon: '➕', spor: raportLunar.sporuri?.spor_s1, currency: true },
                  { label: 'Ore suplimentare S2 (+100%)', value: raportLunar.totals.ore_suplimentare_s2, icon: '➕➕', spor: raportLunar.sporuri?.spor_s2, currency: true },
                  { label: 'Ore de noapte (+25%)', value: raportLunar.totals.ore_noapte, icon: '🌙', spor: raportLunar.sporuri?.spor_noapte, currency: true },
                  { label: 'Zile CO', value: raportLunar.totals.zile_co, icon: '🏖️' },
                  { label: 'Zile CM', value: raportLunar.totals.zile_cm, icon: '🏥' },
                ].map(item => (
                  <div key={item.label} className="rounded-lg border border-slate-200 p-3 text-center">
                    <div className="text-xl">{item.icon}</div>
                    <div className="text-2xl font-bold text-slate-900">{item.value}</div>
                    {item.spor != null ? <div className="text-xs font-medium text-primary-700">+{item.spor} RON spor</div> : null}
                    <div className="text-xs text-slate-500">{item.label}</div>
                  </div>
                ))}
              </div>

              {/* Tabel zile */}
              <div className="overflow-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 text-left uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Data</th>
                      <th className="px-3 py-2">Tip</th>
                      <th className="px-3 py-2 text-right">Ore lucru</th>
                      <th className="px-3 py-2 text-right">Ore S1</th>
                      <th className="px-3 py-2 text-right">Ore S2</th>
                      <th className="px-3 py-2 text-right">Ore noapte</th>
                      <th className="px-3 py-2">Obs.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {raportLunar.zile.map(z => (
                      <tr key={z.date} className={z.tip !== 'lucru' && z.tip !== '-' ? 'bg-slate-50' : ''}>
                        <td className="px-3 py-1 font-medium">{z.date.slice(-5)}</td>
                        <td className="px-3 py-1"><span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${timesheetTone(z.tip)}`}>{z.tip}</span></td>
                        <td className="px-3 py-1 text-right">{z.ore_lucrate || '-'}</td>
                        <td className="px-3 py-1 text-right">{z.ore_suplimentare_s1 || '-'}</td>
                        <td className="px-3 py-1 text-right">{z.ore_suplimentare_s2 || '-'}</td>
                        <td className="px-3 py-1 text-right">{z.ore_noapte || '-'}</td>
                        <td className="px-3 py-1 text-slate-400">{z.observatii || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-16 text-sm text-slate-400">
              ↑ Alege un angajat și o lună, apoi apasă Generează raport
            </div>
          )}

          {raportLunar && overtimeBank ? (
            <Card>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-700">🏦 Bancă de ore — {fullName(raportLunar.employee)}</div>
                  <div className="mt-1 text-2xl font-bold text-slate-900">{overtimeBank.sold_curent ?? 0} ore</div>
                  <div className="text-xs text-slate-500">Acumulate: {overtimeBank.ore_acumulate_total ?? 0} · Compensate: {overtimeBank.ore_compensate_total ?? 0}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {Number(overtimeBank.sold_curent || 0) > 40 ? <Badge tone="warning">⚠️ Ore expiră în curând</Badge> : null}
                  <Button size="sm" onClick={() => setCompensateModal(true)}>Compensare</Button>
                </div>
              </div>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr><th className="px-3 py-2">Luna</th><th className="px-3 py-2 text-right">Ore supl.</th><th className="px-3 py-2 text-right">Compensate</th><th className="px-3 py-2 text-right">Sold</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(overtimeBank.istoric || []).length ? overtimeBank.istoric.map(row => (
                      <tr key={row.luna}>
                        <td className="px-3 py-2 font-medium">{row.luna}</td>
                        <td className="px-3 py-2 text-right">{row.ore_suplimentare || 0}</td>
                        <td className="px-3 py-2 text-right">{row.ore_compensate || 0}</td>
                        <td className="px-3 py-2 text-right font-semibold">{row.sold_luna || 0}</td>
                      </tr>
                    )) : <tr><td colSpan="4" className="px-3 py-6 text-center text-sm text-slate-400">Nu există ore suplimentare în bancă.</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}

      {/* ─── TURE & PROGRAM ──────────────────────────────── */}
      {activeTab === 'Ture & Program' ? (
        <div className="grid gap-4">
          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-700">Ture definite</div>
              <Button size="sm" onClick={() => setShiftModal(true)}>+ Tură nouă</Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {tures.map(tura => (
                <div key={tura.id} className="rounded-lg border border-slate-200 p-3" style={{ borderLeft: `5px solid ${tura.culoare || '#3B82F6'}` }}>
                  <div className="font-semibold text-slate-900">{tura.nume}</div>
                  <div className="text-sm text-slate-500">{tura.ora_start}–{tura.ora_sfarsit}</div>
                  <div className="text-xs text-slate-400">{tura.ore_normale || 8} ore normale</div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="mb-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <Input label="Luna" type="month" value={scheduleMonth} onChange={e => setScheduleMonth(e.target.value)} />
              <Select label="Departament" value={scheduleDept} onChange={e => setScheduleDept(e.target.value)} options={[{ value: '', label: 'Toate departamentele' }, ...departments]} />
              <div className="flex items-end"><Button variant="secondary" onClick={loadScheduleData}>↺ Actualizează</Button></div>
            </div>
            <div className="overflow-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-left uppercase text-slate-500">
                  <tr>
                    <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2">Angajat</th>
                    {daysInMonth(scheduleMonth).map(day => <th key={day} className="px-2 py-2 text-center">{day.slice(-2)}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {scheduleEmployees.length ? scheduleEmployees.map(emp => (
                    <tr key={emp.id}>
                      <td className="sticky left-0 z-10 min-w-48 bg-white px-3 py-2">
                        <div className="flex items-center gap-2">
                          {emp.photo_url
                            ? <img src={emp.photo_url} alt="" className="h-7 w-7 rounded-full object-cover" onError={e => { e.target.style.display='none' }} />
                            : <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs">👤</div>
                          }
                          <div>
                            <div className="font-medium text-slate-800">{fullName(emp)}</div>
                            <div className="text-[10px] text-slate-400">{emp.functia || ''}</div>
                          </div>
                        </div>
                      </td>
                      {daysInMonth(scheduleMonth).map(day => {
                        const key = `${emp.id}:${day}`
                        const tura = tures.find(item => String(item.id) === String(scheduleData[key]))
                        const initials = tura?.nume === 'Normal' ? 'N' : (tura?.nume || '').replace(/[^0-9IVX]/gi, '').slice(0, 2) || 'T'
                        return (
                          <td key={day} className="p-1 text-center">
                            <select
                              value={scheduleData[key] || ''}
                              onChange={e => setScheduleShift(emp.id, day, e.target.value)}
                              className="h-7 w-12 rounded border border-slate-200 text-[10px] outline-none"
                              style={tura ? { backgroundColor: tura.culoare, color: '#fff' } : undefined}
                              title={tura ? `${tura.nume} ${tura.ora_start}-${tura.ora_sfarsit}` : 'Alege tură'}
                            >
                              <option value="">—</option>
                              {tures.map(item => <option key={item.id} value={item.id}>{item.nume === 'Normal' ? 'N' : item.nume}</option>)}
                            </select>
                            {tura ? <div className="mt-0.5 text-[9px] font-semibold" style={{ color: tura.culoare }}>{initials}</div> : null}
                          </td>
                        )
                      })}
                    </tr>
                  )) : <tr><td colSpan={daysInMonth(scheduleMonth).length + 1} className="px-3 py-8 text-center text-sm text-slate-500">Nu există angajați pentru filtrul ales.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}

      {/* ─── TICHETE MASĂ ────────────────────────────────── */}
      {activeTab === 'Tichete masă' ? (
        <div className="grid gap-4">
          <Card>
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <Input label="💰 Valoare tichet (lei)" type="number" value={mealConfig.valoare_tichet || 40} onChange={e => setMealConfig({ ...mealConfig, valoare_tichet: Number(e.target.value) })} />
              <Button onClick={saveMealConfig}>Salvează</Button>
            </div>
          </Card>
          <Card>
            <div className="mb-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <Input label="Luna" type="month" value={mealMonth} onChange={e => setMealMonth(e.target.value)} />
              <Select label="Departament" value={mealDept} onChange={e => setMealDept(e.target.value)} options={[{ value: '', label: 'Toate departamentele' }, ...departments]} />
              <div className="flex items-end"><Button variant="secondary" onClick={exportMealTicketsCsv}>📥 Export CSV furnizor</Button></div>
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr><th className="px-3 py-2">Angajat</th><th className="px-3 py-2 text-right">Zile lucrate</th><th className="px-3 py-2 text-right">Zile CO</th><th className="px-3 py-2 text-right">Zile CM</th><th className="px-3 py-2 text-right">Tichete</th><th className="px-3 py-2 text-right">Valoare</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {mealRows.length ? mealRows.map(row => (
                    <tr key={row.employee_id}>
                      <td className="px-3 py-2 font-medium">{row.angajat || `${row.nume || ''} ${row.prenume || ''}`}</td>
                      <td className="px-3 py-2 text-right">{row.zile_lucrate || 0}</td>
                      <td className="px-3 py-2 text-right">{row.zile_co || 0}</td>
                      <td className="px-3 py-2 text-right">{row.zile_cm || 0}</td>
                      <td className="px-3 py-2 text-right font-semibold">{row.tichete || 0}</td>
                      <td className="px-3 py-2 text-right">{Number(row.valoare || 0).toLocaleString('ro-RO')} lei</td>
                    </tr>
                  )) : <tr><td colSpan="6" className="px-3 py-8 text-center text-sm text-slate-500">Nu există date pentru luna selectată.</td></tr>}
                  <tr className="bg-slate-50 font-semibold">
                    <td className="px-3 py-2 text-right" colSpan="4">Total:</td>
                    <td className="px-3 py-2 text-right">{mealRows.reduce((sum, row) => sum + Number(row.tichete || 0), 0)} buc</td>
                    <td className="px-3 py-2 text-right">{mealRows.reduce((sum, row) => sum + Number(row.valoare || 0), 0).toLocaleString('ro-RO')} lei</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}

      {/* ─── TRAINING & EVALUĂRI ──────────────────────────── */}
      {activeTab === 'Training & Evaluări' ? (
        <div className="grid gap-4">
          {/* Scadențar cursuri obligatorii */}
          {scadentar.length === 0 && !loading ? null : (
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-700">⚠️ Scadențar cursuri obligatorii (SSM / PSI / ISCIR)</div>
                <Button size="sm" variant="secondary" onClick={loadTrainingData}>↺ Actualizează</Button>
              </div>
              {scadentar.length === 0 ? (
                <p className="text-sm text-slate-400">Toate cursurile sunt la zi.</p>
              ) : (
                <div className="grid gap-2">
                  {scadentar.map((item, idx) => (
                    <div key={`${item.employee_id}-${item.tip_curs}-${idx}`}
                      className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${item.status === 'expirat' ? 'border-rose-200 bg-rose-50' : item.status === 'urgent' ? 'border-orange-200 bg-orange-50' : 'border-amber-200 bg-amber-50'}`}>
                      <div>
                        <span className="text-lg">{item.icon}</span>
                        <span className="ml-2 font-medium text-slate-800">{item.employee_name}</span>
                        <span className="ml-2 text-slate-500">— {item.tip_curs}</span>
                        <span className="ml-1 text-xs text-slate-400">{item.department}</span>
                      </div>
                      <Badge tone={item.status === 'expirat' ? 'danger' : item.status === 'urgent' ? 'warning' : 'neutral'}>
                        {item.days_until_expiry < 0 ? `Expirat ${Math.abs(item.days_until_expiry)}z` : `${item.days_until_expiry}z rămase`}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Evaluări */}
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-700">📋 Evaluări angajați ({evaluations.length})</div>
              <Button size="sm" onClick={() => { setEvalEditing(null); setEvalForm({ employee_id: '', data_evaluare: new Date().toISOString().slice(0,10), tip: 'periodica', calificativ: 'B', punctaj: '', observatii: '', obiective: '', recomandari: '' }); setEvalModal(true) }}>+ Evaluare nouă</Button>
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Angajat</th>
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2">Tip</th>
                    <th className="px-3 py-2">Calificativ</th>
                    <th className="px-3 py-2">Punctaj</th>
                    <th className="px-3 py-2">Observații</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {evaluations.length ? evaluations.map(ev => {
                    const emp = employees.find(e => String(e.id) === String(ev.employee_id))
                    return (
                      <tr key={ev.id}>
                        <td className="px-3 py-2 font-medium">{emp ? fullName(emp) : ev.employee_id}</td>
                        <td className="px-3 py-2">{ev.data_evaluare}</td>
                        <td className="px-3 py-2"><Badge tone="neutral">{ev.tip}</Badge></td>
                        <td className="px-3 py-2">
                          <Badge tone={ev.calificativ === 'FB' ? 'success' : ev.calificativ === 'B' ? 'primary' : ev.calificativ === 'S' ? 'warning' : 'danger'}>
                            {ev.calificativ || '—'}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">{ev.punctaj ?? '—'}</td>
                        <td className="px-3 py-2 max-w-xs truncate text-slate-500">{ev.observatii || '—'}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-2">
                            <button className="text-xs text-primary-600 hover:underline" onClick={() => { setEvalEditing(ev); setEvalForm({ ...ev }); setEvalModal(true) }}>✏️</button>
                            <button className="text-xs text-rose-500 hover:underline" onClick={() => deleteEvaluation(ev.id)}>🗑️</button>
                          </div>
                        </td>
                      </tr>
                    )
                  }) : <tr><td colSpan="7" className="px-3 py-8 text-center text-sm text-slate-400">Nu există evaluări. Adaugă prima evaluare.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}

      {/* ─── ECHIPAMENTE PROTECȚIE ───────────────────────── */}
      {activeTab === '🦺 Echipamente' ? (
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">{['Necesar per Departament', 'Expirări', 'Comandă Furnizor', '📚 Catalog'].map(tab => <Button key={tab} size="sm" variant={equipmentTab === tab ? 'primary' : 'secondary'} onClick={() => setEquipmentTab(tab)}>{tab}</Button>)}</div>
            <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={exportEquipmentOrder}>📥 Export Excel</Button><Button size="sm" onClick={createEquipmentReferat}>🛒 Creează Referat Aprovizionare</Button></div>
          </div>
          {equipmentTab === 'Necesar per Departament' ? <div className="overflow-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Departament</th><th className="px-3 py-2">Echipament</th><th className="px-3 py-2">Mărime</th><th className="px-3 py-2">Culoare</th><th className="px-3 py-2">Cod articol</th><th className="px-3 py-2 text-right">Cant.</th></tr></thead><tbody>{equipmentRows.map((row, index) => <tr key={`${row.departament}-${row.tip}-${row.marime}-${index}`} className="border-t"><td className="px-3 py-2">{row.departament}</td><td className="px-3 py-2">{row.tip}</td><td className="px-3 py-2">{row.marime}</td><td className="px-3 py-2">{row.culoare || '-'}</td><td className="px-3 py-2">{row.cod_articol || '-'}</td><td className="px-3 py-2 text-right">{row.cantitate}</td></tr>)}</tbody></table>{equipmentRows.length === 0 ? <p className="p-4 text-sm text-slate-500">Completează mărimile în fișele angajaților pentru a genera necesarul.</p> : null}</div> : null}
          {equipmentTab === 'Expirări' ? <div className="grid gap-2">{equipmentExpiry.map(row => <div key={row.id} className={`rounded-md border px-3 py-2 text-sm ${row.zile_ramase < 0 ? 'border-rose-300 bg-rose-50' : row.zile_ramase <= 30 ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`}><strong>{row.angajat}</strong> · {row.tip_denumire} · expiră {row.data_expirare} ({row.zile_ramase} zile)</div>)}{equipmentExpiry.length === 0 ? <p className="text-sm text-slate-500">Nu există expirări în următoarele 90 zile.</p> : null}</div> : null}
          {equipmentTab === 'Comandă Furnizor' ? <div className="overflow-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Cod articol</th><th className="px-3 py-2">Echipament</th><th className="px-3 py-2">Mărime</th><th className="px-3 py-2">Culoare</th><th className="px-3 py-2">CPV</th><th className="px-3 py-2 text-right">Cant.</th></tr></thead><tbody>{equipmentOrder.map((row, index) => <tr key={`${row.cod_articol}-${row.tip}-${row.marime}-${index}`} className="border-t"><td className="px-3 py-2">{row.cod_articol}</td><td className="px-3 py-2">{row.tip}</td><td className="px-3 py-2">{row.marime}</td><td className="px-3 py-2">{row.culoare}</td><td className="px-3 py-2">{row.cpv_cod}</td><td className="px-3 py-2 text-right">{row.cantitate}</td></tr>)}</tbody></table></div> : null}
          {equipmentTab === '📚 Catalog' ? <div>
            <div className="mb-3 flex justify-end">{canManageEquipment ? <Button size="sm" onClick={() => openCatalogModal()}>+ Obiect nou</Button> : null}</div>
            <div className="overflow-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Denumire</th><th className="px-3 py-2">Categorie</th><th className="px-3 py-2">Mărime</th><th className="px-3 py-2">Serie</th><th className="px-3 py-2">Expirare</th><th className="px-3 py-2 text-right">Val. inventar</th><th className="px-3 py-2">Cod articol</th><th className="px-3 py-2">Activ</th><th className="px-3 py-2"></th></tr></thead><tbody>{equipmentCatalog.map(item => <tr key={item.id} className="border-t"><td className="px-3 py-2 font-medium">{item.denumire}</td><td className="px-3 py-2">{item.categorie}</td><td className="px-3 py-2">{item.are_marime ? (item.marimi || []).join(', ') || 'Da' : 'Nu'}</td><td className="px-3 py-2">{item.are_serie ? 'Da' : 'Nu'}</td><td className="px-3 py-2">{item.are_expirare ? `${item.durata_luni || 0} luni` : 'Nu'}</td><td className="px-3 py-2 text-right">{Number(item.valoare_inventar || 0).toFixed(2)} lei</td><td className="px-3 py-2">{item.cod_articol || '-'}</td><td className="px-3 py-2">{item.activ ? 'Da' : 'Nu'}</td><td className="px-3 py-2">{canManageEquipment ? <Button size="sm" variant="secondary" onClick={() => openCatalogModal(item)}>Editează</Button> : null}</td></tr>)}</tbody></table></div>
          </div> : null}
        </Card>
      ) : null}

      {/* ─── ORGANIGRAMĂ ──────────────────────────────────── */}
      {activeTab === 'Organigramă' ? (
        <OrgChart employees={employees} departments={departments} onClickEmployee={openEmployee} />
      ) : null}

      {/* ─── DOCUMENTE HR ─────────────────────────────────── */}
      {activeTab === 'Documente HR' ? (
        <div className="grid gap-4">
          <Card>
            <div className="mb-1 text-sm font-semibold text-slate-700">📂 Dosar personal — generare documente HR</div>
            <p className="text-xs text-slate-400">Selectează angajatul și documentul dorit. Documentele se deschid în tab nou pentru print / salvare PDF.</p>
          </Card>

          <div className="grid gap-4">
            {filteredEmployees.map(emp => (
              <Card key={emp.id} className="overflow-hidden">
                {/* Header angajat */}
                <div className="mb-3 flex items-center gap-3 border-b border-slate-100 pb-3">
                  {emp.photo_url
                    ? <img src={emp.photo_url} alt="" className="h-10 w-10 rounded-full object-cover" onError={e => { e.target.style.display='none' }} />
                    : <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xl">👤</div>
                  }
                  <div>
                    <div className="font-semibold text-slate-900">{fullName(emp)}</div>
                    <div className="text-xs text-slate-400">{emp.functia || '-'} · {emp.department_name || '-'} · Angajat din {emp.data_angajare || '—'}</div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {/* A. La angajare */}
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">📋 La angajare</div>
                    <div className="flex flex-col gap-1">
                      {[
                        { label: '📝 Cerere de angajare', fn: async () => { const r = await api.get(`/hr/employees/${emp.id}/adeverinta`, { params: { tip: 'salariat' } }); printCerereAngajare(r.data) }, cls: 'bg-slate-50 text-slate-700 hover:bg-slate-100' },
                        { label: '📑 Contract individual muncă', fn: async () => { const r = await api.get(`/hr/employees/${emp.id}/cim`); printCIM(r.data) }, cls: 'bg-primary-50 text-primary-700 hover:bg-primary-100' },
                        { label: '📋 Fișa postului', fn: async () => { const r = await api.get(`/hr/employees/${emp.id}/adeverinta`, { params: { tip: 'salariat' } }); printFisaPost(r.data) }, cls: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' },
                        { label: '💸 Declarație deduceri personale', fn: async () => { const r = await api.get(`/hr/employees/${emp.id}/adeverinta`, { params: { tip: 'salariat' } }); printDeclDeduceri(r.data) }, cls: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
                        { label: '🏢 Declarație funcție de bază', fn: async () => { const r = await api.get(`/hr/employees/${emp.id}/adeverinta`, { params: { tip: 'salariat' } }); printDeclFunctieBaza(r.data) }, cls: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
                        { label: '🔒 Notă informare GDPR', fn: async () => { const r = await api.get(`/hr/employees/${emp.id}/adeverinta`, { params: { tip: 'salariat' } }); printNotaGDPR(r.data) }, cls: 'bg-violet-50 text-violet-700 hover:bg-violet-100' },
                      ].map(item => (
                        <button key={item.label} className={`rounded px-2 py-1 text-left text-xs font-medium ${item.cls}`}
                          onClick={async () => { try { await item.fn() } catch { setError('Eroare la generare document.') } }}
                        >{item.label}</button>
                      ))}
                    </div>
                  </div>

                  {/* B. Adeverințe */}
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">📄 Adeverințe</div>
                    <div className="flex flex-col gap-1">
                      {[
                        { tip: 'salariat', label: '👤 Adeverință salariat', cls: 'bg-primary-50 text-primary-700 hover:bg-primary-100' },
                        { tip: 'venit', label: '💰 Adeverință de venit', cls: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
                        { tip: 'vechime', label: '📅 Adeverință vechime', cls: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
                        { tip: 'functie', label: '💼 Adeverință funcție', cls: 'bg-slate-50 text-slate-700 hover:bg-slate-100' },
                        { tip: 'casa_sanatate', label: '🏥 Adeverință casă sănătate', cls: 'bg-green-50 text-green-700 hover:bg-green-100' },
                        { tip: 'concediu_medical', label: '🤒 Adeverință concediu medical', cls: 'bg-rose-50 text-rose-700 hover:bg-rose-100' },
                      ].map(item => (
                        <button key={item.tip} className={`rounded px-2 py-1 text-left text-xs font-medium ${item.cls}`}
                          onClick={async () => { try { const r = await api.get(`/hr/employees/${emp.id}/adeverinta`, { params: { tip: item.tip } }); printAdeverinta(r.data) } catch { setError('Eroare la generare adeverință.') } }}
                        >{item.label}</button>
                      ))}
                    </div>
                  </div>

                  {/* C. Pe durata contractului */}
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">🔄 Pe durata contractului</div>
                    <div className="flex flex-col gap-1">
                      {[
                        { label: '📎 Act adițional CIM', fn: async () => { const r = await api.get(`/hr/employees/${emp.id}/adeverinta`, { params: { tip: 'salariat' } }); printActAditional(r.data) }, cls: 'bg-orange-50 text-orange-700 hover:bg-orange-100' },
                        { label: '🏖️ Cerere concediu odihnă', fn: async () => { const r = await api.get(`/hr/employees/${emp.id}/adeverinta`, { params: { tip: 'salariat' } }); printCerereConc(r.data, 'co') }, cls: 'bg-sky-50 text-sky-700 hover:bg-sky-100' },
                        { label: '🕊️ Cerere concediu fără plată', fn: async () => { const r = await api.get(`/hr/employees/${emp.id}/adeverinta`, { params: { tip: 'salariat' } }); printCerereConc(r.data, 'fara_plata') }, cls: 'bg-slate-50 text-slate-700 hover:bg-slate-100' },
                        { label: '👨‍👩‍👧 Cerere concediu familial', fn: async () => { const r = await api.get(`/hr/employees/${emp.id}/adeverinta`, { params: { tip: 'salariat' } }); printCerereConc(r.data, 'fam') }, cls: 'bg-pink-50 text-pink-700 hover:bg-pink-100' },
                      ].map(item => (
                        <button key={item.label} className={`rounded px-2 py-1 text-left text-xs font-medium ${item.cls}`}
                          onClick={async () => { try { await item.fn() } catch { setError('Eroare la generare document.') } }}
                        >{item.label}</button>
                      ))}
                    </div>
                  </div>

                  {/* D. La încetare */}
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">🔴 La încetare contract</div>
                    <div className="flex flex-col gap-1">
                      {[
                        { label: '📬 Notificare preaviz concediere', fn: async () => { const r = await api.get(`/hr/employees/${emp.id}/adeverinta`, { params: { tip: 'salariat' } }); printNotificarePrv(r.data) }, cls: 'bg-orange-50 text-orange-700 hover:bg-orange-100' },
                        { label: '⚖️ Decizie de concediere', fn: async () => { const r = await api.get(`/hr/employees/${emp.id}/adeverinta`, { params: { tip: 'salariat' } }); printDecizieConc(r.data) }, cls: 'bg-rose-50 text-rose-700 hover:bg-rose-100' },
                        { label: '📅 Adeverință vechime la ieșire', fn: async () => { const r = await api.get(`/hr/employees/${emp.id}/adeverinta`, { params: { tip: 'vechime' } }); printAdeverinta(r.data) }, cls: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
                        { label: '🧾 Notă de lichidare', fn: async () => { const [r, equipment] = await Promise.all([api.get(`/hr/employees/${emp.id}/adeverinta`, { params: { tip: 'salariat' } }), api.get(`/hr/echipamente/angajat/${emp.id}`)]); printNotaLichidare({ ...r.data, inventar: equipment.data.inventar }) }, cls: 'bg-red-50 text-red-700 hover:bg-red-100' },
                      ].map(item => (
                        <button key={item.label} className={`rounded px-2 py-1 text-left text-xs font-medium ${item.cls}`}
                          onClick={async () => { try { await item.fn() } catch { setError('Eroare la generare document.') } }}
                        >{item.label}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
            {filteredEmployees.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-slate-200 py-16 text-center text-sm text-slate-400">Nu există angajați activi.</div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ─── MODAL FIȘA ANGAJAT ───────────────────────────── */}
      <Modal open={Boolean(selectedEmployee)} title={selectedEmployee ? `Fișa — ${fullName(selectedEmployee)}` : ''} onClose={() => setSelectedEmployee(null)} size="lg">
        {employeeDetails ? (
          <div className="grid gap-4">
            <EmployeeFilesPanel employeeId={employeeDetails.id} canManage={hasPerm('hr:manage')} onError={setError} />
            {/* Photo + basic info */}
            <div className="flex items-start gap-4">
              <div className="relative flex-shrink-0">
                {photoPreview || employeeDetails.photo_url
                  ? <img src={photoPreview || employeeDetails.photo_url} alt="Fotografie" className="h-20 w-20 rounded-xl object-cover ring-2 ring-primary-200" onError={e => { e.target.style.display='none' }} />
                  : <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-slate-100 text-4xl">👤</div>
                }
                {editMode ? (
                  <button
                    type="button"
                    className="absolute -bottom-1 -right-1 rounded-full bg-primary-600 p-1 text-white shadow hover:bg-primary-700"
                    onClick={() => photoInputRef.current?.click()}
                    title="Schimbă fotografia"
                  >📷</button>
                ) : null}
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setPhotoFile(file)
                    setPhotoPreview(URL.createObjectURL(file))
                  }}
                />
              </div>
              <div className="flex-1">
                <div className="text-lg font-bold text-slate-900">{fullName(employeeDetails)}</div>
                <div className="text-sm text-slate-500">{employeeDetails.functia || '-'} · {employeeDetails.department_name || '-'}</div>
                <div className="mt-1 text-xs text-slate-400">Marcă: {employeeDetails.marca || '-'} · Vechime: {employeeDetails.zile_vechime ?? '-'} zile</div>
                <div className="mt-2 flex gap-2">
                  {editMode
                    ? <>
                        <Button size="sm" onClick={saveEmployeeEdit}>💾 Salvează</Button>
                        <Button size="sm" variant="secondary" onClick={() => { setEditMode(false); setPhotoPreview(null); setPhotoFile(null) }}>Renunță</Button>
                      </>
                    : <Button size="sm" variant="secondary" onClick={() => setEditMode(true)}>✏️ Editează</Button>
                  }
                </div>
              </div>
            </div>

            {editMode ? (
              <div className="grid gap-4">
                {/* Banner avertizare angajat importat din Autominder cu date HR incomplete */}
                {(employeeDetails.sursa === 'autominder' || employeeDetails.sursa_autominder) && !employeeDetails.cnp && (
                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                    ⚠️ Angajat importat din <strong>Autominder</strong>. Completează datele HR lipsă (CNP, IBAN, contract etc.) pentru a activa toate funcționalitățile.
                  </div>
                )}
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-3 text-xs font-semibold uppercase text-slate-500">📋 Date personale</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input label="Nume" value={editForm.nume || ''} onChange={e => setEditForm({...editForm, nume: e.target.value})} />
                    <Input label="Prenume" value={editForm.prenume || ''} onChange={e => setEditForm({...editForm, prenume: e.target.value})} />
                    <Input label="CNP *" maxLength={13} value={editForm.cnp || ''} onChange={e => setEditForm({...editForm, cnp: e.target.value})}
                      className={!editForm.cnp ? 'border-yellow-400 bg-yellow-50' : ''}
                      placeholder={!editForm.cnp ? 'Completează CNP (obligatoriu)' : ''} />
                    <Input label="Nr. marcă" value={editForm.marca || ''} onChange={e => setEditForm({...editForm, marca: e.target.value})} />
                    <Input label="Email" type="email" value={editForm.email || ''} onChange={e => setEditForm({...editForm, email: e.target.value})}
                      className={!editForm.email ? 'border-yellow-300 bg-yellow-50' : ''} placeholder={!editForm.email ? 'Completează email' : ''} />
                    <Input label="Telefon" value={editForm.telefon || ''} onChange={e => setEditForm({...editForm, telefon: e.target.value})}
                      className={!editForm.telefon ? 'border-yellow-300 bg-yellow-50' : ''} placeholder={!editForm.telefon ? 'Completează telefon' : ''} />
                    <Input label="Adresă" value={editForm.adresa || ''} onChange={e => setEditForm({...editForm, adresa: e.target.value})} />
                    <Select label="Stare civilă" value={editForm.stare_civila || ''} onChange={e => setEditForm({...editForm, stare_civila: e.target.value})} options={[
                      { value: '', label: 'Necunoscută' },
                      { value: 'necasatorit', label: 'Necăsătorit(ă)' },
                      { value: 'casatorit', label: 'Căsătorit(ă)' },
                      { value: 'divortat', label: 'Divorțat(ă)' },
                      { value: 'vaduv', label: 'Văduv(ă)' },
                    ]} />
                    <Input label="Copii în întreținere" type="number" value={editForm.nr_copii_intretinere ?? 0} onChange={e => setEditForm({...editForm, nr_copii_intretinere: Number(e.target.value)})} />
                    <Input label="Casa de sănătate" value={editForm.casa_sanatate || ''} onChange={e => setEditForm({...editForm, casa_sanatate: e.target.value})} />
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <Select label="Tip act" value={editForm.act_identitate_tip || 'CI'} onChange={e => setEditForm({...editForm, act_identitate_tip: e.target.value})} options={[
                      { value: 'CI', label: 'CI' },
                      { value: 'BI', label: 'BI' },
                      { value: 'pasaport', label: 'Pașaport' },
                      { value: 'permis_sedere', label: 'Permis ședere' },
                    ]} />
                    <Input label="Serie" maxLength={5} placeholder="NT" value={editForm.act_identitate_serie || ''} onChange={e => setEditForm({...editForm, act_identitate_serie: e.target.value.toUpperCase().slice(0, 5)})} />
                    <Input label="Număr" maxLength={10} placeholder="123456" value={editForm.act_identitate_numar || ''} onChange={e => setEditForm({...editForm, act_identitate_numar: e.target.value.slice(0, 10)})} />
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Input label="Eliberat de" value={editForm.act_identitate_eliberat_de || ''} onChange={e => setEditForm({...editForm, act_identitate_eliberat_de: e.target.value})} />
                    <Input label="Data eliberării" type="date" value={editForm.act_identitate_data_eliberare || ''} onChange={e => setEditForm({...editForm, act_identitate_data_eliberare: e.target.value})} />
                  </div>
                  <Input className="mt-3" label="Valabil până" type="date" value={editForm.act_identitate_valabil_pana || ''} onChange={e => setEditForm({...editForm, act_identitate_valabil_pana: e.target.value})} />
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-3 text-xs font-semibold uppercase text-slate-500">💼 Date angajare</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input label="Funcția" value={editForm.functia || ''} onChange={e => setEditForm({...editForm, functia: e.target.value})} />
                    <Input label="Cod COR" value={editForm.functie_cor || ''} onChange={e => setEditForm({...editForm, functie_cor: e.target.value})} />
                    <Select label="Departament" value={String(editForm.department_id || '')} onChange={e => setEditForm({...editForm, department_id: e.target.value})} options={[{ value: '', label: 'Alege departament' }, ...departments]} />
                    <Select label="Nivel studii" value={editForm.nivel_studii || ''} onChange={e => setEditForm({...editForm, nivel_studii: e.target.value})} options={[
                      { value: '', label: 'Alege nivel' },
                      { value: 'primar', label: 'Primar' },
                      { value: 'gimnazial', label: 'Gimnazial' },
                      { value: 'liceal', label: 'Liceal' },
                      { value: 'postliceal', label: 'Postliceal' },
                      { value: 'superior', label: 'Superior' },
                    ]} />
                    <Input label="Normă ore/zi" type="number" value={editForm.norma_ore_zi ?? 8} onChange={e => setEditForm({...editForm, norma_ore_zi: Number(e.target.value)})} />
                    <Input label="Zile CO / an" type="number" value={editForm.zile_co_drept ?? 21} onChange={e => setEditForm({...editForm, zile_co_drept: Number(e.target.value)})} />
                    <Input label="Expiră contract" type="date" value={editForm.data_expirare_contract || ''} onChange={e => setEditForm({...editForm, data_expirare_contract: e.target.value})} />
                  </div>
                  {String(editForm.department_id || '') !== String(employeeDetails.department_id || '') ? (
                    <div className="mt-3 grid gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 sm:grid-cols-2">
                      <Input label="Data transferului" type="date" value={editForm.department_transfer_date || ''} onChange={e => setEditForm({...editForm, department_transfer_date: e.target.value})} required />
                      <Input label="Motiv transfer" value={editForm.department_transfer_reason || ''} onChange={e => setEditForm({...editForm, department_transfer_reason: e.target.value})} placeholder="Transfer intern, reorganizare..." required />
                    </div>
                  ) : null}
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">💰 Date financiare <Badge tone="warning" size="sm">Confidențial</Badge></div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input label="IBAN" value={editForm.iban || ''} onChange={e => setEditForm({...editForm, iban: e.target.value})}
                      className={!editForm.iban ? 'border-yellow-300 bg-yellow-50' : ''}
                      placeholder={!editForm.iban ? 'RO49AAAA1B31007593840000' : ''} />
                    <Input label="Salariu bază (RON)" type="number" value={editForm.salariu_baza || ''} onChange={e => setEditForm({...editForm, salariu_baza: e.target.value})} />
                    <Input label="Deducere personală" type="number" value={editForm.deducere_personala || ''} onChange={e => setEditForm({...editForm, deducere_personala: e.target.value})} />
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-3 text-xs font-semibold uppercase text-slate-500">📄 Documente & Expirări</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input label="Categorii permis" value={editForm.permis_conducere_categorii || ''} onChange={e => setEditForm({...editForm, permis_conducere_categorii: e.target.value})} />
                    <Input label="Permis expiră" type="date" value={editForm.permis_conducere_expira || editForm.data_expirare_permis || ''} onChange={e => setEditForm({...editForm, permis_conducere_expira: e.target.value, data_expirare_permis: e.target.value})} />
                    <Input label="Expiră ISCIR" type="date" value={editForm.data_expirare_iscir || ''} onChange={e => setEditForm({...editForm, data_expirare_iscir: e.target.value})} />
                    <Input label="Apt medical expiră" type="date" value={editForm.apt_medical_expira || editForm.adeverinta_medicala || ''} onChange={e => setEditForm({...editForm, apt_medical_expira: e.target.value, adeverinta_medicala: e.target.value})} />
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-3 text-xs font-semibold uppercase text-slate-500">✅ GDPR</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={Boolean(editForm.acord_gdpr)} onChange={e => setEditForm({...editForm, acord_gdpr: e.target.checked, data_acord_gdpr: e.target.checked ? (editForm.data_acord_gdpr || new Date().toISOString().slice(0,10)) : ''})} />
                      Acord GDPR
                    </label>
                    <Input label="Data acord GDPR" type="date" value={editForm.data_acord_gdpr || ''} onChange={e => setEditForm({...editForm, data_acord_gdpr: e.target.value})} />
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={editForm.activ !== false} onChange={e => setEditForm({...editForm, activ: e.target.checked})} />
                      Angajat activ
                    </label>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="mb-1 text-xs font-semibold uppercase text-slate-400">Date personale</div>
                  <div>Data nașterii: {employeeDetails.data_nasterii || '-'}</div>
                  <div>Sex: {employeeDetails.sex || '-'}</div>
                  <div>Stare civilă: {employeeDetails.stare_civila || '-'}</div>
                  <div>Copii întreținere: {employeeDetails.nr_copii_intretinere ?? 0}</div>
                  <div>Casa sănătate: {employeeDetails.casa_sanatate || '-'}</div>
                  <div>Act identitate: {identityText(employeeDetails)}</div>
                  <div>Valabil act: {employeeDetails.act_identitate_valabil_pana || '-'}</div>
                  <div>Adresă: {employeeDetails.adresa || '-'}</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="mb-1 text-xs font-semibold uppercase text-slate-400">Contract &amp; CO</div>
                  <div>Tip: {employeeDetails.tip_contract || '-'}</div>
                  <div>Data angajare: {employeeDetails.data_angajare || '-'}</div>
                  <div>Cod COR: {employeeDetails.functie_cor || '-'}</div>
                  <div>Normă: {employeeDetails.norma_ore_zi || 8} ore/zi</div>
                  <div>Expiră contract: {employeeDetails.data_expirare_contract || '—'}</div>
                  <div className="mt-2 font-semibold text-primary-700">
                    CO {new Date().getFullYear()}: {coBalance ? `${coBalance.zile_ramase} zile rămase` : `${employeeDetails.zile_co_drept ?? 21} / an`}
                  </div>
                  {coBalance ? (
                    <div className="mt-1">
                      <div className="mb-1 text-xs text-slate-500">{coBalance.zile_efectuate} efectuate din {coBalance.zile_drept} totale</div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                        <div className="h-2 rounded-full bg-primary-500 transition-all" style={{ width: `${Math.min(100, Math.round(coBalance.zile_efectuate / Math.max(1, coBalance.zile_drept) * 100))}%` }} />
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => loadAdeverinta(employeeDetails.id)}>📄 Generează adeverință</Button>
                  </div>
                  {adeverintaData && String(adeverintaData.angajat?.id) === String(employeeDetails.id) ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Select label="" value={adeverintaTip} onChange={e => setAdeverintaTip(e.target.value)} options={[
                        { value: 'salariat', label: 'Adeverință salariat' },
                        { value: 'venit', label: 'Adeverință venit' },
                        { value: 'vechime', label: 'Adeverință vechime' },
                        { value: 'casa_sanatate', label: 'Adeverință casă sănătate' },
                        { value: 'concediu_medical', label: 'Adeverință concediu medical' },
                        { value: 'functie', label: 'Adeverință funcție' },
                      ]} />
                      <Button size="sm" onClick={() => printAdeverinta(adeverintaData)}>🖨️ Print</Button>
                    </div>
                  ) : null}
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="mb-1 text-xs font-semibold uppercase text-slate-400">Documente obligatorii</div>
                  {[
                    { label: 'Permis conducere', date: employeeDetails.permis_conducere_expira || employeeDetails.data_expirare_permis },
                    { label: 'ISCIR', date: employeeDetails.data_expirare_iscir },
                    { label: 'Apt medical', date: employeeDetails.apt_medical_expira || employeeDetails.adeverinta_medicala },
                  ].map(d => {
                    const days = daysUntil(d.date)
                    const tone = alertTone(days)
                    return (
                      <div key={d.label} className={`flex items-center justify-between ${tone === 'danger' ? 'text-rose-700' : tone === 'warning' ? 'text-amber-700' : ''}`}>
                        <span>{d.label}:</span>
                        <span>{d.date || '—'}{tone ? (days < 0 ? ' ⛔' : ' ⚠️') : ''}</span>
                      </div>
                    )
                  })}
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="mb-1 text-xs font-semibold uppercase text-slate-400">Statistici pontaj</div>
                  <div>Zile pontate: {employeeDetails.statistici_pontaj?.zile_pontate ?? 0}</div>
                  <div>Ore total: {employeeDetails.statistici_pontaj?.ore_total ?? 0}</div>
                  <div>Autorizații: {(employeeDetails.autorizatii || []).length}</div>
                  <div>Contracte active: {(employeeDetails.contracte_active || []).length}</div>
                </div>
              </div>
            )}
            {transferHistory.length ? (
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Istoric departamente</div>
                <div className="grid gap-2">
                  {transferHistory.map(item => <div key={item.uuid || item.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span><strong>{item.departament_vechi_nume || item.dept_vechi || 'Fara departament'}</strong> → <strong>{item.departament_nou_nume || item.dept_nou}</strong></span><span className="text-xs text-slate-500">{item.data_transfer} · {item.motiv || 'fara motiv'}</span></div>)}
                </div>
              </div>
            ) : null}
            <div className="rounded-lg border border-primary-100 bg-primary-50/40 p-3">
              <div className="mb-3 flex items-center justify-between"><div className="text-xs font-semibold uppercase text-primary-700">🦺 Echipamente și inventar în răspundere</div>{canManageEquipment ? <Button size="sm" onClick={() => { const first = employeeEquipment?.marimi?.[0]; setDotareForm({ angajat_id: employeeDetails.id, tip_id: first?.id || '', marime: first?.marime || '', numar_serie: '', valoare_inventar: first?.valoare_inventar || '', data_dotare: new Date().toISOString().slice(0, 10), cantitate: 1, stare: 'nou', observatii: '' }); setDotareModal(true) }}>+ Înregistrează dotare nouă</Button> : null}</div>
              {employeeEquipment ? <>
                <div className="grid gap-2 sm:grid-cols-3">{employeeEquipment.marimi.filter(tip => tip.are_marime).map(tip => <Select key={tip.id} label={tip.denumire} value={tip.marime || ''} onChange={event => saveEmployeeSizes(tip.id, event.target.value)} options={[{ value: '', label: 'Alege mărimea' }, ...tip.marimi_disponibile.map(marime => ({ value: marime, label: marime }))]} />)}</div>
                {[['Echipamente protecție', employeeEquipment.inventar?.echipamente_protectie], ['Scule și unelte', employeeEquipment.inventar?.scule_unelte], ['Alte obiecte inventar', employeeEquipment.inventar?.alte_obiecte]].map(([title, rows]) => <div key={title} className="mt-4"><div className="mb-1 text-xs font-semibold uppercase text-slate-600">{title}</div><div className="overflow-auto"><table className="min-w-full text-xs"><thead><tr className="text-left text-slate-500"><th className="py-1">Obiect</th><th>Mărime</th><th>Nr. serie</th><th>Data dotare</th><th>Expiră</th><th>Cant.</th><th>Stare</th><th className="text-right">Valoare</th><th>Predat</th></tr></thead><tbody>{(rows || []).map(row => <tr key={row.id} className="border-t"><td className="py-1">{row.tip_denumire}</td><td>{row.marime || '-'}</td><td>{row.numar_serie || '-'}</td><td>{row.data_dotare}</td><td>{row.data_expirare || '-'}</td><td>{row.cantitate}</td><td>{row.stare}</td><td className="text-right">{Number(row.valoare_inventar || 0).toFixed(2)} lei</td><td>{canManageEquipment ? <input type="checkbox" checked={!!row.predat_la_lichidare} onChange={event => setReturnedEquipment(row, event.target.checked)} /> : row.predat_la_lichidare ? 'Da' : 'Nu'}</td></tr>)}</tbody></table>{!(rows || []).length ? <div className="py-2 text-xs text-slate-400">Nu există obiecte active.</div> : null}</div></div>)}
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">Total valoare în răspundere: {Number(employeeEquipment.inventar?.total_valoare || 0).toFixed(2)} lei</div>
              </> : <p className="text-sm text-slate-500">Se încarcă echipamentele...</p>}
            </div>
          </div>
        ) : <p className="text-sm text-slate-500">Se incarca fișa...</p>}
      </Modal>

      {/* ─── MODAL ANGAJAT NOU ────────────────────────────── */}
      <Modal open={employeeModal} title="Angajat nou" onClose={() => setEmployeeModal(false)} size="lg">
        <form className="grid gap-3" onSubmit={createEmployee}>
          <Input label="CNP" value={employeeForm.cnp} onChange={event => setEmployeeForm({ ...employeeForm, cnp: event.target.value })} required />
          {infoCnp(employeeForm.cnp) ? (
            <div className="rounded-md bg-primary-50 px-3 py-2 text-sm text-primary-800">
              Sex: {infoCnp(employeeForm.cnp).sex} · Data nașterii: {infoCnp(employeeForm.cnp).data_nasterii} · Vârsta: {infoCnp(employeeForm.cnp).varsta}
            </div>
          ) : null}
          <div className="grid gap-4">
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="mb-3 text-xs font-semibold uppercase text-slate-500">📋 Date personale</div>
              <div className="grid gap-3 md:grid-cols-2">
                <Input label="Nume" value={employeeForm.nume} onChange={event => setEmployeeForm({ ...employeeForm, nume: event.target.value })} required />
                <Input label="Prenume" value={employeeForm.prenume} onChange={event => setEmployeeForm({ ...employeeForm, prenume: event.target.value })} required />
                <Input label="Email intern" type="email" value={employeeForm.email} onChange={event => setEmployeeForm({ ...employeeForm, email: event.target.value })} />
                <Input label="Telefon" value={employeeForm.telefon} onChange={event => setEmployeeForm({ ...employeeForm, telefon: event.target.value })} />
                <Input label="Adresă" value={employeeForm.adresa} onChange={event => setEmployeeForm({ ...employeeForm, adresa: event.target.value })} />
                <Select label="Stare civilă" value={employeeForm.stare_civila} onChange={event => setEmployeeForm({ ...employeeForm, stare_civila: event.target.value })} options={[
                  { value: '', label: 'Alege stare civilă' },
                  { value: 'necasatorit', label: 'Necăsătorit(ă)' },
                  { value: 'casatorit', label: 'Căsătorit(ă)' },
                  { value: 'divortat', label: 'Divorțat(ă)' },
                  { value: 'vaduv', label: 'Văduv(ă)' },
                ]} />
                <Input label="Copii în întreținere" type="number" value={employeeForm.nr_copii_intretinere} onChange={event => setEmployeeForm({ ...employeeForm, nr_copii_intretinere: Number(event.target.value) })} />
                <Input label="Casa de sănătate" value={employeeForm.casa_sanatate} onChange={event => setEmployeeForm({ ...employeeForm, casa_sanatate: event.target.value })} />
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <Select label="Tip act" value={employeeForm.act_identitate_tip} onChange={event => setEmployeeForm({ ...employeeForm, act_identitate_tip: event.target.value })} options={[
                  { value: 'CI', label: 'CI' },
                  { value: 'BI', label: 'BI' },
                  { value: 'pasaport', label: 'Pașaport' },
                  { value: 'permis_sedere', label: 'Permis ședere' },
                ]} />
                <Input label="Serie" maxLength={5} placeholder="NT" value={employeeForm.act_identitate_serie} onChange={event => setEmployeeForm({ ...employeeForm, act_identitate_serie: event.target.value.toUpperCase().slice(0, 5) })} />
                <Input label="Număr" maxLength={10} placeholder="123456" value={employeeForm.act_identitate_numar} onChange={event => setEmployeeForm({ ...employeeForm, act_identitate_numar: event.target.value.slice(0, 10) })} />
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Input label="Eliberat de" value={employeeForm.act_identitate_eliberat_de} onChange={event => setEmployeeForm({ ...employeeForm, act_identitate_eliberat_de: event.target.value })} />
                <Input label="Data eliberării" type="date" value={employeeForm.act_identitate_data_eliberare} onChange={event => setEmployeeForm({ ...employeeForm, act_identitate_data_eliberare: event.target.value })} />
              </div>
              <Input className="mt-3" label="Valabil până" type="date" value={employeeForm.act_identitate_valabil_pana} onChange={event => setEmployeeForm({ ...employeeForm, act_identitate_valabil_pana: event.target.value })} />
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="mb-3 text-xs font-semibold uppercase text-slate-500">💼 Date angajare</div>
              <div className="grid gap-3 md:grid-cols-2">
                <Input label="Nr. marcă" value={employeeForm.marca} onChange={event => setEmployeeForm({ ...employeeForm, marca: event.target.value })} required />
                <Input label="Funcția / Meseria" value={employeeForm.functia} onChange={event => setEmployeeForm({ ...employeeForm, functia: event.target.value })} />
                <Input label="Cod COR" value={employeeForm.functie_cor} onChange={event => setEmployeeForm({ ...employeeForm, functie_cor: event.target.value })} />
                <Select label="Nivel studii" value={employeeForm.nivel_studii} onChange={event => setEmployeeForm({ ...employeeForm, nivel_studii: event.target.value })} options={[
                  { value: '', label: 'Alege nivel' },
                  { value: 'primar', label: 'Primar' },
                  { value: 'gimnazial', label: 'Gimnazial' },
                  { value: 'liceal', label: 'Liceal' },
                  { value: 'postliceal', label: 'Postliceal' },
                  { value: 'superior', label: 'Superior' },
                ]} />
                <Select label="Departament" value={employeeForm.department_id} onChange={event => setEmployeeForm({ ...employeeForm, department_id: event.target.value })} options={[{ value: '', label: 'Alege departament' }, ...departments]} />
                <Select label="Tip contract" value={employeeForm.tip_contract} onChange={event => setEmployeeForm({ ...employeeForm, tip_contract: event.target.value })} options={[
                  { value: 'CIM_nedeterminat', label: 'CIM nedeterminat' },
                  { value: 'CIM_determinat', label: 'CIM determinat' },
                  { value: 'PFA', label: 'PFA' },
                  { value: 'colaborare', label: 'Colaborare' },
                ]} />
                <Input label="Data angajării" type="date" value={employeeForm.data_angajare} onChange={event => setEmployeeForm({ ...employeeForm, data_angajare: event.target.value })} />
                <Input label="Expiră contract" type="date" value={employeeForm.data_expirare_contract} onChange={event => setEmployeeForm({ ...employeeForm, data_expirare_contract: event.target.value })} />
                <Input label="Normă ore/zi" type="number" value={employeeForm.norma_ore_zi} onChange={event => setEmployeeForm({ ...employeeForm, norma_ore_zi: Number(event.target.value) })} />
                <Input label="Zile CO / an" type="number" value={employeeForm.zile_co_drept} onChange={event => setEmployeeForm({ ...employeeForm, zile_co_drept: Number(event.target.value) })} />
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">💰 Date financiare <Badge tone="warning" size="sm">Confidențial</Badge></div>
              <div className="grid gap-3 md:grid-cols-2">
                <Input label="IBAN" value={employeeForm.iban} onChange={event => setEmployeeForm({ ...employeeForm, iban: event.target.value })} />
                <Input label="Deducere personală" type="number" value={employeeForm.deducere_personala} onChange={event => setEmployeeForm({ ...employeeForm, deducere_personala: event.target.value })} />
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="mb-3 text-xs font-semibold uppercase text-slate-500">📄 Documente & Expirări</div>
              <div className="grid gap-3 md:grid-cols-2">
                <Input label="Categorii permis" value={employeeForm.permis_conducere_categorii} onChange={event => setEmployeeForm({ ...employeeForm, permis_conducere_categorii: event.target.value })} />
                <Input label="Permis expiră" type="date" value={employeeForm.permis_conducere_expira} onChange={event => setEmployeeForm({ ...employeeForm, permis_conducere_expira: event.target.value, data_expirare_permis: event.target.value })} />
                <Input label="Apt medical expiră" type="date" value={employeeForm.apt_medical_expira} onChange={event => setEmployeeForm({ ...employeeForm, apt_medical_expira: event.target.value, adeverinta_medicala: event.target.value })} />
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="mb-3 text-xs font-semibold uppercase text-slate-500">✅ GDPR</div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={employeeForm.acord_gdpr} onChange={event => setEmployeeForm({ ...employeeForm, acord_gdpr: event.target.checked, data_acord_gdpr: event.target.checked ? (employeeForm.data_acord_gdpr || new Date().toISOString().slice(0,10)) : '' })} />
                  Acord GDPR
                </label>
                <Input label="Data acord GDPR" type="date" value={employeeForm.data_acord_gdpr} onChange={event => setEmployeeForm({ ...employeeForm, data_acord_gdpr: event.target.value })} />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={employeeForm.activ} onChange={event => setEmployeeForm({ ...employeeForm, activ: event.target.checked })} /> Activ</label>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEmployeeModal(false)}>Renunță</Button>
            <Button type="submit">Salvează</Button>
          </div>
        </form>
      </Modal>

      {/* ─── MODAL TURĂ NOUĂ ─────────────────────────────── */}
      <Modal open={shiftModal} title="Tură nouă" onClose={() => setShiftModal(false)} size="md">
        <form className="grid gap-3" onSubmit={createShift}>
          <Input label="Nume tură" value={shiftForm.nume} onChange={e => setShiftForm({ ...shiftForm, nume: e.target.value })} required />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Ora start" type="time" value={shiftForm.ora_start} onChange={e => setShiftForm({ ...shiftForm, ora_start: e.target.value })} />
            <Input label="Ora sfârșit" type="time" value={shiftForm.ora_sfarsit} onChange={e => setShiftForm({ ...shiftForm, ora_sfarsit: e.target.value })} />
            <Input label="Ore normale" type="number" value={shiftForm.ore_normale} onChange={e => setShiftForm({ ...shiftForm, ore_normale: Number(e.target.value) })} />
            <Input label="Culoare" type="color" value={shiftForm.culoare} onChange={e => setShiftForm({ ...shiftForm, culoare: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setShiftModal(false)}>Renunță</Button>
            <Button type="submit">Salvează</Button>
          </div>
        </form>
      </Modal>

      {/* ─── MODAL COMPENSARE BANCĂ DE ORE ───────────────── */}
      <Modal open={compensateModal} title="Compensare bancă de ore" onClose={() => setCompensateModal(false)} size="md">
        <form className="grid gap-3" onSubmit={compensateOvertime}>
          <Select label="Tip compensare" value={compensateForm.tip} onChange={e => setCompensateForm({ ...compensateForm, tip: e.target.value })} options={[
            { value: 'timp_liber', label: 'Timp liber' },
            { value: 'plata', label: 'Plată' },
          ]} />
          <Input label="Ore de compensat" type="number" value={compensateForm.ore} onChange={e => setCompensateForm({ ...compensateForm, ore: e.target.value })} required />
          <Input label="Data" type="date" value={compensateForm.data} onChange={e => setCompensateForm({ ...compensateForm, data: e.target.value })} required />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCompensateModal(false)}>Renunță</Button>
            <Button type="submit">Confirmă</Button>
          </div>
        </form>
      </Modal>

      {/* ─── MODAL EVALUARE ───────────────────────────────── */}
      <Modal open={evalModal} title={evalEditing ? 'Editează evaluare' : 'Evaluare nouă'} onClose={() => { setEvalModal(false); setEvalEditing(null) }} size="lg">
        <form className="grid gap-3" onSubmit={saveEvaluation}>
          <Select
            label="Angajat"
            value={evalForm.employee_id}
            onChange={e => setEvalForm({ ...evalForm, employee_id: e.target.value })}
            options={[{ value: '', label: 'Alege angajat…' }, ...employees.map(emp => ({ value: String(emp.id), label: fullName(emp) }))]}
            required
          />
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              label="Data evaluare"
              type="date"
              value={evalForm.data_evaluare}
              onChange={e => setEvalForm({ ...evalForm, data_evaluare: e.target.value })}
              required
            />
            <Select
              label="Tip evaluare"
              value={evalForm.tip}
              onChange={e => setEvalForm({ ...evalForm, tip: e.target.value })}
              options={[
                { value: 'periodica', label: 'Periodică' },
                { value: 'proba', label: 'Perioadă probă' },
                { value: 'anuala', label: 'Anuală' },
                { value: 'speciala', label: 'Specială' },
              ]}
            />
            <Select
              label="Calificativ"
              value={evalForm.calificativ}
              onChange={e => setEvalForm({ ...evalForm, calificativ: e.target.value })}
              options={[
                { value: 'FB', label: 'Foarte Bine (FB)' },
                { value: 'B', label: 'Bine (B)' },
                { value: 'S', label: 'Satisfăcător (S)' },
                { value: 'NS', label: 'Nesatisfăcător (NS)' },
              ]}
            />
            <Input
              label="Punctaj (0-100)"
              type="number"
              min="0"
              max="100"
              value={evalForm.punctaj}
              onChange={e => setEvalForm({ ...evalForm, punctaj: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Observații</label>
            <textarea
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              rows={2}
              value={evalForm.observatii}
              onChange={e => setEvalForm({ ...evalForm, observatii: e.target.value })}
              placeholder="Observații generale…"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Obiective stabilite</label>
            <textarea
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              rows={2}
              value={evalForm.obiective}
              onChange={e => setEvalForm({ ...evalForm, obiective: e.target.value })}
              placeholder="Obiective pentru perioada următoare…"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Recomandări</label>
            <textarea
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              rows={2}
              value={evalForm.recomandari}
              onChange={e => setEvalForm({ ...evalForm, recomandari: e.target.value })}
              placeholder="Recomandări de îmbunătățire…"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => { setEvalModal(false); setEvalEditing(null) }}>Renunță</Button>
            <Button type="submit">{evalEditing ? 'Actualizează' : 'Salvează evaluare'}</Button>
          </div>
        </form>
      </Modal>

      {/* ─── MODAL IMPORT ─────────────────────────────────── */}
      <Modal open={importModal} title="Import angajați" onClose={() => setImportModal(false)} size="lg">
        <form className="grid gap-4" onSubmit={importEmployees}>
          <Button type="button" variant="secondary" onClick={downloadTemplate}>Descarcă Template.xlsx</Button>
          <Input label="Fișier CSV/Excel" type="file" accept=".xlsx,.xls,.csv" onChange={event => setImportFile(event.target.files?.[0] || null)} />
          {importFile ? <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">Pregătit pentru import: {importFile.name}</div> : null}
          {importResult ? (
            <div className="rounded-md bg-primary-50 p-3 text-sm text-primary-800">
              Importați: {importResult.importati || 0}. Erori: {(importResult.erori || []).length}
              {(importResult.erori || []).slice(0, 5).map(err => <div key={`${err.rand}-${err.motiv}`}>Rând {err.rand}: {err.motiv}</div>)}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setImportModal(false)}>Închide</Button>
            <Button type="submit" disabled={!importFile}>Importă angajați</Button>
          </div>
        </form>
      </Modal>

      <Modal open={nexusExportModal} title="Export Pontaj Nexus" onClose={() => setNexusExportModal(false)}>
        <form className="grid gap-4" onSubmit={exportNexusTimesheet}>
          <Input label="Luna" type="month" value={nexusExportForm.luna} onChange={event => setNexusExportForm({ ...nexusExportForm, luna: event.target.value })} required />
          <Select label="Departament" value={nexusExportForm.dept_id} onChange={event => setNexusExportForm({ ...nexusExportForm, dept_id: event.target.value })} disabled={!isHRPontaj && isSefPontaj} options={[{ value: '', label: 'Toate departamentele' }, ...departments]} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setNexusExportModal(false)}>Renunță</Button>
            <Button type="submit">📥 Exportă Nexus</Button>
          </div>
        </form>
      </Modal>

      <Modal open={catalogModal} title={catalogEditing ? 'Editează obiect catalog' : 'Adaugă obiect în catalog'} onClose={() => setCatalogModal(false)}>
        <form className="grid gap-3" onSubmit={saveCatalogItem}>
          <Input label="Denumire*" value={catalogForm.denumire} onChange={event => setCatalogForm({ ...catalogForm, denumire: event.target.value })} required />
          <Select label="Categorie*" value={catalogForm.categorie} onChange={event => setCatalogForm({ ...catalogForm, categorie: event.target.value })} options={[{ value: 'protectie', label: 'Echipamente protecție' }, { value: 'scule', label: 'Scule' }, { value: 'unelte', label: 'Unelte' }, { value: 'inventar', label: 'Inventar' }, { value: 'SSM', label: 'SSM' }, { value: 'altele', label: 'Altele' }]} />
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={catalogForm.are_marime} onChange={event => setCatalogForm({ ...catalogForm, are_marime: event.target.checked })} /> Are mărime?</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={catalogForm.are_serie} onChange={event => setCatalogForm({ ...catalogForm, are_serie: event.target.checked })} /> Are nr. serie?</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={catalogForm.are_expirare} onChange={event => setCatalogForm({ ...catalogForm, are_expirare: event.target.checked })} /> Are expirare?</label>
          </div>
          {catalogForm.are_marime ? <Input label="Mărimi disponibile (separate prin virgulă)" value={catalogForm.marimi} onChange={event => setCatalogForm({ ...catalogForm, marimi: event.target.value })} placeholder="S, M, L, XL" /> : null}
          {catalogForm.are_expirare ? <Input label="Durată (luni)" type="number" min="0" value={catalogForm.durata_luni} onChange={event => setCatalogForm({ ...catalogForm, durata_luni: event.target.value })} /> : null}
          <Input label="Valoare inventar" type="number" min="0" step="0.01" value={catalogForm.valoare_inventar} onChange={event => setCatalogForm({ ...catalogForm, valoare_inventar: event.target.value })} />
          <Input label="Cod articol (opțional)" value={catalogForm.cod_articol} onChange={event => setCatalogForm({ ...catalogForm, cod_articol: event.target.value })} />
          <Select label="Furnizor" value={catalogForm.furnizor_id || ''} onChange={event => setCatalogForm({ ...catalogForm, furnizor_id: event.target.value })} options={[{ value: '', label: '- selectează -' }, ...equipmentSuppliers.map(item => ({ value: item.id, label: item.denumire }))]} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={catalogForm.activ} onChange={event => setCatalogForm({ ...catalogForm, activ: event.target.checked })} /> Activ</label>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setCatalogModal(false)}>Anulează</Button><Button type="submit">💾 Salvează</Button></div>
        </form>
      </Modal>

      <Modal open={dotareModal} title="Înregistrează dotare echipament / inventar" onClose={() => setDotareModal(false)}>
        <form className="grid gap-3" onSubmit={saveDotare}>
          <Select label="Obiect" value={dotareForm.tip_id} onChange={event => { const tip_id = event.target.value; const tip = employeeEquipment?.marimi?.find(item => String(item.id) === String(tip_id)); setDotareForm({ ...dotareForm, tip_id, marime: tip?.marime || '', numar_serie: '', valoare_inventar: tip?.valoare_inventar || '' }) }} options={(employeeEquipment?.marimi || []).map(item => ({ value: item.id, label: `${item.denumire} (${item.categorie})` }))} />
          {employeeEquipment?.marimi?.find(item => String(item.id) === String(dotareForm.tip_id))?.are_marime ? <Input label="Mărime" value={dotareForm.marime} onChange={event => setDotareForm({ ...dotareForm, marime: event.target.value })} /> : null}
          {employeeEquipment?.marimi?.find(item => String(item.id) === String(dotareForm.tip_id))?.are_serie ? <Input label="Număr serie*" value={dotareForm.numar_serie} onChange={event => setDotareForm({ ...dotareForm, numar_serie: event.target.value })} required /> : null}
          <Input label="Valoare inventar (lei)" type="number" min="0" step="0.01" value={dotareForm.valoare_inventar} onChange={event => setDotareForm({ ...dotareForm, valoare_inventar: event.target.value })} />
          <Input label="Data dotării" type="date" value={dotareForm.data_dotare} onChange={event => setDotareForm({ ...dotareForm, data_dotare: event.target.value })} required />
          <Input label="Cantitate" type="number" min="1" step="1" value={dotareForm.cantitate} onChange={event => setDotareForm({ ...dotareForm, cantitate: Number(event.target.value) })} />
          <Input label="Observații" value={dotareForm.observatii} onChange={event => setDotareForm({ ...dotareForm, observatii: event.target.value })} />
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setDotareModal(false)}>Renunță</Button><Button type="submit">Salvează dotarea</Button></div>
        </form>
      </Modal>
    </div>
  )
}

