'use strict'
if (process.env.NODE_ENV !== 'test') throw Error('synthetic_test_only')
const { createSyntheticTrialStore } = require('../../../scripts/lib/demo-trial-store')
const { createSyntheticApprovalOrchestrator } = require('../../../scripts/lib/demo-approval-orchestrator')
const { createLocalSyntheticInstance } = require('./demo-local-instance')
function finish(code) {
  process.exitCode = code
  if (process.connected) process.disconnect()
}
process.once('message', async ({ directory, input }) => {
  let instance, stopping = false, provisioned = false, ending = false
  async function stopWhenReady() {
    if (!provisioned || ending) return
    ending = true
    try { await instance.stop(); finish(0) }
    catch { finish(1) }
  }
  // Receive cleanup even during provisioning; do not leave a detached child behind.
  process.on('message', message => {
    if (message === 'stop') { stopping = true; void stopWhenReady() }
    else if (message === 'crash' && provisioned && !stopping && !ending) {
      ending = true
      instance.releaseCoordinator().then(() => finish(0), () => finish(1))
    }
  })
  try {
    const store = createSyntheticTrialStore(directory); await store.initialize()
    instance = createLocalSyntheticInstance(directory)
    const prepare = createSyntheticApprovalOrchestrator({ store, ensureInstance: instance.ensureInstance })
    await prepare(input)
    provisioned = true
    if (stopping) return stopWhenReady()
    process.send({ ready: true, pid: instance.pid, origin: instance.origin })
    // Deliberately lose the coordinator without stopping its managed instance.
  } catch {
    if (process.connected) process.send({ ready: false }, () => finish(1))
    else finish(1)
  }
})
