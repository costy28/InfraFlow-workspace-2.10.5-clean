const COMMERCIAL_DEMO_DATABASE = /^INFRAFLOW_DEMO(?:_[A-Z0-9_]+)?$/

// Demo-ul comercial este permis numai într-o bază denumită explicit pentru demo.
// Markerul din app_state, singur, nu poate transforma o instalație reală în demo.
function isIsolatedCommercialDemo(db = {}, environment = process.env) {
  const databaseName = String(environment?.DB_DATABASE || '').trim().toUpperCase()
  return db?.settings?.demo_profile === 'commercial-mssql'
    && COMMERCIAL_DEMO_DATABASE.test(databaseName)
}

function commercialDemoLicense(db = {}, runtimeLicense = {}) {
  if (!isIsolatedCommercialDemo(db)) return runtimeLicense || {}
  const seeded = db?.settings?.license || {}
  return {
    ...seeded,
    licenseId: 'INFRAFLOW-DEMO-FULL',
    client: { nume: db?.settings?.companyName || 'Construct Demo SRL', localitate: 'Demo comercial' },
    pachet: 'Demo complet',
    module: ['all'],
    modules: ['all'],
    addons: [],
    limite: { maxUsers: 50, maxDevices: 50, ...(seeded.limite || {}) },
    update: { permise: true, expira_la: '2027-10-02' },
    valabilitate: { tip: 'demo' }
  }
}

module.exports = { COMMERCIAL_DEMO_DATABASE, isIsolatedCommercialDemo, commercialDemoLicense }
