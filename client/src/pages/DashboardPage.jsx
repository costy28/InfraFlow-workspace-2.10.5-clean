import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import api from '../api/client'
import Badge from '../components/ui/Badge'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { useAuth } from '../hooks/useAuth'

const emptyState = {
  daily: null,
  production7: [],
  stockOperations: [],
  fleetAssets: [],
  inboxDocuments: [],
  watchedDocuments: null,
  tickets: [],
  projects: [],
  audit: [],
  weather: null,
  commandCenter: null,
  contractsDashboard: null,
  contractsTasks: [],
  myTasks: [],
  hrStats: null,
  leaveRequests: [],
  accountingSummary: null,
  settings: null,
  users: null,
  backupStatus: null,
  updateStatus: null,
  emailSyncStatus: null,
}

const routes = {
  stock: '/stocuri',
  production: '/productie',
  fleet: '/flota',
  referate: '/referate',
  mecanizare: '/mecanizare',
  hr: '/hr',
  controlling: '/controlling',
  documents: '/documente',
  tickets: '/sesizari',
  projects: '/teren',
  audit: '/setari',
  snow: '/deszapezire',
  contracts: '/contracte',
  accounting: '/contabilitate',
  tasks: '/taskuri',
  settings: '/setari',
  settingsGeneral: '/setari?tab=General',
  settingsModules: '/setari?tab=Module',
  settingsUsers: '/setari?tab=Utilizatori',
  settingsUpdates: '/setari?tab=Actualizări',
  settingsIntegrations: '/setari?tab=Integrări',
  legacyImport: '/import-date-vechi',
}

const onboardingCards = [
  {
    icon: '🧩',
    title: 'Alege modulele utile',
    description: 'Pornești cu ce folosește clientul azi și activezi restul treptat: HR, gestiune, contracte, contabilitate, documente sau operațiuni.',
    route: routes.audit,
    cta: 'Configurează',
  },
  {
    icon: '✅',
    title: 'Lucrul zilnic într-un singur loc',
    description: 'Task-urile, aprobările și alertele adună următorul pas pentru fiecare rol, fără să cauți prin toate modulele.',
    route: routes.tasks,
    cta: 'Vezi task-uri',
  },
  {
    icon: '📑',
    title: 'Contracte și documente legate',
    description: 'Emailurile, documentele, contractele și costurile pot fi urmărite împreună, pe dosar și pe responsabil.',
    route: routes.contracts,
    cta: 'Vezi contracte',
  },
]

const firstSteps = [
  {
    key: 'organization',
    step: '01',
    icon: '🏢',
    title: 'Configurează profilul organizației',
    description: 'Denumire, CUI/CIF, țară, limbă, monedă, fus orar și date de contact. Asta devine baza pentru rapoarte, documente și reguli locale.',
    route: routes.settingsGeneral,
    cta: 'Deschide General',
  },
  {
    key: 'modules',
    step: '02',
    icon: '🧩',
    title: 'Alege modulele utile',
    description: 'Activează doar modulele necesare clientului acum. Restul pot rămâne pregătite pentru extindere, fără să aglomereze interfața.',
    route: routes.settingsModules,
    cta: 'Alege module',
  },
  {
    key: 'users',
    step: '03',
    icon: '👥',
    title: 'Adaugă utilizatori și roluri',
    description: 'Creează oamenii cheie, departamentele și accesul potrivit. Fiecare utilizator trebuie să vadă doar ce îl ajută în lucru.',
    route: routes.settingsUsers,
    cta: 'Configurează utilizatori',
  },
  {
    key: 'email',
    step: '04',
    icon: '✉️',
    title: 'Leagă emailul organizațional',
    description: 'SMTP/IMAP transformă Mesaje în Inbox ERP real: emailuri, atașamente, task-uri și documente legate de dosare.',
    route: routes.settingsIntegrations,
    cta: 'Configurează integrări',
  },
  {
    key: 'import',
    step: '05',
    icon: '📥',
    title: 'Importă datele de pornire',
    description: 'Încarcă nomenclatoare, angajați, materiale, furnizori sau date istorice. Migrarea controlată scurtează mult onboardingul.',
    route: routes.legacyImport,
    cta: 'Import date',
  },
  {
    key: 'safety',
    step: '06',
    icon: '🛡️',
    title: 'Verifică backup și update',
    description: 'Înainte de lucru real, confirmă că backupul, actualizările și diagnosticele sunt clare. Aici câștigăm liniștea de producție.',
    route: routes.settingsUpdates,
    cta: 'Verifică sistem',
  },
]

function localDate(date) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

function lastDays(count) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date()
    date.setDate(date.getDate() - (count - 1 - index))
    return localDate(date)
  })
}

function isSnowSeason(date = new Date()) {
  const month = date.getMonth() + 1
  const day = date.getDate()
  return (month === 11 && day >= 15) ||
    month === 12 ||
    month === 1 ||
    month === 2 ||
    month === 3 ||
    (month === 4 && day <= 15)
}

function arrayFrom(data, keys) {
  if (Array.isArray(data)) return data
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key]
  }
  return []
}

function numberFrom(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function percent(value) {
  return Math.max(0, Math.min(100, numberFrom(value)))
}

function firstValue(source, keys, fallback = '') {
  for (const key of keys) {
    if (source?.[key] != null && source[key] !== '') return source[key]
  }
  return fallback
}

function enabledModuleKeys(settings = {}) {
  const value = settings.modules_enabled || settings.enabledModules || settings.modulesEnabled || settings.module_keys
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.map(String)
    } catch {
      return value.split(',').map(item => item.trim()).filter(Boolean)
    }
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).filter(([, enabled]) => Boolean(enabled)).map(([key]) => key)
  }
  return []
}

function statusText(status) {
  return String(status || 'necunoscut').replaceAll('_', ' ')
}

function displayText(value, fallback = '') {
  if (value == null || value === '') return fallback
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return value.map(item => displayText(item)).filter(Boolean).join(', ')
  }
  if (typeof value === 'object') {
    return displayText(
      value.message || value.title || value.titlu || value.name || value.Entity || value.entity || value.details || value.detalii,
      JSON.stringify(value)
    )
  }
  return fallback
}

function priorityTone(priority) {
  if (['critica', 'urgent', 'urgenta'].includes(String(priority))) return 'danger'
  if (['ridicata', 'mare'].includes(String(priority))) return 'warning'
  return 'neutral'
}

function documentRoute(document) {
  const id = document?.uuid || document?.id
  return id ? `${routes.documents}?document=${encodeURIComponent(String(id))}` : routes.documents
}

function documentTaskSourceId(document) {
  return document?.uuid || document?.id || document?.nr_document || ''
}

function userId(user) {
  return user?.id || user?.userId || user?.username || ''
}

function formatShortDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10)
  return date.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' })
}

function documentDueState(document) {
  const raw = document?.termen_limita || document?.due_date || document?.deadline
  if (!raw) return { label: 'fără termen', tone: 'neutral', sort: 30 }
  const due = new Date(raw)
  if (Number.isNaN(due.getTime())) return { label: String(raw).slice(0, 10), tone: 'neutral', sort: 25 }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dueDay = new Date(due)
  dueDay.setHours(0, 0, 0, 0)
  const diffDays = Math.round((dueDay - today) / 86400000)
  if (diffDays < 0) return { label: `întârziat ${Math.abs(diffDays)}z`, tone: 'danger', sort: 0 }
  if (diffDays === 0) return { label: 'azi', tone: 'danger', sort: 1 }
  if (diffDays === 1) return { label: 'mâine', tone: 'warning', sort: 2 }
  if (diffDays <= 3) return { label: `${diffDays} zile`, tone: 'warning', sort: 3 + diffDays }
  return { label: formatShortDate(raw), tone: 'neutral', sort: 20 + diffDays }
}

function watchedDueBucket(document) {
  const due = documentDueState(document)
  if (due.tone === 'danger') return { key: due.label === 'azi' ? 'today' : 'overdue', label: due.label === 'azi' ? 'Scad azi' : 'Întârziate', tone: 'danger', sort: due.label === 'azi' ? 1 : 0 }
  if (due.tone === 'warning') return { key: 'soon', label: 'Următoarele 3 zile', tone: 'warning', sort: 2 }
  if (due.label === 'fără termen') return { key: 'no_due', label: 'Fără termen', tone: 'neutral', sort: 4 }
  return { key: 'later', label: 'Termen viitor', tone: 'info', sort: 3 }
}

function currentStepAgeDays(document) {
  const raw = document?.current_step_created_at
  if (!raw) return null
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return null
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000))
}

function compactWorkflowKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

function workflowDocumentFlowsFromSettings(settings = {}) {
  return Array.isArray(settings.workflow_document_flows) ? settings.workflow_document_flows : []
}

function documentWorkflowKey(document) {
  return compactWorkflowKey(
    document?.tip_document ||
    document?.tip_id ||
    document?.document_type ||
    document?.type ||
    document?.categorie ||
    ''
  )
}

function escalationDaysForDocument(document, settings = {}) {
  const key = documentWorkflowKey(document)
  const flows = workflowDocumentFlowsFromSettings(settings)
  const flow = flows.find(item => item?.active !== false && [
    item.document_type,
    item.documentType,
    item.id,
    item.label,
  ].map(compactWorkflowKey).filter(Boolean).includes(key))
  const configured = Number(flow?.escalation_days ?? flow?.escalationDays)
  if (Number.isFinite(configured) && configured >= 0) return configured
  if (key.includes('contract')) return 3
  return 2
}

function watchedStepAgeBucket(document) {
  if (!document?.current_step_name && !document?.current_responsible_id) {
    return { key: 'no_step', label: 'Fără pas curent', tone: 'neutral', sort: 5 }
  }
  const age = currentStepAgeDays(document)
  if (age === null) return { key: 'unknown', label: 'Pas fără dată', tone: 'warning', sort: 4 }
  if (age >= 3) return { key: 'stalled_3d', label: '3+ zile în pas', tone: 'danger', sort: 0 }
  if (age >= 2) return { key: 'stalled_2d', label: '2 zile în pas', tone: 'warning', sort: 1 }
  return { key: 'fresh', label: '0–1 zile în pas', tone: 'info', sort: 2 }
}

function watchedDocumentNeedsEscalation(document, settings = {}) {
  const ageBucket = watchedStepAgeBucket(document)
  const age = currentStepAgeDays(document)
  const escalationDays = escalationDaysForDocument(document, settings)
  const due = documentDueState(document)
  return ['unknown', 'no_step'].includes(ageBucket.key) ||
    (age !== null && age >= escalationDays) ||
    due.tone === 'danger' ||
    ['urgent', 'critic', 'critica'].includes(String(document?.prioritate || document?.priority || '').toLowerCase())
}

function watchedEscalationLabel(document, settings = {}) {
  const age = currentStepAgeDays(document)
  const escalationDays = escalationDaysForDocument(document, settings)
  if (age === null) return `Prag ${escalationDays}z · pas fără dată`
  if (age >= escalationDays) return `Depășit pragul ${escalationDays}z`
  const remaining = Math.max(0, escalationDays - age)
  return `${remaining}z până la prag (${escalationDays}z)`
}

function currentResponsibleLabel(document) {
  return document?.current_responsible_label ||
    (document?.current_responsible_id ? `Responsabil #${document.current_responsible_id}` : '') ||
    (String(document?.status || '').toLowerCase() === 'draft' ? 'În draft' : 'Fără responsabil curent')
}

function watchedTypeLabel(document) {
  return document?.tip_document_label || document?.tip_document || document?.tip_id || 'Document'
}

function groupedWatchedInsights(documents = []) {
  const add = (map, key, label, tone = 'neutral', sort = 30) => {
    const current = map.get(key) || { key, label, count: 0, tone, sort }
    current.count += 1
    current.tone = current.tone === 'danger' || tone === 'danger' ? 'danger' : (current.tone === 'warning' || tone === 'warning' ? 'warning' : tone)
    current.sort = Math.min(current.sort, sort)
    map.set(key, current)
  }
  const due = new Map()
  const responsible = new Map()
  const type = new Map()
  const age = new Map()
  documents.forEach(document => {
    const dueBucket = watchedDueBucket(document)
    const ageBucket = watchedStepAgeBucket(document)
    add(due, dueBucket.key, dueBucket.label, dueBucket.tone, dueBucket.sort)
    add(responsible, currentResponsibleLabel(document), currentResponsibleLabel(document), document.current_responsible_id ? 'info' : 'warning')
    add(type, watchedTypeLabel(document), watchedTypeLabel(document), 'neutral')
    add(age, ageBucket.key, ageBucket.label, ageBucket.tone, ageBucket.sort)
  })
  const list = map => Array.from(map.values()).sort((a, b) => a.sort - b.sort || b.count - a.count || a.label.localeCompare(b.label, 'ro')).slice(0, 4)
  return {
    due: list(due),
    responsible: list(responsible),
    type: list(type),
    age: list(age),
  }
}

function documentTitle(document) {
  return document?.nr_document || document?.titlu || document?.title || `Document #${document?.id || ''}`.trim()
}

function documentSubtitle(document) {
  return [
    document?.tip_document || document?.type || document?.tip || 'document',
    document?.departament || document?.dept_initiatoare || document?.department,
  ].filter(Boolean).join(' · ')
}

function assetIsActive(asset) {
  const status = String(asset.status || asset.stare || '').toLowerCase()
  return ['activ', 'active', 'in_lucru', 'ocupat', 'disponibil', 'available'].includes(status)
}

function projectName(project) {
  return project.denumire || project.name || project.titlu || project.cod || `Proiect #${project.id}`
}

function compactIdentity(user) {
  return [
    user?.role,
    user?.role_name,
    user?.rol,
    user?.department,
    user?.department_name,
    user?.departament,
    user?.username,
  ].filter(Boolean).join(' ').toLowerCase()
}

function dashboardProfile(user) {
  const identity = compactIdentity(user)
  if (['superadmin', 'admin', 'director', 'manager'].some(token => identity.includes(token))) {
    return {
      key: 'executive',
      label: 'Profil executiv',
      domains: ['tasks', 'contracts', 'documents', 'tickets', 'stocks', 'projects', 'hr', 'accounting'],
      hint: 'Vezi blocajele care pot opri operațiunea sau decizia.',
    }
  }
  if (identity.includes('hr') || identity.includes('resurse') || identity.includes('uman')) {
    return {
      key: 'hr',
      label: 'Profil HR',
      domains: ['tasks', 'hr', 'documents', 'contracts'],
      hint: 'Prioritate pe oameni, cereri, documente și dosare.',
    }
  }
  if (identity.includes('contab') || identity.includes('financ') || identity.includes('economic')) {
    return {
      key: 'accounting',
      label: 'Profil financiar extins',
      domains: ['tasks', 'accounting', 'documents', 'contracts', 'hr', 'stocks'],
      hint: 'Contabilitatea vede semnalele financiare și datele operaționale care ajung în contabilitate.',
    }
  }
  if (identity.includes('achiz') || identity.includes('procurement') || identity.includes('jurid')) {
    return {
      key: 'procurement',
      label: 'Profil achiziții',
      domains: ['tasks', 'contracts', 'documents', 'stocks'],
      hint: 'Prioritate pe contracte, documente și aprovizionare.',
    }
  }
  if (identity.includes('mecan') || identity.includes('flot') || identity.includes('teren') || identity.includes('operat')) {
    return {
      key: 'operations',
      label: 'Profil operațional',
      domains: ['tasks', 'tickets', 'stocks', 'projects'],
      hint: 'Prioritate pe teren, sesizări și resurse operaționale.',
    }
  }
  return {
    key: 'general',
    label: 'Profil general',
    domains: ['tasks', 'documents', 'tickets', 'contracts', 'stocks', 'projects'],
    hint: 'Priorități generale din modulele disponibile.',
  }
}

function projectProgress(project) {
  return percent(
    project.progress?.progres_fizic_procent ??
    project.progres_fizic_procent ??
    project.progressPercent ??
    project.progress ??
    0
  )
}

function buildFirstStepsStatus(data, baseSteps) {
  const settings = data.settings?.settings || data.settings || {}
  const users = arrayFrom(data.users, ['users', 'items', 'data'])
  const activeUsers = users.filter(item => item?.active !== false)
  const modules = enabledModuleKeys(settings)
  const configurableModules = modules.filter(key => !['core', 'inventory', 'production', 'reports', 'system'].includes(String(key)))
  const backup = data.backupStatus?.backup || data.backupStatus || {}
  const latestBackup = backup.latest || backup.last || null
  const update = data.updateStatus || {}
  const emailStatus = data.emailSyncStatus?.status || data.emailSyncStatus || {}

  const companyName = firstValue(settings, ['companyName', 'company_name', 'firma', 'nume_companie', 'company'])
  const companyCif = firstValue(settings, ['companyCif', 'company_cif', 'cui', 'cif'])
  const hasCountryProfile = Boolean(
    firstValue(settings, ['country', 'jurisdiction']) &&
    firstValue(settings, ['locale', 'language']) &&
    firstValue(settings, ['currency']) &&
    firstValue(settings, ['timezone', 'timeZone'])
  )
  const hasEmail = Boolean(
    firstValue(settings, ['smtp_host', 'smtpHost']) &&
    firstValue(settings, ['smtp_user', 'smtpUser', 'smtp_name', 'email'])
  ) || Boolean(
    firstValue(settings, ['imap_host', 'imapHost']) &&
    firstValue(settings, ['imap_user', 'imapUser'])
  ) || Boolean(emailStatus.enabled || emailStatus.last_auto_sync_at || emailStatus.lastManualSyncAt)
  const hasStarterData = [
    arrayFrom(data.stockOperations, ['movements', 'operations', 'items']),
    arrayFrom(data.fleetAssets, ['assets', 'fleetAssets']),
    arrayFrom(data.projects, ['projects', 'items']),
    arrayFrom(data.inboxDocuments, ['documents', 'items']),
  ].some(list => list.length > 0)

  const statusByKey = {
    organization: {
      done: Boolean(companyName && companyCif && hasCountryProfile),
      detail: companyName && companyCif
        ? (hasCountryProfile ? `${companyName} · profil regional complet` : `${companyName} · lipsește profilul regional complet`)
        : 'Lipsește denumirea/CUI sau profilul regional.',
    },
    modules: {
      done: configurableModules.length > 0,
      detail: configurableModules.length
        ? `${configurableModules.length} module configurabile active.`
        : 'Alege modulele comerciale utile clientului.',
    },
    users: {
      done: activeUsers.length > 1,
      detail: activeUsers.length > 1
        ? `${activeUsers.length} utilizatori activi.`
        : 'Adaugă cel puțin un utilizator de lucru pe lângă administrator.',
    },
    email: {
      done: hasEmail,
      detail: hasEmail
        ? (emailStatus.last_auto_sync_at ? `Email conectat · ultim sync ${new Date(emailStatus.last_auto_sync_at).toLocaleString('ro-RO')}` : 'Email organizațional configurat.')
        : 'Configurează SMTP/IMAP pentru Inbox ERP și notificări.',
    },
    import: {
      done: hasStarterData,
      detail: hasStarterData
        ? 'Există date operaționale detectate în module.'
        : 'Importă sau creează primele date de lucru.',
    },
    safety: {
      done: Boolean(latestBackup || update.version || update.last_update),
      detail: latestBackup
        ? `Backup disponibil: ${latestBackup.name || 'ultimul backup'}`
        : (update.version || update.last_update ? 'Status update disponibil; verifică backupul înainte de producție.' : 'Verifică backupul și update-ul înainte de lucru real.'),
    },
  }

  const steps = baseSteps.map(step => ({
    ...step,
    done: Boolean(statusByKey[step.key]?.done),
    detail: statusByKey[step.key]?.detail || step.description,
  }))
  const done = steps.filter(step => step.done).length
  const next = steps.find(step => !step.done) || null
  return {
    steps,
    done,
    total: steps.length,
    percent: steps.length ? Math.round((done / steps.length) * 100) : 100,
    next,
  }
}

function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-md bg-slate-200 ${className}`} />
}

function SectionError({ error }) {
  if (!error) return null
  return (
    <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
      Nu am putut incarca datele. Verifica API-ul sau permisiunile.
    </div>
  )
}

function KpiCard({ icon, label, value, loading, error, onClick }) {
  return (
    <button className="min-w-0 text-left" onClick={onClick}>
      <Card className="h-full border-slate-200/90 transition hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-md">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
            {loading ? <Skeleton className="mt-3 h-8 w-16" /> : (
              <div className="mt-1 text-2xl font-bold text-slate-950">{value}</div>
            )}
          </div>
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-panel)] border border-primary-100 bg-primary-50 text-lg">
            {icon}
          </div>
        </div>
        {error ? <p className="mt-3 text-xs text-rose-600">Date indisponibile.</p> : null}
      </Card>
    </button>
  )
}

function DirectorDemoPanel({ user, onNavigate, onResetDemo, resettingDemo }) {
  const canResetDemo = user?.username === 'demo' || user?.role === 'superadmin'
  const steps = [
    { label: 'Achiziții', value: 'Referate și aprobări', route: routes.referate, action: 'Vezi flux' },
    { label: 'Operațiuni', value: 'Resurse, alocări și alerte', route: routes.mecanizare, action: 'Vezi resurse' },
    { label: 'Oameni', value: 'Pontaj, concedii, scadențe', route: routes.hr, action: 'Vezi HR' },
    { label: 'Control', value: 'Bugete, costuri și contracte', route: routes.controlling, action: 'Vezi control' },
  ]
  const checklist = [
    'Manager: vede cererile care cer decizie',
    'Responsabil: alocă resursele și setează termenul',
    'Angajat: primește task-ul în Kiosk sau în aplicație',
    'Echipa: închide activitatea cu documente și dovezi'
  ]

  return (
    <Card className="border-primary-200 bg-gradient-to-br from-primary-50 via-white to-slate-50">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-primary-700">Demo operațional</div>
          <h3 className="mt-1 text-lg font-bold text-slate-900">Flux rapid pentru orice organizație</h3>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Contul de management vede zona de decizie: aprobări, alerte, oameni, contracte și costuri — indiferent de domeniul firmei.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => onNavigate(routes.referate)}>Deschide referatele</Button>
          {canResetDemo ? (
            <Button variant="secondary" disabled={resettingDemo} onClick={onResetDemo}>
              {resettingDemo ? 'Se resetează...' : 'Resetează demo'}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {steps.map(step => (
          <button
            key={step.label}
            className="rounded-[var(--radius-panel)] border border-slate-100 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-md"
            onClick={() => onNavigate(step.route)}
          >
            <div className="text-xs font-semibold uppercase text-slate-500">{step.label}</div>
            <div className="mt-1 min-h-10 text-sm font-semibold text-slate-900">{step.value}</div>
            <div className="mt-3 text-xs font-semibold text-primary-700">{step.action}</div>
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-2 rounded-[var(--radius-panel)] border border-primary-100 bg-white/75 p-3 text-sm text-slate-700 md:grid-cols-4">
        {checklist.map((item, index) => (
          <div key={item} className="flex items-start gap-2">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary-600 text-[11px] font-bold text-white">{index + 1}</span>
            <span>{item}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function hoursLabel(h) {
  if (h == null) return '—'
  if (h < 1) return '<1h'
  if (h < 24) return `${Math.round(h)}h`
  return `${Math.floor(h / 24)}z ${Math.round(h % 24)}h`
}

function CommandCenterPanel({ data, loading, error, onNavigate }) {
  const cc = data?.commandCenter
  const blocked = cc?.documentsBlocked || []
  const unassigned = cc?.ticketsUnassigned || []
  const critical = cc?.ticketsCritical || []
  const unread = cc?.counts?.unreadMessages ?? cc?.unreadMessages ?? 0

  const hasAlerts = blocked.length > 0 || unassigned.length > 0 || critical.length > 0

  if (!loading && !hasAlerts && !error) return null

  return (
    <div className="rounded-[var(--radius-panel)] border border-rose-300 bg-rose-50/70 p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🚨</span>
          <div>
            <h3 className="text-base font-bold uppercase tracking-wide text-rose-800">Centru de Comandă</h3>
            <p className="text-xs text-rose-600">Situații care necesită atenție imediată</p>
          </div>
        </div>
        {!loading && (
          <div className="flex gap-2">
            {blocked.length > 0 && (
              <span className="rounded-full bg-rose-200 px-3 py-0.5 text-xs font-semibold text-rose-800">
                {blocked.length} doc. blocate
              </span>
            )}
            {unassigned.length > 0 && (
              <span className="rounded-full bg-amber-200 px-3 py-0.5 text-xs font-semibold text-amber-800">
                {unassigned.length} sesiz. neasignate
              </span>
            )}
            {unread > 0 && (
              <span className="rounded-full bg-sky-200 px-3 py-0.5 text-xs font-semibold text-sky-800">
                {unread} mesaje necitite
              </span>
            )}
          </div>
        )}
      </div>

      <SectionError error={error} />

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Documente blocate */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-semibold text-rose-700">📄 Documente blocate (&gt;48h fără acțiune)</span>
            </div>
            {blocked.length === 0 ? (
              <p className="rounded-md border border-dashed border-rose-200 py-4 text-center text-xs text-rose-400">
                Niciun document blocat ✓
              </p>
            ) : (
              <div className="grid gap-1.5">
                {blocked.slice(0, 5).map(doc => (
                  <button
                    key={doc.id || doc.uuid}
                    onClick={() => onNavigate(documentRoute(doc))}
                    className="flex items-center justify-between gap-2 rounded-md border border-rose-200 bg-white px-3 py-2 text-left transition hover:border-rose-400 hover:shadow-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium text-slate-800">
                        {doc.nr_document || doc.titlu || `Doc #${doc.id}`}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {doc.tip_document || doc.type || 'document'} · {doc.departament || ''}
                      </div>
                    </div>
                    <span className="shrink-0 rounded bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                      {hoursLabel(doc.hoursBlocked)}
                    </span>
                  </button>
                ))}
                {blocked.length > 5 && (
                  <button
                    onClick={() => onNavigate('/documente')}
                    className="text-xs text-rose-600 hover:underline"
                  >
                    + {blocked.length - 5} mai multe →
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Tickets fără responsabil */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-semibold text-amber-700">🎫 Sesizări fără responsabil (&gt;4h)</span>
            </div>
            {unassigned.length === 0 && critical.length === 0 ? (
              <p className="rounded-md border border-dashed border-amber-200 py-4 text-center text-xs text-amber-400">
                Toate sesizările au responsabil ✓
              </p>
            ) : (
              <div className="grid gap-1.5">
                {critical.slice(0, 3).map(ticket => (
                  <button
                    key={ticket.uuid || ticket.id}
                    onClick={() => onNavigate('/sesizari')}
                    className="flex items-center justify-between gap-2 rounded-md border border-rose-200 bg-white px-3 py-2 text-left transition hover:border-rose-400 hover:shadow-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium text-slate-800">
                        {ticket.titlu || ticket.title || `Sesizare #${ticket.id}`}
                      </div>
                      <div className="text-[11px] text-rose-600 font-semibold">
                        ⚠ {ticket.prioritate || ticket.priority || 'critica'}
                      </div>
                    </div>
                    <span className="shrink-0 rounded bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                      {hoursLabel(ticket.hoursOpen)}
                    </span>
                  </button>
                ))}
                {unassigned.slice(0, 4).map(ticket => (
                  <button
                    key={ticket.uuid || ticket.id}
                    onClick={() => onNavigate('/sesizari')}
                    className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-white px-3 py-2 text-left transition hover:border-amber-400 hover:shadow-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium text-slate-800">
                        {ticket.titlu || ticket.title || `Sesizare #${ticket.id}`}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Fără responsabil · {ticket.departament || ''}
                      </div>
                    </div>
                    <span className="shrink-0 rounded bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                      {hoursLabel(ticket.hoursOpen)}
                    </span>
                  </button>
                ))}
                {(unassigned.length + critical.length) > 7 && (
                  <button
                    onClick={() => onNavigate('/sesizari')}
                    className="text-xs text-amber-600 hover:underline"
                  >
                    + {unassigned.length + critical.length - 7} mai multe →
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MiniTable({ columns, rows, empty }) {
  if (!rows.length) return <p className="py-6 text-sm text-slate-500">{empty}</p>
  return (
    <div className="overflow-hidden rounded-md border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
          <tr>
            {columns.map(column => <th key={column.key} className="px-3 py-2">{column.label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr key={row.id || row.uuid || index}>
              {columns.map(column => (
                <td key={column.key} className="px-3 py-2 text-slate-700">
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function WatchedInsightCard({ title, group, items = [], empty, onOpenGroup }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3">
      <div className="mb-2 text-sm font-semibold text-slate-800">{title}</div>
      <div className="grid gap-2">
        {items.length ? items.map(item => (
          <button
            key={item.key}
            type="button"
            className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 text-left transition hover:bg-primary-50"
            onClick={() => onOpenGroup?.(group, item)}
            title="Vezi documentele din acest grup"
          >
            <span className="min-w-0 truncate text-xs font-medium text-slate-700">{item.label}</span>
            <Badge tone={item.tone}>{item.count}</Badge>
          </button>
        )) : <p className="text-xs text-slate-500">{empty}</p>}
      </div>
    </div>
  )
}

function WatchedDocumentsPanel({
  documents = [],
  notifications = [],
  summary = {},
  settings = {},
  loading,
  error,
  actionLoading,
  onCreateTask,
  onOpenGroup,
  onNavigate,
  onUnwatch,
}) {
  const unread = Number(summary.unread_activity ?? notifications.length ?? 0)
  const overdue = Number(summary.overdue || 0)
  const urgent = Number(summary.urgent || 0)
  const inCircuit = Number(summary.in_circuit || 0)
  const topDocuments = documents.slice(0, 4)
  const topNotifications = notifications.slice(0, 3)
  const insights = groupedWatchedInsights(documents)
  const escalationCount = documents.filter(document => watchedDocumentNeedsEscalation(document, settings)).length
  const attentionTone = overdue ? 'danger' : unread ? 'warning' : documents.length ? 'info' : 'neutral'

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Documente urmărite</h3>
          <p className="text-xs text-slate-500">Radarul tău personal: activitate nouă, termene și documente puse sub observație.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={attentionTone}>{documents.length} urmărite</Badge>
          {unread ? <Badge tone="warning">{unread} activități noi</Badge> : null}
          {escalationCount ? <Badge tone="danger">{escalationCount} escaladări</Badge> : null}
          {escalationCount ? (
            <Button size="sm" variant="secondary" onClick={() => onNavigate(`${routes.documents}?filter=escalations`)}>Vezi escaladări</Button>
          ) : null}
          <Button size="sm" variant="secondary" onClick={() => onNavigate(`${routes.documents}?filter=watched`)}>Vezi urmărite</Button>
        </div>
      </div>
      <SectionError error={error} />
      {loading ? (
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {[1, 2, 3, 4].map(item => <Skeleton key={item} className="h-20" />)}
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-xs text-slate-500">În circuit</div>
              <div className="text-xl font-semibold text-slate-900">{inCircuit}</div>
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
              <div className="text-xs text-amber-700">Activitate nouă</div>
              <div className="text-xl font-semibold text-amber-900">{unread}</div>
            </div>
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2">
              <div className="text-xs text-rose-700">Întârziate</div>
              <div className="text-xl font-semibold text-rose-900">{overdue}</div>
            </div>
            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
              <div className="text-xs text-blue-700">Urgente</div>
              <div className="text-xl font-semibold text-blue-900">{urgent}</div>
            </div>
          </div>

          {documents.length ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-4">
              <WatchedInsightCard title="După termen" group="due" items={insights.due} empty="Nu există termene urmărite." onOpenGroup={onOpenGroup} />
              <WatchedInsightCard title="După responsabil" group="owner" items={insights.responsible} empty="Nu există responsabili în circuit." onOpenGroup={onOpenGroup} />
              <WatchedInsightCard title="După tip document" group="type" items={insights.type} empty="Nu există tipuri de document." onOpenGroup={onOpenGroup} />
              <WatchedInsightCard title="După vechime pas" group="age" items={insights.age} empty="Nu există pași curenți." onOpenGroup={onOpenGroup} />
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-md border border-slate-200 p-3">
              <div className="mb-2 text-sm font-semibold text-slate-800">Ultimele documente urmărite</div>
              <div className="grid gap-2">
                {topDocuments.length ? topDocuments.map(document => {
                  const due = documentDueState(document)
                  const ageBucket = watchedStepAgeBucket(document)
                  const age = currentStepAgeDays(document)
                  const isEscalated = watchedDocumentNeedsEscalation(document, settings)
                  const key = documentTaskSourceId(document)
                  return (
                    <div
                      key={key || document.uuid || document.id}
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 transition hover:border-primary-200 hover:shadow-sm"
                    >
                      <button type="button" className="w-full text-left" onClick={() => onNavigate(documentRoute(document))}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-900">{documentTitle(document)}</div>
                            <div className="truncate text-xs text-slate-500">{documentSubtitle(document)}</div>
                          </div>
                          <Badge tone={due.tone}>{due.label}</Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                          <span>{statusText(document.status)}</span>
                          <span>·</span>
                          <span>{formatShortDate(document.updated_at || document.created_at) || 'fără dată'}</span>
                          <span>·</span>
                          <span className={ageBucket.tone === 'danger' ? 'font-semibold text-rose-700' : ageBucket.tone === 'warning' ? 'font-semibold text-amber-700' : ''}>
                            {age === null ? ageBucket.label : `${age}z în pas`}
                          </span>
                          <span>·</span>
                          <span className={isEscalated ? 'font-semibold text-rose-700' : 'text-slate-500'}>
                            {watchedEscalationLabel(document, settings)}
                          </span>
                        </div>
                      </button>
                      <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-2">
                        <button
                          type="button"
                          className="rounded-md border border-primary-100 bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700 transition hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={Boolean(actionLoading)}
                          onClick={() => onCreateTask(document)}
                        >
                          {actionLoading === `task-${key}` ? 'Creez...' : 'Task'}
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={Boolean(actionLoading)}
                          onClick={() => onUnwatch(document)}
                        >
                          {actionLoading === `unwatch-${key}` ? 'Scot...' : 'Nu mai urmări'}
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                          onClick={() => onNavigate(documentRoute(document))}
                        >
                          Deschide
                        </button>
                      </div>
                    </div>
                  )
                }) : <p className="py-3 text-sm text-slate-500">Nu ai documente urmărite încă. Marchează cu steaua documentele importante.</p>}
              </div>
            </div>

            <div className="rounded-md border border-slate-200 p-3">
              <div className="mb-2 text-sm font-semibold text-slate-800">Activitate nouă pe urmărite</div>
              <div className="grid gap-2">
                {topNotifications.length ? topNotifications.map(notification => (
                  <button
                    key={notification.id || notification.key}
                    className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-left transition hover:border-amber-300 hover:shadow-sm"
                    onClick={() => onNavigate(notification.targetView || routes.documents)}
                  >
                    <div className="text-sm font-semibold text-slate-900">{notification.title || 'Document urmărit'}</div>
                    <div className="mt-1 line-clamp-2 text-xs text-slate-600">{notification.detail || notification.message || 'Activitate nouă pe document.'}</div>
                    <div className="mt-2 text-xs text-amber-700">{formatShortDate(notification.createdAt || notification.created_at) || 'recent'}</div>
                  </button>
                )) : <p className="py-3 text-sm text-slate-500">Nu există activitate nouă pe documentele urmărite.</p>}
              </div>
            </div>
          </div>
        </>
      )}
    </Card>
  )
}

function DocumentWorklistPanel({ inboxDocuments = [], blockedDocuments = [], loading, error, onNavigate }) {
  const blockedById = new Map(blockedDocuments.map(document => [String(document.uuid || document.id), document]))
  const merged = [
    ...blockedDocuments.map(document => ({
      ...document,
      _source: 'blocked',
      _blockedHours: document.hoursBlocked,
    })),
    ...inboxDocuments
      .filter(document => !blockedById.has(String(document.uuid || document.id)))
      .map(document => ({
        ...document,
        _source: 'inbox',
      })),
  ]
    .map(document => ({
      ...document,
      _due: documentDueState(document),
      _priorityTone: document._source === 'blocked' ? 'danger' : priorityTone(document.prioritate || document.priority),
    }))
    .sort((a, b) => {
      const blockedDiff = (a._source === 'blocked' ? 0 : 1) - (b._source === 'blocked' ? 0 : 1)
      if (blockedDiff) return blockedDiff
      return (a._due?.sort ?? 99) - (b._due?.sort ?? 99)
    })

  const blockedCount = blockedDocuments.length
  const inboxCount = inboxDocuments.length

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Documente care cer acțiune</h3>
          <p className="text-xs text-slate-500">Inbox, blocaje și termene într-o singură listă scurtă.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {blockedCount ? <Badge tone="danger">{blockedCount} blocate</Badge> : null}
          {inboxCount ? <Badge tone="warning">{inboxCount} în inbox</Badge> : null}
          <Button size="sm" variant="secondary" onClick={() => onNavigate(routes.documents)}>Vezi toate</Button>
        </div>
      </div>
      <SectionError error={error} />
      <div className="grid gap-2">
        {loading ? [1, 2, 3].map(item => <Skeleton key={item} className="h-14" />) : (
          merged.length ? merged.slice(0, 6).map(document => (
            <button
              key={`${document._source}-${document.uuid || document.id}`}
              className={`rounded-md border px-3 py-2 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${
                document._source === 'blocked'
                  ? 'border-rose-200 bg-rose-50/60 hover:border-rose-300'
                  : 'border-slate-200 bg-white hover:border-primary-200'
              }`}
              onClick={() => onNavigate(documentRoute(document))}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">{documentTitle(document)}</div>
                  <div className="truncate text-xs text-slate-500">{documentSubtitle(document)}</div>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  {document._source === 'blocked' ? <Badge tone="danger">{hoursLabel(document._blockedHours)}</Badge> : null}
                  <Badge tone={document._due.tone}>{document._due.label}</Badge>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-slate-100 px-2 py-0.5">
                  {document._source === 'blocked' ? 'blocaj circuit' : 'așteaptă aprobarea ta'}
                </span>
                <Badge tone={document._priorityTone}>{document.prioritate || document.priority || statusText(document.status)}</Badge>
              </div>
            </button>
          )) : <p className="py-5 text-sm text-slate-500">Nu sunt documente de aprobat sau blocaje vizibile.</p>
        )}
      </div>
    </Card>
  )
}

function buildTodayActions(view, profile = dashboardProfile(null)) {
  const actions = []
  const contractRiskTotal = numberFrom(view.contractsDashboard?.risk_summary?.total)
  const contractAlerts = arrayFrom(view.contractsDashboard, ['alerts'])
  const contractTasksOpen = view.contractsTasks.filter(task => !['done', 'rezolvat', 'closed', 'inchis'].includes(String(task.status || '').toLowerCase()))
  const contractTasksOverdue = contractTasksOpen.filter(task => {
    const due = task.due_date || task.scadenta || task.deadline
    return due && new Date(due) < new Date()
  })
  const myTasksOpen = view.myTasks.filter(task => !['done', 'cancelled'].includes(String(task.status || 'open')))
  const myTasksOverdue = myTasksOpen.filter(task => task.due_date && new Date(task.due_date) < new Date())
  const leaveRequestsPending = view.leaveRequests.filter(request => ['cerut', 'pending', 'in_asteptare', 'solicitat'].includes(String(request.status || '').toLowerCase()))

  if (myTasksOpen.length) {
    actions.push({
      key: 'my_tasks',
      domain: 'tasks',
      icon: '✅',
      tone: myTasksOverdue.length ? 'danger' : 'warning',
      weight: myTasksOverdue.length ? 105 : 88,
      title: myTasksOverdue.length ? `${myTasksOverdue.length} task-uri întârziate` : `${myTasksOpen.length} task-uri deschise`,
      description: myTasksOverdue.length ? 'Ai task-uri trecute de scadență care merită închise sau replanificate.' : 'Lista ta de lucru pentru azi este disponibilă în Task-uri.',
      route: routes.tasks,
      cta: 'Deschide task-uri',
    })
  }

  if (view.inboxDocuments.length) {
    actions.push({
      key: 'documents',
      domain: 'documents',
      icon: '📋',
      tone: 'warning',
      weight: 90,
      title: `${view.inboxDocuments.length} documente de aprobat`,
      description: 'Ai documente în inbox care pot bloca fluxuri interne dacă rămân acolo.',
      route: routes.documents,
      cta: 'Deschide inbox',
    })
  }

  if (contractRiskTotal || contractTasksOverdue.length || contractAlerts.length) {
    const details = [
      contractRiskTotal ? `${contractRiskTotal} contracte cu risc` : null,
      contractTasksOverdue.length ? `${contractTasksOverdue.length} task-uri întârziate` : null,
      contractAlerts.length ? `${contractAlerts.length} alerte` : null,
    ].filter(Boolean).join(' · ')
    actions.push({
      key: 'contracts',
      domain: 'contracts',
      icon: '📑',
      tone: contractTasksOverdue.length || contractRiskTotal ? 'danger' : 'warning',
      weight: contractTasksOverdue.length || contractRiskTotal ? 100 : 80,
      title: 'Contracte care cer atenție',
      description: details || 'Există semnale operaționale pe portofoliul de contracte.',
      route: routes.contracts,
      cta: 'Vezi contracte',
    })
  } else if (contractTasksOpen.length) {
    actions.push({
      key: 'contract_tasks',
      domain: 'contracts',
      icon: '🧭',
      tone: 'info',
      weight: 55,
      title: `${contractTasksOpen.length} task-uri contractuale deschise`,
      description: 'Sunt lucruri de închis în dosarele de contract, chiar dacă nu sunt urgente.',
      route: routes.contracts,
      cta: 'Vezi task-uri',
    })
  }

  if (view.tickets.length) {
    const urgentTickets = view.tickets.filter(ticket => ['critica', 'critic', 'urgent', 'urgenta'].includes(String(ticket.prioritate || ticket.priority || '').toLowerCase()))
    actions.push({
      key: 'tickets',
      domain: 'tickets',
      icon: '🎫',
      tone: urgentTickets.length ? 'danger' : 'warning',
      weight: urgentTickets.length ? 95 : 70,
      title: urgentTickets.length ? `${urgentTickets.length} sesizări urgente` : `${view.tickets.length} sesizări deschise`,
      description: urgentTickets.length ? 'Prioritățile critice trebuie repartizate sau închise rapid.' : 'Există sesizări active care merită verificate azi.',
      route: routes.tickets,
      cta: 'Deschide sesizări',
    })
  }

  if (view.criticalStocks.length) {
    actions.push({
      key: 'stocks',
      domain: 'stocks',
      icon: '📦',
      tone: 'warning',
      weight: 65,
      title: `${view.criticalStocks.length} materiale sub minim`,
      description: 'Stocurile critice pot genera întârzieri în operațiuni, livrări, producție sau servicii.',
      route: routes.stock,
      cta: 'Vezi stocuri',
    })
  }

  if (leaveRequestsPending.length) {
    actions.push({
      key: 'hr_leave',
      domain: 'hr',
      icon: '🌴',
      tone: 'warning',
      weight: 78,
      title: `${leaveRequestsPending.length} cereri HR în așteptare`,
      description: 'Cereri de concediu sau absență care au nevoie de verificare/aprobare.',
      route: routes.hr,
      cta: 'Deschide HR',
    })
  }

  if (view.accountingSummary?.status && String(view.accountingSummary.status).toLowerCase() !== 'ok') {
    actions.push({
      key: 'accounting_status',
      domain: 'accounting',
      icon: '💰',
      tone: 'warning',
      weight: 72,
      title: 'Contabilitate necesită verificare',
      description: displayText(view.accountingSummary.message || view.accountingSummary.status, 'Există semnale financiare care merită verificate.'),
      route: routes.accounting,
      cta: 'Vezi contabilitate',
    })
  }

  if (profile.key === 'accounting') {
    const upstreamSignals = [
      leaveRequestsPending.length ? `${leaveRequestsPending.length} cereri HR` : null,
      view.criticalStocks.length ? `${view.criticalStocks.length} stocuri critice` : null,
      contractRiskTotal ? `${contractRiskTotal} contracte cu risc` : null,
      contractTasksOpen.length ? `${contractTasksOpen.length} task-uri contracte` : null,
    ].filter(Boolean)
    if (upstreamSignals.length) {
      actions.push({
        key: 'accounting_upstream',
        domain: 'accounting',
        icon: '🧾',
        tone: 'info',
        weight: 74,
        title: 'Date operaționale pentru contabilitate',
        description: `Semnale din modulele care alimentează contabilitatea: ${upstreamSignals.join(' · ')}.`,
        route: routes.accounting,
        cta: 'Vezi sinteză',
      })
    }
  }

  if (!view.projects.length) {
    actions.push({
      key: 'projects_empty',
      domain: 'projects',
      icon: '🗺️',
      tone: 'info',
      weight: 20,
      title: 'Nu există proiecte active afișate',
      description: 'Poți porni sau importa proiecte pentru urmărire de teren, costuri și execuție.',
      route: routes.projects,
      cta: 'Vezi teren',
    })
  }

  return actions
    .map(action => {
      const focused = profile.domains?.includes(action.domain)
      const isCritical = action.tone === 'danger'
      return {
        ...action,
        focused,
        weight: action.weight + (focused ? 25 : isCritical ? 10 : -20),
      }
    })
    .filter(action => profile.key === 'executive' || profile.key === 'general' || action.focused || action.tone === 'danger')
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 6)
}

function TodayActionsPanel({ actions, profile, loading, error, onNavigate }) {
  return (
    <Card className="border-primary-100 bg-gradient-to-br from-white via-primary-50/40 to-slate-50">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-primary-700">Priorități</div>
          <h3 className="mt-1 text-lg font-bold text-slate-900">Ce ai de făcut azi</h3>
          <p className="mt-1 text-sm text-slate-600">
            {profile?.hint || 'Semnale agregate din modulele active, ca să nu cauți manual prin aplicație.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {profile?.label ? <Badge tone="info">{profile.label}</Badge> : null}
          {!loading && actions.length ? <Badge tone={actions[0].tone}>{actions.length} recomandări</Badge> : null}
        </div>
      </div>

      <SectionError error={error} />

      {loading ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map(item => <Skeleton key={item} className="h-28" />)}
        </div>
      ) : actions.length ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {actions.map(action => (
            <button
              key={action.key}
              className="rounded-[var(--radius-panel)] border border-slate-100 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-md"
              onClick={() => onNavigate(action.route)}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-xl">{action.icon}</span>
                <Badge tone={action.tone} size="sm">{action.tone === 'danger' ? 'urgent' : action.tone === 'warning' ? 'atenție' : 'info'}</Badge>
              </div>
              <div className="mt-3 text-sm font-semibold text-slate-900">{action.title}</div>
              <p className="mt-1 min-h-10 text-xs text-slate-500">{action.description}</p>
              <div className="mt-3 text-xs font-semibold text-primary-700">{action.cta} →</div>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-[var(--radius-panel)] border border-primary-100 bg-white px-4 py-5 text-sm text-primary-800">
          ✅ Nu apar blocaje evidente azi. Portofoliul arată curat; poți continua cu lucru planificat sau verificări de rutină.
        </div>
      )}
    </Card>
  )
}

function CommercialOnboardingPanel({ onNavigate }) {
  return (
    <Card className="border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Start rapid</div>
          <h3 className="mt-1 text-lg font-bold text-slate-900">InfraFlow se adaptează pe firma clientului</h3>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Prima pagină trebuie să arate următorul pas, nu domeniul implicit. Modulele pot acoperi producție, servicii, depozite, contracte, HR, contabilitate sau operațiuni de teren.
          </p>
        </div>
        <Badge tone="info">ERP modular</Badge>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {onboardingCards.map(card => (
          <button
            key={card.title}
            className="rounded-[var(--radius-panel)] border border-slate-100 bg-slate-50/70 p-3 text-left transition hover:-translate-y-0.5 hover:border-primary-200 hover:bg-white hover:shadow-md"
            onClick={() => onNavigate(card.route)}
          >
            <div className="text-xl">{card.icon}</div>
            <div className="mt-2 text-sm font-semibold text-slate-900">{card.title}</div>
            <p className="mt-1 min-h-12 text-xs text-slate-500">{card.description}</p>
            <div className="mt-3 text-xs font-semibold text-primary-700">{card.cta} →</div>
          </button>
        ))}
      </div>
    </Card>
  )
}

function FirstStepsPanel({ checklist, loading, onNavigate }) {
  const steps = checklist?.steps || firstSteps
  const nextStep = checklist?.next
  const progress = checklist?.percent ?? 0

  return (
    <Card className="border-primary-100 bg-gradient-to-br from-white via-primary-50/40 to-white">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-primary-700">Primii pași după instalare</div>
          <h3 className="mt-1 text-lg font-bold text-slate-900">Checklist de pornire pentru orice organizație</h3>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            InfraFlow poate fi mare, dar începutul trebuie să fie simplu: companie, module, oameni, email, date și siguranță. Parcurge pașii în ordine sau sari direct la zona care lipsește.
          </p>
        </div>
        <div className="min-w-[180px] rounded-[var(--radius-panel)] border border-primary-100 bg-white p-3">
          <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-600">
            <span>Progres configurare</span>
            <span>{checklist?.done || 0}/{checklist?.total || steps.length}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-primary-600 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-2 text-xs text-slate-500">{loading ? 'Verific statusul...' : `${progress}% pregătit`}</div>
        </div>
      </div>
      {nextStep && !loading ? (
        <button
          className="mt-4 flex w-full flex-wrap items-center justify-between gap-3 rounded-[var(--radius-panel)] border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 transition hover:border-amber-300 hover:bg-amber-100"
          onClick={() => onNavigate(nextStep.route)}
        >
          <span><strong>Următorul pas recomandat:</strong> {nextStep.title}. {nextStep.detail}</span>
          <span className="font-semibold">{nextStep.cta} →</span>
        </button>
      ) : null}
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {steps.map(item => (
          <button
            key={item.step}
            className={`group rounded-[var(--radius-panel)] border p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${item.done ? 'border-primary-100 bg-primary-50/70 hover:border-primary-200' : 'border-slate-200 bg-white hover:border-primary-300'}`}
            onClick={() => onNavigate(item.route)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className={`grid h-8 w-8 place-items-center rounded-full text-lg ${item.done ? 'bg-primary-100' : 'bg-slate-100'}`}>{item.done ? '✓' : item.icon}</span>
                <span className="text-xs font-semibold uppercase tracking-wide text-primary-700">Pas {item.step}</span>
              </div>
              <Badge tone={item.done ? 'success' : 'warning'} size="sm">{item.done ? 'gata' : 'de făcut'}</Badge>
            </div>
            <div className="mt-3 text-sm font-semibold text-slate-900">{item.title}</div>
            <p className="mt-1 min-h-14 text-xs leading-relaxed text-slate-500">{item.detail || item.description}</p>
            <div className="mt-3 text-xs font-semibold text-primary-700">{item.cta}</div>
          </button>
        ))}
      </div>
    </Card>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [data, setData] = useState(emptyState)
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState({})
  const [resettingDemo, setResettingDemo] = useState(false)
  const [demoMessage, setDemoMessage] = useState('')
  const [confirmAction, setConfirmAction] = useState(null)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [watchedActionLoading, setWatchedActionLoading] = useState('')
  const snowSeason = isSnowSeason()

  async function resetDemo() {
    setConfirmAction({
      title: 'Resetează datele demo',
      message: 'Resetezi datele demo la starea inițială pentru prezentare?',
      details: 'Datele demo se vor reface la scenariul inițial, iar pagina se va reîncărca după confirmare.',
      confirmLabel: 'Resetează demo',
      tone: 'warning',
      run: resetDemoRequest,
      errorMessage: 'Resetul demo nu a reușit.',
    })
  }

  async function resetDemoRequest() {
    setResettingDemo(true)
    setDemoMessage('')
    try {
      await api.post('/demo-reset')
      setDemoMessage('Demo resetat. Reîncarc pagina cu date curate...')
      window.setTimeout(() => window.location.reload(), 700)
    } catch (err) {
      setDemoMessage(err.response?.data?.error || 'Resetul demo nu a reușit.')
      setResettingDemo(false)
    }
  }

  async function runConfirmAction(reason) {
    if (!confirmAction?.run) return
    try {
      setConfirmLoading(true)
      setDemoMessage('')
      await confirmAction.run(reason)
      setConfirmAction(null)
    } catch (err) {
      setDemoMessage(err.response?.data?.error || confirmAction.errorMessage || 'Acțiunea nu a putut fi executată.')
    } finally {
      setConfirmLoading(false)
    }
  }

  async function refreshWatchedDocuments() {
    try {
      const response = await api.get('/documents/watched')
      setData(current => ({ ...current, watchedDocuments: response.data }))
      setErrors(current => {
        const next = { ...current }
        delete next.watchedDocuments
        return next
      })
    } catch (err) {
      setErrors(current => ({ ...current, watchedDocuments: err }))
    }
  }

  async function createWatchedDocumentTask(document) {
    const documentId = documentTaskSourceId(document)
    if (!documentId || watchedActionLoading) return
    setWatchedActionLoading(`task-${documentId}`)
    setDemoMessage('')
    try {
      await api.post('/tasks', {
        title: `Verifică documentul ${document.nr_document || document.titlu || documentId}`,
        description: [
          `Document urmărit din Dashboard.`,
          document.nr_document ? `Număr: ${document.nr_document}` : '',
          document.titlu ? `Titlu: ${document.titlu}` : '',
          document.status ? `Status: ${statusText(document.status)}` : '',
          document.prioritate ? `Prioritate document: ${statusText(document.prioritate)}` : '',
        ].filter(Boolean).join('\n'),
        assigned_to: userId(user),
        priority: ['critica', 'urgent', 'urgenta'].includes(String(document.prioritate || '').toLowerCase()) ? 'urgent' : 'normal',
        due_date: document.termen_limita || document.due_date || '',
        source_type: 'document',
        source_id: String(documentId),
        source_label: `${document.nr_document || 'Document'}${document.titlu ? ` · ${document.titlu}` : ''}`,
        source_url: documentRoute(document),
      })
      setDemoMessage('Task creat din documentul urmărit.')
      const [tasksResponse] = await Promise.all([
        api.get('/tasks/my-open').catch(() => null),
        refreshWatchedDocuments(),
      ])
      if (tasksResponse?.data) {
        setData(current => ({ ...current, myTasks: tasksResponse.data }))
      }
    } catch (err) {
      setDemoMessage(err.response?.data?.error || 'Task-ul nu a putut fi creat din radarul de documente.')
    } finally {
      setWatchedActionLoading('')
    }
  }

  async function unwatchDashboardDocument(document) {
    const documentId = documentTaskSourceId(document)
    if (!documentId || watchedActionLoading) return
    setWatchedActionLoading(`unwatch-${documentId}`)
    setDemoMessage('')
    try {
      await api.post(`/documents/${encodeURIComponent(String(documentId))}/watch`, { watched: false })
      await refreshWatchedDocuments()
      setDemoMessage('Documentul a fost scos din radarul urmăritelor.')
    } catch (err) {
      setDemoMessage(err.response?.data?.error || 'Documentul nu a putut fi scos din urmărite.')
    } finally {
      setWatchedActionLoading('')
    }
  }

  function openWatchedGroup(group, item) {
    const params = new URLSearchParams({ filter: 'watched' })
    if (group && item?.key) params.set(`watch_${group}`, String(item.key))
    navigate(`${routes.documents}?${params.toString()}`)
  }

  useEffect(() => {
    let cancelled = false

    async function loadDashboard() {
      setLoading(true)
      const dates = lastDays(7)
      const requests = {
        daily: api.get('/daily-report'),
        stockOperations: api.get('/stock-operations'),
        fleetAssets: api.get('/fleet-assets'),
        inboxDocuments: api.get('/documents/inbox'),
        watchedDocuments: api.get('/documents/watched'),
        tickets: api.get('/tickets/my-open'),
        projects: api.get('/field/projects'),
        audit: api.get('/audit'),
        production7: Promise.allSettled(dates.map(date => api.get(`/daily-report?date=${date}`))),
        weather: snowSeason ? api.get('/snow-removal/weather') : Promise.resolve({ data: null }),
        commandCenter: api.get('/dashboard/command-center'),
        contractsDashboard: api.get('/contracts/dashboard'),
        contractsTasks: api.get('/contracts/tasks'),
        myTasks: api.get('/tasks/my-open'),
        hrStats: api.get('/hr/stats'),
        leaveRequests: api.get('/hr/leave-requests'),
        accountingSummary: api.get('/accounting/summary'),
        settings: api.get('/settings'),
        users: api.get('/users'),
        backupStatus: api.get('/system/backups'),
        updateStatus: api.get('/system/update/status'),
        emailSyncStatus: api.get('/messaging/email/sync/status'),
      }

      const entries = await Promise.all(
        Object.entries(requests).map(async ([key, promise]) => {
          try {
            const response = await promise
            return [key, response.data, null]
          } catch (error) {
            return [key, null, error]
          }
        })
      )

      if (cancelled) return

      const nextData = { ...emptyState }
      const nextErrors = {}
      for (const [key, value, error] of entries) {
        if (error) nextErrors[key] = error
        nextData[key] = value
      }

      nextData.production7 = dates.map((date, index) => {
        const settled = nextData.production7?.[index]
        const report = settled?.status === 'fulfilled' ? settled.value.data?.report : null
        if (settled?.status === 'rejected') nextErrors.production7 = settled.reason
        return {
          date: date.slice(5),
          tone: numberFrom(report?.metrics?.outputTotal ?? report?.outputTotal ?? report?.metrics?.asphaltTotal ?? report?.asphaltTotal),
        }
      })

      setData(nextData)
      setErrors(nextErrors)
      setLoading(false)
    }

    loadDashboard()
    return () => {
      cancelled = true
    }
  }, [snowSeason])

  const view = useMemo(() => {
    const report = data.daily?.report || {}
    const criticalStocks = report.criticalStocks || []
    const fleetAssets = arrayFrom(data.fleetAssets, ['assets', 'fleetAssets'])
    const inboxDocuments = arrayFrom(data.inboxDocuments, ['documents', 'items'])
    const watchedDocuments = arrayFrom(data.watchedDocuments, ['documents', 'items'])
    const watchedDocumentNotifications = arrayFrom(data.watchedDocuments, ['notifications', 'activity'])
    const tickets = arrayFrom(data.tickets, ['tickets', 'items'])
    const projects = arrayFrom(data.projects, ['projects', 'items'])
    const audit = arrayFrom(data.audit, ['audit', 'items'])
    const stockOperations = arrayFrom(data.stockOperations, ['movements', 'operations', 'items'])
    const contractsTasks = arrayFrom(data.contractsTasks, ['tasks', 'items'])
    const myTasks = arrayFrom(data.myTasks, ['tasks', 'items'])
    const leaveRequests = arrayFrom(data.leaveRequests, ['requests', 'leaveRequests', 'items'])
    const blockedDocuments = arrayFrom(data.commandCenter?.documentsBlocked, ['documents', 'items'])
    const settings = data.settings?.settings || data.settings || {}
    const profile = dashboardProfile(user)

    const nextView = {
      criticalStocks,
      operationalOutputToday: numberFrom(report.metrics?.outputTotal ?? report.outputTotal ?? report.metrics?.asphaltTotal ?? report.asphaltTotal),
      activeAssets: fleetAssets.filter(assetIsActive).length,
      inboxDocuments,
      watchedDocuments,
      watchedDocumentNotifications,
      watchedDocumentsSummary: data.watchedDocuments?.summary || {},
      tickets,
      projects,
      audit,
      stockOperations,
      contractsDashboard: data.contractsDashboard || {},
      contractsTasks,
      myTasks,
      blockedDocuments,
      hrStats: data.hrStats || {},
      leaveRequests,
      accountingSummary: data.accountingSummary || {},
      settings,
      firstStepsChecklist: buildFirstStepsStatus(data, firstSteps),
    }
    return {
      ...nextView,
      profile,
      todayActions: buildTodayActions(nextView, profile),
    }
  }, [data, user])

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Dashboard operațional</h2>
          <p className="text-sm text-slate-500">Indicatori rapizi din modulele active: operațiuni, stocuri, oameni, contracte, documente și costuri.</p>
        </div>
        <Badge tone="success">Live API</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon="📦"
          label="Stoc materiale critice"
          value={view.criticalStocks.length}
          loading={loading}
          error={errors.daily || errors.stockOperations}
          onClick={() => navigate(routes.stock)}
        />
        <KpiCard
          icon="📊"
          label="Rezultat operațional azi"
          value={view.operationalOutputToday.toLocaleString('ro-RO')}
          loading={loading}
          error={errors.daily}
          onClick={() => navigate(routes.production)}
        />
        <KpiCard
          icon="🧰"
          label="Resurse active azi"
          value={view.activeAssets}
          loading={loading}
          error={errors.fleetAssets}
          onClick={() => navigate(routes.fleet)}
        />
        <KpiCard
          icon="📋"
          label="Documente de aprobat"
          value={view.inboxDocuments.length}
          loading={loading}
          error={errors.inboxDocuments}
          onClick={() => navigate(routes.documents)}
        />
      </div>

      {demoMessage ? <div className="rounded-md border border-primary-100 bg-primary-50 px-3 py-2 text-sm text-primary-700">{demoMessage}</div> : null}

      <TodayActionsPanel
        actions={view.todayActions}
        profile={view.profile}
        loading={loading}
        onNavigate={navigate}
      />

      <WatchedDocumentsPanel
        documents={view.watchedDocuments}
        notifications={view.watchedDocumentNotifications}
        summary={view.watchedDocumentsSummary}
        settings={view.settings}
        loading={loading}
        error={errors.watchedDocuments}
        actionLoading={watchedActionLoading}
        onCreateTask={createWatchedDocumentTask}
        onOpenGroup={openWatchedGroup}
        onNavigate={navigate}
        onUnwatch={unwatchDashboardDocument}
      />

      <FirstStepsPanel checklist={view.firstStepsChecklist} loading={loading} onNavigate={navigate} />

      <CommercialOnboardingPanel onNavigate={navigate} />

      {user?.username === 'director' || user?.username === 'demo' || ['manager', 'superadmin'].includes(user?.role) ? (
        <DirectorDemoPanel user={user} onNavigate={navigate} onResetDemo={resetDemo} resettingDemo={resettingDemo} />
      ) : null}

      <CommandCenterPanel
        data={data}
        loading={loading}
        error={errors.commandCenter}
        onNavigate={navigate}
      />

      <Card className="cursor-pointer" onClick={() => navigate(routes.projects)}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Proiecte / lucrări active</h3>
          <Badge>{view.projects.length} active</Badge>
        </div>
        <SectionError error={errors.projects} />
        {loading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map(item => <Skeleton key={item} className="h-24" />)}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {view.projects.length ? view.projects.slice(0, 6).map(project => {
              const progress = projectProgress(project)
              return (
                <div key={project.id || project.uuid || project.cod} className="rounded-md border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">{projectName(project)}</div>
                      <div className="text-xs text-slate-500">{project.status || 'activ'}</div>
                    </div>
                    <span className="text-sm font-semibold text-primary-700">{progress}%</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-primary-600" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )
            }) : <p className="text-sm text-slate-500">Nu există proiecte sau lucrări active de afișat.</p>}
          </div>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="cursor-pointer" onClick={() => navigate(routes.production)}>
          <h3 className="mb-4 text-base font-semibold text-slate-900">Grafic activitate operațională ultimele 7 zile</h3>
          <SectionError error={errors.production7} />
          {loading ? <Skeleton className="h-72" /> : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.production7}>
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="tone" stroke="#0F6E56" strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="cursor-pointer" onClick={() => navigate(routes.tickets)}>
          <h3 className="mb-4 text-base font-semibold text-slate-900">Sesizări recente</h3>
          <SectionError error={errors.tickets} />
          {loading ? (
            <div className="grid gap-2">{[1, 2, 3, 4].map(item => <Skeleton key={item} className="h-12" />)}</div>
          ) : (
            <div className="grid gap-2">
              {view.tickets.length ? view.tickets.slice(0, 6).map(ticket => (
                <div key={ticket.uuid || ticket.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-900">{ticket.titlu || ticket.title}</div>
                    <div className="text-xs text-slate-500">{statusText(ticket.status)}</div>
                  </div>
                  <Badge tone={priorityTone(ticket.prioritate)}>{ticket.prioritate || 'normal'}</Badge>
                </div>
              )) : <p className="text-sm text-slate-500">Nu ai sesizări deschise.</p>}
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="cursor-pointer" onClick={() => navigate(routes.stock)}>
          <h3 className="mb-4 text-base font-semibold text-slate-900">Stocuri critice</h3>
          <MiniTable
            rows={loading ? [] : view.criticalStocks.slice(0, 8)}
            empty={loading ? 'Se incarca...' : 'Nu exista materiale sub minim.'}
            columns={[
              { key: 'materialName', label: 'Material' },
              { key: 'stock', label: 'Stoc', render: row => `${row.stock} ${row.unit || ''}` },
              { key: 'alert', label: 'Minim' },
            ]}
          />
        </Card>

        <DocumentWorklistPanel
          inboxDocuments={view.inboxDocuments}
          blockedDocuments={view.blockedDocuments}
          loading={loading}
          error={errors.inboxDocuments || errors.commandCenter}
          onNavigate={navigate}
        />

        <Card className="cursor-pointer" onClick={() => navigate(routes.audit)}>
          <h3 className="mb-4 text-base font-semibold text-slate-900">Activitate recentă</h3>
          <SectionError error={errors.audit} />
          <div className="grid gap-2">
            {loading ? [1, 2, 3, 4].map(item => <Skeleton key={item} className="h-10" />) : (
              view.audit.length ? view.audit.slice(0, 10).map((item, index) => (
                <div key={item.id || index} className="min-w-0 overflow-hidden rounded-md border border-slate-200 px-3 py-2">
                  <div className="truncate text-sm font-medium text-slate-900">{displayText(item.action || item.actiune, 'actiune')}</div>
                  <div className="truncate break-all text-xs text-slate-500">{displayText(item.details || item.detalii || item.userName || item.user)}</div>
                </div>
              )) : <p className="text-sm text-slate-500">Nu exista activitate recenta.</p>
            )}
          </div>
        </Card>
      </div>

      {snowSeason ? (
        <Card className="cursor-pointer border-sky-200 bg-sky-50/50" onClick={() => navigate(routes.snow)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">❄️ Deszăpezire</h3>
              <p className="text-sm text-slate-600">Meteo curent și recomandare intervenție</p>
            </div>
            {loading ? <Skeleton className="h-8 w-32" /> : (
              <Badge tone={data.weather?.recomandare?.culoare === 'rosu' ? 'danger' : 'success'}>
                {data.weather?.recomandare?.tip || 'indisponibil'}
              </Badge>
            )}
          </div>
          <SectionError error={errors.weather} />
          {!loading && data.weather ? (
            <div className="mt-4 grid gap-3 text-sm text-slate-700 md:grid-cols-4">
              <div><span className="text-slate-500">Temperatura</span><br />{data.weather.current?.temperature_2m ?? data.weather.temperature_2m ?? '-'}°C</div>
              <div><span className="text-slate-500">Precipitații</span><br />{data.weather.current?.precipitation ?? data.weather.precipitation ?? 0} mm</div>
              <div><span className="text-slate-500">Ninsoare</span><br />{data.weather.current?.snowfall ?? data.weather.snowfall ?? 0} mm</div>
              <div><span className="text-slate-500">Motiv</span><br />{data.weather.recomandare?.motiv || 'Nu exista recomandare.'}</div>
            </div>
          ) : null}
        </Card>
      ) : null}

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.title}
        message={confirmAction?.message}
        details={confirmAction?.details}
        confirmLabel={confirmAction?.confirmLabel}
        cancelLabel="Renunță"
        tone={confirmAction?.tone || 'warning'}
        loading={confirmLoading || resettingDemo}
        onCancel={() => setConfirmAction(null)}
        onConfirm={runConfirmAction}
      />
    </div>
  )
}
