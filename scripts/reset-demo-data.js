/**
 * Reset date tranzactionale demo.
 * Pastreaza: users, departments, settings, materials, fleet assets, employees, roles.
 */
const path = require('path')
const fs = require('fs')
const childProcess = require('child_process')

const ROOT = path.join(__dirname, '..')
const DEMO_DB_NAME = process.env.INFRAFLOW_DEMO_DB_FILE || process.env.INFRAFLOW_DB_FILE || 'app-db.demo.json'
const DB_FILE = path.isAbsolute(DEMO_DB_NAME) ? DEMO_DB_NAME : path.join(ROOT, 'data', DEMO_DB_NAME)
const SEED_SCRIPT = path.join(ROOT, 'scripts', 'seed-demo.js')

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

function resetDemo() {
  if (!fs.existsSync(DB_FILE)) {
    childProcess.execFileSync(process.execPath, [SEED_SCRIPT], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, INFRAFLOW_DEMO_DB_FILE: DEMO_DB_NAME } })
    return
  }

  const before = readJson(DB_FILE)
  childProcess.execFileSync(process.execPath, [SEED_SCRIPT], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, INFRAFLOW_DEMO_DB_FILE: DEMO_DB_NAME } })
  const regenerated = readJson(DB_FILE)

  const persistent = [
    'company',
    'settings',
    'users',
    'roles',
    'departments',
    'permissions',
    'role_permissions',
    'cost_centers',
    'costCenters',
    'employees',
    'fleetAssets',
    'materials',
    'suppliers',
    'clients',
    'projects',
    'recipes',
    'environment_reports',
    'devices',
    'workstationRequests'
  ]

  persistent.forEach((key) => {
    if (before[key] !== undefined) regenerated[key] = before[key]
  })

  regenerated.hr = { ...(regenerated.hr || {}), employees: regenerated.employees }
  regenerated.fleet = { ...(regenerated.fleet || {}), assets: regenerated.fleetAssets }
  regenerated.inventory = { ...(regenerated.inventory || {}), materials: regenerated.materials }
  regenerated.work = { ...(regenerated.work || {}), projects: regenerated.projects }
  regenerated.environment = { ...(regenerated.environment || {}), reports: regenerated.environment_reports }

  regenerated._demo_reset_at = new Date().toISOString()
  writeJson(DB_FILE, regenerated)
  console.log('Reset tranzactional finalizat la', regenerated._demo_reset_at)
}

resetDemo()
