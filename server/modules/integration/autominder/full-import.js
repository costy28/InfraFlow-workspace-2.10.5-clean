const { Router } = require('express')
const crypto = require('crypto')
const sql = require('mssql')
const { requireAuth } = require('../../../core/auth')
const { requirePermission } = require('../../../core/permissions')
const { readDb, writeDb } = require('../../../core/db')
const { addAudit } = require('../../../core/audit')

const router = Router()

const DEFAULT_AUTOMINDER_CONNECTION =
  `Server=${process.env.DB_SERVER || '.\\SQLEXPRESS'};Database=autoMinder5;` +
  `User Id=infraflow;Password=${process.env.AUTOMINDER_DEFAULT_PASSWORD || ''};` +
  'Encrypt=False;TrustServerCertificate=True'

function nowIso() {
  return new Date().toISOString()
}

function uuid() {
  return crypto.randomUUID()
}

function nextId(items) {
  return items.reduce((max, item) => Math.max(max, Number(item.id || 0)), 0) + 1
}

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
}

function pick(row, names, fallback = '') {
  const entries = Object.entries(row || {})
  for (const name of names) {
    const wanted = normalizeKey(name)
    const found = entries.find(([key]) => normalizeKey(key) === wanted)
    if (found && found[1] !== null && found[1] !== undefined) return found[1]
  }
  return fallback
}

function text(row, names, fallback = '') {
  return String(pick(row, names, fallback) ?? '').trim()
}

function number(row, names, fallback = 0) {
  const raw = pick(row, names, fallback)
  const parsed = Number(String(raw ?? '').replace(/\s+/g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : fallback
}

function boolFromStatus(value) {
  const status = normalizeKey(value || 'activ')
  return !['inactiv', 'casat', 'radiat', 'suspendat', '0', 'false'].includes(status)
}

function dateOnly(value) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

function dateTime(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function monthStart(value) {
  const date = dateOnly(value) || new Date().toISOString().slice(0, 10)
  return `${date.slice(0, 7)}-01`
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
}

function ensureArrays(db) {
  db.departments = Array.isArray(db.departments) ? db.departments : []
  db.costCenters = Array.isArray(db.costCenters) ? db.costCenters : []
  db.materials = Array.isArray(db.materials) ? db.materials : []
  db.fleetAssets = Array.isArray(db.fleetAssets) ? db.fleetAssets : []
  db.fleetDocuments = Array.isArray(db.fleetDocuments) ? db.fleetDocuments : []
  db.fleetFcLogs = Array.isArray(db.fleetFcLogs) ? db.fleetFcLogs : []
  db.fleetTripLogs = Array.isArray(db.fleetTripLogs) ? db.fleetTripLogs : []
  db.hr = db.hr && typeof db.hr === 'object' ? db.hr : {}
  db.hr.employees = Array.isArray(db.hr.employees) ? db.hr.employees : []
  db.audit = Array.isArray(db.audit) ? db.audit : []
}

function parseConnectionString(connStr) {
  const get = (key) => {
    const keys = Array.isArray(key) ? key : [key]
    for (const k of keys) {
      const match = connStr.match(
        new RegExp(k + '\\s*=\\s*([^;]+)', 'i')
      )
      if (match) return match[1].trim()
    }
    return ''
  }
  const server = get(['Server', 'Data Source'])
  const database = get(['Database', 'Initial Catalog'])
  const userId = get(['User Id', 'UID', 'User'])
  const password = get(['Password', 'PWD'])
  const trustedConn = /Trusted_Connection\s*=\s*True/i.test(connStr)
  const encrypt = !/Encrypt\s*=\s*False/i.test(connStr)
  const trustCert = /TrustServerCertificate\s*=\s*True/i.test(connStr)

  return {
    server,
    database,
    user: userId || undefined,
    password: password || undefined,
    options: {
      encrypt: encrypt,
      trustServerCertificate: trustCert || true,
      enableArithAbort: true
    },
    authentication: trustedConn && !userId ? {
      type: 'ntlm',
      options: { trustedConnection: true }
    } : {
      type: 'default',
      options: {
        userName: userId,
        password: password
      }
    }
  }
}

function hasMaskedPassword(connectionString) {
  return /(Password|PWD)\s*=\s*\*\*\*/i.test(String(connectionString || ''))
}

function resolveAutominderConnection(db, providedConnectionString) {
  const provided = String(providedConnectionString || '').trim()
  if (provided && !hasMaskedPassword(provided)) return provided
  return String(
    process.env.AUTOMINDER_CONNECTION_STRING ||
    db?.settings?.autominderConnectionString ||
    DEFAULT_AUTOMINDER_CONNECTION
  ).trim()
}

async function connectAutominder(db, connectionString) {
  const resolved = resolveAutominderConnection(db, connectionString)
  return sql.connect(parseConnectionString(resolved))
}

async function safeQuery(pool, query) {
  try {
    const result = await pool.request().query(query)
    return result.recordset || []
  } catch (error) {
    console.warn('[Autominder full import] query ignorat:', error.message)
    return []
  }
}

async function countQuery(pool, query) {
  const rows = await safeQuery(pool, query)
  return Number(rows[0]?.total || 0)
}

function upsertDepartments(db, rows) {
  let count = 0
  for (const row of rows) {
    const denumire = text(row, ['Denumire', 'NumeDepartament', 'Departament', 'Name'])
    const codRaw = text(row, ['Cod', 'CodDepartament', 'Code']) || denumire
    if (!codRaw && !denumire) continue
    const cod = normalizeKey(codRaw).toUpperCase() || `DEPT${db.departments.length + 1}`
    const existing = db.departments.find(item => normalizeKey(item.cod || item.code || item.denumire || item.name) === normalizeKey(cod))
    const patch = {
      cod,
      code: cod,
      denumire: denumire || cod,
      name: denumire || cod,
      active: boolFromStatus(text(row, ['Activ', 'Status', 'Stare'], 'activ')),
      source: 'autominder_sql',
      updatedAt: nowIso()
    }
    if (existing) {
      Object.assign(existing, patch)
    } else {
      db.departments.push({ id: nextId(db.departments), ...patch, createdAt: nowIso() })
    }
    count += 1
  }
  return count
}

function upsertCostCenters(db, rows) {
  let count = 0
  for (const row of rows) {
    const denumire = text(row, ['Denumire', 'CentruCost', 'Nume', 'Name'])
    const cod = text(row, ['Cod', 'CodCentruCost', 'Code']) || (denumire ? `CC-${normalizeKey(denumire).toUpperCase()}` : '')
    if (!cod && !denumire) continue
    const existing = db.costCenters.find(item => normalizeKey(item.cod || item.code || item.denumire || item.name) === normalizeKey(cod || denumire))
    const patch = {
      cod,
      code: cod,
      denumire: denumire || cod,
      name: denumire || cod,
      tip: text(row, ['Tip', 'Type'], 'autominder'),
      buget_lunar: number(row, ['BugetLunar', 'Buget lunar'], 0),
      source: 'autominder_sql',
      updatedAt: nowIso()
    }
    if (existing) Object.assign(existing, patch)
    else db.costCenters.push({ id: nextId(db.costCenters), ...patch, createdAt: nowIso() })
    count += 1
  }
  return count
}

function upsertMaterials(db, rows) {
  let count = 0
  for (const row of rows) {
    const denumire = text(row, ['Denumire', 'Material', 'Nume', 'Name'])
    const cod = text(row, ['Cod', 'CodMaterial', 'Code']) || (denumire ? normalizeKey(denumire).toUpperCase() : '')
    if (!cod && !denumire) continue
    const existing = db.materials.find(item => normalizeKey(item.cod || item.code || item.denumire || item.name) === normalizeKey(cod || denumire))
    const patch = {
      cod,
      code: cod,
      denumire: denumire || cod,
      name: denumire || cod,
      um: text(row, ['UM', 'UnitateMasura', 'Unitate'], 'buc'),
      unit: text(row, ['UM', 'UnitateMasura', 'Unitate'], 'buc'),
      categorie: text(row, ['Categorie', 'Tip'], 'material'),
      stoc_minim: number(row, ['StocMinim', 'Stoc minim'], 0),
      pret_mediu: number(row, ['PretMediu', 'Pret mediu', 'PretUnitar'], 0),
      source: 'autominder_sql',
      updatedAt: nowIso()
    }
    if (existing) Object.assign(existing, patch)
    else db.materials.push({ id: makeId('mat'), ...patch, createdAt: nowIso() })
    count += 1
  }
  return count
}

function assetKey(asset) {
  return normalizeKey(asset.nr_inmatriculare || asset.registration || asset.cod || asset.assetCode || asset.nr_inventar)
}

function findAsset(db, key) {
  const normalized = normalizeKey(key)
  if (!normalized) return null
  return db.fleetAssets.find(asset => assetKey(asset) === normalized)
}

function upsertVehicles(db, rows) {
  let count = 0
  for (const row of rows) {
    const registration = text(row, ['NumarInmatriculare', 'Număr de înmatriculare', 'NrInmatriculare'])
    if (!registration) continue
    const existing = findAsset(db, registration)
    const patch = {
      category: 'vehicle',
      tip_asset: 'autovehicul',
      nr_inmatriculare: registration,
      registration,
      cod: text(row, ['NumarInventar', 'NrInventar']) || registration,
      marca: text(row, ['Marca', 'Marcă']),
      brand: text(row, ['Marca', 'Marcă']),
      model: text(row, ['Model']),
      an_fabricatie: number(row, ['AnFabricatie', 'An fabricație'], null),
      year: number(row, ['AnFabricatie', 'An fabricație'], null),
      serie_sasiu: text(row, ['SerieSasiu', 'Serie șasiu']),
      vin: text(row, ['SerieSasiu', 'Serie șasiu']),
      locatie: text(row, ['CodLocatie', 'Locatie', 'Locație']),
      location: text(row, ['CodLocatie', 'Locatie', 'Locație']),
      active: boolFromStatus(text(row, ['Status', 'Stare'], 'activ')),
      status: boolFromStatus(text(row, ['Status', 'Stare'], 'activ')) ? 'disponibil' : 'inactiv',
      culoare: text(row, ['Culoare']),
      type: text(row, ['Tip']),
      tip: text(row, ['Tip']),
      nr_axe: number(row, ['NrAxe', 'Număr de axe'], null),
      source: 'autominder_sql',
      updatedAt: nowIso()
    }
    patch.name = [patch.marca, patch.model].filter(Boolean).join(' ') || registration
    if (existing) Object.assign(existing, patch)
    else db.fleetAssets.push({ id: makeId('fleet'), ...patch, createdAt: nowIso() })
    count += 1
  }
  return count
}

function upsertEquipment(db, rows, consumptionByCode) {
  let count = 0
  for (const row of rows) {
    const cod = text(row, ['CodUtilaj', 'Cod utilaj', 'NrInventar', 'Număr inventar'])
    if (!cod) continue
    const existing = findAsset(db, cod)
    const norm = consumptionByCode.get(normalizeKey(cod)) || 0
    const patch = {
      category: 'equipment',
      tip_asset: 'utilaj',
      cod,
      registration: cod,
      nr_inmatriculare: '',
      marca: text(row, ['Marca', 'Marcă']),
      brand: text(row, ['Marca', 'Marcă']),
      model: text(row, ['Model']),
      an_fabricatie: number(row, ['AnFabricatie', 'An fabricaţie', 'An fabricație'], null),
      year: number(row, ['AnFabricatie', 'An fabricaţie', 'An fabricație'], null),
      serie_sasiu: text(row, ['Seria', 'Serie', 'SerieSasiu']),
      vin: text(row, ['Seria', 'Serie', 'SerieSasiu']),
      locatie: text(row, ['Locatie', 'Locație']),
      location: text(row, ['Locatie', 'Locație']),
      departament: text(row, ['Departament']),
      department: text(row, ['Departament']),
      nr_inventar: text(row, ['NrInventar', 'Număr inventar']),
      active: boolFromStatus(text(row, ['Stare', 'Status'], 'activ')),
      status: boolFromStatus(text(row, ['Stare', 'Status'], 'activ')) ? 'disponibil' : 'inactiv',
      consum_orar_normat: norm,
      consumOrarNormat: norm,
      source: 'autominder_sql',
      updatedAt: nowIso()
    }
    patch.name = [patch.marca, patch.model].filter(Boolean).join(' ') || cod
    if (existing) Object.assign(existing, patch)
    else db.fleetAssets.push({ id: makeId('fleet'), ...patch, createdAt: nowIso() })
    count += 1
  }
  return count
}

// Găsește un angajat existent prin CNP (sigur), autominder_id sau Nume+Prenume
function findExistingEmployee(employees, autominderId, cnp, fullName) {
  // 1. Match după autominder_id
  if (autominderId) {
    const found = employees.find(item => String(item.autominder_id || '') === String(autominderId))
    if (found) return found
  }
  // 2. Match după CNP
  if (cnp && cnp.length >= 13) {
    const found = employees.find(item => item.cnp && item.cnp === cnp)
    if (found) return found
  }
  // 3. Match după Nume + Prenume normalizat
  if (fullName) {
    const normName = normalizeKey(fullName)
    return employees.find(item =>
      normalizeKey(item.name || [item.nume, item.prenume].filter(Boolean).join(' ')) === normName
    ) || null
  }
  return null
}

function upsertEmployees(db, rows) {
  let creati = 0
  let actualizati = 0
  for (const row of rows) {
    const fullName = text(row, ['NumePrenume', 'Nume Prenume', 'Nume'])
    const autominderId = text(row, ['AngajatID', 'autominder_id'])
    const cnpFromRow = text(row, ['CNP', 'Cnp'])
    if (!fullName && !autominderId) continue

    const [numeAuto, ...restAuto] = fullName.split(/\s+/)
    const amFunctia = text(row, ['Functia', 'Funcția', 'Meseria'])
    const amDept = text(row, ['Departament'])
    const amActiv = normalizeKey(text(row, ['Status'], 'Activ')) === 'activ'

    const existing = findExistingEmployee(db.hr.employees, autominderId, cnpFromRow, fullName)

    if (existing) {
      // MERGE: HR are prioritate — Autominder completează doar câmpurile goale
      existing.autominder_id = autominderId || existing.autominder_id
      existing.name = fullName || existing.name
      existing.activ = amActiv                        // status activ/inactiv vine întotdeauna din AM
      existing.active = amActiv
      existing.locatie = text(row, ['Locatie', 'Locație']) || existing.locatie || ''
      existing.cod_locatie = text(row, ['CodLocatie']) || existing.cod_locatie || ''
      existing.cost_center = text(row, ['CentroCost', 'CentruCost']) || existing.cost_center || ''
      existing.entitate = text(row, ['Entitate']) || existing.entitate || ''
      // Completează câmpurile HR NUMAI dacă sunt goale
      if (!existing.functia && amFunctia) existing.functia = amFunctia
      if (!existing.position && amFunctia) existing.position = amFunctia
      if (!existing.department && amDept) existing.department = amDept
      if (!existing.departament && amDept) existing.departament = amDept
      if (!existing.cnp && cnpFromRow) existing.cnp = cnpFromRow
      // Sursa: marchează că are date din Autominder
      existing.sursa = existing.sursa === 'import' ? 'autominder+hr'
        : (existing.sursa || 'autominder')
      existing.sursa_autominder = true
      existing.source = 'autominder_sql'
      existing.updatedAt = nowIso()
      actualizati++
    } else {
      // CREARE: angajat nou din Autominder
      db.hr.employees.push({
        id: nextId(db.hr.employees),
        uuid: uuid(),
        cnp: cnpFromRow || '',
        nr_marca: '',
        nume: numeAuto || fullName,
        prenume: restAuto.join(' '),
        name: fullName,
        functia: amFunctia,
        position: amFunctia,
        department: amDept,
        departament: amDept,
        locatie: text(row, ['Locatie', 'Locație']),
        cod_locatie: text(row, ['CodLocatie']),
        cost_center: text(row, ['CentroCost', 'CentruCost']),
        entitate: text(row, ['Entitate']),
        data_angajare: '',
        activ: amActiv,
        active: amActiv,
        autominder_id: autominderId || null,
        sursa: 'autominder',
        sursa_autominder: true,
        source: 'autominder_sql',
        createdAt: nowIso(),
        updatedAt: nowIso()
      })
      creati++
    }
  }
  return { creati, actualizati, total: db.hr.employees.length }
}

function insertFleetDocuments(db, rows, tip) {
  let count = 0
  for (const row of rows) {
    const key = text(row, ['asset_key', 'NumarInmatriculare', 'CodUtilaj'])
    const asset = findAsset(db, key)
    if (!asset) continue
    const expira = dateOnly(pick(row, ['DataExpirare', 'ExpiraLa', 'data_expirare']))
    const autominderId = text(row, ['autominder_id', 'ID'])
    const duplicate = db.fleetDocuments.some(doc =>
      doc.tip === tip &&
      String(doc.asset_id) === String(asset.id) &&
      ((autominderId && String(doc.autominder_id) === String(autominderId)) || (!autominderId && doc.data_expirare === expira))
    )
    if (duplicate) continue
    db.fleetDocuments.push({
      id: nextId(db.fleetDocuments),
      uuid: uuid(),
      asset_id: asset.id,
      tip,
      data_emitere: dateOnly(pick(row, ['DataEmitere', 'data_emitere'])),
      data_expirare: expira,
      observatii: text(row, ['Observatii', 'Observații']),
      autominder_id: autominderId || null,
      source: 'autominder_sql',
      created_at: nowIso()
    })
    count += 1
  }
  return count
}

function insertFcLogs(db, rows) {
  let count = 0
  for (const row of rows) {
    const autominderId = text(row, ['ActivitateID', 'autominder_id'])
    if (autominderId && db.fleetFcLogs.some(fc => String(fc.autominder_id) === String(autominderId))) continue
    const asset = findAsset(db, text(row, ['CodUtilaj']))
    if (!asset) continue
    const data = dateOnly(pick(row, ['Data']))
    const ore = number(row, ['OreLucrate'], 0)
    const norm = number(row, ['ConsumUtilaj'], 0)
    db.fleetFcLogs.push({
      id: nextId(db.fleetFcLogs),
      uuid: uuid(),
      asset_id: asset.id,
      operator_id: null,
      operator_text: text(row, ['Operator', 'MecanicDeservent', 'Deservent']),
      data,
      numar: number(row, ['Numar', 'Nr'], null),
      luna: monthStart(data),
      locatie: text(row, ['Activitate']),
      tip_activitate_id: null,
      activitati_text: text(row, ['Activitate']),
      ore_program: ore,
      ore_lucru_efectiv: ore,
      ore_deplasare: 0,
      ore_asteptare: 0,
      ore_imobilizare: 0,
      ore_reparatii: 0,
      ore_standby: 0,
      ore_defect: 0,
      motorina_l: number(row, ['ConsumEfectiv'], 0),
      benzina_l: 0,
      consum_orar_normat: norm,
      status: 'completat',
      autominder_id: autominderId || null,
      source: 'autominder_sql',
      created_at: nowIso()
    })
    count += 1
  }
  return count
}

function insertTripLogs(db, rows) {
  let count = 0
  for (const row of rows) {
    const autominderId = text(row, ['FoaieID', 'autominder_id'])
    const sursa = text(row, ['sursa', 'sursa_import'], 'Autominder')
    if (autominderId && db.fleetTripLogs.some(trip =>
      String(trip.autominder_id) === String(autominderId) &&
      (
        normalizeKey(trip.sursa_import || trip.source_table || '') === normalizeKey(sursa) ||
        (!trip.sursa_import && !trip.source_table && sursa === 'TM_FoiDeParcurs')
      )
    )) continue
    const asset = findAsset(db, text(row, ['NumarInmatriculare', 'NrInmatriculare']))
    if (!asset) continue
    const kmPlecare = number(row, ['KilometrajPlecare', 'KmPlecare'], 0)
    const kmSosire = number(row, ['KilometrajSosire', 'KmSosire'], 0)
    if (kmSosire <= kmPlecare) continue
    const dataEmitere = dateTime(pick(row, ['DataOraEmitere']))
    const dataPlecare = dateTime(pick(row, ['DataPlecare', 'DataOraPlecare', 'DataOraEmitere']))
    const dataSosire = dateTime(pick(row, ['DataOraSosire', 'DataSosire']))
    const serie = text(row, ['Serie'])
    const numar = text(row, ['Numar', 'Număr', 'NumarFoaie', 'NrFoaie', 'Foaie'])
    const nrFoaie = [serie, numar].filter(Boolean).join('-') || `AM-${sursa}-${autominderId || db.fleetTripLogs.length + 1}`
    const km = kmSosire - kmPlecare
    const consum100 = Number(asset.consum_normat_100km || asset.standardConsumption || 0)
    db.fleetTripLogs.push({
      id: nextId(db.fleetTripLogs),
      uuid: uuid(),
      asset_id: asset.id,
      sofer_id: null,
      sofer_text: text(row, ['Sofer', 'NumeSofer', 'ConducatorAuto']),
      data: dateOnly(pick(row, ['Data', 'DataOraEmitere'])) || dateOnly(dataPlecare),
      nr_foaie: nrFoaie,
      serie,
      data_emitere: dataEmitere,
      data_plecare: dataPlecare,
      km_plecare: kmPlecare,
      combustibil_sold_initial: number(row, ['CombustibilSoldInitial', 'SoldInitial'], 0),
      data_sosire: dataSosire,
      km_sosire: kmSosire,
      combustibil_sold_final: number(row, ['CombustibilSoldFinal', 'SoldFinal'], 0),
      combustibil_primit: number(row, ['CombustibilPrimit'], 0),
      consum_normat: Math.round((km / 100) * consum100 * 100) / 100,
      itinerariu: text(row, ['Itinerariu']),
      scop_deplasare: text(row, ['ScopDeplasare', 'Scop']),
      sarcini_transport: text(row, ['SarciniTransport']),
      observatii: text(row, ['Observatii', 'Observații']),
      status: 'inchisa',
      sosit: true,
      autominder_id: autominderId || null,
      sursa_import: sursa,
      source_table: sursa,
      source: 'autominder_sql',
      created_at: nowIso(),
      updated_at: nowIso()
    })
    count += 1
  }
  return count
}

async function previewAutominder(pool) {
  const [
    autovehicule,
    utilaje,
    angajati,
    fazUtilaje,
    foiParcursClassic,
    foiParcursTm,
    foiParcursTp,
    itpAuto,
    rca,
    casco,
    roviniete,
    iscir,
    itpUtilaje
  ] = await Promise.all([
    countQuery(pool, 'SELECT COUNT(*) AS total FROM MainTable'),
    countQuery(pool, 'SELECT COUNT(*) AS total FROM Utilaje'),
    countQuery(pool, "SELECT COUNT(*) AS total FROM Angajati_ListaAngajati WHERE Status = 'Activ'"),
    countQuery(pool, "SELECT COUNT(*) AS total FROM Utilaje_FAZ WHERE Data >= '2022-01-01'"),
    countQuery(pool, 'SELECT COUNT(*) AS total FROM FoaieDeParcurs WHERE Sosit = 1'),
    countQuery(pool, 'SELECT COUNT(*) AS total FROM TM_FoiDeParcurs WHERE Sosit = 1'),
    countQuery(pool, 'SELECT COUNT(*) AS total FROM TP_FoiDeParcurs WHERE Sosit = 1'),
    countQuery(pool, 'SELECT COUNT(*) AS total FROM Inspectii_ITP'),
    countQuery(pool, 'SELECT COUNT(*) AS total FROM Asigurari_RCA'),
    countQuery(pool, 'SELECT COUNT(*) AS total FROM Asigurari_CASCO'),
    countQuery(pool, 'SELECT COUNT(*) AS total FROM Roviniete'),
    countQuery(pool, 'SELECT COUNT(*) AS total FROM Utilaje_ISCIR'),
    countQuery(pool, 'SELECT COUNT(*) AS total FROM Utilaje_ITP')
  ])
  return {
    autovehicule,
    utilaje,
    angajati,
    faz_utilaje: fazUtilaje,
    foi_parcurs: foiParcursClassic + foiParcursTm + foiParcursTp,
    foi_parcurs_total: foiParcursClassic + foiParcursTm + foiParcursTp,
    foi_parcurs_detalii: {
      FoaieDeParcurs: foiParcursClassic,
      TM_FoiDeParcurs: foiParcursTm,
      TP_FoiDeParcurs: foiParcursTp
    },
    documente_expirabile: itpAuto + rca + casco + roviniete + iscir + itpUtilaje
  }
}

async function importFull(pool, auth) {
  const db = readDb()
  ensureArrays(db)

  const consumRows = await safeQuery(pool, `
    SELECT u.CodUtilaj, AVG(CAST(f.ConsumUtilaj AS FLOAT)) AS ConsumMediu
    FROM Utilaje_FAZ f
    JOIN Utilaje u ON f.UtilajID = u.UtilajID
    WHERE f.ConsumUtilaj IS NOT NULL
    GROUP BY u.CodUtilaj
  `)
  const consumptionByCode = new Map(consumRows.map(row => [normalizeKey(row.CodUtilaj), Number(row.ConsumMediu || 0)]))

  const departments = await safeQuery(pool, 'SELECT * FROM ListaDepartamente')
  const costCenters = await safeQuery(pool, 'SELECT * FROM ListaCentreCost')
  const materials = await safeQuery(pool, 'SELECT * FROM ListaMateriale')
  const vehicles = await safeQuery(pool, `
    SELECT NumarInmatriculare, Marca, Model, AnFabricatie, SerieSasiu,
           CodLocatie, Status, Culoare, Tip, NrAxe
    FROM MainTable
  `)
  const equipment = await safeQuery(pool, `
    SELECT CodUtilaj, Marca, Model, AnFabricatie, Seria, Locatie,
           Departament, NrInventar, Stare
    FROM Utilaje
  `)
  const employees = await safeQuery(pool, `
    SELECT AngajatID, Status, Locatie, CodLocatie,
           Departament, CentroCost, Entitate,
           NumePrenume, Functia
    FROM Angajati_ListaAngajati
    WHERE Status = 'Activ'
  `)

  const imported = {
    departamente: upsertDepartments(db, departments),
    centre_cost: upsertCostCenters(db, costCenters),
    materiale: upsertMaterials(db, materials),
    autovehicule: upsertVehicles(db, vehicles),
    utilaje: upsertEquipment(db, equipment, consumptionByCode),
    angajati: upsertEmployees(db, employees),
    documente_expirabile: 0,
    faz_utilaje: 0,
    foi_parcurs: 0
  }

  const documentQueries = [
    ['ITP', `
      SELECT f.NumarInmatriculare AS asset_key, i.DataExpirare, i.DataEmitere,
             i.Observatii, i.ITPID AS autominder_id
      FROM Inspectii_ITP i
      JOIN MainTable f ON i.AutovehiculID = f.AutovehiculID
    `],
    ['RCA', `
      SELECT f.NumarInmatriculare AS asset_key, r.DataExpirare, r.DataEmitere,
             r.Observatii, r.RCAID AS autominder_id
      FROM Asigurari_RCA r
      JOIN MainTable f ON r.AutovehiculID = f.AutovehiculID
    `],
    ['CASCO', `
      SELECT f.NumarInmatriculare AS asset_key, c.DataExpirare, c.DataEmitere,
             c.Observatii, c.CASCOID AS autominder_id
      FROM Asigurari_CASCO c
      JOIN MainTable f ON c.AutovehiculID = f.AutovehiculID
    `],
    ['ROVINIETA', `
      SELECT f.NumarInmatriculare AS asset_key, r.DataExpirare, r.DataEmitere,
             r.Observatii, r.RovinietaID AS autominder_id
      FROM Roviniete r
      JOIN MainTable f ON r.AutovehiculID = f.AutovehiculID
    `],
    ['ISCIR', `
      SELECT u.CodUtilaj AS asset_key, i.DataExpirare, i.DataEmitere,
             i.Observatii, i.ISCIRID AS autominder_id
      FROM Utilaje_ISCIR i
      JOIN Utilaje u ON i.UtilajID = u.UtilajID
    `],
    ['ITP_UTILAJ', `
      SELECT u.CodUtilaj AS asset_key, i.DataExpirare, i.DataEmitere,
             i.Observatii, i.ITPID AS autominder_id
      FROM Utilaje_ITP i
      JOIN Utilaje u ON i.UtilajID = u.UtilajID
    `]
  ]
  for (const [tip, query] of documentQueries) {
    imported.documente_expirabile += insertFleetDocuments(db, await safeQuery(pool, query), tip)
  }

  const fcRows = await safeQuery(pool, `
    SELECT f.*, u.CodUtilaj
    FROM Utilaje_FAZ f
    JOIN Utilaje u ON f.UtilajID = u.UtilajID
    WHERE f.Data >= '2022-01-01'
    ORDER BY f.Data ASC
  `)
  imported.faz_utilaje = insertFcLogs(db, fcRows)

  const tripRows = await safeQuery(pool, `
    SELECT FoaieID, Status, NumarInmatriculare,
      Serie, Numar, DataOraEmitere, Sofer,
      DataPlecare, KilometrajPlecare,
      Sosit, DataSosire, KilometrajSosire,
      SarciniTransport, Observatii,
      'FoaieDeParcurs' as sursa
    FROM FoaieDeParcurs
    WHERE Sosit = 1 AND KilometrajSosire > KilometrajPlecare

    UNION ALL

    SELECT FoaieID, Status, NumarInmatriculare,
      Serie, Numar, DataOraEmitere, Sofer,
      DataPlecare, KilometrajPlecare,
      Sosit, DataSosire, KilometrajSosire,
      SarciniTransport, Observatii,
      'TM_FoiDeParcurs' as sursa
    FROM TM_FoiDeParcurs
    WHERE Sosit = 1 AND KilometrajSosire > KilometrajPlecare

    UNION ALL

    SELECT FoaieID, Status, NumarInmatriculare,
      Serie, Numar, DataOraEmitere, Sofer,
      DataPlecare, KilometrajPlecare,
      Sosit, DataSosire, KilometrajSosire,
      NULL as SarciniTransport, NULL as Observatii,
      'TP_FoiDeParcurs' as sursa
    FROM TP_FoiDeParcurs
    WHERE Sosit = 1

    ORDER BY DataOraEmitere ASC
  `)
  imported.foi_parcurs = insertTripLogs(db, tripRows)

  addAudit(db, auth.user, 'autominder_import_full', `Import complet Autominder: ${JSON.stringify(imported)}`)
  writeDb(db)
  return imported
}

router.post('/integration/autominder/test-connection', async (req, res, next) => {
  let pool
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'system:admin')) return

    const start = Date.now()
    pool = await connectAutominder(auth.db, req.body?.connection_string)
    const preview = await previewAutominder(pool)
    res.json({ ok: true, preview, durata_ms: Date.now() - start })
  } catch (error) {
    next(error)
  } finally {
    if (pool) await pool.close().catch(() => {})
  }
})

router.get('/integration/autominder/preview', async (req, res, next) => {
  let pool
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'system:admin')) return

    const start = Date.now()
    pool = await connectAutominder(auth.db, req.query.connection_string)
    const preview = await previewAutominder(pool)
    res.json({ ok: true, ...preview, preview, durata_ms: Date.now() - start })
  } catch (error) {
    next(error)
  } finally {
    if (pool) await pool.close().catch(() => {})
  }
})

router.post('/integration/autominder/import-full', async (req, res, next) => {
  let pool
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'system:admin')) return

    const start = Date.now()
    pool = await connectAutominder(auth.db, req.body?.connection_string)
    const importate = await importFull(pool, auth)
    res.json({
      ok: true,
      importate,
      durata_secunde: Math.round(((Date.now() - start) / 1000) * 10) / 10
    })
  } catch (error) {
    next(error)
  } finally {
    if (pool) await pool.close().catch(() => {})
  }
})

module.exports = router
