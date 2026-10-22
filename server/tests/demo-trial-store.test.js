'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { spawn } = require('node:child_process')
const { createSyntheticTrialStore } = require('../../scripts/lib/demo-trial-store')
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222'
const now = Date.parse('2026-10-22T10:00:00Z')
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'infraflow-trial-store-'))
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()))
    assert.ok(path.basename(dir).startsWith('infraflow-trial-store-'))
    await fs.rm(dir, { recursive: true, force: true })
  })
  const store = createSyntheticTrialStore(dir); await store.initialize()
  return { dir, store }
}
function child(dir, method, input) {
  const modulePath = path.resolve(__dirname, '../../scripts/lib/demo-trial-store')
  const script = `const {createSyntheticTrialStore}=require(process.env.STORE_MODULE);
    createSyntheticTrialStore(process.env.STORE_DIR)[process.env.STORE_METHOD](JSON.parse(process.env.STORE_INPUT))
      .then(()=>console.log('ok')).catch(e=>{console.log(e.code||'failed');process.exitCode=2});`
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['-e', script], { windowsHide: true,
      env: { ...process.env, STORE_MODULE: modulePath, STORE_DIR: dir, STORE_METHOD: method, STORE_INPUT: JSON.stringify(input) },
      stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''; p.stdout.on('data', b => { out += b }); p.stderr.on('data', () => {})
    p.on('error', reject); p.on('exit', code => resolve({ code, result: out.trim() }))
  })
}
const command = id => ({ trialId: A, commandId: id, expectedRevision: 0, action: 'provision', actor: { kind: 'worker', id: 'worker' }, now })
test('persistență și citire din alt proces, fără pierderea trialurilor concurente', async t => {
  const { dir, store } = await fixture(t)
  const results = await Promise.all([child(dir, 'queue', { id: A, approvalId: 'approval-a', now }), child(dir, 'queue', { id: B, approvalId: 'approval-b', now })])
  assert.ok(results.every(r => r.code === 0))
  assert.equal((await store.read()).trials.length, 2)
  assert.equal((await child(dir, 'read', {})).result, 'ok')
})
test('două procese pe aceeași revizie: un câștigător și un conflict, fără audit duplicat', async t => {
  const { dir, store } = await fixture(t); await store.queue({ id: A, approvalId: 'approval-a', now })
  const results = await Promise.all([child(dir, 'command', command('cmd-a')), child(dir, 'command', command('cmd-b'))])
  assert.deepEqual(results.map(r => r.result).sort(), ['ok', 'revision_conflict'])
  const row = (await store.read()).trials[0]
  assert.equal(row.revision, 1); assert.equal(row.events.length, 1)
})
test('retry simultan al aceleiași comenzi este idempotent după salvare', async t => {
  const { dir, store } = await fixture(t); await store.queue({ id: A, approvalId: 'approval-a', now })
  const results = await Promise.all([child(dir, 'command', command('same')), child(dir, 'command', command('same'))])
  assert.ok(results.every(r => r.result === 'ok'))
  assert.equal((await store.read()).trials[0].commands.length, 1)
})
test('aceeași aprobare nu poate crea două companii în procese concurente', async t => {
  const { dir, store } = await fixture(t)
  const results = await Promise.all([child(dir, 'queue', { id: A, approvalId: 'same-approval', now }), child(dir, 'queue', { id: B, approvalId: 'same-approval', now })])
  assert.deepEqual(results.map(r => r.result).sort(), ['approval_already_bound', 'ok'])
  assert.equal((await store.read()).trials.length, 1)
})
test('coruperea registrului nu îl reinițializează și nu șterge conținutul', async t => {
  const { dir, store } = await fixture(t)
  const file = path.join(dir, 'registry.json'); await fs.writeFile(file, '{broken')
  await assert.rejects(store.initialize()); await assert.rejects(store.queue({ id: A, approvalId: 'a', now }))
  assert.equal(await fs.readFile(file, 'utf8'), '{broken')
})
test('lock rămas după crash blochează, nu este șters sau furat automat', async t => {
  const { dir } = await fixture(t)
  await fs.writeFile(path.join(dir, 'registry.lock'), 'synthetic abandoned lock')
  const store = createSyntheticTrialStore(dir, { lockTimeoutMs: 0 })
  await assert.rejects(store.read(), e => e.code === 'store_locked')
  assert.equal(await fs.readFile(path.join(dir, 'registry.lock'), 'utf8'), 'synthetic abandoned lock')
})
test('magazia refuză directoare din instalații reale', () => {
  assert.throws(() => createSyntheticTrialStore(path.resolve(__dirname, '../../data')), e => e.code === 'synthetic_directory_required')
})
test('comanda refuzată nu modifică fișierul și eliberează lockul', async t => {
  const { dir, store } = await fixture(t); await store.queue({ id: A, approvalId: 'approval-a', now })
  const file = path.join(dir, 'registry.json'), before = await fs.readFile(file, 'utf8')
  await assert.rejects(store.command({ ...command('bad'), expectedRevision: 5 }), e => e.code === 'revision_conflict')
  assert.equal(await fs.readFile(file, 'utf8'), before)
  await store.command(command('good'))
  assert.equal((await store.read()).trials[0].revision, 1)
  assert.equal((await fs.readdir(dir)).some(n => n.endsWith('.tmp') || n.endsWith('.lock')), false)
})
