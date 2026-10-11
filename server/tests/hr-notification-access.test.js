const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const { canReadHrNotification } = require('../modules/hr/notification-access')

const source = fs.readFileSync(path.join(__dirname, '../modules/workflow/routes.js'), 'utf8')
const functions = source.slice(source.indexOf('function notificationVisibleForRole('), source.indexOf('function buildStockAlerts('))
const context = { canReadHrNotification }
vm.runInNewContext(functions, context)

function fixture(permissions) {
  const user = { id: 'u1', role: 'limited' }
  const db = { settings: { customRoles: [{ id: 'limited', permissions }] }, hr: { employees: [{ id: 2, user_id: 'u1' }, { id: 3, user_id: 'other' }] }, notifications: [] }
  return { user, db }
}

test('notificările HR istorice dispar imediat după retragerea drepturilor', () => {
  const permissions = ['hr:personal_sensitive', 'hr:medical_view', 'hr:salary_view']
  const { db, user } = fixture(permissions)
  db.notifications = ['hr_expiration', 'hr_auto_inbox'].map((event, index) => ({ id: index, event, user_id: user.id }))
  assert.equal(context.persistedNotificationsForUser(db, user).length, 2)
  for (const missing of permissions) {
    db.settings.customRoles[0].permissions = permissions.filter(p => p !== missing)
    assert.equal(context.persistedNotificationsForUser(db, user).length, 0)
    assert.equal(db.notifications.length, 2)
  }
})

test('reminderul propriului dosar rămâne vizibil, al colegului nu', () => {
  const { db, user } = fixture([])
  db.notifications = [2, 3].map(employee_id => ({ id: employee_id, event: 'hr_dossier_ack_reminder', employee_id, user_id: user.id }))
  const visible = context.persistedNotificationsForUser(db, user)
  assert.equal(visible.length, 1)
  assert.equal(visible[0].employee_id, 2)
})

test('drepturile sensibile nu ocolesc destinatarul și nu schimbă alte notificări', () => {
  const { db, user } = fixture(['hr:personal_sensitive', 'hr:medical_view', 'hr:salary_view'])
  db.notifications = [{ id: 1, event: 'hr_expiration', user_id: 'other' }, { id: 2, event: 'task', user_id: user.id }]
  assert.equal(context.persistedNotificationsForUser(db, user).length, 1)
  assert.equal(context.persistedNotificationsForUser(db, user)[0].id, 2)
})
