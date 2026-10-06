const test = require('node:test')
const assert = require('node:assert/strict')
const { purgeDemoOwnedData } = require('../core/demo-data-lifecycle')

test('ștergerea unui cont Demo elimină numai înregistrările marcate ale acelui cont', () => {
  const db = {
    users: [{ id: 'demo-user', demoOwnerId: 'demo-user' }, { id: 'admin' }],
    audit: [{ id: 'audit-1', demoOwnerId: 'demo-user' }],
    stockMovements: [
      { id: 'movement-own', demoOwnerId: 'demo-user' },
      { id: 'movement-other', demoOwnerId: 'other-user' },
      { id: 'movement-legacy' }
    ],
    logistics: {
      documents: [{ id: 'document-own', demoOwnerId: 'demo-user' }],
      attachments: [{ id: 'attachment-other', demoOwnerId: 'other-user' }]
    }
  }

  const result = purgeDemoOwnedData(db, 'demo-user')

  assert.equal(result.removed, 2)
  assert.deepEqual(db.stockMovements.map(item => item.id), ['movement-other', 'movement-legacy'])
  assert.deepEqual(db.logistics.documents, [])
  assert.equal(db.users.length, 2)
  assert.equal(db.audit.length, 1)
})
