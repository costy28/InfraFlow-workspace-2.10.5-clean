function parseBackup(backupJson) {
  let backup
  try {
    backup = typeof backupJson === 'string' ? JSON.parse(backupJson) : backupJson
  } catch {
    throwHttp(400, 'Fisierul nu este un JSON valid.')
  }
  if (!backup || typeof backup !== 'object') throwHttp(400, 'Backup invalid.')
  if (!backup.version || !backup.backupCreatedAt) {
    throwHttp(400, 'Backup invalid: lipsesc campurile version sau backupCreatedAt.')
  }
  return backup
}

function throwHttp(status, message) {
  const error = new Error(message)
  error.status = status
  throw error
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function backupDate(backup) {
  return String(backup.backupCreatedAt || '').slice(0, 10)
}

function sampleNames(items, picker) {
  return asArray(items)
    .slice(0, 4)
    .map(picker)
    .filter(Boolean)
}

function previewBackup(backupInput) {
  const backup = parseBackup(backupInput)
  return {
    utilizatori: asArray(backup.users).length,
    utilizatori_preview: sampleNames(backup.users, user => user.name || user.username),
    materiale: asArray(backup.materials).length,
    materiale_preview: sampleNames(backup.materials, material => material.name || material.id),
    retete: asArray(backup.recipes).length,
    retete_preview: sampleNames(backup.recipes, recipe => recipe.name || recipe.id),
    consumuri: asArray(backup.consumptions).length,
    miscari_stoc: asArray(backup.stockMovements).length,
    utilaje: asArray(backup.fleetAssets).length,
    utilaje_preview: sampleNames(backup.fleetAssets, asset => asset.registration || asset.name),
    centre_cost: asArray(backup.costCenters).length,
    centre_cost_preview: sampleNames(backup.costCenters, center => center.name || center.code),
    vanzari: asArray(backup.asphaltSales).length,
    backup_data: backupDate(backup)
  }
}

function normalizeMaterial(material) {
  return {
    ...material,
    id: String(material.id || material.cod || '').trim(),
    name: material.name || material.denumire || '',
    unit: material.unit || material.um || '',
    stock: Number(material.stock || material.stoc_curent || 0),
    alert: Number(material.alert || material.stoc_minim || 0),
    recipeMaterial: material.recipeMaterial === true,
    category: material.category || (material.recipeMaterial === true ? 'asfalt' : 'general')
  }
}

function normalizeUser(user) {
  const username = String(user.username || user.email || user.id || '').trim()
  return {
    ...user,
    id: user.id || `user-${username}`,
    name: user.name || user.nume || username,
    username,
    email: user.email || (username.includes('@') ? username : `${username || user.id}@example.local`),
    role: user.role || 'operator',
    active: user.active !== false,
    extern_id: user.extern_id || user.id,
    passwordHash: user.passwordHash || user.password_hash || user.parola_hash || ''
  }
}

function normalizeRecipe(recipe) {
  return {
    ...recipe,
    id: String(recipe.id || recipe.cod || '').trim(),
    name: recipe.name || recipe.denumire || '',
    version: Number(recipe.version || recipe.versiune || 1),
    percentages: recipe.percentages || recipe.procente || {},
    updatedAt: recipe.updatedAt || recipe.updated_at || new Date().toISOString()
  }
}

function normalizeCostCenter(center) {
  return {
    ...center,
    id: center.id || `costcenter-${center.code || center.cod}`,
    code: center.code || center.cod || '',
    name: center.name || center.denumire || '',
    type: center.type || center.tip || 'department',
    active: center.active !== false
  }
}

function normalizeFleetAsset(asset) {
  return {
    ...asset,
    id: asset.id || `fleet-${asset.registration || asset.nr_inmatriculare}`,
    registration: asset.registration || asset.nr_inmatriculare || '',
    name: asset.name || asset.denumire || asset.type || '',
    brand: asset.brand || asset.marca || '',
    model: asset.model || '',
    vin: asset.vin || asset.serie_sasiu || '',
    year: Number(asset.year || asset.an_fabricatie || 0),
    currentMeter: Number(asset.currentMeter || asset.valoare_curenta || 0),
    active: asset.active !== false
  }
}

async function importSettings(settings, backup, db) {
  db.settings = {
    ...(db.settings || {}),
    ...(settings || {}),
    setupCompleted: true,
    initialStockCompleted: true,
    legacy_import_completed: true,
    legacy_import_completed_at: new Date().toISOString(),
    legacy_backup_version: backup.version,
    legacy_backup_created_at: backup.backupCreatedAt
  }
}

async function importUsers(users, db) {
  db.users = asArray(users).map(normalizeUser)
  return new Map(db.users.map(user => [String(user.extern_id || user.id), user.id]))
}

async function importMaterials(materials, db) {
  db.materials = asArray(materials).map(normalizeMaterial)
  return new Map(db.materials.map(material => [String(material.id), material.id]))
}

async function importRecipes(recipes, materialMap, db) {
  db.recipes = asArray(recipes).map(normalizeRecipe)
  return new Map(db.recipes.map(recipe => [String(recipe.id), recipe.id]))
}

async function importCostCenters(costCenters, db) {
  db.costCenters = asArray(costCenters).map(normalizeCostCenter)
}

async function importFleetAssets(fleetAssets, db) {
  db.fleetAssets = asArray(fleetAssets).map(normalizeFleetAsset)
}

async function importStockMovements(stockMovements, materialMap, userMap, db) {
  db.stockMovements = asArray(stockMovements).map(movement => ({ ...movement }))
}

async function importConsumptions(consumptions, recipeMap, userMap, db) {
  db.consumptions = asArray(consumptions).map(consumption => ({ ...consumption }))
}

async function importAsphaltSales(asphaltSales, recipeMap, userMap, db) {
  db.asphaltSales = asArray(asphaltSales).map(sale => ({ ...sale }))
}

async function importFromBackup(backupJson, db) {
  const backup = parseBackup(backupJson)
  const result = {
    utilizatori: 0, materiale: 0, retete: 0,
    consumuri: 0, miscari_stoc: 0, utilaje: 0,
    centre_cost: 0, vanzari: 0, erori: []
  }

  await importSettings(backup.settings, backup, db)

  const userMap = await importUsers(backup.users, db)
  result.utilizatori = asArray(backup.users).length

  const materialMap = await importMaterials(backup.materials, db)
  result.materiale = asArray(backup.materials).length

  const recipeMap = await importRecipes(backup.recipes, materialMap, db)
  result.retete = asArray(backup.recipes).length

  await importCostCenters(backup.costCenters, db)
  result.centre_cost = asArray(backup.costCenters).length

  await importFleetAssets(backup.fleetAssets, db)
  result.utilaje = asArray(backup.fleetAssets).length

  const sortedMovements = asArray(backup.stockMovements)
    .map(movement => ({ ...movement }))
    .sort((a, b) => new Date(a.date || a.createdAt || 0) - new Date(b.date || b.createdAt || 0))
  await importStockMovements(sortedMovements, materialMap, userMap, db)
  result.miscari_stoc = asArray(backup.stockMovements).length

  await importConsumptions(backup.consumptions, recipeMap, userMap, db)
  result.consumuri = asArray(backup.consumptions).length

  await importAsphaltSales(backup.asphaltSales, recipeMap, userMap, db)
  result.vanzari = asArray(backup.asphaltSales).length

  db.deliveries = asArray(backup.deliveries).map(item => ({ ...item }))
  db.productionPlans = asArray(backup.productionPlans).map(item => ({ ...item }))
  db.departmentRequests = asArray(backup.departmentRequests).map(item => ({ ...item }))
  db.devices = asArray(backup.devices).map(item => ({ ...item }))
  db.fleetRequests = asArray(backup.fleetRequests).map(item => ({ ...item }))
  db.fleetMeterReadings = asArray(backup.fleetMeterReadings).map(item => ({ ...item }))
  db.technicalWorkLogs = asArray(backup.technicalWorkLogs).map(item => ({ ...item }))
  db.nexusExpenses = asArray(backup.nexusExpenses).map(item => ({ ...item }))
  db.procurementOrders = asArray(backup.procurementOrders).map(item => ({ ...item }))
  db.procurementReceipts = asArray(backup.procurementReceipts).map(item => ({ ...item }))
  db.audit = asArray(backup.audit).map(item => ({ ...item }))
  db.backupCreatedAt = backup.backupCreatedAt

  return result
}

module.exports = {
  importFromBackup,
  previewBackup,
  parseBackup
}
