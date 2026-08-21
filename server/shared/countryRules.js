const countryProfiles = [
  { code: 'RO', label: 'România', locale: 'ro-RO', currency: 'RON', timezone: 'Europe/Bucharest', jurisdiction_profile: 'RO', legislation_status: 'activ' },
  { code: 'GB', label: 'United Kingdom', locale: 'en-GB', currency: 'GBP', timezone: 'Europe/London', jurisdiction_profile: 'GB', legislation_status: 'roadmap' },
  { code: 'US', label: 'United States', locale: 'en-US', currency: 'USD', timezone: 'America/New_York', jurisdiction_profile: 'US', legislation_status: 'roadmap' },
  { code: 'DE', label: 'Germany', locale: 'de-DE', currency: 'EUR', timezone: 'Europe/Berlin', jurisdiction_profile: 'DE', legislation_status: 'roadmap' },
  { code: 'FR', label: 'France', locale: 'fr-FR', currency: 'EUR', timezone: 'Europe/Paris', jurisdiction_profile: 'FR', legislation_status: 'roadmap' },
  { code: 'IT', label: 'Italy', locale: 'it-IT', currency: 'EUR', timezone: 'Europe/Rome', jurisdiction_profile: 'IT', legislation_status: 'roadmap' },
  { code: 'ES', label: 'Spain', locale: 'es-ES', currency: 'EUR', timezone: 'Europe/Madrid', jurisdiction_profile: 'ES', legislation_status: 'roadmap' },
  { code: 'GLOBAL', label: 'Global / demo', locale: 'en', currency: 'EUR', timezone: 'UTC', jurisdiction_profile: 'GLOBAL', legislation_status: 'generic' },
]

const genericRules = {
  status: 'generic',
  modules: {
    hr: {
      payroll_profile: 'generic',
      timesheet_week_start: 'monday',
      medical_leave: { enabled: false, requires_operator_validation: true },
      employee_registry: {
        enabled: false,
        label: 'Registru oficial salariați',
        adapter_key: null,
        status: 'generic',
        official_api: false,
        country_specific: true,
        description: 'Adaptorul pentru registrul oficial al salariaților se configurează pe țară, unde legislația locală o cere.',
      },
    },
    accounting: {
      fiscal_profile: 'generic',
      vat_rates: [],
      declarations: [],
      e_invoice: { enabled: false },
      audit_file: { enabled: false },
    },
    documents: {
      default_language: 'en',
      templates_by_country: true,
      requires_local_legal_review: true,
    },
  },
  warnings: [
    'Profil generic: regulile legislative trebuie configurate înainte de utilizare în producție.',
  ],
}

const countryRules = {
  GLOBAL: genericRules,
  RO: {
    status: 'active',
    modules: {
      hr: {
        payroll_profile: 'RO_D112',
        timesheet_week_start: 'monday',
        annual_leave_unit: 'working_days',
        medical_leave: {
          enabled: true,
          certificate_fields: ['serie', 'numar', 'cod_indemnizatie', 'cod_boala', 'data_start', 'data_sfarsit', 'medic', 'unitate_emitenta'],
          requires_operator_validation: true,
        },
        employee_registry: {
          enabled: true,
          label: 'REGES-Online',
          legacy_label: 'Revisal',
          adapter_key: 'reges_online_ro',
          status: 'roadmap_api',
          official_api: true,
          api_host: 'api.inspectiamuncii.ro',
          source_url: 'https://github.com/reges-ro/integrare',
          current_export_status: 'internal_work_file',
          description: 'Adaptor local pentru România. Exportul actual rămâne fișier intern de lucru; transmiterea API REGES-Online se implementează separat cu token pe CUI/CIF, recipisă și rezultat asincron.',
        },
      },
      accounting: {
        fiscal_profile: 'RO_ANAF',
        vat_rates: [21, 19, 9, 5, 0],
        default_vat_rate: 21,
        declarations: ['D300', 'D394', 'D112', 'D205', 'D406_SAF_T'],
        e_invoice: {
          enabled: true,
          profile: 'CIUS_RO',
        },
        audit_file: {
          enabled: true,
          label: 'SAF-T / D406',
        },
      },
      documents: {
        default_language: 'ro',
        templates_by_country: true,
        requires_local_legal_review: false,
      },
    },
    warnings: [],
  },
}

for (const profile of countryProfiles) {
  if (!countryRules[profile.code]) {
    countryRules[profile.code] = {
      ...genericRules,
      status: profile.legislation_status === 'generic' ? 'generic' : 'roadmap',
      warnings: [
        `Profilul ${profile.label} este pregătit pentru onboarding, dar regulile legislative sunt încă generice.`,
      ],
    }
  }
}

function normalizeCountryCode(value, fallback = 'RO') {
  const code = String(value || fallback || 'RO').trim().toUpperCase()
  return countryProfiles.some(profile => profile.code === code) ? code : fallback
}

function getCountryProfiles() {
  return countryProfiles.map(profile => ({ ...profile }))
}

function getCountryRules(countryCode = 'RO') {
  const code = normalizeCountryCode(countryCode)
  const profile = countryProfiles.find(item => item.code === code) || countryProfiles[0]
  const rules = countryRules[code] || countryRules.GLOBAL
  return {
    country: code,
    profile: { ...profile },
    rules: JSON.parse(JSON.stringify(rules)),
  }
}

function getAllCountryRules() {
  return countryProfiles.map(profile => getCountryRules(profile.code))
}

function getAccountingRules(countryCode = 'RO') {
  return getCountryRules(countryCode).rules.modules.accounting || genericRules.modules.accounting
}

function getHrRules(countryCode = 'RO') {
  return getCountryRules(countryCode).rules.modules.hr || genericRules.modules.hr
}

function getDefaultVatRate(countryCode = 'RO', fallback = 21) {
  const rate = Number(getAccountingRules(countryCode).default_vat_rate)
  return Number.isFinite(rate) ? rate : fallback
}

function getVatRates(countryCode = 'RO') {
  const rates = getAccountingRules(countryCode).vat_rates
  return Array.isArray(rates) ? rates.slice() : []
}

function getFiscalDeclarations(countryCode = 'RO') {
  const declarations = getAccountingRules(countryCode).declarations
  return Array.isArray(declarations) ? declarations.slice() : []
}

function normalizeFiscalDeclarationCode(code) {
  const value = String(code || '').trim().toUpperCase()
  if (value === 'D406_SAF_T' || value === 'SAF-T') return 'D406'
  return value
}

function getMonthlyFiscalDeclarations(countryCode = 'RO') {
  const declarations = getFiscalDeclarations(countryCode)
    .map(normalizeFiscalDeclarationCode)
    .filter(code => code && code !== 'D205')
  const unique = Array.from(new Set(declarations))
  return unique.length ? unique : ['D300', 'D394', 'D112', 'D406']
}

function getPayrollProfile(countryCode = 'RO') {
  return String(getHrRules(countryCode).payroll_profile || 'generic')
}

function getEmployeeRegistryProfile(countryCode = 'RO') {
  const registry = getHrRules(countryCode).employee_registry || genericRules.modules.hr.employee_registry
  return JSON.parse(JSON.stringify(registry))
}

module.exports = {
  getAllCountryRules,
  getAccountingRules,
  getCountryProfiles,
  getCountryRules,
  getDefaultVatRate,
  getEmployeeRegistryProfile,
  getFiscalDeclarations,
  getHrRules,
  getMonthlyFiscalDeclarations,
  getPayrollProfile,
  getVatRates,
  normalizeFiscalDeclarationCode,
  normalizeCountryCode,
}
