'use strict'
// One finite test cycle, no timer, daemon, shell, HTTP endpoint or external handler.
function fail(code, phase) { const error = new Error(code); error.code = code; if (phase) error.phase = phase; throw error }
async function runSyntheticJobCycle(options) {
  if (process.env.NODE_ENV !== 'test') fail('synthetic_test_only')
  if (!options || Object.getPrototypeOf(options) !== Object.prototype
    || Object.keys(options).some(k => !['store','trialId','workerId','clock','leaseMs','interruptAt'].includes(k))) fail('invalid_synthetic_cycle')
  const { store, trialId, workerId, clock, leaseMs, interruptAt } = options
  if (!store || !['claimJob','renewJob','applySyntheticEffect','completeJob'].every(k => typeof store[k] === 'function')
    || typeof clock !== 'function' || !Number.isInteger(leaseMs) || leaseMs<1 || leaseMs>60000
    || typeof trialId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(trialId)
    || typeof workerId !== 'string' || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(workerId)
    || (interruptAt !== undefined && !['after_claim','after_renew','after_effect','after_complete'].includes(interruptAt))) fail('invalid_synthetic_cycle')
  let previous = -1
  function now() {
    const value = clock()
    if (!Number.isSafeInteger(value) || value<0 || value<previous || value>Number.MAX_SAFE_INTEGER-60000) fail('invalid_synthetic_cycle_time')
    previous = value; return value
  }
  const interrupt = phase => { if (interruptAt === phase) fail('synthetic_cycle_interrupted', phase) }
  const claimed = await store.claimJob({ trialId, workerId, now: now(), leaseMs })
  if (claimed?.job === null) return { status: 'idle' }
  const job = claimed?.job
  if (!job || job.trialId !== trialId || job.workerId !== workerId
    || !Number.isSafeInteger(job.revision) || job.revision<0 || !Number.isSafeInteger(job.generation) || job.generation<1
    || !Number.isSafeInteger(job.leaseUntil) || job.leaseUntil<=previous) fail('invalid_synthetic_claim')
  const identity = { trialId, workerId, revision: job.revision, generation: job.generation }
  interrupt('after_claim')
  const heartbeatAt = now()
  const renewed = await store.renewJob({ ...identity, now: heartbeatAt, leaseMs, expectedLeaseUntil: job.leaseUntil })
  if (renewed?.status !== 'renewed' || renewed.generation !== job.generation
    || renewed.leaseUntil !== heartbeatAt+leaseMs || renewed.leaseUntil<=job.leaseUntil) fail('invalid_synthetic_renewal')
  interrupt('after_renew')
  const effect = await store.applySyntheticEffect({ ...identity, now: now() })
  if (!['applied','replayed'].includes(effect?.status) || effect.effectCount !== 1) fail('invalid_synthetic_effect_receipt')
  interrupt('after_effect')
  const completion = await store.completeJob({ ...identity, now: now() })
  if (!['completed','already_completed'].includes(completion?.status)) fail('invalid_synthetic_completion')
  interrupt('after_complete')
  return { status: 'completed', trialId, revision: job.revision, generation: job.generation, effectStatus: effect.status }
}
module.exports = { runSyntheticJobCycle }
