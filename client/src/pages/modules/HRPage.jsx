import { useEffect, useMemo, useRef, useState } from 'react'
import api from '../../api/client'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
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
import HRDocumentsPanel from './hr/HRDocumentsPanel'
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
import { createHrDocumentPrintActions } from './hr/hrDocumentPrint'

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
  const [countryRules, setCountryRules] = useState({ current: null })
  const [laborRegistryHistory, setLaborRegistryHistory] = useState([])
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
  const [notice, setNotice] = useState('')
  const [confirmAction, setConfirmAction] = useState(null)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [hrAssistantExpanded, setHrAssistantExpanded] = useState(false)
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

  async function runConfirmAction(reason) {
    if (!confirmAction?.run) return
    setConfirmLoading(true)
    setError('')
    setNotice('')
    try {
      await confirmAction.run(reason)
      setConfirmAction(null)
    } catch (err) {
      setError(err.response?.data?.error || confirmAction.errorMessage || 'Acțiunea nu a putut fi executată.')
    } finally {
      setConfirmLoading(false)
    }
  }

  async function load() {
    setLoading(true)
    setError('')
    setNotice('')
    try {
      const [employeesRes, departmentsRes, sheetRes, leavesRes, authRes, statsRes, usersRes, templatesRes, checklistRes, dossierDashboardRes, inboxRes, activityRes, managementRes, countryRulesRes, laborRegistryHistoryRes, expirationsRes, expirationNotificationsRes] = await Promise.all([
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
        api.get('/hr/country-rules').catch(() => ({ data: { current: null } })),
        hasPermission('hr:reges_export') ? api.get('/hr/reges/history').catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
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
      setCountryRules(countryRulesRes.data || { current: null })
      setLaborRegistryHistory(arrayFrom(laborRegistryHistoryRes.data, ['exports', 'history', 'items']))
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
    if (cancel) {
      setConfirmAction({
        title: 'Anulează flux HR',
        message: 'Fluxul angajatului va fi închis ca anulat.',
        details: 'Pașii existenți rămân în istoric, iar motivul este salvat pentru audit.',
        confirmLabel: 'Anulează fluxul',
        tone: 'danger',
        reasonLabel: 'Motiv anulare',
        reasonDefault: 'Anulat de HR',
        reasonRequired: true,
        minReasonLength: 5,
        errorMessage: 'Fluxul HR nu a putut fi închis.',
        run: note => closeEmployeeWorkflowRequest(true, note),
      })
      return
    }
    await closeEmployeeWorkflowRequest(false, '')
  }

  async function closeEmployeeWorkflowRequest(cancel = false, note = '') {
    if (!employeeDetails?.id || !employeeWorkflow?.uuid) return
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

  async function downloadLaborWorkRegister() {
    try {
      const response = await api.get('/hr/reges/work-register.xlsx', { responseType: 'blob' })
      const url = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = `Registru_lucru_salariat_${new Date().toISOString().slice(0, 10)}.xlsx`
      link.click()
      URL.revokeObjectURL(url)
      setNotice('Registrul intern de lucru a fost descărcat. Transmiterea oficială se face doar prin adaptorul local validat.')
      await loadLaborRegistryHistory()
    } catch (err) {
      setError(err.response?.data?.error || 'Registrul intern de lucru nu a putut fi descărcat.')
    }
  }

  async function loadLaborRegistryHistory() {
    if (!hasPermission('hr:reges_export')) return
    try {
      const response = await api.get('/hr/reges/history')
      setLaborRegistryHistory(arrayFrom(response.data, ['exports', 'history', 'items']))
    } catch {
      setLaborRegistryHistory([])
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
    if (status === 'reject') {
      setConfirmAction({
        title: 'Respinge ore suplimentare',
        message: `Respingi cererea de ore suplimentare pentru ${item.nume || item.employee_name || 'angajat'}?`,
        details: 'Motivul respingerii va fi păstrat în istoricul cererii.',
        confirmLabel: 'Respinge',
        tone: 'danger',
        reasonLabel: 'Motiv respingere',
        reasonPlaceholder: 'Ex.: interval suprapus, justificare insuficientă...',
        reasonRequired: true,
        minReasonLength: 5,
        errorMessage: 'Decizia nu a putut fi salvata.',
        run: reason => decideOvertimeRequest(item, status, reason),
      })
      return
    }
    await decideOvertimeRequest(item, status, '')
  }

  async function decideOvertimeRequest(item, status, reason = '') {
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
    setConfirmAction({
      title: 'Dezactivează tura',
      message: `Dezactivezi tura ${tura.nume}?`,
      details: 'Programările istorice rămân păstrate. Tura nu va mai fi disponibilă pentru planificări noi.',
      confirmLabel: 'Dezactivează',
      tone: 'danger',
      errorMessage: 'Tura nu a putut fi dezactivata.',
      run: () => deactivateShiftRequest(tura),
    })
  }

  async function deactivateShiftRequest(tura) {
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
    setNotice(`Referat ${response.data.referat.serie}/${response.data.referat.numar} creat în status draft.`)
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
    setConfirmAction({
      title: 'Șterge evaluarea',
      message: 'Ștergi evaluarea selectată?',
      details: 'Acțiunea elimină evaluarea din lista HR.',
      confirmLabel: 'Șterge',
      tone: 'danger',
      errorMessage: 'Eroare la ștergere.',
      run: () => deleteEvaluationRequest(id),
    })
  }

  async function deleteEvaluationRequest(id) {
    try {
      await api.delete(`/hr/evaluations/${id}`)
      await loadTrainingData()
    } catch { setError('Eroare la ștergere.') }
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
    setConfirmAction({
      title: 'Devalidează pontajul',
      message: `Devalidezi pontajul pentru luna ${filters.luna}?`,
      details: 'Pontajele validate din selecția curentă vor reveni la stadiu editabil. Motivul rămâne în audit.',
      confirmLabel: 'Devalidează',
      tone: 'danger',
      reasonLabel: 'Motiv devalidare',
      reasonPlaceholder: 'Ex.: concediu aprobat ulterior, corecție ore...',
      reasonRequired: true,
      minReasonLength: 5,
      errorMessage: 'Pontajul nu a putut fi devalidat.',
      run: reason => invalidateMonthRequest(reason),
    })
  }

  async function invalidateMonthRequest(reason) {
    try {
      const employeeIds = scopedMonthlySheet.map(row => row.employee_id || row.id).filter(Boolean)
      const response = await api.post('/hr/timesheets/invalidate', { employee_ids: employeeIds, luna: filters.luna, reason })
      await load()
      setNotice(response.data?.invalidated ? `${response.data.invalidated} înregistrări de pontaj au fost devalidate.` : 'Nu existau pontaje validate în selecția curentă.')
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
    if (!departmentId) {
      setConfirmAction({
        title: 'Completează toate departamentele',
        message: 'Nu este selectat un departament.',
        details: 'Completezi toate departamentele cu 8 ore în zilele lucrătoare?',
        confirmLabel: 'Completează toate',
        tone: 'warning',
        errorMessage: 'Completarea automata nu a reusit.',
        run: () => fillWorkingDaysRequest(departmentId),
      })
      return
    }
    await fillWorkingDaysRequest(departmentId)
  }

  async function fillWorkingDaysRequest(departmentId) {
    try {
      const response = await api.post('/hr/timesheets/fill-month', { luna: filters.luna, dept_id: departmentId, ore_lucrate: 8 })
      await load()
      if (response.data?.inserted) setNotice(`${response.data.inserted} zile de pontaj au fost completate automat.`)
      else setError('Nu au fost adaugate zile: pontajele existau deja sau departamentul nu are angajati activi.')
    } catch (err) { setError(err.response?.data?.error || 'Completarea automata nu a reusit.') }
  }

  async function loadTimesheetLock() {
    const response = await api.get('/hr/timesheets/lock', { params: { luna: filters.luna } })
    setTimesheetLock(response.data)
  }

  async function toggleTimesheetLock() {
    const locked = timesheetLock?.locked
    setConfirmAction({
      title: locked ? 'Deblochează pontajul' : 'Închide pontajul',
      message: locked ? `Deblochezi pontajul pentru luna ${filters.luna}?` : `Închizi pontajul pentru luna ${filters.luna}?`,
      details: locked ? 'Pontajul va putea fi editat din nou.' : 'Pontajul va fi marcat ca închis pentru control lunar.',
      confirmLabel: locked ? 'Deblochează' : 'Închide luna',
      tone: locked ? 'warning' : 'success',
      reasonLabel: locked ? 'Motiv deblocare' : 'Motiv închidere',
      reasonDefault: locked ? '' : 'Pontaj lunar verificat si inchis',
      reasonRequired: true,
      minReasonLength: 1,
      errorMessage: 'Starea pontajului nu a putut fi schimbata.',
      run: motiv => toggleTimesheetLockRequest(locked, motiv),
    })
  }

  async function toggleTimesheetLockRequest(locked, motiv) {
    try {
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
    if (decision === 'reject') {
      setConfirmAction({
        title: 'Respinge certificat medical',
        message: `Respinge documentul medical pentru ${item.nume || ''} ${item.prenume || ''}`.trim(),
        details: 'Motivul respingerii rămâne vizibil în istoricul cererii.',
        confirmLabel: 'Respinge document',
        tone: 'danger',
        reasonLabel: 'Motiv respingere',
        reasonPlaceholder: 'Ex.: document ilizibil, date neconforme...',
        reasonRequired: true,
        minReasonLength: 5,
        errorMessage: 'Verificarea certificatului medical a esuat.',
        run: motiv => reviewMedicalLeaveRequest(item, decision, motiv),
      })
      return
    }
    await reviewMedicalLeaveRequest(item, decision, '')
  }

  async function reviewMedicalLeaveRequest(item, decision, motiv = '') {
    try {
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
      setNotice('Indemnizația a fost trimisă în salarizare ca ajustare confirmată.')
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

  const {
    identityText,
    printEmployeeProfile,
    printCIM,
    printOperationalContract,
    generateContractWord,
    generateAmendmentWord,
    archiveContractWord,
    archiveAmendmentWord,
    printOperationalAmendment,
    loadAdeverinta,
    printAdeverinta,
    printFisaPost,
    printActAditional,
    printNotaLichidare,
    printCerereAngajare,
    printDecizieConc,
    printNotificarePrv,
    printCerereConc,
    printDeclDeduceri,
    printNotaGDPR,
    printDeclFunctieBaza,
  } = createHrDocumentPrintActions({
    api,
    employeeDetails,
    selectedDossierSummary,
    selectedEmployeeExpirations,
    selectedEmployeeLeaves,
    employeeContracts,
    coBalance,
    hrDocumentTemplates,
    setError,
    openEmployee,
    adeverintaTip,
    setAdeverintaData,
  })

  const selectedEmployeeActivity = useMemo(() => {
    if (!employeeDetails?.id) return []
    return (hrActivity.rows || []).filter(item => String(item.employee_id || '') === String(employeeDetails.id)).slice(0, 6)
  }, [hrActivity.rows, employeeDetails?.id])

  const hrSimpleFlow = useMemo(() => {
    const canOpen = tab => visibleTabs.includes(tab)
    const goto = tab => canOpen(tab) ? () => setActiveTab(tab) : undefined
    const activeEmployees = employees.filter(employee => employee.activ !== false && employee.activ !== 0)
    const hasActiveContract = employee => {
      if (Array.isArray(employee.contracte_active) && employee.contracte_active.length) return true
      return Boolean(
        employee.contract_id ||
        employee.contract_activ_id ||
        employee.numar_contract ||
        employee.data_contract ||
        employee.data_angajare ||
        employee.contract_start ||
        employee.data_start_contract
      )
    }
    const hasSalaryBase = employee => Number(employee.salariu_baza || employee.salary_base || employee.base_salary || 0) > 0
    const employeesWithoutContract = activeEmployees.filter(employee => !hasActiveContract(employee)).length
    const employeesWithoutSalary = activeEmployees.filter(employee => !hasSalaryBase(employee)).length
    const pendingLeaveCount = pendingLeaves.length
    const medicalPending = (medicalRegister.rows || []).filter(item => !['verificat', 'respins', 'respinsa', 'trimis_salarizare'].includes(String(item.status || item.status_verificare || '').toLowerCase())).length
    const dossierIssues = Number(dossierDashboard.summary?.missing_required || dossierDashboard.summary?.missing_required_count || dossierDashboard.summary?.issues || 0)
      || (dossierDashboard.rows || []).filter(row => Number(row.issue_score || 0) > 0 || Number(row.missing_required_count || 0) > 0).length
    const missingKiosk = activeEmployees.filter(employee => !(
      employee.user_id ||
      employee.userId ||
      employee.employee_user_id ||
      employee.associated_user_id ||
      employee.kiosk_user_id ||
      employee.kiosk_username
    )).length
    const monthRows = scopedMonthlySheet.length
    const timesheetDepartments = Array.isArray(timesheetOverview) ? timesheetOverview.length : 0
    const timesheetIssues = canUsePontaj
      ? timesheetOverview.filter(item => {
        const status = String(item.status || item.timesheet_status || item.pontaj_status || '').toLowerCase()
        if (!status) return true
        return !['finalizat', 'validat', 'completat', 'ok'].includes(status)
      }).length
      : 0
    const monthValidated = ['validat', 'validated'].includes(String(timesheetLock?.status || timesheetLock?.state || '').toLowerCase())
      || Boolean(timesheetLock?.validated || timesheetLock?.validat || timesheetLock?.validated_at)

    const steps = [
      {
        key: 'employees',
        label: 'Angajați',
        title: activeEmployees.length ? `${activeEmployees.length} angajați activi` : 'Adaugă primul angajat',
        detail: activeEmployees.length ? 'Baza HR există. De aici se leagă pontaj, dosar, Kiosk și salarizare.' : 'Fără angajați activi, restul fluxului HR nu are pe ce lucra.',
        tone: activeEmployees.length ? 'success' : 'warning',
        done: activeEmployees.length > 0,
        actionLabel: activeEmployees.length ? 'Vezi angajații' : '+ Angajat nou',
        action: activeEmployees.length ? goto('Angajați') : () => setEmployeeModal(true),
      },
      {
        key: 'contract',
        label: 'Contract',
        title: employeesWithoutContract || employeesWithoutSalary ? 'Completează contractele active' : 'Contracte și salarii pregătite',
        detail: employeesWithoutContract || employeesWithoutSalary
          ? `${employeesWithoutContract} fără contract detectat · ${employeesWithoutSalary} fără salariu de bază.`
          : 'Datele de contract și baza salarială pot alimenta contabilitatea.',
        tone: employeesWithoutContract || employeesWithoutSalary ? 'warning' : 'success',
        done: activeEmployees.length > 0 && employeesWithoutContract === 0 && employeesWithoutSalary === 0,
        actionLabel: 'Deschide angajați',
        action: goto('Angajați'),
      },
      {
        key: 'timesheet',
        label: 'Pontaj',
        title: monthValidated ? 'Pontaj validat' : monthRows ? 'Pontajul lunii este în lucru' : 'Completează pontajul lunii',
        detail: canUsePontaj
          ? `${monthRows} rânduri pontaj · ${timesheetIssues} departamente/rânduri de verificat.`
          : 'Pontajul este vizibil doar pentru rolurile cu acces la pontaj.',
        tone: !canUsePontaj ? 'neutral' : monthValidated ? 'success' : monthRows ? 'warning' : 'danger',
        done: !canUsePontaj || monthValidated,
        actionLabel: canUsePontaj ? 'Deschide pontaj' : 'Fără acces',
        action: canUsePontaj ? goto('Pontaj') : undefined,
      },
      {
        key: 'leave',
        label: 'Concedii / medicale',
        title: pendingLeaveCount || medicalPending ? 'Închide absențele înainte de salarizare' : 'Absențele nu au blocaje',
        detail: `${pendingLeaveCount} cereri concediu · ${medicalPending} certificate medicale de verificat.`,
        tone: pendingLeaveCount || medicalPending ? 'warning' : 'success',
        done: pendingLeaveCount === 0 && medicalPending === 0,
        actionLabel: 'Vezi concedii',
        action: goto('Concedii'),
      },
      {
        key: 'dossier',
        label: 'Dosar / Kiosk',
        title: dossierIssues || missingKiosk ? 'Completează dosarul și asocierea Kiosk' : 'Dosar și Kiosk în regulă',
        detail: `${dossierIssues} dosare cu lipsuri · ${missingKiosk} angajați fără cont Kiosk asociat.`,
        tone: dossierIssues || missingKiosk ? 'warning' : 'success',
        done: dossierIssues === 0 && missingKiosk === 0,
        actionLabel: dossierIssues ? 'Dosare HR' : 'Asocieri Kiosk',
        action: dossierIssues ? (goto('Documente HR') || goto('Angajați')) : goto('Angajați'),
      },
      {
        key: 'payroll',
        label: 'Salarizare',
        title: monthValidated ? 'Poți exporta/trimite spre salarizare' : 'Salarizarea așteaptă pontajul validat',
        detail: timesheetDepartments ? `${timesheetDepartments} departamente în overview pontaj.` : 'După validare, exportul și contabilitatea preiau luna mai curat.',
        tone: monthValidated ? 'success' : 'neutral',
        done: monthValidated,
        actionLabel: canUsePontaj ? 'Export Nexus' : 'Overview',
        action: canUsePontaj ? () => {
          setNexusExportForm({ luna: filters.luna, dept_id: (!isHRPontaj && isSefPontaj ? ownDepartmentKey : filters.dept_id) || '' })
          setNexusExportModal(true)
        } : goto('Overview pontaje'),
      },
    ]

    const next = steps.find(step => !step.done && step.action) || steps.find(step => step.action) || null
    return {
      steps,
      next,
      doneCount: steps.filter(step => step.done).length,
      totalCount: steps.length,
      tone: next && !next.done ? next.tone : 'success',
    }
  }, [
    canUsePontaj,
    dossierDashboard.rows,
    dossierDashboard.summary,
    employees,
    filters.dept_id,
    filters.luna,
    isHRPontaj,
    isSefPontaj,
    medicalRegister.rows,
    ownDepartmentKey,
    pendingLeaves.length,
    scopedMonthlySheet.length,
    timesheetLock,
    timesheetOverview,
    visibleTabs,
  ])

  const hrAssistant = useMemo(() => {
    const rows = Array.isArray(hrInbox.rows) ? hrInbox.rows : []
    const inboxTotal = Number(hrInbox.summary?.total || rows.length || 0)
    const inboxCritical = Number(hrInbox.summary?.critical || hrInbox.summary?.critice || 0) || rows.filter(row => row.severity === 'critical').length
    const pendingLeaveCount = pendingLeaves.length
    const medicalPending = (medicalRegister.rows || []).filter(item => !['verificat', 'respins', 'respinsa', 'trimis_salarizare'].includes(String(item.status || item.status_verificare || '').toLowerCase())).length
    const alertCount = dashboardAlerts.length + Number(advancedExpirations.summary?.critical || advancedExpirations.summary?.expired || advancedExpirations.summary?.warning || 0)
    const dossierIssues = Number(dossierDashboard.summary?.missing_required || dossierDashboard.summary?.missing_required_count || dossierDashboard.summary?.issues || 0)
      || (dossierDashboard.rows || []).filter(row => Number(row.issue_score || 0) > 0 || Number(row.missing_required_count || 0) > 0).length
    const activeEmployees = employees.filter(employee => employee.activ !== false && employee.activ !== 0)
    const missingKiosk = activeEmployees.filter(employee => !(
      employee.user_id ||
      employee.userId ||
      employee.employee_user_id ||
      employee.associated_user_id ||
      employee.kiosk_user_id ||
      employee.kiosk_username
    )).length
    const timesheetIssues = canUsePontaj
      ? timesheetOverview.filter(item => {
        const status = String(item.status || item.timesheet_status || item.pontaj_status || '').toLowerCase()
        if (!status) return false
        return !['finalizat', 'validat', 'completat', 'ok'].includes(status)
      }).length
      : 0

    const canOpen = tab => visibleTabs.includes(tab)
    const goto = tab => canOpen(tab) ? () => setActiveTab(tab) : undefined
    const openDashboard = () => setActiveTab(visibleTabs.includes('Dashboard HR') ? 'Dashboard HR' : visibleTabs[0] || 'Dashboard HR')

    const cards = [
      { key: 'leave', label: 'Concedii', value: pendingLeaveCount, hint: pendingLeaveCount ? 'cereri în așteptare' : 'fără cereri blocate', tone: pendingLeaveCount ? 'warning' : 'success', action: goto('Concedii') },
      { key: 'medical', label: 'Medicale', value: medicalPending, hint: medicalPending ? 'certificate de verificat' : 'registre curate', tone: medicalPending ? 'warning' : 'success', action: goto('Concedii') },
      { key: 'alerts', label: 'Scadențe', value: alertCount, hint: alertCount ? 'documente de urmărit' : 'nimic critic', tone: alertCount ? 'danger' : 'success', action: goto('Dashboard HR') },
      { key: 'dossier', label: 'Dosar', value: dossierIssues, hint: dossierIssues ? 'lipsuri sau confirmări' : 'dosare în regulă', tone: dossierIssues ? 'warning' : 'success', action: goto('Documente HR') },
      { key: 'kiosk', label: 'Kiosk', value: missingKiosk, hint: missingKiosk ? 'angajați fără cont asociat' : 'conturi asociate', tone: missingKiosk ? 'warning' : 'success', action: goto('Angajați') },
    ]

    const steps = [
      {
        key: 'inbox',
        label: inboxTotal ? `Rezolvă Inbox HR (${inboxTotal})` : 'Inbox HR este curat',
        hint: inboxCritical ? `${inboxCritical} elemente critice au prioritate.` : 'Ține aici documentele și verificările HR care cer acțiune.',
        done: inboxTotal === 0,
        action: goto('Inbox HR'),
      },
      {
        key: 'leaves',
        label: pendingLeaveCount ? `Aprobă/respingi concedii (${pendingLeaveCount})` : 'Concediile nu blochează pontajul',
        hint: 'Concediile aprobate actualizează pontajul și reduc blocajele la salarizare.',
        done: pendingLeaveCount === 0,
        action: goto('Concedii'),
      },
      {
        key: 'dossier',
        label: dossierIssues ? `Completează dosare (${dossierIssues})` : 'Dosarele nu au lipsuri majore',
        hint: 'Contractele, actele și confirmările Kiosk trebuie urmărite înainte de audit sau salarizare.',
        done: dossierIssues === 0,
        action: goto('Documente HR') || goto('Angajați'),
      },
      {
        key: 'timesheet',
        label: timesheetIssues ? `Verifică pontajul (${timesheetIssues})` : 'Pontajul este pregătit pentru verificare',
        hint: canUsePontaj ? 'Pontajul se validează după concedii, recuperări și zile speciale.' : 'Pontajul apare doar pentru rolurile cu acces.',
        done: !canUsePontaj || timesheetIssues === 0,
        action: goto('Pontaj'),
      },
    ]

    const next = steps.find(step => !step.done && step.action)
      || cards.find(card => Number(card.value || 0) > 0 && card.action)
      || null
    const primary = next ? {
      tone: 'warning',
      title: next.label,
      description: next.hint || 'Deschide zona indicată și închide blocajul înainte să continui cu închiderea lunii.',
      label: 'Deschide zona',
      onClick: next.action,
    } : {
      tone: 'success',
      title: 'Nu văd blocaje majore în HR.',
      description: 'Poți continua cu angajați, pontaj, documente sau verificări periodice.',
      label: 'Vezi Dashboard HR',
      onClick: openDashboard,
    }

    return {
      cards,
      steps,
      next,
      primary,
      tone: next ? 'warning' : 'success',
      title: next ? 'HR are câteva lucruri care merită închise întâi.' : 'HR arată bine — poți lucra pe fluxul dorit.',
      summary: next
        ? 'Am prioritizat concediile, dosarele, scadențele, Kiosk-ul și pontajul ca să nu cauți manual blocajele.'
        : 'Nu văd blocaje majore în datele încărcate acum.',
      openDashboard,
    }
  }, [
    advancedExpirations.summary,
    canUsePontaj,
    dashboardAlerts.length,
    dossierDashboard.rows,
    dossierDashboard.summary,
    employees,
    hrInbox.rows,
    hrInbox.summary,
    medicalRegister.rows,
    pendingLeaves.length,
    timesheetOverview,
    visibleTabs,
  ])

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
      {notice ? <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div> : null}

      <Card
        title="Flux simplu HR"
        subtitle="Angajat → contract → pontaj → concedii/medicale → dosar/Kiosk → salarizare."
        actions={<Badge tone={hrSimpleFlow.tone}>{hrSimpleFlow.doneCount}/{hrSimpleFlow.totalCount} pași în regulă</Badge>}
      >
        <div className="grid gap-4">
          <div className={`rounded-2xl border p-4 ${hrSimpleFlow.next?.done ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={hrSimpleFlow.next?.tone || 'success'}>următorul pas</Badge>
                  <div className="font-semibold text-slate-900">{hrSimpleFlow.next?.title || 'Fluxul HR este pregătit.'}</div>
                </div>
                <p className="mt-2 text-sm text-slate-700">{hrSimpleFlow.next?.detail || 'Poți lucra pe orice etapă fără blocaje vizibile.'}</p>
                <p className="mt-1 text-xs text-slate-500">Ideea este simplă: orice concediu, medical sau document HR se așază întâi pe angajat și contract, apoi ajunge corect în pontaj și contabilitate.</p>
              </div>
              {hrSimpleFlow.next?.action ? (
                <Button size="sm" variant={hrSimpleFlow.next.done ? 'secondary' : 'primary'} onClick={hrSimpleFlow.next.action}>
                  {hrSimpleFlow.next.actionLabel || 'Deschide'}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {hrSimpleFlow.steps.map((step, index) => (
              <button
                key={step.key}
                type="button"
                disabled={!step.action}
                onClick={step.action}
                className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-primary-300 hover:bg-primary-50 disabled:cursor-default disabled:opacity-70 disabled:hover:border-slate-200 disabled:hover:bg-white"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${step.done ? 'bg-primary-700 text-white' : 'bg-slate-100 text-slate-600'}`}>{index + 1}</span>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{step.label}</div>
                      <div className="font-semibold text-slate-900">{step.title}</div>
                    </div>
                  </div>
                  <Badge tone={step.tone}>{step.done ? 'ok' : 'de lucrat'}</Badge>
                </div>
                <p className="mt-3 text-sm text-slate-600">{step.detail}</p>
                <div className="mt-3 text-xs font-semibold text-primary-700">{step.actionLabel}</div>
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card
        title="Asistent HR"
        subtitle="Ține la vedere concediile, pontajul, dosarele, scadențele și asocierea cu Kiosk."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={hrAssistant.tone}>{hrAssistant.tone === 'warning' ? 'atenție' : 'sub control'}</Badge>
            <Button size="sm" variant="secondary" onClick={() => setHrAssistantExpanded(value => !value)}>
              {hrAssistantExpanded ? 'Ascunde detalii' : 'Vezi detalii'}
            </Button>
          </div>
        }
      >
        <div className="grid gap-3">
          <div className={`rounded-2xl border p-4 ${hrAssistant.tone === 'warning' ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={hrAssistant.primary.tone}>următorul pas</Badge>
                  <div className="font-semibold text-slate-900">{hrAssistant.primary.title}</div>
                </div>
                <p className="mt-2 text-sm text-slate-700">{hrAssistant.primary.description}</p>
                <p className="mt-1 text-xs text-slate-500">{hrAssistant.summary}</p>
              </div>
              <Button size="sm" variant={hrAssistant.primary.tone === 'warning' ? 'primary' : 'secondary'} onClick={hrAssistant.primary.onClick}>
                {hrAssistant.primary.label}
              </Button>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {hrAssistant.cards.map(item => (
              <button
                key={item.key}
                type="button"
                disabled={!item.action}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-primary-300 hover:bg-primary-50 disabled:cursor-default disabled:opacity-70 disabled:hover:border-slate-200 disabled:hover:bg-white"
                onClick={item.action}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase text-slate-500">{item.label}</span>
                  <Badge tone={item.tone}>{item.value}</Badge>
                </div>
                <div className="mt-1 text-xs text-slate-500">{item.hint}</div>
              </button>
            ))}
          </div>

          {hrAssistantExpanded ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="grid gap-2">
                {hrAssistant.steps.map(step => (
                  <button
                    key={step.key}
                    type="button"
                    disabled={!step.action}
                    onClick={step.action}
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${step.done ? 'border-primary-100 bg-primary-50 text-primary-800' : 'border-slate-200 bg-white text-slate-700'} hover:border-primary-200 hover:bg-white disabled:cursor-default disabled:opacity-70`}
                  >
                    <span className="mt-0.5">{step.done ? '✓' : '○'}</span>
                    <span>
                      <span className="block font-medium">{step.label}</span>
                      <span className="block text-xs text-slate-500">{step.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">De reținut</div>
                <ul className="grid gap-2 text-sm text-slate-700">
                  <li>Aprobă concediile înainte de validarea pontajului.</li>
                  <li>Dosarul HR operațional nu este același lucru cu un PDF încărcat; contractul activ trebuie să existe în tabul Contracte.</li>
                  <li>Contul ERP/Kiosk asociat angajatului activează cererile, documentele și confirmările din Kiosk.</li>
                </ul>
              </div>
            </div>
          ) : null}
        </div>
      </Card>

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
          countryRules={countryRules}
          laborRegistryHistory={laborRegistryHistory}
          canExportLaborRegistry={hasPermission('hr:reges_export')}
          onExportLaborRegistry={downloadLaborWorkRegister}
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
        <HRDocumentsPanel
          employees={employees}
          filteredEmployees={filteredEmployees}
          dossierDashboard={dossierDashboard}
          dossierDashboardRows={dossierDashboardRows}
          dossierDashboardFilter={dossierDashboardFilter}
          dossierReminderResult={dossierReminderResult}
          dossierChecklist={dossierChecklist}
          hrDocumentTemplates={hrDocumentTemplates}
          templateWordUploading={templateWordUploading}
          canManageTemplates={hasPermission('hr:manage')}
          onDownloadDossierReport={downloadDossierReport}
          onLoadDossierDashboard={loadDossierDashboard}
          onLoadDossierChecklist={loadDossierChecklist}
          onLoadHrDocumentTemplates={loadHrDocumentTemplates}
          onDossierDashboardFilterChange={setDossierDashboardFilter}
          onOpenEmployee={openEmployee}
          onSendDossierReminder={sendDossierReminder}
          onDownloadTemplateWordFile={downloadTemplateWordFile}
          onOpenTemplateWordTest={openTemplateWordTest}
          onChooseTemplateWordFile={chooseTemplateWordFile}
          onStartTemplateEditing={startTemplateEditing}
          onError={setError}
          printAdeverinta={printAdeverinta}
          printActAditional={printActAditional}
          printCerereAngajare={printCerereAngajare}
          printCerereConc={printCerereConc}
          printCIM={printCIM}
          printDecizieConc={printDecizieConc}
          printDeclDeduceri={printDeclDeduceri}
          printDeclFunctieBaza={printDeclFunctieBaza}
          printFisaPost={printFisaPost}
          printNotaGDPR={printNotaGDPR}
          printNotaLichidare={printNotaLichidare}
          printNotificarePrv={printNotificarePrv}
        />
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

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.title}
        message={confirmAction?.message}
        details={confirmAction?.details}
        confirmLabel={confirmAction?.confirmLabel}
        cancelLabel={confirmAction?.cancelLabel}
        tone={confirmAction?.tone}
        loading={confirmLoading}
        reasonLabel={confirmAction?.reasonLabel}
        reasonDefault={confirmAction?.reasonDefault}
        reasonPlaceholder={confirmAction?.reasonPlaceholder}
        reasonRequired={confirmAction?.reasonRequired}
        minReasonLength={confirmAction?.minReasonLength}
        onConfirm={runConfirmAction}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  )
}

