'use strict'
// Test-only routing decision. No sockets, DNS, proxying, secrets or runtime URLs.
const { validateRegistry } = require('./demo-trial-registry')
function fail(code) { throw Object.assign(Error(code), { code }) }
function normalizeGatewayHost(host) {
  if (typeof host !== 'string' || host.length > 253 || !host.includes('.')
    || !host.split('.').every(label => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label))) fail('invalid_gateway_host')
  return host.toLowerCase()
}
function resolveDemoRoute(input) {
  if (process.env.NODE_ENV !== 'test') fail('synthetic_test_only')
  if (!input || Object.getPrototypeOf(input) !== Object.prototype
    || Object.keys(input).sort().join(',') !== 'bindings,host,now,registry'
    || !Number.isSafeInteger(input.now) || input.now < 0 || !Array.isArray(input.bindings) || input.bindings.length > 1000) fail('invalid_gateway_snapshot')
  const host = normalizeGatewayHost(input.host)
  validateRegistry(input.registry)
  const hosts = new Set(), trials = new Set()
  for (const binding of input.bindings) {
    if (!binding || Object.getPrototypeOf(binding) !== Object.prototype
      || Object.keys(binding).sort().join(',') !== 'host,revision,runtimeKey,trialId') fail('invalid_gateway_binding')
    const key = normalizeGatewayHost(binding.host), trial = input.registry.trials.find(t => t.id === binding.trialId)
    if (hosts.has(key) || trials.has(binding.trialId) || !trial || binding.runtimeKey !== trial.resources.runtimeKey
      || binding.revision !== trial.revision) fail('invalid_gateway_binding')
    hosts.add(key); trials.add(binding.trialId)
  }
  const binding = input.bindings.find(b => normalizeGatewayHost(b.host) === host)
  const trial = binding && input.registry.trials.find(t => t.id === binding.trialId)
  // Expiry is checked against server time even before lifecycle reconciliation.
  if (!trial || trial.state !== 'active' || input.now < trial.activatedAt || input.now >= trial.expiresAt) fail('gateway_route_denied')
  return { format: 'synthetic-demo-route-v1', host, trialId: trial.id, runtimeKey: binding.runtimeKey,
    revision: trial.revision, executionAllowed: false, productionReady: false }
}
module.exports = { normalizeGatewayHost, resolveDemoRoute }
