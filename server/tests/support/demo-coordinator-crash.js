'use strict'
if (process.env.NODE_ENV !== 'test') throw Error('synthetic_test_only')
const { createSyntheticTrialStore } = require('../../../scripts/lib/demo-trial-store')
const { createSyntheticApprovalOrchestrator } = require('../../../scripts/lib/demo-approval-orchestrator')
const { createLocalSyntheticInstance } = require('./demo-local-instance')
process.once('message', async ({ directory, input }) => {
  try {
    const store = createSyntheticTrialStore(directory); await store.initialize()
    const instance = createLocalSyntheticInstance(directory)
    const prepare = createSyntheticApprovalOrchestrator({ store, ensureInstance: instance.ensureInstance })
    await prepare(input)
    process.send({ ready: true, pid: instance.pid, origin: instance.origin })
    // Deliberately lose the coordinator without stopping its managed instance.
    process.once('message', () => process.exit(0))
  } catch { process.send({ ready: false }); process.exit(1) }
})
