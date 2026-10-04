const { parseStringPromise } = require('xml2js')

const BNR_LAST_10_DAYS_URL = 'https://curs.bnr.ro/nbrfxrates10days.xml'

function day(value) {
  const normalized = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw Object.assign(new Error('Data emiterii este invalidă.'), { status: 422 })
  return normalized
}

function nodeValue(value) {
  const node = Array.isArray(value) ? value[0] : value
  return node && typeof node === 'object' ? node._ : node
}

async function eurRonRateForDate(issueDate, fetchImpl = global.fetch) {
  const targetDate = day(issueDate)
  const response = await fetchImpl(BNR_LAST_10_DAYS_URL, { headers: { Accept: 'application/xml,text/xml' }, signal: AbortSignal.timeout(15000) })
  const xml = await response.text()
  if (!response.ok || !xml.includes('<DataSet')) throw Object.assign(new Error('Cursul oficial BNR nu a putut fi preluat.'), { status: 503 })
  const parsed = await parseStringPromise(xml, { explicitArray: false, trim: true })
  const cubes = Array.isArray(parsed?.DataSet?.Body?.Cube) ? parsed.DataSet.Body.Cube : [parsed?.DataSet?.Body?.Cube].filter(Boolean)
  const cube = cubes.find(item => String(item?.$?.date || '') === targetDate)
  if (!cube) throw Object.assign(new Error(`Cursul BNR EUR/RON nu este disponibil pentru ${targetDate}. Emite documentul după publicarea cursului oficial.`), { status: 422 })
  const rates = Array.isArray(cube.Rate) ? cube.Rate : [cube.Rate].filter(Boolean)
  const eur = rates.find(item => String(item?.$?.currency || '').toUpperCase() === 'EUR')
  const rate = Number(String(nodeValue(eur)).replace(',', '.'))
  if (!Number.isFinite(rate) || rate <= 0) throw Object.assign(new Error('Fișierul BNR nu conține un curs EUR/RON utilizabil.'), { status: 503 })
  return { currency: 'EUR', quoteCurrency: 'RON', rate, date: targetDate, source: 'BNR' }
}

module.exports = { BNR_LAST_10_DAYS_URL, eurRonRateForDate }
