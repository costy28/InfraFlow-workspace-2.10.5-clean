const assert = require('node:assert/strict')
const test = require('node:test')
const { addBusinessHours, supportInfo, supportLevelForPriority } = require('../modules/tickets/support-levels')

test('nivelurile de suport P1-P4 păstrează prioritățile existente ale tichetelor', () => {
  assert.equal(supportLevelForPriority('critica').code, 'P1')
  assert.equal(supportLevelForPriority('urgenta').code, 'P2')
  assert.equal(supportLevelForPriority('ridicata').code, 'P3')
  assert.equal(supportLevelForPriority('normala').code, 'P4')
  assert.equal(supportLevelForPriority('scazuta').code, 'P4')
  assert.equal(supportLevelForPriority('ridicata').target_label, '1 zi lucrătoare')
  assert.equal(supportLevelForPriority('normala').target_label, '2 zile lucrătoare')
})

test('un ticket P1 depășit și unul rezolvat păstrează verdictul față de țintă', () => {
  const now = new Date('2026-10-05T09:01:00.000Z')
  const overdue = supportInfo({ prioritate: 'critica', status: 'in_lucru', created_at: '2026-10-02T13:00:00.000Z' }, now)
  assert.equal(overdue.state, 'depasit')
  assert.equal(overdue.target_hours, 2)

  const resolved = supportInfo({ prioritate: 'urgenta', status: 'rezolvat', created_at: '2026-10-02T07:00:00.000Z', rezolvat_la: '2026-10-02T10:00:00.000Z' }, now)
  assert.equal(resolved.state, 'rezolvat_in_termen')

  const closed = supportInfo({ prioritate: 'normala', status: 'inchis', created_at: '2026-10-01T09:00:00.000Z', updated_at: '2026-10-02T12:00:00.000Z' }, now)
  assert.equal(closed.state, 'rezolvat_in_termen')
})

test('ținta de răspuns respectă L–V, 09:00–17:00 în ora României', () => {
  const fridayAtFour = new Date('2026-10-02T13:00:00.000Z') // vineri, 16:00 EEST
  assert.equal(addBusinessHours(fridayAtFour, 2).toISOString(), '2026-10-05T07:00:00.000Z') // luni, 10:00 EEST

  const saturday = new Date('2026-10-03T09:00:00.000Z')
  assert.equal(addBusinessHours(saturday, 2).toISOString(), '2026-10-05T08:00:00.000Z') // luni, 11:00 EEST
})
