'use strict'
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { randomUUID, createHash } = require('node:crypto')
const guard = () => { if (process.env.NODE_ENV !== 'test') throw Error('synthetic_test_only') }
function auditDirectory(directory) {
  guard()
  const root = fs.realpathSync(os.tmpdir()), dir = path.resolve(directory)
  if (path.dirname(dir).toLowerCase() !== root.toLowerCase() || !/^infraflow-operator-audit-[a-zA-Z0-9_-]+$/.test(path.basename(dir))
    || fs.lstatSync(dir).isSymbolicLink() || fs.realpathSync(dir).toLowerCase() !== dir.toLowerCase()) throw Error('invalid_operator_audit_directory')
  return dir
}
function exclusiveGate(dir, action) {
  const gate = path.join(dir, 'recovery.gate'), fd = fs.openSync(gate, 'wx', 0o600)
  try { return action() } finally { fs.closeSync(fd); fs.unlinkSync(gate) }
}
function checkEvent(event) {
  if (!event || Object.getPrototypeOf(event) !== Object.prototype
    || Object.keys(event).sort().join(',') !== 'at,operation,status,subject,trialId'
    || (event.subject !== null && (typeof event.subject !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(event.subject)))
    || (event.trialId !== null && (typeof event.trialId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(event.trialId)))
    || !['page', 'export'].includes(event.operation) || ![200,400,401,403,405,409,500].includes(event.status)
    || !Number.isSafeInteger(event.at) || event.at < 0) throw Error('invalid_operator_audit_event')
  return { subject: event.subject, trialId: event.trialId, operation: event.operation, status: event.status, at: event.at }
}
function openOperatorAuditJournal(directory) {
  const dir = auditDirectory(directory)
  const file = path.join(dir, 'consultations.jsonl'), lock = path.join(dir, 'writer.lock')
  const lockFd = exclusiveGate(dir, () => {
    const fd = fs.openSync(lock, 'wx', 0o600)
    try { fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, nonce: randomUUID() })); fs.fsyncSync(fd); return fd }
    catch (error) { fs.closeSync(fd); throw error }
  })
  let fd, closed = false, poisoned = false
  function read() {
    guard()
    const stat = fs.lstatSync(file)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 262144) throw Error('invalid_operator_audit_file')
    const raw = fs.readFileSync(file, 'utf8')
    if (raw && !raw.endsWith('\n')) throw Error('operator_audit_truncated')
    const lines = raw ? raw.slice(0, -1).split('\n') : []
    if (lines.length > 1000) throw Error('operator_audit_limit')
    return lines.map((line, i) => {
      const row = JSON.parse(line)
      if (Object.keys(row).sort().join(',') !== 'event,sequence' || row.sequence !== i + 1) throw Error('invalid_operator_audit_sequence')
      return { sequence: row.sequence, event: checkEvent(row.event) }
    })
  }
  try {
    if (fs.existsSync(file)) {
      if (fs.lstatSync(file).isSymbolicLink()) throw Error('invalid_operator_audit_file')
    } else fs.closeSync(fs.openSync(file, 'wx', 0o600))
    read()
    fd = fs.openSync(file, 'a')
  } catch (error) { fs.closeSync(lockFd); fs.unlinkSync(lock); throw error }
  return {
    read: () => { if (closed) throw Error('operator_audit_closed'); return read() },
    append: event => {
      guard()
      if (closed || poisoned) throw Error('operator_audit_unavailable')
      const clean = checkEvent(event), rows = read()
      const line = JSON.stringify({ sequence: rows.length + 1, event: clean }) + '\n'
      if (rows.length >= 1000 || fs.statSync(file).size + Buffer.byteLength(line) > 262144) throw Error('operator_audit_limit')
      try { fs.writeFileSync(fd, line); fs.fsyncSync(fd) }
      catch (error) { poisoned = true; throw error }
    },
    close: () => {
      if (!closed) { closed = true; fs.closeSync(fd); fs.closeSync(lockFd); fs.unlinkSync(lock) }
    },
  }
}
function inspectRecovery(directory) {
  const dir = auditDirectory(directory)
  return exclusiveGate(dir, () => recoveryEvidence(dir))
}
function recoveryEvidence(dir) {
  const lock = path.join(dir, 'writer.lock'), file = path.join(dir, 'consultations.jsonl')
  for (const name of [lock, file]) {
    const s = fs.lstatSync(name)
    if (!s.isFile() || s.isSymbolicLink() || s.size > 262144) throw Error('invalid_recovery_file')
  }
  const raw = fs.readFileSync(lock, 'utf8'), owner = JSON.parse(raw)
  if (Object.keys(owner).sort().join(',') !== 'nonce,pid' || !Number.isInteger(owner.pid) || owner.pid < 1
    || typeof owner.nonce !== 'string' || !/^[a-f0-9-]{36}$/.test(owner.nonce)) throw Error('invalid_recovery_owner')
  // A live or inaccessible/reused PID is not reclaimable; no process is killed.
  try { process.kill(owner.pid, 0); throw Error('operator_audit_owner_alive') }
  catch (error) { if (error.code !== 'ESRCH') throw error }
  const bytes = fs.readFileSync(file), text = bytes.toString('utf8')
  if (text && !text.endsWith('\n')) throw Error('operator_audit_truncated')
  const lines = text ? text.slice(0,-1).split('\n') : []
  if (lines.length > 1000) throw Error('operator_audit_limit')
  lines.forEach((line, index) => {
    const row = JSON.parse(line)
    if (Object.keys(row).sort().join(',') !== 'event,sequence' || row.sequence !== index + 1) throw Error('invalid_operator_audit_sequence')
    checkEvent(row.event)
  })
  return { pid: owner.pid, nonce: owner.nonce,
    fingerprint: createHash('sha256').update(raw).update('\0').update(bytes).digest('hex'), entries: lines.length }
}
function recoverOperatorAuditJournal(directory, expected) {
  const dir = auditDirectory(directory)
  if (!expected || Object.keys(expected).sort().join(',') !== 'entries,fingerprint,nonce,pid') throw Error('invalid_recovery_confirmation')
  return exclusiveGate(dir, () => {
    const current = recoveryEvidence(dir)
    if (Object.keys(current).some(key => current[key] !== expected[key])) throw Error('operator_audit_recovery_changed')
    const evidence = `recovered-${randomUUID()}.lock`
    fs.renameSync(path.join(dir, 'writer.lock'), path.join(dir, evidence))
    return { recovered: true, entries: current.entries, evidence }
  })
}
module.exports = { openOperatorAuditJournal, inspectRecovery, recoverOperatorAuditJournal }
