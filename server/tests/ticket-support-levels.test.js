const assert = require('node:assert/strict')
const test = require('node:test')
const { supportInfo, supportLevelForPriority } = require('../modules/tickets/support-levels')

test('nivelurile de suport P1-P4 păstrează prioritățile existente ale tichetelor', () => {
  assert.equal(supportLevelForPriority('critica').code, 'P1')
  assert.equal(supportLevelForPriority('urgenta').code, 'P2')
  assert.equal(supportLevelForPriority('ridicata').code, 'P3')
  assert.equal(supportLevelForPriority('normala').code, 'P4')
  assert.equal(supportLevelForPriority('scazuta').code, 'P4')
})

test('un ticket P1 depășit și unul rezolvat păstrează verdictul față de țintă', () => {
  const now = new Date('2026-10-04T12:00:00.000Z')
  const overdue = supportInfo({ prioritate: 'critica', status: 'in_lucru', created_at: '2026-10-04T07:00:00.000Z' }, now)
  assert.equal(overdue.state, 'depasit')
  assert.equal(overdue.target_hours, 4)

  const resolved = supportInfo({ prioritate: 'urgenta', status: 'rezolvat', created_at: '2026-10-03T12:00:00.000Z', rezolvat_la: '2026-10-04T10:00:00.000Z' }, now)
  assert.equal(resolved.state, 'rezolvat_in_termen')

  const closed = supportInfo({ prioritate: 'normala', status: 'inchis', created_at: '2026-10-01T12:00:00.000Z', updated_at: '2026-10-04T12:00:00.000Z' }, now)
  assert.equal(closed.state, 'rezolvat_in_termen')
})
