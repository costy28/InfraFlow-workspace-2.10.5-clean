const assert = require('node:assert/strict')
const test = require('node:test')
const { calculateCommercialOffer, commercialOfferCatalog, validateCommercialOfferCatalog } = require('../shared/commercialOffer')
const { eurRonRateForDate } = require('../shared/bnrRates')

test('oferta Business calculează extensiile și utilizatorii suplimentari', () => {
  const result = calculateCommercialOffer({ packageKey: 'business', totalUsers: 15, addonKeys: ['hr', 'archive'] })
  assert.equal(result.monthly.packageEur, 299)
  assert.equal(result.monthly.addonsEur, 78)
  assert.equal(result.monthly.additionalUsersEur, 50)
  assert.equal(result.monthly.totalEur, 427)
  assert.equal(result.implementation.fromEur, 650)
})

test('oferta pe 12 luni aplică discountul numai abonamentului și TVA-ul ales', () => {
  const result = calculateCommercialOffer({ packageKey: 'business', totalUsers: 10, billingMonths: 12, discountPercent: 10, taxPercent: 0 })
  assert.equal(result.totals.subscriptionBeforeDiscount, 3588)
  assert.equal(result.totals.subscriptionDiscount, 358.8)
  assert.equal(result.totals.net, 3879.2)
  assert.equal(result.totals.tax, 0)
  assert.equal(result.totals.gross, 3879.2)
  assert.equal(result.billedLines.length, 2)
})

test('oferta RON păstrează cursul BNR primit pentru data emiterii', () => {
  const result = calculateCommercialOffer({ packageKey: 'start', billingMonths: 1, currency: 'RON', taxPercent: 0, exchangeRate: { rate: 5.1234, date: '2026-10-02' } })
  assert.equal(result.currency, 'RON')
  assert.equal(result.exchangeRate.rate, 5.1234)
  assert.equal(result.totals.gross, 2812.75)
})

test('parserul BNR acceptă numai cursul EUR din data cerută', async () => {
  const xml = '<?xml version="1.0"?><DataSet><Body><Cube date="2026-10-02"><Rate currency="EUR">5.1234</Rate></Cube></Body></DataSet>'
  const rate = await eurRonRateForDate('2026-10-02', async () => ({ ok: true, text: async () => xml }))
  assert.deepEqual(rate, { currency: 'EUR', quoteCurrency: 'RON', rate: 5.1234, date: '2026-10-02', source: 'BNR' })
})

test('extensiile incluse în Enterprise nu se taxează din nou', () => {
  const result = calculateCommercialOffer({ packageKey: 'enterprise', totalUsers: 35, addonKeys: ['hr', 'accounting', 'archive', 'city_services'] })
  assert.equal(result.monthly.addonsEur, 149)
  assert.equal(result.monthly.additionalUsersEur, 0)
  assert.ok(result.notes.some(note => note.includes('Enterprise')))
})

test('catalogul salvat suprascrie tariful standard fără a schimba identitatea pachetelor', () => {
  const saved = validateCommercialOfferCatalog({
    packages: commercialOfferCatalog().packages.map(item => item.key === 'start'
      ? { ...item, monthlyEur: 245.5, implementationEur: 400, includedUsers: 7, extraUserEur: 11 }
      : item),
    addons: commercialOfferCatalog().addons.map(item => item.key === 'hr' ? { ...item, monthlyEur: 61 } : item),
  })
  const result = calculateCommercialOffer({ packageKey: 'start', totalUsers: 8, addonKeys: ['hr'] }, { commercial_offer_catalog: saved })
  assert.equal(result.monthly.packageEur, 245.5)
  assert.equal(result.monthly.addonsEur, 61)
  assert.equal(result.monthly.additionalUsersEur, 11)
  assert.equal(result.implementation.fromEur, 400)
  assert.equal(result.includedUsers, 7)
})
