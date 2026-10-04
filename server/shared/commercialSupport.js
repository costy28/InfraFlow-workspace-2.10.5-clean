const SUPPORT_POLICIES = Object.freeze({
  start: {
    key: 'start',
    label: 'Start',
    channel: 'Email sau tichet',
    priority: 'Preluare standard',
    summary: 'Solicitările sunt preluate prin email sau tichet; prioritizarea P1–P4 este internă.',
    client_notice: 'Folosește un tichet pentru a păstra istoricul și răspunsurile într-un singur loc.'
  },
  business: {
    key: 'business',
    label: 'Business',
    channel: 'Email sau tichet',
    priority: 'Prioritate peste Start',
    summary: 'Solicitările sunt gestionate cu prioritate operațională peste nivelul Start.',
    client_notice: 'Înregistrează tichetul cu impactul real; nivelul P1–P4 este confirmat la analiză.'
  },
  operations: {
    key: 'operations',
    label: 'Operations',
    channel: 'Canal dedicat de suport',
    priority: 'Prioritate operațională',
    summary: 'Pentru incidente operaționale există un canal dedicat, păstrând tichetul ca evidență de lucru.',
    client_notice: 'Folosește canalul dedicat pentru incident și păstrează detaliile, fișierele și confirmarea în tichet.'
  },
  enterprise: {
    key: 'enterprise',
    label: 'Enterprise',
    channel: 'Canal contractual de suport',
    priority: 'SLA contractual',
    summary: 'Condițiile de prioritate și răspuns se aplică numai conform contractului de suport activ.',
    client_notice: 'Tichetul păstrează istoricul; condițiile SLA aplicabile sunt cele din contractul activ.'
  },
  demo: {
    key: 'demo',
    label: 'Demo complet',
    channel: 'Tichet demonstrativ',
    priority: 'Fără SLA contractual',
    summary: 'Mediul demo folosește fluxul de tichete numai pentru validare; nu are SLA contractual.',
    client_notice: 'Datele și tichetele demo sunt destinate exclusiv testării fluxului.'
  }
})

function supportPolicyForPackage(value) {
  const packageKey = String(value || '').trim().toLowerCase()
  if (packageKey === 'demo complet') return SUPPORT_POLICIES.demo
  return SUPPORT_POLICIES[packageKey] || SUPPORT_POLICIES.start
}

function supportPolicyForLicense(license = {}) {
  return supportPolicyForPackage(license?.pachet)
}

module.exports = { SUPPORT_POLICIES, supportPolicyForLicense, supportPolicyForPackage }
