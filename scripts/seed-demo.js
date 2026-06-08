/**
 * Genereaza data/app-db.json complet cu date demo pentru InfraFlow.
 * Rulare: node scripts/seed-demo.js
 */
const path = require('path')
const fs = require('fs')
const { hashPassword } = require('../server/core/auth')

const ROOT = path.join(__dirname, '..')
const DB_FILE = path.join(ROOT, 'data', 'app-db.json')
const SEED_FILE = path.join(ROOT, 'data', 'demo-seed.json')

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function localDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDays(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return localDate(date)
}

function isoDaysAgo(days, hour = 8) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}

function pick(list, index) {
  return list[index % list.length]
}

function withFleetDueDates(assets) {
  const rcaOffsets = [-12, -4, 18, 23, 27, 44, 61, 75, 92, 110, 130, 150]
  const itpOffsets = [-18, 16, 22, 29, 45, 67, 88, 104, 120, 144, 166, 180]
  return assets.map((asset, index) => ({
    ...asset,
    active: true,
    department: asset.costCenterId === 'DEP-SALUB' ? 'Salubrizare' : 'Mecanizare',
    insurance_expiry: addDays(pick(rcaOffsets, index)),
    itp_expiry: addDays(pick(itpOffsets, index)),
    iscir_expiry: asset.category === 'equipment' ? addDays(pick([20, 48, 95, 130, -9], index)) : null,
    currentMeter: asset.odometer_km || asset.ore_motor || 0,
    meterUnit: asset.category === 'vehicle' ? 'km' : 'hours',
    nextServiceDate: addDays(pick([12, 28, 42, -6, 65, 90], index)),
    nextInspectionDate: asset.category === 'vehicle' ? addDays(pick(itpOffsets, index)) : addDays(pick([20, 48, 95, 130, -9], index)),
    nextServiceMeter: Number(asset.odometer_km || asset.ore_motor || 0) + pick([250, 430, -35, 700, 120], index),
    alertDays: 30,
    alertMeter: asset.category === 'vehicle' ? 500 : 50,
    costCenterName: asset.costCenterId || ''
  }))
}

function buildStockEntries(materials) {
  return materials.map((material, index) => ({
    id: `STK-${String(index + 1).padStart(3, '0')}`,
    materialId: material.id,
    materialName: material.name,
    amount: material.stock,
    unit: material.unit,
    type: 'opening_stock',
    date: addDays(-30),
    createdAt: isoDaysAgo(30, 7)
  }))
}

function buildStockOperations(materials) {
  return materials.slice(0, 18).map((material, index) => {
    const amount = index % 3 === 0 ? -Math.max(1, Math.round(Number(material.stock || 10) * 0.08)) : Math.max(1, Math.round(Number(material.stock || 10) * 0.12))
    return {
      id: `MOV-${String(index + 1).padStart(3, '0')}`,
      materialId: material.id,
      materialName: material.name,
      amount,
      unit: material.unit,
      type: amount > 0 ? 'manual_in' : 'manual_out',
      reason: amount > 0 ? 'Aprovizionare demo' : 'Consum lucrare demo',
      date: addDays(-index - 1),
      createdAt: isoDaysAgo(index + 1, 10)
    }
  })
}

function buildTripLogs(seed) {
  const destinations = [
    'Santier DJ207B km 3+500, Piatra-Neamt',
    'Statia asfalt - depozit agregate',
    'Str. Mihail Kogalniceanu',
    'DN15 Piatra-Neamt - marcaje',
    'Depozit materiale Savinesti'
  ]
  const vehicles = seed.fleet_assets.filter((asset) => asset.category === 'vehicle').slice(0, 8)
  const drivers = seed.employees.filter((employee) => /sofer/i.test(employee.functie)).map((employee) => employee.id)
  return Array.from({ length: 30 }, (_, index) => {
    const vehicle = pick(vehicles, index)
    const km = 38 + (index * 7) % 86
    const start = Number(vehicle.odometer_km || 40000) + index * 120
    return {
      id: `fp-${String(index + 1).padStart(3, '0')}`,
      uuid: `fp-${String(index + 1).padStart(3, '0')}`,
      nr_foaie: `FP-2026-${String(index + 1).padStart(4, '0')}`,
      data: addDays(-29 + index),
      date: addDays(-29 + index),
      vehicul_id: vehicle.id,
      assetId: vehicle.id,
      asset_id: vehicle.id,
      sofer_id: pick(drivers, index),
      driverId: pick(drivers, index),
      sofer_text: pick(['Ion Popescu', 'Gheorghe Constantin'], index),
      km_plecare: start,
      km_sosire: start + km,
      km_parcursi: km,
      destination: pick(destinations, index),
      destinatie: pick(destinations, index),
      scopul_deplasarii: index % 2 ? 'Transport materiale' : 'Transport balast',
      marfa: index % 2 ? 'Mixtura asfaltica' : 'Criblura 4-8mm',
      tone: 18 + (index % 6),
      combustibil_start: 180 - (index % 20),
      combustibil_sfarsit: 145 - (index % 12),
      combustibil_adaugat: index % 9 === 0 ? 120 : 0,
      combustibil_sold_initial: 180 - (index % 20),
      combustibil_primit: index % 9 === 0 ? 120 : 0,
      combustibil_sold_final: 145 - (index % 12),
      consum_normat: Math.round(km * 0.38),
      status: index > 27 ? 'deschisa' : 'inchisa',
      cost_center_id: 'DEP-MECAN',
      created_at: isoDaysAgo(29 - index, 6)
    }
  })
}

function buildGps(seed) {
  const assets = seed.fleet_assets.slice(0, 15)
  return assets.map((asset, index) => ({
    id: `gps-${String(index + 1).padStart(3, '0')}`,
    asset_id: asset.id,
    vehicle_id: asset.id,
    name: asset.registration || asset.name,
    lat: Number((46.9 + (index % 8) * 0.006).toFixed(6)),
    lng: Number((26.35 + (index % 7) * 0.01).toFixed(6)),
    status: pick(['in_lucru', 'stationat', 'in_tranzit'], index),
    speed: index % 3 === 1 ? 0 : 24 + index,
    timestamp: isoDaysAgo(0, Math.max(1, 23 - index))
  }))
}

function buildReferate(seed) {
  const titles = [
    'Necesitate achizitie filtre motor pentru parcul auto',
    'Aprovizionare bitum pentru programul de asfaltare',
    'Echipamente SSM pentru sezonul de vara',
    'Piese schimb pentru finisor asfalt',
    'Vopsea marcaj rutier pentru DN15',
    'Motorina pentru utilaje mecanizare',
    'Material antiderapant pentru stoc preventiv'
  ]
  return titles.map((title, index) => ({
    id: `ref-${String(index + 1).padStart(3, '0')}`,
    nr_referat: `REFNEC-2026-${String(12 + index).padStart(4, '0')}`,
    titlu: title,
    departament: index % 3 === 0 ? 'Mecanizare' : index % 3 === 1 ? 'Achizitii' : 'Gestiune',
    solicitant: index % 2 ? 'sef.gestiune' : 'sef.mecanizare',
    status: pick(['aprobat', 'in_circuit', 'draft', 'aprobat', 'respins'], index),
    prioritate: index === 5 ? 'ridicata' : 'normal',
    valoare_estimata: [2800, 82000, 6400, 12800, 18500, 54000, 22000][index],
    created_at: isoDaysAgo(18 - index, 9),
    approved_at: index % 3 === 0 ? isoDaysAgo(17 - index, 14) : null
  }))
}

function buildProcurementOrders(seed) {
  const suppliers = seed.suppliers
  const materials = seed.materials
  return Array.from({ length: 10 }, (_, index) => {
    const material = pick(materials, index)
    return {
      id: `PO-${String(index + 1).padStart(3, '0')}`,
      orderNo: `CMD-2026-${String(101 + index).padStart(4, '0')}`,
      supplierId: pick(suppliers, index).id,
      supplierName: pick(suppliers, index).name,
      materialId: material.id,
      materialName: material.name,
      quantity: 10 + index * 3,
      unit: material.unit,
      unitPrice: [6.2, 3200, 185, 210, 4.7, 38][index % 6],
      status: pick(['draft', 'sent', 'received', 'closed'], index),
      estimatedDate: addDays(-12 + index),
      createdAt: isoDaysAgo(20 - index, 11)
    }
  })
}

function buildTimesheets(seed) {
  const employees = seed.employees
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const rows = []
  employees.forEach((employee) => {
    for (let day = 1; day <= 20; day += 1) {
      const date = new Date(year, month, day)
      const weekend = [0, 6].includes(date.getDay())
      rows.push({
        id: `TS-${employee.id}-${String(day).padStart(2, '0')}`,
        employee_id: employee.id,
        employeeName: employee.name,
        date: localDate(date),
        ore_lucrate: weekend ? 0 : 8,
        hours: weekend ? 0 : 8,
        tip: weekend ? 'liber' : (day === 9 && employee.id === 'EMP-006' ? 'co' : 'prezenta'),
        cost_center: employee.departmentId === 'DEP-002' ? 'DEP-MECAN' : employee.departmentId === 'DEP-008' ? 'DEP-SALUB' : 'DEP-TEHNIC'
      })
    }
  })
  return rows
}

function buildNotifications() {
  return [
    { id: 'notif-001', tip: 'alerta_doc', type: 'alerta_doc', mesaj: 'RCA VEH-002 expirat acum 4 zile!', message: 'RCA VEH-002 expirat acum 4 zile!', urgenta: 'critica', read: false, created_at: isoDaysAgo(1, 8) },
    { id: 'notif-002', tip: 'alerta_doc', type: 'alerta_doc', mesaj: 'ITP UTIL-001 expira in 18 zile.', message: 'ITP UTIL-001 expira in 18 zile.', urgenta: 'ridicata', read: false, created_at: isoDaysAgo(1, 9) },
    { id: 'notif-003', tip: 'alerta_stoc', type: 'alerta_stoc', mesaj: 'Stoc Bitum 50/70 aproape de limita minima.', message: 'Stoc Bitum 50/70 aproape de limita minima.', urgenta: 'ridicata', read: false, created_at: isoDaysAgo(2, 10) },
    { id: 'notif-004', tip: 'aprobare', type: 'aprobare', mesaj: 'Referatul REFNEC-2026-0015 asteapta aprobarea ta.', message: 'Referatul REFNEC-2026-0015 asteapta aprobarea ta.', urgenta: 'normala', read: false, created_at: isoDaysAgo(2, 13) },
    { id: 'notif-005', tip: 'info', type: 'info', mesaj: 'Foaia de parcurs FP-2026-0031 a fost inchisa de Ion Popescu.', message: 'Foaia de parcurs FP-2026-0031 a fost inchisa de Ion Popescu.', urgenta: 'scazuta', read: true, created_at: isoDaysAgo(3, 15) },
    { id: 'notif-006', tip: 'alerta_hr', type: 'alerta_hr', mesaj: '3 autorizatii HR expira in urmatoarele 30 zile.', message: '3 autorizatii HR expira in urmatoarele 30 zile.', urgenta: 'normala', read: false, created_at: isoDaysAgo(4, 12) },
    { id: 'notif-007', tip: 'mediu', type: 'mediu', mesaj: 'Raportul deseuri luna curenta este in lucru.', message: 'Raportul deseuri luna curenta este in lucru.', urgenta: 'scazuta', read: true, created_at: isoDaysAgo(5, 9) },
    { id: 'notif-008', tip: 'controlling', type: 'controlling', mesaj: 'Centrul SUB-BASC a consumat 78% din bugetul lunar.', message: 'Centrul SUB-BASC a consumat 78% din bugetul lunar.', urgenta: 'normala', read: false, created_at: isoDaysAgo(5, 14) },
    { id: 'notif-009', tip: 'chat', type: 'chat', mesaj: 'Mesaj nou in #mecanizare.', message: 'Mesaj nou in #mecanizare.', urgenta: 'scazuta', read: false, created_at: isoDaysAgo(0, 11) },
    { id: 'notif-010', tip: 'achizitii', type: 'achizitii', mesaj: 'Comanda CMD-2026-0104 este gata de receptie.', message: 'Comanda CMD-2026-0104 este gata de receptie.', urgenta: 'normala', read: false, created_at: isoDaysAgo(1, 16) }
  ]
}

function buildMessaging() {
  const channels = [
    { id: 'ch-001', tip: 'departament', type: 'departament', nume: '#mecanizare', name: '#mecanizare', members: ['sef.mecanizare', 'sofer1', 'sofer2'] },
    { id: 'ch-002', tip: 'departament', type: 'departament', nume: '#gestiune', name: '#gestiune', members: ['sef.gestiune', 'gestionar'] },
    { id: 'ch-003', tip: 'direct', type: 'direct', nume: 'director - sef.mecanizare', name: 'director - sef.mecanizare', members: ['director', 'sef.mecanizare'] }
  ]
  const samples = [
    'Am incarcat foile de parcurs pe ziua de azi.',
    'Confirm receptia materialelor, verific cantitatile.',
    'Trimitem autobasculanta la DJ207B dupa ora 11.',
    'Referatul pentru filtre este in aprobare.',
    'Verificam stocul de motorina la final de schimb.',
    'Programarea pentru finisor ramane valabila.'
  ]
  const messages = channels.flatMap((channel, channelIndex) =>
    Array.from({ length: 6 }, (_, index) => ({
      id: `msg-${channel.id}-${index + 1}`,
      channel_id: channel.id,
      channelId: channel.id,
      author: pick(channel.members, index),
      userName: pick(channel.members, index),
      text: pick(samples, index + channelIndex),
      created_at: isoDaysAgo(3 - Math.floor(index / 2), 8 + index)
    }))
  )
  return { channels, messages }
}

function buildCostEntries() {
  const month = new Date().toISOString().slice(0, 7) + '-01'
  return [
    { id: 'cost-001', cost_center_id: 'SUB-BASC', categorie: 'combustibil', descriere: 'Motorina autobasculante', valoare: 18400, data: addDays(-8), luna: month, validat: true },
    { id: 'cost-002', cost_center_id: 'SUB-FINISOR', categorie: 'mentenanta', descriere: 'Revizie finisor asfalt', valoare: 6200, data: addDays(-11), luna: month, validat: true },
    { id: 'cost-003', cost_center_id: 'DEP-SALUB', categorie: 'materiale', descriere: 'Consumabile salubrizare', valoare: 9800, data: addDays(-6), luna: month, validat: true },
    { id: 'cost-004', cost_center_id: 'DEP-TEHNIC', categorie: 'materiale', descriere: 'Marcaje si indicatoare', valoare: 4300, data: addDays(-3), luna: month, validat: true }
  ]
}

function buildDb(seed) {
  const passwordHash = hashPassword('demo123')
  const users = seed.users.map((user) => ({ ...user, passwordHash, createdAt: isoDaysAgo(20, 8) }))
  const fleetAssets = withFleetDueDates(seed.fleet_assets)
  const costCenters = seed.cost_centers.map((center) => ({
    ...center,
    cod: center.cod || center.code || center.id,
    denumire: center.denumire || center.name,
    name: center.name || center.denumire,
    buget_lunar: Number(center.buget_lunar || center.monthly_budget || 0),
    buget_anual: Number(center.buget_anual || center.monthly_budget * 12 || 0),
    activ: center.activ !== false,
    nivel: center.parent_id ? 2 : 1,
    parinte_id: center.parent_id || null
  }))
  const stockEntries = buildStockEntries(seed.materials)
  const stockOperations = buildStockOperations(seed.materials)
  const tripLogs = buildTripLogs(seed)
  const gpsPositions = buildGps(seed)
  const referate = buildReferate(seed)
  const procurementOrders = buildProcurementOrders(seed)
  const timesheets = buildTimesheets(seed)
  const messaging = buildMessaging()
  const db = {
    company: seed.company,
    settings: seed.settings,
    users,
    roles: [],
    departments: seed.departments,
    permissions: [],
    role_permissions: [],
    cost_centers: costCenters,
    costCenters,
    employees: seed.employees,
    hr: { employees: seed.employees, timesheets, leaveRequests: [], authorizations: [], contracts: [] },
    fleetAssets,
    fleet: { assets: fleetAssets, tripLogs },
    fleetTripLogs: tripLogs,
    materials: seed.materials.map((material) => ({ ...material, stoc_curent: material.stock, stockMin: material.alert })),
    inventory: {
      materials: seed.materials,
      movements: stockOperations,
      stockOperations,
      department_stocks: [],
      stock_transfers: [],
      department_consumptions: []
    },
    stock_entries: stockEntries,
    stockEntries,
    stock_operations: stockOperations,
    stockMovements: stockOperations,
    suppliers: seed.suppliers,
    clients: [],
    projects: seed.projects,
    work: { projects: seed.projects },
    recipes: [
      { id: 'REC-001', name: 'BA16 rul 50/70', active: true },
      { id: 'REC-002', name: 'BAD22.4 leg 50/70', active: true }
    ],
    environment_reports: seed.environment_reports,
    environment: { reports: seed.environment_reports },
    procurement_orders: procurementOrders,
    procurementOrders,
    procurement_requirements: referate,
    consumptions: [
      { id: 'cons-001', date: addDays(-5), recipeId: 'REC-001', recipeName: 'BA16 rul 50/70', asphalt: 86, jobName: 'DJ207B', createdAt: isoDaysAgo(5, 13) },
      { id: 'cons-002', date: addDays(-3), recipeId: 'REC-002', recipeName: 'BAD22.4 leg 50/70', asphalt: 54, jobName: 'MARC-DN15', createdAt: isoDaysAgo(3, 12) }
    ],
    department_consumptions: [],
    fleet_work_logs: [
      { id: 'fwl-001', assetId: 'UTIL-005', assetName: 'Finisor asfalt Vogele S1800', date: addDays(-4), hours: 7.5, jobName: 'DJ207B', costCenterId: 'SUB-FINISOR' },
      { id: 'fwl-002', assetId: 'UTIL-001', assetName: 'Excavator Liebherr R926', date: addDays(-2), hours: 6, jobName: 'Canalizare Str. Mihail Kogalniceanu', costCenterId: 'SUB-EXC3' }
    ],
    technicalWorkLogs: [],
    fleetRequests: [
      { id: 'fr-001', assetId: 'VEH-001', date: addDays(1), startTime: '07:00', endTime: '15:00', department: 'Tehnic', jobName: 'Transport agregate DJ207B', status: 'approved', createdAt: isoDaysAgo(1, 10) },
      { id: 'fr-002', assetId: 'UTIL-005', date: addDays(2), startTime: '08:00', endTime: '16:00', department: 'Tehnic', jobName: 'Asternere BA16', status: 'planned', createdAt: isoDaysAgo(0, 9) }
    ],
    fleet_requests: [],
    timesheets,
    leave_requests: [
      { id: 'leave-001', employee_id: 'EMP-006', type: 'co', from: addDays(8), to: addDays(12), status: 'aprobat' }
    ],
    trip_logs: tripLogs,
    gps_positions: gpsPositions,
    referate,
    notifications: buildNotifications(),
    audit: [
      { id: 'audit-001', action: 'demo_seed', details: 'Date demo generate', createdAt: new Date().toISOString(), userName: 'Sistem' }
    ],
    messages: messaging.messages,
    message_channels: messaging.channels,
    messaging: { channels: messaging.channels, messages: messaging.messages },
    department_requests: [
      { id: 'dr-001', type: 'material', itemName: 'Criblura 4-8mm', amount: 45, unit: 'tone', department: 'Tehnic', status: 'planned', jobName: 'DJ207B', createdAt: isoDaysAgo(7, 9) }
    ],
    documents: [],
    cost_entries: buildCostEntries(),
    controlling: { costCenters, costEntries: buildCostEntries(), entries: buildCostEntries(), costCenterObjects: [] },
    paap: [],
    paapExecutie: [],
    devices: [],
    workstationRequests: [],
    _demo_mode: true,
    _seed_version: '2.12.19',
    _seeded_at: new Date().toISOString()
  }
  return db
}

ensureDir(path.join(ROOT, 'data'))
ensureDir(path.join(ROOT, 'logs'))

if (!fs.existsSync(SEED_FILE)) {
  console.error('EROARE: data/demo-seed.json nu exista.')
  process.exit(1)
}

const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'))
const db = buildDb(seed)
fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8')

console.log('=== InfraFlow Demo Seed generat ===')
console.log('Fisier:', DB_FILE)
console.log('Users:', db.users.length)
console.log('Angajati:', db.employees.length)
console.log('Fleet assets:', db.fleetAssets.length)
console.log('Materiale:', db.materials.length)
console.log('Foi parcurs:', db.trip_logs.length)
console.log('GPS pozitii:', db.gps_positions.length)
console.log('Notificari:', db.notifications.length)
console.log('')
console.log('Parola demo pentru toti utilizatorii: demo123')
console.log('Porneste serverul: .\\scripts\\windows\\start-demo.ps1')
