'use strict'

const requiredArrays = ['users', 'materials', 'recipes', 'consumptions', 'deliveries',
  'stockMovements', 'productionPlans', 'audit', 'departmentRequests',
  'departmentStocks', 'departmentConsumptions']
const legacyOptionalArrays = ['jobs', 'projects', 'departmentConnections', 'workflowTemplates',
  'workflowRequests', 'workflowAudit', 'procurementOrders', 'procurementReceipts',
  'fleetAssets', 'fleetRequests', 'fleetMeterReadings', 'costCenters', 'technicalWorkLogs',
  'technicalClients', 'asphaltSales', 'nexusExpenses', 'devices', 'workstationRequests']

function invalid(message = 'Backup invalid.') {
  const error = new Error(message)
  error.status = 400
  throw error
}

function validateRestoreData(data) {
  // Backup is a JSON snapshot, not a settings-edit request. Preserve all domains
  // and encrypted values; never rebuild it through a legacy field allowlist.
  function checkJson(value, depth = 0) {
    if (depth > 100) invalid('Backup invalid: structură prea adâncă.')
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return
    if (typeof value === 'number' && Number.isFinite(value)) return
    if (!value || typeof value !== 'object') invalid()
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) invalid()
    for (const key of Object.keys(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) invalid('Backup invalid: cheie nesigură.')
      checkJson(value[key], depth + 1)
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) invalid()
  checkJson(data)
  for (const key of requiredArrays) if (!Array.isArray(data[key])) invalid(`Backup invalid: lipsește ${key}.`)
  if (!data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)) invalid('Backup invalid: lipsesc setările.')
  for (const key of legacyOptionalArrays) {
    if (Object.hasOwn(data, key) && !Array.isArray(data[key])) invalid(`Backup invalid: ${key} trebuie să fie listă.`)
  }
  if (data.version !== undefined && (!Number.isFinite(Number(data.version)) || Number(data.version) < 1)) invalid('Backup invalid: versiune invalidă.')
  const restored = JSON.parse(JSON.stringify(data))
  restored.version = Number(data.version || 1)
  for (const key of legacyOptionalArrays) if (!Object.hasOwn(restored, key)) restored[key] = []
  return restored
}

module.exports = { validateRestoreData }
