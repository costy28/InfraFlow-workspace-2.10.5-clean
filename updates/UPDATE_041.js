const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const DB_FILE = path.join(ROOT, 'data', 'app-db.json')

function normalizeAsset(asset = {}) {
  if (asset.consum_orar_normat === undefined) asset.consum_orar_normat = asset.consumOrarNormat ?? asset.consum_orar ?? asset.standardConsumptionHour ?? null
  if (asset.consum_normat_km === undefined) asset.consum_normat_km = asset.consumNormatKm ?? asset.standardConsumption ?? null
  if (asset.tip_combustibil === undefined) asset.tip_combustibil = asset.fuelType || asset.combustibil || ''
  if (asset.gps_device_id === undefined) asset.gps_device_id = asset.gpsDeviceId || ''
  if (asset.sofer_principal_id === undefined) asset.sofer_principal_id = asset.driverId || asset.sofer_id || null
  return asset
}

function run() {
  if (!fs.existsSync(DB_FILE)) return { ok: true, message: 'app-db.json lipseste; structura va fi creata la prima pornire.' }
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))
  db.fleetAssetDrivers = Array.isArray(db.fleetAssetDrivers) ? db.fleetAssetDrivers : []
  db.fleetAssetFiles = Array.isArray(db.fleetAssetFiles) ? db.fleetAssetFiles : []
  db.fleetAssets = Array.isArray(db.fleetAssets) ? db.fleetAssets.map(normalizeAsset) : []
  db.fleet = db.fleet && typeof db.fleet === 'object' ? db.fleet : {}
  db.fleet.assetDrivers = db.fleetAssetDrivers
  db.fleet.assetFiles = db.fleetAssetFiles
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8')
  return {
    ok: true,
    assets: db.fleetAssets.length,
    drivers: db.fleetAssetDrivers.length,
    files: db.fleetAssetFiles.length
  }
}

if (require.main === module) {
  console.log(JSON.stringify(run(), null, 2))
}

module.exports = { run }
