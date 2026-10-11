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

export const moduleAccess = Object.fromEntries(
  Object.entries(modulePermissionPrefixes).map(([key, prefixes]) => [key, { anyPrefix: prefixes }]),
)

// Contract Management has its own boundary even though contract references can
// be displayed from Procurement, CRM or Accounting records.
moduleAccess.contractManagement = { anyOf: ['legal:contracts', 'legal:manage'] }

export function permissionMatchesPrefix(permission, prefix) {
  return permission === prefix || permission.startsWith(`${prefix}:`) || permission.startsWith(`${prefix}_`)
}

export function canAccess(user, requirement) {
  const roles = Array.isArray(user?.roles) ? user.roles : []
  if ([user?.role, ...roles].some(role => ['superadmin', 'admin'].includes(role))) return true
  if (!requirement) return true

  const permissions = Array.isArray(user?.permissions) ? user.permissions : []
  const rule = typeof requirement === 'string' || Array.isArray(requirement)
    ? { anyOf: Array.isArray(requirement) ? requirement : [requirement] }
    : requirement
  const anyOf = Array.isArray(rule.anyOf) ? rule.anyOf : []
  const anyPrefix = Array.isArray(rule.anyPrefix) ? rule.anyPrefix : []

  return anyOf.some(permission => permissions.includes(permission)) ||
    anyPrefix.some(prefix => permissions.some(permission => permissionMatchesPrefix(permission, prefix)))
}
