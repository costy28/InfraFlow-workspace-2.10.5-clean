'use strict'

const { commercialDemoLicense } = require('../shared/commercialDemo')

const MODULE_GROUPS = [
  {
    title: 'PRINCIPALE',
    locked: true,
    modules: [
      { key: 'core', label: 'Core', description: 'Autentificare, roluri, audit, backup și update.' },
      { key: 'production', label: 'Producție', description: 'Rețete, consumuri și planificare producție.' },
      { key: 'inventory', label: 'Stocuri', description: 'Materiale, intrări, ieșiri și gestiune.' },
      { key: 'reports', label: 'Rapoarte', description: 'Rapoarte standard și exporturi.' },
    ],
  },
  {
    title: 'OPERAȚIONALE',
    modules: [
      { key: 'fleet', label: 'Flotă, echipamente & resurse', description: 'Vehicule, utilaje, foi parcurs, FAZ și GPS.' },
      { key: 'technical', label: 'Lucrări & execuție', description: 'Lucrări, teren, output operațional și raport tehnic.' },
      { key: 'procurement', label: 'Aprovizionare & achiziții', description: 'Comenzi, recepții, cereri interne, PAAP și CPV.' },
      { key: 'logistics', label: 'Logistică & transport', description: 'Avize, CMR, bonuri de transport și dovezi de livrare, legate la comenzi și contracte.' },
      { key: 'contract_management', label: 'Contract Management', description: 'Contracte, consum valoric, CPV, manageri și alerte de prag/termen.' },
      { key: 'crm', label: 'CRM / Sales Automation', description: 'Solicitări comerciale, clienți potențiali, oferte și comenzi.' },
      { key: 'hr', label: 'HR', description: 'Angajați, pontaj, concedii, dosar personal și Kiosk.' },
      { key: 'controlling', label: 'Controlling', description: 'Centre cost/profit și costuri operaționale.' },
      { key: 'accounting', label: 'Contabilitate', description: 'Plan conturi, facturi, jurnale, declarații și SAF-T.' },
    ],
  },
  {
    title: 'SERVICII',
    modules: [
      { key: 'sanitation', label: 'Rute & operațiuni teren', description: 'Rute, colectări și rapoarte.' },
      { key: 'traffic_safety', label: 'Semnalizare & intervenții', description: 'Indicatoare, marcaje și intervenții.' },
      { key: 'environment', label: 'Mediu & conformitate', description: 'Autorizații, deșeuri, emisii și incidente.' },
      { key: 'snow_removal', label: 'Operațiuni sezoniere', description: 'Planuri, intervenții și consumuri sezoniere.' },
    ],
  },
  {
    title: 'SUPORT',
    modules: [
      { key: 'documents', label: 'Documente și aprobare', description: 'Șabloane, circuit documente și arhivare.' },
      { key: 'messaging', label: 'Mesaje interne', description: 'Canale, notificări și comunicare internă.' },
      { key: 'tickets', label: 'Solicitări & incidente', description: 'Tichete, comentarii și urmărire rezolvare.' },
      { key: 'field', label: 'Proiecte & activitate în teren', description: 'Lucrări mobile, rapoarte și activitate teren.' },
      { key: 'legal', label: 'Juridic', description: 'Dosare, termene și documente juridice.' },
      { key: 'archive', label: 'Arhivă', description: 'Arhivare și regăsire documente.' },
      { key: 'secretariat', label: 'Registratură & corespondență', description: 'Intrări/ieșiri documente și registre.' },
    ],
  },
  { title: 'OPȚIONAL', modules: [{ key: 'ai', label: 'AI Assistant', description: 'Asistent contextual peste datele organizației.' }] },
]

const COMMERCIAL_PACKAGES = [
  { key: 'core', label: 'Core', modules: ['documents', 'messaging', 'tickets'], description: 'Baza pentru documente, notificări, utilizatori și audit.' },
  { key: 'hr', label: 'HR', modules: ['hr', 'documents', 'messaging'], description: 'Angajați, pontaj, dosar personal, concedii și Kiosk.' },
  { key: 'operational', label: 'Operațional', modules: ['fleet', 'technical', 'field', 'logistics', 'controlling', 'documents'], description: 'Flotă, lucrări, teren, transport și controlling operațional.' },
  { key: 'gestiune_achizitii', label: 'Gestiune + Achiziții', modules: ['procurement', 'logistics', 'contract_management', 'documents', 'tickets'], description: 'Stocuri, referate, comenzi, recepții, transport, PAAP, contracte și furnizori.' },
  { key: 'accounting', label: 'Contabilitate', modules: ['accounting', 'controlling', 'contract_management', 'documents'], description: 'Contabilitate, declarații, dosar fiscal, contracte și costuri.' },
  { key: 'sales', label: 'Vânzări / CRM', modules: ['crm', 'documents', 'messaging', 'tickets'], description: 'Solicitări comerciale, oferte, comenzi și follow-up, conectate la documente și comunicare.' },
  { key: 'city_services', label: 'City Services', modules: ['sanitation', 'traffic_safety', 'snow_removal', 'environment', 'field', 'fleet', 'contract_management', 'tickets'], description: 'Servicii publice locale într-un pachet operațional.' },
  { key: 'enterprise', label: 'Enterprise', modules: ['fleet', 'technical', 'procurement', 'logistics', 'contract_management', 'crm', 'hr', 'controlling', 'accounting', 'sanitation', 'traffic_safety', 'environment', 'snow_removal', 'documents', 'messaging', 'tickets', 'field', 'legal', 'archive', 'secretariat', 'ai'], description: 'Toate modulele pentru organizații mari.' },
]

const BASE_MODULE_KEYS = new Set(['core', 'inventory', 'production', 'reports', 'system'])
const CATALOG_MODULE_KEYS = new Set(MODULE_GROUPS.flatMap(group => group.modules.map(module => module.key)))
const CONFIGURABLE_MODULE_KEYS = new Set([...CATALOG_MODULE_KEYS].filter(key => !BASE_MODULE_KEYS.has(key)))

const MODULE_ALIASES = Object.freeze({
  core: ['core', 'system'],
  inventory: ['inventory', 'stock', 'gestiune'],
  production: ['production', 'productie'],
  reports: ['reports', 'rapoarte'],
  fleet: ['fleet', 'mechanization', 'mecanizare'],
  technical: ['technical', 'technical_plus', 'asternere'],
  procurement: ['procurement', 'achizitii', 'acquisitions', 'referate'],
  logistics: ['logistics', 'logistica'],
  contract_management: ['contract_management', 'contracts', 'contracte'],
  crm: ['crm', 'sales', 'sales_automation'],
  hr: ['hr', 'human_resources'],
  controlling: ['controlling', 'cost_accounting'],
  accounting: ['accounting', 'contabilitate', 'anaf'],
  sanitation: ['sanitation', 'salubrizare'],
  traffic_safety: ['traffic_safety', 'trafficsafety'],
  environment: ['environment', 'mediu'],
  snow_removal: ['snow_removal', 'snowremoval', 'deszapezire'],
  documents: ['documents', 'documente'],
  messaging: ['messaging', 'messages', 'mesaje'],
  tickets: ['tickets', 'sesizari'],
  field: ['field', 'teren'],
  legal: ['legal', 'juridic'],
  archive: ['archive', 'arhiva'],
  secretariat: ['secretariat', 'registratura'],
  ai: ['ai', 'ai_assistant'],
})

const ALIAS_TO_MODULE = new Map(Object.entries(MODULE_ALIASES).flatMap(([canonical, aliases]) => aliases.map(alias => [alias, canonical])))

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function canonicalModuleKey(value) {
  const normalized = normalizeKey(value)
  if (['all', 'full'].includes(normalized)) return normalized
  return ALIAS_TO_MODULE.get(normalized) || (CATALOG_MODULE_KEYS.has(normalized) ? normalized : '')
}

function licenseModuleKeys(license = {}) {
  const values = [license.module, license.modules, license.addons]
    .flatMap(value => Array.isArray(value) ? value : [])
  return Array.from(new Set(values.map(canonicalModuleKey).filter(Boolean)))
}

function allModuleKeys() {
  return Array.from(new Set([...BASE_MODULE_KEYS, ...CATALOG_MODULE_KEYS]))
}

function allowedModulesForLicense(license = {}) {
  const licensed = licenseModuleKeys(license)
  if (!licensed.length || licensed.includes('all') || licensed.includes('full')) return allModuleKeys()
  return Array.from(new Set([...BASE_MODULE_KEYS, ...licensed.filter(key => CATALOG_MODULE_KEYS.has(key))]))
}

function effectiveEntitlements({ license = {}, settings = {} } = {}) {
  const allowed = allowedModulesForLicense(license)
  const allowedSet = new Set(allowed)
  const configured = Array.isArray(settings.modules_enabled)
    ? Array.from(new Set(settings.modules_enabled.map(canonicalModuleKey).filter(key => CONFIGURABLE_MODULE_KEYS.has(key))))
    : Array.from(CONFIGURABLE_MODULE_KEYS).filter(key => allowedSet.has(key))
  const enabled = configured.filter(key => allowedSet.has(key))
  return {
    allowed_modules: allowed,
    configured_modules: configured,
    effective_modules: Array.from(new Set([...BASE_MODULE_KEYS, ...enabled])),
    aliases: MODULE_ALIASES,
  }
}

function entitlementsForDb(db = {}, runtimeLicense = null) {
  const fallback = runtimeLicense || global.LICENTA || db?.settings?.license || {}
  const license = commercialDemoLicense(db, fallback)
  return effectiveEntitlements({ license, settings: db?.settings || {} })
}

module.exports = {
  MODULE_GROUPS,
  COMMERCIAL_PACKAGES,
  MODULE_ALIASES,
  BASE_MODULE_KEYS,
  CATALOG_MODULE_KEYS,
  CONFIGURABLE_MODULE_KEYS,
  canonicalModuleKey,
  licenseModuleKeys,
  allModuleKeys,
  allowedModulesForLicense,
  effectiveEntitlements,
  entitlementsForDb,
}
