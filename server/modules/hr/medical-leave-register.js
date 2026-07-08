function dateOnly(value) { return String(value || '').slice(0, 10) }
function addDays(value, count) { const d = new Date(`${dateOnly(value)}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + count); return d.toISOString().slice(0, 10) }
function calendarDays(start, end) { const a = new Date(`${dateOnly(start)}T12:00:00Z`); const b = new Date(`${dateOnly(end)}T12:00:00Z`); return Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a ? 0 : Math.floor((b - a) / 86400000) + 1 }
function isWorkday(value) { const day = new Date(`${dateOnly(value)}T12:00:00Z`).getUTCDay(); return day !== 0 && day !== 6 }

function indemnityPercent(code, episodeDays, settings = {}) {
  const normalized = String(code || '').padStart(2, '0')
  if (normalized === '01') {
    if (episodeDays <= Number(settings.code01_first_limit || 7)) return Number(settings.code01_first_percent || 55)
    if (episodeDays <= Number(settings.code01_second_limit || 14)) return Number(settings.code01_second_percent || 65)
    return Number(settings.code01_third_percent || 75)
  }
  const defaults = { '02': 100, '03': 100, '04': 80, '05': 100, '06': 100, '07': 100, '08': 85, '09': 85, '10': 80, '11': 100, '12': 85, '13': 75, '14': 75, '15': 75 }
  return Number(settings.percentages?.[normalized] ?? defaults[normalized] ?? 75)
}

function payerSplit(start, end, code, episodeStart = start, settings = {}) {
  const temporaryStart = settings.temporary_start || '2026-02-01'
  const temporaryEnd = settings.temporary_end || '2027-02-01'
  const fullyFunded = new Set(settings.fully_funded_codes || ['05', '07', '08', '09', '15'])
  const normalized = String(code || '').padStart(2, '0')
  let unpaid = 0, employer = 0, fund = 0, workdays = 0
  for (let date = dateOnly(start); date <= dateOnly(end); date = addDays(date, 1)) {
    if (!isWorkday(date)) continue
    workdays += 1
    const ordinal = calendarDays(episodeStart, date)
    const temporary = date >= temporaryStart && date < temporaryEnd
    if (temporary && ordinal === 1) unpaid += 1
    else if (fullyFunded.has(normalized)) fund += 1
    else if (temporary ? ordinal <= 6 : ordinal <= 5) employer += 1
    else fund += 1
  }
  return { workdays, unpaid_days: unpaid, employer_days: employer, fund_days: fund }
}

function buildMedicalRegister(certificates = [], settings = {}) {
  const sorted = [...certificates].sort((a, b) => String(a.employee_id).localeCompare(String(b.employee_id)) || dateOnly(a.data_start).localeCompare(dateOnly(b.data_start)))
  const previousByEmployee = new Map()
  return sorted.map((item) => {
    const previous = previousByEmployee.get(String(item.employee_id))
    const continuation = item.tip_certificat === 'continuare' && previous && String(previous.cod_diagnostic || '') === String(item.cod_diagnostic || '') && addDays(previous.data_sfarsit, 1) === dateOnly(item.data_start)
    const episodeStart = continuation ? previous.episode_start : dateOnly(item.data_start)
    const episodeDays = calendarDays(episodeStart, item.data_sfarsit)
    const percent = indemnityPercent(item.cod_indemnizatie, episodeDays, settings)
    const split = payerSplit(item.data_start, item.data_sfarsit, item.cod_indemnizatie, episodeStart, settings)
    const dailyBase = Number(item.baza_calcul_zilnica || 0)
    const dailyAmount = dailyBase * percent / 100
    const row = { ...item, episode_start: episodeStart, episode_days: episodeDays, indemnity_percent: percent, ...split, employer_amount: round(split.employer_days * dailyAmount), fund_amount: round(split.fund_days * dailyAmount), total_amount: round((split.employer_days + split.fund_days) * dailyAmount), calculation_status: dailyBase > 0 ? 'calculat' : 'baza_lipsa' }
    previousByEmployee.set(String(item.employee_id), row)
    return row
  })
}

function round(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100 }
module.exports = { indemnityPercent, payerSplit, buildMedicalRegister }
