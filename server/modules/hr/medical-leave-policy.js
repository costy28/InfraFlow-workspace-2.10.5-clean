function calendarDays(start, end) {
  const first = new Date(`${start}T12:00:00Z`)
  const last = new Date(`${end}T12:00:00Z`)
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime()) || last < first) return 0
  return Math.floor((last - first) / 86400000) + 1
}

function missingMedicalField(body = {}) {
  const required = ['serie', 'numar', 'data_acordarii', 'data_start', 'data_sfarsit', 'cod_indemnizatie', 'medic_nume', 'cod_parafa', 'unitate_emitenta']
  return required.find((key) => !String(body[key] || '').trim()) || null
}

module.exports = { calendarDays, missingMedicalField }
