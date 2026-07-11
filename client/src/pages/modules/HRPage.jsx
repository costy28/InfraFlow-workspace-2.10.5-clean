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
  { id: 'Inbox HR',           perm: 'hr:view' },
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

const emptyContractForm = {
  tip: 'CIM',
  numar_contract: '',
  data_contract: '',
  data_start: '',
  data_sfarsit: '',
  norma_ore: 8,
  salariu_baza: '',
  cost_ora: '',
  status: 'activ',
  observatii: ''
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

function MedicalRegisterCard({ month, register, onExport, onPayroll }) {
  const totals = register?.totals || {}
  const rows = register?.rows || []
  return <Card><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><div className="font-semibold">Registru concedii medicale · {month}</div><div className="text-xs text-slate-500">Calcul propus; baza zilnica se confirma din media ultimelor 6 luni.</div></div><Button size="sm" variant="secondary" onClick={onExport}>📊 Export Excel</Button></div><div className="mb-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">{[['Certificate', totals.certificates || 0], ['Zile calendaristice', totals.calendar_days || 0], ['Zile lucratoare', totals.workdays || 0], ['Angajator', totals.employer_days || 0], ['FNUASS', totals.fund_days || 0], ['Neindemnizate', totals.unpaid_days || 0]].map(([label, value]) => <div key={label} className="rounded border border-slate-200 p-2 text-sm"><div className="text-xs text-slate-500">{label}</div><strong>{value}</strong></div>)}</div><div className="overflow-auto"><table className="min-w-full text-sm"><thead><tr className="border-b text-left text-xs text-slate-500"><th className="p-2">Angajat</th><th className="p-2">Certificat</th><th className="p-2">Perioada</th><th className="p-2">Cod / %</th><th className="p-2">Zile</th><th className="p-2">Sume</th><th className="p-2">Stare</th><th className="p-2">Actiuni</th></tr></thead><tbody>{rows.map(row => <tr key={row.uuid} className="border-b border-slate-100"><td className="p-2">{row.nume} {row.prenume}</td><td className="p-2">{row.serie}/{row.numar}<div className="text-xs text-slate-400">{row.tip_certificat}</div></td><td className="p-2">{String(row.data_start).slice(0, 10)} — {String(row.data_sfarsit).slice(0, 10)}<div className="text-xs text-slate-400">episod {row.episode_days} zile</div></td><td className="p-2">{row.cod_indemnizatie} / {row.indemnity_percent}%</td><td className="p-2">{row.workdays} lucr.<div className="text-xs text-slate-400">A:{row.employer_days} · F:{row.fund_days} · N:{row.unpaid_days}</div></td><td className="p-2">{row.calculation_status === 'calculat' ? `${Number(row.total_amount).toFixed(2)} lei` : 'Baza lipsa'}<div className="text-xs text-slate-400">A:{Number(row.employer_amount).toFixed(2)} · F:{Number(row.fund_amount).toFixed(2)}</div></td><td className="p-2"><Badge tone={row.status_verificare === 'verificat' ? 'success' : 'warning'}>{row.status_verificare}</Badge>{row.payroll_synced_at ? <div className="mt-1 text-xs text-emerald-700">Trimis salarizare</div> : null}</td><td className="p-2">{row.status_verificare === 'verificat' && !row.payroll_synced_at ? <Button size="sm" onClick={() => onPayroll(row)}>Trimite salarizare</Button> : null}</td></tr>)}{!rows.length ? <tr><td colSpan="8" className="p-6 text-center text-slate-400">Nu exista certificate in luna selectata.</td></tr> : null}</tbody></table></div></Card>
}

function EmployeeFilesPanel({ employeeId, canManage, onError, suggestedUpload = null, onSuggestionUsed = () => {} }) {
  const [items, setItems] = useState([])
  const [file, setFile] = useState(null)
  const [type, setType] = useState('contract')
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const fileTypes = [
    {value:'contract',label:'Contract'},
    {value:'act_aditional',label:'Act aditional'},
    {value:'identitate',label:'Act identitate'},
    {value:'fisa_post',label:'Fisa postului'},
    {value:'ssm',label:'SSM / PSI'},
    {value:'medical',label:'Medical'},
    {value:'diploma',label:'Diploma'},
    {value:'gdpr',label:'GDPR'},
    {value:'altul',label:'Altul'}
  ]
  async function loadFiles() {
    try { const response = await api.get(`/hr/employees/${employeeId}/files`); setItems(response.data?.items || []) } catch (error) { onError(error.response?.data?.error || 'Dosarul electronic nu a putut fi incarcat.') }
  }
  useEffect(() => { if (employeeId) loadFiles() }, [employeeId])
  useEffect(() => {
    if (!suggestedUpload?.type) return
    setType(suggestedUpload.type)
  }, [suggestedUpload?.type])
  useEffect(() => {
    function onGeneratedFile(event) {
      if (!employeeId || String(event.detail?.employeeId) !== String(employeeId)) return
      loadFiles()
    }
    window.addEventListener('hr-files-refresh', onGeneratedFile)
    return () => window.removeEventListener('hr-files-refresh', onGeneratedFile)
  }, [employeeId])
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
  async function previewFile(item) {
    try {
      const response = await api.get(`/hr/employees/${employeeId}/files/${item.id}/download`, { responseType: 'blob' })
      const mimeType = item.mime_type || response.data?.type || 'text/html'
      const blob = response.data?.type ? response.data : new Blob([response.data], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const opened = window.open(url, '_blank', 'noopener,noreferrer')
      if (!opened) {
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.target = '_blank'
        anchor.rel = 'noopener noreferrer'
        anchor.click()
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (error) { onError(error.response?.data?.error || 'Documentul nu a putut fi previzualizat.') }
  }
  async function saveFileMeta(event) {
    event.preventDefault()
    try {
      await api.patch(`/hr/employees/${employeeId}/files/${editing.id}`, editing)
      setEditing(null)
      await loadFiles()
    } catch (error) { onError(error.response?.data?.error || 'Documentul nu a putut fi actualizat.') }
  }
  async function cancelFile(item) {
    const motiv = window.prompt('Motiv anulare document:', 'Inlocuit / incarcat gresit')
    if (!motiv) return
    try {
      await api.delete(`/hr/employees/${employeeId}/files/${item.id}`, { data: { motiv } })
      await loadFiles()
    } catch (error) { onError(error.response?.data?.error || 'Documentul nu a putut fi anulat.') }
  }
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold">Dosar electronic</div>
          <div className="text-xs text-slate-500">Fișierele reale: CIM scanat/PDF, acte adiționale, diplome, medicale.</div>
        </div>
        <Button size="sm" variant="secondary" onClick={loadFiles}>Reincarca</Button>
      </div>
      {canManage ? (
        <>
          {suggestedUpload ? (
            <div className="mb-3 rounded border border-primary-200 bg-primary-50 px-3 py-2 text-sm text-primary-800">
              <div className="font-semibold">Rezolvare ghidată din Inbox HR</div>
              <div className="text-xs">{suggestedUpload.title || 'Încarcă documentul cerut'}{suggestedUpload.detail ? ` · ${suggestedUpload.detail}` : ''}</div>
            </div>
          ) : null}
          <div className="mb-3 grid gap-2 sm:grid-cols-[180px_1fr_auto]">
            <Select value={type} onChange={event => setType(event.target.value)} options={fileTypes} />
            <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx" onChange={event => setFile(event.target.files?.[0] || null)} />
            <Button onClick={async () => { await uploadFile(); onSuggestionUsed() }} disabled={!file || busy}>{busy ? 'Se incarca...' : 'Incarca'}</Button>
          </div>
        </>
      ) : null}
      <div className="grid gap-2">
        {items.map(item => (
          <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-100 px-3 py-2 text-sm">
            <div>
              <strong>{item.denumire}</strong>
              <div className="text-xs text-slate-500">{item.tip}{item.generated ? ' · generat electronic' : ' · incarcat'}{item.requires_ack ? ' · cere confirmare Kiosk' : ''}{item.acknowledged_at ? ` · confirmat ${String(item.acknowledged_at).slice(0, 10)}` : ''} · {Math.ceil(Number(item.file_size || 0) / 1024)} KB · {item.data_document || item.created_at?.slice?.(0, 10) || '-'}</div>
            </div>
            <div className="flex gap-2">
              {canManage ? <Button size="sm" variant="secondary" onClick={() => setEditing({ ...item })}>Editeaza</Button> : null}
              {item.generated || item.mime_type === 'text/html' ? <Button size="sm" variant="secondary" onClick={() => previewFile(item)}>Deschide</Button> : null}
              <Button size="sm" variant="secondary" onClick={() => downloadFile(item)}>Descarca</Button>
              {canManage ? <Button size="sm" variant="secondary" onClick={() => cancelFile(item)}>Anuleaza</Button> : null}
            </div>
          </div>
        ))}
        {!items.length ? <div className="text-sm text-slate-500">Nu exista documente incarcate.</div> : null}
      </div>
      <Modal open={Boolean(editing)} title="Editeaza document dosar" onClose={() => setEditing(null)} size="md">
        <form className="grid gap-3" onSubmit={saveFileMeta}>
          <Input label="Denumire" value={editing?.denumire || ''} onChange={event => setEditing(current => ({ ...current, denumire: event.target.value }))} required />
          <Select label="Tip document" value={editing?.tip || 'altul'} onChange={event => setEditing(current => ({ ...current, tip: event.target.value }))} options={fileTypes} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Data document" type="date" value={editing?.data_document || ''} onChange={event => setEditing(current => ({ ...current, data_document: event.target.value }))} />
            <Input label="Expira la" type="date" value={editing?.data_expirare || ''} onChange={event => setEditing(current => ({ ...current, data_expirare: event.target.value }))} />
          </div>
          <label className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <input type="checkbox" checked={Boolean(editing?.requires_ack)} onChange={event => setEditing(current => ({ ...current, requires_ack: event.target.checked, kiosk_visible: event.target.checked || current.kiosk_visible }))} />
            Necesită confirmare în Kiosk / luare la cunoștință
          </label>
          {editing?.acknowledged_at ? <div className="rounded bg-emerald-50 px-3 py-2 text-xs text-emerald-800">Confirmat de {editing.acknowledged_by_name || 'angajat'} la {String(editing.acknowledged_at).replace('T', ' ').slice(0, 16)}.</div> : null}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEditing(null)}>Renunta</Button><Button type="submit">Salveaza</Button></div>
        </form>
      </Modal>
    </div>
  )
}

function EmployeeContractsPanel({ employeeId, contracts, amendments, departments, canManage, onReload, onError, onPrintContract, onPrintAmendment, onGenerateContractWord, onGenerateAmendmentWord, onArchiveContractWord, onArchiveAmendmentWord, documentTemplates = [] }) {
  const [editing, setEditing] = useState(null)
  const [amendment, setAmendment] = useState(null)
  const hasCimWordTemplate = documentTemplates.some(item => item.id === 'cim' && item.word_template_file)
  const hasActWordTemplate = documentTemplates.some(item => item.id === 'act_aditional' && item.word_template_file)
  function openNew() {
    setEditing({ ...emptyContractForm, data_contract: new Date().toISOString().slice(0, 10), data_start: new Date().toISOString().slice(0, 10) })
  }
  function openEdit(contract) {
    const validType = ['CIM', 'PFA', 'zilier', 'detasat'].includes(contract.tip) ? contract.tip : 'CIM'
    setEditing({
      ...emptyContractForm,
      ...contract,
      tip: validType,
      data_contract: String(contract.data_contract || '').slice(0, 10),
      data_start: String(contract.data_start || contract.data_incepere || '').slice(0, 10),
      data_sfarsit: String(contract.data_sfarsit || contract.data_end || '').slice(0, 10),
      norma_ore: contract.norma_ore || 8,
      status: contract.status || 'activ'
    })
  }
  function openAmendment(contract, type = 'salariu') {
    setAmendment({
      contract_id: contract.id,
      contract_number: contract.numar_contract || `Contract #${contract.id}`,
      tip: type,
      numar_act: '',
      data_act: new Date().toISOString().slice(0, 10),
      data_efect: new Date().toISOString().slice(0, 10),
      salariu_baza: contract.salariu_baza || '',
      norma_ore: contract.norma_ore || 8,
      functia: '',
      functie_cor: '',
      department_id: '',
      status_contract: '',
      observatii: ''
    })
  }
  async function saveContract(event) {
    event.preventDefault()
    try {
      const body = { ...editing, norma_ore: Number(editing.norma_ore || 8), salariu_baza: editing.salariu_baza === '' ? '' : Number(editing.salariu_baza), cost_ora: editing.cost_ora === '' ? '' : Number(editing.cost_ora) }
      if (editing.id) await api.patch(`/hr/employees/${employeeId}/contracts/${editing.id}`, body)
      else await api.post(`/hr/employees/${employeeId}/contracts`, body)
      setEditing(null)
      await onReload()
    } catch (error) { onError(error.response?.data?.error || 'Contractul nu a putut fi salvat.') }
  }
  async function saveAmendment(event) {
    event.preventDefault()
    try {
      const body = { ...amendment }
      if (!['salariu'].includes(body.tip)) body.salariu_baza = ''
      if (!['norma'].includes(body.tip)) body.norma_ore = ''
      if (!['functie'].includes(body.tip)) { body.functia = ''; body.functie_cor = '' }
      if (body.tip !== 'departament') body.department_id = ''
      if (body.tip === 'suspendare') body.status_contract = 'suspendat'
      if (body.tip === 'incetare') body.status_contract = 'incetat'
      if (!['suspendare', 'incetare'].includes(body.tip) && !body.status_contract) body.status_contract = ''
      await api.post(`/hr/employees/${employeeId}/contracts/${amendment.contract_id}/amendments`, body)
      setAmendment(null)
      await onReload()
    } catch (error) { onError(error.response?.data?.error || 'Actul aditional nu a putut fi salvat.') }
  }
  const active = contracts.filter(item => String(item.status || 'activ') !== 'incetat')
  const byContract = (contractId) => amendments.filter(item => String(item.contract_id) === String(contractId))
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold">Contracte salarizare</div>
          <div className="text-xs text-slate-500">Datele operative folosite de pontaj, salarizare si D112. Separat de PDF-ul CIM din dosar.</div>
        </div>
        {canManage ? <Button size="sm" onClick={openNew}>+ Contract nou</Button> : null}
      </div>
      <div className="grid gap-2">
        {contracts.map(contract => (
          <div key={contract.id} className={`rounded border px-3 py-2 text-sm ${String(contract.status || 'activ') === 'incetat' ? 'border-slate-100 bg-slate-50 text-slate-500' : 'border-primary-100 bg-primary-50/40'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><strong>{contract.numar_contract || `Contract #${contract.id}`}</strong> · {contract.tip || 'CIM'} · <Badge tone={String(contract.status || 'activ') === 'activ' ? 'success' : 'warning'}>{contract.status || 'activ'}</Badge></div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => onPrintContract?.(contract)}>Genereaza</Button>
                {hasCimWordTemplate ? <Button size="sm" variant="secondary" onClick={() => onGenerateContractWord?.(contract)}>Word</Button> : null}
                {hasCimWordTemplate ? <Button size="sm" variant="secondary" onClick={() => onArchiveContractWord?.(contract)}>Arhivează Word</Button> : null}
                {canManage ? <><Button size="sm" variant="secondary" onClick={() => openAmendment(contract)}>Act aditional</Button><Button size="sm" variant="secondary" onClick={() => openEdit(contract)}>Editeaza</Button></> : null}
              </div>
            </div>
            <div className="mt-1 grid gap-1 text-xs text-slate-600 sm:grid-cols-4">
              <div>Data contract: {String(contract.data_contract || '').slice(0, 10) || '-'}</div>
              <div>Start: {String(contract.data_start || contract.data_incepere || '').slice(0, 10) || '-'}</div>
              <div>Norma: {contract.norma_ore || 8} ore/zi</div>
              <div>Salariu: {contract.salariu_baza ? `${Number(contract.salariu_baza).toLocaleString('ro-RO')} RON` : '-'}</div>
            </div>
            {byContract(contract.id).length ? <div className="mt-2 rounded bg-white/70 p-2 text-xs"><div className="mb-1 font-semibold text-slate-600">Istoric acte adiționale</div>{byContract(contract.id).map(item => <div key={item.id || item.uuid} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 py-1"><span>{item.numar_act || `Act #${item.id}`} · {item.tip} · efect {String(item.data_efect || '').slice(0, 10)}</span><span className="text-slate-500">{item.salariu_baza ? `salariu ${Number(item.salariu_baza).toLocaleString('ro-RO')} RON` : ''}{item.norma_ore ? ` norma ${item.norma_ore}h` : ''}{item.functia ? ` ${item.functia}` : ''}{item.status_contract ? ` ${item.status_contract}` : ''}</span><div className="flex gap-1"><Button size="sm" variant="secondary" onClick={() => onPrintAmendment?.(item, contract)}>Genereaza act</Button>{hasActWordTemplate ? <Button size="sm" variant="secondary" onClick={() => onGenerateAmendmentWord?.(item, contract)}>Word</Button> : null}{hasActWordTemplate ? <Button size="sm" variant="secondary" onClick={() => onArchiveAmendmentWord?.(item, contract)}>Arhivează</Button> : null}</div></div>)}</div> : null}
          </div>
        ))}
        {!contracts.length ? <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Nu exista contract operational. Incarcarea PDF-ului in dosar nu creeaza automat contract salarial.</div> : null}
        {contracts.length && !active.length ? <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Exista contracte, dar niciunul nu este activ pentru salarizare.</div> : null}
      </div>
      <Modal open={Boolean(editing)} title={editing?.id ? 'Editeaza contract salarial' : 'Contract salarial nou'} onClose={() => setEditing(null)} size="md">
        <form className="grid gap-3" onSubmit={saveContract}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Numar contract" value={editing?.numar_contract || ''} onChange={event => setEditing(current => ({ ...current, numar_contract: event.target.value }))} placeholder="se genereaza la contract nou" />
            <Select label="Tip" value={editing?.tip || 'CIM'} onChange={event => setEditing(current => ({ ...current, tip: event.target.value }))} options={[{ value: 'CIM', label: 'CIM' }, { value: 'PFA', label: 'PFA' }, { value: 'zilier', label: 'Zilier' }, { value: 'detasat', label: 'Detasat' }]} />
            <Input label="Data contract" type="date" value={editing?.data_contract || ''} onChange={event => setEditing(current => ({ ...current, data_contract: event.target.value }))} />
            <Input label="Data inceperii activitatii" type="date" value={editing?.data_start || ''} onChange={event => setEditing(current => ({ ...current, data_start: event.target.value }))} required />
            <Input label="Data sfarsit" type="date" value={editing?.data_sfarsit || ''} onChange={event => setEditing(current => ({ ...current, data_sfarsit: event.target.value }))} />
            <Select label="Status" value={editing?.status || 'activ'} onChange={event => setEditing(current => ({ ...current, status: event.target.value }))} options={[{ value: 'activ', label: 'Activ' }, { value: 'suspendat', label: 'Suspendat' }, { value: 'incetat', label: 'Incetat' }]} />
            <Input label="Norma ore/zi" type="number" step="0.01" value={editing?.norma_ore || ''} onChange={event => setEditing(current => ({ ...current, norma_ore: event.target.value }))} required />
            <Input label="Salariu baza brut" type="number" step="0.01" value={editing?.salariu_baza || ''} onChange={event => setEditing(current => ({ ...current, salariu_baza: event.target.value }))} />
            <Input label="Cost ora" type="number" step="0.01" value={editing?.cost_ora || ''} onChange={event => setEditing(current => ({ ...current, cost_ora: event.target.value }))} />
          </div>
          <Input label="Observatii" value={editing?.observatii || ''} onChange={event => setEditing(current => ({ ...current, observatii: event.target.value }))} />
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEditing(null)}>Renunta</Button><Button type="submit">Salveaza contract</Button></div>
        </form>
      </Modal>
      <Modal open={Boolean(amendment)} title={`Act aditional - ${amendment?.contract_number || ''}`} onClose={() => setAmendment(null)} size="md">
        <form className="grid gap-3" onSubmit={saveAmendment}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Tip act" value={amendment?.tip || 'salariu'} onChange={event => setAmendment(current => ({ ...current, tip: event.target.value }))} options={[
              { value: 'salariu', label: 'Modificare salariu' },
              { value: 'functie', label: 'Modificare functie' },
              { value: 'norma', label: 'Modificare norma' },
              { value: 'departament', label: 'Schimbare departament' },
              { value: 'suspendare', label: 'Suspendare' },
              { value: 'incetare', label: 'Incetare' },
              { value: 'altul', label: 'Alt act' }
            ]} />
            <Input label="Numar act" value={amendment?.numar_act || ''} onChange={event => setAmendment(current => ({ ...current, numar_act: event.target.value }))} placeholder="AA-2026-001" />
            <Input label="Data actului" type="date" value={amendment?.data_act || ''} onChange={event => setAmendment(current => ({ ...current, data_act: event.target.value }))} />
            <Input label="Data efect" type="date" value={amendment?.data_efect || ''} onChange={event => setAmendment(current => ({ ...current, data_efect: event.target.value }))} required />
          </div>
          {amendment?.tip === 'salariu' ? <Input label="Salariu baza brut nou" type="number" step="0.01" value={amendment?.salariu_baza || ''} onChange={event => setAmendment(current => ({ ...current, salariu_baza: event.target.value }))} required /> : null}
          {amendment?.tip === 'norma' ? <Input label="Norma noua ore/zi" type="number" step="0.01" value={amendment?.norma_ore || ''} onChange={event => setAmendment(current => ({ ...current, norma_ore: event.target.value }))} required /> : null}
          {amendment?.tip === 'functie' ? <div className="grid gap-3 sm:grid-cols-2"><Input label="Functie noua" value={amendment?.functia || ''} onChange={event => setAmendment(current => ({ ...current, functia: event.target.value }))} required /><Input label="Cod COR nou" value={amendment?.functie_cor || ''} onChange={event => setAmendment(current => ({ ...current, functie_cor: event.target.value }))} /></div> : null}
          {amendment?.tip === 'departament' ? <Select label="Departament nou" value={amendment?.department_id || ''} onChange={event => setAmendment(current => ({ ...current, department_id: event.target.value }))} options={[{ value: '', label: 'Alege departament' }, ...departments]} required /> : null}
          {['suspendare', 'incetare'].includes(amendment?.tip) ? <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{amendment.tip === 'incetare' ? 'Contractul va fi marcat incetat, iar angajatul inactiv de la data efectului.' : 'Contractul va fi marcat suspendat.'}</div> : null}
          <Input label="Observatii / temei" value={amendment?.observatii || ''} onChange={event => setAmendment(current => ({ ...current, observatii: event.target.value }))} />
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setAmendment(null)}>Renunta</Button><Button type="submit">Salveaza si aplica</Button></div>
        </form>
      </Modal>
    </div>
  )
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
              {tab === 'Inbox HR' && Number(hrInbox.summary?.total || 0) > 0 ? ` (${hrInbox.summary.total})` : ''}
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

          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-800">📈 Raport management HR</div>
                <div className="text-xs text-slate-500">Sinteză pentru conducere: activitate, dosare, scadențe, concedii și sarcini deschise.</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Input type="date" value={hrManagementPeriod.from} onChange={event => setHrManagementPeriod(current => ({ ...current, from: event.target.value }))} />
                <Input type="date" value={hrManagementPeriod.to} onChange={event => setHrManagementPeriod(current => ({ ...current, to: event.target.value }))} />
                <Button size="sm" variant="secondary" onClick={loadHrManagementReport}>Recalculează</Button>
                <Button size="sm" onClick={downloadHrManagementReport}>📊 Export Excel</Button>
                <Button size="sm" onClick={generateHrNotifications}>🔔 Generează notificări HR</Button>
              </div>
            </div>
            {hrNotificationResult ? (
              <div className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                Notificări HR create: <strong>{hrNotificationResult.created || 0}</strong>
                {' '}· deja existente: <strong>{hrNotificationResult.skipped || 0}</strong>
                {' '}· sarcini acoperite: <strong>{hrNotificationResult.tasks || 0}</strong>
                {' '}· destinatari: <strong>{hrNotificationResult.targets || 0}</strong>
              </div>
            ) : null}
            {hrManagementReport ? (
              <div className="grid gap-4">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                  {[
                    ['Sarcini Inbox', hrManagementReport.kpi?.inbox_total || 0, 'slate'],
                    ['Critice', hrManagementReport.kpi?.inbox_critical || 0, 'rose'],
                    ['Dosare complete', hrManagementReport.kpi?.dossier_complete || 0, 'emerald'],
                    ['Lipsuri dosar', hrManagementReport.kpi?.dossier_missing_required || 0, 'amber'],
                    ['Scadențe ≤30 zile', hrManagementReport.kpi?.expiring_30 || 0, 'red'],
                    ['Activități HR', hrManagementReport.kpi?.activity_total || 0, 'blue'],
                  ].map(([label, value, tone]) => (
                    <div key={label} className={`rounded border p-2 text-sm ${tone === 'rose' ? 'border-rose-200 bg-rose-50' : tone === 'emerald' ? 'border-emerald-200 bg-emerald-50' : tone === 'amber' ? 'border-amber-200 bg-amber-50' : tone === 'red' ? 'border-red-200 bg-red-50' : tone === 'blue' ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}>
                      <div className="text-xs text-slate-500">{label}</div>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
                <div className="grid gap-3 lg:grid-cols-3">
                  <div className="rounded border border-slate-200 p-3">
                    <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Activitate pe categorii</div>
                    {Object.entries(hrManagementReport.activity_by_category || {}).slice(0, 8).map(([label, count]) => (
                      <div key={label} className="flex justify-between border-b border-slate-100 py-1 text-sm"><span>{label}</span><strong>{count}</strong></div>
                    ))}
                    {!Object.keys(hrManagementReport.activity_by_category || {}).length ? <div className="text-sm text-slate-400">Fără activitate în perioadă.</div> : null}
                  </div>
                  <div className="rounded border border-slate-200 p-3">
                    <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Top lipsuri dosar</div>
                    {(hrManagementReport.top_missing || []).slice(0, 8).map(item => (
                      <div key={item.label} className="flex justify-between border-b border-slate-100 py-1 text-sm"><span>{item.label}</span><strong>{item.count}</strong></div>
                    ))}
                    {!(hrManagementReport.top_missing || []).length ? <div className="text-sm text-emerald-600">Nu sunt lipsuri obligatorii.</div> : null}
                  </div>
                  <div className="rounded border border-slate-200 p-3">
                    <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Activitate pe utilizator HR</div>
                    {(hrManagementReport.activity_by_user || []).slice(0, 8).map(item => (
                      <div key={item.user_name} className="flex justify-between border-b border-slate-100 py-1 text-sm"><span>{item.user_name || 'Sistem'}</span><strong>{item.count}</strong></div>
                    ))}
                    {!(hrManagementReport.activity_by_user || []).length ? <div className="text-sm text-slate-400">Fără activitate în perioadă.</div> : null}
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-5">
                  <div className="rounded border border-slate-200 p-2 text-sm"><div className="text-xs text-slate-500">Concedii create</div><strong>{hrManagementReport.kpi?.leaves_created || 0}</strong></div>
                  <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm"><div className="text-xs text-emerald-700">Concedii aprobate</div><strong>{hrManagementReport.kpi?.leaves_approved || 0}</strong></div>
                  <div className="rounded border border-rose-200 bg-rose-50 p-2 text-sm"><div className="text-xs text-rose-700">Concedii respinse</div><strong>{hrManagementReport.kpi?.leaves_rejected || 0}</strong></div>
                  <div className="rounded border border-blue-200 bg-blue-50 p-2 text-sm"><div className="text-xs text-blue-700">CM depuse</div><strong>{hrManagementReport.kpi?.medical_submitted || 0}</strong></div>
                  <div className="rounded border border-primary-200 bg-primary-50 p-2 text-sm"><div className="text-xs text-primary-700">CM verificate</div><strong>{hrManagementReport.kpi?.medical_verified || 0}</strong></div>
                </div>
              </div>
            ) : <div className="text-sm text-slate-400">Raportul de management HR nu este încărcat.</div>}
          </Card>

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
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-700">🔔 Scadențe HR avansate ({advancedExpirations.rows?.length || dashboardAlerts.length})</div>
                <div className="text-xs text-slate-500">CI, apt medical, autorizații, contracte determinate, suspendări și documente din dosar.</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={loadAdvancedExpirations}>Reîncarcă scadențe</Button>
                <Button size="sm" onClick={notifyAdvancedExpirations}>🔔 Notifică HR critic</Button>
              </div>
            </div>
            {expirationNoticeResult ? (
              <div className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                Notificări generate: <strong>{expirationNoticeResult.created || 0}</strong>
                {' '}· deja existente: <strong>{expirationNoticeResult.skipped || 0}</strong>
                {' '}· scadențe critice: <strong>{expirationNoticeResult.rows || 0}</strong>
                {' '}· destinatari: <strong>{expirationNoticeResult.targets || 0}</strong>
              </div>
            ) : null}
            <div className="mb-3 grid gap-2 sm:grid-cols-4">
              <div className="rounded border border-rose-200 bg-rose-50 p-2 text-sm"><div className="text-xs text-rose-700">Expirate</div><strong>{advancedExpirations.summary?.expired || 0}</strong></div>
              <div className="rounded border border-red-200 bg-red-50 p-2 text-sm"><div className="text-xs text-red-700">≤ 30 zile</div><strong>{advancedExpirations.summary?.critical || 0}</strong></div>
              <div className="rounded border border-amber-200 bg-amber-50 p-2 text-sm"><div className="text-xs text-amber-700">31–60 zile</div><strong>{advancedExpirations.summary?.warning || 0}</strong></div>
              <div className="rounded border border-blue-200 bg-blue-50 p-2 text-sm"><div className="text-xs text-blue-700">61–90 zile</div><strong>{advancedExpirations.summary?.info || 0}</strong></div>
            </div>
            {(advancedExpirations.rows || []).length === 0 && dashboardAlerts.length === 0 ? (
              <p className="text-sm text-slate-400">Nu există expirări iminente. Toate documentele sunt la zi.</p>
            ) : (
              <div className="grid gap-2">
                {(advancedExpirations.rows || []).length ? (advancedExpirations.rows || []).slice(0, 20).map(item => (
                  <div key={item.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${item.severity === 'expired' ? 'border-rose-200 bg-rose-50' : item.severity === 'critical' ? 'border-red-200 bg-red-50' : item.severity === 'warning' ? 'border-amber-200 bg-amber-50' : 'border-blue-200 bg-blue-50'}`}>
                    <div>
                      <div className="font-medium text-slate-800">{item.icon} {item.employee_name} — {item.label}</div>
                      <div className="text-xs text-slate-500">{item.source} · {item.functia || '-'} · marca {item.marca || '-'}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{item.date}</div>
                      <div className={`text-xs ${item.days < 0 ? 'text-rose-700' : item.days <= 30 ? 'text-red-700' : item.days <= 60 ? 'text-amber-700' : 'text-blue-700'}`}>{item.days < 0 ? `expirat de ${Math.abs(item.days)} zile` : `${item.days} zile rămase`}</div>
                      <Button size="sm" variant="secondary" className="mt-1" onClick={() => openExpirationEmployee(item)}>Deschide fișa</Button>
                    </div>
                  </div>
                )) : dashboardAlerts.map(a => (
                  <AlertRow key={a.key} label={a.label} date={a.date} icon={a.icon} />
                ))}
              </div>
            )}
          </Card>

          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-700">📬 Istoric notificări scadențe HR</div>
                <div className="text-xs text-slate-500">Notificări generate pentru scadențele expirate sau critice, cu status de rezolvare.</div>
              </div>
              <Button size="sm" variant="secondary" onClick={loadExpirationNotifications}>Reîncarcă istoric</Button>
            </div>
            <div className="mb-3 grid gap-2 sm:grid-cols-3">
              <div className="rounded border border-slate-200 p-2 text-sm"><div className="text-xs text-slate-500">Total notificări</div><strong>{expirationNotifications.summary?.total || 0}</strong></div>
              <div className="rounded border border-red-200 bg-red-50 p-2 text-sm"><div className="text-xs text-red-700">Deschise</div><strong>{expirationNotifications.summary?.open || 0}</strong></div>
              <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm"><div className="text-xs text-emerald-700">Rezolvate</div><strong>{expirationNotifications.summary?.resolved || 0}</strong></div>
            </div>
            {(expirationNotifications.notifications || []).length ? (
              <div className="grid gap-2">
                {(expirationNotifications.notifications || []).slice(0, 12).map(item => (
                  <div key={item.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${item.status === 'rezolvată' ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
                    <div>
                      <div className="font-medium text-slate-800">{item.title} · {item.user_name || 'HR'}</div>
                      <div className="text-xs text-slate-600">{item.message}</div>
                      {item.detail ? <div className="text-xs text-slate-400">{item.detail}</div> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-right">
                      <span className={`rounded-full px-2 py-1 text-xs ${item.status === 'rezolvată' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{item.status}</span>
                      {item.created_at ? <span className="text-xs text-slate-400">{String(item.created_at).slice(0, 16).replace('T', ' ')}</span> : null}
                      {item.employee_id ? <Button size="sm" variant="secondary" onClick={() => openExpirationEmployee(item)}>Deschide fișa</Button> : null}
                      {item.status !== 'rezolvată' ? <Button size="sm" onClick={() => resolveExpirationNotification(item.id)}>Marchează rezolvat</Button> : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">Nu există notificări HR generate pentru scadențe.</p>
            )}
          </Card>
        </div>
      ) : null}

      {/* ─── INBOX HR ─────────────────────────────────────── */}
      {activeTab === 'Inbox HR' ? (
        <div className="grid gap-4">
          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-800">📥 Inbox HR — sarcini care cer acțiune</div>
                <div className="text-xs text-slate-500">Concedii, medicale, fluxuri, dosare incomplete, confirmări Kiosk și scadențe într-un singur panou.</div>
              </div>
              <Button size="sm" variant="secondary" onClick={loadHrInbox}>Reîncarcă inbox</Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-4">
              <div className="rounded border border-slate-200 p-2 text-sm"><div className="text-xs text-slate-500">Total sarcini</div><strong>{hrInbox.summary?.total || 0}</strong></div>
              <div className="rounded border border-rose-200 bg-rose-50 p-2 text-sm"><div className="text-xs text-rose-700">Critice</div><strong>{hrInbox.summary?.critical || 0}</strong></div>
              <div className="rounded border border-amber-200 bg-amber-50 p-2 text-sm"><div className="text-xs text-amber-700">Avertizări</div><strong>{hrInbox.summary?.warning || 0}</strong></div>
              <div className="rounded border border-blue-200 bg-blue-50 p-2 text-sm"><div className="text-xs text-blue-700">Informative</div><strong>{hrInbox.summary?.info || 0}</strong></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                { value: 'toate', label: `Toate (${hrInbox.summary?.total || 0})` },
                { value: 'critice', label: `Critice (${hrInbox.summary?.critical || 0})` },
                { value: 'avertizari', label: `Avertizări (${hrInbox.summary?.warning || 0})` },
                { value: 'concedii', label: `Concedii (${hrInbox.summary?.by_category?.concedii || 0})` },
                { value: 'medical', label: `Medicale (${hrInbox.summary?.by_category?.medical || 0})` },
                { value: 'onboarding', label: `Onboarding (${hrInbox.summary?.by_category?.onboarding || 0})` },
                { value: 'offboarding', label: `Offboarding (${hrInbox.summary?.by_category?.offboarding || 0})` },
                { value: 'dosar', label: `Dosar (${hrInbox.summary?.by_category?.dosar || 0})` },
                { value: 'kiosk', label: `Kiosk (${hrInbox.summary?.by_category?.kiosk || 0})` },
                { value: 'scadente', label: `Scadențe (${hrInbox.summary?.by_category?.scadente || 0})` },
              ].map(filter => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setHrInboxFilter(filter.value)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${hrInboxFilter === filter.value ? 'bg-primary-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-700">{hrInboxRows.length} sarcini afișate</div>
              {dossierReminderResult ? <div className="text-xs text-emerald-700">Ultimul reminder Kiosk: {dossierReminderResult.pending || 0} documente · {String(dossierReminderResult.sent_at || '').slice(0, 16).replace('T', ' ')}</div> : null}
            </div>
            <div className="grid gap-2">
              {hrInboxRows.slice(0, 80).map(item => {
                const severityClass = item.severity === 'critical'
                  ? 'border-rose-200 bg-rose-50'
                  : item.severity === 'warning'
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-blue-200 bg-blue-50'
                const severityLabel = item.severity === 'critical' ? 'critic' : item.severity === 'warning' ? 'atenție' : 'info'
                return (
                  <div key={item.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${severityClass}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.severity === 'critical' ? 'bg-rose-100 text-rose-700' : item.severity === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{severityLabel}</span>
                        <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold uppercase text-slate-500">{item.category}</span>
                        <span className="font-semibold text-slate-800">{item.title}</span>
                      </div>
                      <div className="mt-1 text-slate-700">{item.employee_name || '—'}{item.marca ? ` · marca ${item.marca}` : ''}{item.department_name ? ` · ${item.department_name}` : ''}</div>
                      {item.detail ? <div className="text-xs text-slate-500">{item.detail}</div> : null}
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {item.due_date ? <div className="text-right text-xs text-slate-500"><div>Termen/sursă</div><strong>{String(item.due_date).slice(0, 10)}</strong></div> : null}
                      {['dosar', 'scadente'].includes(item.category) && item.employee_id ? (
                        <Button size="sm" variant="secondary" onClick={() => openHrInboxTask({ ...item, action: 'guided_upload', action_label: 'Încarcă document' })}>Încarcă document</Button>
                      ) : null}
                      <Button size="sm" onClick={() => openHrInboxTask(item)}>{item.action_label || 'Deschide'}</Button>
                    </div>
                  </div>
                )
              })}
              {!hrInboxRows.length ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-6 text-center text-sm text-emerald-700">
                  Inbox HR curat. Nu sunt sarcini pentru filtrul selectat.
                </div>
              ) : null}
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-800">🧾 Istoric rezolvări / jurnal operațional HR</div>
                <div className="text-xs text-slate-500">Evenimente HR normalizate pentru audit: documente, Kiosk, concedii, fluxuri, pontaj, contracte și echipamente.</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => loadHrActivity()}>Reîncarcă jurnal</Button>
                <Button size="sm" onClick={downloadHrActivity}>📊 Export Excel</Button>
              </div>
            </div>
            <div className="mb-3 grid gap-2 md:grid-cols-4">
              <Select label="Categorie" value={hrActivityFilter.category} onChange={event => setHrActivityFilter(current => ({ ...current, category: event.target.value }))} options={[{ value: '', label: 'Toate categoriile' }, ...hrActivityCategories]} />
              <Select label="Angajat" value={hrActivityFilter.employee_id} onChange={event => setHrActivityFilter(current => ({ ...current, employee_id: event.target.value }))} options={[{ value: '', label: 'Toți angajații' }, ...employees.map(emp => ({ value: String(emp.id), label: fullName(emp) }))]} />
              <Input label="De la" type="date" value={hrActivityFilter.from} onChange={event => setHrActivityFilter(current => ({ ...current, from: event.target.value }))} />
              <Input label="Până la" type="date" value={hrActivityFilter.to} onChange={event => setHrActivityFilter(current => ({ ...current, to: event.target.value }))} />
            </div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-slate-500">Total filtrat: <strong>{hrActivity.summary?.total || 0}</strong></div>
              <Button size="sm" variant="secondary" onClick={() => loadHrActivity()}>Aplică filtre</Button>
            </div>
            <div className="grid gap-2">
              {(hrActivity.rows || []).slice(0, 40).map(item => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{item.category_label || item.category}</span>
                      <span className="font-semibold text-slate-800">{item.label}</span>
                    </div>
                    <div className="text-xs text-slate-500">{item.employee_name || '—'}{item.marca ? ` · marca ${item.marca}` : ''}{item.details ? ` · ${item.details}` : ''}</div>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <div>{item.user_name || 'Sistem'}</div>
                    <strong>{String(item.at || '').slice(0, 16).replace('T', ' ')}</strong>
                  </div>
                </div>
              ))}
              {!(hrActivity.rows || []).length ? <div className="rounded border border-slate-200 px-3 py-6 text-center text-sm text-slate-400">Nu există evenimente HR pentru filtrele selectate.</div> : null}
            </div>
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
                <Button size="sm" variant="secondary" disabled={timesheetLock?.locked} onClick={fillWorkingDays}>Completeaza zilele lucratoare</Button>
                <Button size="sm" onClick={submitDepartmentTimesheet}>✅ Marchează ca Finalizat</Button>
                <Button size="sm" variant="secondary" onClick={validateMonth}>Validează luna</Button>
                <Button size="sm" variant="secondary" onClick={invalidateMonth}>Devalideaza</Button>
                <Button size="sm" variant="secondary" onClick={() => {
                  const rows = scopedMonthlySheet.map(row => {
                    const obj = { 'Angajat': fullName(row), 'Departament': row.department_name || '' }
                    monthDays.forEach(day => {
                      const val = row.zile?.[day]
                      obj[`Zi ${day.slice(-2)}`] = typeof val === 'object' ? (val?.tip && val.tip !== 'lucru' ? val.tip : val?.ore_lucrate ?? '') : (val ?? '')
                    })
                    const values = monthDays.map(day => row.zile?.[day]).map(value => typeof value === 'object' ? Number(value.ore_lucrate || 0) : Number(value || 0))
                    obj['Total ore'] = values.reduce((sum, value) => sum + value, 0)
                    obj['Zile lucrate'] = values.filter(value => value > 0).length
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
                    {monthDays.map(day => <td key={day} className="p-1 text-center"><button type="button" title={`Editeaza ${fullName(row)} - ${day}`} disabled={timesheetLock?.locked} onClick={() => openTimesheetCell(row, day)} className={`inline-flex min-w-8 justify-center rounded px-1 py-1 transition hover:ring-2 hover:ring-primary-300 disabled:cursor-not-allowed disabled:opacity-60 ${timesheetTone(row.zile?.[day])}`}>{timesheetLabel(row.zile?.[day])}</button></td>)}
                  </tr>
                )) : <tr><td className="px-3 py-8 text-sm text-slate-500" colSpan={monthDays.length + 1}>{loading ? 'Se incarca...' : 'Nu exista angajati activi in departamentul selectat. Verifica fisa HR si asocierea utilizatorului cu angajatul.'}</td></tr>}
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
        <div className="grid gap-4">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><div className="font-semibold">Inchidere pontaj {filters.luna}</div><div className="text-sm text-slate-500">{timesheetLock?.locked ? 'Luna este inchisa. Modificarile sunt blocate.' : 'Luna este deschisa pentru completare si validare.'}</div></div>
              <div className="flex gap-2"><Button variant="secondary" onClick={loadTimesheetLock}>Verifica stare</Button>{hasPerm('hr:timesheets_validate') ? <Button variant={timesheetLock?.locked ? 'secondary' : 'primary'} onClick={toggleTimesheetLock}>{timesheetLock?.locked ? 'Deblocheaza luna' : 'Inchide luna'}</Button> : null}</div>
            </div>
          </Card>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <div className="mb-3 flex items-center justify-between"><div><div className="font-semibold">Ore suplimentare in asteptare</div><div className="text-sm text-slate-500">Intra in banca de ore numai dupa aprobare.</div></div><Badge tone={pendingOvertime.length ? 'warning' : 'success'}>{pendingOvertime.length}</Badge></div>
              <div className="grid gap-2">
                {pendingOvertime.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 p-2 text-sm"><div><strong>{item.employee_name}</strong><div className="text-xs text-slate-500">{String(item.data).slice(0, 10)} · {Number(item.ore_suplimentare_s1 || 0) + Number(item.ore_suplimentare_s2 || 0)} ore</div></div>{hasPerm('hr:timesheet_approve') ? <div className="flex gap-2"><Button size="sm" onClick={() => decideOvertime(item, 'approve')}>Aproba</Button><Button size="sm" variant="secondary" onClick={() => decideOvertime(item, 'reject')}>Respinge</Button></div> : null}</div>)}
                {!pendingOvertime.length ? <div className="text-sm text-slate-500">Nu exista propuneri in asteptare.</div> : null}
              </div>
            </Card>
            <Card>
              <div className="mb-3"><div className="font-semibold">Control timp de munca</div><div className="text-sm text-slate-500">Verificare operationala saptamanala; exceptiile necesita analiza HR.</div></div>
              <div className="grid gap-2">
                {weeklyControls.filter(item => item.status !== 'ok').map(item => <div key={`${item.employee_id}-${item.week_start}`} className="rounded border border-amber-200 bg-amber-50 p-2 text-sm"><strong>{item.employee_name}</strong> · saptamana {item.week_start}<div>{item.total_hours} ore · {item.warnings.join('; ')}</div></div>)}
                {!weeklyControls.some(item => item.status !== 'ok') ? <div className="text-sm text-slate-500">Nu sunt depasiri operationale pentru luna selectata.</div> : null}
              </div>
            </Card>
          </div>
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
                  {Number(overtimeBank.ore_scadente_plata || 0) > 0 ? <div className="mt-2 text-sm font-semibold text-rose-700">{overtimeBank.ore_scadente_plata} ore au depasit termenul de 90 zile si trebuie analizate pentru plata (spor minim 75%).</div> : null}
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
              <Button size="sm" onClick={() => { setShiftEditing(null); setShiftForm({ nume: '', ora_start: '08:00', ora_sfarsit: '16:00', ore_normale: 8, culoare: '#3B82F6' }); setShiftModal(true) }}>+ Tură nouă</Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {tures.map(tura => (
                <div key={tura.id} className="rounded-lg border border-slate-200 p-3" style={{ borderLeft: `5px solid ${tura.culoare || '#3B82F6'}` }}>
                  <div className="font-semibold text-slate-900">{tura.nume}</div>
                  <div className="text-sm text-slate-500">{tura.ora_start}–{tura.ora_sfarsit}</div>
                  <div className="text-xs text-slate-400">{tura.ore_normale || 8} ore normale</div>
                  <div className="mt-3 flex gap-2"><Button size="sm" variant="secondary" onClick={() => editShift(tura)}>Editeaza</Button><Button size="sm" variant="secondary" onClick={() => deactivateShift(tura)}>Dezactiveaza</Button></div>
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

      <Modal open={Boolean(timesheetEdit)} title={timesheetEdit ? `Pontaj - ${timesheetEdit.employee_name}` : 'Pontaj'} onClose={() => setTimesheetEdit(null)}>
        {timesheetEdit ? <form className="grid gap-3" onSubmit={saveTimesheetCell}>
          <Input label="Data" type="date" value={timesheetEdit.data} disabled />
          <Select label="Tip zi" value={timesheetEdit.tip} onChange={event => setTimesheetEdit({ ...timesheetEdit, tip: event.target.value, ore_lucrate: event.target.value === 'lucru' ? (timesheetEdit.ore_lucrate || 8) : 0 })} options={[{value:'lucru',label:'Lucru'}, {value:'co',label:'Concediu de odihna'}, {value:'cm',label:'Concediu medical'}, {value:'delegatie',label:'Delegatie'}, {value:'liber',label:'Zi libera'}, {value:'nemotivat',label:'Absent nemotivat'}]} />
          <Input label="Ore lucrate" type="number" min="0" max="24" step="0.5" value={timesheetEdit.ore_lucrate} onChange={event => setTimesheetEdit({ ...timesheetEdit, ore_lucrate: event.target.value })} disabled={timesheetEdit.tip !== 'lucru' && timesheetEdit.tip !== 'delegatie'} />
          <Input label="Observatii" value={timesheetEdit.observatii} onChange={event => setTimesheetEdit({ ...timesheetEdit, observatii: event.target.value })} />
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setTimesheetEdit(null)}>Renunta</Button><Button type="submit">Salveaza pontaj</Button></div>
        </form> : null}
      </Modal>

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

      <Modal open={Boolean(templateEditing)} title={templateEditing ? `Șablon HR — ${templateEditing.denumire}` : 'Șablon HR'} onClose={() => setTemplateEditing(null)} size="lg">
        {templateEditing ? (
          <form className="grid gap-3" onSubmit={saveHrDocumentTemplate}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Denumire" value={templateEditing.denumire || ''} onChange={event => setTemplateEditing(current => ({ ...current, denumire: event.target.value }))} required />
              <Select label="Tip" value={templateEditing.tip || 'altul'} onChange={event => setTemplateEditing(current => ({ ...current, tip: event.target.value }))} options={[
                { value: 'contract', label: 'Contract' },
                { value: 'act_aditional', label: 'Act adițional' },
                { value: 'decizie', label: 'Decizie' },
                { value: 'adeverinta', label: 'Adeverință' },
                { value: 'altul', label: 'Altul' },
              ]} />
            </div>
            <Input label="Descriere" value={templateEditing.descriere || ''} onChange={event => setTemplateEditing(current => ({ ...current, descriere: event.target.value }))} />
            <div className={`rounded-lg border px-3 py-2 text-sm ${templateEditing.word_template_file ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <strong>{templateEditing.word_template_file ? 'Șablon Word atașat' : 'Nu există șablon Word atașat'}</strong>
                  <div className="text-xs">{templateEditing.word_template_file ? (templateEditing.word_template_original_name || 'document .docx') : 'Poți încărca CIM-ul/actul real din Word și păstra editorul vizual ca fallback.'}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {templateEditing.word_template_file ? <Button type="button" size="sm" variant="secondary" onClick={() => downloadTemplateWordFile(templateEditing)}>Descarcă Word</Button> : null}
                  <Button type="button" size="sm" variant="secondary" loading={templateWordUploading === templateEditing.id} onClick={() => chooseTemplateWordFile(templateEditing)}>{templateEditing.word_template_file ? 'Înlocuiește Word' : 'Încarcă Word'}</Button>
                </div>
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Variabile</div>
              <div className="flex max-h-24 flex-wrap gap-1 overflow-auto rounded border border-slate-200 bg-slate-50 p-2">
                {HR_TEMPLATE_VARIABLES.map(variable => (
                  <button
                    key={variable}
                    type="button"
                    className="rounded bg-white px-2 py-1 text-xs text-slate-700 shadow-sm hover:bg-primary-50 hover:text-primary-700"
                    onMouseDown={event => { event.preventDefault(); insertTemplateSnippet(`{{${variable}}}`) }}
                  >{`{{${variable}}}`}</button>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-700">Conținut șablon — editor vizual</div>
                  <div className="text-xs text-slate-500">Editează ca într-un document. Variabilele se păstrează între acolade și se completează automat la generare.</div>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button type="button" size="sm" variant="secondary" onMouseDown={event => { event.preventDefault(); applyTemplateCommand('bold') }}>Bold</Button>
                  <Button type="button" size="sm" variant="secondary" onMouseDown={event => { event.preventDefault(); applyTemplateCommand('formatBlock', 'h2') }}>Titlu</Button>
                  <Button type="button" size="sm" variant="secondary" onMouseDown={event => { event.preventDefault(); applyTemplateCommand('insertUnorderedList') }}>Listă</Button>
                  <Button type="button" size="sm" variant="secondary" onMouseDown={event => { event.preventDefault(); insertTemplateSnippet('<table style="width:100%;border-collapse:collapse" border="1"><tbody><tr><td>Semnătură angajator</td><td>Semnătură salariat</td></tr><tr><td><br><br></td><td><br><br></td></tr></tbody></table><p></p>') }}>Tabel semnături</Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setTemplateAdvancedMode(value => !value)}>{templateAdvancedMode ? 'Ascunde HTML' : 'HTML avansat'}</Button>
                </div>
              </div>
              <div
                ref={templateEditorRef}
                className="min-h-[420px] rounded bg-white px-8 py-6 text-sm leading-7 text-slate-900 shadow-inner ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-primary-200 [&_h2]:mb-3 [&_h2]:text-center [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mt-4 [&_h3]:font-bold [&_p]:mb-2 [&_table]:my-3 [&_td]:border [&_td]:border-slate-300 [&_td]:p-2"
                contentEditable
                suppressContentEditableWarning
                onBlur={syncTemplateVisualEditor}
                dangerouslySetInnerHTML={{ __html: templateEditing.template_html || '<p>Scrie aici conținutul documentului...</p>' }}
              />
            </div>
            {templateAdvancedMode ? (
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Cod HTML șablon — mod avansat
                <textarea
                  className="min-h-[260px] rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                  value={templateEditing.template_html || ''}
                  onChange={event => setTemplateEditing(current => ({ ...current, template_html: event.target.value }))}
                  required
                />
              </label>
            ) : null}
            <div className="rounded bg-emerald-50 p-2 text-xs text-emerald-800">
              Pentru HR nu mai este necesară editarea HTML. Dacă documentul vine din Word, copiază textul din Word și lipește-l în editorul vizual, apoi inserează variabilele unde trebuie.
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setTemplateEditing(null)}>Renunță</Button>
              <Button type="submit">Salvează șablon</Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal open={Boolean(templateTesting)} title={templateTesting ? `Testează Word — ${templateTesting.denumire}` : 'Testează șablon Word'} onClose={() => setTemplateTesting(null)} size="md">
        {templateTesting ? (
          <form className="grid gap-3" onSubmit={runTemplateWordTest}>
            <div className="rounded border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
              Testul nu arhivează nimic. Verifică dacă variabilele din documentul Word pot fi detectate și completate pentru un exemplu real.
            </div>
            <Select
              label="Angajat test"
              value={templateTestForm.employee_id}
              onChange={event => {
                const employeeId = event.target.value
                const contracts = employeeContractsFor(employeeId)
                setTemplateTestForm({ employee_id: employeeId, contract_id: contracts[0]?.id || '', amendment_id: '' })
                setTemplateTestResult(null)
              }}
              options={employees.map(emp => ({ value: emp.id, label: `${fullName(emp)}${emp.marca ? ` · ${emp.marca}` : ''}` }))}
            />
            <Select
              label="Contract test"
              value={templateTestForm.contract_id}
              onChange={event => setTemplateTestForm(current => ({ ...current, contract_id: event.target.value, amendment_id: '' }))}
              options={[{ value: '', label: 'Contract activ automat' }, ...employeeContractsFor(templateTestForm.employee_id).map(contract => ({ value: contract.id, label: `${contract.numar_contract || `Contract #${contract.id}`} · ${String(contract.data_start || contract.data_contract || '').slice(0, 10) || '-'}` }))]}
            />
            {templateTesting.id === 'act_aditional' ? (
              <Select
                label="Act adițional test"
                value={templateTestForm.amendment_id}
                onChange={event => setTemplateTestForm(current => ({ ...current, amendment_id: event.target.value }))}
                options={[{ value: '', label: 'Fără act specific' }, ...employeeAmendmentsFor(templateTestForm.contract_id).map(item => ({ value: item.id, label: `${item.numar_act || `Act #${item.id}`} · ${item.tip} · ${String(item.data_efect || '').slice(0, 10)}` }))]}
              />
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setTemplateTesting(null)}>Închide</Button>
              <Button type="submit">Rulează test</Button>
            </div>
            {templateTestResult ? (
              <div className={`rounded-lg border p-3 text-sm ${templateTestResult.status === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                <div className="mb-2 font-semibold">{templateTestResult.status === 'ok' ? 'OK — șablonul poate fi folosit' : 'Atenție — verifică șablonul Word'}</div>
                <div>Variabile detectate: <strong>{templateTestResult.detected_count || 0}</strong></div>
                {templateTestResult.resolved?.length ? <div className="mt-2 text-xs">Recunoscute: {templateTestResult.resolved.join(', ')}</div> : null}
                {templateTestResult.unknown?.length ? <div className="mt-2 text-xs text-rose-700">Necunoscute: {templateTestResult.unknown.join(', ')}</div> : null}
                {templateTestResult.missing_values?.length ? <div className="mt-2 text-xs text-amber-700">Fără valoare în exemplu: {templateTestResult.missing_values.join(', ')}</div> : null}
                {templateTestResult.warnings?.length ? <ul className="mt-2 list-disc pl-5 text-xs">{templateTestResult.warnings.map((item, index) => <li key={index}>{item}</li>)}</ul> : null}
              </div>
            ) : null}
          </form>
        ) : null}
      </Modal>

      {/* ─── MODAL FIȘA ANGAJAT ───────────────────────────── */}
      <Modal open={Boolean(selectedEmployee)} title={selectedEmployee ? `Fișa — ${fullName(selectedEmployee)}` : ''} onClose={() => setSelectedEmployee(null)} size="lg">
        {employeeDetails ? (
          <div className="grid gap-4">
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
                  <Button size="sm" variant="secondary" onClick={printEmployeeProfile}>🖨️ Fișă angajat</Button>
                  {editMode
                    ? <>
                        <Button size="sm" onClick={saveEmployeeEdit}>💾 Salvează</Button>
                        <Button size="sm" variant="secondary" onClick={() => { setEditMode(false); setPhotoPreview(null); setPhotoFile(null) }}>Renunță</Button>
                      </>
                    : <Button size="sm" variant="secondary" onClick={() => { setEmployeeProfileTab('date'); setEditMode(true) }}>✏️ Editează</Button>
                  }
                </div>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-lg border border-slate-200 p-3 text-sm"><div className="text-xs text-slate-500">Status contract</div><strong>{employeeDetails.tip_contract || employeeContracts[0]?.tip || 'activ'}</strong><div className="text-xs text-slate-400">{employeeDetails.data_angajare || employeeContracts[0]?.data_start || '-'}</div></div>
              <div className="rounded-lg border border-primary-200 bg-primary-50 p-3 text-sm"><div className="text-xs text-primary-700">Dosar HR</div><strong>{selectedDossierSummary?.percent ?? 0}%</strong><div className="text-xs text-primary-600">{selectedDossierSummary?.required_done ?? 0}/{selectedDossierSummary?.required_total ?? 0} obligatorii</div></div>
              <div className={`rounded-lg border p-3 text-sm ${selectedDossierSummary?.pending_ack ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}><div className="text-xs">Confirmări Kiosk</div><strong>{selectedDossierSummary?.pending_ack ?? 0}</strong><div className="text-xs">neconfirmate</div></div>
              <div className={`rounded-lg border p-3 text-sm ${selectedEmployeeExpirations[0]?.severity === 'expired' ? 'border-rose-200 bg-rose-50' : selectedEmployeeExpirations[0] ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}><div className="text-xs">Următoarea scadență</div><strong>{selectedEmployeeExpirations[0]?.date || '—'}</strong><div className="text-xs">{selectedEmployeeExpirations[0]?.label || 'fără scadențe apropiate'}</div></div>
              <div className={`rounded-lg border p-3 text-sm ${employeeWorkflow && !['completed','cancelled'].includes(employeeWorkflow.status) ? 'border-violet-200 bg-violet-50' : 'border-slate-200'}`}><div className="text-xs text-slate-500">Flux HR</div><strong>{employeeWorkflow ? `${employeeWorkflow.progress?.percent || 0}%` : 'nepornit'}</strong><div className="text-xs text-slate-400">{employeeWorkflow?.type || `CO: ${coBalance ? `${coBalance.zile_ramase} zile` : `${employeeDetails.zile_co_drept ?? 21} / an`}`}</div></div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-800">🕘 Activitate HR recentă</div>
                  <div className="text-xs text-slate-500">Ultimele acțiuni operaționale legate de acest angajat.</div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => loadHrActivity({ employee_id: employeeDetails.id })}>Reîncarcă</Button>
              </div>
              <div className="grid gap-2">
                {selectedEmployeeActivity.map(item => (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-100 px-3 py-2 text-xs">
                    <div>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">{item.category_label || item.category}</span>
                      <span className="ml-2 font-semibold text-slate-800">{item.label}</span>
                      {item.details ? <div className="mt-1 text-slate-500">{item.details}</div> : null}
                    </div>
                    <div className="text-right text-slate-500">
                      <div>{item.user_name || 'Sistem'}</div>
                      <strong>{String(item.at || '').slice(0, 16).replace('T', ' ')}</strong>
                    </div>
                  </div>
                ))}
                {!selectedEmployeeActivity.length ? <div className="text-sm text-slate-400">Nu există activitate HR recentă în jurnal pentru acest angajat.</div> : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
              {[
                ['date', 'Date personale'],
                ['contracte', 'Contracte'],
                ['pontaj', 'Pontaj & concedii'],
                ['dosar', 'Dosar documente'],
                ['kiosk', 'Scadențe & Kiosk'],
                ['flux', 'Onboarding / Offboarding'],
                ['echipamente', 'Echipamente'],
              ].map(([value, label]) => (
                <button key={value} type="button" onClick={() => setEmployeeProfileTab(value)} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${employeeProfileTab === value ? 'bg-primary-700 text-white shadow' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>{label}</button>
              ))}
            </div>

            {employeeProfileTab === 'date' ? (editMode ? (
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
                    <Select label="Cont aplicatie / Kiosk" value={String(editForm.user_id || '')} onChange={e => setEditForm({...editForm, user_id: e.target.value})} options={[{ value: '', label: 'Fara cont asociat' }, ...linkableUsers.map(account => ({ value: String(account.id), label: `${account.name || account.username} (${account.username})` }))]} />
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
            )) : null}

            {employeeProfileTab === 'contracte' ? (
              <>
                <EmployeeContractsPanel employeeId={employeeDetails.id} contracts={employeeContracts} amendments={employeeAmendments} departments={departments} canManage={hasPerm('hr:manage')} onReload={() => reloadEmployeeContracts(employeeDetails.id)} onError={setError} onPrintContract={printOperationalContract} onPrintAmendment={printOperationalAmendment} onGenerateContractWord={generateContractWord} onGenerateAmendmentWord={generateAmendmentWord} onArchiveContractWord={archiveContractWord} onArchiveAmendmentWord={archiveAmendmentWord} documentTemplates={hrDocumentTemplates} />
                {transferHistory.length ? (
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Istoric departamente</div>
                <div className="grid gap-2">
                  {transferHistory.map(item => <div key={item.uuid || item.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span><strong>{item.departament_vechi_nume || item.dept_vechi || 'Fara departament'}</strong> → <strong>{item.departament_nou_nume || item.dept_nou}</strong></span><span className="text-xs text-slate-500">{item.data_transfer} · {item.motiv || 'fara motiv'}</span></div>)}
                </div>
              </div>
                ) : null}
              </>
            ) : null}

            {employeeProfileTab === 'pontaj' ? (
              <div className="grid gap-4">
                <div className="grid gap-2 sm:grid-cols-4">
                  <div className="rounded border border-slate-200 p-3 text-sm"><div className="text-xs text-slate-500">Zile pontate</div><strong>{employeeDetails.statistici_pontaj?.zile_pontate ?? 0}</strong></div>
                  <div className="rounded border border-slate-200 p-3 text-sm"><div className="text-xs text-slate-500">Ore total</div><strong>{employeeDetails.statistici_pontaj?.ore_total ?? 0}</strong></div>
                  <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm"><div className="text-xs text-emerald-700">CO rămas</div><strong>{coBalance?.zile_ramase ?? '-'}</strong></div>
                  <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm"><div className="text-xs text-amber-700">Cereri concediu</div><strong>{selectedEmployeeLeaves.length}</strong></div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Istoric concedii</div>
                  <div className="grid gap-2">
                    {selectedEmployeeLeaves.slice(0, 12).map(item => <div key={item.uuid || item.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-slate-50 px-3 py-2 text-sm"><span><strong>{item.tip}</strong> · {item.data_start} — {item.data_sfarsit} · {item.zile || '-'} zile</span><Badge tone={['aprobat','aprobata'].includes(item.status) ? 'success' : item.status === 'respins' ? 'danger' : 'warning'}>{item.status || 'cerut'}</Badge></div>)}
                    {!selectedEmployeeLeaves.length ? <div className="text-sm text-slate-400">Nu există cereri de concediu înregistrate.</div> : null}
                  </div>
                </div>
              </div>
            ) : null}

            {employeeProfileTab === 'dosar' ? <EmployeeFilesPanel employeeId={employeeDetails.id} canManage={hasPerm('hr:manage')} onError={setError} suggestedUpload={guidedDossierUpload} onSuggestionUsed={() => { setGuidedDossierUpload(null); loadHrInbox() }} /> : null}

            {employeeProfileTab === 'kiosk' ? (
              <div className="grid gap-4">
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded border border-slate-200 p-3 text-sm"><div className="text-xs text-slate-500">Documente Kiosk</div><strong>{selectedDossierSummary?.kiosk_documents ?? 0}</strong></div>
                  <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm"><div className="text-xs text-amber-700">Neconfirmate</div><strong>{selectedDossierSummary?.pending_ack ?? 0}</strong></div>
                  <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm"><div className="text-xs text-blue-700">Scadențe ≤90 zile</div><strong>{selectedEmployeeExpirations.length}</strong></div>
                </div>
                {selectedDossierSummary?.pending_ack ? <Button size="sm" onClick={() => sendDossierReminder(employeeDetails.id)}>Trimite reminder Kiosk</Button> : null}
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Lipsuri obligatorii & scadențe</div>
                  {selectedDossierSummary?.missing_required?.length ? <div className="mb-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">Lipsesc: {selectedDossierSummary.missing_required.join(', ')}</div> : <div className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Documentele obligatorii sunt complete.</div>}
                  <div className="grid gap-2">
                    {selectedEmployeeExpirations.map(item => <div key={item.id} className={`flex flex-wrap items-center justify-between gap-2 rounded px-3 py-2 text-sm ${item.severity === 'expired' ? 'bg-rose-50 text-rose-800' : item.severity === 'critical' ? 'bg-red-50 text-red-800' : item.severity === 'warning' ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-800'}`}><span>{item.icon} {item.label}</span><span>{item.date} · {item.days < 0 ? `expirat de ${Math.abs(item.days)} zile` : `${item.days} zile rămase`}</span></div>)}
                    {!selectedEmployeeExpirations.length ? <div className="text-sm text-slate-400">Nu există scadențe apropiate.</div> : null}
                  </div>
                </div>
              </div>
            ) : null}

            {employeeProfileTab === 'flux' ? (
              <div className="grid gap-4">
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-800">🚦 Onboarding / Offboarding HR</div>
                      <div className="text-xs text-slate-500">Checklist ghidat pentru angajare sau plecare, legat de dosar, contracte, Kiosk și echipamente.</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => loadEmployeeWorkflow()}>Reîncarcă</Button>
                      <Button size="sm" loading={employeeWorkflowBusy} onClick={() => startEmployeeWorkflow('onboarding')}>Pornește onboarding</Button>
                      <Button size="sm" variant="secondary" loading={employeeWorkflowBusy} onClick={() => startEmployeeWorkflow('offboarding')}>Pornește offboarding</Button>
                    </div>
                  </div>
                  {employeeWorkflow ? (
                    <>
                      <div className="mb-3 grid gap-2 sm:grid-cols-4">
                        <div className="rounded border border-slate-200 p-2 text-sm"><div className="text-xs text-slate-500">Tip flux</div><strong>{employeeWorkflow.type === 'offboarding' ? 'Offboarding' : 'Onboarding'}</strong></div>
                        <div className="rounded border border-violet-200 bg-violet-50 p-2 text-sm"><div className="text-xs text-violet-700">Status</div><strong>{employeeWorkflow.status}</strong></div>
                        <div className="rounded border border-primary-200 bg-primary-50 p-2 text-sm"><div className="text-xs text-primary-700">Progres total</div><strong>{employeeWorkflow.progress?.steps_done || 0}/{employeeWorkflow.progress?.steps_total || 0}</strong></div>
                        <div className="rounded border border-amber-200 bg-amber-50 p-2 text-sm"><div className="text-xs text-amber-700">Obligatorii</div><strong>{employeeWorkflow.progress?.required_done || 0}/{employeeWorkflow.progress?.required_total || 0}</strong></div>
                      </div>
                      <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-200">
                        <div className="h-2 rounded-full bg-violet-600" style={{ width: `${employeeWorkflow.progress?.percent || 0}%` }} />
                      </div>
                      <div className="grid gap-2">
                        {(employeeWorkflow.steps || []).map(step => (
                          <div key={step.key} className={`flex flex-wrap items-center justify-between gap-3 rounded border px-3 py-2 text-sm ${guidedWorkflowStep && guidedWorkflowStep === step.key ? 'ring-2 ring-primary-300' : ''} ${step.done ? 'border-emerald-200 bg-emerald-50' : step.required ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                            <label className="flex min-w-0 flex-1 items-start gap-2">
                              <input type="checkbox" className="mt-1" checked={Boolean(step.done)} onChange={event => toggleEmployeeWorkflowStep(step, event.target.checked)} />
                              <span>
                                <span className="font-semibold text-slate-800">{step.done ? '✅' : step.required ? '⬜' : '▫️'} {step.label}</span>
                                {step.required ? <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">obligatoriu</span> : <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">opțional</span>}
                                {step.auto_checked ? <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">detectat automat</span> : null}
                                <div className="text-xs text-slate-500">{step.description}</div>
                                {step.completed_at ? <div className="text-xs text-emerald-700">bifat la {String(step.completed_at).slice(0, 16).replace('T', ' ')}</div> : null}
                                {guidedWorkflowStep && guidedWorkflowStep === step.key ? <div className="mt-1 text-xs font-semibold text-primary-700">Pas sugerat din Inbox HR — continuă de aici.</div> : null}
                                {workflowStepActions(step).length ? (
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {workflowStepActions(step).map(action => (
                                      <button
                                        key={action.label}
                                        type="button"
                                        className="rounded bg-white px-2 py-1 text-xs font-semibold text-primary-700 ring-1 ring-primary-100 hover:bg-primary-50"
                                        onClick={(event) => { event.preventDefault(); action.run() }}
                                      >
                                        {action.label}
                                      </button>
                                    ))}
                                  </div>
                                ) : null}
                              </span>
                            </label>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        {employeeWorkflow.status !== 'completed' ? <Button size="sm" onClick={() => closeEmployeeWorkflow(false)}>Închide ca finalizat</Button> : null}
                        {!['completed','cancelled'].includes(employeeWorkflow.status) ? <Button size="sm" variant="secondary" onClick={() => closeEmployeeWorkflow(true)}>Anulează flux</Button> : null}
                      </div>
                    </>
                  ) : (
                    <div className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                      Nu există flux activ pentru acest angajat. Pornește onboarding pentru angajare sau offboarding pentru plecare.
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {employeeProfileTab === 'echipamente' ? <div className="rounded-lg border border-primary-100 bg-primary-50/40 p-3">
              <div className="mb-3 flex items-center justify-between"><div className="text-xs font-semibold uppercase text-primary-700">🦺 Echipamente și inventar în răspundere</div>{canManageEquipment ? <Button size="sm" onClick={() => { const first = employeeEquipment?.marimi?.[0]; setDotareForm({ angajat_id: employeeDetails.id, tip_id: first?.id || '', marime: first?.marime || '', numar_serie: '', valoare_inventar: first?.valoare_inventar || '', data_dotare: new Date().toISOString().slice(0, 10), cantitate: 1, stare: 'nou', observatii: '' }); setDotareModal(true) }}>+ Înregistrează dotare nouă</Button> : null}</div>
              {employeeEquipment ? <>
                <div className="grid gap-2 sm:grid-cols-3">{employeeEquipment.marimi.filter(tip => tip.are_marime).map(tip => <Select key={tip.id} label={tip.denumire} value={tip.marime || ''} onChange={event => saveEmployeeSizes(tip.id, event.target.value)} options={[{ value: '', label: 'Alege mărimea' }, ...tip.marimi_disponibile.map(marime => ({ value: marime, label: marime }))]} />)}</div>
                {[['Echipamente protecție', employeeEquipment.inventar?.echipamente_protectie], ['Scule și unelte', employeeEquipment.inventar?.scule_unelte], ['Alte obiecte inventar', employeeEquipment.inventar?.alte_obiecte]].map(([title, rows]) => <div key={title} className="mt-4"><div className="mb-1 text-xs font-semibold uppercase text-slate-600">{title}</div><div className="overflow-auto"><table className="min-w-full text-xs"><thead><tr className="text-left text-slate-500"><th className="py-1">Obiect</th><th>Mărime</th><th>Nr. serie</th><th>Data dotare</th><th>Expiră</th><th>Cant.</th><th>Stare</th><th className="text-right">Valoare</th><th>Predat</th></tr></thead><tbody>{(rows || []).map(row => <tr key={row.id} className="border-t"><td className="py-1">{row.tip_denumire}</td><td>{row.marime || '-'}</td><td>{row.numar_serie || '-'}</td><td>{row.data_dotare}</td><td>{row.data_expirare || '-'}</td><td>{row.cantitate}</td><td>{row.stare}</td><td className="text-right">{Number(row.valoare_inventar || 0).toFixed(2)} lei</td><td>{canManageEquipment ? <input type="checkbox" checked={!!row.predat_la_lichidare} onChange={event => setReturnedEquipment(row, event.target.checked)} /> : row.predat_la_lichidare ? 'Da' : 'Nu'}</td></tr>)}</tbody></table>{!(rows || []).length ? <div className="py-2 text-xs text-slate-400">Nu există obiecte active.</div> : null}</div></div>)}
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">Total valoare în răspundere: {Number(employeeEquipment.inventar?.total_valoare || 0).toFixed(2)} lei</div>
              </> : <p className="text-sm text-slate-500">Se încarcă echipamentele...</p>}
            </div> : null}
          </div>
        ) : <p className="text-sm text-slate-500">Se incarca fișa...</p>}
      </Modal>

      <Modal open={leaveModal} title="Cerere de concediu" onClose={() => setLeaveModal(false)} size="md">
        <form className="grid gap-3" onSubmit={createLeave}>
          <Select label="Angajat" value={leaveForm.employee_id} onChange={event => setLeaveForm({ ...leaveForm, employee_id: event.target.value })} options={[{ value: '', label: 'Alege angajat' }, ...employees.filter(item => item.activ !== false).map(item => ({ value: String(item.id), label: fullName(item) }))]} required />
          <Select label="Tip" value={leaveForm.tip} onChange={event => setLeaveForm({ ...leaveForm, tip: event.target.value })} options={[{ value: 'CO', label: 'Concediu de odihna' }, { value: 'CM', label: 'Concediu medical' }, { value: 'delegatie', label: 'Delegatie' }, { value: 'nemotivat', label: 'Absenta nemotivata' }, { value: 'alt', label: 'Alt tip / fara plata' }]} />
          <div className="grid gap-3 sm:grid-cols-2"><Input label="Data inceput" type="date" value={leaveForm.data_start} onChange={event => setLeaveForm({ ...leaveForm, data_start: event.target.value })} required /><Input label="Data sfarsit" type="date" value={leaveForm.data_sfarsit} onChange={event => setLeaveForm({ ...leaveForm, data_sfarsit: event.target.value })} required /></div>
          <Input label="Motiv / observatii" value={leaveForm.motiv} onChange={event => setLeaveForm({ ...leaveForm, motiv: event.target.value })} />
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setLeaveModal(false)}>Renunta</Button><Button type="submit" disabled={!leaveForm.employee_id || !leaveForm.data_start || !leaveForm.data_sfarsit}>Salveaza cererea</Button></div>
        </form>
      </Modal>

      <Modal open={Boolean(medicalPayrollItem)} title="Trimite concediul medical in salarizare" onClose={() => setMedicalPayrollItem(null)} size="md">
        <form className="grid gap-3" onSubmit={confirmMedicalPayroll}>
          <div className="rounded-md bg-slate-50 p-3 text-sm"><strong>{medicalPayrollItem?.nume} {medicalPayrollItem?.prenume}</strong><div>{medicalPayrollItem?.serie}/{medicalPayrollItem?.numar} · {medicalPayrollItem?.indemnity_percent}% · {medicalPayrollItem?.workdays} zile lucratoare</div></div>
          <Input label="Baza de calcul zilnica (lei)" type="number" min="0.01" step="0.0001" value={medicalDailyBase} onChange={event => setMedicalDailyBase(event.target.value)} required />
          <p className="text-xs text-slate-500">Introdu media zilnica rezultata din veniturile brute ale ultimelor 6 luni. Aplicatia calculeaza indemnizatia si impartirea angajator/FNUASS.</p>
          {Number(medicalDailyBase) > 0 ? <div className="rounded-md bg-primary-50 p-3 text-sm text-primary-800">Estimare: <strong>{(Number(medicalDailyBase) * Number(medicalPayrollItem?.indemnity_percent || 0) / 100 * (Number(medicalPayrollItem?.employer_days || 0) + Number(medicalPayrollItem?.fund_days || 0))).toFixed(2)} lei</strong></div> : null}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setMedicalPayrollItem(null)}>Renunta</Button><Button type="submit" disabled={!(Number(medicalDailyBase) > 0)}>Confirma si trimite</Button></div>
        </form>
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
      <Modal open={shiftModal} title={shiftEditing ? 'Editeaza tura' : 'Tura noua'} onClose={() => { setShiftModal(false); setShiftEditing(null) }} size="md">
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
            { value: 'sold_initial', label: 'Sold initial - ore lucrate anterior' },
            { value: 'avans_timp_liber', label: 'Timp liber acordat in avans' },
          ]} />
          <Input label="Ore de compensat" type="number" value={compensateForm.ore} onChange={e => setCompensateForm({ ...compensateForm, ore: e.target.value })} required />
          {compensateForm.tip === 'plata' ? <Input label="Spor plata (%) - minimum legal 75%" type="number" min="75" value={compensateForm.spor_procent} onChange={e => setCompensateForm({ ...compensateForm, spor_procent: e.target.value })} required /> : null}
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

