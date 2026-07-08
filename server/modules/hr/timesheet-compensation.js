function applyCompensatedHours(timesheet, hours, norm = 8) {
  const value = Math.max(0, Number(hours || 0))
  const worked = Number.isFinite(Number(timesheet.ore_lucrate)) ? Number(timesheet.ore_lucrate) : Number(norm || 8)
  timesheet.ore_compensate = Number(timesheet.ore_compensate || 0) + value
  timesheet.ore_lucrate = Math.max(0, worked - value)
  if (timesheet.ore_lucrate === 0) timesheet.tip = 'liber'
  timesheet.observatii = 'Actualizat automat din banca de ore'
  return timesheet
}
module.exports = { applyCompensatedHours }
