const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const express = require('../node_modules/express')
const { validateRestoreData } = require('../modules/system/restore-data')

test('ruta HTTP restore validează înainte de backup/salvare și păstrează domeniile', async () => {
  const events = [], stored = []
  const sandbox = { module: { exports: {} }, require: name => {
    if (name === 'express') return express
    if (['fs', 'path'].includes(name)) return require(name)
    if (name === '../../core/auth') return { requireAuth: req => req.headers.authorization ? { db: {}, user: { id: 'test' } } : null }
    if (name === '../../core/permissions') return { requirePermission: () => true }
    if (name === '../../core/db') return { writeDb: db => { events.push('write'); stored.push(db) } }
    if (name === '../../core/audit') return { addAudit: () => events.push('audit') }
    if (name === './service') return { createServerBackup: () => { events.push('backup'); return { name: 'synthetic' } } }
    throw Error('Unexpected dependency')
  } }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../modules/system/backup-routes.js'), 'utf8'), sandbox)
  const app = express(); app.use(express.json())
  app.use(sandbox.module.exports.createSystemBackupRouter({ ROOT: path.join(__dirname, 'nonexistent-backup-test-root'),
    readJsonBody: async req => req.body, validateRestoreData,
    sendJson: (res, status, body) => res.status(status).json(body) }))
  app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message }))
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve))
  const post = body => fetch(`http://127.0.0.1:${server.address().port}/restore`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'synthetic', Connection: 'close' }, body: JSON.stringify(body) })
  try {
    assert.equal((await post({ settings: {} })).status, 400)
    assert.deepEqual(events, [])
    const body = { settings: { currency: 'EUR' }, crm: { offers: [{ id: 1 }] }, documents: { documents: [{ id: 2 }] }, messaging: { channels: [] } }
    for (const k of ['users', 'materials', 'recipes', 'consumptions', 'deliveries', 'stockMovements', 'productionPlans', 'audit', 'departmentRequests', 'departmentStocks', 'departmentConsumptions']) body[k] = []
    assert.equal((await post(body)).status, 200)
    assert.deepEqual(events, ['backup', 'audit', 'write'])
    assert.deepEqual(stored[0].crm, body.crm)
    assert.deepEqual(stored[0].documents, body.documents)
    assert.deepEqual(stored[0].messaging, body.messaging)
  } finally { await new Promise(resolve => server.close(resolve)) }
})
