const express = require('express')
const crypto = require('crypto')
const xlsx = require('xlsx')
const { requireAuth } = require('../../core/auth')
const { requirePermission } = require('../../core/permissions')
const { readDb, writeDb } = require('../../core/db')
const { addAudit } = require('../../core/audit')

const router = express.Router()

const SEED_WASTE_CODES = [
  ['13 02 05*', 'Uleiuri minerale neclorurate de motor, de transmisie si de ungere', 'proddes', true],
  ['15 01 01', 'Ambalaje de hartie si carton', 'proddes', false],
  ['15 01 02', 'Ambalaje de materiale plastice', 'proddes', false],
  ['15 01 10*', 'Ambalaje care contin reziduuri de substante periculoase', 'proddes', true],
  ['16 01 03', 'Anvelope scoase din uz', 'proddes', false],
  ['16 06 01*', 'Baterii cu plumb', 'proddes', true],
  ['17 03 02', 'Mixturi asfaltice, altele decat cele specificate la 17 03 01', 'proddes', false],
  ['17 05 04', 'Pamant si pietre, altele decat cele specificate la 17 05 03', 'proddes', false],
  ['20 01 01', 'Hartie si carton', 'mun', false],
  ['20 01 02', 'Sticla', 'mun', false],
  ['20 01 08', 'Deseuri biodegradabile de la bucatarii si cantine', 'mun', false],
  ['20 01 39', 'Materiale plastice', 'mun', false],
  ['20 02 01', 'Deseuri biodegradabile', 'mun', false],
  ['20 03 01', 'Deseuri municipale amestecate', 'mun', false],
  ['20 03 07', 'Deseuri voluminoase', 'mun', false]
]

function now() {
  return new Date().toISOString()
}

function today() {
  return now().slice(0, 10)
}

function idFor(list) {
  return (list.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) || 0) + 1
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex')
}

function daysUntil(value) {
  if (!value) return null
  const target = new Date(value)
  if (Number.isNaN(target.getTime())) return null
  return Math.ceil((target.getTime() - Date.now()) / 86400000)
}

function norm(value) {
  return String(value || '').trim().toLowerCase()
}

function number(value) {
  const parsed = Number(String(value ?? 0).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function yearOf(item) {
  const value = item?.data || item?.date || item?.created_at || item?.createdAt || item?.timestamp
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.getFullYear()
}

function ensureDb(db) {
  db.environment = db.environment || {}
  const env = db.environment
  env.autorizatii = Array.isArray(env.autorizatii) ? env.autorizatii : []
  env.coduriDeseuri = Array.isArray(env.coduriDeseuri) ? env.coduriDeseuri : []
  env.deseuri = Array.isArray(env.deseuri) ? env.deseuri : []
  env.deseuriMunicipale = Array.isArray(env.deseuriMunicipale) ? env.deseuriMunicipale : []
  env.emisii = Array.isArray(env.emisii) ? env.emisii : []
  env.monitorizare = Array.isArray(env.monitorizare) ? env.monitorizare : []
  env.incidente = Array.isArray(env.incidente) ? env.incidente : []

  // Compatibilitate cu denumirile vechi folosite de scheduler/UI vechi.
  env.permits = env.autorizatii
  env.monitoring = env.monitorizare
  env.incidents = env.incidente

  SEED_WASTE_CODES.forEach(([cod, denumire, tip, periculos]) => {
    if (!env.coduriDeseuri.some(item => item.cod === cod)) {
      env.coduriDeseuri.push({
        id: idFor(env.coduriDeseuri),
        cod,
        denumire,
        tip,
        periculos,
        activ: true,
        created_at: now()
      })
    }
  })

  if (!env.autorizatii.some(item => item.numar === '37/04.03.2020 REV 23.08.2024')) {
    env.autorizatii.push({
      id: idFor(env.autorizatii),
      uuid: uuid(),
      tip: 'Autorizatie de mediu',
      numar: '37/04.03.2020 REV 23.08.2024',
      data_emitere: '2024-08-23',
      data_expirare: '',
      emitent: 'Agentia pentru Protectia Mediului',
      conditii: 'Autorizație de mediu - monitorizare conform obligațiilor legale.',
      notificare_zile: 60,
      status: 'valida',
      created_at: now(),
      created_by: null
    })
  }

  return env
}

function decorateAutorizatie(item) {
  const zile = daysUntil(item.data_expirare)
  let status = item.status || 'valida'
  if (zile !== null) {
    if (zile < 0) status = 'expirata'
    else if (zile <= Number(item.notificare_zile || 60)) status = 'notificare'
    else status = 'valida'
  }
  return { ...item, zile_pana_expirare: zile, status }
}

function settings(db) {
  return db.settings || db.app_settings || db.core?.settings || {}
}

function setting(db, ...keys) {
  const source = settings(db)
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key]
  }
  return ''
}

function companyData(db) {
  return {
    firma: setting(db, 'company_name', 'companyName', 'firma', 'nume_companie') || 'Organizație Demo',
    cui: setting(db, 'company_cif', 'companyCif', 'cui', 'cif') || 'RO00000000',
    localitate: setting(db, 'company_city', 'companyCity', 'localitate') || 'București',
    judet: setting(db, 'company_county', 'companyCounty', 'judet') || 'Neamt',
    adresa: setting(db, 'company_address', 'companyAddress', 'adresa') || ''
  }
}

function usersWithEnvironmentAccess(db) {
  const users = db.users || db.core?.users || []
  return users.filter(user =>
    user.active !== false &&
    user.activ !== false &&
    (
      ['admin', 'superadmin', 'director', 'director_general', 'manager'].includes(String(user.role || '').toLowerCase()) ||
      (user.permissions || []).includes('environment:manage')
    )
  )
}

function queueNotification(db, payload) {
  db.notifications = Array.isArray(db.notifications) ? db.notifications : []
  const key = payload.key || `${payload.event}:${payload.entity_key || payload.message}`
  const exists = db.notifications.some(item => item.event === payload.event && item.entity_key === key && !item.read_at && item.read !== true)
  if (exists) return false
  const recipients = payload.recipients?.length ? payload.recipients : usersWithEnvironmentAccess(db).map(user => user.id)
  recipients.filter(Boolean).forEach(userId => {
    db.notifications.push({
      id: idFor(db.notifications),
      user_id: userId,
      event: payload.event,
      entity_key: key,
      title: payload.title,
      message: payload.message,
      data: payload.data || {},
      created_at: now(),
      read_at: null
    })
  })
  return true
}

function collectRows(db, paths) {
  return paths.flatMap(path => {
    const value = path.split('.').reduce((acc, key) => acc?.[key], db)
    return Array.isArray(value) ? value : []
  })
}

function sumFields(rows, an, fields) {
  const wanted = new Set(fields.map(norm))
  return rows.reduce((sum, row) => {
    const rowYear = yearOf(row)
    if (rowYear && Number(rowYear) !== Number(an)) return sum
    Object.entries(row || {}).forEach(([key, value]) => {
      if (wanted.has(norm(key))) sum += number(value)
    })
    return sum
  }, 0)
}

function generatePrecompletion(db, an) {
  const fleetRows = collectRows(db, ['fleet.tripLogs', 'fleet.trip_logs', 'tripLogs', 'faz', 'fleet.faz'])
  const productionRows = collectRows(db, [
    'production.consumptions',
    'production.consumption_items',
    'production.productionPlans',
    'production.asphaltSales',
    'consumptions',
    'asphaltSales'
  ])
  const env = ensureDb(db)
  return env.coduriDeseuri
    .filter(code => code.tip === 'proddes')
    .map(code => {
      let cantitate = 0
      let sursa = 'manual'
      if (code.cod === '13 02 05*') {
        cantitate = sumFields(fleetRows, an, ['ulei_motor', 'uleiMotor', 'motor_oil', 'ulei', 'ulei_uzat'])
        sursa = 'FAZ / Mecanizare'
      }
      if (code.cod === '17 03 02') {
        cantitate = sumFields(productionRows, an, ['deseuri_asfalt', 'deseuriAsfalt', 'asphalt_waste', 'cantitate_asfalt_recuperat'])
        sursa = 'Productie asfalt'
      }
      return {
        id: `pre-${code.cod}`,
        an: Number(an),
        cod_deseu: code.cod,
        denumire: code.denumire,
        cantitate_gen: Number(cantitate.toFixed(3)),
        cantitate_valorificata: 0,
        cantitate_eliminata: 0,
        stoc_final: 0,
        operator_valorificare: '',
        operator_eliminare: '',
        sursa_auto: sursa,
        observatii: cantitate ? 'Precompletat automat din date operationale.' : ''
      }
    })
}

function alertsFor(db) {
  const env = ensureDb(db)
  const urgent = []
  const atentie = []
  const raportari = []
  const currentYear = new Date().getFullYear()

  env.autorizatii.map(decorateAutorizatie).forEach(auth => {
    if (auth.status === 'expirata') urgent.push({ tip: 'autorizatie', mesaj: `${auth.tip} ${auth.numar} este expirata`, item: auth })
    else if (auth.status === 'notificare') atentie.push({ tip: 'autorizatie', mesaj: `${auth.tip} ${auth.numar} expira in ${auth.zile_pana_expirare} zile`, item: auth })
  })

  env.monitorizare.filter(row => row.depasit).forEach(row => {
    urgent.push({ tip: 'monitorizare', mesaj: `${row.indicator} depasit la ${row.punct}: ${row.valoare} ${row.um || ''}`, item: row })
  })

  env.incidente.filter(row => !['inchis', 'rezolvat'].includes(row.status)).forEach(row => {
    if (['mare', 'critica', 'urgent'].includes(norm(row.gravitate))) urgent.push({ tip: 'incident', mesaj: `Incident ${row.gravitate}: ${row.tip} - ${row.locatie}`, item: row })
    else atentie.push({ tip: 'incident', mesaj: `Incident deschis: ${row.tip} - ${row.locatie}`, item: row })
  })

  if (!env.deseuri.some(row => Number(row.an) === currentYear)) {
    raportari.push({ tip: 'proddes', mesaj: `Raportarea PRODDES ${currentYear} nu are inregistrari.` })
  }
  if (!env.deseuriMunicipale.some(row => Number(row.an) === currentYear)) {
    raportari.push({ tip: 'mun', mesaj: `Raportarea deseuri municipale ${currentYear} nu are inregistrari.` })
  }

  return { urgent, atentie, raportari, total: urgent.length + atentie.length + raportari.length }
}

function audit(db, req, action, entity, id, details) {
  try {
    db.audit = Array.isArray(db.audit) ? db.audit : []
    addAudit(db, req.user || { id: req.user?.id || 'system', name: 'Sistem', role: 'system' }, action, { entity, id, details })
  } catch (_) {
    // Auditul nu trebuie sa blocheze operarea modulului.
  }
}

function workbookBuffer(workbook, bookType = 'xls') {
  return xlsx.write(workbook, { type: 'buffer', bookType })
}

function sendWorkbook(res, workbook, filename) {
  res.setHeader('Content-Type', 'application/vnd.ms-excel')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(workbookBuffer(workbook))
}

function setSheet(workbook, name, rows) {
  const sheet = xlsx.utils.aoa_to_sheet(rows)
  xlsx.utils.book_append_sheet(workbook, sheet, name.slice(0, 31))
}

function requireEnvironmentAuth(req, res, next) {
  const auth = requireAuth(req, res)
  if (!auth) return
  req.auth = auth
  next()
}

function can(permission) {
  return (req, res, next) => {
    if (!requirePermission(req.auth, res, permission)) return
    next()
  }
}

router.use(requireEnvironmentAuth)

router.get('/environment/autorizatii', can('environment:view'), (req, res) => {
  const db = readDb()
  const env = ensureDb(db)
  writeDb(db)
  res.json(env.autorizatii.map(decorateAutorizatie))
})

router.post('/environment/autorizatii', can('environment:manage'), (req, res) => {
  const db = readDb()
  const env = ensureDb(db)
  const item = decorateAutorizatie({
    id: idFor(env.autorizatii),
    uuid: uuid(),
    tip: req.body.tip || 'Autorizatie de mediu',
    numar: req.body.numar || '',
    data_emitere: req.body.data_emitere || today(),
    data_expirare: req.body.data_expirare || '',
    emitent: req.body.emitent || '',
    conditii: req.body.conditii || '',
    notificare_zile: number(req.body.notificare_zile || 60),
    status: req.body.status || 'valida',
    fisier_path: req.body.fisier_path || '',
    created_at: now(),
    created_by: req.user?.id || null
  })
  env.autorizatii.push(item)
  audit(db, req, 'create', 'environment.autorizatii', item.id, item)
  writeDb(db)
  res.status(201).json(item)
})

router.put('/environment/autorizatii/:id', can('environment:manage'), (req, res) => {
  const db = readDb()
  const env = ensureDb(db)
  const item = env.autorizatii.find(row => String(row.id) === String(req.params.id) || String(row.uuid) === String(req.params.id))
  if (!item) return res.status(404).json({ error: 'Autorizatia nu a fost gasita' })
  Object.assign(item, req.body, { updated_at: now() })
  const decorated = decorateAutorizatie(item)
  Object.assign(item, decorated)
  audit(db, req, 'update', 'environment.autorizatii', item.id, req.body)
  writeDb(db)
  res.json(decorated)
})

router.get('/environment/deseuri', can('environment:view'), (req, res) => {
  const db = readDb()
  const env = ensureDb(db)
  const an = Number(req.query.an || new Date().getFullYear())
  const tip = req.query.tip === 'mun' ? 'mun' : 'proddes'
  const rows = (tip === 'mun' ? env.deseuriMunicipale : env.deseuri).filter(row => Number(row.an) === an)
  res.json({ an, tip, coduri: env.coduriDeseuri.filter(code => code.tip === tip && code.activ !== false), rows })
})

router.get('/environment/deseuri/precompl', can('environment:view'), (req, res) => {
  const db = readDb()
  const an = Number(req.query.an || new Date().getFullYear())
  res.json({ an, rows: generatePrecompletion(db, an) })
})

router.post('/environment/deseuri', can('environment:manage'), (req, res) => {
  const db = readDb()
  const env = ensureDb(db)
  const tip = req.body.tip === 'mun' ? 'mun' : 'proddes'
  const list = tip === 'mun' ? env.deseuriMunicipale : env.deseuri
  const item = {
    ...req.body,
    id: idFor(list),
    an: Number(req.body.an || new Date().getFullYear()),
    created_at: now(),
    created_by: req.user?.id || null
  }
  list.push(item)
  audit(db, req, 'create', `environment.${tip === 'mun' ? 'deseuri_municipale' : 'deseuri'}`, item.id, item)
  writeDb(db)
  res.status(201).json(item)
})

router.post('/environment/deseuri/:id', can('environment:manage'), (req, res) => {
  const db = readDb()
  const env = ensureDb(db)
  const tip = req.body.tip === 'mun' || req.query.tip === 'mun' ? 'mun' : 'proddes'
  const list = tip === 'mun' ? env.deseuriMunicipale : env.deseuri
  const item = list.find(row => String(row.id) === String(req.params.id))
  if (!item) return res.status(404).json({ error: 'Inregistrarea de deseu nu a fost gasita' })
  Object.assign(item, req.body, { updated_at: now() })
  audit(db, req, 'update', `environment.${tip === 'mun' ? 'deseuri_municipale' : 'deseuri'}`, item.id, req.body)
  writeDb(db)
  res.json(item)
})

router.put('/environment/deseuri/:id', can('environment:manage'), (req, res) => {
  const db = readDb()
  const env = ensureDb(db)
  const tip = req.body.tip === 'mun' || req.query.tip === 'mun' ? 'mun' : 'proddes'
  const list = tip === 'mun' ? env.deseuriMunicipale : env.deseuri
  const item = list.find(row => String(row.id) === String(req.params.id))
  if (!item) return res.status(404).json({ error: 'Inregistrarea de deseu nu a fost gasita' })
  Object.assign(item, req.body, { updated_at: now() })
  audit(db, req, 'update', `environment.${tip === 'mun' ? 'deseuri_municipale' : 'deseuri'}`, item.id, req.body)
  writeDb(db)
  res.json(item)
})

router.get('/environment/emisii', can('environment:view'), (req, res) => {
  const db = readDb()
  const env = ensureDb(db)
  const an = Number(req.query.an || new Date().getFullYear())
  res.json(env.emisii.filter(row => Number(row.an) === an))
})

router.post('/environment/emisii', can('environment:manage'), (req, res) => {
  const db = readDb()
  const env = ensureDb(db)
  const item = {
    id: idFor(env.emisii),
    an: Number(req.body.an || new Date().getFullYear()),
    sursa: req.body.sursa || '',
    poluant: req.body.poluant || '',
    cantitate: number(req.body.cantitate),
    um: req.body.um || 'kg',
    metoda_calcul: req.body.metoda_calcul || '',
    observatii: req.body.observatii || '',
    created_at: now(),
    created_by: req.user?.id || null
  }
  env.emisii.push(item)
  audit(db, req, 'create', 'environment.emisii', item.id, item)
  writeDb(db)
  res.status(201).json(item)
})

router.get('/environment/monitorizare', can('environment:view'), (req, res) => {
  const db = readDb()
  const env = ensureDb(db)
  res.json(env.monitorizare)
})

router.post('/environment/monitorizare', can('environment:manage'), (req, res) => {
  const db = readDb()
  const env = ensureDb(db)
  const limita = req.body.limita === '' || req.body.limita === undefined ? null : number(req.body.limita)
  const valoare = number(req.body.valoare)
  const depasit = req.body.depasit === true || req.body.depasit === 'true' || (limita !== null && valoare > limita)
  const item = {
    id: idFor(env.monitorizare),
    data: req.body.data || today(),
    punct: req.body.punct || '',
    indicator: req.body.indicator || '',
    valoare,
    limita,
    um: req.body.um || '',
    depasit,
    masuri: req.body.masuri || '',
    created_at: now(),
    created_by: req.user?.id || null
  }
  env.monitorizare.push(item)
  if (depasit) {
    queueNotification(db, {
      event: 'environment_monitoring_exceeded',
      key: `environment_monitoring_exceeded:${item.id}`,
      title: 'Depasire indicator mediu',
      message: `${item.indicator} a depasit limita la ${item.punct}.`,
      data: item
    })
  }
  audit(db, req, 'create', 'environment.monitorizare', item.id, item)
  writeDb(db)
  res.status(201).json(item)
})

router.get('/environment/incidente', can('environment:view'), (req, res) => {
  const db = readDb()
  const env = ensureDb(db)
  res.json(env.incidente)
})

router.get('/environment/incidente/:uuid', can('environment:view'), (req, res) => {
  const db = readDb()
  const env = ensureDb(db)
  const item = env.incidente.find(row => String(row.uuid) === String(req.params.uuid) || String(row.id) === String(req.params.uuid))
  if (!item) return res.status(404).json({ error: 'Incidentul nu a fost gasit' })
  res.json(item)
})

router.post('/environment/incidente', can('environment:manage'), (req, res) => {
  const db = readDb()
  const env = ensureDb(db)
  const item = {
    id: idFor(env.incidente),
    uuid: uuid(),
    data: req.body.data || now(),
    locatie: req.body.locatie || '',
    tip: req.body.tip || '',
    descriere: req.body.descriere || '',
    gravitate: req.body.gravitate || 'medie',
    masuri: req.body.masuri || '',
    responsabil_id: req.body.responsabil_id || null,
    status: req.body.status || 'deschis',
    created_at: now(),
    created_by: req.user?.id || null
  }
  env.incidente.push(item)
  queueNotification(db, {
    event: 'environment_incident_open',
    key: `environment_incident:${item.uuid}`,
    title: 'Incident de mediu',
    message: `${item.tip} - ${item.locatie}`,
    data: item
  })
  audit(db, req, 'create', 'environment.incidente', item.uuid, item)
  writeDb(db)
  res.status(201).json(item)
})

router.put('/environment/incidente/:uuid', can('environment:manage'), (req, res) => {
  const db = readDb()
  const env = ensureDb(db)
  const item = env.incidente.find(row => String(row.uuid) === String(req.params.uuid) || String(row.id) === String(req.params.uuid))
  if (!item) return res.status(404).json({ error: 'Incidentul nu a fost gasit' })
  Object.assign(item, req.body, { updated_at: now() })
  if (['inchis', 'rezolvat'].includes(item.status) && !item.inchis_la) item.inchis_la = now()
  audit(db, req, 'update', 'environment.incidente', item.uuid, req.body)
  writeDb(db)
  res.json(item)
})

router.get('/environment/alerts', can('environment:view'), (req, res) => {
  const db = readDb()
  res.json(alertsFor(db))
})

router.get('/environment/export-sim-proddes', can('environment:view'), (req, res) => {
  const db = readDb()
  const env = ensureDb(db)
  const an = Number(req.query.an || new Date().getFullYear())
  const company = companyData(db)
  const rows = env.deseuri.filter(row => Number(row.an) === an)
  const wb = xlsx.utils.book_new()
  setSheet(wb, 'Date Identificare', [
    ['Denumire operator', company.firma],
    ['CUI', company.cui],
    ['Localitate', company.localitate],
    ['Judet', company.judet],
    ['An raportare', an]
  ])
  setSheet(wb, 'Date generale', [
    ['Indicator', 'Valoare'],
    ['Numar deseuri raportate', rows.length],
    ['Cantitate generata total', rows.reduce((sum, row) => sum + number(row.cantitate_gen), 0)]
  ])
  setSheet(wb, 'Tab1 Generare deseuri', [
    ['Cod deseu', 'Denumire', 'Cantitate generata (t)', 'Stoc final (t)', 'Sursa'],
    ...rows.map(row => [row.cod_deseu, row.denumire, number(row.cantitate_gen), number(row.stoc_final), row.sursa_auto || ''])
  ])
  setSheet(wb, 'Tab2 Valorificare deseuri', [
    ['Cod deseu', 'Denumire', 'Cantitate valorificata (t)', 'Operator valorificare'],
    ...rows.map(row => [row.cod_deseu, row.denumire, number(row.cantitate_valorificata), row.operator_valorificare || ''])
  ])
  setSheet(wb, 'Tab3 Eliminare deseuri', [
    ['Cod deseu', 'Denumire', 'Cantitate eliminata (t)', 'Operator eliminare'],
    ...rows.map(row => [row.cod_deseu, row.denumire, number(row.cantitate_eliminata), row.operator_eliminare || ''])
  ])
  setSheet(wb, 'Tab2a Operatori Valorificare', [
    ['Operator', 'Coduri deseuri'],
    ...Object.entries(rows.reduce((acc, row) => {
      if (!row.operator_valorificare) return acc
      acc[row.operator_valorificare] = [...(acc[row.operator_valorificare] || []), row.cod_deseu]
      return acc
    }, {})).map(([operator, codes]) => [operator, [...new Set(codes)].join(', ')])
  ])
  setSheet(wb, 'Tab3a Operatori Eliminare', [
    ['Operator', 'Coduri deseuri'],
    ...Object.entries(rows.reduce((acc, row) => {
      if (!row.operator_eliminare) return acc
      acc[row.operator_eliminare] = [...(acc[row.operator_eliminare] || []), row.cod_deseu]
      return acc
    }, {})).map(([operator, codes]) => [operator, [...new Set(codes)].join(', ')])
  ])
  sendWorkbook(res, wb, `GD-PRODDES-${String(company.cui).replace(/\W+/g, '')}-${an}.xls`)
})

router.get('/environment/export-sim-mun', can('environment:view'), (req, res) => {
  const db = readDb()
  const env = ensureDb(db)
  const an = Number(req.query.an || new Date().getFullYear())
  const company = companyData(db)
  const rows = env.deseuriMunicipale.filter(row => Number(row.an) === an)
  const wb = xlsx.utils.book_new()
  setSheet(wb, 'Date Identificare', [
    ['Denumire operator', company.firma],
    ['CUI', company.cui],
    ['Localitate', company.localitate],
    ['Judet', company.judet],
    ['An raportare', an]
  ])
  setSheet(wb, 'Deseuri municipale', [
    ['Luna', 'Localitate', 'Cod deseu', 'Denumire', 'Colectat (t)', 'Reciclat (t)', 'Depozitat (t)', 'Operator'],
    ...rows.map(row => [row.luna || '', row.localitate || '', row.cod_deseu, row.denumire, number(row.cantitate_colectata), number(row.cantitate_reciclata), number(row.cantitate_depozitata), row.operator || ''])
  ])
  setSheet(wb, 'Centralizator', [
    ['Indicator', 'Valoare'],
    ['Total colectat', rows.reduce((sum, row) => sum + number(row.cantitate_colectata), 0)],
    ['Total reciclat', rows.reduce((sum, row) => sum + number(row.cantitate_reciclata), 0)],
    ['Total depozitat', rows.reduce((sum, row) => sum + number(row.cantitate_depozitata), 0)]
  ])
  sendWorkbook(res, wb, `GD-MUN-${String(company.cui).replace(/\W+/g, '')}-${an}.xls`)
})

// Endpointuri vechi, pastrate ca alias pentru compatibilitate.
router.get('/environment/permits', can('environment:view'), (req, res) => {
  const db = readDb()
  res.json(ensureDb(db).autorizatii.map(decorateAutorizatie))
})

router.post('/environment/permits', can('environment:manage'), (req, res) => {
  req.url = '/environment/autorizatii'
  router.handle(req, res)
})

router.post('/environment/permits/:id/renew', can('environment:manage'), (req, res) => {
  const db = readDb()
  const env = ensureDb(db)
  const item = env.autorizatii.find(row => String(row.id) === String(req.params.id))
  if (!item) return res.status(404).json({ error: 'Autorizatia nu a fost gasita' })
  item.data_expirare = req.body.data_expirare || item.data_expirare
  item.status = 'valida'
  item.updated_at = now()
  writeDb(db)
  res.json(decorateAutorizatie(item))
})

router.get('/environment/waste-manifests', can('environment:view'), (req, res) => {
  const db = readDb()
  const env = ensureDb(db)
  res.json(env.deseuri)
})

router.get('/environment/monitoring', can('environment:view'), (req, res) => {
  const db = readDb()
  res.json(ensureDb(db).monitorizare)
})

router.post('/environment/monitoring', can('environment:manage'), (req, res) => {
  req.url = '/environment/monitorizare'
  router.handle(req, res)
})

router.get('/environment/incidents', can('environment:view'), (req, res) => {
  const db = readDb()
  res.json(ensureDb(db).incidente)
})

router.post('/environment/incidents', can('environment:manage'), (req, res) => {
  req.url = '/environment/incidente'
  router.handle(req, res)
})

module.exports = router

