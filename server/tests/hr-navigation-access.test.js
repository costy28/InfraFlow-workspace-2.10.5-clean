const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const source = fs.readFileSync(path.join(__dirname, '../../client/src/pages/modules/hr/HRNavigationTabs.jsx'), 'utf8')
  .split('export default function')[0]
  .replace(/^import .*$/gm, '')
  .replace(/export /g, '')
const context = {}
vm.runInNewContext(`${source}\nthis.visible = getVisibleHrTabs`, context)
const tabsFor = rights => Array.from(context.visible(permission => rights.includes(permission)))

test('pontajul propriu apare fără taburile HR de administrare', () => {
  assert.deepEqual(tabsFor(['hr:timesheet', 'hr:view_own']), ['Pontaj'])
})

test('citirea pontajului nu acordă overview de aprobare', () => {
  assert.equal(tabsFor(['hr:timesheets_view']).includes('Overview pontaje'), false)
  assert.equal(tabsFor(['hr:timesheet_approve']).includes('Overview pontaje'), true)
})

test('drepturile de echipamente nu deschid pontajul', () => {
  assert.deepEqual(tabsFor(['echipamente:gestionar']), ['🦺 Echipamente'])
})

test('Inbox-ul HR apare doar cu accesul personal și medical necesar', () => {
  assert.equal(tabsFor(['hr:view']).includes('Inbox HR'), false)
  assert.equal(tabsFor(['hr:view', 'hr:personal_sensitive']).includes('Inbox HR'), false)
  assert.equal(tabsFor(['hr:view', 'hr:personal_sensitive', 'hr:medical_view']).includes('Inbox HR'), true)
})
