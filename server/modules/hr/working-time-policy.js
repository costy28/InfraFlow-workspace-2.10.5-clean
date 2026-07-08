function weeklyControls(entries, options = {}) {
  const maxWeeklyHours = Number(options.maxWeeklyHours || 48)
  const maxDailyHours = Number(options.maxDailyHours || 12)
  const grouped = new Map()
  for (const entry of entries || []) {
    const date = String(entry.data || entry.date || '').slice(0, 10)
    if (!date) continue
    const employeeId = String(entry.employee_id)
    const weekStart = mondayOf(date)
    const key = `${employeeId}/${weekStart}`
    const row = grouped.get(key) || { employee_id: entry.employee_id, employee_name: entry.employee_name || '', week_start: weekStart, total_hours: 0, overtime_hours: 0, days: [] }
    const hours = number(entry.ore_lucrate)
    row.total_hours += hours
    row.overtime_hours += number(entry.ore_suplimentare_s1) + number(entry.ore_suplimentare_s2)
    row.days.push({ date, hours })
    grouped.set(key, row)
  }
  return [...grouped.values()].map((row) => {
    row.total_hours = round(row.total_hours)
    row.overtime_hours = round(row.overtime_hours)
    const dailyExcess = row.days.filter((day) => day.hours > maxDailyHours)
    row.warnings = []
    if (row.total_hours > maxWeeklyHours) row.warnings.push(`Peste pragul operational de ${maxWeeklyHours} ore/saptamana`)
    if (dailyExcess.length) row.warnings.push(`${dailyExcess.length} zile cu peste ${maxDailyHours} ore`)
    row.status = row.warnings.length ? 'warning' : 'ok'
    return row
  }).sort((a, b) => a.week_start.localeCompare(b.week_start) || String(a.employee_name).localeCompare(String(b.employee_name)))
}

function mondayOf(value) {
  const date = new Date(`${value}T12:00:00`)
  const day = date.getDay() || 7
  date.setDate(date.getDate() - day + 1)
  return date.toISOString().slice(0, 10)
}
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0 }
function round(value) { return Math.round(value * 100) / 100 }

module.exports = { weeklyControls, mondayOf }
