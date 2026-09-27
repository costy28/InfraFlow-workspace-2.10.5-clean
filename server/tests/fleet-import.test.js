const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const importer = require('../modules/fleet/import-routes')._private

test('modelul Excel pentru parc are foile neutre Autovehicule și Utilaje', () => {
  const xlsx = require('xlsx')
  const workbook = xlsx.read(importer.buildXlsxTemplate(), { type: 'buffer' })
  assert.deepEqual(workbook.SheetNames, ['Autovehicule', 'Utilaje'])
})

test('modelul XML generic se parsează fără nume de furnizor', async () => {
  const file = path.join(os.tmpdir(), `infraflow-fleet-${Date.now()}.xml`)
  fs.writeFileSync(file, importer.buildXmlTemplate(), 'utf8')
  try {
    const parsed = await importer.parseXml(file)
    assert.equal(parsed.vehicles[0].registration, 'NT 01 ABC')
    assert.equal(parsed.equipment[0].code, 'UT-001')
  } finally {
    if (fs.existsSync(file)) fs.unlinkSync(file)
  }
})

test('importul generic actualizează după identificator și păstrează sursa neutră', () => {
  const db = { fleetAssets: [] }
  const first = importer.upsertAssets(db, [{ registration: 'NT 01 ABC', brand: 'Marca', current_meter: '10' }], 'vehicle')
  const second = importer.upsertAssets(db, [{ registration: 'NT 01 ABC', brand: 'Actualizat', current_meter: '25' }], 'vehicle')
  assert.equal(first.imported, 1)
  assert.equal(second.updated, 1)
  assert.equal(db.fleetAssets[0].source, 'fleet_file_import')
  assert.equal(db.fleetAssets[0].km_curent, 25)
})
