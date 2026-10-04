const CLOSED_STATUSES = new Set(['rezolvat', 'inchis', 'respins'])
const TIME_ZONE = 'Europe/Bucharest'
const BUSINESS_START_MINUTES = 9 * 60
const BUSINESS_END_MINUTES = 17 * 60

const SUPPORT_LEVELS = Object.freeze({
  critica: { code: 'P1', label: 'P1 — critic', target_hours: 2, target_label: '2 ore lucrătoare', description: 'Platforma este indisponibilă sau o funcție esențială este blocată pentru majoritatea utilizatorilor.' },
  urgenta: { code: 'P2', label: 'P2 — major', target_hours: 4, target_label: '4 ore lucrătoare', description: 'O funcționalitate importantă este afectată, dar activitatea poate continua parțial.' },
  ridicata: { code: 'P3', label: 'P3 — normal', target_hours: 8, target_label: '1 zi lucrătoare', description: 'Problemă locală, eroare minoră sau solicitare funcțională.' },
  normala: { code: 'P4', label: 'P4 — cerere', target_hours: 16, target_label: '2 zile lucrătoare', description: 'Configurare, sugestie sau solicitare care nu reprezintă incident.' },
  scazuta: { code: 'P4', label: 'P4 — cerere', target_hours: 16, target_label: '2 zile lucrătoare', description: 'Configurare, sugestie sau solicitare care nu reprezintă incident.' }
})

const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  weekday: 'short',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
})

function supportLevelForPriority(priority) {
  return SUPPORT_LEVELS[String(priority || '').trim().toLowerCase()] || SUPPORT_LEVELS.normala
}

function validDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function zonedParts(value) {
  const values = {}
  formatter.formatToParts(value).forEach((part) => { if (part.type !== 'literal') values[part.type] = part.value })
  return {
    weekday: values.weekday,
    year: Number(values.year), month: Number(values.month), day: Number(values.day),
    hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second)
  }
}

function localDateToUtc(parts) {
  const desired = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour || 0, parts.minute || 0, parts.second || 0)
  const guess = new Date(desired)
  const actual = zonedParts(guess)
  const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second)
  return new Date(desired + (desired - actualAsUtc))
}

function addLocalDays(parts, days) {
  const value = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days))
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() }
}

function isWeekend(parts) {
  return parts.weekday === 'Sat' || parts.weekday === 'Sun'
}

function nextBusinessDate(parts) {
  let next = { ...parts }
  do {
    const date = addLocalDays(next, 1)
    next = { ...date, weekday: zonedParts(localDateToUtc({ ...date, hour: 12, minute: 0, second: 0 })).weekday }
  } while (isWeekend(next))
  return next
}

function normalizeBusinessMoment(date) {
  const parts = zonedParts(date)
  const minuteOfDay = parts.hour * 60 + parts.minute
  if (isWeekend(parts)) {
    const next = nextBusinessDate(parts)
    return localDateToUtc({ ...next, hour: 9, minute: 0, second: 0 })
  }
  if (minuteOfDay < BUSINESS_START_MINUTES) return localDateToUtc({ ...parts, hour: 9, minute: 0, second: 0 })
  if (minuteOfDay >= BUSINESS_END_MINUTES) {
    const next = nextBusinessDate(parts)
    return localDateToUtc({ ...next, hour: 9, minute: 0, second: 0 })
  }
  return date
}

function localAtMinutes(parts, minuteOfDay) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 0, minuteOfDay, 0))
  return localDateToUtc({
    year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(),
    hour: date.getUTCHours(), minute: date.getUTCMinutes(), second: 0
  })
}

function addBusinessHours(start, hours) {
  let cursor = normalizeBusinessMoment(start)
  let remaining = Math.round(Number(hours || 0) * 60)
  while (remaining > 0) {
    const parts = zonedParts(cursor)
    const minuteOfDay = parts.hour * 60 + parts.minute
    const available = BUSINESS_END_MINUTES - minuteOfDay
    if (available <= 0) {
      const next = nextBusinessDate(parts)
      cursor = localDateToUtc({ ...next, hour: 9, minute: 0, second: 0 })
      continue
    }
    const used = Math.min(remaining, available)
    cursor = localAtMinutes(parts, minuteOfDay + used)
    remaining -= used
    if (remaining > 0) {
      const next = nextBusinessDate(zonedParts(cursor))
      cursor = localDateToUtc({ ...next, hour: 9, minute: 0, second: 0 })
    }
  }
  return cursor
}

function supportInfo(ticket = {}, now = new Date()) {
  const level = supportLevelForPriority(ticket.prioritate)
  const createdAt = validDate(ticket.created_at) || now
  const calculatedDeadline = addBusinessHours(createdAt, level.target_hours)
  const explicitDeadline = validDate(ticket.termen_limita)
  const deadline = explicitDeadline && explicitDeadline < calculatedDeadline ? explicitDeadline : calculatedDeadline
  const closed = CLOSED_STATUSES.has(String(ticket.status || '').trim().toLowerCase())
  const resolvedAt = validDate(ticket.rezolvat_la) || (closed ? validDate(ticket.updated_at) : null)
  const reference = closed && resolvedAt ? resolvedAt : now
  const overdue = reference > deadline

  return {
    code: level.code,
    label: level.label,
    target_hours: level.target_hours,
    target_label: level.target_label,
    description: level.description,
    deadline_at: deadline.toISOString(),
    deadline_source: explicitDeadline && explicitDeadline <= calculatedDeadline ? 'termen_explicit' : 'tinta_raspuns_initial',
    working_schedule: 'Luni–Vineri, 09:00–17:00 (Europe/Bucharest)',
    state: closed ? (overdue ? 'rezolvat_dupa_termen' : 'rezolvat_in_termen') : (overdue ? 'depasit' : 'in_termen'),
    closed
  }
}

module.exports = { CLOSED_STATUSES, SUPPORT_LEVELS, TIME_ZONE, supportLevelForPriority, addBusinessHours, supportInfo }
