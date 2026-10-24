'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { observeCoordinator } = require('./support/demo-coordinator-client')
function fake(send) {
  const worker = new EventEmitter()
  worker.send = (input, callback) => {
    if (input === 'stop') { callback(); queueMicrotask(() => worker.emit('exit', 0, null)) }
    else send(worker, input, callback)
  }
  worker.kill = () => { queueMicrotask(() => worker.emit('exit', null, 'SIGTERM')); return true }
  return worker
}
test('coordonator: ieșirea înainte de ready are cod explicit, fără payload sensibil', async () => {
  const worker = fake((w, _, cb) => { cb(); queueMicrotask(() => w.emit('exit', 7, null)) })
  const client = observeCoordinator(worker, { secret: 'must-not-appear' })
  await assert.rejects(client.ready, error => error.code === 'coordinator_exit_before_ready' && error.exitCode === 7 && !JSON.stringify(error).includes('must-not-appear'))
  await assert.rejects(client.stop(), { code: 'coordinator_exit_abnormal', exitCode: 7 })
})
test('coordonator: eroarea callbackului IPC este prinsă și copilul poate fi oprit', async () => {
  const client = observeCoordinator(fake((_, input, cb) => cb(Error('private-payload'))), {})
  await assert.rejects(client.ready, { code: 'coordinator_send_failed' })
  await client.stop()
})
test('coordonator: ready invalid este refuzat fără a publica mesajul', async () => {
  const client = observeCoordinator(fake((w, _, cb) => { cb(); queueMicrotask(() => w.emit('message', { ready: false, secret: 'private' })) }), {})
  await assert.rejects(client.ready, { code: 'coordinator_not_ready' })
  await client.stop()
})
test('coordonator: timeout explicit, apoi cleanup cu exit așteptat', async () => {
  const client = observeCoordinator(fake((_, input, cb) => cb()), {}, { timeoutMs: 20 })
  await assert.rejects(client.ready, { code: 'coordinator_timeout' })
  await client.stop()
  assert.deepEqual(await client.exited, { code: 0, signal: null })
})
test('coordonator: exit sincron cu crash nu este pierdut între abonări', async () => {
  const client = observeCoordinator(fake((w, input, cb) => {
    if (input === 'crash') w.emit('exit', 0, null)
    else queueMicrotask(() => w.emit('message', { ready: true, pid: 123, origin: 'http://127.0.0.1:1234' }))
    cb()
  }), {})
  assert.deepEqual(await client.ready, { pid: 123, origin: 'http://127.0.0.1:1234' })
  assert.deepEqual(await client.crash(), { code: 0, signal: null })
  await client.stop()
})
