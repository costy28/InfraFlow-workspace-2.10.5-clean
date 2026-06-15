const crypto = require('crypto')
const { DB_MODE, runMssqlScalar, MSSQL_RELATIONAL_MODE } = require('../../core/db')

function isMssqlMode() {
  return MSSQL_RELATIONAL_MODE && (DB_MODE === 'mssql' || DB_MODE === 'sqlserver')
}

function mssqlJson(sql, params = {}) {
  const result = runMssqlScalar(`DECLARE @p nvarchar(max) = @json;\n${sql}`, { jsonInput: JSON.stringify(params) })
  if (!String(result || '').trim()) return null
  return JSON.parse(result)
}

function mssqlObject(sql, params = {}) {
  const rows = mssqlJson(sql, params) || []
  return rows[0] || null
}

function ensureControllingDb(db) {
  db.controlling = db.controlling || {}
  db.controlling.costCenters = Array.isArray(db.controlling.costCenters) ? db.controlling.costCenters : []
  db.controlling.costEntries = Array.isArray(db.controlling.costEntries) ? db.controlling.costEntries : []
  return db.controlling
}

function nextId(items) {
  return items.reduce((max, item) => Math.max(max, Number(item.id || 0)), 0) + 1
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function entryDate(value) {
  return String(value || new Date().toISOString().slice(0, 10)).slice(0, 10)
}

function firstDayOfMonth(value) {
  const data = entryDate(value)
  return `${data.slice(0, 7)}-01`
}

function companyIdFrom(entry) {
  return Number(entry.company_id || entry.companyId || 1)
}

function departmentIdFrom(source) {
  return source.dept_id || source.department_id || source.dept_solicitant_id || source.departmentId || source.solicitant_dept_id || null
}

function findDepartmentCostCenter(db, deptId) {
  const controlling = ensureControllingDb(db)
  return controlling.costCenters.find((item) =>
    String(item.dept_id || item.department_id || '') === String(deptId || '') &&
    String(item.tip || '') === 'departament' &&
    item.activ !== false &&
    item.activ !== 0
  )
}

function findCostCenterByCode(db, code) {
  const controlling = ensureControllingDb(db)
  return controlling.costCenters.find((item) => String(item.cod || '') === String(code || ''))
}

function findSnowCostCenter(db) {
  const controlling = ensureControllingDb(db)
  return controlling.costCenters.find((item) => {
    const code = String(item.cod || '').toUpperCase()
    const name = String(item.denumire || item.name || '').toLowerCase()
    return item.activ !== false &&
      item.activ !== 0 &&
      (code.includes('DESZAP') || code.includes('DEZAPEZ') || name.includes('deszapez') || name.includes('dezapez'))
  })
}

function findAssetSubcenter(db, utilaj) {
  const controlling = ensureControllingDb(db)
  return controlling.costCenters.find((item) =>
    String(item.resursa_ref_id || '') === String(utilaj.id || '') &&
    ['utilaj', 'vehicul'].includes(String(item.tip_resursa || ''))
  )
}

async function findDepartmentCostCenterMssql(deptId) {
  return mssqlObject(`
SELECT TOP 1 id
FROM controlling.cost_centers
WHERE dept_id = JSON_VALUE(@p, '$.deptId')
AND tip = N'departament'
AND activ = 1
FOR JSON PATH;
`, { deptId })
}

async function findCostCenterByCodeMssql(code) {
  return mssqlObject(`
SELECT TOP 1 id
FROM controlling.cost_centers
WHERE cod = JSON_VALUE(@p, '$.code')
AND activ = 1
FOR JSON PATH;
`, { code })
}

async function findSnowCostCenterMssql() {
  return mssqlObject(`
SELECT TOP 1 id
FROM controlling.cost_centers
WHERE activ = 1
AND (
  UPPER(cod) LIKE N'%DESZAP%' OR
  UPPER(cod) LIKE N'%DEZAPEZ%' OR
  LOWER(denumire) LIKE N'%deszapez%' OR
  LOWER(denumire) LIKE N'%dezapez%'
)
FOR JSON PATH;
`)
}

async function findAssetSubcenterMssql(utilaj) {
  return mssqlObject(`
SELECT TOP 1 id, parinte_id
FROM controlling.cost_centers
WHERE resursa_ref_id = TRY_CONVERT(int, JSON_VALUE(@p, '$.id'))
AND tip_resursa IN (N'utilaj', N'vehicul')
AND activ = 1
FOR JSON PATH;
`, { id: utilaj.id })
}

async function insertCostEntry(entry, db) {
  const data = entryDate(entry.data)
  const luna = firstDayOfMonth(data)
  const payload = {
    uuid: crypto.randomUUID(),
    company_id: companyIdFrom(entry),
    cost_center_id: entry.cost_center_id,
    subcentru_id: entry.subcentru_id || null,
    santier_id: entry.santier_id || null,
    data,
    luna,
    categorie: entry.categorie,
    valoare: numberValue(entry.valoare),
    tva: numberValue(entry.tva),
    moneda: entry.moneda || 'RON',
    sursa: entry.sursa,
    sursa_ref_id: entry.sursa_ref_id || null,
    descriere: entry.descriere || null,
    nr_document: entry.nr_document || null,
    furnizor: entry.furnizor || null,
    observatii: entry.observatii || null,
    inregistrat_de: entry.inregistrat_de || null
  }

  if (isMssqlMode()) {
    runMssqlScalar(`
DECLARE @payload nvarchar(max) = @json;
INSERT INTO controlling.cost_entries (
  uuid, company_id, cost_center_id, subcentru_id, santier_id,
  data, luna, categorie, valoare, tva, moneda, sursa, sursa_ref_id,
  descriere, nr_document, furnizor, inregistrat_de, observatii
)
SELECT
  JSON_VALUE(@payload, '$.uuid'),
  TRY_CONVERT(int, JSON_VALUE(@payload, '$.company_id')),
  TRY_CONVERT(int, JSON_VALUE(@payload, '$.cost_center_id')),
  TRY_CONVERT(int, JSON_VALUE(@payload, '$.subcentru_id')),
  TRY_CONVERT(int, JSON_VALUE(@payload, '$.santier_id')),
  TRY_CONVERT(date, JSON_VALUE(@payload, '$.data')),
  TRY_CONVERT(date, JSON_VALUE(@payload, '$.luna')),
  JSON_VALUE(@payload, '$.categorie'),
  TRY_CONVERT(decimal(15,2), JSON_VALUE(@payload, '$.valoare')),
  TRY_CONVERT(decimal(15,2), JSON_VALUE(@payload, '$.tva')),
  JSON_VALUE(@payload, '$.moneda'),
  JSON_VALUE(@payload, '$.sursa'),
  JSON_VALUE(@payload, '$.sursa_ref_id'),
  JSON_VALUE(@payload, '$.descriere'),
  JSON_VALUE(@payload, '$.nr_document'),
  JSON_VALUE(@payload, '$.furnizor'),
  JSON_VALUE(@payload, '$.inregistrat_de'),
  JSON_VALUE(@payload, '$.observatii');
SELECT 1;
`, { jsonInput: JSON.stringify(payload) })
    return
  }

  const controlling = ensureControllingDb(db)
  controlling.costEntries.push({
    id: nextId(controlling.costEntries),
    ...payload,
    created_at: new Date().toISOString()
  })
}

async function registerBonConsum(bonConsum, db) {
  const deptId = departmentIdFrom(bonConsum)
  const costCenter = isMssqlMode()
    ? await findDepartmentCostCenterMssql(deptId)
    : findDepartmentCostCenter(db, deptId)
  if (!costCenter) return

  await insertCostEntry({
    company_id: bonConsum.company_id || bonConsum.companyId,
    cost_center_id: costCenter.id,
    santier_id: bonConsum.santier_id,
    data: bonConsum.data || bonConsum.created_at,
    categorie: 'materiale',
    valoare: numberValue(bonConsum.cantitate) * numberValue(bonConsum.pret_unitar),
    sursa: 'bon_consum',
    sursa_ref_id: String(bonConsum.id),
    descriere: bonConsum.descriere || bonConsum.material || bonConsum.material_name || null,
    inregistrat_de: bonConsum.inregistrat_de || bonConsum.user_id || bonConsum.created_by
  }, db)
}

async function registerPontaj(pontaj, angajat, db) {
  const costCenter = isMssqlMode()
    ? await findDepartmentCostCenterMssql(angajat.department_id || angajat.dept_id)
    : findDepartmentCostCenter(db, angajat.department_id || angajat.dept_id)
  if (!costCenter) return

  await insertCostEntry({
    company_id: pontaj.company_id || angajat.company_id || pontaj.companyId || angajat.companyId,
    cost_center_id: costCenter.id,
    santier_id: pontaj.santier_id,
    data: pontaj.data,
    categorie: 'manopera',
    valoare: numberValue(pontaj.ore_lucrate) * (numberValue(angajat.salariu_baza) / 160),
    sursa: 'pontaj',
    sursa_ref_id: String(pontaj.id),
    descriere: `Pontaj ${angajat.nume || ''} ${angajat.prenume || ''}`.trim(),
    inregistrat_de: pontaj.validat_de || pontaj.inregistrat_de
  }, db)
}

async function registerRaportUtilaj(raport, utilaj, db) {
  const subcentru = isMssqlMode()
    ? await findAssetSubcenterMssql(utilaj)
    : findAssetSubcenter(db, utilaj)
  if (!subcentru) return

  const costCenterId = subcentru.parinte_id || subcentru.cost_center_id || subcentru.id
  const pretCombustibil = await getPretCombustibil(db)
  const costOraAmortizare = await getCostOraAmortizare(utilaj, db)
  const oreEfectuate = numberValue(raport.ore_efectuate || raport.ore_motor || raport.ore_lucrate)

  await insertCostEntry({
    company_id: raport.company_id || utilaj.company_id,
    cost_center_id: costCenterId,
    subcentru_id: subcentru.id,
    santier_id: raport.santier_id,
    data: raport.data,
    categorie: 'combustibil',
    valoare: numberValue(raport.combustibil_l) * pretCombustibil,
    sursa: 'raport_utilaj',
    sursa_ref_id: String(raport.id),
    descriere: `Combustibil ${utilaj.nume || utilaj.denumire || utilaj.nr_inmatriculare || ''}`.trim(),
    inregistrat_de: raport.inregistrat_de || raport.user_id
  }, db)

  await insertCostEntry({
    company_id: raport.company_id || utilaj.company_id,
    cost_center_id: costCenterId,
    subcentru_id: subcentru.id,
    santier_id: raport.santier_id,
    data: raport.data,
    categorie: 'amortizare',
    valoare: oreEfectuate * costOraAmortizare,
    sursa: 'raport_utilaj',
    sursa_ref_id: String(raport.id),
    descriere: `Amortizare ${utilaj.nume || utilaj.denumire || utilaj.nr_inmatriculare || ''}`.trim(),
    inregistrat_de: raport.inregistrat_de || raport.user_id
  }, db)
}

async function registerNexusImport(factura, mapping, db) {
  const mapped = mapping[factura.cont_contabil] || mapping[String(factura.cont_contabil || '')]
  if (!mapped) return

  const costCenter = isMssqlMode()
    ? await findCostCenterByCodeMssql(mapped.cost_center_cod)
    : findCostCenterByCode(db, mapped.cost_center_cod)
  if (!costCenter) return

  await insertCostEntry({
    company_id: factura.company_id || factura.companyId,
    cost_center_id: costCenter.id,
    santier_id: factura.santier_id,
    data: factura.data || factura.data_factura,
    categorie: mapped.categorie,
    valoare: numberValue(factura.valoare),
    sursa: 'nexus_import',
    sursa_ref_id: String(factura.id),
    descriere: factura.descriere || factura.nr_document || factura.furnizor,
    inregistrat_de: factura.importat_de || factura.inregistrat_de
  }, db)
}

async function registerSnowStandby(standby, angajat, db) {
  const costCenter = isMssqlMode()
    ? await findSnowCostCenterMssql()
    : findSnowCostCenter(db)
  if (!costCenter) return

  let valoare = numberValue(standby.ore_totale) * (numberValue(angajat.salariu_baza) / 160)
  if (standby.spor_noapte) valoare += valoare * 0.25
  if (standby.spor_consemn) valoare += valoare * 0.15

  await insertCostEntry({
    company_id: standby.company_id || angajat.company_id || standby.companyId || angajat.companyId,
    cost_center_id: costCenter.id,
    santier_id: standby.santier_id,
    data: standby.data || standby.created_at,
    categorie: 'manopera',
    valoare,
    sursa: 'manual',
    sursa_ref_id: String(standby.id),
    descriere: 'Timp la dispoziție deszăpezire - ' + standby.tip_standby,
    inregistrat_de: standby.inregistrat_de || standby.user_id
  }, db)
}

async function getPretCombustibil(db) {
  if (isMssqlMode()) {
    const row = mssqlObject(`
SELECT TOP 1 pret_mediu
FROM inventory.materials
WHERE denumire LIKE N'%motorin%'
FOR JSON PATH;
`)
    return numberValue(row?.pret_mediu, 7.50)
  }

  const materials = db.inventory?.materials || db.materials || []
  const material = materials.find((item) => String(item.denumire || item.name || '').toLowerCase().includes('motorin'))
  return numberValue(material?.pret_mediu ?? material?.averagePrice ?? material?.pret_unitar ?? material?.price, 7.50)
}

async function getCostOraAmortizare(utilaj, db) {
  if (isMssqlMode()) {
    const row = mssqlObject(`
SELECT TOP 1 cost_ora_amortizare
FROM fleet.assets
WHERE id = TRY_CONVERT(int, JSON_VALUE(@p, '$.id'))
FOR JSON PATH;
`, { id: utilaj.id })
    return numberValue(row?.cost_ora_amortizare, 0)
  }

  const assets = db.fleet?.assets || db.fleetAssets || []
  const asset = assets.find((item) => String(item.id || '') === String(utilaj.id || '')) || utilaj
  return numberValue(asset.cost_ora_amortizare ?? asset.costOraAmortizare ?? asset.amortizare_ora, 0)
}

module.exports = {
  insertCostEntry,
  registerBonConsum,
  registerPontaj,
  registerRaportUtilaj,
  registerNexusImport,
  registerSnowStandby
}
