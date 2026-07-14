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
import HRAdvancedTimesheetPanel from './hr/HRAdvancedTimesheetPanel'
import HRDashboardPanel from './hr/HRDashboardPanel'
import HREmployeeModal from './hr/HREmployeeModal'
import HREvaluationModal from './hr/HREvaluationModal'
import HREmployeeProfileModal from './hr/HREmployeeProfileModal'
import HREmployeeProfileTabsRouter from './hr/HREmployeeProfileTabsRouter'
import HREquipmentCatalogModal from './hr/HREquipmentCatalogModal'
import HREquipmentDotareModal from './hr/HREquipmentDotareModal'
import HREquipmentPanel from './hr/HREquipmentPanel'
import HREmployeesPanel from './hr/HREmployeesPanel'
import HRDocumentTemplateModal from './hr/HRDocumentTemplateModal'
import HRDocumentTemplateTestModal from './hr/HRDocumentTemplateTestModal'
import HRInboxPanel from './hr/HRInboxPanel'
import HRImportEmployeesModal from './hr/HRImportEmployeesModal'
import HRLeaveRequestModal from './hr/HRLeaveRequestModal'
import HRMealTicketsPanel from './hr/HRMealTicketsPanel'
import HRMedicalPayrollModal from './hr/HRMedicalPayrollModal'
import HRNavigationTabs, { getVisibleHrTabs } from './hr/HRNavigationTabs'
import HRNexusExportModal from './hr/HRNexusExportModal'
import HROvertimeCompensationModal from './hr/HROvertimeCompensationModal'
import { HRFilters, HRPageHeader } from './hr/HRPageChrome'
import HRShiftModal from './hr/HRShiftModal'
import HRShiftsSchedulePanel from './hr/HRShiftsSchedulePanel'
import HRTimesheetEditModal from './hr/HRTimesheetEditModal'
import HRTimesheetPanel from './hr/HRTimesheetPanel'
import HRTrainingPanel from './hr/HRTrainingPanel'

const HR_TEMPLATE_VARIABLES = [
  'nr_cim',
  'data_generare',
  'company.denumire',
  'company.cui',
  'company.adresa',
  'company.reprezentant',
  'angajat.nume',
  'angajat.prenume',
  'angajat.cnp',
  'angajat.marca',
  'angajat.adresa',
  'angajat.department_name',
  'angajat.zile_co_drept',
  'contract.numar_contract',
  'contract.data_contract',
  'contract.data_start',
  'contract.tip',
  'contract.functia',
  'contract.norma_ore',
  'contract.salariu_baza',
  'amendment.numar_act',
  'amendment.data_act',
  'amendment.data_efect',
  'titlu',
  'modificare_html',
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

function MedicalRegisterCard({ month, register, onExport, onPayroll }) {
  const totals = register?.totals || {}
  const rows = register?.rows || []
  return <Card><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><div className="font-semibold">Registru concedii medicale · {month}</div><div className="text-xs text-slate-500">Calcul propus; baza zilnica se confirma din media ultimelor 6 luni.</div></div><Button size="sm" variant="secondary" onClick={onExport}>📊 Export Excel</Button></div><div className="mb-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">{[['Certificate', totals.certificates || 0], ['Zile calendaristice', totals.calendar_days || 0], ['Zile lucratoare', totals.workdays || 0], ['Angajator', totals.employer_days || 0], ['FNUASS', totals.fund_days || 0], ['Neindemnizate', totals.unpaid_days || 0]].map(([label, value]) => <div key={label} className="rounded border border-slate-200 p-2 text-sm"><div className="text-xs text-slate-500">{label}</div><strong>{value}</strong></div>)}</div><div className="overflow-auto"><table className="min-w-full text-sm"><thead><tr className="border-b text-left text-xs text-slate-500"><th className="p-2">Angajat</th><th className="p-2">Certificat</th><th className="p-2">Perioada</th><th className="p-2">Cod / %</th><th className="p-2">Zile</th><th className="p-2">Sume</th><th className="p-2">Stare</th><th className="p-2">Actiuni</th></tr></thead><tbody>{rows.map(row => <tr key={row.uuid} className="border-b border-slate-100"><td className="p-2">{row.nume} {row.prenume}</td><td className="p-2">{row.serie}/{row.numar}<div className="text-xs text-slate-400">{row.tip_certificat}</div></td><td className="p-2">{String(row.data_start).slice(0, 10)} — {String(row.data_sfarsit).slice(0, 10)}<div className="text-xs text-slate-400">episod {row.episode_days} zile</div></td><td className="p-2">{row.cod_indemnizatie} / {row.indemnity_percent}%</td><td className="p-2">{row.workdays} lucr.<div className="text-xs text-slate-400">A:{row.employer_days} · F:{row.fund_days} · N:{row.unpaid_days}</div></td><td className="p-2">{row.calculation_status === 'calculat' ? `${Number(row.total_amount).toFixed(2)} lei` : 'Baza lipsa'}<div className="text-xs text-slate-400">A:{Number(row.employer_amount).toFixed(2)} · F:{Number(row.fund_amount).toFixed(2)}</div></td><td className="p-2"><Badge tone={row.status_verificare === 'verificat' ? 'success' : 'warning'}>{row.status_verificare}</Badge>{row.payroll_synced_at ? <div className="mt-1 text-xs text-emerald-700">Trimis salarizare</div> : null}</td><td className="p-2">{row.status_verificare === 'verificat' && !row.payroll_synced_at ? <Button size="sm" onClick={() => onPayroll(row)}>Trimite salarizare</Button> : null}</td></tr>)}{!rows.length ? <tr><td colSpan="8" className="p-6 text-center text-slate-400">Nu exista certificate in luna selectata.</td></tr> : null}</tbody></table></div></Card>
}

export default function HRPage() {
  const { user } = useAuth()

  // Calculare tabs accesibile pe baza permisiunilor utilizatorului
  const hasPerm = (perm) =>
    ['superadmin', 'admin'].includes(user?.role) ||
    (Array.isArray(user?.permissions) && user.permissions.includes(perm))

  const tabs = getVisibleHrTabs(hasPerm)

  const [activeTab, setActiveTab] = useState(() => tabs[0] || 'Dashboard HR')
  const [employees, setEmployees] = useState([])
  const [configuredDepartments, setConfiguredDepartments] = useState([])
  const [linkableUsers, setLinkableUsers] = useState([])
  const [monthlySheet, setMonthlySheet] = useState([])
  const [leaves, setLeaves] = useState([])
  const [medicalRegister, setMedicalRegister] = useState({ rows: [], totals: {} })
  const [medicalPayrollItem, setMedicalPayrollItem] = useState(null)
  const [medicalDailyBase, setMedicalDailyBase] = useState('')
  const [leaveModal, setLeaveModal] = useState(false)
  const [leaveForm, setLeaveForm] = useState({ employee_id: '', tip: 'CO', data_start: '', data_sfarsit: '', motiv: '' })
  const [authorizations, setAuthorizations] = useState([])
  const [timesheetOverview, setTimesheetOverview] = useState([])
  const [stats, setStats] = useState(null)
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [employeeDetails, setEmployeeDetails] = useState(null)
  const [employeeProfileTab, setEmployeeProfileTab] = useState('date')
  const [employeeWorkflow, setEmployeeWorkflow] = useState(null)
  const [employeeWorkflowBusy, setEmployeeWorkflowBusy] = useState(false)
  const [employeeContracts, setEmployeeContracts] = useState([])
  const [employeeAmendments, setEmployeeAmendments] = useState([])
  const [hrDocumentTemplates, setHrDocumentTemplates] = useState([])
  const [templateEditing, setTemplateEditing] = useState(null)
  const [templateAdvancedMode, setTemplateAdvancedMode] = useState(false)
  const [templateWordUploading, setTemplateWordUploading] = useState('')
  const [templateTesting, setTemplateTesting] = useState(null)
  const [templateTestForm, setTemplateTestForm] = useState({ employee_id: '', contract_id: '', amendment_id: '' })
  const [templateTestResult, setTemplateTestResult] = useState(null)
  const [dossierChecklist, setDossierChecklist] = useState({ rows: [], summary: {} })
  const [dossierDashboard, setDossierDashboard] = useState({ rows: [], summary: {}, expirations_summary: {} })
  const [dossierDashboardFilter, setDossierDashboardFilter] = useState('probleme')
  const [dossierReminderResult, setDossierReminderResult] = useState(null)
  const [hrInbox, setHrInbox] = useState({ rows: [], summary: {} })
  const [hrInboxFilter, setHrInboxFilter] = useState('toate')
  const [guidedDossierUpload, setGuidedDossierUpload] = useState(null)
  const [guidedWorkflowStep, setGuidedWorkflowStep] = useState('')
  const [hrActivity, setHrActivity] = useState({ rows: [], summary: {} })
  const [hrActivityFilter, setHrActivityFilter] = useState({ category: '', employee_id: '', from: '', to: '' })
  const [hrManagementReport, setHrManagementReport] = useState(null)
  const [hrManagementPeriod, setHrManagementPeriod] = useState(() => {
    const now = new Date()
    return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) }
  })
  const [advancedExpirations, setAdvancedExpirations] = useState({ rows: [], summary: {} })
  const [expirationNoticeResult, setExpirationNoticeResult] = useState(null)
  const [hrNotificationResult, setHrNotificationResult] = useState(null)
  const [expirationNotifications, setExpirationNotifications] = useState({ notifications: [], summary: {} })
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
  const [timesheetEdit, setTimesheetEdit] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [photoFile, setPhotoFile] = useState(null)
  const [coBalance, setCoBalance] = useState(null)
  const [adeverintaTip, setAdeverintaTip] = useState('salariat')
  const [adeverintaData, setAdeverintaData] = useState(null)
  // Pontaj avansat
  const [raportLunar, setRaportLunar] = useState(null)
  const [raportEmployee, setRaportEmployee] = useState('')
  const [overtimeBank, setOvertimeBank] = useState(null)
  const [pendingOvertime, setPendingOvertime] = useState([])
  const [weeklyControls, setWeeklyControls] = useState([])
  const [compensateModal, setCompensateModal] = useState(false)
  const [compensateForm, setCompensateForm] = useState({ tip: 'timp_liber', ore: '', data: new Date().toISOString().slice(0, 10), spor_procent: 75 })
  // Ture & Program
  const [tures, setTures] = useState([])
  const [scheduleEmployees, setScheduleEmployees] = useState([])
  const [scheduleData, setScheduleData] = useState({})
  const [scheduleMonth, setScheduleMonth] = useState(currentMonth())
  const [scheduleDept, setScheduleDept] = useState('')
  const [shiftModal, setShiftModal] = useState(false)
  const [shiftEditing, setShiftEditing] = useState(null)
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
  const templateEditorRef = useRef()
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
      const [employeesRes, departmentsRes, sheetRes, leavesRes, authRes, statsRes, usersRes, templatesRes, checklistRes, dossierDashboardRes, inboxRes, activityRes, managementRes, expirationsRes, expirationNotificationsRes] = await Promise.all([
        api.get('/hr/employees'),
        api.get('/departments').catch(() => ({ data: { departments: [] } })),
        api.get('/hr/timesheets/monthly-sheet', { params: { luna: filters.luna, dept_id: (!isHRPontaj && isSefPontaj ? ownDepartmentKey : filters.dept_id) || undefined } }).catch(() => ({ data: [] })),
        api.get('/hr/leave-requests').catch(() => ({ data: [] })),
        api.get('/hr/authorizations').catch(() => ({ data: [] })),
        api.get('/hr/stats').catch(() => ({ data: {} })),
        api.get('/hr/linkable-users').catch(() => ({ data: [] })),
        api.get('/hr/document-templates').catch(() => ({ data: { templates: [] } })),
        api.get('/hr/dossier-checklist').catch(() => ({ data: { rows: [], summary: {} } })),
        api.get('/hr/dossier-dashboard').catch(() => ({ data: { rows: [], summary: {}, expirations_summary: {} } })),
        api.get('/hr/inbox').catch(() => ({ data: { rows: [], summary: {} } })),
        api.get('/hr/activity').catch(() => ({ data: { rows: [], summary: {} } })),
        api.get('/hr/management-report', { params: hrManagementPeriod }).catch(() => ({ data: null })),
        api.get('/hr/advanced-expirations').catch(() => ({ data: { rows: [], summary: {} } })),
        api.get('/hr/advanced-expirations/notifications').catch(() => ({ data: { notifications: [], summary: {} } })),
      ])
      setEmployees(arrayFrom(employeesRes.data, ['employees', 'items']))
      setConfiguredDepartments(arrayFrom(departmentsRes.data, ['departments', 'items']))
      setMonthlySheet(arrayFrom(sheetRes.data, ['rows', 'sheet', 'items']))
      setLeaves(arrayFrom(leavesRes.data, ['leave_requests', 'requests', 'items']))
      setAuthorizations(arrayFrom(authRes.data, ['authorizations', 'items']))
      setStats(statsRes.data || {})
      setLinkableUsers(arrayFrom(usersRes.data, ['users', 'items']))
      setHrDocumentTemplates(arrayFrom(templatesRes.data, ['templates', 'items']))
      setDossierChecklist({ rows: arrayFrom(checklistRes.data, ['rows', 'items']), summary: checklistRes.data?.summary || {} })
      setDossierDashboard({ rows: arrayFrom(dossierDashboardRes.data, ['rows', 'items']), summary: dossierDashboardRes.data?.summary || {}, expirations_summary: dossierDashboardRes.data?.expirations_summary || {} })
      setHrInbox({ rows: arrayFrom(inboxRes.data, ['rows', 'items']), summary: inboxRes.data?.summary || {} })
      setHrActivity({ rows: arrayFrom(activityRes.data, ['rows', 'items']), summary: activityRes.data?.summary || {} })
      setHrManagementReport(managementRes.data || null)
      setAdvancedExpirations({ rows: arrayFrom(expirationsRes.data, ['rows', 'items']), summary: expirationsRes.data?.summary || {} })
      setExpirationNotifications({ notifications: arrayFrom(expirationNotificationsRes.data, ['notifications', 'items']), summary: expirationNotificationsRes.data?.summary || {} })
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
    if (activeTab === 'Pontaj' || activeTab === 'Pontaj Avansat') loadTimesheetLock().catch(() => {})
  }, [activeTab, filters.luna])

  useEffect(() => {
    if (activeTab === 'Pontaj Avansat') loadWorkTimeControls().catch(() => {})
  }, [activeTab, filters.luna, filters.dept_id])

  useEffect(() => {
    if (activeTab === 'Training & Evaluări') loadTrainingData()
  }, [activeTab])

  useEffect(() => {
    if (activeTab === 'Concedii') loadMedicalRegister().catch(() => {})
  }, [activeTab, filters.luna])

  useEffect(() => {
    if (activeTab === 'Ture & Program') loadScheduleData()
  }, [activeTab, scheduleMonth, scheduleDept])

  useEffect(() => {
    if (activeTab === 'Tichete masă') loadMealTickets()
  }, [activeTab, mealMonth, mealDept])

  useEffect(() => {
    if (activeTab === '🦺 Echipamente') loadEquipmentData()
  }, [activeTab])

  useEffect(() => {
    if (activeTab === 'Inbox HR') {
      loadHrInbox()
      loadHrActivity()
    }
  }, [activeTab])

  async function openEmployee(employee) {
    setSelectedEmployee(employee)
    setEmployeeDetails(null)
    setEmployeeProfileTab('date')
    setEmployeeWorkflow(null)
    setCoBalance(null)
    setEditMode(false)
    setPhotoPreview(null)
    setPhotoFile(null)
    setEmployeeEquipment(null)
    setEmployeeContracts([])
    setEmployeeAmendments([])
    setGuidedDossierUpload(null)
    setGuidedWorkflowStep('')
    try {
      const [detailsRes, coRes, equipmentRes, transfersRes, contractsRes, amendmentsRes, workflowRes] = await Promise.all([
        api.get(`/hr/employees/${employee.id}`),
        api.get(`/hr/employees/${employee.id}/co-balance`).catch(() => ({ data: null })),
        api.get(`/hr/echipamente/angajat/${employee.id}`).catch(() => ({ data: null })),
        api.get(`/hr/employees/${employee.id}/transfers`).catch(() => ({ data: [] })),
        api.get(`/hr/employees/${employee.id}/contracts`).catch(() => ({ data: [] })),
        api.get(`/hr/employees/${employee.id}/contract-amendments`).catch(() => ({ data: [] })),
        api.get(`/hr/employees/${employee.id}/workflow`).catch(() => ({ data: { workflow: null } })),
      ])
      setEmployeeDetails(detailsRes.data)
      setEditForm({ ...detailsRes.data, department_transfer_date: new Date().toISOString().slice(0, 10), department_transfer_reason: '' })
      setCoBalance(coRes.data)
      setEmployeeEquipment(equipmentRes.data)
      setTransferHistory(arrayFrom(transfersRes.data, ['transfers', 'items']))
      setEmployeeContracts(arrayFrom(contractsRes.data, ['contracts', 'items']))
      setEmployeeAmendments(arrayFrom(amendmentsRes.data, ['amendments', 'items']))
      setEmployeeWorkflow(workflowRes.data?.workflow || null)
    } catch {
      setEmployeeDetails(employee)
      setEditForm({ ...employee })
    }
  }

  async function loadDossierChecklist() {
    try {
      const response = await api.get('/hr/dossier-checklist')
      setDossierChecklist({ rows: arrayFrom(response.data, ['rows', 'items']), summary: response.data?.summary || {} })
    } catch {
      setError('Checklistul dosarului personal nu a putut fi încărcat.')
    }
  }

  async function loadDossierDashboard() {
    try {
      const response = await api.get('/hr/dossier-dashboard')
      setDossierDashboard({ rows: arrayFrom(response.data, ['rows', 'items']), summary: response.data?.summary || {}, expirations_summary: response.data?.expirations_summary || {} })
    } catch {
      setError('Dashboard-ul dosarului HR nu a putut fi încărcat.')
    }
  }

  async function loadHrInbox() {
    try {
      const response = await api.get('/hr/inbox')
      setHrInbox({ rows: arrayFrom(response.data, ['rows', 'items']), summary: response.data?.summary || {} })
    } catch {
      setError('Inbox-ul HR nu a putut fi încărcat.')
    }
  }

  async function loadHrActivity(extra = {}) {
    try {
      const params = { ...hrActivityFilter, ...extra }
      Object.keys(params).forEach(key => { if (!params[key]) delete params[key] })
      const response = await api.get('/hr/activity', { params })
      setHrActivity({ rows: arrayFrom(response.data, ['rows', 'items']), summary: response.data?.summary || {} })
    } catch {
      setError('Jurnalul operațional HR nu a putut fi încărcat.')
    }
  }

  async function downloadHrActivity() {
    try {
      const params = { ...hrActivityFilter }
      Object.keys(params).forEach(key => { if (!params[key]) delete params[key] })
      const response = await api.get('/hr/activity.xlsx', { params, responseType: 'blob' })
      const url = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = `Jurnal_operational_HR_${new Date().toISOString().slice(0, 10)}.xlsx`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.response?.data?.error || 'Exportul jurnalului HR nu a putut fi descărcat.')
    }
  }

  async function loadHrManagementReport() {
    try {
      const response = await api.get('/hr/management-report', { params: hrManagementPeriod })
      setHrManagementReport(response.data || null)
    } catch (err) {
      setError(err.response?.data?.error || 'Raportul de management HR nu a putut fi încărcat.')
    }
  }

  async function downloadHrManagementReport() {
    try {
      const response = await api.get('/hr/management-report.xlsx', { params: hrManagementPeriod, responseType: 'blob' })
      const url = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = `Raport_management_HR_${hrManagementPeriod.from}_${hrManagementPeriod.to}.xlsx`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.response?.data?.error || 'Exportul raportului de management HR nu a putut fi descărcat.')
    }
  }

  async function sendDossierReminder(employeeId) {
    try {
      const response = await api.post(`/hr/dossier-dashboard/${employeeId}/reminder`)
      setDossierReminderResult(response.data || {})
      if (response.data?.dashboard) {
        setDossierDashboard({ rows: arrayFrom(response.data.dashboard, ['rows', 'items']), summary: response.data.dashboard.summary || {}, expirations_summary: response.data.dashboard.expirations_summary || {} })
      } else {
        await loadDossierDashboard()
      }
      await loadHrInbox()
      await loadHrActivity()
    } catch (err) {
      setError(err.response?.data?.error || 'Reminderul Kiosk nu a putut fi trimis.')
    }
  }

  async function loadEmployeeWorkflow(employeeId = employeeDetails?.id) {
    if (!employeeId) return
    try {
      const response = await api.get(`/hr/employees/${employeeId}/workflow`)
      setEmployeeWorkflow(response.data?.workflow || null)
    } catch {
      setError('Fluxul HR al angajatului nu a putut fi încărcat.')
    }
  }

  async function startEmployeeWorkflow(type) {
    if (!employeeDetails?.id) return
    try {
      setEmployeeWorkflowBusy(true)
      const response = await api.post(`/hr/employees/${employeeDetails.id}/workflow/start`, { type })
      setEmployeeWorkflow(response.data?.workflow || null)
      setEmployeeProfileTab('flux')
    } catch (err) {
      setError(err.response?.data?.error || 'Fluxul HR nu a putut fi pornit.')
    } finally {
      setEmployeeWorkflowBusy(false)
    }
  }

  async function toggleEmployeeWorkflowStep(step, done) {
    if (!employeeDetails?.id || !employeeWorkflow?.uuid) return
    try {
      const response = await api.patch(`/hr/employees/${employeeDetails.id}/workflow/steps/${step.key}`, { done })
      setEmployeeWorkflow(response.data?.workflow || null)
      if (done && guidedWorkflowStep === step.key) {
        setGuidedWorkflowStep('')
        loadHrInbox()
        loadHrActivity()
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Pasul din flux nu a putut fi actualizat.')
    }
  }

  async function closeEmployeeWorkflow(cancel = false) {
    if (!employeeDetails?.id || !employeeWorkflow?.uuid) return
    const note = cancel ? window.prompt('Motiv anulare flux:', 'Anulat de HR') : ''
    if (cancel && !note) return
    try {
      const response = await api.post(`/hr/employees/${employeeDetails.id}/workflow/close`, { cancel, note })
      setEmployeeWorkflow(response.data?.workflow || null)
    } catch (err) {
      setError(err.response?.data?.error || 'Fluxul HR nu a putut fi închis.')
    }
  }

  function openEquipmentAction() {
    setEmployeeProfileTab('echipamente')
    if (!canManageEquipment || !employeeDetails?.id) return
    const first = employeeEquipment?.marimi?.[0]
    setDotareForm({
      angajat_id: employeeDetails.id,
      tip_id: first?.id || '',
      marime: first?.marime || '',
      numar_serie: '',
      valoare_inventar: first?.valoare_inventar || '',
      data_dotare: new Date().toISOString().slice(0, 10),
      cantitate: 1,
      stare: 'nou',
      observatii: ''
    })
    setDotareModal(true)
  }

  async function generateWorkflowHrDocument(kind) {
    if (!employeeDetails?.id) return
    try {
      const response = await api.get(`/hr/employees/${employeeDetails.id}/adeverinta`, { params: { tip: kind === 'vechime' ? 'vechime' : 'salariat' } })
      if (kind === 'fisa_post') printFisaPost(response.data)
      else if (kind === 'gdpr') printNotaGDPR(response.data)
      else if (kind === 'nota_lichidare') {
        const equipment = await api.get(`/hr/echipamente/angajat/${employeeDetails.id}`).catch(() => ({ data: {} }))
        printNotaLichidare({ ...response.data, inventar: equipment.data?.inventar || {} })
      } else if (kind === 'vechime') {
        printAdeverinta(response.data)
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Documentul HR nu a putut fi generat.')
    }
  }

  function workflowStepActions(step) {
    const firstContract = employeeContracts[0]
    const actions = {
      date_personale: [{ label: 'Editează date', run: () => { setEmployeeProfileTab('date'); setEditMode(true) } }],
      cont_kiosk: [{ label: 'Asociază cont', run: () => { setEmployeeProfileTab('date'); setEditMode(true) } }],
      contract: [
        { label: 'Contracte', run: () => setEmployeeProfileTab('contracte') },
        ...(firstContract ? [
          { label: 'Generează Word', run: () => generateContractWord(firstContract) },
          { label: 'Arhivează Word', run: () => archiveContractWord(firstContract) },
        ] : []),
      ],
      act_identitate: [{ label: 'Încarcă document', run: () => setEmployeeProfileTab('dosar') }],
      fisa_post: [{ label: 'Generează fișa', run: () => generateWorkflowHrDocument('fisa_post') }, { label: 'Dosar', run: () => setEmployeeProfileTab('dosar') }],
      ssm_psi: [{ label: 'Încarcă SSM/PSI', run: () => setEmployeeProfileTab('dosar') }],
      apt_medical: [{ label: 'Încarcă apt medical', run: () => setEmployeeProfileTab('dosar') }, { label: 'Setează expirare', run: () => { setEmployeeProfileTab('date'); setEditMode(true) } }],
      gdpr: [{ label: 'Generează GDPR', run: () => generateWorkflowHrDocument('gdpr') }, { label: 'Marchează acord', run: () => { setEmployeeProfileTab('date'); setEditMode(true) } }],
      echipamente: [{ label: 'Înregistrează dotare', run: openEquipmentAction }],
      confirmari_kiosk: [{ label: 'Reminder Kiosk', run: () => sendDossierReminder(employeeDetails.id) }],
      decizie_incetare: [{ label: 'Contracte/acte', run: () => setEmployeeProfileTab('contracte') }, { label: 'Dosar', run: () => setEmployeeProfileTab('dosar') }],
      nota_lichidare: [{ label: 'Generează nota', run: () => generateWorkflowHrDocument('nota_lichidare') }],
      predare_echipamente: [{ label: 'Predare echipamente', run: () => setEmployeeProfileTab('echipamente') }],
      co_final: [{ label: 'Verifică CO', run: () => setEmployeeProfileTab('pontaj') }],
      cont_kiosk_dezactivat: [{ label: 'Cont asociat', run: () => { setEmployeeProfileTab('date'); setEditMode(true) } }],
      documente_finale: [{ label: 'Adeverință vechime', run: () => generateWorkflowHrDocument('vechime') }, { label: 'Dosar', run: () => setEmployeeProfileTab('dosar') }],
      dosar_inchis: [{ label: 'Print fișă', run: printEmployeeProfile }, { label: 'Dosar', run: () => setEmployeeProfileTab('dosar') }],
    }
    return actions[step.key] || []
  }

  async function downloadDossierReport() {
    try {
      const response = await api.get('/hr/dossier-report.xlsx', { responseType: 'blob' })
      const url = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = `Raport_dosar_HR_${new Date().toISOString().slice(0, 10)}.xlsx`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.response?.data?.error || 'Raportul dosarului HR nu a putut fi descărcat.')
    }
  }

  async function loadAdvancedExpirations() {
    try {
      const response = await api.get('/hr/advanced-expirations')
      setAdvancedExpirations({ rows: arrayFrom(response.data, ['rows', 'items']), summary: response.data?.summary || {} })
    } catch {
      setError('Scadențarul HR avansat nu a putut fi încărcat.')
    }
  }

  async function loadExpirationNotifications() {
    try {
      const response = await api.get('/hr/advanced-expirations/notifications')
      setExpirationNotifications({ notifications: arrayFrom(response.data, ['notifications', 'items']), summary: response.data?.summary || {} })
    } catch {
      setExpirationNotifications({ notifications: [], summary: {} })
    }
  }

  async function notifyAdvancedExpirations() {
    try {
      const response = await api.post('/hr/advanced-expirations/notify')
      setExpirationNoticeResult(response.data || {})
      await loadAdvancedExpirations()
      await loadExpirationNotifications()
    } catch (err) {
      setError(err.response?.data?.error || 'Notificările pentru scadențe HR nu au putut fi generate.')
    }
  }

  async function generateHrNotifications() {
    try {
      const response = await api.post('/hr/notifications/generate')
      setHrNotificationResult(response.data || {})
      await loadHrInbox()
      await loadExpirationNotifications()
      await loadHrActivity()
    } catch (err) {
      setError(err.response?.data?.error || 'Notificările automate HR nu au putut fi generate.')
    }
  }

  async function resolveExpirationNotification(id) {
    try {
      await api.post(`/hr/advanced-expirations/notifications/${id}/resolve`)
      await loadExpirationNotifications()
    } catch (err) {
      setError(err.response?.data?.error || 'Notificarea HR nu a putut fi marcată ca rezolvată.')
    }
  }

  async function openExpirationEmployee(item) {
    const employee = employees.find(emp => String(emp.id) === String(item.employee_id))
    if (employee) await openEmployee(employee)
    else setError('Angajatul asociat scadenței nu a fost găsit în lista curentă.')
  }

  async function openHrInboxTask(item) {
    if (item.action === 'open_leave') {
      setActiveTab('Concedii')
      return
    }
    if (item.action === 'send_kiosk_reminder' && item.employee_id) {
      await sendDossierReminder(item.employee_id)
      return
    }
    const employee = employees.find(emp => String(emp.id) === String(item.employee_id))
    if (!employee) {
      setError('Angajatul asociat sarcinii nu a fost găsit în lista curentă.')
      return
    }
    await openEmployee(employee)
    if (item.action === 'open_workflow') {
      setEmployeeProfileTab('flux')
      setGuidedWorkflowStep(item.next_step_key || '')
    } else if (item.action === 'open_dossier' || item.action === 'guided_upload') {
      setEmployeeProfileTab('dosar')
      setGuidedDossierUpload({
        type: item.suggested_type || 'altul',
        title: item.title,
        detail: item.detail,
        task_id: item.id
      })
    }
    else if (item.action === 'open_expiration') setEmployeeProfileTab('kiosk')
    else setEmployeeProfileTab('date')
  }

  async function loadHrDocumentTemplates() {
    try {
      const response = await api.get('/hr/document-templates')
      setHrDocumentTemplates(arrayFrom(response.data, ['templates', 'items']))
    } catch {
      setError('Șabloanele HR nu au putut fi încărcate.')
    }
  }

  async function saveHrDocumentTemplate(event) {
    event.preventDefault()
    try {
      const visualHtml = templateAdvancedMode ? templateEditing.template_html : (templateEditorRef.current?.innerHTML || templateEditing.template_html)
      const payload = { ...templateEditing, template_html: visualHtml, activ: true }
      const response = await api.put(`/hr/document-templates/${payload.id}`, payload)
      const saved = response.data?.template || payload
      setHrDocumentTemplates(current => {
        const others = current.filter(item => item.id !== saved.id)
        return [...others, saved].sort((a, b) => String(a.denumire || '').localeCompare(String(b.denumire || '')))
      })
      setTemplateEditing(null)
    } catch (err) {
      setError(err.response?.data?.error || 'Șablonul HR nu a putut fi salvat.')
    }
  }

  function syncTemplateVisualEditor() {
    const html = templateEditorRef.current?.innerHTML
    if (html !== undefined) setTemplateEditing(current => ({ ...current, template_html: html }))
  }

  function applyTemplateCommand(command, value = null) {
    templateEditorRef.current?.focus()
    document.execCommand(command, false, value)
    syncTemplateVisualEditor()
  }

  function insertTemplateSnippet(snippet) {
    templateEditorRef.current?.focus()
    document.execCommand('insertHTML', false, snippet)
    syncTemplateVisualEditor()
  }

  function startTemplateEditing(template) {
    setTemplateAdvancedMode(false)
    setTemplateEditing({ ...template })
  }

  function chooseTemplateWordFile(template) {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    input.onchange = event => {
      const file = event.target.files?.[0]
      if (file) uploadTemplateWordFile(template, file)
    }
    input.click()
  }

  async function uploadTemplateWordFile(template, file) {
    try {
      setTemplateWordUploading(template.id)
      const form = new FormData()
      form.append('file', file)
      const response = await api.post(`/hr/document-templates/${template.id}/word-template`, form)
      const saved = response.data?.template
      if (saved) {
        setHrDocumentTemplates(current => current.map(item => item.id === saved.id ? saved : item))
        if (templateEditing?.id === saved.id) setTemplateEditing(current => ({ ...current, ...saved }))
      } else {
        await loadHrDocumentTemplates()
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Șablonul Word nu a putut fi încărcat.')
    } finally {
      setTemplateWordUploading('')
    }
  }

  async function downloadTemplateWordFile(template) {
    try {
      const response = await api.get(`/hr/document-templates/${template.id}/word-template`, { responseType: 'blob' })
      const url = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = template.word_template_original_name || `${template.id}.docx`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.response?.data?.error || 'Șablonul Word nu a putut fi descărcat.')
    }
  }

  function openTemplateWordTest(template) {
    const firstEmployee = employees[0]
    const employeeContracts = firstEmployee ? employeeContractsFor(firstEmployee.id) : []
    setTemplateTesting(template)
    setTemplateTestForm({
      employee_id: firstEmployee?.id || '',
      contract_id: employeeContracts[0]?.id || '',
      amendment_id: ''
    })
    setTemplateTestResult(null)
  }

  function employeeContractsFor(employeeId) {
    return (employees.find(emp => String(emp.id) === String(employeeId))?.contracte_active || [])
      .concat(employeeContracts.filter(contract => String(contract.employee_id) === String(employeeId)))
      .filter((item, index, arr) => arr.findIndex(other => String(other.id) === String(item.id)) === index)
  }

  function employeeAmendmentsFor(contractId) {
    return employeeAmendments.filter(item => String(item.contract_id) === String(contractId))
  }

  async function runTemplateWordTest(event) {
    event.preventDefault()
    if (!templateTesting) return
    try {
      const response = await api.get(`/hr/document-templates/${templateTesting.id}/validate-word`, { params: templateTestForm })
      setTemplateTestResult(response.data)
    } catch (err) {
      setTemplateTestResult(null)
      setError(err.response?.data?.error || 'Șablonul Word nu a putut fi testat.')
    }
  }

  async function reloadEmployeeContracts(employeeId = employeeDetails?.id || selectedEmployee?.id) {
    if (!employeeId) return
    const response = await api.get(`/hr/employees/${employeeId}/contracts`)
    setEmployeeContracts(arrayFrom(response.data, ['contracts', 'items']))
    const amendments = await api.get(`/hr/employees/${employeeId}/contract-amendments`).catch(() => ({ data: [] }))
    setEmployeeAmendments(arrayFrom(amendments.data, ['amendments', 'items']))
    const details = await api.get(`/hr/employees/${employeeId}`).catch(() => null)
    if (details?.data) setEmployeeDetails(details.data)
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

  async function loadWorkTimeControls() {
    const params = { luna: filters.luna, dept_id: filters.dept_id || undefined }
    const [pendingRes, weeklyRes] = await Promise.all([
      api.get('/hr/overtime/pending', { params }).catch(() => ({ data: [] })),
      api.get('/hr/timesheets/weekly-controls', { params }).catch(() => ({ data: [] })),
    ])
    setPendingOvertime(arrayFrom(pendingRes.data, ['items']))
    setWeeklyControls(arrayFrom(weeklyRes.data, ['items']))
  }

  async function decideOvertime(item, status) {
    const reason = status === 'reject' ? window.prompt('Motivul respingerii (minimum 5 caractere):') : ''
    if (status === 'reject' && (!reason || reason.trim().length < 5)) return
    try {
      await api.post(`/hr/overtime/${item.id}/${status}`, { reason })
      await loadWorkTimeControls()
      if (raportEmployee) await loadRaportLunar(raportEmployee, filters.luna)
    } catch (err) { setError(err.response?.data?.error || 'Decizia nu a putut fi salvata.') }
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
      if (shiftEditing) await api.put(`/hr/tures/${shiftEditing.id}`, shiftForm)
      else await api.post('/hr/tures', shiftForm)
      setShiftModal(false)
      setShiftEditing(null)
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

  function editShift(tura) {
    setShiftEditing(tura)
    setShiftForm({ nume: tura.nume, ora_start: tura.ora_start, ora_sfarsit: tura.ora_sfarsit, ore_normale: tura.ore_normale || 8, culoare: tura.culoare || '#3B82F6' })
    setShiftModal(true)
  }

  async function deactivateShift(tura) {
    if (!window.confirm(`Dezactivezi tura ${tura.nume}? Programarile istorice raman pastrate.`)) return
    try { await api.delete(`/hr/tures/${tura.id}`); await loadScheduleData() }
    catch (err) { setError(err.response?.data?.error || 'Tura nu a putut fi dezactivata.') }
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
      const adjustment = ['sold_initial', 'avans_timp_liber'].includes(compensateForm.tip)
      await api.post(adjustment ? '/hr/overtime-bank/adjustment' : '/hr/overtime-bank/compensate', { ...compensateForm, employee_id: raportEmployee })
      setCompensateModal(false)
      setCompensateForm({ tip: 'timp_liber', ore: '', data: new Date().toISOString().slice(0, 10), spor_procent: 75 })
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

  function printEmployeeProfile() {
    if (!employeeDetails) return
    const dossier = selectedDossierSummary || {}
    const expirations = selectedEmployeeExpirations || []
    const leaveRows = selectedEmployeeLeaves || []
    const contractRows = employeeContracts || []
    const html = `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>Fișă angajat</title>
<style>body{font-family:Arial,sans-serif;font-size:10pt;margin:1.5cm;color:#111}h1{text-align:center;font-size:16pt;margin:0 0 12px}h2{font-size:12pt;margin:16px 0 6px;border-bottom:1px solid #999;padding-bottom:3px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 16px}.box{border:1px solid #ccc;padding:8px;margin:8px 0}table{width:100%;border-collapse:collapse;margin:8px 0}td,th{border:1px solid #ccc;padding:5px;text-align:left}th{background:#f3f4f6}.muted{color:#666}.warn{color:#b45309}.bad{color:#b91c1c}.ok{color:#047857}@media print{body{margin:1.2cm}}</style></head><body>
<h1>Fișă angajat HR</h1>
<div class="box grid">
  <div><strong>Nume:</strong> ${fullName(employeeDetails)}</div>
  <div><strong>Marcă:</strong> ${employeeDetails.marca || '-'}</div>
  <div><strong>Funcție:</strong> ${employeeDetails.functia || '-'}</div>
  <div><strong>Departament:</strong> ${employeeDetails.department_name || '-'}</div>
  <div><strong>Data angajării:</strong> ${employeeDetails.data_angajare || '-'}</div>
  <div><strong>Normă:</strong> ${employeeDetails.norma_ore_zi || 8} ore/zi</div>
</div>
<h2>Sumar conformitate</h2>
<table><tbody>
<tr><th>Dosar HR</th><td>${dossier.percent ?? 0}% · ${dossier.required_done ?? 0}/${dossier.required_total ?? 0} obligatorii</td></tr>
<tr><th>Lipsuri obligatorii</th><td>${dossier.missing_required?.length ? dossier.missing_required.join(', ') : '<span class="ok">Nu există</span>'}</td></tr>
<tr><th>Confirmări Kiosk lipsă</th><td>${dossier.pending_ack ?? 0}</td></tr>
<tr><th>CO rămas</th><td>${coBalance ? `${coBalance.zile_ramase} zile din ${coBalance.zile_drept}` : '-'}</td></tr>
</tbody></table>
<h2>Date personale</h2>
<div class="grid">
  <div>CNP: ${employeeDetails.cnp || '-'}</div><div>Telefon: ${employeeDetails.telefon || '-'}</div>
  <div>Email: ${employeeDetails.email || '-'}</div><div>Adresă: ${employeeDetails.adresa || '-'}</div>
  <div>Act identitate: ${identityText(employeeDetails)}</div><div>Valabil act: ${employeeDetails.act_identitate_valabil_pana || '-'}</div>
</div>
<h2>Contracte</h2>
<table><thead><tr><th>Tip</th><th>Număr</th><th>Dată</th><th>Start</th><th>Status</th><th>Salariu</th></tr></thead><tbody>
${contractRows.length ? contractRows.map(item => `<tr><td>${item.tip || '-'}</td><td>${item.numar_contract || '-'}</td><td>${item.data_contract || '-'}</td><td>${item.data_start || '-'}</td><td>${item.status || '-'}</td><td>${item.salariu_baza || '-'}</td></tr>`).join('') : '<tr><td colspan="6" class="muted">Nu există contracte înregistrate.</td></tr>'}
</tbody></table>
<h2>Concedii recente</h2>
<table><thead><tr><th>Tip</th><th>Start</th><th>Sfârșit</th><th>Zile</th><th>Status</th></tr></thead><tbody>
${leaveRows.length ? leaveRows.slice(0, 12).map(item => `<tr><td>${item.tip || '-'}</td><td>${item.data_start || '-'}</td><td>${item.data_sfarsit || '-'}</td><td>${item.zile || '-'}</td><td>${item.status || '-'}</td></tr>`).join('') : '<tr><td colspan="5" class="muted">Nu există cereri de concediu.</td></tr>'}
</tbody></table>
<h2>Scadențe apropiate</h2>
<table><thead><tr><th>Document</th><th>Data</th><th>Zile</th><th>Sursa</th></tr></thead><tbody>
${expirations.length ? expirations.map(item => `<tr><td>${item.label}</td><td>${item.date}</td><td class="${item.days < 0 ? 'bad' : item.days <= 30 ? 'warn' : ''}">${item.days < 0 ? `expirat de ${Math.abs(item.days)} zile` : `${item.days} zile`}</td><td>${item.source || '-'}</td></tr>`).join('') : '<tr><td colspan="4" class="ok">Nu există scadențe în următoarele 90 zile.</td></tr>'}
</tbody></table>
</body></html>`
    printGeneratedHtml(html, { data_generare: new Date().toISOString().slice(0, 10), numar: employeeDetails.marca || employeeDetails.id })
  }

  function getHrTemplate(id) {
    return hrDocumentTemplates.find(item => item.id === id && item.activ !== false)
  }

  function valueAtPath(source, path) {
    return String(path || '').split('.').reduce((current, key) => current?.[key], source)
  }

  function renderHrTemplate(templateId, data = {}, fallbackBody = '') {
    const template = getHrTemplate(templateId)
    const body = template?.template_html || fallbackBody
    if (!body) return ''
    const rendered = String(body).replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
      const value = valueAtPath(data, key)
      if (value === undefined || value === null || value === '') return '—'
      return String(value)
    })
    return `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>${template?.denumire || data.titlu || 'Document HR'}</title>
<style>
  body{font-family:Times New Roman,serif;font-size:11pt;margin:2cm;color:#000}
  h1,h2{text-align:center;font-size:14pt;margin:8px 0}
  h3{font-size:12pt;margin:12px 0 4px}
  p,li{margin:4px 0;line-height:1.7}
  table{width:100%;border-collapse:collapse;margin:8px 0}
  td,th{border:1px solid #555;padding:4px 8px;font-size:10pt}
  @media print{body{margin:1.5cm 2cm}}
</style></head><body>${rendered}</body></html>`
  }

  function printCIM(data) {
    if (!data) return
    const emp = data.angajat || {}
    const co = data.company || {}
    const contract = data.contract || {}
    const template = getHrTemplate('cim')
    if (template?.template_html) {
      const htmlFromTemplate = renderHrTemplate('cim', {
        ...data,
        angajat: emp,
        company: co,
        contract: {
          ...contract,
          functia: contract.functia || emp.functia || '',
          data_start: String(contract.data_start || contract.data_incepere || emp.data_angajare || '').slice(0, 10),
          data_contract: String(contract.data_contract || data.data_generare || '').slice(0, 10),
          tip: contract.tip || 'CIM',
          norma_ore: contract.norma_ore || emp.norma_ore || 8,
          salariu_baza: contract.salariu_baza || emp.salariu_baza || ''
        }
      })
      printGeneratedHtml(htmlFromTemplate, data)
      return htmlFromTemplate
    }
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
<p>Tip contract: <span class="bold">${contract.tip || emp.tip_contract || '—'}</span></p>
<p>Data începerii activității: <span class="bold">${String(contract.data_start || emp.data_angajare || '').slice(0, 10) || '—'}</span></p>
${contract.data_sfarsit || emp.data_expirare_contract ? `<p>Data încetării (determinat): <span class="bold">${String(contract.data_sfarsit || emp.data_expirare_contract).slice(0, 10)}</span></p>` : ''}
<h3>V. LOCUL DE MUNCĂ</h3>
<p>Loc de muncă: sediu angajator / teren — conform specificului activității.</p>
<h3>VI. DURATA MUNCII</h3>
<p>Program de lucru: <span class="bold">${contract.norma_ore || emp.norma_ore_zi || 8} ore/zi</span></p>
<h3>VII. SALARIUL</h3>
<p>Salariu de bază brut lunar: <span class="bold">${contract.salariu_baza || emp.salariu_baza ? Number(contract.salariu_baza || emp.salariu_baza).toLocaleString('ro-RO') + ' RON' : '_____ RON'}</span></p>
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
    return html
  }

  async function printOperationalContract(contract) {
    try {
      const response = await api.get(`/hr/employees/${employeeDetails.id}/cim`)
      const data = { ...response.data, contract, nr_cim: contract.numar_contract || response.data?.nr_cim, data_generare: new Date().toISOString().slice(0, 10) }
      const html = printCIM(data)
      await archiveGeneratedHtml({
        html,
        tip: 'contract',
        denumire: `CIM ${contract.numar_contract || employeeDetails.marca || employeeDetails.id}`,
        data_document: String(contract.data_contract || data.data_generare).slice(0, 10),
        source: `contract:${contract.id || ''}`
      })
    } catch (err) {
      setError(err.response?.data?.error || 'Contractul nu a putut fi generat.')
    }
  }

  async function generateContractWord(contract) {
    try {
      await downloadRenderedHrWord('cim', {
        employee_id: employeeDetails.id,
        contract_id: contract.id
      }, `CIM_${contract.numar_contract || employeeDetails.marca || employeeDetails.id}.docx`)
    } catch (err) {
      setError(err.response?.data?.error || 'Documentul Word pentru contract nu a putut fi generat.')
    }
  }

  async function generateAmendmentWord(amendment, contract) {
    try {
      await downloadRenderedHrWord('act_aditional', {
        employee_id: employeeDetails.id,
        contract_id: contract?.id || amendment.contract_id,
        amendment_id: amendment.id
      }, `Act_aditional_${amendment.numar_act || amendment.id || employeeDetails.marca}.docx`)
    } catch (err) {
      setError(err.response?.data?.error || 'Documentul Word pentru actul adițional nu a putut fi generat.')
    }
  }

  async function archiveContractWord(contract) {
    try {
      await api.post('/hr/document-templates/cim/render-word/archive', {
        employee_id: employeeDetails.id,
        contract_id: contract.id,
        tip: 'contract',
        denumire: `CIM ${contract.numar_contract || employeeDetails.marca || employeeDetails.id}`,
        data_document: String(contract.data_contract || new Date().toISOString()).slice(0, 10),
        source: `word-contract:${contract.id || ''}`,
        requires_ack: true,
        kiosk_visible: true
      })
      await openEmployee(employeeDetails)
    } catch (err) {
      setError(err.response?.data?.error || 'Documentul Word nu a putut fi arhivat în dosar.')
    }
  }

  async function archiveAmendmentWord(amendment, contract) {
    try {
      const title = amendment.tip === 'incetare' ? 'Decizie încetare' : amendment.tip === 'suspendare' ? 'Act suspendare' : 'Act adițional'
      await api.post('/hr/document-templates/act_aditional/render-word/archive', {
        employee_id: employeeDetails.id,
        contract_id: contract?.id || amendment.contract_id,
        amendment_id: amendment.id,
        tip: amendment.tip === 'incetare' ? 'decizie_incetare' : 'act_aditional',
        denumire: `${title} ${amendment.numar_act || amendment.id || ''}`.trim(),
        data_document: String(amendment.data_act || new Date().toISOString()).slice(0, 10),
        source: `word-contract-amendment:${amendment.id || amendment.uuid || ''}`,
        requires_ack: true,
        kiosk_visible: true
      })
      await openEmployee(employeeDetails)
    } catch (err) {
      setError(err.response?.data?.error || 'Actul adițional Word nu a putut fi arhivat în dosar.')
    }
  }

  async function downloadRenderedHrWord(templateId, params, fallbackName) {
    const response = await api.get(`/hr/document-templates/${templateId}/render-word`, { params, responseType: 'blob' })
    const url = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    const disposition = response.headers?.['content-disposition'] || ''
    const match = disposition.match(/filename="?([^";]+)"?/i)
    link.href = url
    link.download = match?.[1] || fallbackName || `${templateId}.docx`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function printOperationalAmendment(amendment, contract) {
    try {
      const response = await api.get(`/hr/employees/${employeeDetails.id}/cim`)
      const data = { ...response.data, amendment, contract, numar: amendment.numar_act || `AA-${amendment.id || '____'}`, data: String(amendment.data_act || new Date().toISOString()).slice(0, 10) }
      const emp = data.angajat || employeeDetails || {}
      const co = data.company || {}
      const changeText = amendmentText(amendment)
      const title = amendment.tip === 'incetare' ? 'DECIZIE / ACT DE ÎNCETARE' : amendment.tip === 'suspendare' ? 'ACT ADIȚIONAL DE SUSPENDARE' : 'ACT ADIȚIONAL'
      const template = getHrTemplate('act_aditional')
      if (template?.template_html) {
        const htmlFromTemplate = renderHrTemplate('act_aditional', {
          ...data,
          titlu: title,
          modificare_html: changeText,
          angajat: emp,
          company: co,
          contract: contract || {},
          amendment: {
            ...amendment,
            numar_act: amendment.numar_act || `AA-${amendment.id || '____'}`,
            data_act: String(amendment.data_act || data.data || '').slice(0, 10),
            data_efect: String(amendment.data_efect || '').slice(0, 10)
          }
        })
        printGeneratedHtml(htmlFromTemplate, data)
        await archiveGeneratedHtml({
          html: htmlFromTemplate,
          tip: amendment.tip === 'incetare' ? 'decizie_incetare' : 'act_aditional',
          denumire: `${title} ${amendment.numar_act || amendment.id || ''}`.trim(),
          data_document: String(amendment.data_act || data.data).slice(0, 10),
          source: `contract-amendment:${amendment.id || amendment.uuid || ''}`
        })
        return
      }
      const html = `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>${title}</title>
<style>
  body{font-family:Times New Roman,serif;font-size:11pt;margin:2cm;color:#000}
  h2{text-align:center;font-size:14pt;margin:8px 0}
  h3{font-size:12pt;margin:14px 0 5px}
  p,li{margin:5px 0;line-height:1.75}
  table{width:100%;border-collapse:collapse;margin:10px 0}
  td,th{border:1px solid #555;padding:5px 8px;font-size:10pt}
  .bold{font-weight:bold}
  .sig{margin-top:48px;display:flex;justify-content:space-between}
  .sig div{text-align:center;min-width:180px}
  @media print{body{margin:1.5cm 2cm}}
</style></head><body>
<h2>${title}</h2>
<h2>la Contractul Individual de Muncă</h2>
<p style="text-align:center">Nr. <span class="bold">${amendment.numar_act || '____'}</span> / data <span class="bold">${String(amendment.data_act || '').slice(0, 10) || data.data}</span></p>
<hr>
<h3>I. Părțile</h3>
<p><span class="bold">${co.denumire || '______________________'}</span>, CUI ${co.cui || '____________'}, cu sediul în ${co.adresa || '______________________'}, reprezentată de <span class="bold">${co.reprezentant || '______________________'}</span>, în calitate de ${co.functie_reprezentant || 'Director General'}, denumită în continuare <strong>Angajator</strong>,</p>
<p>și salariatul/salariata <span class="bold">${emp.prenume || ''} ${emp.nume || ''}</span>, CNP <span class="bold">${emp.cnp || '_______________'}</span>, marca <span class="bold">${emp.marca || '—'}</span>, denumit(ă) în continuare <strong>Salariat</strong>.</p>
<h3>II. Contract de referință</h3>
<table>
  <tr><td><strong>Contract</strong></td><td>${contract?.numar_contract || '—'}</td><td><strong>Data contract</strong></td><td>${String(contract?.data_contract || '').slice(0, 10) || '—'}</td></tr>
  <tr><td><strong>Data început</strong></td><td>${String(contract?.data_start || contract?.data_incepere || '').slice(0, 10) || '—'}</td><td><strong>Status curent</strong></td><td>${contract?.status || 'activ'}</td></tr>
</table>
<h3>III. Obiectul actului</h3>
<p>Începând cu data de <span class="bold">${String(amendment.data_efect || '').slice(0, 10)}</span>, părțile convin următoarea modificare:</p>
${changeText}
<p>Celelalte clauze ale contractului individual de muncă rămân neschimbate.</p>
<p>Prezentul act adițional face parte integrantă din contractul individual de muncă și produce efecte de la data menționată mai sus.</p>
${amendment.observatii ? `<h3>IV. Observații / temei</h3><p>${amendment.observatii}</p>` : ''}
<div class="sig">
  <div><p><strong>ANGAJATOR</strong></p><p>${co.reprezentant || '______________________'}</p><p>${co.functie_reprezentant || 'Director General'}</p><br><p>Semnătură: ________________</p></div>
  <div><p><strong>SALARIAT</strong></p><p>${emp.prenume || ''} ${emp.nume || ''}</p><br><p>Semnătură: ________________</p></div>
</div>
</body></html>`
      printGeneratedHtml(html, data)
      await archiveGeneratedHtml({
        html,
        tip: amendment.tip === 'incetare' ? 'decizie_incetare' : 'act_aditional',
        denumire: `${title} ${amendment.numar_act || amendment.id || ''}`.trim(),
        data_document: String(amendment.data_act || data.data).slice(0, 10),
        source: `contract-amendment:${amendment.id || amendment.uuid || ''}`
      })
    } catch (err) {
      setError(err.response?.data?.error || 'Actul adițional nu a putut fi generat.')
    }
  }

  async function archiveGeneratedHtml({ html, tip, denumire, data_document, source }) {
    if (!employeeDetails?.id || !html) return
    const response = await api.post(`/hr/employees/${employeeDetails.id}/files/generated`, { html, tip, denumire, data_document, source })
    window.dispatchEvent(new CustomEvent('hr-files-refresh', { detail: { employeeId: employeeDetails.id, item: response.data?.item } }))
  }

  function amendmentText(amendment) {
    const amount = amendment.salariu_baza ? Number(amendment.salariu_baza).toLocaleString('ro-RO') : ''
    const rows = []
    if (amendment.tip === 'salariu') rows.push(`<li>Salariul de bază brut lunar se modifică la <span class="bold">${amount} RON</span>.</li>`)
    if (amendment.tip === 'norma') rows.push(`<li>Norma de lucru se modifică la <span class="bold">${amendment.norma_ore} ore/zi</span>.</li>`)
    if (amendment.tip === 'functie') rows.push(`<li>Funcția se modifică în <span class="bold">${amendment.functia || '____________________'}</span>${amendment.functie_cor ? `, cod COR ${amendment.functie_cor}` : ''}.</li>`)
    if (amendment.tip === 'departament') rows.push(`<li>Locul organizatoric / departamentul se modifică conform deciziei interne și evidenței HR.</li>`)
    if (amendment.tip === 'suspendare') rows.push(`<li>Contractul se suspendă începând cu data indicată, conform temeiului menționat la observații.</li>`)
    if (amendment.tip === 'incetare') rows.push(`<li>Contractul individual de muncă încetează începând cu data indicată, conform temeiului menționat la observații.</li>`)
    if (!rows.length) rows.push(`<li>${amendment.observatii || 'Se completează prevederile contractului conform acordului părților.'}</li>`)
    return `<ol>${rows.join('')}</ol>`
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

  async function invalidateMonth() {
    const reason = window.prompt('Motivul devalidarii pontajului (minimum 5 caractere):')
    if (!reason || reason.trim().length < 5) return
    try {
      const employeeIds = scopedMonthlySheet.map(row => row.employee_id || row.id).filter(Boolean)
      const response = await api.post('/hr/timesheets/invalidate', { employee_ids: employeeIds, luna: filters.luna, reason })
      window.alert(response.data?.invalidated ? `${response.data.invalidated} inregistrari de pontaj au fost devalidate.` : 'Nu existau pontaje validate in selectia curenta.')
      await load()
    } catch (err) { setError(err.response?.data?.error || 'Pontajul nu a putut fi devalidat.') }
  }

  function openTimesheetCell(row, day) {
    const current = row.zile?.[day]
    setTimesheetEdit({ employee_id: row.employee_id || row.id, employee_name: fullName(row), data: day, tip: typeof current === 'object' ? (current.tip || 'lucru') : 'lucru', ore_lucrate: typeof current === 'object' ? (current.ore_lucrate ?? 0) : (current ?? 0), observatii: '' })
  }

  async function saveTimesheetCell(event) {
    event.preventDefault()
    try {
      await api.post('/hr/timesheets', timesheetEdit)
      setTimesheetEdit(null)
      await load()
    } catch (err) { setError(err.response?.data?.error || 'Pontajul nu a putut fi salvat.') }
  }

  async function fillWorkingDays() {
    const departmentId = (!isHRPontaj && isSefPontaj ? ownDepartmentKey : filters.dept_id) || ''
    if (!departmentId && !window.confirm('Nu este selectat un departament. Completezi toate departamentele cu 8 ore in zilele lucratoare?')) return
    try {
      const response = await api.post('/hr/timesheets/fill-month', { luna: filters.luna, dept_id: departmentId, ore_lucrate: 8 })
      await load()
      setError(response.data?.inserted ? '' : 'Nu au fost adaugate zile: pontajele existau deja sau departamentul nu are angajati activi.')
    } catch (err) { setError(err.response?.data?.error || 'Completarea automata nu a reusit.') }
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

  async function reviewMedicalLeave(item, decision) {
    try {
      const motiv = decision === 'reject' ? window.prompt('Motivul respingerii certificatului (minimum 5 caractere):') : ''
      if (decision === 'reject' && (!motiv || motiv.trim().length < 5)) return
      await api.post(`/hr/medical-leaves/${item.medical_certificate_uuid}/${decision}`, { motiv })
      await load()
    } catch (err) { setError(err.response?.data?.error || 'Verificarea certificatului medical a esuat.') }
  }

  async function loadMedicalRegister() {
    const response = await api.get('/hr/medical-leaves/register', { params: { luna: filters.luna } })
    setMedicalRegister(response.data || { rows: [], totals: {} })
  }

  async function sendMedicalToPayroll(item) {
    setMedicalPayrollItem(item)
    setMedicalDailyBase(item.baza_calcul_zilnica || '')
  }

  async function confirmMedicalPayroll(event) {
    event.preventDefault()
    if (!medicalPayrollItem || !(Number(medicalDailyBase) > 0)) return
    try {
      await api.post(`/hr/medical-leaves/${medicalPayrollItem.uuid}/payroll`, { baza_calcul_zilnica: Number(medicalDailyBase) })
      setMedicalPayrollItem(null)
      setMedicalDailyBase('')
      await loadMedicalRegister()
      window.alert('Indemnizatia a fost trimisa in salarizare ca ajustare confirmata.')
    } catch (err) { setError(err.response?.data?.error || 'Indemnizatia nu a putut fi trimisa in salarizare.') }
  }

  async function exportMedicalRegister() {
    const response = await api.get('/hr/medical-leaves/register.xlsx', { params: { luna: filters.luna }, responseType: 'blob' })
    const url = URL.createObjectURL(response.data); const link = document.createElement('a'); link.href = url; link.download = `Registru_CM_${filters.luna}.xlsx`; link.click(); URL.revokeObjectURL(url)
  }

  async function downloadMedicalLeave(item) {
    try {
      const response = await api.get(`/hr/medical-leaves/${item.medical_certificate_uuid}/document`, { responseType: 'blob' })
      const url = URL.createObjectURL(response.data)
      window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (err) { setError(err.response?.data?.error || 'Documentul medical nu a putut fi deschis.') }
  }

  async function createLeave(event) {
    event.preventDefault()
    try {
      await api.post('/hr/leave-requests', leaveForm)
      setLeaveModal(false)
      setLeaveForm({ employee_id: '', tip: 'CO', data_start: '', data_sfarsit: '', motiv: '' })
      await load()
    } catch (err) { setError(err.response?.data?.error || 'Cererea nu a putut fi salvata.') }
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

  const hrInboxRows = useMemo(() => {
    const rows = Array.isArray(hrInbox.rows) ? hrInbox.rows : []
    if (hrInboxFilter === 'critice') return rows.filter(row => row.severity === 'critical')
    if (hrInboxFilter === 'avertizari') return rows.filter(row => row.severity === 'warning')
    if (hrInboxFilter === 'info') return rows.filter(row => row.severity === 'info')
    if (hrInboxFilter && hrInboxFilter !== 'toate') return rows.filter(row => row.category === hrInboxFilter)
    return rows
  }, [hrInbox.rows, hrInboxFilter])

  const dossierDashboardRows = useMemo(() => {
    const rows = Array.isArray(dossierDashboard.rows) ? dossierDashboard.rows : []
    if (dossierDashboardFilter === 'lipsuri') return rows.filter(row => Number(row.missing_required_count || 0) > 0)
    if (dossierDashboardFilter === 'neconfirmate') return rows.filter(row => Number(row.pending_ack || 0) > 0)
    if (dossierDashboardFilter === 'scadente') return rows.filter(row => Number(row.expiration_count || 0) > 0)
    if (dossierDashboardFilter === 'ok') return rows.filter(row => Number(row.issue_score || 0) === 0)
    if (dossierDashboardFilter === 'probleme') return rows.filter(row => Number(row.issue_score || 0) > 0)
    return rows
  }, [dossierDashboard.rows, dossierDashboardFilter])

  const selectedDossierSummary = useMemo(() => {
    if (!employeeDetails?.id) return null
    return (dossierDashboard.rows || []).find(row => String(row.employee_id) === String(employeeDetails.id)) || null
  }, [dossierDashboard.rows, employeeDetails?.id])

  const selectedEmployeeLeaves = useMemo(() => {
    if (!employeeDetails?.id) return []
    return leaves.filter(item => String(item.employee_id) === String(employeeDetails.id)).slice().sort((a, b) => String(b.data_start || b.created_at || '').localeCompare(String(a.data_start || a.created_at || '')))
  }, [leaves, employeeDetails?.id])

  const selectedEmployeeExpirations = useMemo(() => {
    if (!employeeDetails?.id) return []
    return (advancedExpirations.rows || []).filter(item => String(item.employee_id) === String(employeeDetails.id)).slice().sort((a, b) => Number(a.days || 999) - Number(b.days || 999))
  }, [advancedExpirations.rows, employeeDetails?.id])

  const selectedEmployeeActivity = useMemo(() => {
    if (!employeeDetails?.id) return []
    return (hrActivity.rows || []).filter(item => String(item.employee_id || '') === String(employeeDetails.id)).slice(0, 6)
  }, [hrActivity.rows, employeeDetails?.id])

  const hrActivityCategories = useMemo(() => {
    const map = new Map()
    ;(hrActivity.rows || []).forEach(item => {
      if (item.category) map.set(item.category, item.category_label || item.category)
    })
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }))
  }, [hrActivity.rows])

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
      <HRPageHeader
        onImport={() => setImportModal(true)}
        onNewEmployee={() => setEmployeeModal(true)}
      />

      {error ? <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      <Card>
        <HRNavigationTabs
          tabs={visibleTabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          dashboardAlertsCount={dashboardAlerts.length}
          inboxTotal={hrInbox.summary?.total || 0}
        />
        <HRFilters
          activeTab={activeTab}
          filters={filters}
          onFiltersChange={setFilters}
          departments={departments}
          authTypes={authTypes}
        />
      </Card>

      {/* ─── DASHBOARD HR ─────────────────────────────────── */}
      {activeTab === 'Dashboard HR' ? (
        <HRDashboardPanel
          stats={stats}
          hrManagementPeriod={hrManagementPeriod}
          onHrManagementPeriodChange={setHrManagementPeriod}
          onLoadHrManagementReport={loadHrManagementReport}
          onDownloadHrManagementReport={downloadHrManagementReport}
          onGenerateHrNotifications={generateHrNotifications}
          hrNotificationResult={hrNotificationResult}
          hrManagementReport={hrManagementReport}
          pendingLeaves={pendingLeaves}
          onApproveLeave={approveLeave}
          onRejectLeave={rejectLeave}
          advancedExpirations={advancedExpirations}
          dashboardAlerts={dashboardAlerts}
          onLoadAdvancedExpirations={loadAdvancedExpirations}
          onNotifyAdvancedExpirations={notifyAdvancedExpirations}
          expirationNoticeResult={expirationNoticeResult}
          onOpenExpirationEmployee={openExpirationEmployee}
          expirationNotifications={expirationNotifications}
          onLoadExpirationNotifications={loadExpirationNotifications}
          onResolveExpirationNotification={resolveExpirationNotification}
        />
      ) : null}

      {/* ─── INBOX HR ─────────────────────────────────────── */}
      {activeTab === 'Inbox HR' ? (
        <HRInboxPanel
          hrInbox={hrInbox}
          hrInboxFilter={hrInboxFilter}
          onInboxFilterChange={setHrInboxFilter}
          onLoadHrInbox={loadHrInbox}
          hrInboxRows={hrInboxRows}
          dossierReminderResult={dossierReminderResult}
          onOpenHrInboxTask={openHrInboxTask}
          hrActivity={hrActivity}
          hrActivityFilter={hrActivityFilter}
          onHrActivityFilterChange={setHrActivityFilter}
          hrActivityCategories={hrActivityCategories}
          employeeOptions={employees.map(emp => ({ value: String(emp.id), label: fullName(emp) }))}
          onLoadHrActivity={() => loadHrActivity()}
          onDownloadHrActivity={downloadHrActivity}
        />
      ) : null}

      {/* ─── ANGAJAȚI ─────────────────────────────────────── */}
      {activeTab === 'Angajați' ? (
        <HREmployeesPanel
          employees={filteredEmployees}
          loading={loading}
          onOpenEmployee={openEmployee}
        />
      ) : null}

      {/* ─── PONTAJ ───────────────────────────────────────── */}
      {activeTab === 'Pontaj' && canUsePontaj ? (
        <HRTimesheetPanel
          filters={filters}
          deadlineDate={deadlineDate}
          timesheetLock={timesheetLock}
          rows={scopedMonthlySheet}
          monthDays={monthDays}
          loading={loading}
          onFillWorkingDays={fillWorkingDays}
          onSubmitDepartmentTimesheet={submitDepartmentTimesheet}
          onValidateMonth={validateMonth}
          onInvalidateMonth={invalidateMonth}
          onOpenTimesheetCell={openTimesheetCell}
          onOpenNexusExport={() => {
            setNexusExportForm({ luna: filters.luna, dept_id: (!isHRPontaj && isSefPontaj ? ownDepartmentKey : filters.dept_id) || '' })
            setNexusExportModal(true)
          }}
        />
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
        <div className="grid gap-4"><Card>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">Cereri de concediu</span>
            <Button size="sm" onClick={() => setLeaveModal(true)}>+ Cerere noua</Button>
          </div>
          <div className="grid gap-2">
            {leaves.length ? leaves.map(item => (
              <div key={item.uuid || item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">{employees.find(employee => String(employee.id) === String(item.employee_id)) ? fullName(employees.find(employee => String(employee.id) === String(item.employee_id))) : `Angajat ${item.employee_id}`}</span>
                  <span className="ml-2">{item.tip}</span>
                  <span className="ml-2 text-slate-500">{item.data_start} — {item.data_sfarsit}</span>
                  {item.zile ? <span className="ml-2 text-xs text-slate-400">({item.zile} zile)</span> : null}
                  {item.medical_certificate_uuid ? <div className="mt-1 text-xs text-slate-500">Certificat {item.certificat_serie}/{item.certificat_numar} · {item.zile_calendaristice} zile calendaristice · cod indemnizatie {item.cod_indemnizatie} · {item.medic_nume} · {item.unitate_emitenta}</div> : null}
                  {item.medical_rejection_reason ? <div className="mt-1 text-xs font-medium text-rose-700">Respins: {item.medical_rejection_reason}</div> : null}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={item.status === 'aprobata' ? 'success' : item.status === 'respinsa' ? 'danger' : 'warning'}>{item.status || 'cerut'}</Badge>
                  {item.medical_certificate_uuid ? <><Badge tone={item.status_verificare === 'verificat' ? 'success' : item.status_verificare === 'respinsa' ? 'danger' : 'warning'}>{item.status_verificare || 'in_verificare'}</Badge><Button size="sm" variant="secondary" onClick={() => downloadMedicalLeave(item)}>📎 Document</Button>{item.status_verificare === 'in_verificare' ? <><Button size="sm" onClick={() => reviewMedicalLeave(item, 'verify')}>Verifica</Button><Button size="sm" variant="secondary" onClick={() => reviewMedicalLeave(item, 'reject')}>Respinge document</Button></> : null}</> : null}
                  {(item.status === 'cerut' || item.status === 'pending') ? (
                    <>
                      <Button size="sm" disabled={item.tip === 'CM' && item.status_verificare !== 'verificat'} onClick={() => approveLeave(item.uuid || item.id)}>✅ Aprobă</Button>
                      <Button size="sm" variant="secondary" onClick={() => rejectLeave(item.uuid || item.id)}>❌ Respinge</Button>
                    </>
                  ) : null}
                </div>
              </div>
            )) : <p className="text-sm text-slate-500">{loading ? 'Se incarca...' : 'Nu exista cereri de concediu.'}</p>}
          </div>
        </Card>
        <MedicalRegisterCard month={filters.luna} register={medicalRegister} onExport={exportMedicalRegister} onPayroll={sendMedicalToPayroll} />
        </div>
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
        <HRAdvancedTimesheetPanel
          filters={filters}
          timesheetLock={timesheetLock}
          pendingOvertime={pendingOvertime}
          weeklyControls={weeklyControls}
          raportEmployee={raportEmployee}
          employees={filteredEmployees}
          raportLunar={raportLunar}
          overtimeBank={overtimeBank}
          canValidateTimesheet={hasPerm('hr:timesheets_validate')}
          canApproveOvertime={hasPerm('hr:timesheet_approve')}
          onCheckLock={loadTimesheetLock}
          onToggleLock={toggleTimesheetLock}
          onDecideOvertime={decideOvertime}
          onRaportEmployeeChange={setRaportEmployee}
          onMonthChange={luna => setFilters({ ...filters, luna })}
          onGenerateReport={loadRaportLunar}
          onOpenCompensate={() => setCompensateModal(true)}
        />
      ) : null}

      {/* ─── TURE & PROGRAM ──────────────────────────────── */}
      {activeTab === 'Ture & Program' ? (
        <HRShiftsSchedulePanel
          tures={tures}
          scheduleEmployees={scheduleEmployees}
          scheduleData={scheduleData}
          scheduleMonth={scheduleMonth}
          scheduleDept={scheduleDept}
          departments={departments}
          onNewShift={() => {
            setShiftEditing(null)
            setShiftForm({ nume: '', ora_start: '08:00', ora_sfarsit: '16:00', ore_normale: 8, culoare: '#3B82F6' })
            setShiftModal(true)
          }}
          onEditShift={editShift}
          onDeactivateShift={deactivateShift}
          onScheduleMonthChange={setScheduleMonth}
          onScheduleDeptChange={setScheduleDept}
          onRefreshSchedule={loadScheduleData}
          onSetScheduleShift={setScheduleShift}
        />
      ) : null}

      {/* ─── TICHETE MASĂ ────────────────────────────────── */}
      {activeTab === 'Tichete masă' ? (
        <HRMealTicketsPanel
          mealConfig={mealConfig}
          mealMonth={mealMonth}
          mealDept={mealDept}
          mealRows={mealRows}
          departments={departments}
          onMealConfigChange={setMealConfig}
          onSaveMealConfig={saveMealConfig}
          onMealMonthChange={setMealMonth}
          onMealDeptChange={setMealDept}
          onExportCsv={exportMealTicketsCsv}
        />
      ) : null}

      {/* ─── TRAINING & EVALUĂRI ──────────────────────────── */}
      {activeTab === 'Training & Evaluări' ? (
        <HRTrainingPanel
          scadentar={scadentar}
          evaluations={evaluations}
          employees={employees}
          loading={loading}
          onRefresh={loadTrainingData}
          onNewEvaluation={() => {
            setEvalEditing(null)
            setEvalForm({ employee_id: '', data_evaluare: new Date().toISOString().slice(0, 10), tip: 'periodica', calificativ: 'B', punctaj: '', observatii: '', obiective: '', recomandari: '' })
            setEvalModal(true)
          }}
          onEditEvaluation={ev => {
            setEvalEditing(ev)
            setEvalForm({ ...ev })
            setEvalModal(true)
          }}
          onDeleteEvaluation={deleteEvaluation}
        />
      ) : null}

      <HRTimesheetEditModal
        edit={timesheetEdit}
        onChange={setTimesheetEdit}
        onClose={() => setTimesheetEdit(null)}
        onSubmit={saveTimesheetCell}
      />

      {/* ─── ECHIPAMENTE PROTECȚIE ───────────────────────── */}
      {activeTab === '🦺 Echipamente' ? (
        <HREquipmentPanel
          equipmentTab={equipmentTab}
          equipmentRows={equipmentRows}
          equipmentOrder={equipmentOrder}
          equipmentExpiry={equipmentExpiry}
          equipmentCatalog={equipmentCatalog}
          canManageEquipment={canManageEquipment}
          onEquipmentTabChange={setEquipmentTab}
          onExportEquipmentOrder={exportEquipmentOrder}
          onCreateEquipmentReferat={createEquipmentReferat}
          onOpenCatalogModal={openCatalogModal}
        />
      ) : null}

      {/* ─── ORGANIGRAMĂ ──────────────────────────────────── */}
      {activeTab === 'Organigramă' ? (
        <OrgChart employees={employees} departments={departments} onClickEmployee={openEmployee} />
      ) : null}

      {/* ─── DOCUMENTE HR ─────────────────────────────────── */}
      {activeTab === 'Documente HR' ? (
        <div className="grid gap-4">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="mb-1 text-sm font-semibold text-slate-700">📂 Dosar personal — generare documente HR</div>
                <p className="text-xs text-slate-400">Selectează angajatul și documentul dorit. Documentele se deschid în tab nou pentru print / salvare PDF.</p>
              </div>
              <Button size="sm" variant="secondary" onClick={downloadDossierReport}>📊 Export raport dosar HR</Button>
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-800">🧭 Dashboard conformitate dosar HR</div>
                <div className="text-xs text-slate-500">Panou de lucru: lipsuri obligatorii, documente Kiosk neconfirmate și scadențe apropiate.</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={loadDossierDashboard}>Reîncarcă dashboard</Button>
                <Button size="sm" variant="secondary" onClick={downloadDossierReport}>Export Excel</Button>
              </div>
            </div>
            {dossierReminderResult ? (
              <div className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                Reminder trimis pentru <strong>{dossierReminderResult.pending || 0}</strong> documente neconfirmate
                {dossierReminderResult.notified_user ? ' · notificare internă creată' : ' · fără utilizator ERP asociat pentru notificare internă'}
                {dossierReminderResult.sent_at ? ` · ${String(dossierReminderResult.sent_at).slice(0, 16).replace('T', ' ')}` : ''}
              </div>
            ) : null}
            <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded border border-slate-200 p-2 text-sm"><div className="text-xs text-slate-500">Angajați verificați</div><strong>{dossierDashboard.summary?.total || 0}</strong></div>
              <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm"><div className="text-xs text-emerald-700">Fără probleme</div><strong>{dossierDashboard.summary?.complete || 0}</strong></div>
              <div className="rounded border border-rose-200 bg-rose-50 p-2 text-sm"><div className="text-xs text-rose-700">Cu lipsuri obligatorii</div><strong>{dossierDashboard.summary?.missing_required || 0}</strong></div>
              <div className="rounded border border-amber-200 bg-amber-50 p-2 text-sm"><div className="text-xs text-amber-700">Confirmări Kiosk lipsă</div><strong>{dossierDashboard.summary?.pending_ack || 0}</strong></div>
              <div className="rounded border border-blue-200 bg-blue-50 p-2 text-sm"><div className="text-xs text-blue-700">Cu scadențe ≤90 zile</div><strong>{dossierDashboard.summary?.expiring || 0}</strong></div>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {[
                { value: 'probleme', label: `Probleme (${dossierDashboard.summary?.problem_employees || 0})` },
                { value: 'lipsuri', label: 'Lipsuri obligatorii' },
                { value: 'neconfirmate', label: 'Neconfirmate Kiosk' },
                { value: 'scadente', label: 'Scadențe' },
                { value: 'ok', label: 'Fără probleme' },
                { value: 'toate', label: 'Toate' },
              ].map(filter => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setDossierDashboardFilter(filter.value)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${dossierDashboardFilter === filter.value ? 'bg-primary-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr><th className="px-3 py-2">Angajat</th><th className="px-3 py-2">Dosar</th><th className="px-3 py-2">Lipsuri</th><th className="px-3 py-2">Kiosk</th><th className="px-3 py-2">Scadență</th><th className="px-3 py-2 text-right">Acțiuni</th></tr>
                </thead>
                <tbody>
                  {dossierDashboardRows.slice(0, 40).map(row => {
                    const emp = employees.find(item => String(item.id) === String(row.employee_id))
                    const severityClass = row.expired_count ? 'text-rose-700' : row.critical_count ? 'text-red-700' : row.warning_count ? 'text-amber-700' : 'text-blue-700'
                    return (
                      <tr key={row.employee_id} className="border-t border-slate-100">
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-800">{row.nume_complet}</div>
                          <div className="text-xs text-slate-400">{row.functia || '-'} · {row.department_name || 'fără departament'} · marca {row.marca || '-'}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200"><div className={`h-2 ${row.percent === 100 ? 'bg-emerald-500' : row.percent >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${row.percent || 0}%` }} /></div>
                          <div className="mt-1 text-xs text-slate-500">{row.required_done}/{row.required_total} · {row.percent}%</div>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {row.missing_required?.length ? <span className="text-rose-700">{row.missing_required.join(', ')}</span> : <span className="text-emerald-700">Complet obligatoriu</span>}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <div className={row.pending_ack ? 'font-semibold text-amber-700' : 'text-emerald-700'}>{row.pending_ack || 0} neconfirmate</div>
                          <div className="text-slate-400">{row.acknowledged || 0}/{row.kiosk_documents || 0} confirmate</div>
                          {row.last_reminder_at ? <div className="text-slate-400">reminder {String(row.last_reminder_at).slice(0, 10)}</div> : null}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {row.next_expiration ? (
                            <div>
                              <div className={`font-semibold ${severityClass}`}>{row.next_expiration.label}</div>
                              <div className="text-slate-500">{row.next_expiration.date} · {row.next_expiration.days < 0 ? `expirat de ${Math.abs(row.next_expiration.days)} zile` : `${row.next_expiration.days} zile`}</div>
                            </div>
                          ) : <span className="text-emerald-700">Fără scadențe apropiate</span>}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap justify-end gap-2">
                            {emp ? <Button size="sm" variant="secondary" onClick={() => openEmployee(emp)}>Dosar</Button> : null}
                            {row.pending_ack ? <Button size="sm" onClick={() => sendDossierReminder(row.employee_id)}>Reminder Kiosk</Button> : null}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {!dossierDashboardRows.length ? <tr><td colSpan="6" className="px-3 py-6 text-center text-slate-400">Nu există angajați pentru filtrul selectat.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-800">🧩 Șabloane HR editabile</div>
                <div className="text-xs text-slate-500">CIM-ul și actele adiționale pot folosi texte proprii Publiserv, cu variabile inserabile.</div>
              </div>
              <Button size="sm" variant="secondary" onClick={loadHrDocumentTemplates}>Reîncarcă șabloane</Button>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {hrDocumentTemplates.map(template => (
                <div key={template.id} className="rounded border border-slate-200 p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{template.denumire}</div>
                      <div className="text-xs text-slate-500">{template.tip} · {template.system_default ? 'implicit sistem' : 'personalizat'}</div>
                      <div className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs ${template.word_template_file ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-50 text-slate-500 ring-1 ring-slate-200'}`}>
                        {template.word_template_file ? `Word: ${template.word_template_original_name || 'șablon încărcat'}` : 'Fără șablon Word'}
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                      {template.word_template_file ? <Button size="sm" variant="secondary" onClick={() => downloadTemplateWordFile(template)}>Descarcă Word</Button> : null}
                      {template.word_template_file ? <Button size="sm" variant="secondary" onClick={() => openTemplateWordTest(template)}>Testează Word</Button> : null}
                      {hasPermission('hr:manage') ? <Button size="sm" variant="secondary" loading={templateWordUploading === template.id} onClick={() => chooseTemplateWordFile(template)}>{template.word_template_file ? 'Înlocuiește Word' : 'Încarcă Word'}</Button> : null}
                      {hasPermission('hr:manage') ? <Button size="sm" variant="secondary" onClick={() => startTemplateEditing(template)}>Editează text</Button> : null}
                    </div>
                  </div>
                  {template.descriere ? <div className="mt-2 text-xs text-slate-500">{template.descriere}</div> : null}
                  {template.word_template_uploaded_at ? <div className="mt-1 text-xs text-slate-400">Încărcat: {String(template.word_template_uploaded_at).slice(0, 16).replace('T', ' ')}</div> : null}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-800">✅ Checklist dosar personal</div>
                <div className="text-xs text-slate-500">Verificare rapidă pentru documentele obligatorii din dosarul fiecărui angajat.</div>
              </div>
              <Button size="sm" variant="secondary" onClick={loadDossierChecklist}>Reîncarcă checklist</Button>
            </div>
            <div className="mb-3 grid gap-2 sm:grid-cols-4">
              <div className="rounded border border-slate-200 p-2 text-sm"><div className="text-xs text-slate-500">Angajați</div><strong>{dossierChecklist.summary?.total || 0}</strong></div>
              <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm"><div className="text-xs text-emerald-700">Complete</div><strong>{dossierChecklist.summary?.complete || 0}</strong></div>
              <div className="rounded border border-amber-200 bg-amber-50 p-2 text-sm"><div className="text-xs text-amber-700">Incomplete</div><strong>{dossierChecklist.summary?.incomplete || 0}</strong></div>
              <div className="rounded border border-rose-200 bg-rose-50 p-2 text-sm"><div className="text-xs text-rose-700">Cu lipsuri obligatorii</div><strong>{dossierChecklist.summary?.critical_missing || 0}</strong></div>
            </div>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Angajat</th><th className="px-3 py-2">Complet</th><th className="px-3 py-2">Lipsesc</th><th className="px-3 py-2">Status documente</th><th className="px-3 py-2"></th></tr></thead>
                <tbody>
                  {(dossierChecklist.rows || []).slice().sort((a, b) => a.percent - b.percent || String(a.nume_complet).localeCompare(String(b.nume_complet))).map(row => (
                    <tr key={row.employee_id} className="border-t border-slate-100">
                      <td className="px-3 py-2"><div className="font-medium">{row.nume_complet}</div><div className="text-xs text-slate-400">{row.functia || '-'} · Marca {row.marca || '-'}</div></td>
                      <td className="px-3 py-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200"><div className={`h-2 ${row.percent === 100 ? 'bg-emerald-500' : row.percent >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${row.percent || 0}%` }} /></div>
                        <div className="mt-1 text-xs text-slate-500">{row.required_done}/{row.required_total} · {row.percent}%</div>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">{row.missing_required?.length ? row.missing_required.join(', ') : <span className="text-emerald-700">Nimic obligatoriu</span>}</td>
                      <td className="px-3 py-2">
                        <div className="flex max-w-md flex-wrap gap-1">
                          {(row.items || []).map(item => <span key={item.key} className={`rounded px-2 py-1 text-xs ${item.ok ? 'bg-emerald-50 text-emerald-700' : item.required ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>{item.ok ? '✓' : '×'} {item.label}</span>)}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">{(() => { const emp = employees.find(item => String(item.id) === String(row.employee_id)); return emp ? <Button size="sm" variant="secondary" onClick={() => openEmployee(emp)}>Dosar</Button> : null })()}</td>
                    </tr>
                  ))}
                  {!(dossierChecklist.rows || []).length ? <tr><td colSpan="5" className="px-3 py-6 text-center text-slate-400">Nu există date pentru checklist.</td></tr> : null}
                </tbody>
              </table>
            </div>
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

      <HRDocumentTemplateModal
        template={templateEditing}
        advancedMode={templateAdvancedMode}
        editorRef={templateEditorRef}
        variables={HR_TEMPLATE_VARIABLES}
        wordUploading={templateWordUploading}
        onChange={setTemplateEditing}
        onClose={() => setTemplateEditing(null)}
        onSubmit={saveHrDocumentTemplate}
        onDownloadWord={downloadTemplateWordFile}
        onChooseWord={chooseTemplateWordFile}
        onInsertSnippet={insertTemplateSnippet}
        onApplyCommand={applyTemplateCommand}
        onToggleAdvancedMode={() => setTemplateAdvancedMode(value => !value)}
        onSyncVisualEditor={syncTemplateVisualEditor}
      />

      <HRDocumentTemplateTestModal
        template={templateTesting}
        form={templateTestForm}
        result={templateTestResult}
        employees={employees}
        getEmployeeLabel={emp => `${fullName(emp)}${emp.marca ? ` · ${emp.marca}` : ''}`}
        getContracts={employeeContractsFor}
        getAmendments={employeeAmendmentsFor}
        onFormChange={setTemplateTestForm}
        onResultClear={() => setTemplateTestResult(null)}
        onClose={() => setTemplateTesting(null)}
        onSubmit={runTemplateWordTest}
      />

      {/* ─── MODAL FIȘA ANGAJAT ───────────────────────────── */}
      <HREmployeeProfileModal
        open={Boolean(selectedEmployee)}
        title={selectedEmployee ? `Fișa — ${fullName(selectedEmployee)}` : ''}
        employee={employeeDetails}
        displayName={employeeDetails ? fullName(employeeDetails) : ''}
        editMode={editMode}
        photoInputRef={photoInputRef}
        photoPreview={photoPreview}
        contracts={employeeContracts}
        dossierSummary={selectedDossierSummary}
        expirations={selectedEmployeeExpirations}
        workflow={employeeWorkflow}
        coBalance={coBalance}
        activityItems={selectedEmployeeActivity}
        activeTab={employeeProfileTab}
        onClose={() => setSelectedEmployee(null)}
        onCancelEdit={() => { setEditMode(false); setPhotoPreview(null); setPhotoFile(null) }}
        onPhotoSelected={file => {
          setPhotoFile(file)
          setPhotoPreview(URL.createObjectURL(file))
        }}
        onPrint={printEmployeeProfile}
        onSave={saveEmployeeEdit}
        onStartEdit={() => { setEmployeeProfileTab('date'); setEditMode(true) }}
        onReloadActivity={() => employeeDetails ? loadHrActivity({ employee_id: employeeDetails.id }) : null}
        onTabChange={setEmployeeProfileTab}
      >
        {employeeDetails ? (
          <HREmployeeProfileTabsRouter
            activeTab={employeeProfileTab}
            employee={employeeDetails}
            editMode={editMode}
            editForm={editForm}
            departments={departments}
            linkableUsers={linkableUsers}
            coBalance={coBalance}
            adeverintaData={adeverintaData}
            adeverintaTip={adeverintaTip}
            identityText={identityText}
            daysUntil={daysUntil}
            alertTone={alertTone}
            contracts={employeeContracts}
            amendments={employeeAmendments}
            transferHistory={transferHistory}
            canManageHr={hasPerm('hr:manage')}
            documentTemplates={hrDocumentTemplates}
            leaves={selectedEmployeeLeaves}
            dossierSummary={selectedDossierSummary}
            expirations={selectedEmployeeExpirations}
            suggestedUpload={guidedDossierUpload}
            workflow={employeeWorkflow}
            workflowBusy={employeeWorkflowBusy}
            guidedWorkflowStep={guidedWorkflowStep}
            employeeEquipment={employeeEquipment}
            canManageEquipment={canManageEquipment}
            onEditFormChange={setEditForm}
            onLoadAdeverinta={loadAdeverinta}
            onAdeverintaTipChange={setAdeverintaTip}
            onPrintAdeverinta={printAdeverinta}
            onReloadContracts={() => reloadEmployeeContracts(employeeDetails.id)}
            onError={setError}
            onPrintContract={printOperationalContract}
            onPrintAmendment={printOperationalAmendment}
            onGenerateContractWord={generateContractWord}
            onGenerateAmendmentWord={generateAmendmentWord}
            onArchiveContractWord={archiveContractWord}
            onArchiveAmendmentWord={archiveAmendmentWord}
            onSuggestionUsed={() => { setGuidedDossierUpload(null); loadHrInbox() }}
            onSendDossierReminder={() => sendDossierReminder(employeeDetails.id)}
            onReloadWorkflow={() => loadEmployeeWorkflow()}
            onStartWorkflow={startEmployeeWorkflow}
            onToggleWorkflowStep={toggleEmployeeWorkflowStep}
            onCloseWorkflow={closeEmployeeWorkflow}
            getStepActions={workflowStepActions}
            onOpenDotare={openEquipmentAction}
            onSaveEmployeeSizes={saveEmployeeSizes}
            onSetReturnedEquipment={setReturnedEquipment}
          />
        ) : null}
      </HREmployeeProfileModal>

      <HRLeaveRequestModal
        open={leaveModal}
        form={leaveForm}
        employees={employees}
        getEmployeeName={fullName}
        onClose={() => setLeaveModal(false)}
        onSubmit={createLeave}
        onChange={setLeaveForm}
      />

      <HRMedicalPayrollModal
        item={medicalPayrollItem}
        dailyBase={medicalDailyBase}
        onDailyBaseChange={setMedicalDailyBase}
        onClose={() => setMedicalPayrollItem(null)}
        onSubmit={confirmMedicalPayroll}
      />

      <HREmployeeModal
        open={employeeModal}
        form={employeeForm}
        departments={departments}
        onClose={() => setEmployeeModal(false)}
        onSubmit={createEmployee}
        onChange={setEmployeeForm}
      />

      <HRShiftModal
        open={shiftModal}
        editing={shiftEditing}
        form={shiftForm}
        onChange={setShiftForm}
        onSubmit={createShift}
        onClose={() => { setShiftModal(false); setShiftEditing(null) }}
      />

      <HROvertimeCompensationModal
        open={compensateModal}
        form={compensateForm}
        onChange={setCompensateForm}
        onClose={() => setCompensateModal(false)}
        onSubmit={compensateOvertime}
      />

      <HREvaluationModal
        open={evalModal}
        editing={evalEditing}
        form={evalForm}
        employees={employees}
        getEmployeeName={fullName}
        onChange={setEvalForm}
        onClose={() => { setEvalModal(false); setEvalEditing(null) }}
        onSubmit={saveEvaluation}
      />

      <HRImportEmployeesModal
        open={importModal}
        file={importFile}
        result={importResult}
        onFileChange={setImportFile}
        onDownloadTemplate={downloadTemplate}
        onClose={() => setImportModal(false)}
        onSubmit={importEmployees}
      />

      <HRNexusExportModal
        open={nexusExportModal}
        form={nexusExportForm}
        departments={departments}
        departmentDisabled={!isHRPontaj && isSefPontaj}
        onChange={setNexusExportForm}
        onClose={() => setNexusExportModal(false)}
        onSubmit={exportNexusTimesheet}
      />

      <HREquipmentCatalogModal
        open={catalogModal}
        editing={catalogEditing}
        catalogForm={catalogForm}
        suppliers={equipmentSuppliers}
        onCatalogFormChange={setCatalogForm}
        onSubmit={saveCatalogItem}
        onClose={() => setCatalogModal(false)}
      />

      <HREquipmentDotareModal
        open={dotareModal}
        dotareForm={dotareForm}
        employeeEquipment={employeeEquipment}
        onDotareFormChange={setDotareForm}
        onSubmit={saveDotare}
        onClose={() => setDotareModal(false)}
      />
    </div>
  )
}

