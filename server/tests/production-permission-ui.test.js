'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const page = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'client', 'src', 'pages', 'modules', 'ProductiePage.jsx'),
  'utf8',
)

test('Producție afișează filele și acțiunile numai după permisiunea punctuală', () => {
  assert.match(page, /const canViewConsumptions = canAccess/)
  assert.match(page, /const canCreateConsumption = canAccess\(user, 'consumptions:create'\)/)
  assert.match(page, /const canExportConsumptions = canAccess\(user, 'consumptions:export'\)/)
  assert.match(page, /const canViewRecipes = canAccess/)
  assert.match(page, /const canViewPlans = canAccess/)
  assert.match(page, /\{visibleTabs\.map\(tab =>/)
  assert.match(page, /modalOpen && canCreateConsumption/)
  assert.match(page, /!c\.gestiune_linked && canLinkInventory/)
})

test('încărcarea inițială nu apelează API-urile secțiunilor fără drept', () => {
  assert.match(page, /canAccess\(user, 'consumptions:view'\) \? api\.get\('\/consumptions'\)/)
  assert.match(page, /canViewRecipes \? api\.get\('\/recipes'\)/)
  assert.match(page, /canViewPlans \? api\.get\('\/plans'\)/)
})

test('terminologia vizibilă a cantității produse rămâne generică', () => {
  assert.equal(page.includes('Cantitate tone'), false)
  assert.equal(page.includes('Tone produse'), false)
  assert.match(page, /Cantitate produsă/)
})
