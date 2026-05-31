const MC_PER_CUPA = 0.8 // mc/cupa - din jurnal oficial
const DENSITATE_NISIP = 1.6 // to/mc - din jurnal oficial
const DENSITATE_SARE = 1.2 // to/mc - din jurnal oficial
const DENSITATE_CACL = 1.2 // to/mc - din jurnal oficial
const KG_PER_SAC_CACL = 25 // kg/sac - din jurnal oficial
const FACTOR_PRACTIC = 0.625 // 600kg/960kg - valoare validata teren

function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function parseTimeToMinutes(value) {
  if (value instanceof Date) {
    return value.getHours() * 60 + value.getMinutes() + value.getSeconds() / 60
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (!match) return 0
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3] || 0)
  return hours * 60 + minutes + seconds / 60
}

function intervalMinutes(start, sfarsit) {
  let startMinutes = parseTimeToMinutes(start)
  let endMinutes = parseTimeToMinutes(sfarsit)
  if (endMinutes <= startMinutes) endMinutes += 24 * 60
  return Math.max(0, endMinutes - startMinutes)
}

function calcOre(start, sfarsit) {
  return intervalMinutes(start, sfarsit) / 60
}

function overlapsMinutes(startA, endA, startB, endB) {
  const start = Math.max(startA, startB)
  const end = Math.min(endA, endB)
  return Math.max(0, end - start)
}

function calcNisip(nr_cupe, factor = FACTOR_PRACTIC) {
  return toNumber(nr_cupe) * MC_PER_CUPA * DENSITATE_NISIP * toNumber(factor)
}

function calcSare(nr_cupe, factor = FACTOR_PRACTIC) {
  return toNumber(nr_cupe) * MC_PER_CUPA * DENSITATE_SARE * toNumber(factor)
}

function calcCacl(nr_cupe, factor = FACTOR_PRACTIC) {
  return toNumber(nr_cupe) * MC_PER_CUPA * DENSITATE_CACL * toNumber(factor)
}

function calcCaclDinSaci(nr_saci) {
  return toNumber(nr_saci) * KG_PER_SAC_CACL
}

function calcOreNoapte(oraStart, oraSfarsit) {
  const start = parseTimeToMinutes(oraStart)
  let end = parseTimeToMinutes(oraSfarsit)
  if (end <= start) end += 24 * 60

  let total = 0
  for (let day = 0; day <= Math.ceil(end / (24 * 60)); day += 1) {
    const base = day * 24 * 60
    total += overlapsMinutes(start, end, base, base + 6 * 60)
    total += overlapsMinutes(start, end, base + 22 * 60, base + 24 * 60)
  }
  return total / 60
}

function calculeazaStandby(log) {
  const ore = calcOre(log.ora_start, log.ora_sfarsit)
  const ore_noapte = calcOreNoapte(log.ora_start, log.ora_sfarsit)
  if (log.tip_standby === 'consemn_acasa') {
    return {
      ore_platite: 0,
      ore_noapte,
      tip: 'consemn',
      spor_consemn: true,
      spor_noapte: false
    }
  }
  return {
    ore_platite: ore,
    ore_noapte,
    tip: 'asteptare',
    spor_consemn: false,
    spor_noapte: ore_noapte > 0
  }
}

function totalizeazaFisaTraseu(linii, recipe) {
  let total_cupe_nisip = 0
  let total_cupe_sare = 0
  let total_cupe_cacl = 0
  let total_treceri = 0
  let lama_folosita = false

  for (const linie of linii || []) {
    const nrCupe = toNumber(linie.nr_cupe_material)
    if (linie.tip_material === 'nisip') total_cupe_nisip += nrCupe
    if (linie.tip_material === 'sare') total_cupe_sare += nrCupe
    if (linie.tip_material === 'cacl') total_cupe_cacl += nrCupe
    total_treceri += toNumber(linie.nr_treceri_lama) + toNumber(linie.nr_treceri_material)
    if (linie.lama) lama_folosita = true
  }

  const factor = recipe?.factor_corectie || FACTOR_PRACTIC
  return {
    total_cupe_nisip,
    total_cupe_sare,
    total_cupe_cacl,
    total_treceri,
    lama_folosita,
    nisip_to: calcNisip(total_cupe_nisip, factor),
    sare_to: calcSare(total_cupe_sare, factor),
    cacl_to: calcCacl(total_cupe_cacl, factor)
  }
}

function normalizeKey(key) {
  return String(key || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function pickValue(row, candidates) {
  const keys = Object.keys(row || {})
  for (const candidate of candidates) {
    const normalizedCandidate = normalizeKey(candidate)
    const key = keys.find((item) => normalizeKey(item).includes(normalizedCandidate))
    if (key) return row[key]
  }
  return undefined
}

function parseGpsNumber(value) {
  if (typeof value === 'number') return value
  const normalized = String(value || '').replace(',', '.').replace(/[^\d.-]/g, '')
  return toNumber(normalized)
}

function parseGpsDate(value) {
  if (value instanceof Date) return value
  const raw = String(value || '').trim()
  const ro = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (ro) {
    return new Date(
      Number(ro[3]),
      Number(ro[2]) - 1,
      Number(ro[1]),
      Number(ro[4] || 0),
      Number(ro[5] || 0),
      Number(ro[6] || 0)
    )
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function parseMotor(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value > 0
  const normalized = String(value || '').trim().toLowerCase()
  return ['1', 'da', 'yes', 'true', 'pornit', 'on', 'motor pornit'].includes(normalized)
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function parseGpsTrack(rows) {
  const tracks = (rows || [])
    .map((row) => {
      const data = parseGpsDate(pickValue(row, ['timestamp', 'dataora', 'data', 'ora', 'date', 'time']))
      const gps_lat = parseGpsNumber(pickValue(row, ['latitudine', 'latitude', 'lat']))
      const gps_lng = parseGpsNumber(pickValue(row, ['longitudine', 'longitude', 'lng', 'lon']))
      return {
        data_ora: data,
        gps_lat,
        gps_lng,
        viteza_kmh: parseGpsNumber(pickValue(row, ['viteza', 'speed'])),
        motor_pornit: parseMotor(pickValue(row, ['motor', 'ignition', 'contact']))
      }
    })
    .filter((track) => track.data_ora && track.gps_lat && track.gps_lng)
    .sort((a, b) => a.data_ora - b.data_ora)

  let km_parcursi = 0
  let timp_stationare_minute = 0
  let timp_motor_pornit_minute = 0
  let vitezaTotal = 0
  let vitezaCount = 0

  for (let index = 0; index < tracks.length; index += 1) {
    const current = tracks[index]
    if (current.viteza_kmh > 0) {
      vitezaTotal += current.viteza_kmh
      vitezaCount += 1
    }
    if (index === 0) continue

    const previous = tracks[index - 1]
    km_parcursi += haversine(previous.gps_lat, previous.gps_lng, current.gps_lat, current.gps_lng)

    const deltaMinutes = Math.max(0, (current.data_ora - previous.data_ora) / 60000)
    if (previous.motor_pornit) timp_motor_pornit_minute += deltaMinutes
    if (previous.motor_pornit && previous.viteza_kmh === 0) timp_stationare_minute += deltaMinutes
  }

  return {
    km_parcursi,
    viteza_medie: vitezaCount ? vitezaTotal / vitezaCount : 0,
    timp_stationare_minute,
    timp_motor_pornit_minute,
    tracks
  }
}

function calculeazaRaportLunar(dutyLogs, routeSheets, standbyLogs) {
  const zile_interventie = new Set()
  const zile_dispozitie = new Set()

  for (const log of dutyLogs || []) {
    const key = String(log.data || log.created_at || log.id)
    if (log.tip_interventie === 'fara_interventie') {
      zile_dispozitie.add(key)
    } else {
      zile_interventie.add(key)
    }
  }

  const ore_interventie_active = (routeSheets || [])
    .reduce((sum, sheet) => sum + toNumber(sheet.ore_functionare_motor), 0)
  const ore_dispozitie = (standbyLogs || [])
    .reduce((sum, log) => sum + toNumber(log.ore_totale), 0)
  const sare_totala_to = (routeSheets || [])
    .reduce((sum, sheet) => sum + toNumber(sheet.sare_consumata_to), 0)
  const cacl_total_to = (routeSheets || [])
    .reduce((sum, sheet) => sum + toNumber(sheet.cacl_consumat_to), 0)
  const nisip_total_to = (routeSheets || [])
    .reduce((sum, sheet) => sum + toNumber(sheet.nisip_consumat_to), 0)

  return {
    zile_interventie: zile_interventie.size,
    zile_dispozitie: zile_dispozitie.size,
    ore_interventie_active,
    ore_dispozitie,
    suprafata_totala_tratata_m2: 0,
    sare_totala_kg: sare_totala_to * 1000,
    clorura_totala_l: cacl_total_to,
    cost_manopera_interventie: 0,
    cost_manopera_dispozitie: 0,
    cost_sporuri: 0,
    cost_utilaje: 0,
    cost_materiale: 0,
    cost_total: 0,
    sare_totala_to,
    cacl_total_to,
    nisip_total_to
  }
}

module.exports = {
  calcNisip,
  calcSare,
  calcCacl,
  calcCaclDinSaci,
  calcOreNoapte,
  calculeazaStandby,
  totalizeazaFisaTraseu,
  parseGpsTrack,
  calculeazaRaportLunar,
  MC_PER_CUPA,
  DENSITATE_NISIP,
  DENSITATE_SARE,
  DENSITATE_CACL,
  FACTOR_PRACTIC
}
