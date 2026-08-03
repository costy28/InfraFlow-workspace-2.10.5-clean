import { useEffect, useMemo, useState } from 'react'
import { CheckCircle, Upload, Users } from 'lucide-react'
import api from '../api/client'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import ContextHelp from '../components/ui/ContextHelp'
import DropdownMenu from '../components/ui/DropdownMenu'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'
import PageHeader from '../components/ui/PageHeader'
import Select from '../components/ui/Select'
import Table from '../components/ui/Table'
import { formatDate, formatMoney } from '../utils/format'

const tabGroups = [
  { label: 'Sistem', tabs: ['General', 'Bază date', 'Licență', 'Actualizări'] },
  { label: 'Administrare', tabs: ['Utilizatori', 'Roluri', 'Departamente', 'Module'] },
  { label: 'Interfață', tabs: ['Aspect', 'AI Assistant'] },
  { label: 'Integrări', tabs: ['Cântar', 'Integrări'] },
]
const allModules = [
  'core', 'inventory', 'production', 'reports', 'system', 'fleet', 'hr',
  'controlling', 'accounting', 'procurement', 'contract_management', 'documents', 'field', 'messaging', 'tickets',
  'technical_plus', 'sanitation', 'traffic_safety', 'snow_removal',
  'environment', 'legal', 'archive', 'secretariat', 'ai_assistant'
]

const alwaysOnModuleKeys = ['core', 'production', 'inventory', 'reports']

function getUserManagerId(user) {
  return String(user?.manager_id || user?.managerId || '').trim()
}

function userDisplayName(user) {
  return user?.name || user?.username || user?.id || '-'
}

const roleDescriptions = {
  superadmin: 'Control complet — licență, backup, sistem.',
  admin: 'Administrare utilizatori și operare completă.',
  manager: 'Coordonare producție, planificare, rapoarte.',
  hr: 'HR — angajați, pontaj, concedii, autorizații.',
  inventory: 'Gestiune stocuri, intrări, ieșiri.',
  procurement: 'Achiziții — comenzi și recepții.',
  mechanization: 'Parc auto/utilaje, foi parcurs.',
  technical: 'Departament tehnic — pontaj utilaj, rapoarte.',
  accounting: 'Rapoarte contabile, centre cost.',
  operator: 'Operator stație — introduce consumuri.',
  department: 'Angajat departament — solicitări.',
  viewer: 'Acces citire.',
}

const emptyUserForm = {
  name: '',
  username: '',
  email: '',
  password: '',
  role: 'angajat',
  department: '',
  departmentId: '',
  manager_id: '',
  active: true,
  employee_id: '',
  verified_from_hr: false,
}

const MESAJ_NEGASIT = `🏗️ Hmm... nu te găsim în echipa noastră!
Dacă ești convins că lucrezi aici, contactează HR-ul.
Dacă nu... lasă un CV la resurse umane — cine știe, poate te pliezi pe cerințele noastre! 😄`

const emptyDeptForm = {
  name: '',
  tip: 'departament',
  icon: '👥',
  culoare: '#3B82F6',
  permissions: [],
}

const emptyEmailSyncStatus = {
  enabled: false,
  interval_min: 15,
  limit: 20,
  last_manual_sync_at: '',
  last_manual_sync_imported: 0,
  last_manual_sync_scanned: 0,
  last_auto_sync_at: '',
  last_auto_sync_imported: 0,
  last_auto_sync_scanned: 0,
  last_auto_sync_error: '',
  next_auto_sync_at: '',
}

const emailRuleFieldOptions = [
  { value: 'all', label: 'Oriunde' },
  { value: 'from', label: 'Expeditor' },
  { value: 'subject', label: 'Subiect' },
  { value: 'body', label: 'Conținut' },
]

const emailRuleOperatorOptions = [
  { value: 'contains', label: 'conține' },
  { value: 'starts_with', label: 'începe cu' },
  { value: 'ends_with', label: 'se termină cu' },
  { value: 'equals', label: 'este exact' },
]

const emailRuleCategoryOptions = [
  { value: '', label: 'Păstrează categoria' },
  { value: 'general', label: 'General' },
  { value: 'contracte', label: 'Contracte' },
  { value: 'achizitii', label: 'Achiziții' },
  { value: 'contabilitate', label: 'Contabilitate' },
  { value: 'hr', label: 'HR' },
  { value: 'documente', label: 'Documente' },
  { value: 'sesizari', label: 'Sesizări' },
]

const emailRuleImportanceOptions = [
  { value: '', label: 'Păstrează importanța' },
  { value: 'low', label: 'Scăzută' },
  { value: 'normal', label: 'Normală' },
  { value: 'high', label: 'Ridicată' },
  { value: 'urgent', label: 'Urgentă' },
]

const emailRuleStatusOptions = [
  { value: '', label: 'Păstrează necitit' },
  { value: 'unread', label: 'Necitit' },
  { value: 'read', label: 'Citit' },
  { value: 'archived', label: 'Arhivat' },
]

function emailRuleOptionLabel(options, value, fallback = '-') {
  return options.find(item => String(item.value) === String(value || ''))?.label || fallback
}

function normalizeEmailRuleText(value) {
  return String(value || '').toLowerCase()
}

function testEmailRuleMatch(rule = {}, sample = {}) {
  const needle = normalizeEmailRuleText(rule.match).trim()
  if (!needle) return false
  const fields = {
    from: sample.from,
    subject: sample.subject,
    body: sample.body,
    all: [sample.from, sample.subject, sample.body].filter(Boolean).join(' '),
  }
  const haystack = normalizeEmailRuleText(fields[rule.field || 'all'])
  switch (rule.operator || 'contains') {
    case 'starts_with':
      return haystack.startsWith(needle)
    case 'ends_with':
      return haystack.endsWith(needle)
    case 'equals':
      return haystack === needle
    case 'contains':
    default:
      return haystack.includes(needle)
  }
}

const departmentIconOptions = ['👥', '🔧', '🏗️', '📦', '🚛', '🏭', '🌿', '📍', '🧹', '🚦', '❄️', '⚙️', '💰', '📋', '🎯', '🔨', '🛒', '📬', '⚖️', '🗄️', '🏠', '🚗', '📊', '💼', '🔩', '🌱', '🏢', '🎫']

const moduleGroups = [
  {
    title: 'PRINCIPALE',
    locked: true,
    modules: [
      { key: 'core', icon: '🔒', label: 'Core', description: 'Autentificare și securitate' },
      { key: 'production', icon: '🔒', label: 'Producție / Operațiuni', description: 'Rețete, fluxuri, consumuri și output operațional' },
      { key: 'inventory', icon: '🔒', label: 'Stocuri', description: 'Gestiune materiale' },
      { key: 'reports', icon: '🔒', label: 'Rapoarte', description: 'Rapoarte standard' },
    ],
  },
  {
    title: 'OPERAȚIONALE',
    modules: [
      { key: 'fleet', icon: '⚙️', label: 'Parc & Resurse' },
      { key: 'technical', icon: '⚙️', label: 'Tehnic' },
      { key: 'procurement', icon: '⚙️', label: 'Achiziții' },
      { key: 'contract_management', icon: '⚙️', label: 'Contracte' },
      { key: 'hr', icon: '⚙️', label: 'HR' },
      { key: 'controlling', icon: '⚙️', label: 'Controlling' },
      { key: 'accounting', icon: '⚙️', label: 'Contabilitate' },
    ],
  },
  {
    title: 'SERVICII',
    modules: [
      { key: 'sanitation', icon: '⚙️', label: 'Salubrizare' },
      { key: 'traffic_safety', icon: '⚙️', label: 'Siguranța Circulației' },
      { key: 'environment', icon: '⚙️', label: 'Protecția Mediului' },
      { key: 'snow_removal', icon: '⚙️', label: 'Deszăpezire', badge: 'Sezonier 15.11-15.04' },
    ],
  },
  {
    title: 'SUPORT',
    modules: [
      { key: 'documents', icon: '⚙️', label: 'Documente și aprobare' },
      { key: 'messaging', icon: '⚙️', label: 'Mesaje interne' },
      { key: 'tickets', icon: '⚙️', label: 'Sesizări' },
      { key: 'field', icon: '⚙️', label: 'Teren / Șantiere' },
      { key: 'legal', icon: '⚙️', label: 'Juridic' },
      { key: 'archive', icon: '⚙️', label: 'Arhivă' },
      { key: 'secretariat', icon: '⚙️', label: 'Secretariat' },
    ],
  },
  {
    title: 'OPȚIONAL',
    modules: [
      { key: 'ai', icon: '🤖', label: 'AI Assistant', badge: 'Necesită cheie Anthropic' },
    ],
  },
]

const commercialModulePackages = [
  {
    key: 'core',
    label: 'Core',
    icon: '🧭',
    modules: ['documents', 'messaging', 'tickets'],
    description: 'Baza comercială: documente, comunicare, tichete, audit și administrare.',
  },
  {
    key: 'hr',
    label: 'HR',
    icon: '👥',
    modules: ['hr', 'documents', 'messaging'],
    description: 'Angajați, pontaj, concedii, dosar personal, Kiosk și documente HR.',
  },
  {
    key: 'operational',
    label: 'Operațional',
    icon: '🚜',
    modules: ['fleet', 'technical', 'field', 'controlling', 'documents'],
    description: 'Flotă, utilaje, lucrări, teren și controlling operațional.',
  },
  {
    key: 'gestiune_achizitii',
    label: 'Gestiune + Achiziții',
    icon: '🛒',
    modules: ['procurement', 'contract_management', 'documents', 'tickets'],
    description: 'Stocuri, comenzi, recepții, referate, PAAP, contracte și furnizori.',
  },
  {
    key: 'accounting',
    label: 'Contabilitate',
    icon: '🏛️',
    modules: ['accounting', 'controlling', 'contract_management', 'documents'],
    description: 'Contabilitate, declarații, dosar fiscal, contracte, SAF-T și costuri.',
  },
  {
    key: 'city_services',
    label: 'City Services',
    icon: '🏙️',
    modules: ['sanitation', 'traffic_safety', 'snow_removal', 'environment', 'field', 'fleet', 'contract_management', 'tickets'],
    description: 'Salubrizare, deszăpezire, circulație, mediu, contracte și teren.',
  },
  {
    key: 'enterprise',
    label: 'Enterprise',
    icon: '🚀',
    modules: ['fleet', 'technical', 'procurement', 'contract_management', 'hr', 'controlling', 'accounting', 'sanitation', 'traffic_safety', 'environment', 'snow_removal', 'documents', 'messaging', 'tickets', 'field', 'legal', 'archive', 'secretariat', 'ai'],
    description: 'Toate modulele, pentru organizații mari și fluxuri complete.',
  },
]

const moduleFeatureCatalog = {
  fleet: [
    { key: 'assets', label: 'Parc vehicule/utilaje' },
    { key: 'trip_logs', label: 'Foi de parcurs' },
    { key: 'faz', label: 'FAZ utilaje' },
    { key: 'fuel', label: 'Alimentări și consum' },
    { key: 'maintenance', label: 'Reparații și revizii' },
    { key: 'gps', label: 'GPS live' },
  ],
  technical: [
    { key: 'work_logs', label: 'Jurnale lucrări' },
    { key: 'asphalt_sales', label: 'Vânzări asfalt' },
    { key: 'field_reports', label: 'Rapoarte teren' },
  ],
  procurement: [
    { key: 'orders', label: 'Comenzi' },
    { key: 'referate', label: 'Referate' },
    { key: 'paap', label: 'PAAP' },
    { key: 'cpv', label: 'Catalog CPV' },
  ],
  hr: [
    { key: 'employees', label: 'Angajați' },
    { key: 'timesheets', label: 'Pontaj' },
    { key: 'leave', label: 'Concedii' },
    { key: 'equipment', label: 'Echipamente protecție' },
    { key: 'kiosk', label: 'Kiosk angajat' },
  ],
  controlling: [
    { key: 'cost_centers', label: 'Centre cost/profit' },
    { key: 'fleet_costs', label: 'Costuri mecanizare' },
    { key: 'reports', label: 'Rapoarte controlling' },
  ],
  accounting: [
    { key: 'chart', label: 'Plan de conturi' },
    { key: 'third_parties', label: 'Terti contabili' },
    { key: 'invoices', label: 'Facturi intrare/iesire' },
    { key: 'treasury', label: 'Casa si banca' },
    { key: 'journals', label: 'Registru jurnal' },
    { key: 'reports', label: 'Balanta si fisa cont' },
    { key: 'closing', label: 'Inchidere luna' },
  ],
  sanitation: [
    { key: 'routes', label: 'Rute' },
    { key: 'collections', label: 'Colectări' },
    { key: 'reports', label: 'Rapoarte' },
  ],
  traffic_safety: [
    { key: 'signs', label: 'Indicatoare' },
    { key: 'markings', label: 'Marcaje' },
    { key: 'interventions', label: 'Intervenții' },
  ],
  environment: [
    { key: 'permits', label: 'Autorizații' },
    { key: 'waste', label: 'Deșeuri PRODDES/MUN' },
    { key: 'emissions', label: 'Emisii și monitorizare' },
    { key: 'incidents', label: 'Incidente' },
  ],
  snow_removal: [
    { key: 'plans', label: 'Plan deszăpezire' },
    { key: 'interventions', label: 'Intervenții' },
    { key: 'weather', label: 'Meteo' },
  ],
  documents: [
    { key: 'templates', label: 'Template-uri' },
    { key: 'workflow', label: 'Circuit aprobare' },
    { key: 'archive', label: 'Arhivare' },
  ],
  messaging: [
    { key: 'channels', label: 'Canale' },
    { key: 'notifications', label: 'Notificări' },
    { key: 'email', label: 'Email' },
  ],
  tickets: [
    { key: 'tickets', label: 'Sesizări' },
    { key: 'sla', label: 'SLA și escaladări' },
  ],
  field: [
    { key: 'sites', label: 'Șantiere' },
    { key: 'daily_notes', label: 'Note zilnice' },
  ],
  legal: [
    { key: 'cases', label: 'Dosare' },
    { key: 'contracts', label: 'Contracte' },
  ],
  archive: [
    { key: 'registry', label: 'Registru arhivă' },
    { key: 'retention', label: 'Termene păstrare' },
  ],
  secretariat: [
    { key: 'registry', label: 'Registratură' },
    { key: 'correspondence', label: 'Corespondență' },
  ],
  ai: [
    { key: 'assistant', label: 'Asistent AI' },
    { key: 'reports', label: 'Analize și rapoarte' },
  ],
}

const workflowActorTypeOptions = [
  { value: 'role', label: 'Rol' },
  { value: 'department', label: 'Departament' },
  { value: 'user', label: 'Utilizator' },
  { value: 'manager', label: 'Manager direct' },
]

const workflowConditionFieldOptions = [
  { value: 'always', label: 'Mereu' },
  { value: 'estimated_value', label: 'Valoare estimată' },
  { value: 'department', label: 'Departament' },
  { value: 'priority', label: 'Prioritate' },
  { value: 'country', label: 'Țară / jurisdicție' },
  { value: 'cost_center', label: 'Centru de cost' },
  { value: 'source', label: 'Sursă document' },
]

const workflowConditionOperatorOptions = [
  { value: '=', label: '=' },
  { value: '!=', label: '≠' },
  { value: '>', label: '>' },
  { value: '>=', label: '≥' },
  { value: '<', label: '<' },
  { value: '<=', label: '≤' },
  { value: 'contains', label: 'conține' },
]

const workflowConditionPresetOptions = [
  { value: 'mereu', label: 'Mereu', rule: { field: 'always', operator: '=', value: '' } },
  { value: 'valoare estimată > 0', label: 'Are valoare estimată', rule: { field: 'estimated_value', operator: '>', value: '0' } },
  { value: 'valoare estimată >= 10000', label: 'Valoare peste prag', rule: { field: 'estimated_value', operator: '>=', value: '10000' } },
  { value: 'prioritate = urgentă', label: 'Prioritate urgentă', rule: { field: 'priority', operator: '=', value: 'urgentă' } },
  { value: 'prioritate = critică', label: 'Prioritate critică', rule: { field: 'priority', operator: '=', value: 'critică' } },
  { value: 'departament = departament beneficiar', label: 'Departament beneficiar', rule: { field: 'department', operator: '=', value: 'departament beneficiar' } },
  { value: 'țară = profil organizație', label: 'Țara organizației', rule: { field: 'country', operator: '=', value: 'profil organizație' } },
]

const workflowDocumentFlowDefaults = [
  {
    id: 'referat',
    document_type: 'referat',
    label: 'Referat / necesar intern',
    active: true,
    version: 1,
    escalation_days: 2,
    steps: [
      { name: 'Întocmire și verificare conținut', actor_type: 'department', actor_ref: 'Departament inițiator', deadline_days: 1, required: true, condition: 'mereu' },
      { name: 'Control buget / CPV', actor_type: 'role', actor_ref: 'Achiziții', deadline_days: 2, required: true, condition: 'dacă are valoare estimată' },
      { name: 'Aprobare finală', actor_type: 'manager', actor_ref: 'Manager direct', deadline_days: 2, required: true, condition: 'mereu' },
    ],
  },
  {
    id: 'contract',
    document_type: 'contract',
    label: 'Contract',
    active: true,
    version: 1,
    escalation_days: 3,
    steps: [
      { name: 'Manager contract', actor_type: 'user', actor_ref: 'Responsabil contract', deadline_days: 2, required: true, condition: 'mereu' },
      { name: 'Juridic / conformitate', actor_type: 'role', actor_ref: 'Juridic', deadline_days: 3, required: true, condition: 'dacă există clauze speciale' },
      { name: 'Aprobare buget', actor_type: 'role', actor_ref: 'Contabilitate', deadline_days: 2, required: true, condition: 'dacă afectează bugetul' },
    ],
  },
  {
    id: 'factura',
    document_type: 'factura',
    label: 'Factură intrare',
    active: true,
    version: 1,
    escalation_days: 2,
    steps: [
      { name: 'Confirmare recepție / prestare', actor_type: 'department', actor_ref: 'Departament beneficiar', deadline_days: 2, required: true, condition: 'mereu' },
      { name: 'Verificare contract / comandă', actor_type: 'role', actor_ref: 'Achiziții', deadline_days: 2, required: true, condition: 'dacă există contract sau comandă' },
      { name: 'Înregistrare contabilă', actor_type: 'role', actor_ref: 'Contabilitate', deadline_days: 1, required: true, condition: 'mereu' },
    ],
  },
  {
    id: 'hr',
    document_type: 'hr',
    label: 'Document HR',
    active: true,
    version: 1,
    escalation_days: 2,
    steps: [
      { name: 'Validare HR', actor_type: 'role', actor_ref: 'HR', deadline_days: 2, required: true, condition: 'mereu' },
      { name: 'Confirmare angajat / Kiosk', actor_type: 'user', actor_ref: 'Angajat asociat', deadline_days: 3, required: false, condition: 'dacă documentul cere confirmare' },
      { name: 'Arhivare dosar personal', actor_type: 'role', actor_ref: 'HR', deadline_days: 1, required: true, condition: 'după aprobare' },
    ],
  },
]

function normalizeWorkflowDocumentFlowsClient(input) {
  const source = Array.isArray(input) && input.length ? input : workflowDocumentFlowDefaults
  return source.map((flow, flowIndex) => {
    const fallback = workflowDocumentFlowDefaults[flowIndex] || workflowDocumentFlowDefaults[0]
    const steps = Array.isArray(flow.steps) && flow.steps.length ? flow.steps : fallback.steps
    return {
      id: String(flow.id || fallback.id || `flux-${flowIndex + 1}`).trim(),
      document_type: String(flow.document_type || flow.documentType || fallback.document_type || 'document').trim(),
      label: String(flow.label || fallback.label || `Flux document ${flowIndex + 1}`).trim(),
      active: flow.active !== false,
      version: Math.max(1, Number(flow.version || fallback.version || 1)),
      escalation_days: Math.max(0, Number(flow.escalation_days ?? flow.escalationDays ?? fallback.escalation_days ?? 2)),
      steps: steps.map((step, stepIndex) => ({
        name: String(step.name || `Pas ${stepIndex + 1}`).trim(),
        actor_type: workflowActorTypeOptions.some(item => item.value === step.actor_type) ? step.actor_type : 'role',
        actor_ref: String(step.actor_ref || step.actorRef || '').trim(),
        deadline_days: Math.max(0, Number(step.deadline_days ?? step.deadlineDays ?? 1)),
        required: step.required !== false,
        condition: String(step.condition || 'mereu').trim(),
        condition_rule: normalizeWorkflowConditionRuleClient(step.condition_rule || step.conditionRule || {}),
      })),
    }
  })
}

function compactWorkflowKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

function workflowFlowMatchesScenario(flow, scenario) {
  const tested = compactWorkflowKey(scenario?.document_type)
  if (!tested) return false
  const candidates = [flow.document_type, flow.id, flow.label].map(compactWorkflowKey).filter(Boolean)
  return candidates.some(candidate => candidate === tested || tested.includes(candidate))
}

function workflowActorLabel(step) {
  const actorType = workflowActorTypeOptions.find(item => item.value === step.actor_type)?.label || 'Actor'
  return `${actorType}${step.actor_ref ? `: ${step.actor_ref}` : ''}`
}

function defaultWorkflowConditionDraft() {
  return { field: 'estimated_value', operator: '>=', value: '' }
}

function normalizeWorkflowConditionRuleClient(rule) {
  if (!rule || typeof rule !== 'object') return null
  const field = String(rule?.field || '').trim()
  const operator = String(rule?.operator || '').trim()
  if (!field || field === 'always') return { field: 'always', operator: '=', value: '' }
  return {
    field: workflowConditionFieldOptions.some(item => item.value === field) ? field : 'estimated_value',
    operator: workflowConditionOperatorOptions.some(item => item.value === operator) ? operator : '=',
    value: String(rule?.value ?? '').trim().slice(0, 120),
  }
}

function buildWorkflowConditionLabel(draft = {}) {
  if (!draft.field || draft.field === 'always') return 'mereu'
  const field = workflowConditionFieldOptions.find(item => item.value === draft.field)?.label || draft.field
  const operator = workflowConditionOperatorOptions.find(item => item.value === draft.operator)?.value || '='
  const value = String(draft.value || '').trim()
  if (!value) return `${field.toLowerCase()} ${operator} ...`
  return `${field.toLowerCase()} ${operator} ${value}`
}

function simulateWorkflowDocumentFlow(flows, scenario = {}) {
  const activeFlows = normalizeWorkflowDocumentFlowsClient(flows).filter(flow => flow.active !== false)
  const flow = activeFlows.find(item => workflowFlowMatchesScenario(item, scenario)) || null
  const warnings = []
  if (!flow) {
    warnings.push('Nu există un șablon activ pentru tipul testat. La lansare se va folosi fallback-ul existent.')
    return { flow: null, steps: [], warnings }
  }
  const value = Number(scenario.value || 0)
  const hasValue = Number.isFinite(value) && value > 0
  if (!flow.steps?.length) warnings.push('Fluxul este activ, dar nu are pași configurați.')
  if ((flow.steps || []).some(step => step.actor_type === 'manager') && !scenario.initiator) {
    warnings.push('Există pas pe manager direct. Pentru test complet alege inițiatorul documentului.')
  }
  if ((flow.steps || []).some(step => step.actor_type === 'department') && !scenario.department) {
    warnings.push('Există pas pe departament. Pentru test complet alege departamentul documentului.')
  }
  if ((flow.steps || []).some(step => step.condition?.toLowerCase().includes('valoare')) && !hasValue) {
    warnings.push('Fluxul are condiții după valoare. Completează valoarea estimată ca să fie clar când se aplică pasul.')
  }
  if ((flow.steps || []).some(step => step.actor_type === 'user' && /responsabil|angajat|asociat/i.test(step.actor_ref || ''))) {
    warnings.push('Unii pași folosesc referințe generice de utilizator. La documentul real trebuie să existe responsabil/angajat asociat.')
  }
  const steps = (flow.steps || []).map((step, index) => ({
    ...step,
    index: index + 1,
    actor_label: workflowActorLabel(step),
    applies_hint: step.condition && step.condition !== 'mereu' ? step.condition : 'se aplică mereu',
  }))
  return { flow, steps, warnings }
}

const fallbackCountryProfiles = [
  { code: 'RO', label: 'România', locale: 'ro-RO', currency: 'RON', timezone: 'Europe/Bucharest', jurisdiction_profile: 'RO', legislation_status: 'activ' },
  { code: 'GB', label: 'United Kingdom', locale: 'en-GB', currency: 'GBP', timezone: 'Europe/London', jurisdiction_profile: 'GB', legislation_status: 'roadmap' },
  { code: 'US', label: 'United States', locale: 'en-US', currency: 'USD', timezone: 'America/New_York', jurisdiction_profile: 'US', legislation_status: 'roadmap' },
  { code: 'DE', label: 'Germany', locale: 'de-DE', currency: 'EUR', timezone: 'Europe/Berlin', jurisdiction_profile: 'DE', legislation_status: 'roadmap' },
  { code: 'FR', label: 'France', locale: 'fr-FR', currency: 'EUR', timezone: 'Europe/Paris', jurisdiction_profile: 'FR', legislation_status: 'roadmap' },
  { code: 'IT', label: 'Italy', locale: 'it-IT', currency: 'EUR', timezone: 'Europe/Rome', jurisdiction_profile: 'IT', legislation_status: 'roadmap' },
  { code: 'ES', label: 'Spain', locale: 'es-ES', currency: 'EUR', timezone: 'Europe/Madrid', jurisdiction_profile: 'ES', legislation_status: 'roadmap' },
  { code: 'GLOBAL', label: 'Global / demo', locale: 'en', currency: 'EUR', timezone: 'UTC', jurisdiction_profile: 'GLOBAL', legislation_status: 'generic' },
]

const localeOptions = ['ro-RO', 'en', 'en-GB', 'en-US', 'de-DE', 'fr-FR', 'it-IT', 'es-ES']
const currencyOptions = ['RON', 'EUR', 'GBP', 'USD']
const timezoneOptions = ['Europe/Bucharest', 'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'Europe/Rome', 'Europe/Madrid', 'America/New_York', 'UTC']

const fallbackCountryRules = {
  current: {
    country: 'RO',
    rules: {
      status: 'active',
      modules: {
        hr: { payroll_profile: 'RO_D112' },
        accounting: { fiscal_profile: 'RO_ANAF', declarations: ['D300', 'D394', 'D112', 'D205', 'D406_SAF_T'] },
        documents: { default_language: 'ro' },
      },
      warnings: [],
    },
  },
  countries: [],
}

function arrayFrom(data, keys) {
  if (Array.isArray(data)) return data
  for (const key of keys) if (Array.isArray(data?.[key])) return data[key]
  return []
}

function daysUntil(value) {
  if (!value) return null
  const end = new Date(value)
  if (Number.isNaN(end.getTime())) return null
  return Math.ceil((end - new Date()) / 86400000)
}

function normalizeBranding(input = {}) {
  return {
    logo: input.logo || '',
    primaryColor: input.primaryColor || input.primary_color || input.culoare_primara || '#0F6E56',
    secondaryColor: input.secondaryColor || input.culoare_secundara || '#1a56db',
    docHeader: Array.isArray(input.docHeader) ? input.docHeader : [
      input.doc_header_linie1 || '',
      input.doc_header_linie2 || '',
      input.doc_header_linie3 || '',
      input.doc_header_linie4 || '',
    ],
    docFooter: {
      left: input.docFooter?.left || input.footerLeft || input.footer_left || '',
      center: input.docFooter?.center || input.footerCenter || input.footer_center || '',
      right: input.docFooter?.right || input.footerRight || input.footer_right || '',
    },
  }
}

function mapEntries(map = {}) {
  return Object.entries(map || {}).map(([product, materialId]) => ({ product, materialId }))
}

function SettingsSetupAssistant({ steps, done, percent, nextStep, loading, onOpenTab }) {
  const [collapsed, setCollapsed] = useState(false)
  const visibleSteps = steps.slice(0, 6)

  useEffect(() => {
    if (loading) return
    setCollapsed(!nextStep)
  }, [loading, nextStep])

  const statusLabel = loading
    ? 'verificare'
    : nextStep
      ? 'de configurat'
      : 'complet'

  return (
    <Card className="border-primary-100 bg-gradient-to-br from-white via-primary-50/40 to-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-primary-700">Asistent configurare</div>
          <h3 className="mt-1 text-lg font-bold text-slate-900">{nextStep && !loading ? `Următorul pas: ${nextStep.label}` : 'Configurarea organizației'}</h3>
          <p className="mt-1 text-sm text-slate-600">
            {nextStep && !loading ? nextStep.hint : 'InfraFlow îți arată ce este gata și ce mai trebuie verificat înainte de lucru real.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={nextStep ? 'warning' : 'success'}>{statusLabel}</Badge>
          <span className="text-sm font-semibold text-slate-700">{done}/{steps.length} pași · {percent}%</span>
          {nextStep && !loading ? (
            <Button size="sm" variant="secondary" onClick={() => onOpenTab(nextStep.tab)}>Deschide {nextStep.tab}</Button>
          ) : null}
          <Button size="sm" variant="secondary" onClick={() => setCollapsed(value => !value)}>
            {collapsed ? 'Arată detalii' : 'Strânge'}
          </Button>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-primary-600 transition-all" style={{ width: `${percent}%` }} />
      </div>
      {!collapsed ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-sm text-slate-600">
              Setările sunt centrul de comandă pentru onboarding: profil companie, module, utilizatori, departamente, licență și integrări. După completare, acest panou se strânge automat ca să nu ocupe spațiu inutil.
            </p>
            {nextStep && !loading ? (
              <div className="mt-4 rounded-[var(--radius-panel)] border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <div className="font-semibold">Următorul pas recomandat: {nextStep.label}</div>
                <div className="mt-1">{nextStep.hint}</div>
                <Button className="mt-3" size="sm" variant="secondary" onClick={() => onOpenTab(nextStep.tab)}>
                  Deschide {nextStep.tab}
                </Button>
              </div>
            ) : null}
            {!nextStep && !loading ? (
              <div className="mt-4 rounded-[var(--radius-panel)] border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                Configurarea de bază este completă. Panoul rămâne disponibil compact pentru verificări rapide.
              </div>
            ) : null}
          </div>
          <div className="grid gap-2">
            {visibleSteps.map(step => (
              <button
                key={step.key}
                type="button"
                onClick={() => onOpenTab(step.tab)}
                className={`flex items-start justify-between gap-3 rounded-[var(--radius-panel)] border p-3 text-left text-sm transition hover:-translate-y-0.5 hover:shadow-sm ${step.done ? 'border-primary-100 bg-primary-50/70 text-primary-900' : 'border-slate-200 bg-white text-slate-700 hover:border-primary-200'}`}
              >
                <span>
                  <span className="block font-semibold">{step.done ? '✓' : '○'} {step.label}</span>
                  <span className="mt-1 block text-xs text-slate-500">{step.done ? 'Configurat' : step.hint}</span>
                </span>
                <Badge tone={step.done ? 'success' : 'warning'} size="sm">{step.done ? 'gata' : step.tab}</Badge>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  )
}

export default function SetariPage() {
  const [activeTab, setActiveTab] = useState(() => {
    const tab = new URLSearchParams(window.location.search).get('tab')
    return tabGroups.some(group => group.tabs.includes(tab)) ? tab : 'General'
  })
  const [settings, setSettings] = useState({})
  const [moduleConfig, setModuleConfig] = useState(null)
  const [moduleFeatureDraft, setModuleFeatureDraft] = useState({})
  const [moduleCatalog, setModuleCatalog] = useState(null)
  const [countryProfiles, setCountryProfiles] = useState(fallbackCountryProfiles)
  const [countryRules, setCountryRules] = useState(fallbackCountryRules)
  const [databaseConfig, setDatabaseConfig] = useState({ server: '.\\SQLEXPRESS', database: 'INFRAFLOW', authMode: 'windows', user: 'infraflow', password: '', encrypt: 'false', relational: false })
  const [databaseHealth, setDatabaseHealth] = useState(null)
  const [databaseSchema, setDatabaseSchema] = useState(null)
  const [databaseSaving, setDatabaseSaving] = useState(false)
  const [databaseTesting, setDatabaseTesting] = useState(false)
  const [databaseSchemaLoading, setDatabaseSchemaLoading] = useState(false)
  const [databaseAccountingSyncing, setDatabaseAccountingSyncing] = useState(false)
  const [license, setLicense] = useState(null)
  const [branding, setBranding] = useState(normalizeBranding())
  const [appearance, setAppearance] = useState(() => ({
    theme: localStorage.getItem('infraflow_theme') || 'light',
    density: localStorage.getItem('infraflow_density') || 'normal',
    fontScale: Number(localStorage.getItem('infraflow_font_scale') || 1),
    radius: localStorage.getItem('infraflow_radius') || 'standard',
    contrast: localStorage.getItem('infraflow_contrast') || 'normal',
  }))
  const [aiStatus, setAiStatus] = useState(null)
  const [users, setUsers] = useState([])
  const [departments, setDepartments] = useState([])
  const [deptLoading, setDeptLoading] = useState(false)
  const [deptModal, setDeptModal] = useState(false)
  const [deptEditing, setDeptEditing] = useState(null)
  const [deptForm, setDeptForm] = useState(emptyDeptForm)
  const [deptError, setDeptError] = useState('')
  const [permCatalog, setPermCatalog] = useState([])
  const [rolesData, setRolesData] = useState([])
  const [selectedRoleId, setSelectedRoleId] = useState(null)
  const [roleEditMeta, setRoleEditMeta] = useState({ name: '', description: '' })
  const [roleEditPerms, setRoleEditPerms] = useState([])
  const [roleSaving, setRoleSaving] = useState(false)
  const [roleMsg, setRoleMsg] = useState('')
  const [roleCreateModal, setRoleCreateModal] = useState(false)
  const [roleCreateForm, setRoleCreateForm] = useState({ name: '', description: '', permissions: [] })
  const [roleCreateSaving, setRoleCreateSaving] = useState(false)
  const [roleCreateMsg, setRoleCreateMsg] = useState('')
  const [roleDeleteConfirm, setRoleDeleteConfirm] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [materials, setMaterials] = useState([])
  const [updateInfo, setUpdateInfo] = useState(null)
  const [manualUpdate, setManualUpdate] = useState(null)
  const [updateHistory, setUpdateHistory] = useState([])
  const [updateStatus, setUpdateStatus] = useState(null)
  const [changelogModal, setChangelogModal] = useState(false)
  const [changelogText, setChangelogText] = useState('')
  const [uploadingUpdate, setUploadingUpdate] = useState(false)
  const [scaleRows, setScaleRows] = useState([])
  const [piusiStatus, setPiusiStatus] = useState(null)
  const [piusiConfig, setPiusiConfig] = useState({ mdb_path: 'C:\\Piusi\\SelfService\\Data\\Self.mdb', sync_interval_min: 30 })
  const [piusiMapari, setPiusiMapari] = useState([])
  const [piusiAssets, setPiusiAssets] = useState([])
  const [piusiSyncing, setPiusiSyncing] = useState(false)
  const [emailSyncStatus, setEmailSyncStatus] = useState(emptyEmailSyncStatus)
  const [emailRuleTests, setEmailRuleTests] = useState({})
  const [integrationTests, setIntegrationTests] = useState({})
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [updateModal, setUpdateModal] = useState(false)
  const [progress, setProgress] = useState(0)
  const [userModal, setUserModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [resetUser, setResetUser] = useState(null)
  const [resetPassword, setResetPassword] = useState('')
  const [userForm, setUserForm] = useState(emptyUserForm)
  const [aiKey, setAiKey] = useState('')
  const [aiForm, setAiForm] = useState({ model_default: 'claude-haiku-4-5', monthly_budget: 200, limit_per_user: 30 })
  const [hrEmployees, setHrEmployees] = useState([])
  // Verify-identity state (user modal)
  const [verifyHr, setVerifyHr] = useState(false)
  const [verifyCnp, setVerifyCnp] = useState('')
  const [verifySerie, setVerifySerie] = useState('')
  const [verifyNumar, setVerifyNumar] = useState('')
  const [verifyResult, setVerifyResult] = useState(null) // null | { found, error, employee_id, nume, functia } | 'not_found'
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [workflowTest, setWorkflowTest] = useState({
    document_type: 'referat',
    initiator: '',
    department: '',
    value: '',
    priority: 'normal',
  })
  const [workflowConditionDrafts, setWorkflowConditionDrafts] = useState({})

  const activeModules = useMemo(() => new Set(license?.module_active || license?.module || []), [license])
  const configurableModuleKeys = useMemo(() => moduleGroups.flatMap(group => group.modules).filter(item => !['core', 'production', 'inventory', 'reports'].includes(item.key)).map(item => item.key), [])
  const enabledModules = useMemo(() => {
    const saved = settings.modules_enabled
    return Array.isArray(saved) ? saved : configurableModuleKeys
  }, [settings.modules_enabled, configurableModuleKeys])
  const licensedModules = useMemo(() => {
    const items = license?.module_active || license?.module || []
    return new Set(items.map(item => String(item).toLowerCase()))
  }, [license])
  const userLimit = license?.limite?.max_utilizatori || license?.limite?.maxUsers || 0
  const licenseDays = daysUntil(license?.valabilitate?.expira_la)
  const activeConfigurableModules = useMemo(
    () => enabledModules.filter(moduleKey => configurableModuleKeys.includes(moduleKey)),
    [enabledModules, configurableModuleKeys]
  )
  const visibleCommercialPackages = useMemo(
    () => moduleCatalog?.packages?.length ? moduleCatalog.packages : commercialModulePackages,
    [moduleCatalog]
  )
  const workflowDocumentFlows = useMemo(
    () => normalizeWorkflowDocumentFlowsClient(settings.workflow_document_flows),
    [settings.workflow_document_flows]
  )
  const workflowFlowStats = useMemo(() => {
    const active = workflowDocumentFlows.filter(flow => flow.active !== false)
    const steps = workflowDocumentFlows.reduce((total, flow) => total + (flow.steps?.length || 0), 0)
    const conditioned = workflowDocumentFlows.reduce(
      (total, flow) => total + (flow.steps || []).filter(step => step.condition && step.condition !== 'mereu').length,
      0
    )
    return { active: active.length, total: workflowDocumentFlows.length, steps, conditioned }
  }, [workflowDocumentFlows])
  const workflowSimulation = useMemo(
    () => simulateWorkflowDocumentFlow(workflowDocumentFlows, workflowTest),
    [workflowDocumentFlows, workflowTest]
  )
  const moduleByKey = useMemo(
    () => new Map(moduleGroups.flatMap(group => group.modules).map(mod => [mod.key, mod])),
    []
  )
  const selectedCountryProfile = useMemo(
    () => countryProfiles.find(profile => profile.code === (settings.country || 'RO')) || countryProfiles[0] || fallbackCountryProfiles[0],
    [countryProfiles, settings.country]
  )
  const selectedCountryRules = useMemo(() => {
    const code = settings.country || countryRules.current?.country || 'RO'
    return countryRules.countries?.find(item => item.country === code) || countryRules.current || fallbackCountryRules.current
  }, [countryRules, settings.country])
  const availableLocales = useMemo(
    () => Array.from(new Set([...localeOptions, ...countryProfiles.map(profile => profile.locale).filter(Boolean)])),
    [countryProfiles]
  )
  const availableCurrencies = useMemo(
    () => Array.from(new Set([...currencyOptions, ...countryProfiles.map(profile => profile.currency).filter(Boolean)])),
    [countryProfiles]
  )
  const availableTimezones = useMemo(
    () => Array.from(new Set([...timezoneOptions, ...countryProfiles.map(profile => profile.timezone).filter(Boolean)])),
    [countryProfiles]
  )
  const onboardingSteps = useMemo(() => {
    const enabled = new Set(enabledModules)
    const hasCompany = Boolean(settings.companyName || settings.company_name || settings.firma || settings.nume_companie)
      && Boolean(settings.companyCif || settings.company_cif || settings.cui || settings.cif)
    const hasCountryProfile = Boolean(settings.country && settings.locale && settings.currency && settings.timezone)
    const hasLicenseSignal = Boolean(license?.valida || license?.demo || license?.pachet || license?.module_active?.length || license?.module?.length)
    const hasSmtp = Boolean(settings.smtp_host && (settings.smtp_user || settings.smtp_name || settings.email))
    return [
      { key: 'company', label: 'Date organizație', done: hasCompany, hint: 'Completează denumirea și CUI/CIF.', tab: 'General' },
      { key: 'country', label: 'Profil țară', done: hasCountryProfile, hint: 'Alege țara, limba, moneda și fusul orar.', tab: 'General' },
      { key: 'modules', label: 'Module alese', done: activeConfigurableModules.length > 0, hint: 'Alege pachetul comercial sau modulele utile.', tab: 'Module' },
      { key: 'license', label: 'Licență / trial', done: hasLicenseSignal && !license?.expirata, hint: 'Importă licența sau rulează în demo/trial controlat.', tab: 'Licență' },
      { key: 'users', label: 'Utilizatori', done: users.filter(user => user.active !== false).length > 1, hint: 'Adaugă utilizatorii cheie.', tab: 'Utilizatori' },
      { key: 'departments', label: 'Departamente', done: departments.length > 0, hint: 'Definește structura organizației.', tab: 'Departamente' },
      { key: 'hr', label: 'Angajați HR', done: !enabled.has('hr') || hrEmployees.length > 0, hint: 'Importă sau adaugă primii angajați.', tab: 'Module', optional: !enabled.has('hr') },
      { key: 'smtp', label: 'Email notificări', done: hasSmtp || !enabled.has('messaging'), hint: 'Configurează SMTP pentru notificări reale.', tab: 'General', optional: !enabled.has('messaging') },
      { key: 'ai', label: 'AI Assistant', done: !enabled.has('ai') || Boolean(aiStatus?.configured || aiStatus?.hasKey), hint: 'Adaugă cheia API pentru helperul AI.', tab: 'AI Assistant', optional: !enabled.has('ai') },
    ].filter(step => !step.optional || !step.done)
  }, [settings, enabledModules, activeConfigurableModules.length, license, users, departments, hrEmployees, aiStatus])
  const onboardingDone = onboardingSteps.filter(step => step.done).length
  const onboardingPercent = onboardingSteps.length ? Math.round((onboardingDone / onboardingSteps.length) * 100) : 100
  const nextOnboardingStep = onboardingSteps.find(step => !step.done)
  const orgChart = useMemo(() => {
    const activeUsers = users.filter(user => user.active !== false)
    const byId = new Map(activeUsers.map(user => [String(user.id), user]))
    const childrenByManager = new Map()
    const invalidLinks = []
    activeUsers.forEach(user => {
      const managerId = getUserManagerId(user)
      if (!managerId) return
      const manager = byId.get(managerId)
      if (!manager) {
        invalidLinks.push(user)
        return
      }
      const children = childrenByManager.get(managerId) || []
      children.push(user)
      childrenByManager.set(managerId, children)
    })
    const managers = Array.from(childrenByManager.entries())
      .map(([managerId, children]) => ({ manager: byId.get(managerId), children: children.sort((a, b) => userDisplayName(a).localeCompare(userDisplayName(b), 'ro')) }))
      .filter(item => item.manager)
      .sort((a, b) => userDisplayName(a.manager).localeCompare(userDisplayName(b.manager), 'ro'))
    const withoutManager = activeUsers
      .filter(user => !getUserManagerId(user))
      .sort((a, b) => userDisplayName(a).localeCompare(userDisplayName(b), 'ro'))
    return { activeUsers, managers, withoutManager, invalidLinks }
  }, [users])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [settingsRes, licenseRes, brandingRes, usersRes, aiRes, materialsRes, updateRes, historyRes, statusRes, hrEmpRes, piusiStatusRes, dbConfigRes, moduleCatalogRes, countryProfilesRes, countryRulesRes, emailSyncStatusRes] = await Promise.allSettled([
        api.get('/settings'),
        api.get('/license/status'),
        api.get('/admin/branding'),
        api.get('/users'),
        api.get('/admin/ai/status'),
        api.get('/materials'),
        api.get('/system/update/check'),
        api.get('/system/update/history'),
        api.get('/system/update/status'),
        api.get('/hr/employees?activ=1'),
        api.get('/integration/piusi/status'),
        api.get('/system/database-config'),
        api.get('/settings/modules/catalog'),
        api.get('/settings/country-profiles'),
        api.get('/settings/country-rules'),
        api.get('/messaging/email/sync/status'),
      ])
      if (settingsRes.status === 'fulfilled') {
        const nextSettings = settingsRes.value.data.settings || {}
        const { logoDataUrl: _logo, ...safeSettings } = nextSettings
        setSettings({ ...safeSettings, gps_api_key: '', gps_password: '', smtp_password: '', imap_password: '' })
        setScaleRows(mapEntries(nextSettings.scaleProductMap || {}))
      }
      if (licenseRes.status === 'fulfilled') setLicense(licenseRes.value.data.license || licenseRes.value.data)
      if (brandingRes.status === 'fulfilled') setBranding(normalizeBranding(brandingRes.value.data.branding || {}))
      if (usersRes.status === 'fulfilled') setUsers(arrayFrom(usersRes.value.data, ['users']))
      if (aiRes.status === 'fulfilled') setAiStatus(aiRes.value.data)
      if (materialsRes.status === 'fulfilled') setMaterials(arrayFrom(materialsRes.value.data, ['materials', 'items', 'data']))
      if (updateRes.status === 'fulfilled') setUpdateInfo(updateRes.value.data)
      if (historyRes.status === 'fulfilled') setUpdateHistory(arrayFrom(historyRes.value.data, ['history', 'items']))
      if (statusRes.status === 'fulfilled') setUpdateStatus(statusRes.value.data || null)
      if (hrEmpRes.status === 'fulfilled') setHrEmployees(arrayFrom(hrEmpRes.value.data, ['employees', 'items', 'data']))
      if (piusiStatusRes.status === 'fulfilled') {
        const status = piusiStatusRes.value.data || {}
        setPiusiStatus(status)
        setPiusiConfig({
          mdb_path: status.mdb_path || 'C:\\Piusi\\SelfService\\Data\\Self.mdb',
          sync_interval_min: status.sync_interval_min || 30,
        })
      }
      if (dbConfigRes.status === 'fulfilled') {
        const cfg = dbConfigRes.value.data.config || {}
        setDatabaseConfig({ ...cfg, password: '' })
        setDatabaseHealth(dbConfigRes.value.data.health || null)
      }
      if (moduleCatalogRes.status === 'fulfilled') setModuleCatalog(moduleCatalogRes.value.data.catalog || null)
      if (countryProfilesRes.status === 'fulfilled') {
        const countries = arrayFrom(countryProfilesRes.value.data, ['countries'])
        if (countries.length) setCountryProfiles(countries)
      }
      if (countryRulesRes.status === 'fulfilled') setCountryRules(countryRulesRes.value.data || fallbackCountryRules)
      if (emailSyncStatusRes.status === 'fulfilled') setEmailSyncStatus(emailSyncStatusRes.value.data?.status || emptyEmailSyncStatus)
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut încărca setările.')
    } finally {
      setLoading(false)
    }
  }

  async function loadDepartments() {
    setDeptLoading(true)
    try {
      const [departmentsRes, rolesRes] = await Promise.allSettled([
        api.get('/departments'),
        api.get('/roles'),
      ])
      if (departmentsRes.status === 'fulfilled') {
        setDepartments(departmentsRes.value.data.departments || [])
      }
      if (rolesRes.status === 'fulfilled') {
        setPermCatalog(rolesRes.value.data.catalog || [])
        setRolesData(rolesRes.value.data.roles || [])
      }
    } catch {
      setDepartments([])
    } finally {
      setDeptLoading(false)
    }
  }

  useEffect(() => {
    Promise.resolve().then(() => load())
  }, [])

  useEffect(() => {
    Promise.resolve().then(() => loadDepartments())
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = appearance.theme
    document.documentElement.dataset.density = appearance.density
    document.documentElement.dataset.radius = appearance.radius
    document.documentElement.dataset.contrast = appearance.contrast
    document.documentElement.style.setProperty('--app-font-scale', String(appearance.fontScale))
  }, [appearance])

  function notify(text) {
    setMessage(text)
    setError('')
  }

  function fail(err, fallback) {
    setError(err.response?.data?.error || err.response?.data?.eroare || fallback)
    setMessage('')
  }

  function applyCountryProfile(countryCode) {
    const profile = countryProfiles.find(item => item.code === countryCode) || fallbackCountryProfiles.find(item => item.code === countryCode) || fallbackCountryProfiles[0]
    setSettings(s => ({
      ...s,
      country: profile.code,
      locale: profile.locale,
      language: profile.locale,
      currency: profile.currency,
      timezone: profile.timezone,
      jurisdiction_profile: profile.jurisdiction_profile || profile.code,
    }))
  }

  async function saveSettings(event) {
    event.preventDefault()
    try {
      const response = await api.post('/settings', settings)
      setSettings({ ...(response.data.settings || settings), gps_api_key: '', gps_password: '', smtp_password: '', imap_password: '' })
      const syncStatus = await api.get('/messaging/email/sync/status').catch(() => null)
      if (syncStatus?.data?.status) setEmailSyncStatus(syncStatus.data.status)
      notify('Setările generale au fost salvate.')
    } catch (err) {
      fail(err, 'Setările nu au putut fi salvate.')
    }
  }

  async function importLicense(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const data = new FormData()
    data.append('file', file)
    try {
      const response = await api.post('/license/import', data)
      setLicense(response.data.license)
      notify('Licența a fost importată.')
    } catch (err) {
      fail(err, 'Licența nu a putut fi importată.')
    }
  }

  async function saveBranding(event) {
    event.preventDefault()
    try {
      const response = await api.post('/admin/branding', {
        culoare_primara: branding.primaryColor,
        culoare_secundara: branding.secondaryColor,
        doc_header_linie1: branding.docHeader[0] || '',
        doc_header_linie2: branding.docHeader[1] || '',
        doc_header_linie3: branding.docHeader[2] || '',
        doc_header_linie4: branding.docHeader[3] || '',
        doc_footer_stanga: branding.docFooter.left || '',
        doc_footer_centru: branding.docFooter.center || '',
        doc_footer_dreapta: branding.docFooter.right || '',
        logo: branding.logo || '',
      })
      setBranding(normalizeBranding(response.data.branding || branding))
      document.documentElement.style.setProperty('--color-primary', branding.primaryColor)
      notify('Aspectul a fost salvat.')
    } catch (err) {
      fail(err, 'Aspectul nu a putut fi salvat.')
    }
  }

  async function uploadLogo(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      setError('Logo-ul trebuie să aibă maximum 2MB.')
      return
    }
    const data = new FormData()
    data.append('file', file)
    try {
      const response = await api.post('/admin/branding/logo', data)
      setBranding(normalizeBranding(response.data.branding || branding))
      notify('Logo-ul a fost încărcat.')
    } catch (err) {
      fail(err, 'Logo-ul nu a putut fi încărcat.')
    }
  }

  async function testAiConnection() {
    try {
      const response = await api.post('/admin/ai/test', aiKey ? { api_key: aiKey } : {})
      notify(`Conexiune AI OK. Latență: ${response.data.latenta_ms || '-'} ms.`)
    } catch (err) {
      fail(err, 'Conexiunea AI nu a putut fi testată.')
    }
  }

  async function activateAi() {
    try {
      const response = await api.post('/admin/ai/configure', { ...aiForm, api_key: aiKey })
      await api.post('/admin/ai/toggle', { enabled: true })
      setAiStatus(current => ({ ...(current || {}), enabled: true, model: aiForm.model_default, monthly_budget: aiForm.monthly_budget, limit_per_user: aiForm.limit_per_user, api_key_configured: true, latenta_ms: response.data.latenta_ms }))
      setAiKey('')
      notify('AI Assistant a fost activat.')
    } catch (err) {
      fail(err, 'AI Assistant nu a putut fi activat.')
    }
  }

  async function toggleAi(enabled) {
    try {
      const response = await api.post('/admin/ai/toggle', { enabled })
      setAiStatus(current => ({ ...(current || {}), enabled: response.data.enabled }))
      notify(enabled ? 'AI Assistant a fost activat.' : 'AI Assistant a fost dezactivat.')
    } catch (err) {
      fail(err, 'Statusul AI nu a putut fi modificat.')
    }
  }

  async function checkUpdate() {
    setProgress(25)
    try {
      const response = await api.get('/system/update/check')
      setUpdateInfo(response.data)
      setProgress(100)
      setTimeout(() => setProgress(0), 800)
    } catch (err) {
      setProgress(0)
      fail(err, 'Nu am putut verifica actualizările.')
    }
  }

  async function installUpdate() {
    setUpdateModal(false)
    setProgress(20)
    const timer = setInterval(() => setProgress(current => Math.min(90, current + 10)), 1000)
    try {
      const response = manualUpdate
        ? await api.post('/system/update/apply', { filename: manualUpdate.filename })
        : await api.post('/system/update/install', { versiune: updateInfo?.versiune_noua })
      notify(`Update aplicat! Repornire în ${response.data.restart_in || 3} secunde...`)
      setProgress(100)
      setTimeout(() => window.location.reload(), 5000)
    } catch (err) {
      fail(err, 'Update-ul nu a putut fi instalat.')
    } finally {
      clearInterval(timer)
      setTimeout(() => setProgress(0), 1200)
    }
  }

  async function openChangelog() {
    try {
      const response = await api.get('/system/update/changelog', { params: { local: 1 }, responseType: 'text' })
      setChangelogText(response.data || 'CHANGELOG indisponibil.')
      setChangelogModal(true)
    } catch (err) {
      fail(err, 'Nu am putut citi CHANGELOG.md.')
    }
  }

  async function uploadUpdatePackage(file) {
    if (!file) return
    setUploadingUpdate(true)
    setManualUpdate(null)
    setProgress(35)
    const data = new FormData()
    data.append('update_package', file)
    try {
      const response = await api.post('/system/update/upload', data)
      setManualUpdate(response.data)
      setProgress(100)
      setTimeout(() => setProgress(0), 800)
      notify('Pachetul de update a fost verificat.')
    } catch (err) {
      setProgress(0)
      fail(err, 'Pachetul de update nu a putut fi verificat.')
    } finally {
      setUploadingUpdate(false)
    }
  }

  async function refreshUpdateStatus() {
    try {
      const response = await api.get('/system/update/status')
      setUpdateStatus(response.data || null)
      notify('Statusul update/restart a fost verificat.')
    } catch (err) {
      fail(err, 'Nu am putut verifica statusul update/restart.')
    }
  }

  function saveAppearance(event) {
    event.preventDefault()
    localStorage.setItem('infraflow_theme', appearance.theme)
    localStorage.setItem('infraflow_density', appearance.density)
    localStorage.setItem('infraflow_font_scale', String(appearance.fontScale))
    localStorage.setItem('infraflow_radius', appearance.radius)
    localStorage.setItem('infraflow_contrast', appearance.contrast)
    document.documentElement.dataset.theme = appearance.theme
    document.documentElement.dataset.density = appearance.density
    document.documentElement.dataset.radius = appearance.radius
    document.documentElement.dataset.contrast = appearance.contrast
    document.documentElement.style.setProperty('--app-font-scale', String(appearance.fontScale))
    window.dispatchEvent(new Event('infraflow:appearance'))
    notify('Preferințele vizuale au fost salvate pe acest dispozitiv.')
  }

  async function reimportCpvCodes() {
    try {
      const response = await api.post('/admin/import-cpv')
      notify(`Coduri CPV sincronizate: ${response.data.imported} importate, ${response.data.skipped} duplicate sărite.`)
    } catch (err) {
      fail(err, 'Codurile CPV nu au putut fi reimportate.')
    }
  }

  function openCreateUser() {
    setEditingUser(null)
    setUserForm(emptyUserForm)
    setVerifyHr(false)
    setVerifyCnp('')
    setVerifySerie('')
    setVerifyNumar('')
    setVerifyResult(null)
    setUserModal(true)
  }

  function openEditUser(user) {
    setEditingUser(user)
    setUserForm({
      name: user.name || '',
      username: user.username || '',
      email: user.email || '',
      password: '',
      role: user.role || 'operator',
      department: user.department || '',
      departmentId: user.departmentId || '',
      manager_id: user.manager_id || user.managerId || '',
      active: user.active !== false,
      employee_id: user.employee_id || '',
      verified_from_hr: user.verified_from_hr || false,
    })
    setVerifyHr(false)
    setVerifyResult(null)
    setUserModal(true)
  }

  async function verifyEmployee() {
    setVerifyLoading(true)
    setVerifyResult(null)
    try {
      const response = await api.post('/hr/verify-employee', {
        cnp: verifyCnp,
        act_serie: verifySerie,
        act_numar: verifyNumar,
      })
      const data = response.data
      setVerifyResult(data)
      if (data.found) {
        setUserForm(f => ({
          ...f,
          employee_id: data.employee_id,
          verified_from_hr: true,
          name: f.name || data.nume,
        }))
      }
    } catch (err) {
      const errData = err.response?.data || {}
      if (err.response?.status === 409) {
        setVerifyResult({ found: false, error: errData.error || 'Angajatul este deja asociat unui cont.' })
      } else {
        setVerifyResult({ found: false })
      }
    } finally {
      setVerifyLoading(false)
    }
  }

  function openCreateDept() {
    setDeptEditing(null)
    setDeptForm(emptyDeptForm)
    setDeptError('')
    setDeptModal(true)
  }

  function openEditDept(dept) {
    setDeptEditing(dept)
    setDeptForm({
      name: dept.name || dept.nume || dept.denumire || '',
      tip: dept.tip || dept.type || 'departament',
      icon: dept.icon || '👥',
      culoare: dept.culoare || dept.color || '#3B82F6',
      permissions: dept.permissions || [],
    })
    setDeptError('')
    setDeptModal(true)
  }

  async function handleCreateDept() {
    if (!deptForm.name.trim()) {
      setDeptError('Numele departamentului este obligatoriu.')
      return
    }
    setDeptLoading(true)
    try {
      const response = await api.post('/departments', {
        name: deptForm.name.trim(),
        tip: deptForm.tip,
        icon: deptForm.icon,
        culoare: deptForm.culoare,
        permissions: deptForm.permissions || [],
      })
      setDepartments(current => [...current, response.data.department])
      setDeptModal(false)
      setDeptEditing(null)
      setDeptError('')
      setDeptForm(emptyDeptForm)
      notify('Departamentul a fost creat.')
    } catch (err) {
      setDeptError(err.response?.data?.error || 'Eroare la creare departament.')
    } finally {
      setDeptLoading(false)
    }
  }

  async function handleUpdateDept() {
    if (!deptEditing) return
    if (!deptForm.name.trim()) {
      setDeptError('Numele departamentului este obligatoriu.')
      return
    }
    setDeptLoading(true)
    try {
      const response = await api.patch(`/departments/${deptEditing.id}`, {
        name: deptForm.name.trim(),
        tip: deptForm.tip,
        icon: deptForm.icon,
        culoare: deptForm.culoare,
        permissions: deptForm.permissions || [],
      })
      setDepartments(current => current.map(item => item.id === deptEditing.id ? response.data.department : item))
      setDeptModal(false)
      setDeptEditing(null)
      setDeptError('')
      notify('Departamentul a fost actualizat.')
    } catch (err) {
      setDeptError(err.response?.data?.error || 'Eroare la editare departament.')
    } finally {
      setDeptLoading(false)
    }
  }

  function handleDeleteDept(id) {
    const department = departments.find(item => String(item.id) === String(id))
    setConfirmAction({
      title: 'Șterge departamentul',
      message: `Ștergi departamentul ${department?.name || id}?`,
      details: 'Verifică înainte dacă nu este folosit de utilizatori, angajați sau fluxuri operaționale. Dacă serverul detectează dependențe, acțiunea va fi respinsă.',
      confirmLabel: 'Șterge departamentul',
      tone: 'danger',
      run: async () => {
        await api.delete(`/departments/${id}`)
        setDepartments(current => current.filter(item => item.id !== id))
        notify('Departamentul a fost șters.')
      },
    })
  }

  async function handleToggleDeptPermission(deptId, permission) {
    const dept = departments.find(item => item.id === deptId)
    if (!dept) return
    const permissions = dept.permissions || []
    const nextPermissions = permissions.includes(permission)
      ? permissions.filter(item => item !== permission)
      : [...permissions, permission]
    try {
      await api.put(`/departments/${deptId}`, { permissions: nextPermissions })
      setDepartments(current => current.map(item =>
        item.id === deptId ? { ...item, permissions: nextPermissions } : item
      ))
    } catch (err) {
      fail(err, 'Permisiunile departamentului nu au putut fi salvate.')
    }
  }

  function selectRole(roleId) {
    const found = rolesData.find(r => r.id === roleId)
    setSelectedRoleId(roleId)
    setRoleEditMeta({ name: found?.name || '', description: found?.description || '' })
    setRoleEditPerms(found ? [...found.permissions] : [])
    setRoleMsg('')
  }

  async function persistRole(roleId, nextPerms, meta = roleEditMeta) {
    const role = rolesData.find(item => item.id === roleId)
    if (!role || role.tip === 'sistem') return
    setRoleSaving(true)
    setRoleMsg('')
    try {
      const response = await api.put(`/roles/${roleId}`, {
        name: meta.name || role.name,
        description: meta.description || '',
        permissions: nextPerms,
      })
      setRolesData(response.data.roles || rolesData.map(item =>
        item.id === roleId ? { ...item, ...meta, permissions: nextPerms } : item
      ))
      setRoleMsg('Salvat automat.')
    } catch (err) {
      setRoleMsg('❌ ' + (err.response?.data?.error || 'Eroare la salvare.'))
    } finally {
      setRoleSaving(false)
    }
  }

  function toggleRolePerm(perm) {
    if (!selectedRoleId) return
    const nextPerms = roleEditPerms.includes(perm)
      ? roleEditPerms.filter(p => p !== perm)
      : [...roleEditPerms, perm]
    setRoleEditPerms(nextPerms)
    persistRole(selectedRoleId, nextPerms)
  }

  function toggleRoleGroup(groupPerms) {
    if (!selectedRoleId) return
    const allOn = groupPerms.every(p => roleEditPerms.includes(p))
    const nextPerms = allOn
      ? roleEditPerms.filter(p => !groupPerms.includes(p))
      : [...new Set([...roleEditPerms, ...groupPerms])]
    setRoleEditPerms(nextPerms)
    persistRole(selectedRoleId, nextPerms)
  }

  async function saveRolePermissions() {
    if (!selectedRoleId) return
    setRoleSaving(true)
    setRoleMsg('')
    try {
      const response = await api.put(`/roles/${selectedRoleId}`, {
        name: roleEditMeta.name,
        description: roleEditMeta.description,
        permissions: roleEditPerms,
      })
      setRolesData(response.data.roles || rolesData)
      setRoleMsg('✅ Permisiunile au fost salvate.')
    } catch (err) {
      setRoleMsg('❌ ' + (err.response?.data?.error || 'Eroare la salvare.'))
    } finally {
      setRoleSaving(false)
    }
  }

  function resetRolePermissions() {
    if (!selectedRoleId) return
    const roleId = selectedRoleId
    const role = rolesData.find(item => String(item.id) === String(roleId))
    setConfirmAction({
      title: 'Resetează permisiunile rolului',
      message: `Resetezi rolul ${role?.name || roleId} la permisiunile implicite?`,
      details: 'Permisiunile personalizate ale rolului vor fi înlocuite cu setul implicit definit în aplicație.',
      confirmLabel: 'Resetează rolul',
      tone: 'warning',
      run: async () => {
        setRoleSaving(true)
        const response = await api.patch(`/roles/${roleId}/permissions`, { reset: true })
        const updated = (response.data.roles || rolesData).find(r => String(r.id) === String(roleId))
        setRolesData(response.data.roles || rolesData)
        setRoleEditPerms(updated ? [...updated.permissions] : [])
        setRoleEditMeta({ name: updated?.name || '', description: updated?.description || '' })
        setRoleMsg('✅ Rolul a fost resetat la valorile implicite.')
      },
    })
  }

  async function runConfirmAction() {
    if (!confirmAction?.run) return
    setConfirmLoading(true)
    setError('')
    try {
      await confirmAction.run()
      setConfirmAction(null)
    } catch (err) {
      fail(err, 'Acțiunea nu a putut fi executată.')
    } finally {
      setRoleSaving(false)
      setConfirmLoading(false)
    }
  }

  async function createRole() {
    if (!roleCreateForm.name.trim()) { setRoleCreateMsg('❌ Numele este obligatoriu.'); return }
    setRoleCreateSaving(true)
    setRoleCreateMsg('')
    try {
      const response = await api.post('/roles', roleCreateForm)
      setRolesData(response.data.roles || rolesData)
      setRoleCreateModal(false)
      setRoleCreateForm({ name: '', description: '', permissions: [] })
      notify('✅ Rolul a fost creat.')
    } catch (err) {
      setRoleCreateMsg('❌ ' + (err.response?.data?.error || 'Eroare la creare.'))
    } finally {
      setRoleCreateSaving(false)
    }
  }

  async function deleteRole(roleId) {
    setRoleDeleteConfirm(null)
    try {
      const response = await api.delete(`/roles/${roleId}`)
      setRolesData(response.data.roles || rolesData)
      if (selectedRoleId === roleId) { setSelectedRoleId(null); setRoleEditPerms([]) }
      notify('Rolul a fost șters.')
    } catch (err) {
      fail(err, 'Rolul nu poate fi șters.')
    }
  }

  async function changeUserRole(userId, role) {
    try {
      const response = await api.put(`/users/${userId}/role`, { role })
      setUsers(current => current.map(item => item.id === userId ? response.data.user : item))
      notify('Rolul utilizatorului a fost actualizat.')
      loadDepartments()
    } catch (err) {
      fail(err, 'Rolul nu a putut fi schimbat.')
    }
  }

  function roleVariant(role) {
    if (role === 'superadmin') return 'red'
    if (['manager', 'accounting'].includes(role)) return 'blue'
    if (['operator', 'viewer'].includes(role)) return 'gray'
    return 'green'
  }

  function isModuleLicensed(moduleKey) {
    if (['core', 'production', 'inventory', 'reports'].includes(moduleKey)) return true
    if (!licensedModules.size) return true
    if (licensedModules.has('all') || licensedModules.has('full')) return true
    const aliases = {
      technical: ['technical_plus', 'technical'],
      traffic_safety: ['traffic_safety', 'trafficsafety'],
      snow_removal: ['snow_removal', 'snowremoval'],
      ai: ['ai', 'ai_assistant'],
    }
    return (aliases[moduleKey] || [moduleKey]).some(item => licensedModules.has(item))
  }

  function toggleModule(moduleKey) {
    if (!isModuleLicensed(moduleKey)) return
    setSettings(current => {
      const currentModules = Array.isArray(current.modules_enabled) ? current.modules_enabled : configurableModuleKeys
      const next = currentModules.includes(moduleKey)
        ? currentModules.filter(item => item !== moduleKey)
        : [...currentModules, moduleKey]
      return { ...current, modules_enabled: next }
    })
  }

  function applyCommercialPackage(pkg) {
    const modules = (pkg.modules || [])
      .map(item => String(item || '').trim().toLowerCase())
      .filter(moduleKey => configurableModuleKeys.includes(moduleKey) && isModuleLicensed(moduleKey))
    setSettings(current => ({ ...current, modules_enabled: Array.from(new Set(modules)) }))
    notify(`Profilul "${pkg.label}" a fost aplicat local. Apasă „Salvează module” pentru confirmare.`)
  }

  function defaultFeatureState(moduleKey) {
    return Object.fromEntries((moduleFeatureCatalog[moduleKey] || []).map(feature => [feature.key, true]))
  }

  function openModuleConfig(mod) {
    const saved = settings.module_features?.[mod.key] || {}
    setModuleConfig(mod)
    setModuleFeatureDraft({ ...defaultFeatureState(mod.key), ...saved })
  }

  function toggleModuleFeature(featureKey) {
    setModuleFeatureDraft(current => ({ ...current, [featureKey]: current[featureKey] === false }))
  }

  async function saveModuleConfig() {
    if (!moduleConfig) return
    const nextFeatures = {
      ...(settings.module_features || {}),
      [moduleConfig.key]: moduleFeatureDraft,
    }
    try {
      const response = await api.post('/settings/modules', {
        modules_enabled: enabledModules,
        module_features: nextFeatures,
      })
      setSettings(response.data.settings || { ...settings, module_features: nextFeatures })
      setModuleConfig(null)
      window.dispatchEvent(new Event('infraflow-settings-updated'))
      notify(`Configurarea modulului ${moduleConfig.label} a fost salvată.`)
    } catch (err) {
      fail(err, 'Configurarea modulului nu a putut fi salvată.')
    }
  }

  async function saveModules() {
    try {
      const response = await api.post('/settings/modules', {
        modules_enabled: enabledModules,
        module_features: settings.module_features || {},
      })
      setSettings(response.data.settings || { ...settings, modules_enabled: response.data.modules_enabled || enabledModules })
      window.dispatchEvent(new Event('infraflow-settings-updated'))
      notify('Modulele active au fost salvate.')
    } catch (err) {
      fail(err, 'Modulele nu au putut fi salvate.')
    }
  }

  function setWorkflowDocumentFlows(nextFlows) {
    setSettings(current => ({
      ...current,
      workflow_document_flows: normalizeWorkflowDocumentFlowsClient(nextFlows),
    }))
  }

  function updateWorkflowFlow(flowId, patch) {
    setWorkflowDocumentFlows(workflowDocumentFlows.map(flow => (
      flow.id === flowId ? { ...flow, ...patch } : flow
    )))
  }

  function updateWorkflowStep(flowId, stepIndex, patch) {
    setWorkflowDocumentFlows(workflowDocumentFlows.map(flow => {
      if (flow.id !== flowId) return flow
      return {
        ...flow,
        steps: (flow.steps || []).map((step, index) => (
          index === stepIndex ? { ...step, ...patch } : step
        )),
      }
    }))
  }

  function updateWorkflowConditionDraft(flowId, stepIndex, patch) {
    const key = `${flowId}:${stepIndex}`
    setWorkflowConditionDrafts(current => ({
      ...current,
      [key]: {
        ...defaultWorkflowConditionDraft(),
        ...(current[key] || {}),
        ...patch,
      },
    }))
  }

  function applyWorkflowConditionDraft(flowId, stepIndex) {
    const key = `${flowId}:${stepIndex}`
    const conditionRule = normalizeWorkflowConditionRuleClient(workflowConditionDrafts[key] || defaultWorkflowConditionDraft())
    const nextCondition = buildWorkflowConditionLabel(conditionRule)
    updateWorkflowStep(flowId, stepIndex, { condition: nextCondition, condition_rule: conditionRule })
  }

  function applyWorkflowConditionPreset(flowId, stepIndex, presetValue) {
    const preset = workflowConditionPresetOptions.find(item => item.value === presetValue)
    if (!preset) return
    const conditionRule = normalizeWorkflowConditionRuleClient(preset.rule || {})
    setWorkflowConditionDrafts(current => ({ ...current, [`${flowId}:${stepIndex}`]: conditionRule }))
    updateWorkflowStep(flowId, stepIndex, { condition: preset.value, condition_rule: conditionRule })
  }

  function addWorkflowStep(flowId) {
    setWorkflowDocumentFlows(workflowDocumentFlows.map(flow => {
      if (flow.id !== flowId) return flow
      return {
        ...flow,
        steps: [
          ...(flow.steps || []),
          {
            name: `Pas ${(flow.steps || []).length + 1}`,
            actor_type: 'role',
            actor_ref: '',
            deadline_days: 1,
            required: true,
            condition: 'mereu',
            condition_rule: { field: 'always', operator: '=', value: '' },
          },
        ],
      }
    }))
  }

  function removeWorkflowStep(flowId, stepIndex) {
    setWorkflowDocumentFlows(workflowDocumentFlows.map(flow => {
      if (flow.id !== flowId) return flow
      const steps = (flow.steps || []).filter((_, index) => index !== stepIndex)
      return { ...flow, steps: steps.length ? steps : flow.steps }
    }))
  }

  function resetWorkflowFlows() {
    setWorkflowDocumentFlows(workflowDocumentFlowDefaults)
    notify('Șabloanele de workflow au fost resetate local. Apasă „Salvează fluxurile” pentru confirmare.')
  }

  async function saveWorkflowFlows() {
    try {
      const next = normalizeWorkflowDocumentFlowsClient(workflowDocumentFlows)
      const response = await api.post('/settings', {
        ...settings,
        workflow_document_flows: next,
        workflow_document_flows_updated_at: new Date().toISOString(),
      })
      setSettings({ ...(response.data.settings || settings), gps_api_key: '', gps_password: '', smtp_password: '', imap_password: '' })
      notify('Fluxurile documentelor au fost salvate.')
    } catch (err) {
      fail(err, 'Fluxurile documentelor nu au putut fi salvate.')
    }
  }

  async function testDatabaseConfig() {
    setDatabaseTesting(true)
    try {
      const response = await api.post('/system/database-config/test', databaseConfig)
      setDatabaseHealth({ ok: true, identity: response.data.identity })
      notify(response.data.message || 'Conexiunea SQL Server funcționează.')
    } catch (err) {
      fail(err, 'Conexiunea SQL Server nu a putut fi verificată.')
    } finally {
      setDatabaseTesting(false)
    }
  }

  async function saveDatabaseConfig(event) {
    event.preventDefault()
    setDatabaseSaving(true)
    try {
      const response = await api.post('/system/database-config', databaseConfig)
      setDatabaseConfig({ ...(response.data.config || databaseConfig), password: '' })
      setDatabaseHealth(response.data.health || { ok: true, identity: response.data.identity })
      notify(response.data.message || 'Configurarea SQL Server a fost salvată.')
    } catch (err) {
      fail(err, 'Configurarea SQL Server nu a putut fi salvată.')
    } finally {
      setDatabaseSaving(false)
    }
  }

  async function loadDatabaseSchema() {
    setDatabaseSchemaLoading(true)
    try {
      const response = await api.get('/system/database-schema')
      setDatabaseSchema(response.data || null)
    } catch (err) {
      fail(err, 'Schema SQL nu a putut fi verificată.')
    } finally {
      setDatabaseSchemaLoading(false)
    }
  }

  async function prepareDatabaseSchema() {
    setDatabaseSchemaLoading(true)
    try {
      const response = await api.post('/system/database-schema/prepare')
      setDatabaseSchema(response.data.status || response.data || null)
      notify(response.data.message || 'Tabelele SQL au fost pregătite.')
    } catch (err) {
      fail(err, 'Tabelele SQL nu au putut fi create.')
    } finally {
      setDatabaseSchemaLoading(false)
    }
  }

  async function syncAccountingSchema() {
    setDatabaseAccountingSyncing(true)
    try {
      const response = await api.post('/system/database-schema/sync-accounting')
      setDatabaseSchema({
        ...(response.data.status || response.data || {}),
        accountingTableCounts: response.data.tableCounts || null,
      })
      const counts = response.data.counts || {}
      const repaired = response.data.preparedSchema?.repairFiles?.length
        ? ` Schema reparată: ${response.data.preparedSchema.repairFiles.join(', ')}.`
        : ''
      const warning = response.data.preparedSchema?.warning ? ' Unele migrări generale au fost sărite; contabilitatea a continuat separat.' : ''
      notify(`Contabilitatea a fost copiată în SQL: ${counts.chart || 0} conturi, ${counts.thirdParties || 0} terți, ${counts.journals || 0} note.${repaired}${warning}`)
    } catch (err) {
      fail(err, 'Datele contabile nu au putut fi copiate în tabelele SQL.')
    } finally {
      setDatabaseAccountingSyncing(false)
    }
  }

  async function saveUser(event) {
    event.preventDefault()
    try {
      const payload = { ...userForm }
      if (editingUser && !payload.password) delete payload.password
      const response = editingUser
        ? await api.patch(`/users/${editingUser.id}`, payload)
        : await api.post('/users', payload)
      setUsers(current => editingUser
        ? current.map(item => item.id === editingUser.id ? response.data.user : item)
        : [...current, response.data.user])
      setUserModal(false)
      setEditingUser(null)
      setUserForm(emptyUserForm)
      notify(editingUser ? 'Utilizatorul a fost actualizat.' : 'Utilizatorul a fost creat.')
    } catch (err) {
      fail(err, 'Utilizatorul nu a putut fi salvat.')
    }
  }

  async function toggleUser(user) {
    try {
      const response = await api.patch(`/users/${user.id}`, { ...user, active: !(user.active !== false) })
      setUsers(current => current.map(item => item.id === user.id ? response.data.user : item))
    } catch (err) {
      fail(err, 'Utilizatorul nu a putut fi modificat.')
    }
  }

  async function resetUserPassword(event) {
    event.preventDefault()
    if (!resetUser) return
    try {
      await api.patch(`/users/${resetUser.id}/reset-password`, { password: resetPassword })
      setResetUser(null)
      setResetPassword('')
      notify('Parola a fost resetată.')
    } catch (err) {
      fail(err, 'Parola nu a putut fi resetată.')
    }
  }

  async function saveScale(event) {
    event.preventDefault()
    const scaleProductMap = scaleRows.reduce((map, row) => {
      if (row.product && row.materialId) map[row.product] = row.materialId
      return map
    }, {})
    try {
      const response = await api.post('/settings', { ...settings, scaleProductMap })
      setSettings(response.data.settings || { ...settings, scaleProductMap })
      setScaleRows(mapEntries((response.data.settings || {}).scaleProductMap || scaleProductMap))
      notify('Setările cântarului au fost salvate.')
    } catch (err) {
      fail(err, 'Setările cântarului nu au putut fi salvate.')
    }
  }

  async function testScale() {
    try {
      const response = await api.get('/scale/status')
      notify(response.data?.readable ? 'Conexiune cântar OK.' : 'Cântarul nu este conectat sau calea nu este validă.')
    } catch (err) {
      fail(err, 'Conexiunea cântarului nu a putut fi testată.')
    }
  }

  async function testGps() {
    try {
      notify('⏳ Testez conexiunea GPS...')
      const saved = await api.post('/settings', settings)
      setSettings({ ...(saved.data.settings || settings), gps_api_key: '', gps_password: '', smtp_password: '', imap_password: '' })
      const response = await api.post('/integration/gps/test')
      if (response.data?.ok) {
        const n = response.data.vehicule ?? 0
        const customProvider = (settings.gps_provider || 'urmariregps.ro') === 'altul'
        notify(n > 0
          ? `✅ Conexiune GPS funcțională — ${n} vehicule găsite.`
          : customProvider
            ? `✅ API GPS accesibil — niciun vehicul extras din răspunsul JSON/XML.`
            : `✅ Login GPS reușit — niciun vehicul returnat (verifică User ID și răspunsul brut).`
        )
      } else {
        fail({ response: { data: { error: response.data?.error } } },
          '❌ Conexiune GPS eșuată — verifică credențialele.')
      }
    } catch (err) {
      fail(err, '❌ Verifică utilizatorul, parola și conexiunea GPS.')
    }
  }

  async function testEmail() {
    try {
      await api.post('/settings/email/test', {})
      notify('✅ Email de test trimis.')
    } catch (err) {
      const data = err.response?.data || {}
      const tips = Array.isArray(data.tips) && data.tips.length
        ? `\n\nPași recomandați:\n${data.tips.map(item => `• ${item}`).join('\n')}`
        : ''
      fail({ response: { data: { error: `${data.error || '❌ Verifică serverul SMTP, utilizatorul și parola.'}${tips}` } } })
    }
  }

  async function testImap() {
    try {
      const saved = await api.post('/settings', settings)
      setSettings({ ...(saved.data.settings || settings), gps_api_key: '', gps_password: '', smtp_password: '', imap_password: '' })
      const response = await api.post('/settings/email/imap/test', {})
      notify(`✅ ${response.data?.message || 'Conexiune IMAP OK.'}`)
    } catch (err) {
      const data = err.response?.data || {}
      const tips = Array.isArray(data.tips) && data.tips.length
        ? `\n\nPași recomandați:\n${data.tips.map(item => `• ${item}`).join('\n')}`
        : ''
      fail({ response: { data: { error: `${data.error || '❌ Verifică serverul IMAP, utilizatorul și parola.'}${tips}` } } })
    }
  }

  function updateScaleRow(index, key, value) {
    setScaleRows(rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row))
  }

  async function reloadPiusi() {
    const [statusRes, mapariRes] = await Promise.allSettled([
      api.get('/integration/piusi/status?check=1'),
      api.get('/integration/piusi/mapari'),
    ])
    if (statusRes.status === 'fulfilled') {
      const status = statusRes.value.data || {}
      setPiusiStatus(status)
      setPiusiConfig({
        mdb_path: status.mdb_path || 'C:\\Piusi\\SelfService\\Data\\Self.mdb',
        sync_interval_min: status.sync_interval_min || 30,
      })
    }
    if (mapariRes.status === 'fulfilled') {
      setPiusiMapari(arrayFrom(mapariRes.value.data, ['mapari']))
      setPiusiAssets(arrayFrom(mapariRes.value.data, ['assets']))
    }
  }

  async function savePiusiConfig() {
    try {
      await api.post('/integration/piusi/config', piusiConfig)
      notify('Configurația PIUSI a fost salvată.')
      await reloadPiusi()
    } catch (err) {
      fail(err, 'Configurația PIUSI nu a putut fi salvată.')
    }
  }

  async function syncPiusiNow() {
    setPiusiSyncing(true)
    try {
      const res = await api.post('/integration/piusi/sync-now')
      notify(`PIUSI sincronizat: ${res.data?.importate || 0} alimentări importate.`)
      await reloadPiusi()
    } catch (err) {
      fail(err, 'Sincronizarea PIUSI a eșuat.')
    } finally {
      setPiusiSyncing(false)
    }
  }

  function updatePiusiMapare(index, assetId) {
    setPiusiMapari(rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, asset_id: assetId } : row))
  }

  async function savePiusiMapari() {
    try {
      await api.post('/integration/piusi/mapari', { mapari: piusiMapari })
      notify('Mapările PIUSI au fost salvate.')
      await reloadPiusi()
    } catch (err) {
      fail(err, 'Mapările PIUSI nu au putut fi salvate.')
    }
  }

  function pathStatus(key, pathValue) {
    const value = String(pathValue || '').trim()
    if (!value) return { text: '○ Neconfigurat', className: 'text-slate-500' }
    const result = integrationTests[key]
    if (!result) return { text: '○ Netestat', className: 'text-slate-500' }
    return result.ok
      ? { text: '● Conectat', className: 'text-green-700' }
      : { text: '○ Neconectat', className: 'text-rose-700' }
  }

  async function testIntegrationPath(key, pathValue) {
    const value = String(pathValue || '').trim()
    if (!value) {
      setIntegrationTests(current => ({ ...current, [key]: { ok: false, error: 'Calea nu este configurată.' } }))
      return
    }
    try {
      const response = await api.get('/integration/test', { params: { path: value } })
      setIntegrationTests(current => ({ ...current, [key]: response.data }))
      if (response.data?.ok) {
        notify(`Conexiune OK: ${response.data.type || 'cale'} ${response.data.size ? `(${response.data.size})` : ''}`)
      } else {
        fail({ response: { data: { error: response.data?.error } } }, 'Calea nu este accesibilă.')
      }
    } catch (err) {
      setIntegrationTests(current => ({ ...current, [key]: { ok: false, error: err.response?.data?.error || 'Test eșuat.' } }))
      fail(err, 'Calea nu este accesibilă.')
    }
  }

  function updateCustomIntegration(index, key, value) {
    setSettings(current => {
      const rows = Array.isArray(current.external_integrations) ? [...current.external_integrations] : []
      rows[index] = { ...(rows[index] || {}), [key]: value }
      return { ...current, external_integrations: rows }
    })
  }

  function addCustomIntegration() {
    setSettings(current => ({
      ...current,
      external_integrations: [
        ...(Array.isArray(current.external_integrations) ? current.external_integrations : []),
        { id: `custom-${Date.now()}`, name: '', type: 'MDB', path: '', sync_min: '30' }
      ]
    }))
  }

  function removeCustomIntegration(index) {
    setSettings(current => ({
      ...current,
      external_integrations: (Array.isArray(current.external_integrations) ? current.external_integrations : []).filter((_, rowIndex) => rowIndex !== index)
    }))
  }

  function updateEmailRule(index, key, value) {
    setSettings(current => {
      const rows = Array.isArray(current.email_rules) ? [...current.email_rules] : []
      rows[index] = { ...(rows[index] || {}), [key]: value }
      return { ...current, email_rules: rows }
    })
  }

  function addEmailRule() {
    setSettings(current => ({
      ...current,
      email_rules: [
        ...(Array.isArray(current.email_rules) ? current.email_rules : []),
        {
          id: `email-rule-${Date.now()}`,
          name: '',
          active: true,
          field: 'all',
          operator: 'contains',
          match: '',
          category: 'general',
          importance: '',
          status: ''
        }
      ]
    }))
  }

  function removeEmailRule(index) {
    setSettings(current => ({
      ...current,
      email_rules: (Array.isArray(current.email_rules) ? current.email_rules : []).filter((_, rowIndex) => rowIndex !== index)
    }))
  }

  function updateEmailRuleTest(ruleId, key, value) {
    setEmailRuleTests(current => ({
      ...current,
      [ruleId]: {
        from: '',
        subject: '',
        body: '',
        ...(current[ruleId] || {}),
        [key]: value,
        result: null
      }
    }))
  }

  function runEmailRuleTest(rule) {
    const ruleId = rule.id || 'email-rule-test'
    const sample = emailRuleTests[ruleId] || {}
    const matched = testEmailRuleMatch(rule, sample)
    const actions = [
      rule.category ? `categorie: ${emailRuleOptionLabel(emailRuleCategoryOptions, rule.category, rule.category)}` : '',
      rule.importance ? `importanță: ${emailRuleOptionLabel(emailRuleImportanceOptions, rule.importance, rule.importance)}` : '',
      rule.status ? `status: ${emailRuleOptionLabel(emailRuleStatusOptions, rule.status, rule.status)}` : '',
    ].filter(Boolean)
    setEmailRuleTests(current => ({
      ...current,
      [ruleId]: {
        from: '',
        subject: '',
        body: '',
        ...(current[ruleId] || {}),
        result: matched
          ? `Se potrivește. Va aplica ${actions.join(', ') || 'regula fără acțiuni configurate'}.`
          : 'Nu se potrivește pe datele de probă introduse.'
      }
    }))
  }

  async function saveExternalPaths() {
    try {
      const payload = {
        ...settings,
        scaleDbPath: settings.cantar_db_path || settings.scaleDbPath || '',
        autominderDbPath: settings.autominder_db_path || settings.autominderDbPath || '',
      }
      const response = await api.post('/settings', payload)
      setSettings({ ...(response.data.settings || payload), gps_api_key: '', gps_password: '', smtp_password: '', imap_password: '' })
      await api.post('/integration/piusi/config', {
        mdb_path: payload.piusi_mdb_path || '',
        sync_interval_min: payload.piusi_sync_min || 30,
      }).catch(() => null)
      notify('Căile integrărilor au fost salvate.')
      await reloadPiusi()
    } catch (err) {
      fail(err, 'Căile integrărilor nu au putut fi salvate.')
    }
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Setări"
        subtitle="Configurare sistem, licență, aspect, AI, update, utilizatori și cântar."
        actions={[
          <DropdownMenu key="settings-actions" align="right" label="Actiuni" items={[
            { label: 'Reincarca', onClick: load },
          ]} />,
        ]}
      />

      {message && <Card className="border-primary-100 bg-primary-50 text-sm text-primary-700">{message}</Card>}
      {error && <Card className="whitespace-pre-line border-rose-200 bg-rose-50 text-sm text-rose-700">{error}</Card>}

      <SettingsSetupAssistant
        steps={onboardingSteps}
        done={onboardingDone}
        percent={onboardingPercent}
        nextStep={nextOnboardingStep}
        loading={loading}
        onOpenTab={setActiveTab}
      />

      <div className="flex flex-wrap gap-2">
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

      {activeTab === 'General' && (
        <Card title="General" loading={loading}>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={saveSettings}>
            <Input label="Nume companie" value={settings.companyName || ''} onChange={event => setSettings(s => ({ ...s, companyName: event.target.value }))} />
            <Input label="CUI" value={settings.companyCui || settings.cui || ''} onChange={event => setSettings(s => ({ ...s, companyCui: event.target.value, cui: event.target.value }))} />
            <Input label="Adresă" value={settings.address || ''} onChange={event => setSettings(s => ({ ...s, address: event.target.value }))} />
            <Input label="Telefon" value={settings.phone || ''} onChange={event => setSettings(s => ({ ...s, phone: event.target.value }))} />
            <Input label="Email" value={settings.email || ''} onChange={event => setSettings(s => ({ ...s, email: event.target.value }))} />
            <div className="md:col-span-2 rounded-2xl border border-primary-100 bg-primary-50/40 p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Profil internațional</h3>
                  <p className="mt-1 text-xs text-slate-600">
                    Baza pentru limbă, monedă, fus orar și reguli locale. România este activă; celelalte țări sunt pregătite pentru adaptări legislative viitoare.
                  </p>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                  selectedCountryProfile?.legislation_status === 'activ'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {selectedCountryProfile?.legislation_status === 'activ' ? 'Legislație activă' : 'Profil pregătit'}
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <Select label="Țară / jurisdicție" value={settings.country || 'RO'} onChange={event => applyCountryProfile(event.target.value)}>
                  {countryProfiles.map(profile => (
                    <option key={profile.code} value={profile.code}>{profile.label}</option>
                  ))}
                </Select>
                <Select label="Limbă interfață" value={settings.locale || settings.language || 'ro-RO'} onChange={event => setSettings(s => ({ ...s, locale: event.target.value, language: event.target.value }))}>
                  {availableLocales.map(locale => <option key={locale} value={locale}>{locale}</option>)}
                </Select>
                <Select label="Monedă" value={settings.currency || 'RON'} onChange={event => setSettings(s => ({ ...s, currency: event.target.value }))}>
                  {availableCurrencies.map(currency => <option key={currency} value={currency}>{currency}</option>)}
                </Select>
                <Select label="Fus orar" value={settings.timezone || 'Europe/Bucharest'} onChange={event => setSettings(s => ({ ...s, timezone: event.target.value }))}>
                  {availableTimezones.map(timezone => <option key={timezone} value={timezone}>{timezone}</option>)}
                </Select>
              </div>
              <div className="mt-3 grid gap-2 rounded-xl border border-white/70 bg-white/70 p-3 text-xs text-slate-600 md:grid-cols-3">
                <div>
                  <span className="block font-semibold text-slate-800">HR</span>
                  Profil: {selectedCountryRules?.rules?.modules?.hr?.payroll_profile || 'generic'}
                </div>
                <div>
                  <span className="block font-semibold text-slate-800">Fiscal / contabil</span>
                  Profil: {selectedCountryRules?.rules?.modules?.accounting?.fiscal_profile || 'generic'}
                </div>
                <div>
                  <span className="block font-semibold text-slate-800">Documente</span>
                  Limbă implicită: {selectedCountryRules?.rules?.modules?.documents?.default_language || 'generic'}
                </div>
                {selectedCountryRules?.rules?.warnings?.length > 0 && (
                  <p className="md:col-span-3 rounded-lg bg-amber-50 px-3 py-2 text-amber-700">
                    {selectedCountryRules.rules.warnings[0]}
                  </p>
                )}
              </div>
            </div>
            <Input label="Punct de lucru / locație" value={settings.stationName || ''} onChange={event => setSettings(s => ({ ...s, stationName: event.target.value }))} />
            <Input label="GPS lat meteo" value={settings.weatherLat || ''} onChange={event => setSettings(s => ({ ...s, weatherLat: event.target.value }))} />
            <Input label="GPS lng meteo" value={settings.weatherLng || ''} onChange={event => setSettings(s => ({ ...s, weatherLng: event.target.value }))} />
            <Input label="Port server" type="number" value={settings.serverPort || ''} onChange={event => setSettings(s => ({ ...s, serverPort: event.target.value }))} />
            <div className="md:col-span-2 mt-2 border-t border-slate-200 pt-4">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold text-slate-900">Integrare GPS</h3>
                {(settings.gps_provider || 'urmariregps.ro') === 'altul' ? settings.gps_api_url : settings.gps_username
                  ? <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      ✓ Configurat ({settings.gps_username.slice(0, 3)}***)
                    </span>
                  : <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      ⚠ Neconfigurat
                    </span>
                }
              </div>
            </div>
            <Select label="Furnizor GPS" value={settings.gps_provider || 'urmariregps.ro'} onChange={event => setSettings(s => ({ ...s, gps_provider: event.target.value }))}>
              <option value="urmariregps.ro">urmariregps.ro</option>
              <option value="altul">Alt furnizor cu API JSON/XML</option>
            </Select>
            {(settings.gps_provider || 'urmariregps.ro') === 'urmariregps.ro' ? <>
              <Input label="User ID" value={settings.gps_user_id || '120'} onChange={event => setSettings(s => ({ ...s, gps_user_id: event.target.value }))} />
              <Input
                label="Utilizator urmariregps.ro"
                value={settings.gps_username || ''}
                onChange={event => setSettings(s => ({ ...s, gps_username: event.target.value }))}
                placeholder="email sau username"
              />
              <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Parolă urmariregps.ro
                {settings.gps_password_set && !settings.gps_password && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    ✓ Salvată
                  </span>
                )}
              </label>
              <input
                type="password"
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                value={settings.gps_password || ''}
                onChange={event => setSettings(s => ({ ...s, gps_password: event.target.value }))}
                placeholder={settings.gps_password_set && !settings.gps_password
                  ? '●●●●●●●● (salvată — completează doar dacă vrei să o schimbi)'
                  : 'Introdu parola contului urmariregps.ro'}
                autoComplete="new-password"
              />
              {settings.gps_password_set && !settings.gps_password && (
                <p className="mt-1 text-xs text-slate-400">
                  Parola este salvată criptat. Lasă câmpul gol dacă nu vrei să o schimbi.
                </p>
              )}
              </div>
            </> : <>
              <Input label="URL API vehicule" value={settings.gps_api_url || ''} onChange={event => setSettings(s => ({ ...s, gps_api_url: event.target.value }))} placeholder="https://furnizor.ro/api/vehicles" />
              <Input label="Cheie API Bearer (opțional)" type="password" value={settings.gps_api_key || ''} onChange={event => setSettings(s => ({ ...s, gps_api_key: event.target.value }))} placeholder={settings.gps_api_key_set ? 'Salvată — completează doar pentru schimbare' : 'Token API'} />
              <p className="md:col-span-2 text-xs text-slate-500">Pentru alt furnizor, introdu URL-ul endpointului care returnează vehicule în JSON sau XML. Cheia este trimisă ca Bearer token.</p>
            </>}
            <div className="flex items-end gap-2 flex-wrap">
              <Button type="button" variant="secondary" onClick={testGps}>🔄 Testează GPS</Button>
              <Button type="button" variant="ghost" size="sm" onClick={async () => {
                try {
                  notify('⏳ Se citește răspunsul brut de la furnizorul GPS...')
                  // Încearcă toate acțiunile importante și arată primul răspuns cu date
                  const actiuni = ['data_in','pozitii_vehicule','incarca_pozitii','get_vehicles','live_map','incarca_grupuri']
                  let gasit = null
                  for (const actiune of actiuni) {
                    const r = await api.get(`/integration/gps/raw?actiune=${actiune}`)
                    const d = r.data
                    if (d.vehicule_parsate > 0) {
                      gasit = d
                      break
                    }
                    if (d.raw_length > 20 && !gasit) gasit = d // ia primul răspuns cu conținut
                  }
                  if (!gasit) {
                    notify('⚠️ Toate acțiunile returnează răspuns gol. Verificați consolă server.')
                    return
                  }
                  if (gasit.vehicule_parsate > 0) {
                    notify(`✅ GPS funcțional! Acțiune: ${gasit.actiune}, ${gasit.vehicule_parsate} vehicule`)
                  } else {
                    notify(`⚠️ Acțiune "${gasit.actiune}": ${gasit.raw_length} caractere, tip: ${gasit.tip_raspuns}, 0 vehicule parsate. Raw body nu este afișat în browser pentru protecția datelor.`)
                    if (import.meta.env.DEV) {
                      console.debug('=== GPS RAW BODY ===')
                      console.debug('Tip:', gasit.tip_raspuns)
                      console.debug('Body:', gasit.raw_body)
                      console.debug('===================')
                    }
                  }
                } catch (e) { fail(e, '❌ Raw GPS eșuat') }
              }}>📋 Raw Response GPS</Button>
            </div>
            <div className="md:col-span-2 mt-2 border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-900">Configurare SMTP</h3>
            </div>
            <Input label="Server SMTP" placeholder="smtp.office365.com" value={settings.smtp_host || ''} onChange={event => setSettings(s => ({ ...s, smtp_host: event.target.value }))} />
            <Input label="Port SMTP" type="number" value={settings.smtp_port || 587} onChange={event => setSettings(s => ({ ...s, smtp_port: event.target.value }))} />
            <Input label="Utilizator SMTP" value={settings.smtp_user || ''} onChange={event => setSettings(s => ({ ...s, smtp_user: event.target.value }))} />
            <div>
              <Input
                label="Parolă SMTP"
                type="password"
                value={settings.smtp_password || ''}
                onChange={event => setSettings(s => ({ ...s, smtp_password: event.target.value }))}
                placeholder={settings.smtp_password_set && !settings.smtp_password ? 'Salvată — completează doar dacă o schimbi' : ''}
              />
              {settings.smtp_password_set && !settings.smtp_password && (
                <p className="mt-1 text-xs text-slate-500">Parola SMTP este salvată criptat și nu este afișată.</p>
              )}
            </div>
            <Input label="Nume expeditor" value={settings.smtp_name || ''} onChange={event => setSettings(s => ({ ...s, smtp_name: event.target.value }))} />
            <div className="flex items-end"><Button type="button" variant="secondary" onClick={testEmail}>Testează configurarea</Button></div>
            <div className="md:col-span-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="font-semibold">Ghid rapid SMTP</div>
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                <div><strong>Gmail:</strong> smtp.gmail.com, port 587. Necesită 2-Step Verification și App Password.</div>
                <div><strong>Microsoft 365:</strong> smtp.office365.com, port 587. SMTP AUTH trebuie permis pe căsuță.</div>
                <div><strong>SMTP2GO:</strong> mail.smtp2go.com, port 2525 sau 587. Folosește credențialele generate în cont.</div>
              </div>
            </div>
            <div className="md:col-span-2 mt-2 border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-900">Primire email / IMAP</h3>
              <p className="mt-0.5 text-xs text-slate-500">SMTP trimite emailuri. IMAP citește Inboxul real și îl aduce în Mesaje → Email.</p>
            </div>
            <Input label="Server IMAP" placeholder="imap.gmail.com" value={settings.imap_host || ''} onChange={event => setSettings(s => ({ ...s, imap_host: event.target.value }))} />
            <Input label="Port IMAP" type="number" value={settings.imap_port || 993} onChange={event => setSettings(s => ({ ...s, imap_port: event.target.value }))} />
            <Input label="Utilizator IMAP" placeholder={settings.smtp_user || 'email@firma.ro'} value={settings.imap_user || ''} onChange={event => setSettings(s => ({ ...s, imap_user: event.target.value }))} />
            <div>
              <Input
                label="Parolă IMAP"
                type="password"
                value={settings.imap_password || ''}
                onChange={event => setSettings(s => ({ ...s, imap_password: event.target.value }))}
                placeholder={settings.imap_password_set && !settings.imap_password ? 'Salvată — completează doar dacă o schimbi' : 'poate fi aceeași App Password ca SMTP'}
              />
              {settings.imap_password_set && !settings.imap_password && (
                <p className="mt-1 text-xs text-slate-500">Parola IMAP este salvată criptat și nu este afișată.</p>
              )}
            </div>
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={settings.imap_secure !== false}
                onChange={event => setSettings(s => ({ ...s, imap_secure: event.target.checked }))}
              />
              SSL/TLS IMAP
            </label>
            <div className="flex items-end"><Button type="button" variant="secondary" onClick={testImap}>Testează IMAP</Button></div>
            <div className="md:col-span-2 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              <div className="font-semibold">Ghid rapid IMAP</div>
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                <div><strong>Gmail:</strong> imap.gmail.com, port 993, SSL/TLS. Activează IMAP și folosește App Password.</div>
                <div><strong>Microsoft 365:</strong> outlook.office365.com, port 993. Unele tenanturi cer OAuth, nu parolă simplă.</div>
                <div><strong>Domeniu propriu:</strong> de obicei imap.domeniu.ro, port 993. Dacă SMTP2GO trimite email, IMAP trebuie să fie căsuța reală.</div>
              </div>
            </div>
            <div className="md:col-span-2 mt-2 border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-900">Sincronizare automată Inbox</h3>
              <p className="mt-0.5 text-xs text-slate-500">Serverul poate verifica periodic Inboxul IMAP și importa emailurile noi fără apăsarea butonului manual din Mesaje.</p>
            </div>
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={settings.email_sync_enabled === true}
                onChange={event => setSettings(s => ({ ...s, email_sync_enabled: event.target.checked }))}
              />
              Activează sincronizarea automată
            </label>
            <Input
              label="Interval sincronizare (minute)"
              type="number"
              min={5}
              max={1440}
              value={settings.email_sync_interval_min || 15}
              onChange={event => setSettings(s => ({ ...s, email_sync_interval_min: event.target.value }))}
            />
            <Input
              label="Emailuri verificate per rulare"
              type="number"
              min={1}
              max={50}
              value={settings.email_sync_limit || 20}
              onChange={event => setSettings(s => ({ ...s, email_sync_limit: event.target.value }))}
            />
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Recomandat: 15 minute și 20 emailuri/rulare. Pentru Gmail/Microsoft 365, păstrează intervale rezonabile ca să nu declanșezi limitări ale providerului.
            </div>
            <div className={`md:col-span-2 rounded-2xl border p-4 text-sm ${emailSyncStatus.last_auto_sync_error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-100 bg-emerald-50 text-emerald-800'}`}>
              <div className="font-semibold">Status sincronizare Inbox</div>
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                <div>
                  <span className="text-xs uppercase opacity-70">Mod</span>
                  <div>{emailSyncStatus.enabled ? `Automat la ${emailSyncStatus.interval_min || 15} min` : 'Manual / dezactivat automat'}</div>
                </div>
                <div>
                  <span className="text-xs uppercase opacity-70">Ultima automată</span>
                  <div>{emailSyncStatus.last_auto_sync_at ? `${formatDate(emailSyncStatus.last_auto_sync_at)} · ${emailSyncStatus.last_auto_sync_imported || 0}/${emailSyncStatus.last_auto_sync_scanned || 0}` : 'Nicio rulare'}</div>
                </div>
                <div>
                  <span className="text-xs uppercase opacity-70">Următoarea</span>
                  <div>{emailSyncStatus.next_auto_sync_at ? formatDate(emailSyncStatus.next_auto_sync_at) : '-'}</div>
                </div>
              </div>
            {emailSyncStatus.last_auto_sync_error ? (
              <div className="mt-2 whitespace-pre-wrap text-xs">Ultima eroare autosync: {emailSyncStatus.last_auto_sync_error}</div>
            ) : null}
            </div>
            <div className="md:col-span-2 mt-2 border-t border-slate-200 pt-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Reguli automate email</h3>
                  <p className="mt-0.5 text-xs text-slate-500">Se aplică la emailurile importate prin IMAP înainte de salvare: categorie, importanță sau status.</p>
                </div>
                <Button type="button" variant="secondary" onClick={addEmailRule}>➕ Regulă email</Button>
              </div>
            </div>
            <div className="md:col-span-2 space-y-3">
              {(Array.isArray(settings.email_rules) ? settings.email_rules : []).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                  Nu există reguli configurate. Exemplu util: expeditorul conține „anaf” → categoria Contabilitate, importanță Ridicată.
                </div>
              ) : (Array.isArray(settings.email_rules) ? settings.email_rules : []).map((rule, index) => (
                <div key={rule.id || index} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={rule.active !== false}
                        onChange={event => updateEmailRule(index, 'active', event.target.checked)}
                      />
                      Regulă activă
                    </label>
                    <Button type="button" variant="ghost" onClick={() => removeEmailRule(index)}>Șterge</Button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-4">
                    <Input
                      label="Nume regulă"
                      value={rule.name || ''}
                      onChange={event => updateEmailRule(index, 'name', event.target.value)}
                      placeholder="ex. Facturi furnizori"
                    />
                    <Select
                      label="Caută în"
                      value={rule.field || 'all'}
                      onChange={event => updateEmailRule(index, 'field', event.target.value)}
                      options={emailRuleFieldOptions}
                    />
                    <Select
                      label="Condiție"
                      value={rule.operator || 'contains'}
                      onChange={event => updateEmailRule(index, 'operator', event.target.value)}
                      options={emailRuleOperatorOptions}
                    />
                    <Input
                      label="Text căutat"
                      value={rule.match || ''}
                      onChange={event => updateEmailRule(index, 'match', event.target.value)}
                      placeholder="ex. factura / anaf / contract"
                    />
                    <Select
                      label="Categorie"
                      value={rule.category || ''}
                      onChange={event => updateEmailRule(index, 'category', event.target.value)}
                      options={emailRuleCategoryOptions}
                    />
                    <Select
                      label="Importanță"
                      value={rule.importance || ''}
                      onChange={event => updateEmailRule(index, 'importance', event.target.value)}
                      options={emailRuleImportanceOptions}
                    />
                    <Select
                      label="Status"
                      value={rule.status || ''}
                      onChange={event => updateEmailRule(index, 'status', event.target.value)}
                      options={emailRuleStatusOptions}
                    />
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      Regula se aplică doar emailurilor noi importate după salvare.
                    </div>
                  </div>
                  <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50 p-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-700">Testează regula</div>
                    <div className="grid gap-3 md:grid-cols-4">
                      <Input
                        label="Expeditor probă"
                        value={(emailRuleTests[rule.id || index]?.from) || ''}
                        onChange={event => updateEmailRuleTest(rule.id || String(index), 'from', event.target.value)}
                        placeholder="ex. office@furnizor.ro"
                      />
                      <Input
                        label="Subiect probă"
                        value={(emailRuleTests[rule.id || index]?.subject) || ''}
                        onChange={event => updateEmailRuleTest(rule.id || String(index), 'subject', event.target.value)}
                        placeholder="ex. Factura iulie"
                      />
                      <Input
                        label="Conținut probă"
                        value={(emailRuleTests[rule.id || index]?.body) || ''}
                        onChange={event => updateEmailRuleTest(rule.id || String(index), 'body', event.target.value)}
                        placeholder="text scurt din email"
                      />
                      <div className="flex items-end">
                        <Button type="button" variant="secondary" onClick={() => runEmailRuleTest(rule)}>Testează regula</Button>
                      </div>
                    </div>
                    {emailRuleTests[rule.id || index]?.result ? (
                      <div className={`mt-2 rounded-lg px-3 py-2 text-xs ${String(emailRuleTests[rule.id || index].result).startsWith('Se potrivește') ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                        {emailRuleTests[rule.id || index].result}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            <div className="md:col-span-2 mt-2 border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-900">Configurare TVA</h3>
              <p className="mt-0.5 text-xs text-slate-500">Cotele TVA sunt folosite implicit în facturare (ANAF / e-Factură). Pot fi suprascrise per linie de factură.</p>
            </div>
            <Input
              label="TVA standard (%)"
              type="number"
              value={settings.tva_implicit ?? settings.cota_tva_standard ?? 21}
              onChange={e => setSettings(s => ({ ...s, tva_implicit: Number(e.target.value), cota_tva_standard: Number(e.target.value) }))}
              min={0} max={100}
            />
            <Input
              label="TVA redus (%)"
              type="number"
              value={settings.cota_tva_redusa ?? 9}
              onChange={e => setSettings(s => ({ ...s, cota_tva_redusa: Number(e.target.value) }))}
              min={0} max={100}
            />
            <Input
              label="TVA super-redus (%)"
              type="number"
              value={settings.cota_tva_super_redusa ?? 5}
              onChange={e => setSettings(s => ({ ...s, cota_tva_super_redusa: Number(e.target.value) }))}
              min={0} max={100}
            />
            <div className="md:col-span-2"><Button type="submit">Salvează</Button></div>
          </form>
        </Card>
      )}

      {activeTab === 'Bază date' && (
        <Card
          title="Bază date SQL Server"
          subtitle="Configurare conexiune MSSQL folosită de aplicația principală. Parola salvată nu este afișată."
        >
          <form className="grid gap-4 md:grid-cols-2" onSubmit={saveDatabaseConfig}>
            <Input
              label="Server SQL"
              value={databaseConfig.server || ''}
              onChange={event => setDatabaseConfig(current => ({ ...current, server: event.target.value }))}
              placeholder=".\\SQLEXPRESS"
            />
            <Input
              label="Bază de date"
              value={databaseConfig.database || ''}
              onChange={event => setDatabaseConfig(current => ({ ...current, database: event.target.value }))}
              placeholder="INFRAFLOW"
            />
            <Select
              label="Autentificare"
              value={databaseConfig.authMode || 'windows'}
              onChange={event => setDatabaseConfig(current => ({ ...current, authMode: event.target.value }))}
            >
              <option value="windows">Windows Integrated</option>
              <option value="sql">SQL user/parolă</option>
            </Select>
            <Select
              label="Mod MSSQL"
              value={databaseConfig.relational ? '1' : '0'}
              onChange={event => setDatabaseConfig(current => ({ ...current, relational: event.target.value === '1' }))}
            >
              <option value="0">app_state JSON în MSSQL</option>
              <option value="1">Tabele relaționale + app_state</option>
            </Select>
            {(databaseConfig.authMode || 'windows') === 'sql' ? (
              <>
                <Input
                  label="Utilizator SQL"
                  value={databaseConfig.user || ''}
                  onChange={event => setDatabaseConfig(current => ({ ...current, user: event.target.value }))}
                  placeholder="infraflow"
                />
                <Input
                  label={databaseConfig.passwordSet ? 'Parolă SQL (salvată)' : 'Parolă SQL'}
                  type="password"
                  value={databaseConfig.password || ''}
                  onChange={event => setDatabaseConfig(current => ({ ...current, password: event.target.value }))}
                  placeholder={databaseConfig.passwordSet ? 'Salvată - completează doar dacă o schimbi' : 'Parola userului SQL'}
                  autoComplete="new-password"
                />
              </>
            ) : (
              <div className="md:col-span-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                Serverul va folosi contul Windows sub care rulează serviciul InfraFlow.
              </div>
            )}
            <div className="md:col-span-2 grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="font-medium text-slate-800">Status conexiune</div>
              <div className={databaseHealth?.ok ? 'text-emerald-700' : 'text-rose-700'}>
                {databaseHealth?.ok
                  ? (databaseHealth?.quick ? 'Server activ — SQL neverificat rapid' : 'Conexiune OK')
                  : (databaseHealth?.error || 'Netrimis / neverificat')}
              </div>
              {databaseHealth?.quick ? (
                <div className="text-xs text-slate-500">
                  Folosește „Testează conexiunea” pentru verificarea reală SQL Server.
                </div>
              ) : null}
              {databaseConfig.runtimeFile ? (
                <div className="text-xs text-slate-500">Fișier runtime: {databaseConfig.runtimeFile}</div>
              ) : null}
            </div>
            <div className="md:col-span-2 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" loading={databaseTesting} onClick={testDatabaseConfig}>Testează conexiunea</Button>
              <Button type="submit" loading={databaseSaving}>Salvează SQL</Button>
            </div>
          </form>
          <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900">Schema SQL relațională</h3>
                <p className="mt-1 text-sm text-slate-600">
                  În modul curent aplicația folosește <strong>dbo.app_state</strong> ca sursă principală de date.
                  Tabelele relaționale pot fi create aici pentru migrarea controlată pe module.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" loading={databaseSchemaLoading} onClick={loadDatabaseSchema}>Verifică schema</Button>
                <Button type="button" loading={databaseSchemaLoading} onClick={prepareDatabaseSchema}>Creează/actualizează tabele</Button>
                <Button type="button" variant="secondary" loading={databaseAccountingSyncing} onClick={syncAccountingSchema}>Verifică și migrează contabilitatea</Button>
              </div>
            </div>
            <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="text-slate-500">Tabele găsite</div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">{databaseSchema?.tableCount ?? '-'}</div>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="text-slate-500">Mod relațional</div>
                <div className={databaseSchema?.enabled ? 'mt-1 font-semibold text-emerald-700' : 'mt-1 font-semibold text-amber-700'}>
                  {databaseSchema?.enabled ? 'activ la runtime' : 'pregătire / app_state principal'}
                </div>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="text-slate-500">Migrare date app_state</div>
                <div className={databaseSchema?.accountingSyncAvailable ? 'mt-1 font-semibold text-emerald-700' : 'mt-1 font-semibold text-amber-700'}>
                {databaseSchema?.accountingSyncAvailable ? 'contabilitate disponibilă' : 'se repară automat la migrare'}
                </div>
              </div>
            </div>
            {!databaseSchema ? (
              <div className="mt-3 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                Verificarea schemei SQL nu se mai rulează automat la deschiderea paginii, ca să păstrăm Setările rapide. Apasă „Verifică schema” când ai nevoie de diagnosticul complet.
              </div>
            ) : null}
            {databaseSchema?.lastAccountingSync ? (
              <div className="mt-3 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                Ultima migrare contabilitate: {formatDate(databaseSchema.lastAccountingSync.synced_at)} ·
                {` ${databaseSchema.lastAccountingSync.chart || 0} conturi, ${databaseSchema.lastAccountingSync.thirdParties || 0} terți, ${databaseSchema.lastAccountingSync.invoicesIn || 0} facturi intrare, ${databaseSchema.lastAccountingSync.invoicesOut || 0} facturi ieșire, ${databaseSchema.lastAccountingSync.journals || 0} note.`}
              </div>
            ) : null}
            {databaseSchema?.accountingTableCounts ? (
              <div className="mt-3 rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-700">
                SQL contabil acum: {databaseSchema.accountingTableCounts.chart || 0} conturi,
                {` ${databaseSchema.accountingTableCounts.thirdParties || 0} terți, ${databaseSchema.accountingTableCounts.invoicesIn || 0} facturi intrare, ${databaseSchema.accountingTableCounts.invoiceInLines || 0} linii intrare, ${databaseSchema.accountingTableCounts.invoicesOut || 0} facturi ieșire, ${databaseSchema.accountingTableCounts.invoiceOutLines || 0} linii ieșire, ${databaseSchema.accountingTableCounts.journals || 0} note.`}
              </div>
            ) : null}
            {databaseSchema?.error ? (
              <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{databaseSchema.error}</div>
            ) : null}
            {Array.isArray(databaseSchema?.missingCoreTables) && databaseSchema.missingCoreTables.length ? (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Lipsesc încă: {databaseSchema.missingCoreTables.join(', ')}
              </div>
            ) : databaseSchema ? (
              <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                Schema de bază este prezentă în SQL Server.
              </div>
            ) : null}
          </div>
        </Card>
      )}

      {activeTab === 'Licență' && (
        <Card title="Licență" loading={loading}>
          {license?.demo ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
              <h2 className="text-xl font-semibold">MOD DEMO — Module limitate</h2>
              <p className="mt-2 text-sm">Contact: contact@infraflow.ro pentru licență completă.</p>
            </div>
          ) : null}
          <div className="mt-4 rounded-lg border border-slate-200 p-4">
            <h2 className="text-xl font-semibold text-slate-900">INFRAFLOW {license?.pachet || '-'}</h2>
            <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
              <div>ID licență: <strong>{license?.licenseId || '-'}</strong></div>
              <div>Client: <strong>{license?.client?.nume || '-'}</strong></div>
              <div>Valabil până la: <strong>{formatDate(license?.valabilitate?.expira_la)}</strong></div>
              <div>Zile rămase: <strong>{licenseDays ?? license?.zile_pana_expirare ?? '-'}</strong></div>
              <div>Utilizatori: <strong>{users.length}/{userLimit || '-'}</strong></div>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {allModules.map(mod => (
              <div key={mod} className="flex items-center gap-2 rounded border border-slate-200 p-2 text-sm">
                <span>{activeModules.has(mod) ? '✅' : '❌'}</span>
                <span>{mod.replaceAll('_', ' ')}</span>
              </div>
            ))}
          </div>
          <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white">
            <Upload size={16} /> Importă licență .iflic
            <input className="hidden" type="file" accept=".iflic" onChange={importLicense} />
          </label>
        </Card>
      )}

      {activeTab === 'Aspect' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
          <Card title="Interfață" subtitle="Preferințe locale pentru acest dispozitiv.">
            <form className="grid gap-3" onSubmit={saveAppearance}>
              <Select label="Temă" value={appearance.theme} onChange={event => setAppearance(current => ({ ...current, theme: event.target.value }))} options={[
                { value: 'light', label: 'Luminos' },
                { value: 'dark', label: 'Întunecat' },
              ]} />
              <Select label="Densitate" value={appearance.density} onChange={event => setAppearance(current => ({ ...current, density: event.target.value }))} options={[
                { value: 'compact', label: 'Compact' },
                { value: 'normal', label: 'Normal' },
                { value: 'comfortable', label: 'Confortabil' },
              ]} />
              <div className="grid gap-3 md:grid-cols-2">
                <Select label="Colțuri UI" value={appearance.radius} onChange={event => setAppearance(current => ({ ...current, radius: event.target.value }))} options={[
                  { value: 'sharp', label: 'Drepte' },
                  { value: 'standard', label: 'Standard' },
                  { value: 'soft', label: 'Mai rotunjite' },
                ]} />
                <Select label="Contrast" value={appearance.contrast} onChange={event => setAppearance(current => ({ ...current, contrast: event.target.value }))} options={[
                  { value: 'normal', label: 'Normal' },
                  { value: 'high', label: 'Ridicat' },
                ]} />
              </div>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Mărime font
                <input
                  className="accent-primary-600"
                  type="range"
                  min="0.9"
                  max="1.12"
                  step="0.02"
                  value={appearance.fontScale}
                  onChange={event => setAppearance(current => ({ ...current, fontScale: Number(event.target.value) }))}
                />
                <span className="text-xs font-normal text-slate-500">{Math.round(appearance.fontScale * 100)}%</span>
              </label>
              <div className="rounded-[var(--radius-panel)] border border-slate-200 bg-white p-3">
                <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Previzualizare UI</div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button">Acțiune</Button>
                  <Button type="button" variant="secondary">Secundar</Button>
                  <Button type="button" variant="ghost">Text</Button>
                  <Badge tone="success">validat</Badge>
                </div>
                <div className="mt-3 overflow-hidden rounded-[var(--radius-control)] border border-slate-200">
                  <div className="grid grid-cols-[1fr_6rem_5rem] bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase text-slate-500">
                    <span>Document</span>
                    <span>Total</span>
                    <span>Status</span>
                  </div>
                  <div className="grid grid-cols-[1fr_6rem_5rem] items-center px-3 py-2 text-sm">
                    <span className="font-medium text-slate-900">Factură servicii</span>
                    <span>1.240 RON</span>
                    <Badge size="sm" tone="warning">draft</Badge>
                  </div>
                </div>
              </div>
              <Button type="submit">Salvează interfața</Button>
            </form>
          </Card>
          <Card title="Branding">
            <form className="grid gap-3" onSubmit={saveBranding}>
              <Input label="Upload logo (PNG/SVG max 2MB)" type="file" accept="image/png,image/svg+xml" onChange={uploadLogo} />
              <Input label="Culoare principală" type="color" value={branding.primaryColor} onChange={event => setBranding(b => ({ ...b, primaryColor: event.target.value }))} />
              <Input label="Culoare secundară" type="color" value={branding.secondaryColor} onChange={event => setBranding(b => ({ ...b, secondaryColor: event.target.value }))} />
              {[0, 1, 2, 3].map(index => (
                <Input key={index} label={`Header documente linia ${index + 1}`} value={branding.docHeader[index] || ''} onChange={event => {
                  const docHeader = [...branding.docHeader]
                  docHeader[index] = event.target.value
                  setBranding(b => ({ ...b, docHeader }))
                }} />
              ))}
              <div className="grid gap-3 md:grid-cols-3">
                <Input label="Footer stânga" value={branding.docFooter.left} onChange={event => setBranding(b => ({ ...b, docFooter: { ...b.docFooter, left: event.target.value } }))} />
                <Input label="Footer centru" value={branding.docFooter.center} onChange={event => setBranding(b => ({ ...b, docFooter: { ...b.docFooter, center: event.target.value } }))} />
                <Input label="Footer dreapta" value={branding.docFooter.right} onChange={event => setBranding(b => ({ ...b, docFooter: { ...b.docFooter, right: event.target.value } }))} />
              </div>
              <Button type="submit">Salvează aspect</Button>
            </form>
          </Card>
          <Card title="Previzualizare document">
            <div className="rounded-lg border border-slate-200 p-4">
              {branding.logo ? <img src={branding.logo} alt="Logo" className="mb-3 h-14 object-contain" /> : null}
              <div style={{ color: branding.primaryColor }} className="font-semibold">InfraFlow Document</div>
              {branding.docHeader.map((line, index) => <p key={index} className="text-sm text-slate-600">{line || `Header linia ${index + 1}`}</p>)}
              <div className="my-5 rounded border border-dashed border-slate-300 p-4 text-sm text-slate-500">Conținut document...</div>
              <div className="grid grid-cols-3 text-xs text-slate-500">
                <span>{branding.docFooter.left || 'Footer stânga'}</span>
                <span className="text-center">{branding.docFooter.center || 'Footer centru'}</span>
                <span className="text-right">{branding.docFooter.right || 'Footer dreapta'}</span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'AI Assistant' && (
        <Card title="AI Assistant" loading={loading}>
          {aiStatus?.enabled ? (
            <div className="grid gap-4">
              <div className="rounded-lg border border-primary-100 bg-primary-50 p-4 text-primary-800">
                <div className="text-lg font-semibold">Status: Activ ✅</div>
                <div className="mt-2 grid gap-1 text-sm md:grid-cols-2">
                  <span>Model: {aiStatus.model || 'claude-haiku-4-5'}</span>
                  <span>Buget lunar: {formatMoney(aiStatus.monthly_budget || 0)}</span>
                  <span>Cost luna aceasta: {formatMoney(aiStatus.cost_luna || aiStatus.monthly_cost || 0)}</span>
                  <span>Limită utilizator: {aiStatus.limit_per_user || '-'}/zi</span>
                </div>
              </div>
              <Button variant="danger" onClick={() => toggleAi(false)}>Dezactivează</Button>
            </div>
          ) : (
            <div className="grid gap-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <div className="font-semibold">Activare AI Assistant</div>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                  <li>Obține cheie API de la anthropic.com</li>
                  <li>Introdu cheia mai jos</li>
                  <li>Apasă Activează</li>
                </ol>
              </div>
              <Input label="Cheie API" type="password" placeholder="sk-ant-..." value={aiKey} onChange={event => setAiKey(event.target.value)} />
              <div className="grid gap-3 md:grid-cols-3">
                <Input label="Model" value={aiForm.model_default} onChange={event => setAiForm(f => ({ ...f, model_default: event.target.value }))} />
                <Input label="Buget lunar RON" type="number" value={aiForm.monthly_budget} onChange={event => setAiForm(f => ({ ...f, monthly_budget: Number(event.target.value || 0) }))} />
                <Input label="Limită/user/zi" type="number" value={aiForm.limit_per_user} onChange={event => setAiForm(f => ({ ...f, limit_per_user: Number(event.target.value || 0) }))} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={testAiConnection}>Testează conexiunea</Button>
                <Button onClick={activateAi}>Activează</Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {activeTab === 'Actualizări' && (
        <div className="grid gap-4">
          <Card title="Versiune curentă">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xl font-semibold text-slate-900">InfraFlow v{updateInfo?.versiune_curenta || '2.0.9'}</div>
                <div className="text-sm text-slate-500">Build: {new Date().toLocaleDateString('ro-RO')}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={refreshUpdateStatus}>🔎 Verifică server după update</Button>
                <Button variant="secondary" onClick={openChangelog}>📋 Vezi CHANGELOG</Button>
              </div>
            </div>
          </Card>

          <Card title="Status update / restart" subtitle="Confirmă dacă serverul a revenit după aplicarea ultimului pachet.">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs uppercase text-slate-500">Versiune runtime</div>
                <div className="mt-1 font-semibold text-slate-900">{updateStatus?.version || updateInfo?.versiune_curenta || '-'}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs uppercase text-slate-500">Ultimul update aplicat</div>
                <div className="mt-1 font-semibold text-slate-900">{updateStatus?.last_update?.version || '-'}</div>
                <div className="text-xs text-slate-500">{updateStatus?.last_update?.applied_at ? new Date(updateStatus.last_update.applied_at).toLocaleString('ro-RO') : ''}</div>
              </div>
              <div className={`rounded-lg border p-3 ${updateStatus?.restart?.status === 'ok' ? 'border-emerald-200 bg-emerald-50' : updateStatus?.restart?.status === 'warning' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
                <div className="text-xs uppercase text-slate-500">Restart</div>
                <div className="mt-1 font-semibold text-slate-900">{updateStatus?.restart?.status_label || 'Neverificat'}</div>
                <div className="text-xs text-slate-500">{updateStatus?.restart?.updated_at ? new Date(updateStatus.restart.updated_at).toLocaleString('ro-RO') : 'Fără log de restart.'}</div>
              </div>
            </div>
            {updateStatus?.restart?.lines?.length ? (
              <details className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-700">Vezi ultimele linii din restart-last.log</summary>
                <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-slate-600">{updateStatus.restart.lines.join('\n')}</pre>
              </details>
            ) : (
              <div className="mt-3 rounded-lg border border-dashed border-slate-200 p-3 text-sm text-slate-500">Nu există încă un log de restart disponibil.</div>
            )}
          </Card>

          <Card title="Actualizare manuală" subtitle="Încarcă pachetul primit de la furnizor: InfraFlow-update-*.zip">
            <label
              className="grid cursor-pointer place-items-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center transition hover:border-primary-300 hover:bg-primary-50"
              onDragOver={event => event.preventDefault()}
              onDrop={event => {
                event.preventDefault()
                uploadUpdatePackage(event.dataTransfer.files?.[0])
              }}
            >
              <Upload className="mb-3 text-primary-600" size={36} />
              <div className="font-semibold text-slate-900">📦 Încarcă update manual</div>
              <div className="mt-1 text-sm text-slate-600">Trage fișierul aici sau selectează InfraFlow-update-*.zip</div>
              <div className="mt-1 text-sm text-slate-500">Acceptă doar: InfraFlow-update-*.zip</div>
              <input
                className="hidden"
                type="file"
                accept=".zip"
                onChange={event => uploadUpdatePackage(event.target.files?.[0])}
              />
            </label>
            {uploadingUpdate ? <p className="mt-3 text-sm text-slate-500">Se verifică pachetul...</p> : null}
            {progress > 0 && <div className="h-2 overflow-hidden rounded bg-slate-100"><div className="h-full bg-primary-600 transition-all" style={{ width: `${progress}%` }} /></div>}
            {manualUpdate ? (
              <div className="mt-4 rounded-lg border border-primary-100 bg-primary-50 p-4">
                <h3 className="font-semibold text-primary-800">✅ Pachet verificat</h3>
                <div className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                  <div>Versiune nouă: <strong>{manualUpdate.versiune_noua}</strong></div>
                  <div>Versiune curentă: <strong>{manualUpdate.versiune_curenta}</strong></div>
                  <div>Mărime: <strong>{manualUpdate.marime_mb} MB</strong></div>
                </div>
                <div className="mt-3 whitespace-pre-wrap rounded border border-primary-100 bg-white p-3 text-sm text-slate-700">
                  <strong>Noutăți:</strong>
                  <br />
                  {manualUpdate.changelog || 'Fără changelog în pachet.'}
                </div>
                <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  ⚠️ Backup automat înainte de aplicare. Aplicația repornește în aproximativ 5 secunde.
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button onClick={() => setUpdateModal(true)}>✅ Aplică update-ul</Button>
                  <Button variant="secondary" onClick={() => setManualUpdate(null)}>❌ Anulează</Button>
                </div>
              </div>
            ) : null}
          </Card>

          <Card title="Istoric update-uri">
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr><th className="px-3 py-2">Versiune</th><th className="px-3 py-2">Dată aplicare</th><th className="px-3 py-2">Aplicat de</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {updateHistory.length ? updateHistory.map((item, index) => (
                    <tr key={`${item.version}-${item.applied_at}-${index}`}>
                      <td className="px-3 py-2 font-medium">{item.version}</td>
                      <td className="px-3 py-2">{item.applied_at ? new Date(item.applied_at).toLocaleString('ro-RO') : '-'}</td>
                      <td className="px-3 py-2">{item.applied_by || '-'}</td>
                    </tr>
                  )) : <tr><td colSpan="3" className="px-3 py-8 text-center text-sm text-slate-500">Nu există update-uri aplicate.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="Catalog CPV" subtitle="Catalog inclus în aplicație: 9.454 coduri CPV RO/EN din fișierul seed SEAP. Importul rulează automat la pornirea serverului; butonul este doar pentru resincronizare administrativă.">
            <Button variant="secondary" onClick={reimportCpvCodes}>🔄 Resincronizează catalogul CPV inclus</Button>
          </Card>
        </div>
      )}

      {activeTab === 'Utilizatori' && (
        <div className="grid gap-4">
          {/* Role distribution chips */}
          {rolesData.length > 0 && users.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {rolesData.filter(r => users.some(u => u.role === r.id)).map(r => {
                const count = users.filter(u => u.role === r.id).length
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => { setActiveTab('Roluri'); selectRole(r.id) }}
                    className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:border-primary-300 hover:bg-primary-50"
                    title={`Editează permisiunile rolului ${r.name}`}
                  >
                    <span className="font-semibold text-primary-700">{count}</span>
                    <span>{r.name}</span>
                    <span className="text-slate-400">→</span>
                  </button>
                )
              })}
            </div>
          ) : null}

        <Card
          title="Organigramă operațională"
          subtitle="Relația manager direct → subordonați alimentează delegarea task-urilor."
        >
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs uppercase text-slate-500">Utilizatori activi</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">{orgChart.activeUsers.length}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs uppercase text-slate-500">Manageri cu echipă</div>
              <div className="mt-1 text-2xl font-bold text-primary-700">{orgChart.managers.length}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs uppercase text-slate-500">Fără manager direct</div>
              <div className="mt-1 text-2xl font-bold text-amber-700">{orgChart.withoutManager.length}</div>
            </div>
          </div>

          {orgChart.managers.length ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {orgChart.managers.map(({ manager, children }) => (
                <div key={manager.id} className="rounded-lg border border-primary-100 bg-primary-50/40 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-900">{userDisplayName(manager)}</div>
                      <div className="text-xs text-slate-500">{manager.department || manager.departmentId || 'fără departament'} · {manager.role || 'rol nesetat'}</div>
                    </div>
                    <Badge tone="info">{children.length} subordonați</Badge>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {children.map(child => (
                      <div key={child.id} className="rounded-md border border-white bg-white px-3 py-2 text-sm shadow-sm">
                        <div className="font-medium text-slate-800">{userDisplayName(child)}</div>
                        <div className="text-xs text-slate-500">{child.department || child.departmentId || 'fără departament'} · {child.role || 'rol nesetat'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Nu există încă relații manager → subordonați. Editează utilizatorii și setează câmpul „Manager direct”.
            </div>
          )}

          {(orgChart.withoutManager.length || orgChart.invalidLinks.length) ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-sm font-semibold text-slate-800">Utilizatori fără manager direct</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {orgChart.withoutManager.slice(0, 12).map(user => (
                    <Badge key={user.id} tone="neutral">{userDisplayName(user)}</Badge>
                  ))}
                  {orgChart.withoutManager.length > 12 ? <Badge tone="neutral">+{orgChart.withoutManager.length - 12}</Badge> : null}
                </div>
              </div>
              {orgChart.invalidLinks.length ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                  <div className="text-sm font-semibold text-rose-800">Legături de verificat</div>
                  <div className="mt-2 text-sm text-rose-700">
                    {orgChart.invalidLinks.map(user => userDisplayName(user)).join(', ')}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>

        <Card title="Utilizatori" actions={[<Button key="new" onClick={openCreateUser}><Users size={16} /> Utilizator nou</Button>]}>
          <Table
            columns={[
              { key: 'name', label: 'Nume' },
              { key: 'username', label: 'Username' },
              { key: 'role', label: 'Rol', render: row => {
                const rd = rolesData.find(r => r.id === row.role)
                return (
                  <select
                    className="min-w-40 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                    value={row.role || ''}
                    onChange={event => changeUserRole(row.id, event.target.value)}
                  >
                    {(rolesData.length ? rolesData : [{ id: row.role, name: rd?.name || row.role }]).map(role => (
                      <option key={role.id} value={role.id}>{role.name || role.id}</option>
                    ))}
                  </select>
                )
              } },
              { key: 'department', label: 'Departament', render: row => row.department || row.departmentId || row.department_id || '-' },
              { key: 'manager', label: 'Manager', render: row => users.find(u => String(u.id) === String(row.manager_id || row.managerId))?.name || '-' },
              { key: 'kiosk_access', label: 'Acces Kiosk', render: row => (
                <span
                  className={row.active === false ? 'text-slate-400' : 'font-semibold text-green-700'}
                  title="Toți utilizatorii activi au acces automat la Kiosk"
                >
                  {row.active === false ? '—' : '✅'}
                </span>
              ) },
              { key: 'active', label: 'Activ', render: row => (
                <button
                  type="button"
                  onClick={() => toggleUser(row)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${row.active === false ? 'bg-slate-300' : 'bg-primary-600'}`}
                  aria-label={row.active === false ? 'Activează utilizator' : 'Dezactivează utilizator'}
                >
                  <span className={`inline-block h-5 w-5 rounded-full bg-white transition ${row.active === false ? 'translate-x-0.5' : 'translate-x-5'}`} />
                </button>
              ) },
              { key: 'actions', label: '', render: row => (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => openEditUser(row)}>Editează</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setResetUser(row); setResetPassword('') }}>Resetează parola</Button>
                </div>
              ) },
            ]}
            data={users}
            empty="Nu există utilizatori."
          />
        </Card>
        </div>
      )}

      {activeTab === 'Departamente' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Departamente & Servicii</h3>
            <Button onClick={openCreateDept}>
              + Departament nou
            </Button>
          </div>

          {departments.length === 0 && !deptLoading && (
            <p className="py-8 text-center text-sm text-slate-500">
              Nu există departamente. Creează primul departament.
            </p>
          )}

          {departments.map(dept => (
            <Card key={dept.id} className="p-4">
              <div className="mb-3 flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{dept.icon || '👥'}</span>
                  <div>
                    <div className="font-medium">{dept.name || dept.nume || dept.denumire}</div>
                    <div className="text-xs text-slate-500">{dept.tip || dept.type || 'departament'}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => openEditDept(dept)}>
                    Editează
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDeleteDept(dept.id)}>
                    Șterge
                  </Button>
                </div>
              </div>

              <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs font-semibold text-slate-700">
                  <span>Permisiuni active ({(dept.permissions || []).length})</span>
                  <span className="text-slate-400">Configurează</span>
                </summary>
                <div className="max-h-80 overflow-y-auto border-t border-slate-200 bg-white p-3">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {permCatalog.map(group => {
                      const activeCount = group.permissions.filter(perm => (dept.permissions || []).includes(perm.id)).length
                      return (
                        <div key={group.id} className="rounded-md border border-slate-200 p-2">
                          <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                            <span className="font-medium text-slate-600">{group.label}</span>
                            <span className="text-slate-400">{activeCount}/{group.permissions.length}</span>
                          </div>
                          <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto pr-1">
                            {group.permissions.map(perm => (
                              <button
                                key={perm.id}
                                type="button"
                                title={perm.id}
                                onClick={() => handleToggleDeptPermission(dept.id, perm.id)}
                                className={`rounded border px-2 py-0.5 text-xs transition-colors ${
                                  (dept.permissions || []).includes(perm.id)
                                    ? 'border-green-400 bg-green-100 text-green-800'
                                    : 'border-slate-300 bg-white text-slate-500 hover:border-slate-400'
                                }`}
                              >
                                {perm.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </details>
            </Card>
          ))}
        </div>
      )}

      {activeTab === 'Roluri' && (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          {/* ── Panou stânga: lista roluri ── */}
          <div className="grid gap-2 self-start">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase text-slate-500">Roluri ({rolesData.length})</div>
              <Button variant="secondary" onClick={() => { setRoleCreateForm({ name: '', description: '', permissions: [] }); setRoleCreateMsg(''); setRoleCreateModal(true) }}>
                + Rol nou
              </Button>
            </div>
            {rolesData.map(data => {
              const isSelected = selectedRoleId === data.id
              const isSistem = data.tip === 'sistem'
              const isDefault = data.tip === 'default'
              const isCustom = data.tip === 'custom'
              return (
                <div
                  key={data.id}
                  className={`group relative flex flex-col rounded-lg border px-3 py-2 text-sm transition cursor-pointer ${
                    isSelected
                      ? 'border-primary-400 bg-primary-50 ring-1 ring-primary-300'
                      : 'border-slate-200 bg-white hover:border-primary-300 hover:bg-slate-50'
                  }`}
                  onClick={() => selectRole(data.id)}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800 truncate">{data.name || data.id}</span>
                    <div className="flex shrink-0 items-center gap-1">
                      {isSistem && <Badge tone="danger">🔒 sistem</Badge>}
                      {isDefault && <Badge tone="blue">default</Badge>}
                      {isCustom && <Badge tone="warning">custom</Badge>}
                      <span className="text-xs text-slate-400">{data.permissions?.length ?? 0}p</span>
                    </div>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400 line-clamp-1">{data.description || roleDescriptions[data.id] || ''}</div>
                  {!isSistem && (
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setRoleDeleteConfirm(data) }}
                      className="absolute right-2 top-2 hidden rounded p-0.5 text-rose-400 hover:bg-rose-50 group-hover:flex"
                      title="Șterge rol"
                    >✕</button>
                  )}
                </div>
              )
            })}
          </div>

          {/* ── Panou dreapta: matrice permisiuni ── */}
          {selectedRoleId ? (
            <div className="grid gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-lg font-bold text-slate-900">
                    {rolesData.find(r => r.id === selectedRoleId)?.name || selectedRoleId}
                  </div>
                  <div className="text-sm text-slate-500">
                    {roleEditPerms.length} permisiuni selectate
                    {(() => {
                      const rd = rolesData.find(r => r.id === selectedRoleId)
                      if (!rd) return ''
                      if (rd.tip === 'sistem') return ' · rol de sistem'
                      if (rd.tip === 'custom') return ' · rol custom'
                      return rd.customized ? ' · personalizat' : ' · implicit'
                    })()}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={resetRolePermissions} disabled={roleSaving || rolesData.find(r => r.id === selectedRoleId)?.tip === 'sistem'}>
                    ↺ Resetează implicit
                  </Button>
                  <Button onClick={saveRolePermissions} disabled={roleSaving || rolesData.find(r => r.id === selectedRoleId)?.tip === 'sistem'}>
                    {roleSaving ? 'Se salvează...' : '💾 Salvează'}
                  </Button>
                </div>
              </div>

              {roleMsg ? (
                <div className={`rounded-md px-3 py-2 text-sm ${roleMsg.includes('❌') ? 'bg-rose-50 text-rose-700' : 'bg-green-50 text-green-800'}`}>
                  {roleMsg}
                </div>
              ) : null}

              {rolesData.find(r => r.id === selectedRoleId)?.tip === 'sistem' ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  ⚠️ Permisiunile rolurilor de sistem ({selectedRoleId}) nu pot fi modificate.
                </div>
              ) : (
                <div className="grid gap-3">
                  <Card>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Input
                        label="Nume rol"
                        value={roleEditMeta.name}
                        onChange={event => setRoleEditMeta(meta => ({ ...meta, name: event.target.value }))}
                      />
                      <Input
                        label="Descriere"
                        value={roleEditMeta.description}
                        onChange={event => setRoleEditMeta(meta => ({ ...meta, description: event.target.value }))}
                      />
                    </div>
                  </Card>
                  {permCatalog.map(group => {
                    const groupPerms = group.permissions.map(p => p.id)
                    const activeCount = groupPerms.filter(p => roleEditPerms.includes(p)).length
                    const allOn = activeCount === groupPerms.length
                    const someOn = activeCount > 0 && !allOn
                    return (
                      <Card key={group.id}>
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleRoleGroup(groupPerms)}
                              className={`flex h-5 w-5 items-center justify-center rounded border text-xs font-bold transition ${
                                allOn ? 'border-primary-500 bg-primary-500 text-white'
                                  : someOn ? 'border-primary-400 bg-primary-100 text-primary-700'
                                  : 'border-slate-300 bg-white text-slate-400'
                              }`}
                              title={allOn ? 'Dezactivează toate' : 'Activează toate'}
                            >
                              {allOn ? '✓' : someOn ? '–' : ''}
                            </button>
                            <span className="text-sm font-semibold text-slate-700">{group.label}</span>
                          </div>
                          <span className="text-xs text-slate-400">{activeCount} / {groupPerms.length}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {group.permissions.map(perm => {
                            const active = roleEditPerms.includes(perm.id)
                            return (
                              <button
                                key={perm.id}
                                type="button"
                                onClick={() => toggleRolePerm(perm.id)}
                                className={`rounded border px-2 py-0.5 text-xs transition ${
                                  active
                                    ? 'border-primary-400 bg-primary-100 text-primary-800'
                                    : 'border-slate-200 bg-white text-slate-500 hover:border-slate-400'
                                }`}
                                title={perm.id}
                              >
                                {active ? '✓ ' : ''}{perm.label}
                              </button>
                            )
                          })}
                        </div>
                      </Card>
                    )
                  })}
                </div>
              )}

              {/* Utilizatori cu acest rol */}
              {(() => {
                const withRole = users.filter(u => (u.roles || [u.role]).includes(selectedRoleId))
                if (!withRole.length) return null
                return (
                  <Card>
                    <div className="mb-2 text-sm font-semibold text-slate-700">👤 Utilizatori cu rolul acesta ({withRole.length})</div>
                    <div className="flex flex-wrap gap-2">
                      {withRole.map(u => (
                        <span key={u.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{u.name || u.username}</span>
                      ))}
                    </div>
                  </Card>
                )
              })()}
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-slate-200 p-12 text-center text-sm text-slate-400">
              ← Selectează un rol din stânga pentru a edita permisiunile
            </div>
          )}
        </div>
      )}

      <Modal open={roleCreateModal} title="Rol nou" onClose={() => setRoleCreateModal(false)} size="lg">
        <div className="grid gap-4">
          <p className="text-sm text-slate-500">Creează un rol custom cu permisiuni granulare.</p>
              {roleCreateMsg && (
                <div className={`rounded-md px-3 py-2 text-sm ${roleCreateMsg.startsWith('❌') ? 'bg-rose-50 text-rose-700' : 'bg-green-50 text-green-800'}`}>
                  {roleCreateMsg}
                </div>
              )}
          <Input
            label="Nume rol *"
            placeholder="ex: Șofer, Gestionar, Șef echipă"
            value={roleCreateForm.name}
            onChange={e => setRoleCreateForm(f => ({ ...f, name: e.target.value }))}
          />
          <Input
            label="Descriere"
            placeholder="Scurtă descriere a responsabilităților"
            value={roleCreateForm.description}
            onChange={e => setRoleCreateForm(f => ({ ...f, description: e.target.value }))}
          />
              <div>
                <div className="mb-2 text-sm font-medium text-slate-700">Permisiuni inițiale (opțional)</div>
            <div className="grid max-h-64 gap-2 overflow-y-auto rounded-[var(--radius-panel)] border border-slate-200 bg-slate-50/60 p-3">
                  {permCatalog.map(group => (
                    <div key={group.id}>
                      <div className="text-xs font-semibold text-slate-500 uppercase mb-1">{group.label}</div>
                      <div className="flex flex-wrap gap-1">
                        {group.permissions.map(perm => {
                          const active = roleCreateForm.permissions.includes(perm.id)
                          return (
                            <button
                              key={perm.id}
                              type="button"
                              onClick={() => setRoleCreateForm(f => ({
                                ...f,
                                permissions: active ? f.permissions.filter(p => p !== perm.id) : [...f.permissions, perm.id]
                              }))}
                              className={`rounded border px-2 py-0.5 text-xs transition ${active ? 'border-primary-400 bg-primary-100 text-primary-800' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-400'}`}
                            >
                              {active ? '✓ ' : ''}{perm.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <Button variant="secondary" onClick={() => setRoleCreateModal(false)} disabled={roleCreateSaving}>Anulează</Button>
            <Button onClick={createRole} disabled={roleCreateSaving}>{roleCreateSaving ? 'Se creează...' : 'Creează rol'}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!roleDeleteConfirm} title="Șterge rolul?" onClose={() => setRoleDeleteConfirm(null)} size="sm">
        <div className="grid gap-4">
          <div className="text-sm text-slate-600">
            Rolul <strong>{roleDeleteConfirm?.name}</strong> va fi șters definitiv.<br />
            Asigurați-vă că niciun utilizator nu îl mai folosește.
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <Button variant="secondary" onClick={() => setRoleDeleteConfirm(null)}>Anulează</Button>
            <Button variant="danger" onClick={() => roleDeleteConfirm?.id && deleteRole(roleDeleteConfirm.id)}>Șterge</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.title}
        message={confirmAction?.message}
        details={confirmAction?.details}
        confirmLabel={confirmAction?.confirmLabel}
        tone={confirmAction?.tone}
        loading={confirmLoading}
        onCancel={() => !confirmLoading && setConfirmAction(null)}
        onConfirm={runConfirmAction}
      />

      {activeTab === 'Module' && (
        <div className="grid gap-4">
          <ContextHelp
            eyebrow="Configurare comercială"
            icon="🧭"
            tone="info"
            title="Alege profilul de lucru, apoi lasă aplicația să-ți arate pașii rămași."
            description="Pentru o instalare nouă, începe cu pachetul comercial potrivit, salvează modulele și parcurge checklistul de onboarding. Clientul nu trebuie să înțeleagă arhitectura ERP; trebuie doar să vadă ce are de făcut mai departe."
            steps={onboardingSteps.slice(0, 5).map(step => ({
              key: step.key,
              label: step.label,
              hint: step.done ? 'Configurat' : step.hint,
              done: step.done,
              onClick: () => setActiveTab(step.tab),
            }))}
            tips={[
              'Modulele de bază rămân active permanent, iar modulele comerciale pot fi ascunse din interfață.',
              'Pachetele sunt doar scurtături operaționale; salvarea finală rămâne controlată de administrator.',
              'Acest ghid devine baza pentru onboarding, trial și licențiere modulară.',
            ]}
            nextAction={nextOnboardingStep ? {
              label: `Deschide: ${nextOnboardingStep.label}`,
              onClick: () => setActiveTab(nextOnboardingStep.tab),
            } : {
              label: 'Configurare completă',
              disabled: true,
            }}
          />

          <Card
            title="Onboarding organizație"
            subtitle="Transformă configurarea inițială într-un traseu clar: module, utilizatori, departamente, notificări și date companie."
          >
            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-800">Progres configurare</span>
                  <span className="text-slate-500">{onboardingDone}/{onboardingSteps.length} pași</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-3 rounded-full bg-primary-600 transition-all" style={{ width: `${onboardingPercent}%` }} />
                </div>
                <div className="mt-2 text-xs text-slate-500">{onboardingPercent}% pregătit pentru utilizare operațională.</div>
                {nextOnboardingStep ? (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <div className="font-semibold">Următorul pas recomandat: {nextOnboardingStep.label}</div>
                    <div className="mt-1">{nextOnboardingStep.hint}</div>
                    <Button className="mt-3" size="sm" variant="secondary" onClick={() => setActiveTab(nextOnboardingStep.tab)}>Deschide pasul</Button>
                  </div>
                ) : (
                  <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                    Configurarea de bază este completă. Poți trece la date reale, importuri sau instruirea utilizatorilor.
                  </div>
                )}
              </div>
              <div className="grid gap-2">
                {onboardingSteps.map(step => (
                  <button
                    key={step.key}
                    type="button"
                    onClick={() => setActiveTab(step.tab)}
                    className={`flex items-start gap-2 rounded-md border p-2 text-left text-sm transition ${step.done ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-700 hover:border-primary-200'}`}
                  >
                    <span className="mt-0.5">{step.done ? '✓' : '○'}</span>
                    <span>
                      <span className="block font-medium">{step.label}</span>
                      {!step.done ? <span className="text-xs text-slate-500">{step.hint}</span> : null}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </Card>

          <Card
            title="Fluxuri documente configurabile"
            subtitle="Definește trasee diferite de aprobare pe tip de document. Șabloanele implicite sunt punct de pornire și pot fi adaptate de fiecare organizație."
            actions={[
              <Button key="reset-workflows" variant="secondary" onClick={resetWorkflowFlows}>Resetează șabloane</Button>,
              <Button key="save-workflows" onClick={saveWorkflowFlows}>Salvează fluxurile</Button>,
            ]}
          >
            <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-2xl border border-primary-100 bg-primary-50/60 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-primary-700">Principiul comercial</div>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">Fiecare organizație își setează propriul circuit.</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Un referat, o factură, un contract sau un document HR pot avea aprobatori diferiți în funcție de tip, valoare, departament, centru de cost sau jurisdicție.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/70 bg-white/80 p-3">
                    <div className="text-xs text-slate-500">Fluxuri active</div>
                    <div className="mt-1 text-2xl font-bold text-slate-900">{workflowFlowStats.active}/{workflowFlowStats.total}</div>
                  </div>
                  <div className="rounded-xl border border-white/70 bg-white/80 p-3">
                    <div className="text-xs text-slate-500">Pași configurați</div>
                    <div className="mt-1 text-2xl font-bold text-slate-900">{workflowFlowStats.steps}</div>
                  </div>
                  <div className="rounded-xl border border-white/70 bg-white/80 p-3">
                    <div className="text-xs text-slate-500">Condiții speciale</div>
                    <div className="mt-1 text-2xl font-bold text-slate-900">{workflowFlowStats.conditioned}</div>
                  </div>
                  <div className="rounded-xl border border-white/70 bg-white/80 p-3">
                    <div className="text-xs text-slate-500">Persistență</div>
                    <div className="mt-1 text-sm font-semibold text-primary-800">salvat în profil organizație</div>
                  </div>
                </div>
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  Acest panou configurează șabloanele. Documentele deja lansate vor trebui să păstreze versiunea de flux activă la pornire când legăm engine-ul avansat.
                </div>
              </div>

              <div className="grid gap-3">
                {workflowDocumentFlows.map(flow => (
                  <div key={flow.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={flow.active ? 'success' : 'neutral'}>{flow.active ? 'activ' : 'inactiv'}</Badge>
                          <Badge tone="info">v{flow.version}</Badge>
                          <span className="text-xs uppercase tracking-wide text-slate-400">{flow.document_type}</span>
                        </div>
                        <input
                          className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900"
                          value={flow.label}
                          onChange={event => updateWorkflowFlow(flow.id, { label: event.target.value })}
                        />
                      </div>
                      <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={flow.active !== false}
                          onChange={event => updateWorkflowFlow(flow.id, { active: event.target.checked })}
                        />
                        Flux activ
                      </label>
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <Input
                        label="Tip document"
                        value={flow.document_type}
                        onChange={event => updateWorkflowFlow(flow.id, { document_type: event.target.value })}
                      />
                      <Input
                        label="Escaladare după zile"
                        type="number"
                        min="0"
                        value={flow.escalation_days}
                        onChange={event => updateWorkflowFlow(flow.id, { escalation_days: event.target.value })}
                      />
                      <Input
                        label="Versiune"
                        type="number"
                        min="1"
                        value={flow.version}
                        onChange={event => updateWorkflowFlow(flow.id, { version: event.target.value })}
                      />
                    </div>

                    <div className="mt-4 overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                            <th className="px-2 py-2">Pas</th>
                            <th className="px-2 py-2">Cine aprobă</th>
                            <th className="px-2 py-2">Referință</th>
                            <th className="px-2 py-2">Termen</th>
                            <th className="px-2 py-2">Condiție</th>
                            <th className="px-2 py-2">Oblig.</th>
                            <th className="px-2 py-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {(flow.steps || []).map((step, stepIndex) => (
                            <tr key={`${flow.id}-${stepIndex}`} className="border-t border-slate-100 align-top">
                              <td className="px-2 py-2">
                                <input
                                  className="w-48 rounded-md border border-slate-200 px-2 py-1"
                                  value={step.name}
                                  onChange={event => updateWorkflowStep(flow.id, stepIndex, { name: event.target.value })}
                                />
                              </td>
                              <td className="px-2 py-2">
                                <select
                                  className="w-36 rounded-md border border-slate-200 px-2 py-1"
                                  value={step.actor_type}
                                  onChange={event => updateWorkflowStep(flow.id, stepIndex, { actor_type: event.target.value })}
                                >
                                  {workflowActorTypeOptions.map(option => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  className="w-44 rounded-md border border-slate-200 px-2 py-1"
                                  placeholder="ex. Contabilitate"
                                  value={step.actor_ref}
                                  onChange={event => updateWorkflowStep(flow.id, stepIndex, { actor_ref: event.target.value })}
                                />
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  className="w-20 rounded-md border border-slate-200 px-2 py-1"
                                  type="number"
                                  min="0"
                                  value={step.deadline_days}
                                  onChange={event => updateWorkflowStep(flow.id, stepIndex, { deadline_days: event.target.value })}
                                />
                              </td>
                              <td className="px-2 py-2">
                                <div className="grid w-72 gap-2">
                                  <input
                                    className="rounded-md border border-slate-200 px-2 py-1"
                                    value={step.condition}
                                    onChange={event => updateWorkflowStep(flow.id, stepIndex, { condition: event.target.value, condition_rule: null })}
                                  />
                                  <div className="grid gap-1 rounded-lg border border-slate-100 bg-slate-50 p-2">
                                    <select
                                      className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                                      value=""
                                      onChange={event => {
                                        if (event.target.value) applyWorkflowConditionPreset(flow.id, stepIndex, event.target.value)
                                      }}
                                    >
                                      <option value="">Preset rapid...</option>
                                      {workflowConditionPresetOptions.map(option => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                      ))}
                                    </select>
                                    <div className="grid grid-cols-[1fr_72px_1fr] gap-1">
                                      <select
                                        className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                                        value={(workflowConditionDrafts[`${flow.id}:${stepIndex}`] || defaultWorkflowConditionDraft()).field}
                                        onChange={event => updateWorkflowConditionDraft(flow.id, stepIndex, { field: event.target.value })}
                                      >
                                        {workflowConditionFieldOptions.map(option => (
                                          <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                      </select>
                                      <select
                                        className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                                        value={(workflowConditionDrafts[`${flow.id}:${stepIndex}`] || defaultWorkflowConditionDraft()).operator}
                                        onChange={event => updateWorkflowConditionDraft(flow.id, stepIndex, { operator: event.target.value })}
                                      >
                                        {workflowConditionOperatorOptions.map(option => (
                                          <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                      </select>
                                      <input
                                        className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                                        placeholder="valoare"
                                        value={(workflowConditionDrafts[`${flow.id}:${stepIndex}`] || defaultWorkflowConditionDraft()).value}
                                        onChange={event => updateWorkflowConditionDraft(flow.id, stepIndex, { value: event.target.value })}
                                      />
                                    </div>
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="truncate text-[11px] text-slate-500">
                                        {buildWorkflowConditionLabel(workflowConditionDrafts[`${flow.id}:${stepIndex}`] || defaultWorkflowConditionDraft())}
                                      </span>
                                      <Button size="sm" variant="secondary" onClick={() => applyWorkflowConditionDraft(flow.id, stepIndex)}>Aplică</Button>
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  type="checkbox"
                                  checked={step.required !== false}
                                  onChange={event => updateWorkflowStep(flow.id, stepIndex, { required: event.target.checked })}
                                />
                              </td>
                              <td className="px-2 py-2 text-right">
                                <Button size="sm" variant="ghost" onClick={() => removeWorkflowStep(flow.id, stepIndex)}>Șterge</Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-3 flex justify-end">
                      <Button size="sm" variant="secondary" onClick={() => addWorkflowStep(flow.id)}>+ Adaugă pas</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Test rapid</div>
                  <h3 className="mt-1 text-lg font-semibold text-slate-900">Testează fluxul înainte de lansare</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Completezi un scenariu simplu și vezi imediat ce șablon se aplică, ce pași pornesc și unde trebuie atenție.
                  </p>
                </div>
                <Badge tone={workflowSimulation.flow ? 'success' : 'warning'}>
                  {workflowSimulation.flow ? `potrivit: ${workflowSimulation.flow.label}` : 'fără potrivire'}
                </Badge>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                  <Select
                    label="Tip document testat"
                    value={workflowTest.document_type}
                    onChange={event => setWorkflowTest(current => ({ ...current, document_type: event.target.value }))}
                  >
                    {workflowDocumentFlows.map(flow => (
                      <option key={flow.id} value={flow.document_type}>{flow.label} ({flow.document_type})</option>
                    ))}
                    <option value="document">Document generic</option>
                  </Select>
                  <Select
                    label="Inițiator document"
                    value={workflowTest.initiator}
                    onChange={event => setWorkflowTest(current => ({ ...current, initiator: event.target.value }))}
                  >
                    <option value="">Alege inițiatorul pentru test</option>
                    {users.filter(user => user.active !== false).map(user => (
                      <option key={user.id} value={user.id}>
                        {user.name || user.username}{user.department ? ` — ${user.department}` : ''}
                      </option>
                    ))}
                  </Select>
                  <Select
                    label="Departament"
                    value={workflowTest.department}
                    onChange={event => setWorkflowTest(current => ({ ...current, department: event.target.value }))}
                  >
                    <option value="">Alege departamentul pentru test</option>
                    {departments.map(dept => {
                      const name = dept.name || dept.nume || dept.denumire || dept
                      return <option key={dept.id || name} value={name}>{dept.icon || ''} {name}</option>
                    })}
                  </Select>
                  <Input
                    label="Valoare estimată"
                    type="number"
                    min="0"
                    value={workflowTest.value}
                    onChange={event => setWorkflowTest(current => ({ ...current, value: event.target.value }))}
                    placeholder="ex. 15000"
                  />
                  <Select
                    label="Prioritate"
                    value={workflowTest.priority}
                    onChange={event => setWorkflowTest(current => ({ ...current, priority: event.target.value }))}
                  >
                    <option value="normal">Normală</option>
                    <option value="urgent">Urgentă</option>
                    <option value="critic">Critică</option>
                  </Select>
                </div>

                <div className="rounded-xl border border-white bg-white p-4 shadow-sm">
                  {workflowSimulation.flow ? (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="success">flux activ</Badge>
                        <Badge tone="info">v{workflowSimulation.flow.version}</Badge>
                        <span className="text-sm font-semibold text-slate-900">{workflowSimulation.flow.label}</span>
                      </div>
                      <div className="mt-3 grid gap-2">
                        {workflowSimulation.steps.map(step => (
                          <div key={`${workflowSimulation.flow.id}-preview-${step.index}`} className="rounded-lg border border-slate-200 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="font-semibold text-slate-900">Pas {step.index}: {step.name}</div>
                              <Badge tone={step.required ? 'warning' : 'neutral'}>{step.required ? 'obligatoriu' : 'opțional'}</Badge>
                            </div>
                            <div className="mt-2 grid gap-2 text-sm text-slate-600 md:grid-cols-3">
                              <span>{step.actor_label}</span>
                              <span>Termen: {step.deadline_days || 0} zile</span>
                              <span>{step.applies_hint}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      Nu am găsit un flux activ pentru scenariul testat. Documentul nu se blochează, dar va merge pe circuitul fallback existent.
                    </div>
                  )}
                  {workflowSimulation.warnings.length ? (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <div className="text-sm font-semibold text-amber-900">De verificat înainte de folosire reală:</div>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
                        {workflowSimulation.warnings.map(item => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                      Scenariul testat are un flux activ și pași clari. Poate fi folosit ca verificare rapidă înainte de lansare.
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {[
                { title: 'Șabloane editabile', text: 'Pornire rapidă pentru referate, contracte, facturi și HR.' },
                { title: 'Reguli ușor de citit', text: 'Pasul spune cine aprobă, în câte zile și când se aplică.' },
                { title: 'Test înainte de folosire', text: 'Adminul vede traseul aplicat înainte ca documentul să intre în circuit.' },
              ].map(item => (
                <div key={item.title} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="font-semibold text-slate-900">{item.title}</div>
                  <div className="mt-1 text-sm text-slate-500">{item.text}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card
            title="Pachete comerciale"
            subtitle="Alege rapid un profil de produs. Se modifică selecția locală; salvarea se face cu butonul „Salvează module”."
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visibleCommercialPackages.map(pkg => {
                const modules = (pkg.modules || []).filter(moduleKey => configurableModuleKeys.includes(moduleKey))
                const enabledCount = modules.filter(moduleKey => enabledModules.includes(moduleKey)).length
                const isCurrent = modules.length > 0 && enabledCount === modules.length && activeConfigurableModules.length === modules.length
                return (
                  <div key={pkg.key} className={`rounded-lg border p-4 ${isCurrent ? 'border-primary-200 bg-primary-50/60' : 'border-slate-200 bg-white'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xl">{pkg.icon || '🧩'}</div>
                        <h3 className="mt-2 font-semibold text-slate-900">{pkg.label}</h3>
                        <p className="mt-1 text-sm text-slate-500">{pkg.description}</p>
                      </div>
                      {isCurrent ? <Badge variant="green" size="sm">selectat</Badge> : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {modules.slice(0, 6).map(moduleKey => (
                        <span key={moduleKey} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          {moduleByKey.get(moduleKey)?.label || moduleKey}
                        </span>
                      ))}
                      {modules.length > 6 ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">+{modules.length - 6}</span> : null}
                    </div>
                    <Button className="mt-4" size="sm" variant={isCurrent ? 'secondary' : 'primary'} onClick={() => applyCommercialPackage(pkg)}>
                      Aplică profil
                    </Button>
                  </div>
                )
              })}
            </div>
          </Card>

          <Card
            title="Module active"
            subtitle="Modulele dezactivate sunt ascunse din sidebar. Modulele de bază rămân mereu active; licențierea strictă se va lega peste acest catalog."
            actions={[<Button key="save-modules" onClick={saveModules}>Salvează module</Button>]}
          >
            <div className="mb-4 grid gap-3 md:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                <div className="text-xs text-slate-500">Module active</div>
                <strong className="text-lg text-slate-900">{activeConfigurableModules.length}</strong>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                <div className="text-xs text-slate-500">Module de bază</div>
                <strong className="text-lg text-slate-900">{alwaysOnModuleKeys.length}</strong>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                <div className="text-xs text-slate-500">Pachete definite</div>
                <strong className="text-lg text-slate-900">{visibleCommercialPackages.length}</strong>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                <div className="text-xs text-slate-500">Ultima salvare</div>
                <strong className="text-sm text-slate-900">{moduleCatalog?.updated_at ? formatDate(moduleCatalog.updated_at) : 'nesalvat'}</strong>
              </div>
            </div>
            <div className="grid gap-4">
              {moduleGroups.map(group => (
                <div key={group.title} className="grid gap-3">
                  <h3 className="text-xs font-semibold uppercase text-slate-500">{group.title}</h3>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {group.modules.map(mod => {
                      const locked = group.locked
                      const enabled = locked || enabledModules.includes(mod.key)
                      const licensed = isModuleLicensed(mod.key)
                      const featureCount = moduleFeatureCatalog[mod.key]?.length || 0
                      const activeFeatureCount = Object.values({ ...defaultFeatureState(mod.key), ...(settings.module_features?.[mod.key] || {}) }).filter(Boolean).length
                      return (
                        <div key={mod.key} className={`rounded-lg border p-4 ${enabled ? 'border-primary-100 bg-primary-50/40' : 'border-slate-200 bg-white'} ${!licensed ? 'opacity-60' : ''}`}>
                          <div className="flex items-start gap-3">
                            {locked ? (
                              <div className="text-xl">{mod.icon}</div>
                            ) : (
                              <button
                                type="button"
                                className="rounded-md p-1 text-xl transition hover:bg-white hover:shadow-sm"
                                title={`Configurează ${mod.label}`}
                                onClick={() => openModuleConfig(mod)}
                              >
                                {mod.icon}
                              </button>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="font-semibold text-slate-900">{mod.label}</h4>
                                {mod.badge ? <Badge variant="yellow" size="sm">{mod.badge}</Badge> : null}
                                {!licensed ? <Badge variant="red" size="sm">Nelicițiat</Badge> : null}
                              </div>
                              {mod.description ? <p className="mt-1 text-sm text-slate-500">{mod.description}</p> : null}
                              {featureCount ? (
                                <p className="mt-1 text-xs text-slate-500">{activeFeatureCount}/{featureCount} funcții active</p>
                              ) : null}
                            </div>
                            {locked ? (
                              <Badge variant="gray">Activ</Badge>
                            ) : (
                              <button
                                type="button"
                                disabled={!licensed}
                                title={!licensed ? 'Licența nu include acest modul.' : ''}
                                onClick={() => toggleModule(mod.key)}
                                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed ${enabled ? 'bg-primary-600' : 'bg-slate-300'}`}
                                aria-label={`${enabled ? 'Dezactivează' : 'Activează'} ${mod.label}`}
                              >
                                <span className={`inline-block h-5 w-5 rounded-full bg-white transition ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'Cântar' && (
        <Card title="Cântar" subtitle="Configurare cale bază cântar și mapare produse.">
          <form className="grid gap-4" onSubmit={saveScale}>
            <Input label="Adresă server cântar" placeholder="\\\\SERVER\\path\\cantare.db" value={settings.scaleDbPath || ''} onChange={event => setSettings(s => ({ ...s, scaleDbPath: event.target.value }))} />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={testScale}>Testează conexiunea</Button>
              <Button type="submit">Salvează cântar</Button>
            </div>
            <div className="grid gap-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">Mapare produse cântar → materiale InfraFlow</h3>
                <Button type="button" size="sm" variant="secondary" onClick={() => setScaleRows(rows => [...rows, { product: '', materialId: '' }])}>Adaugă mapare</Button>
              </div>
              {scaleRows.length === 0 ? <div className="rounded border border-dashed border-slate-200 p-4 text-sm text-slate-500">Nu există mapări definite.</div> : scaleRows.map((row, index) => (
                <div key={`${row.product}-${index}`} className="grid gap-3 rounded border border-slate-200 p-3 md:grid-cols-[1fr_1fr_auto]">
                  <Input label="Cod produs cântar" value={row.product} onChange={event => updateScaleRow(index, 'product', event.target.value)} />
                  <Select label="Material InfraFlow" value={row.materialId} onChange={event => updateScaleRow(index, 'materialId', event.target.value)}>
                    <option value="">Alege material</option>
                    {materials.map(material => (
                      <option key={material.id} value={material.id}>{material.name || material.denumire || material.id}</option>
                    ))}
                  </Select>
                  <Button type="button" className="self-end" variant="ghost" onClick={() => setScaleRows(rows => rows.filter((_, rowIndex) => rowIndex !== index))}>Șterge</Button>
                </div>
              ))}
            </div>
          </form>
        </Card>
      )}

      {activeTab === 'Integrări' && (
        <div className="grid gap-4">
          <Card title="🔌 Integrări externe" subtitle="Căi acces pentru surse externe. Setări simple, fără import la salvare.">
            <div className="grid gap-6">
              <section className="grid gap-3 border-b border-slate-200 pb-5">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">⛽ PIUSI Self-Service</h3>
                  <p className="text-sm text-slate-500">Alimentări carburant din fișier MDB.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-[1fr_160px_auto]">
                  <Input
                    label="Cale MDB"
                    value={settings.piusi_mdb_path || piusiConfig.mdb_path || ''}
                    onChange={event => {
                      const value = event.target.value
                      setSettings(s => ({ ...s, piusi_mdb_path: value }))
                      setPiusiConfig(c => ({ ...c, mdb_path: value }))
                    }}
                    placeholder="\\\\GESTIONAR-PC\\PiusiData\\Self.mdb"
                  />
                  <Input
                    label="Sync la (minute)"
                    type="number"
                    min="1"
                    value={settings.piusi_sync_min || piusiConfig.sync_interval_min || 30}
                    onChange={event => {
                      const value = event.target.value
                      setSettings(s => ({ ...s, piusi_sync_min: value }))
                      setPiusiConfig(c => ({ ...c, sync_interval_min: Number(value || 30) }))
                    }}
                  />
                  <Button type="button" className="self-end" variant="secondary" onClick={() => testIntegrationPath('piusi', settings.piusi_mdb_path || piusiConfig.mdb_path)}>✅ Testează</Button>
                </div>
                <div className={`text-sm font-medium ${pathStatus('piusi', settings.piusi_mdb_path || piusiConfig.mdb_path).className}`}>
                  Status: {pathStatus('piusi', settings.piusi_mdb_path || piusiConfig.mdb_path).text}
                  {integrationTests.piusi?.modified ? <span className="ml-2 text-slate-500">Modificat: {formatDate(integrationTests.piusi.modified)}</span> : null}
                  {integrationTests.piusi?.error ? <span className="ml-2 text-rose-600">{integrationTests.piusi.error}</span> : null}
                </div>
              </section>

              <section className="grid gap-3 border-b border-slate-200 pb-5">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">⚖️ Cântar Poartă</h3>
                  <p className="text-sm text-slate-500">Bază de date sau fișier export cântar.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-[1fr_160px_auto]">
                  <Input
                    label="Cale DB / fișier"
                    value={settings.cantar_db_path || settings.scaleDbPath || ''}
                    onChange={event => setSettings(s => ({ ...s, cantar_db_path: event.target.value, scaleDbPath: event.target.value }))}
                    placeholder="\\\\CANTAR-PC\\Share\\cantar.mdb"
                  />
                  <Input
                    label="Sync la (minute)"
                    type="number"
                    min="1"
                    value={settings.cantar_sync_min || 5}
                    onChange={event => setSettings(s => ({ ...s, cantar_sync_min: event.target.value }))}
                  />
                  <Button type="button" className="self-end" variant="secondary" onClick={() => testIntegrationPath('cantar', settings.cantar_db_path || settings.scaleDbPath)}>✅ Testează</Button>
                </div>
                <div className={`text-sm font-medium ${pathStatus('cantar', settings.cantar_db_path || settings.scaleDbPath).className}`}>
                  Status: {pathStatus('cantar', settings.cantar_db_path || settings.scaleDbPath).text}
                  {integrationTests.cantar?.modified ? <span className="ml-2 text-slate-500">Modificat: {formatDate(integrationTests.cantar.modified)}</span> : null}
                  {integrationTests.cantar?.error ? <span className="ml-2 text-rose-600">{integrationTests.cantar.error}</span> : null}
                </div>
              </section>

              <section className="grid gap-3 border-b border-slate-200 pb-5">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">🚗 autoMinder</h3>
                  <p className="text-sm text-slate-500">Import date mecanizare din folder sau bază externă.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-[1fr_160px_auto]">
                  <Input
                    label="Cale DB"
                    value={settings.autominder_db_path || settings.autominderDbPath || ''}
                    onChange={event => setSettings(s => ({ ...s, autominder_db_path: event.target.value, autominderDbPath: event.target.value }))}
                    placeholder="\\\\SERVER\\autoMinder5\\Data\\"
                  />
                  <Input
                    label="Sync la (minute)"
                    type="number"
                    min="1"
                    value={settings.autominder_sync_min || 60}
                    onChange={event => setSettings(s => ({ ...s, autominder_sync_min: event.target.value }))}
                  />
                  <Button type="button" className="self-end" variant="secondary" onClick={() => testIntegrationPath('autominder', settings.autominder_db_path || settings.autominderDbPath)}>✅ Testează</Button>
                </div>
                <div className={`text-sm font-medium ${pathStatus('autominder', settings.autominder_db_path || settings.autominderDbPath).className}`}>
                  Status: {pathStatus('autominder', settings.autominder_db_path || settings.autominderDbPath).text}
                  {integrationTests.autominder?.modified ? <span className="ml-2 text-slate-500">Modificat: {formatDate(integrationTests.autominder.modified)}</span> : null}
                  {integrationTests.autominder?.error ? <span className="ml-2 text-rose-600">{integrationTests.autominder.error}</span> : null}
                </div>
              </section>

              <section className="grid gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">➕ Integrări custom</h3>
                    <p className="text-sm text-slate-500">Căi suplimentare: MDB, SQLite, CSV sau Excel.</p>
                  </div>
                  <Button type="button" variant="secondary" onClick={addCustomIntegration}>➕ Adaugă integrare nouă</Button>
                </div>
                {(settings.external_integrations || []).map((row, index) => {
                  const key = row.id || `custom-${index}`
                  const status = pathStatus(key, row.path)
                  return (
                    <div key={key} className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-[1fr_150px_1fr_130px_auto_auto]">
                      <Input label="Nume" value={row.name || ''} onChange={event => updateCustomIntegration(index, 'name', event.target.value)} />
                      <Select label="Tip" value={row.type || 'MDB'} onChange={event => updateCustomIntegration(index, 'type', event.target.value)}>
                        <option value="MDB">MDB</option>
                        <option value="SQLite">SQLite</option>
                        <option value="CSV">CSV</option>
                        <option value="Excel">Excel</option>
                      </Select>
                      <Input label="Cale" value={row.path || ''} onChange={event => updateCustomIntegration(index, 'path', event.target.value)} />
                      <Input label="Interval" type="number" min="1" value={row.sync_min || 30} onChange={event => updateCustomIntegration(index, 'sync_min', event.target.value)} />
                      <Button type="button" className="self-end" variant="secondary" onClick={() => testIntegrationPath(key, row.path)}>Testează</Button>
                      <Button type="button" className="self-end" variant="ghost" onClick={() => removeCustomIntegration(index)}>Șterge</Button>
                      <div className={`md:col-span-6 text-sm font-medium ${status.className}`}>
                        Status: {status.text}
                        {integrationTests[key]?.error ? <span className="ml-2 text-rose-600">{integrationTests[key].error}</span> : null}
                      </div>
                    </div>
                  )
                })}
              </section>

              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="ghost" onClick={reloadPiusi}>Reîncarcă status și mapări PIUSI</Button>
                <Button type="button" onClick={saveExternalPaths}>💾 Salvează toate căile</Button>
              </div>
            </div>
          </Card>

          <Card title="Status PIUSI" subtitle="Informații rapide pentru importul alimentărilor.">
            <div className="grid gap-2 text-sm text-slate-700 md:grid-cols-4">
              <span>Ultima sync: {piusiStatus?.ultima_sincronizare || 'niciodată'}</span>
              <span>Total importate: {piusiStatus?.inregistrari_totale ?? 0}</span>
              <span>Nemăpate: {piusiStatus?.nemapate ?? 0}</span>
              <span>Neprocesate FAZ: {piusiStatus?.nesincronizate ?? 0}</span>
            </div>
            {piusiStatus?.scheduler ? (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <div className="font-medium text-slate-700">
                  Scheduler automat: {piusiStatus.scheduler.started ? `pornit · la ${piusiStatus.scheduler.interval_min || 30} min` : 'nepornit'}
                </div>
                <div className="mt-1 grid gap-1 md:grid-cols-3">
                  <span>Ultima rulare: {piusiStatus.scheduler.last_run_at ? new Date(piusiStatus.scheduler.last_run_at).toLocaleString('ro-RO') : '—'}</span>
                  <span>Ultimul succes: {piusiStatus.scheduler.last_success_at ? new Date(piusiStatus.scheduler.last_success_at).toLocaleString('ro-RO') : '—'}</span>
                  <span>Următoarea reîncercare: {piusiStatus.scheduler.next_retry_at ? new Date(piusiStatus.scheduler.next_retry_at).toLocaleString('ro-RO') : '—'}</span>
                </div>
                {piusiStatus.scheduler.last_error ? (
                  <div className="mt-1 text-amber-700">Ultima observație: {piusiStatus.scheduler.last_error}</div>
                ) : null}
              </div>
            ) : null}
            <div className="mt-2 text-xs text-slate-500">
              {piusiStatus?.mdb_verificat
                ? (piusiStatus?.mdb_accesibil ? 'MDB verificat: accesibil.' : 'MDB verificat: inaccesibil sau lipsă.')
                : 'MDB neverificat la încărcarea paginii. Folosește „Reîncarcă status și mapări PIUSI” sau testul de cale pentru verificare reală.'}
            </div>
          </Card>

          <Card title="Mapare operatori PIUSI" subtitle="Leagă codurile PIUSI de vehiculele/utilajele InfraFlow.">
            <div className="grid gap-3">
              {!piusiMapari.length ? (
                <div className="rounded border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                  Mapările PIUSI nu sunt încărcate automat la deschiderea Setărilor. Apasă „Reîncarcă status și mapări PIUSI” sau rulează o sincronizare.
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Cod PIUSI</th>
                        <th className="px-3 py-2">Vehicul / Utilaj InfraFlow</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {piusiMapari.map((row, index) => (
                        <tr key={row.operator_cod || index}>
                          <td className="px-3 py-2 font-medium text-slate-800">{row.operator_cod}</td>
                          <td className="px-3 py-2">
                            <Select value={row.asset_id || ''} onChange={event => updatePiusiMapare(index, event.target.value)}>
                              <option value="">-- nemapat --</option>
                              {piusiAssets.map(asset => (
                                <option key={asset.id} value={asset.id}>{asset.label}</option>
                              ))}
                            </Select>
                          </td>
                          <td className="px-3 py-2">
                            {row.asset_id ? <Badge variant="green">mapat</Badge> : <Badge variant="yellow">⚠ nemapat</Badge>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex justify-end">
                <Button onClick={savePiusiMapari} disabled={!piusiMapari.length}>💾 Salvează mapările</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      <Modal open={updateModal} title="Confirmare update" onClose={() => setUpdateModal(false)}>
        <div className="grid gap-3">
          <p className="text-sm text-slate-600">Ești sigur? Aplicația va reporni automat.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setUpdateModal(false)}>Anulează</Button>
            <Button variant="danger" onClick={installUpdate}><CheckCircle size={16} /> Da, aplică</Button>
          </div>
        </div>
      </Modal>

      <Modal open={changelogModal} title="CHANGELOG.md" size="xl" onClose={() => setChangelogModal(false)}>
        <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-4 text-xs text-slate-700">{changelogText}</pre>
      </Modal>

      <Modal open={userModal} title={editingUser ? 'Editează utilizator' : 'Utilizator nou'} onClose={() => { setUserModal(false); setEditingUser(null) }} size="lg">
        <form className="grid gap-3" onSubmit={saveUser}>
          <Input label="Nume complet" value={userForm.name} onChange={event => setUserForm(u => ({ ...u, name: event.target.value }))} required />
          <Input label="Username" value={userForm.username} onChange={event => setUserForm(u => ({ ...u, username: event.target.value }))} required />
          <Input label="Email" type="email" value={userForm.email} onChange={event => setUserForm(u => ({ ...u, email: event.target.value }))} />
          <Input
            label={editingUser ? 'Parolă nouă (opțional)' : 'Parolă'}
            type="password"
            value={userForm.password}
            onChange={event => setUserForm(u => ({ ...u, password: event.target.value }))}
            required={!editingUser}
          />
          <Select label="Rol" value={userForm.role} onChange={event => setUserForm(u => ({ ...u, role: event.target.value }))}>
            {(rolesData.length ? rolesData : [{ id: 'angajat', name: 'Angajat' }]).map(role => (
              <option key={role.id} value={role.id}>{role.name || role.id} — {role.description || roleDescriptions[role.id] || ''}</option>
            ))}
          </Select>
          <Select label="Departament" value={userForm.department} onChange={event => setUserForm(u => ({ ...u, department: event.target.value }))}>
            <option value="">Fără departament</option>
            {departments.map(dept => (
              <option key={dept.id || dept.name || dept} value={dept.name || dept.nume || dept.denumire || dept}>
                {dept.icon || ''} {dept.name || dept.nume || dept.denumire || dept}
              </option>
            ))}
          </Select>
          <Select label="Manager direct (opțional)" value={userForm.manager_id} onChange={event => setUserForm(u => ({ ...u, manager_id: event.target.value }))}>
            <option value="">Fără manager direct</option>
            {users
              .filter(item => item.active !== false && (!editingUser || String(item.id) !== String(editingUser.id)))
              .map(item => (
                <option key={item.id} value={item.id}>
                  {item.name || item.username}{item.department ? ` — ${item.department}` : ''}
                </option>
              ))}
          </Select>

          {/* ── Asociere angajat HR ── */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 grid gap-3">
            <div className="text-sm font-semibold text-slate-700">👤 Asociere angajat HR</div>

            {/* Metodă A: selectare directă din lista angajaților */}
            <Select
              label="Angajat asociat (opțional)"
              value={userForm.employee_id}
              onChange={event => setUserForm(u => ({ ...u, employee_id: event.target.value, verified_from_hr: false }))}
            >
              <option value="">-- Fără asociere --</option>
              {hrEmployees.map(e => (
                <option key={e.id} value={e.id}>
                  {[e.prenume, e.nume].filter(Boolean).join(' ')} — {e.functia || e.functie || ''}
                </option>
              ))}
            </Select>

            {/* Metodă B: verificare identitate */}
            {!editingUser && (
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={verifyHr}
                  onChange={e => { setVerifyHr(e.target.checked); setVerifyResult(null) }}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Verifică identitate din HR (CNP + act identitate)
              </label>
            )}

            {verifyHr && !editingUser && (
              <div className="grid gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    label="CNP"
                    value={verifyCnp}
                    onChange={e => setVerifyCnp(e.target.value)}
                    placeholder="1234567890123"
                    className="col-span-3"
                  />
                  <Input label="Serie CI" value={verifySerie} onChange={e => setVerifySerie(e.target.value.toUpperCase())} placeholder="AZ" />
                  <Input label="Nr. CI" value={verifyNumar} onChange={e => setVerifyNumar(e.target.value)} placeholder="123456" className="col-span-2" />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={verifyLoading || !verifyCnp || !verifySerie || !verifyNumar}
                  onClick={verifyEmployee}
                >
                  {verifyLoading ? 'Se verifică...' : '🔍 Verifică în HR'}
                </Button>

                {verifyResult && verifyResult.found && (
                  <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
                    ✅ Angajat găsit: <strong>{verifyResult.nume}</strong> — {verifyResult.functia}
                    {verifyResult.departament && ` (${verifyResult.departament})`}
                  </div>
                )}
                {verifyResult && !verifyResult.found && verifyResult.error && (
                  <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
                    ⚠️ {verifyResult.error}
                  </div>
                )}
                {verifyResult && !verifyResult.found && !verifyResult.error && (
                  <div className="rounded-md bg-amber-100 border border-amber-300 px-3 py-2 text-sm text-amber-900 whitespace-pre-line">
                    {MESAJ_NEGASIT}
                  </div>
                )}
              </div>
            )}

            {userForm.employee_id && userForm.verified_from_hr && (
              <div className="text-xs text-green-700">✅ Identitate verificată din HR</div>
            )}
          </div>

          <label className="flex items-center justify-between rounded-md border border-slate-200 p-3 text-sm font-medium text-slate-700">
            Activ
            <input type="checkbox" checked={userForm.active} onChange={event => setUserForm(u => ({ ...u, active: event.target.checked }))} />
          </label>
          <label className="flex items-center justify-between rounded-md border border-green-200 bg-green-50 p-3 text-sm font-medium text-green-800" title="Toți utilizatorii activi au acces automat la Kiosk">
            <span>
              Acces Kiosk
              <span className="mt-0.5 block text-xs font-normal text-green-700">Automat pentru utilizatori activi</span>
            </span>
            <input type="checkbox" checked={userForm.active} disabled readOnly />
          </label>
          <Button type="submit">Salvează</Button>
        </form>
      </Modal>

      <Modal open={Boolean(moduleConfig)} onClose={() => setModuleConfig(null)} title={moduleConfig ? `Configurează ${moduleConfig.label}` : 'Configurează modul'} size="lg">
        {moduleConfig ? (
          <div className="grid gap-4">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              Activezi sau ascunzi funcțiile din modul. Setările sunt pregătite și pentru limitare pe licență.
            </div>
            <div className="grid gap-2">
              {(moduleFeatureCatalog[moduleConfig.key] || []).map(feature => {
                const active = moduleFeatureDraft[feature.key] !== false
                return (
                  <label key={feature.key} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white p-3">
                    <span>
                      <span className="font-medium text-slate-800">{feature.label}</span>
                      <span className="block text-xs text-slate-400">{feature.key}</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => toggleModuleFeature(feature.key)}
                      className="h-5 w-5 accent-primary-600"
                    />
                  </label>
                )
              })}
              {(moduleFeatureCatalog[moduleConfig.key] || []).length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                  Modulul nu are încă subfuncții configurabile.
                </div>
              ) : null}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setModuleConfig(null)}>Anulează</Button>
              <Button onClick={saveModuleConfig}>Salvează configurarea</Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={deptModal} onClose={() => { setDeptModal(false); setDeptEditing(null) }} title={deptEditing ? 'Editează departament' : 'Departament nou'} size="lg">
        <div className="grid gap-3">
          {deptError ? <div className="rounded border border-rose-200 bg-rose-50 p-2 text-sm text-rose-700">{deptError}</div> : null}

          <Input
            label="Denumire departament *"
            value={deptForm.name}
            onChange={event => setDeptForm(form => ({ ...form, name: event.target.value }))}
            placeholder="ex: Mecanizare"
          />

          <Select
            label="Tip"
            value={deptForm.tip}
            onChange={event => setDeptForm(form => ({ ...form, tip: event.target.value }))}
          >
            <option value="departament">Departament</option>
            <option value="serviciu">Serviciu</option>
            <option value="sectie">Secție</option>
          </Select>

          <div className="grid gap-2">
            <Input
              label="Icon departament"
              value={deptForm.icon}
              onChange={event => setDeptForm(form => ({ ...form, icon: event.target.value }))}
              placeholder="👥"
            />
            <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-50 p-2">
              {departmentIconOptions.map(icon => (
                <button
                  key={icon}
                  type="button"
                  className={`h-9 w-9 rounded-md border text-lg transition ${
                    deptForm.icon === icon ? 'border-primary-500 bg-primary-50 shadow-sm' : 'border-slate-200 bg-white hover:border-primary-300'
                  }`}
                  onClick={() => setDeptForm(form => ({ ...form, icon }))}
                  title={`Icon ${icon}`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          <Input
            label="Culoare"
            type="color"
            value={deptForm.culoare}
            onChange={event => setDeptForm(form => ({ ...form, culoare: event.target.value }))}
          />

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-slate-700">Permisiuni departament</div>
              <div className="text-xs text-slate-400">{(deptForm.permissions || []).length} active</div>
            </div>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="grid gap-3">
                {permCatalog.map(group => (
                  <div key={group.id} className="rounded-md border border-slate-200 bg-white p-2">
                    <div className="mb-2 text-xs font-semibold uppercase text-slate-500">{group.label}</div>
                    <div className="flex flex-wrap gap-1">
                      {group.permissions.map(perm => {
                        const active = (deptForm.permissions || []).includes(perm.id)
                        return (
                          <button
                            key={perm.id}
                            type="button"
                            title={perm.id}
                            onClick={() => setDeptForm(form => ({
                              ...form,
                              permissions: active
                                ? (form.permissions || []).filter(item => item !== perm.id)
                                : [...(form.permissions || []), perm.id]
                            }))}
                            className={`rounded border px-2 py-0.5 text-xs transition-colors ${
                              active
                                ? 'border-green-400 bg-green-100 text-green-800'
                                : 'border-slate-300 bg-white text-slate-500 hover:border-slate-400'
                            }`}
                          >
                            {perm.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
                {!permCatalog.length ? (
                  <div className="rounded border border-dashed border-slate-200 bg-white p-3 text-sm text-slate-500">
                    Catalogul de permisiuni nu este încărcat.
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setDeptModal(false); setDeptEditing(null) }}>Anulează</Button>
            <Button onClick={deptEditing ? handleUpdateDept : handleCreateDept} disabled={deptLoading}>
              {deptLoading ? 'Se salvează...' : deptEditing ? 'Salvează' : 'Creează'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(resetUser)} title="Resetare parolă" onClose={() => setResetUser(null)}>
        <form className="grid gap-3" onSubmit={resetUserPassword}>
          <p className="text-sm text-slate-600">Setează o parolă nouă pentru {resetUser?.name || resetUser?.username}.</p>
          <Input label="Parolă nouă" type="password" value={resetPassword} onChange={event => setResetPassword(event.target.value)} required />
          <Button type="submit" variant="danger">Resetează parola</Button>
        </form>
      </Modal>
    </div>
  )
}
