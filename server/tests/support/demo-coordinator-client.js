'use strict'
// Test-only IPC observer. Never include IPC payloads, stderr or control nonces in errors.
function observeCoordinator(worker, input, { timeoutMs = 20000 } = {}) {
  let exitResult, readySettled = false, settleReady
  const exited = new Promise(resolve => worker.once('exit', (code, signal) => {
    exitResult = { code, signal }; resolve(exitResult)
  }))
  function failure(code, result) {
    const error = new Error(code); error.code = code
    if (result) { error.exitCode = result.code; error.signal = result.signal }
    return error
  }
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => settleReady(failure('coordinator_timeout')), timeoutMs)
    settleReady = (error, value) => {
      if (readySettled) return
      readySettled = true; clearTimeout(timer); worker.removeListener('message', onMessage)
      if (error) reject(error); else resolve(value)
    }
    function onMessage(message) {
      if (!message || message.ready !== true || !Number.isSafeInteger(message.pid) || message.pid <= 0
        || !/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(message.origin || '')) return settleReady(failure('coordinator_not_ready'))
      settleReady(null, { pid: message.pid, origin: message.origin })
    }
    worker.once('message', onMessage)
    exited.then(result => settleReady(failure('coordinator_exit_before_ready', result)))
    // Keep an error listener for the entire child lifetime, including after ready.
    worker.on('error', () => settleReady(failure('coordinator_process_error')))
    try { worker.send(input, error => { if (error) settleReady(failure('coordinator_send_failed')) }) }
    catch { settleReady(failure('coordinator_send_failed')) }
  })
  async function crash() {
    if (!exitResult) await new Promise((resolve, reject) => worker.send('crash', error => error ? reject(failure('coordinator_send_failed')) : resolve()))
    return exited
  }
  async function stop() {
    if (exitResult) {
      if (exitResult.code !== 0 || exitResult.signal) throw failure('coordinator_exit_abnormal', exitResult)
      return
    }
    let timer
    try {
      await new Promise((resolve, reject) => {
        try { worker.send('stop', error => error ? reject(failure('coordinator_stop_send_failed')) : resolve()) }
        catch { reject(failure('coordinator_stop_send_failed')) }
      })
      const result = await Promise.race([exited, new Promise((_, reject) => { timer = setTimeout(() => reject(failure('coordinator_stop_timeout')), timeoutMs) })])
      if (result.code !== 0 || result.signal) throw failure('coordinator_exit_abnormal', result)
    } catch (error) {
      // Only this known child, never a descriptor PID. Caller must retain fixture on failure.
      if (!exitResult) worker.kill()
      throw error
    } finally { clearTimeout(timer) }
  }
  return { ready, exited, crash, stop }
}
module.exports = { observeCoordinator }
