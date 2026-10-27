'use strict';

// Internal worker protocol only. Parsing is not authorization or a lease check.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TOKEN = /^[0-9a-f]{64}$/;
const KEYS = Object.freeze({
  claim: ['jobId', 'expectedJobRevision', 'leaseToken'],
  verify: ['jobId', 'generation', 'leaseToken'],
  renew: ['jobId', 'generation', 'expectedJobRevision', 'leaseToken'],
  release: ['jobId', 'generation', 'expectedJobRevision', 'leaseToken'],
});

function invalid() { throw new Error('invalid_provision_lease_command'); }
function parseLeaseCommand(operation, input) {
  const keys = KEYS[operation];
  if (!Object.hasOwn(KEYS, operation) || !keys || !input ||
      Object.getPrototypeOf(input) !== Object.prototype ||
      Reflect.ownKeys(input).length !== keys.length) invalid();
  const result = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) invalid();
    result[key] = descriptor.value;
  }
  if (typeof result.jobId !== 'string' || !UUID.test(result.jobId) ||
      typeof result.leaseToken !== 'string' || !TOKEN.test(result.leaseToken)) invalid();
  for (const key of ['generation', 'expectedJobRevision']) {
    if (Object.hasOwn(result, key) && (!Number.isInteger(result[key]) ||
        result[key] < (key === 'generation' ? 1 : 0) || result[key] >= 2147483647)) invalid();
  }
  return Object.freeze(result);
}

module.exports = { parseLeaseCommand };
