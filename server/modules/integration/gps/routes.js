'use strict'

const { Router } = require('express')
const { requireAuth } = require('../../../core/auth')
const { decryptSettingSecret } = require('../../../core/settings-crypto')

const router = Router()

const GPS_BASE_URL = 'https://urmariregps.ro/new/libz/mysqli/ajax.php'
const GPS_FALLBACK_URL = 'https://urmariregps.ro/new/libz/php/ajax/ajax.php'
const SESSION_TTL = 50 * 60 * 1000

let gpsSession = { phpsessid: null, timestamp: 0 }

function gpsHeaders(session, extra = {}) {
  return {
    'Cookie': session ? `PHPSESSID=${session}` : '',
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': '*/*',
    'Accept-Language': 'ro-RO,ro;q=0.9',
    'Referer': 'https://urmariregps.ro/new/rapoarte.php',
    ...extra,
  }
}

function extractPhpsessid(setCookie = '', body = '') {
  const cookieMatch = String(setCookie).match(/PHPSESSID=([^;,\s]+)/i)
  if (cookieMatch?.[1] && cookieMatch[1] !== 'deleted') return cookieMatch[1]

  try {
    const json = JSON.parse(body)
    const sid = json.PHPSESSID || json.phpsessid || json.session || json.sesiune || json.token
    if (sid) return String(sid)
  } catch {
    // Răspuns non-JSON.
  }

  const text = String(body || '').trim()
  if (text.length > 8 && text.length < 128 && /^[a-zA-Z0-9]+$/.test(text)) return text
  return null
}

async function gpsLogin(username, password) {
  let initialSession = null

  try {
    const response = await fetch('https://urmariregps.ro/login.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://urmariregps.ro',
        'Referer': 'https://urmariregps.ro/index.php',
      },
      body: new URLSearchParams({ user: username, parola: password, submit: 'LOGIN' }),
      redirect: 'manual',
      signal: AbortSignal.timeout(12000),
    })
    const session = extractPhpsessid(response.headers.get('set-cookie') || '', '')
    console.log(
      `[GPS LOGIN] root login.php -> HTTP ${response.status}, ` +
      `location=${response.headers.get('location') || '-'}, ` +
      `session=${session ? session.slice(0, 8) + '...' : '(none)'}`
    )
    if (session && response.status >= 300 && response.status < 400) return session
  } catch (error) {
    console.warn('[GPS LOGIN] root login.php:', error.message)
  }

  try {
    const landing = await fetch('https://urmariregps.ro/new/', {
      method: 'GET',
      headers: gpsHeaders(null),
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    })
    const match = String(landing.headers.get('set-cookie') || '').match(/PHPSESSID=([^;,\s]+)/i)
    if (match) initialSession = match[1]
  } catch (error) {
    console.warn('[GPS LOGIN] GET /new/:', error.message)
  }

  const attempts = [
    { url: GPS_BASE_URL, body: { actiune: 'login', user: username, parola: password } },
    { url: GPS_FALLBACK_URL, body: { actiune: 'login', user: username, parola: password } },
    { url: 'https://urmariregps.ro/new/login.php', body: { user: username, parola: password, submit: '1' } },
    { url: 'https://urmariregps.ro/new/', body: { actiune: 'login', user: username, parola: password } },
  ]

  for (const attempt of attempts) {
    try {
      const headers = gpsHeaders(initialSession, {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://urmariregps.ro',
      })
      const response = await fetch(attempt.url, {
        method: 'POST',
        headers,
        body: new URLSearchParams(attempt.body),
        redirect: 'manual',
        signal: AbortSignal.timeout(12000),
      })
      const text = response.status === 302 ? '' : await response.text()
      const session = extractPhpsessid(response.headers.get('set-cookie') || '', text)

      console.log(
        `[GPS LOGIN] ${attempt.url} -> HTTP ${response.status}, ` +
        `session=${session ? session.slice(0, 8) + '...' : '(none)'}, body=${text.slice(0, 80)}`
      )

      if (session) return session
      if (
        response.status === 200 &&
        initialSession &&
        text &&
        !text.toLowerCase().includes('eroare') &&
        !text.toLowerCase().includes('error')
      ) {
        return initialSession
      }
    } catch (error) {
      console.warn('[GPS LOGIN] încercare eșuată:', attempt.url, error.message)
    }
  }

  return null
}

async function getGpsSession(settings) {
  const now = Date.now()
  if (gpsSession.phpsessid && now - gpsSession.timestamp < SESSION_TTL) return gpsSession.phpsessid

  const username = decryptSettingSecret(settings.gps_username || '')
  const password = decryptSettingSecret(settings.gps_password || '')
  if (!username || !password) return null

  const phpsessid = await gpsLogin(username, password)
  if (phpsessid) gpsSession = { phpsessid, timestamp: now }
  return phpsessid
}

function parseNumber(value) {
  const text = String(value ?? '').trim().replace(',', '.')
  const number = Number(text)
  return Number.isFinite(number) ? number : 0
}

function toArray(value) {
  if (Array.isArray(value)) return value
  if (value == null || value === '') return []
  return String(value).split(',').map(item => item.trim())
}

function firstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return value
  }
  return ''
}

function normalizeVehicle(raw = {}) {
  const attrs = raw.$ || {}
  const nr = firstValue(
    raw.nr, raw.numar, raw.nr_inmatriculare, raw.registration, raw.plate, raw.number, raw.name, raw.denumire, raw.title,
    raw.label, raw.nrAuto, raw.nrInm, raw.cod, raw.id, raw.NumarInmatriculare,
    attrs.nr, attrs.numar, attrs.plate, attrs.number, attrs.name, attrs.denumire,
    attrs.title, attrs.label, attrs.id, attrs.cod
  )
  const lat = parseNumber(firstValue(raw.lat, raw.la, raw.latitude, raw.latitudine, attrs.lat, attrs.la, attrs.latitude, attrs.latitudine))
  const lng = parseNumber(firstValue(raw.lng, raw.lon, raw.lo, raw.longitude, raw.longitudine, attrs.lng, attrs.lon, attrs.lo, attrs.longitude, attrs.longitudine))
  const speed = parseNumber(firstValue(raw.speed, raw.viteza, raw.vit, raw.viteza_km, raw.viteza_kmh, attrs.speed, attrs.viteza, attrs.vit))
  const motorValue = String(firstValue(raw.motor, raw.contact, raw.engine, attrs.motor, attrs.contact)).toLowerCase()
  const motor = ['1', 'true', 'on', 'pornit', 'yes', 'activ'].includes(motorValue)

  return {
    nr_inmatriculare: String(nr || '').trim(),
    lat,
    lng,
    viteza_kmh: speed,
    motor,
    locatie: String(firstValue(raw.locatie, raw.location, raw.address, raw.adresa, attrs.locatie, attrs.location, attrs.address)),
    ultima_actualizare: String(firstValue(raw.time, raw.timestamp, raw.time_end, raw.data_ora, attrs.time, attrs.timestamp)),
    status: speed > 2 ? 'in_miscare' : motor ? 'stationat' : 'oprit',
  }
}

function isValidVehicle(vehicle) {
  return !!(vehicle.nr_inmatriculare || (vehicle.lat !== 0 && vehicle.lng !== 0))
}

async function parseXmlVehicles(text) {
  let parsed = null
  try {
    const xml2js = require('xml2js')
    parsed = await xml2js.parseStringPromise(text, {
      explicitArray: false,
      ignoreAttrs: false,
      mergeAttrs: false,
    })
  } catch (error) {
    console.warn('[GPS XML] xml2js:', error.message)
  }

  if (parsed) {
    const candidateKeys = ['marker', 'vehicle', 'car', 'vehicul', 'utilaj', 'auto', 'item', 'row', 'v', 'entry']
    const findItems = (obj, depth = 0) => {
      if (!obj || typeof obj !== 'object' || depth > 7) return null
      for (const key of candidateKeys) {
        if (obj[key] !== undefined) return Array.isArray(obj[key]) ? obj[key] : [obj[key]]
      }
      for (const value of Object.values(obj)) {
        const found = findItems(value, depth + 1)
        if (found) return found
      }
      return null
    }
    const items = findItems(parsed)
    if (items) {
      const vehicles = items.map(normalizeVehicle).filter(isValidVehicle)
      if (vehicles.length) return vehicles
    }
  }

  const tagRegex = /<([a-zA-Z][a-zA-Z0-9_-]*)\b([^>]*?)\/?>/gi
  const candidates = []
  for (const match of text.matchAll(tagRegex)) {
    const attrs = {}
    for (const attr of match[2].matchAll(/([a-zA-Z0-9_-]+)=["']([^"']*)["']/g)) attrs[attr[1]] = attr[2]
    if ((attrs.lat || attrs.la || attrs.latitude) && (attrs.lng || attrs.lo || attrs.longitude)) {
      candidates.push({ $: attrs })
    }
  }

  return candidates.map(normalizeVehicle).filter(isValidVehicle)
}

function parseJsonVehicles(text) {
  const json = JSON.parse(text)

  const plates = toArray(json.numar || json.nr || json.plate)
  if (plates.length) {
    const lat = toArray(json.la_al || json.lat || json.la)
    const lng = toArray(json.lo_al || json.lng || json.lo)
    const speed = toArray(json.viteze || json.speed || json.vit)
    const motor = toArray(json.motor || json.contact)
    const locatie = toArray(json.locatie || json.location)
    const time = toArray(json.time_end || json.time || json.timestamp)
    const ids = toArray(json.id || json.cod)

    return plates.map((nr, index) => normalizeVehicle({
      nr,
      id: ids[index],
      lat: lat[index],
      lng: lng[index],
      speed: speed[index],
      motor: motor[index],
      locatie: locatie[index],
      time: time[index],
    })).filter(isValidVehicle)
  }

  if (Array.isArray(json)) return json.map(normalizeVehicle).filter(isValidVehicle)

  for (const key of ['markers', 'vehicule', 'vehicles', 'data', 'items', 'list', 'rows', 'records', 'result', 'pozitii', 'cars']) {
    if (Array.isArray(json[key])) {
      const vehicles = json[key].map(normalizeVehicle).filter(isValidVehicle)
      if (vehicles.length) return vehicles
    }
  }

  const values = Object.values(json)
  if (values.length && values.length < 500 && values[0] && typeof values[0] === 'object' && !Array.isArray(values[0])) {
    const first = values[0]
    if (first.lat || first.la || first.lng || first.lo || first.latitude || first.longitude) {
      return Object.entries(json).map(([key, value]) =>
        normalizeVehicle({ ...value, nr: value.nr || value.numar || value.plate || key })
      ).filter(isValidVehicle)
    }
  }

  return []
}

function gpsProvider(settings) {
  return String(settings.gps_provider || 'urmariregps.ro').trim().toLowerCase()
}

function isCustomProvider(settings) {
  return gpsProvider(settings) !== 'urmariregps.ro'
}

async function fetchCustomVehicles(settings) {
  const url = String(settings.gps_api_url || '').trim()
  if (!url) throw new Error('Completează URL API vehicule pentru furnizorul GPS alternativ.')
  const apiKey = decryptSettingSecret(settings.gps_api_key || '')
  const response = await fetch(url, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}`, Accept: 'application/json, application/xml, text/xml' } : {},
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`Furnizorul GPS a răspuns HTTP ${response.status}.`)
  const text = await response.text()
  const trimmed = text.trim()
  const vehicles = trimmed.startsWith('<')
    ? await parseXmlVehicles(trimmed)
    : trimmed.startsWith('{') || trimmed.startsWith('[')
      ? parseJsonVehicles(trimmed)
      : []
  return { vehicles, text: trimmed, status: response.status }
}

async function readVehiclesFromResponse(response, label) {
  const text = await response.text()
  const trimmed = text.trim()
  console.log(`[GPS] ${label} -> HTTP ${response.status}, ${trimmed.length} chars: ${trimmed.slice(0, 150)}`)

  if (!trimmed || trimmed.length < 3) return null
  if (trimmed.toLowerCase().startsWith('<!doctype') || trimmed.toLowerCase().startsWith('<html')) {
    gpsSession = { phpsessid: null, timestamp: 0 }
    return null
  }

  let vehicles = []
  if (trimmed.startsWith('<')) {
    vehicles = await parseXmlVehicles(trimmed)
  } else if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    vehicles = parseJsonVehicles(trimmed)
  }

  if (vehicles.length) {
    console.log(`[GPS] ${label} -> ${vehicles.length} vehicule. Primul: ${JSON.stringify(vehicles[0])}`)
    return vehicles
  }

  if (trimmed.length > 20) console.warn(`[GPS] ${label}: date primite, 0 vehicule parsate. Preview: ${trimmed.slice(0, 500)}`)
  return null
}

async function fetchGpsGet(session, userId, params = {}, timeout = 10000) {
  const query = new URLSearchParams({ ...params, user: userId, ses: Date.now().toString() })
  return fetch(`${GPS_BASE_URL}?${query}`, {
    method: 'GET',
    headers: gpsHeaders(session),
    redirect: 'follow',
    signal: AbortSignal.timeout(timeout),
  })
}

async function fetchGpsGetGrupuri(session, userId, grupuri, params = {}, timeout = 10000) {
  const query = new URLSearchParams({ grupuri, user: userId, ses: Date.now().toString(), ...params })
  return fetch(`${GPS_BASE_URL}?${query}`, {
    method: 'GET',
    headers: gpsHeaders(session),
    redirect: 'follow',
    signal: AbortSignal.timeout(timeout),
  })
}

async function fetchGpsPost(session, userId, params = {}, timeout = 10000) {
  const body = new URLSearchParams({ ses: Date.now().toString(), user: userId, ...params })
  return fetch(GPS_BASE_URL, {
    method: 'POST',
    headers: gpsHeaders(session, {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': 'https://urmariregps.ro',
    }),
    body,
    redirect: 'follow',
    signal: AbortSignal.timeout(timeout),
  })
}

function todayRangeForGps() {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const day = `${yyyy}-${mm}-${dd}`
  return {
    start_data: `${day} 00:00`,
    end_data: `${day} 23:59`,
  }
}

async function fetchGpsLiveMap(session, settings, timeout = 15000) {
  const username = decryptSettingSecret(settings.gps_username || '')
  const userId = String(settings.gps_user_id || '120').trim()
  const body = new URLSearchParams({
    data_in: `data_in_${username}`,
    ...todayRangeForGps(),
    gps: '%',
    client: userId,
  })
  return fetch(GPS_BASE_URL, {
    method: 'POST',
    headers: gpsHeaders(session, {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': 'https://urmariregps.ro',
    }),
    body,
    redirect: 'follow',
    signal: AbortSignal.timeout(timeout),
  })
}

async function fetchVehicles(session, settings) {
  const userId = String(settings.gps_user_id || '120').trim()
  const actions = [...new Set([
    settings.gps_actiune_functionala,
    'pozitii_vehicule',
    'incarca_pozitii',
    'get_vehicles',
    'live_map',
    'incarca_grupuri',
    'pozitii',
    'getMarkers',
    'vehicles_position',
    'get_positions',
    'refresh',
  ].filter(Boolean))]

  try {
    const vehicles = await readVehiclesFromResponse(
      await fetchGpsLiveMap(session, settings),
      'POST live map data_in'
    )
    if (vehicles) return { vehicles, action: 'data_in/live-map' }
  } catch (error) {
    console.warn('[GPS] POST live map data_in:', error.message)
  }

  for (const grupuri of ['1', '0', '']) {
    try {
      const vehicles = await readVehiclesFromResponse(
        await fetchGpsGetGrupuri(session, userId, grupuri),
        `GET grupuri=${grupuri || '(gol)'}`
      )
      if (vehicles) return { vehicles, action: `grupuri=${grupuri || '(gol)'}` }
    } catch (error) {
      console.warn('[GPS] GET grupuri:', grupuri, error.message)
    }
  }

  for (const action of actions) {
    for (const grupuri of ['1', '0', '']) {
      try {
        const vehicles = await readVehiclesFromResponse(
          await fetchGpsGetGrupuri(session, userId, grupuri, { actiune: action }),
          `GET ${action} grupuri=${grupuri || '(gol)'}`
        )
        if (vehicles) return { vehicles, action }
      } catch (error) {
        console.warn('[GPS] GET action+grupuri:', action, grupuri, error.message)
      }
    }
  }

  for (const action of actions) {
    try {
      const vehicles = await readVehiclesFromResponse(
        await fetchGpsGet(session, userId, { actiune: action }),
        `GET ${action}`
      )
      if (vehicles) return { vehicles, action }
    } catch (error) {
      console.warn('[GPS] GET action:', action, error.message)
    }
  }

  for (const action of actions) {
    try {
      const vehicles = await readVehiclesFromResponse(
        await fetchGpsPost(session, userId, { actiune: action }),
        `POST ${action}`
      )
      if (vehicles) return { vehicles, action }
    } catch (error) {
      console.warn('[GPS] POST action:', action, error.message)
    }
  }

  return { vehicles: [], action: null }
}

router.get('/integration/gps/live', async (req, res) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return

    const settings = auth.db.settings || {}
    if (isCustomProvider(settings)) {
      const { vehicles } = await fetchCustomVehicles(settings)
      return res.json({
        configurate: true,
        furnizor: gpsProvider(settings),
        vehicule: vehicles,
        total: vehicles.length,
        actualizat_la: new Date().toISOString(),
        debug_hint: vehicles.length === 0 ? 'API-ul furnizorului a răspuns, dar nu s-au putut extrage vehicule din JSON/XML.' : null,
      })
    }
    const username = decryptSettingSecret(settings.gps_username || '')
    const password = decryptSettingSecret(settings.gps_password || '')
    if (!username || !password) {
      return res.json({
        configurate: false,
        mesaj: 'Configurează utilizator și parolă urmariregps.ro în Setări → General',
      })
    }

    let session = await getGpsSession(settings)
    if (!session) {
      return res.json({
        configurate: true,
        login_failed: true,
        vehicule: [],
        total: 0,
        mesaj: 'Autentificare eșuată la urmariregps.ro — verifică datele de conectare.',
        actualizat_la: new Date().toISOString(),
      })
    }

    let { vehicles, action } = await fetchVehicles(session, settings)
    if (!vehicles.length && !gpsSession.phpsessid) {
      session = await getGpsSession(settings)
      if (session) ({ vehicles, action } = await fetchVehicles(session, settings))
    }

    if (action) settings.gps_actiune_functionala = action

    return res.json({
      configurate: true,
      vehicule: vehicles,
      total: vehicles.length,
      actiune_folosita: action,
      actualizat_la: new Date().toISOString(),
      debug_hint: vehicles.length === 0
        ? 'Login reușit, dar nu s-au putut extrage vehicule. Folosește /api/integration/gps/raw pentru răspunsul brut.'
        : null,
    })
  } catch (error) {
    console.error('[GPS] Error:', error.message)
    res.json({ configurate: false, eroare: error.message })
  }
})

router.post('/integration/gps/test', async (req, res) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return

    const settings = auth.db.settings || {}
    if (isCustomProvider(settings)) {
      const { vehicles } = await fetchCustomVehicles(settings)
      return res.json({ ok: true, furnizor: gpsProvider(settings), vehicule: vehicles.length })
    }
    gpsSession = { phpsessid: null, timestamp: 0 }
    const session = await getGpsSession(settings)
    if (!session) return res.json({ ok: false, error: 'Autentificare GPS eșuată.' })

    const { vehicles, action } = await fetchVehicles(session, settings)
    res.json({ ok: true, vehicule: vehicles.length, actiune_folosita: action })
  } catch (error) {
    res.json({ ok: false, error: error.message })
  }
})

router.get('/integration/gps/raw', async (req, res) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!['superadmin', 'admin'].includes(auth.user.role)) return res.status(403).json({ error: 'Acces interzis' })

    const settings = auth.db.settings || {}
    if (isCustomProvider(settings)) {
      const { vehicles, text, status } = await fetchCustomVehicles(settings)
      return res.json({
        actiune: 'custom-api',
        furnizor: gpsProvider(settings),
        http_status: status,
        raw_length: text.length,
        tip_raspuns: text.startsWith('<') ? 'XML' : text.startsWith('{') || text.startsWith('[') ? 'JSON' : 'text',
        vehicule_parsate: vehicles.length,
        raw_body: text,
      })
    }
    const session = await getGpsSession(settings)
    if (!session) return res.json({ error: 'Nu există sesiune GPS. Verifică datele de conectare.' })

    const action = String(req.query.actiune || 'data_in')
    const userId = req.query.user !== undefined ? String(req.query.user || '') : String(settings.gps_user_id || '120')
    const response = action === 'data_in'
      ? await fetchGpsLiveMap(session, settings, 15000)
      : await fetchGpsGetGrupuri(session, userId, String(req.query.grupuri ?? '1'), { actiune: action }, 15000)
    const text = await response.text()
    const trimmed = text.trim()

    let parsedCount = 0
    let parseError = null
    try {
      parsedCount = trimmed.startsWith('<')
        ? (await parseXmlVehicles(trimmed)).length
        : trimmed.startsWith('{') || trimmed.startsWith('[')
          ? parseJsonVehicles(trimmed).length
          : 0
    } catch (error) {
      parseError = error.message
    }

    res.json({
      actiune: action,
      user_id: userId,
      http_status: response.status,
      raw_length: trimmed.length,
      tip_raspuns: trimmed.startsWith('<') ? 'XML' : trimmed.startsWith('{') || trimmed.startsWith('[') ? 'JSON' : 'text',
      vehicule_parsate: parsedCount,
      parse_error: parseError,
      raw_body: trimmed,
    })
  } catch (error) {
    res.json({ error: error.message })
  }
})

module.exports = router
