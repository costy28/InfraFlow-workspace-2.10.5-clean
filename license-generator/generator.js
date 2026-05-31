const modules = [
  ['core', 'Core'],
  ['inventory', 'Inventory'],
  ['production', 'Production'],
  ['reports', 'Reports'],
  ['system', 'System'],
  ['fleet', 'Fleet'],
  ['hr', 'HR'],
  ['controlling', 'Controlling'],
  ['procurement', 'Procurement'],
  ['documents', 'Documents'],
  ['field', 'Field'],
  ['messaging', 'Messaging'],
  ['tickets', 'Tickets'],
  ['technical_plus', 'Technical+'],
  ['sanitation', 'Sanitation'],
  ['traffic_safety', 'TrafficSafety'],
  ['snow_removal', 'SnowRemoval'],
  ['environment', 'Environment'],
  ['legal', 'Legal'],
  ['archive', 'Archive'],
  ['secretariat', 'Secretariat'],
]

const addons = [
  ['ai_assistant', 'AI Assistant'],
  ['anaf_integration', 'ANAF Integration'],
  ['priority_support', 'Priority Support'],
]

const packages = {
  START: ['core', 'inventory', 'production', 'reports', 'system'],
  STANDARD: ['core', 'inventory', 'production', 'reports', 'system', 'fleet', 'hr', 'documents', 'messaging'],
  PROFESIONAL: ['core', 'inventory', 'production', 'reports', 'system', 'fleet', 'hr', 'controlling', 'procurement', 'documents', 'field', 'messaging', 'tickets', 'snow_removal'],
  ENTERPRISE: modules.map(([key]) => key),
}

let privateKeyPem = ''

const $ = id => document.getElementById(id)

function today() {
  return new Date().toISOString().slice(0, 10)
}

function addYears(dateString, years) {
  const date = new Date(dateString)
  date.setFullYear(date.getFullYear() + years)
  return date.toISOString().slice(0, 10)
}

function addDays(dateString, days) {
  const date = new Date(dateString)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function cleanCui(value) {
  return String(value || '').replace(/^RO/i, '').replace(/\D/g, '')
}

function randomPart() {
  const bytes = new Uint8Array(2)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
}

function generateId() {
  return `INFRAFLOW-${new Date().getFullYear()}-${randomPart()}-${randomPart()}`
}

function pemToArrayBuffer(pem) {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  bytes.forEach(byte => { binary += String.fromCharCode(byte) })
  return btoa(binary)
}

async function sha256Hex(text) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(hash)).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function checkedValues(containerId) {
  return Array.from(document.querySelectorAll(`#${containerId} input[type="checkbox"]:checked`)).map(input => input.value)
}

function renderChecks() {
  $('moduleChecks').innerHTML = modules.map(([value, label]) => `
    <label class="check"><input type="checkbox" value="${value}" data-module-check> ${label}</label>
  `).join('')
  $('addonChecks').innerHTML = addons.map(([value, label]) => `
    <label class="check"><input type="checkbox" value="${value}" data-addon-check> ${label}</label>
  `).join('')
}

function applyPackage(packageName) {
  const selected = new Set(packages[packageName] || packages.START)
  document.querySelectorAll('[data-module-check]').forEach(input => {
    input.checked = selected.has(input.value)
    input.disabled = ['core', 'inventory', 'production', 'reports', 'system'].includes(input.value)
  })
  if (packageName === 'ENTERPRISE') {
    document.querySelectorAll('[data-addon-check]').forEach(input => { input.checked = true })
  }
}

function buildPayload() {
  const selectedPackage = document.querySelector('input[name="package"]:checked')?.value || 'PROFESIONAL'
  return {
    licenseId: generateId(),
    client: {
      nume: $('clientName').value.trim(),
      cui: $('clientCui').value.trim(),
      localitate: $('clientCity').value.trim(),
      email: $('clientEmail').value.trim(),
    },
    pachet: selectedPackage,
    module: checkedValues('moduleChecks'),
    addons: checkedValues('addonChecks'),
    limite: {
      max_utilizatori: Number($('maxUsers').value || 0),
      max_dispozitive: Number($('maxDevices').value || 0),
      max_companii: Number($('maxCompanies').value || 0),
      max_depozite: Number($('maxWarehouses').value || 0),
    },
    valabilitate: {
      emis_la: $('issuedAt').value,
      expira_la: $('expiresAt').value,
      tip: $('validityType').value,
    },
    suport: {
      nivel: $('addonChecks').querySelector('input[value="priority_support"]')?.checked ? 'prioritar' : 'standard',
      expira_la: $('supportExpiresAt').value,
    },
    update: {
      permise: $('updatesAllowed').checked,
      canal: $('updateChannel').value,
      expira_la: $('updatesExpiresAt').value,
    },
    emis_de: 'InfraFlow Software',
  }
}

async function buildLicense() {
  if (!privateKeyPem) throw new Error('Importă mai întâi cheia privată private-key.pem.')
  const payload = buildPayload()
  const payloadStr = JSON.stringify(payload)
  const keyData = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    keyData,
    new TextEncoder().encode(payloadStr)
  )
  return {
    ...payload,
    payload_hash: await sha256Hex(payloadStr),
    semnatura: arrayBufferToBase64(signature),
  }
}

function preview(payload = buildPayload()) {
  $('preview').textContent = JSON.stringify(payload, null, 2)
}

function downloadLicense(license) {
  const safeCui = cleanCui(license.client.cui) || 'client'
  const fileName = `licenta-${safeCui}-${license.valabilitate.emis_la}.iflic`
  const blob = new Blob([JSON.stringify(license, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  $('generateStatus').textContent = `Generat: ${fileName}`
}

async function lookupAnaf() {
  const cui = cleanCui($('clientCui').value)
  if (!cui) {
    $('anafStatus').textContent = 'Introdu CUI-ul înainte de căutare.'
    return
  }
  $('anafStatus').textContent = 'Se caută în ANAF...'
  try {
    const response = await fetch('https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ cui: Number(cui), data: today() }]),
    })
    const data = await response.json()
    const found = data?.found?.[0] || data?.date_generale || null
    if (!found) {
      $('anafStatus').textContent = 'Nu am găsit date ANAF pentru acest CUI.'
      return
    }
    const general = found.date_generale || found
    $('clientName').value = general.denumire || general.nume || $('clientName').value
    $('clientCity').value = general.adr_tara || general.localitate || general.adr_localitate || $('clientCity').value
    $('anafStatus').textContent = 'Date ANAF precompletate.'
    preview()
  } catch (error) {
    $('anafStatus').textContent = `Eroare ANAF: ${error.message}`
  }
}

function setDefaultDates() {
  const issued = today()
  const expires = addYears(issued, 1)
  $('issuedAt').value = issued
  $('expiresAt').value = expires
  $('supportExpiresAt').value = expires
  $('updatesExpiresAt').value = expires
}

function init() {
  renderChecks()
  setDefaultDates()
  applyPackage('PROFESIONAL')
  preview()

  $('privateKeyFile').addEventListener('change', async event => {
    const file = event.target.files?.[0]
    privateKeyPem = file ? await file.text() : ''
    $('keyStatus').value = privateKeyPem ? `Încărcată: ${file.name}` : 'Nicio cheie încărcată'
  })

  document.querySelectorAll('input[name="package"]').forEach(input => {
    input.addEventListener('change', () => {
      applyPackage(input.value)
      preview()
    })
  })

  document.querySelectorAll('input, select, textarea').forEach(input => {
    input.addEventListener('input', () => preview())
    input.addEventListener('change', () => preview())
  })

  $('validityType').addEventListener('change', () => {
    if ($('validityType').value === 'perpetua') $('expiresAt').value = '2099-12-31'
    if ($('validityType').value === 'trial') $('expiresAt').value = addDays(today(), 30)
    preview()
  })

  $('anafLookupBtn').addEventListener('click', lookupAnaf)
  $('previewBtn').addEventListener('click', () => preview())
  $('generateBtn').addEventListener('click', async () => {
    $('generateStatus').textContent = ''
    try {
      const license = await buildLicense()
      $('preview').textContent = JSON.stringify(license, null, 2)
      downloadLicense(license)
    } catch (error) {
      $('generateStatus').textContent = error.message
    }
  })
}

init()
