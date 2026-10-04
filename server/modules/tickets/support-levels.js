const CLOSED_STATUSES = new Set(['rezolvat', 'inchis', 'respins'])

const SUPPORT_LEVELS = Object.freeze({
  critica: { code: 'P1', label: 'P1 — critic', target_hours: 4, description: 'Intervenție imediată; escaladare dacă nu este asignat în 4 ore.' },
  urgenta: { code: 'P2', label: 'P2 — urgent', target_hours: 24, description: 'Impact important; țintă de răspuns în 24 de ore.' },
  ridicata: { code: 'P3', label: 'P3 — ridicat', target_hours: 72, description: 'Impact controlabil; țintă de răspuns în 3 zile.' },
  normala: { code: 'P4', label: 'P4 — planificat', target_hours: 120, description: 'Cerere planificabilă; țintă de răspuns în 5 zile.' },
  scazuta: { code: 'P4', label: 'P4 — planificat', target_hours: 120, description: 'Cerere planificabilă; țintă de răspuns în 5 zile.' }
})

function supportLevelForPriority(priority) {
  return SUPPORT_LEVELS[String(priority || '').trim().toLowerCase()] || SUPPORT_LEVELS.normala
}

function validDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function supportInfo(ticket = {}, now = new Date()) {
  const level = supportLevelForPriority(ticket.prioritate)
  const createdAt = validDate(ticket.created_at) || now
  const calculatedDeadline = new Date(createdAt.getTime() + level.target_hours * 3600000)
  const explicitDeadline = validDate(ticket.termen_limita)
  const deadline = explicitDeadline && explicitDeadline < calculatedDeadline ? explicitDeadline : calculatedDeadline
  const closed = CLOSED_STATUSES.has(String(ticket.status || '').trim().toLowerCase())
  // Unele tichete istorice au fost închise direct, fără câmpul rezolvat_la.
  // Pentru acestea updated_at este momentul cel mai fidel al închiderii.
  const resolvedAt = validDate(ticket.rezolvat_la) || (closed ? validDate(ticket.updated_at) : null)
  const reference = closed && resolvedAt ? resolvedAt : now
  const overdue = reference > deadline

  return {
    code: level.code,
    label: level.label,
    target_hours: level.target_hours,
    description: level.description,
    deadline_at: deadline.toISOString(),
    deadline_source: explicitDeadline && explicitDeadline <= calculatedDeadline ? 'termen_explicit' : 'tinta_suport',
    state: closed ? (overdue ? 'rezolvat_dupa_termen' : 'rezolvat_in_termen') : (overdue ? 'depasit' : 'in_termen'),
    closed
  }
}

module.exports = { CLOSED_STATUSES, SUPPORT_LEVELS, supportLevelForPriority, supportInfo }
