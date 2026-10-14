// Single source of truth for client-side navigation visibility. This is a UX
// guard only; every API action must remain protected by its server permission.
export const modulePermissionPrefixes = {
  hr: ['hr', 'echipamente'],
  inventory: ['inventory', 'gestiune', 'materials', 'stock_operations', 'ledger', 'deliveries'],
  production: ['production', 'consumptions', 'recipes', 'planning', 'daily_report', 'period_report', 'accounting_report'],
  procurement: ['procurement', 'procurement_orders'],
  logistics: ['logistics'],
  contractManagement: ['legal', 'procurement', 'accounting', 'controlling', 'cost_accounting'],
  referate: ['referate'],
  accounting: ['accounting', 'anaf', 'integration', 'cost_accounting', 'controlling'],
  crm: ['crm'],
  mechanization: ['mechanization'],
  technical: ['technical', 'cost_accounting'],
  field: ['field'],
  sanitation: ['sanitation'],
  trafficSafety: ['traffic_safety'],
  snowRemoval: ['snow_removal'],
  environment: ['environment'],
  legal: ['legal'],
  archive: ['archive'],
  secretariat: ['secretariat'],
  documents: ['documents'],
  messaging: ['messaging'],
  tickets: ['tickets'],
  integration: ['integration'],
  ai: ['ai'],
  anaf: ['anaf'],
  asternere: ['asternere'],
}

// Modulul canonic trebuie verificat separat de permisiunile punctuale. Un
// utilizator poate avea, de exemplu, permisiuni HR self-service fără ca
// organizația să aibă modulul HR activ în licență/configurație.
export const accessModuleKeys = {
  hr: 'hr',
  inventory: 'inventory',
  production: 'production',
  procurement: 'procurement',
  logistics: 'logistics',
  contractManagement: 'contract_management',
  referate: 'procurement',
  accounting: 'accounting',
  crm: 'crm',
  mechanization: 'fleet',
  technical: 'technical',
  field: 'field',
  sanitation: 'sanitation',
  trafficSafety: 'traffic_safety',
  snowRemoval: 'snow_removal',
  environment: 'environment',
  legal: 'legal',
  archive: 'archive',
  secretariat: 'secretariat',
  documents: 'documents',
  messaging: 'messaging',
  tickets: 'tickets',
  ai: 'ai',
  anaf: 'accounting',
  asternere: 'technical',
}

export const moduleAccess = Object.fromEntries(
  Object.entries(modulePermissionPrefixes).map(([key, prefixes]) => [
    key,
    { anyPrefix: prefixes, ...(accessModuleKeys[key] ? { moduleKey: accessModuleKeys[key] } : {}) },
  ]),
)

// Contract Management has its own boundary even though contract references can
// be displayed from Procurement, CRM or Accounting records.
moduleAccess.contractManagement = {
  anyOf: ['legal:contracts', 'legal:manage'],
  moduleKey: accessModuleKeys.contractManagement,
}

export function permissionMatchesPrefix(permission, prefix) {
  return permission === prefix || permission.startsWith(`${prefix}:`) || permission.startsWith(`${prefix}_`)
}

export function canAccess(user, requirement) {
  if (!requirement) return true

  const rule = typeof requirement === 'string' || Array.isArray(requirement)
    ? { anyOf: Array.isArray(requirement) ? requirement : [requirement] }
    : requirement
  const effectiveModules = user?.entitlements?.effective_modules
  if (rule?.moduleKey && Array.isArray(effectiveModules) && !effectiveModules.includes(rule.moduleKey)) return false

  const roles = Array.isArray(user?.roles) ? user.roles : []
  if ([user?.role, ...roles].some(role => ['superadmin', 'admin'].includes(role))) return true

  const permissions = Array.isArray(user?.permissions) ? user.permissions : []
  const anyOf = Array.isArray(rule.anyOf) ? rule.anyOf : []
  const anyPrefix = Array.isArray(rule.anyPrefix) ? rule.anyPrefix : []

  return anyOf.some(permission => permissions.includes(permission)) ||
    anyPrefix.some(prefix => permissions.some(permission => permissionMatchesPrefix(permission, prefix)))
}
