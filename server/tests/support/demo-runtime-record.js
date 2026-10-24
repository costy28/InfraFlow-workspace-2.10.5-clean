'use strict'
// Test-only process discovery. These files contain a control nonce; never log them.
const fs = require('node:fs/promises'), path = require('node:path')
function fail(code) { const e = new Error(code); e.code = code; throw e }
function alive(pid) {
  try { process.kill(pid, 0); return true }
  catch (e) { if (e.code === 'ESRCH') return false; throw e }
}
async function readRecord(root, name) {
  const file = path.join(root, name)
  try {
    const stat = await fs.lstat(file)
    if (!stat.isFile() || stat.isSymbolicLink()) fail('invalid_runtime_record')
    const r = JSON.parse(await fs.readFile(file, 'utf8'))
    if (r.format !== 'synthetic-runtime-v1' || !Number.isSafeInteger(r.pid) || r.pid <= 0
      || !/^[a-f0-9]{64}$/.test(r.nonce) || typeof r.trialId !== 'string' || typeof r.ownerId !== 'string'
      || (name === 'runtime.json' && (!Number.isInteger(r.port) || r.port < 1 || r.port > 65535))) fail('invalid_runtime_record')
    return r
  } catch (e) { if (e.code === 'ENOENT') return null; throw e }
}
async function health(record) {
  const origin = `http://127.0.0.1:${record.port}`
  const response = await fetch(origin + '/synthetic-health', { headers: { 'x-synthetic-health': record.nonce, Connection: 'close' }, signal: AbortSignal.timeout(3000) })
  if (!response.ok) fail('instance_not_healthy')
  const h = await response.json()
  if (!h.ok || h.pid !== record.pid || h.trialId !== record.trialId || h.ownerId !== record.ownerId || h.provider !== 'json') fail('instance_not_healthy')
  return origin
}
async function readManagedRecord(root) {
  const record = await readRecord(root, 'runtime.json')
  if (!record) return null
  const claim = await readRecord(root, 'runtime.claim')
  if (!claim || ['pid','nonce','trialId','ownerId'].some(k => claim[k] !== record[k])) fail('runtime_claim_mismatch')
  return record
}
module.exports = { readRecord, readManagedRecord, health, alive, fail }
