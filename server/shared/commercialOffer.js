const DEFAULT_COMMERCIAL_OFFER_PACKAGES = [
  { key: 'start', label: 'Start', monthlyEur: 199, includedUsers: 5, implementationEur: 350, extraUserEur: 10 },
  { key: 'business', label: 'Business', monthlyEur: 299, includedUsers: 10, implementationEur: 650, extraUserEur: 10 },
  { key: 'operations', label: 'Operations', monthlyEur: 449, includedUsers: 20, implementationEur: 1000, extraUserEur: 12 },
  { key: 'enterprise', label: 'Enterprise', monthlyEur: 699, includedUsers: 30, implementationEur: 1500, extraUserEur: null, customUsers: true },
]

const DEFAULT_COMMERCIAL_OFFER_ADDONS = [
  { key: 'hr', label: 'HR', monthlyEur: 49, includedIn: ['enterprise'] },
  { key: 'accounting', label: 'Contabilitate', monthlyEur: 59, includedIn: ['enterprise'] },
  { key: 'legal_secretariat', label: 'Juridic & Registratură', monthlyEur: 49, includedIn: ['enterprise'] },
  { key: 'archive', label: 'Arhivă', monthlyEur: 29, includedIn: ['enterprise'] },
  { key: 'city_services', label: 'City Services', monthlyEur: 149, includedIn: [] },
  { key: 'ai', label: 'AI Assistant', monthlyEur: 49, includedIn: [], note: 'Consumul API se stabilește separat.' },
]

const BILLING_MONTHS = [1, 3, 6, 9, 12]
const money = value => Math.round((Number(value) || 0) * 100) / 100
const bounded = (value, min, max, fallback = min) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback
const isMoney = value => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1000000
const isUsers = value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 100000

function catalogInput(settings = {}) {
  return settings?.commercial_offer_catalog && typeof settings.commercial_offer_catalog === 'object'
    ? settings.commercial_offer_catalog
    : {}
}

function normaliseCommercialOfferCatalog(settings = {}) {
  const saved = catalogInput(settings)
  const packageByKey = new Map(Array.isArray(saved.packages) ? saved.packages.map(item => [item?.key, item]) : [])
  const addonByKey = new Map(Array.isArray(saved.addons) ? saved.addons.map(item => [item?.key, item]) : [])
  return {
    packages: DEFAULT_COMMERCIAL_OFFER_PACKAGES.map(defaultItem => {
      const item = packageByKey.get(defaultItem.key) || {}
      return {
        ...defaultItem,
        monthlyEur: isMoney(item.monthlyEur) ? money(item.monthlyEur) : defaultItem.monthlyEur,
        implementationEur: isMoney(item.implementationEur) ? money(item.implementationEur) : defaultItem.implementationEur,
        includedUsers: isUsers(item.includedUsers) ? Number(item.includedUsers) : defaultItem.includedUsers,
        extraUserEur: defaultItem.extraUserEur === null ? null : (isMoney(item.extraUserEur) ? money(item.extraUserEur) : defaultItem.extraUserEur),
      }
    }),
    addons: DEFAULT_COMMERCIAL_OFFER_ADDONS.map(defaultItem => {
      const item = addonByKey.get(defaultItem.key) || {}
      return { ...defaultItem, monthlyEur: isMoney(item.monthlyEur) ? money(item.monthlyEur) : defaultItem.monthlyEur }
    }),
  }
}

function validateCommercialOfferCatalog(input = {}) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.packages) || !Array.isArray(input.addons)) {
    const error = new Error('Catalogul trebuie să conțină pachete și extensii.')
    error.status = 422
    throw error
  }
  const packageByKey = new Map(input.packages.map(item => [item?.key, item]))
  const addonByKey = new Map(input.addons.map(item => [item?.key, item]))
  for (const item of DEFAULT_COMMERCIAL_OFFER_PACKAGES) {
    const candidate = packageByKey.get(item.key)
    if (!candidate || !isMoney(candidate.monthlyEur) || !isMoney(candidate.implementationEur) || !isUsers(candidate.includedUsers) || (item.extraUserEur !== null && !isMoney(candidate.extraUserEur))) {
      const error = new Error(`Valorile pachetului „${item.label}” nu sunt valide.`)
      error.status = 422
      throw error
    }
  }
  for (const item of DEFAULT_COMMERCIAL_OFFER_ADDONS) {
    const candidate = addonByKey.get(item.key)
    if (!candidate || !isMoney(candidate.monthlyEur)) {
      const error = new Error(`Prețul extensiei „${item.label}” nu este valid.`)
      error.status = 422
      throw error
    }
  }
  return normaliseCommercialOfferCatalog({ commercial_offer_catalog: input })
}

function commercialOfferCatalog(settings = {}) {
  const catalog = normaliseCommercialOfferCatalog(settings)
  return {
    currency: 'EUR',
    billingMonths: BILLING_MONTHS,
    packages: catalog.packages,
    addons: catalog.addons,
    deploymentModels: [
      { key: 'hosted', label: 'Hosted', note: 'Infrastructura este inclusă în serviciu; costurile interne nu se afișează clientului.' },
      { key: 'on_premise', label: 'On-Premise', note: 'Valoarea software-ului, update-urilor și suportului se stabilește separat în ofertă.' },
    ],
  }
}

function positiveInteger(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0
}

function calculateCommercialOffer(input = {}, settings = {}) {
  const catalog = commercialOfferCatalog(settings)
  const packageKey = String(input.packageKey || '').trim().toLowerCase()
  const selectedPackage = catalog.packages.find(item => item.key === packageKey) || catalog.packages[0]
  const deployment = catalog.deploymentModels.find(item => item.key === String(input.deployment || '').trim()) || catalog.deploymentModels[0]
  const totalUsers = Math.max(1, positiveInteger(input.totalUsers) || selectedPackage.includedUsers)
  const billingMonths = BILLING_MONTHS.includes(Number(input.billingMonths)) ? Number(input.billingMonths) : 1
  const discountPercent = bounded(input.discountPercent, 0, 100, 0)
  const taxPercent = bounded(input.taxPercent, 0, 100, 0)
  const selectedAddonKeys = Array.from(new Set(Array.isArray(input.addonKeys) ? input.addonKeys.map(item => String(item).trim().toLowerCase()) : []))
  const addons = catalog.addons
    .filter(item => selectedAddonKeys.includes(item.key))
    .map(item => ({ ...item, included: item.includedIn.includes(selectedPackage.key), chargedMonthlyEur: item.includedIn.includes(selectedPackage.key) ? 0 : item.monthlyEur }))
  const extraUsers = Math.max(0, totalUsers - selectedPackage.includedUsers)
  const userUnitEur = selectedPackage.extraUserEur
  const additionalUsersMonthlyEur = userUnitEur === null ? 0 : extraUsers * userUnitEur
  const addonsMonthlyEur = addons.reduce((total, item) => total + item.chargedMonthlyEur, 0)
  const monthlyEur = selectedPackage.monthlyEur + addonsMonthlyEur + additionalUsersMonthlyEur
  const subscriptionBeforeDiscountEur = money(monthlyEur * billingMonths)
  const subscriptionDiscountEur = money(subscriptionBeforeDiscountEur * discountPercent / 100)
  const subscriptionNetEur = money(subscriptionBeforeDiscountEur - subscriptionDiscountEur)
  const implementationEur = money(selectedPackage.implementationEur)
  const netEur = money(subscriptionNetEur + implementationEur)
  const taxEur = money(netEur * taxPercent / 100)
  const grossEur = money(netEur + taxEur)
  const currency = String(input.currency || 'EUR').toUpperCase() === 'RON' ? 'RON' : 'EUR'
  const suppliedRate = Number(input?.exchangeRate?.rate)
  const exchangeRate = currency === 'RON' && Number.isFinite(suppliedRate) && suppliedRate > 0
    ? { ...input.exchangeRate, rate: suppliedRate, source: 'BNR', currency: 'EUR', quoteCurrency: 'RON' }
    : null
  const factor = exchangeRate?.rate || 1
  const converted = value => money(value * factor)
  const billedLines = [
    { key: 'subscription', description: `Abonament InfraFlow ${selectedPackage.label} · ${billingMonths} ${billingMonths === 1 ? 'lună' : 'luni'}`, quantity: billingMonths, unit: 'lună', unitPriceEur: monthlyEur, subtotalEur: subscriptionBeforeDiscountEur, discountPercent, discountEur: subscriptionDiscountEur, netEur: subscriptionNetEur },
    { key: 'implementation', description: 'Configurare și implementare inițială', quantity: 1, unit: 'serviciu', unitPriceEur: implementationEur, subtotalEur: implementationEur, discountPercent: 0, discountEur: 0, netEur: implementationEur },
  ].map(line => ({ ...line, unitPrice: converted(line.unitPriceEur), subtotal: converted(line.subtotalEur), discount: converted(line.discountEur), net: converted(line.netEur), taxPercent, tax: converted(line.netEur * taxPercent / 100), total: converted(line.netEur * (1 + taxPercent / 100)), currency }))

  return {
    currency,
    referenceCurrency: 'EUR',
    exchangeRate,
    package: selectedPackage,
    deployment,
    totalUsers,
    includedUsers: selectedPackage.includedUsers,
    extraUsers,
    billingMonths,
    discountPercent,
    taxPercent,
    addons,
    monthly: {
      packageEur: selectedPackage.monthlyEur,
      addonsEur: addonsMonthlyEur,
      additionalUsersEur: additionalUsersMonthlyEur,
      totalEur: monthlyEur,
    },
    implementation: { fromEur: implementationEur },
    totals: {
      subscriptionBeforeDiscount: converted(subscriptionBeforeDiscountEur),
      subscriptionDiscount: converted(subscriptionDiscountEur),
      subscriptionNet: converted(subscriptionNetEur),
      implementation: converted(implementationEur),
      net: converted(netEur),
      tax: converted(taxEur),
      gross: converted(grossEur),
      currency,
    },
    billedLines,
    notes: [
      ...(selectedPackage.customUsers && extraUsers > 0 ? ['Pentru utilizatori Enterprise peste numărul inclus este necesară ofertă personalizată.'] : []),
      ...(addons.some(item => item.key === 'ai' && !item.included) ? ['AI Assistant poate avea consum API suplimentar, separat de abonament.'] : []),
      'Migrarea de date, integrările speciale și dezvoltările personalizate se ofertează separat.',
    ],
  }
}

module.exports = { commercialOfferCatalog, calculateCommercialOffer, normaliseCommercialOfferCatalog, validateCommercialOfferCatalog }
