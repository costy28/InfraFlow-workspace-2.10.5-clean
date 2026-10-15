'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const app = fs.readFileSync(path.resolve(__dirname, '..', '..', 'client', 'src', 'App.jsx'), 'utf8')
const shell = fs.readFileSync(path.resolve(__dirname, '..', '..', 'client', 'src', 'pages', 'accounting', 'accounting-shared.jsx'), 'utf8')
const plan = fs.readFileSync(path.resolve(__dirname, '..', '..', 'client', 'src', 'pages', 'accounting', 'PlanConturi.jsx'), 'utf8')
const balances = fs.readFileSync(path.resolve(__dirname, '..', '..', 'client', 'src', 'pages', 'accounting', 'SolduriInitiale.jsx'), 'utf8')

test('planul de conturi separa consultarea de administrare', () => {
  assert.match(plan, /const canManage = canAccess\(user, 'accounting:manage'\)/)
  assert.match(plan, /open=\{modal && canManage\}/)
  assert.match(plan, /\.\.\.\(canManage \? \[/)
})

test('soldurile initiale separa raportarea de salvare', () => {
  assert.match(app, /solduri-initiale[\s\S]*?anyOf: \['accounting:reports', 'accounting:post'\]/)
  assert.match(shell, /solduri: \{ anyOf: \['accounting:reports', 'accounting:post'\] \}/)
  assert.match(balances, /const canEdit = canAccess\(user, 'accounting:post'\)/)
  assert.match(balances, /disabled=\{!canEdit\}/)
  assert.match(balances, /if \(!canEdit\) return/)
})
