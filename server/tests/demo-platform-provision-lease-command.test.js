'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLeaseCommand } = require('../demo-platform/provision-lease-command');
const claim = () => ({ jobId: 'b1100b43-48d0-42fa-8a1d-73b1286f8242', expectedJobRevision: 0, leaseToken: 'ab'.repeat(32) });
const rejected = (op, input) => assert.throws(() => parseLeaseCommand(op, input), /^Error: invalid_provision_lease_command$/);

test('exact internal commands, immutable defensive copy', () => {
  const input = claim();
  const parsed = parseLeaseCommand('claim', input);
  input.jobId = 'changed';
  assert.equal(parsed.jobId, claim().jobId);
  assert.equal(Object.isFrozen(parsed), true);
  const { expectedJobRevision, ...verify } = claim();
  assert.equal(parseLeaseCommand('verify', { ...verify, generation: 1 }).generation, 1);
  for (const op of ['renew', 'release']) assert.equal(parseLeaseCommand(op, { ...claim(), generation: 1 }).generation, 1);
});
test('caller cannot supply identity, clock, duration, readiness or generation on claim', () => {
  for (const field of ['owner', 'sqlActor', 'now', 'expiresAt', 'ttl', 'executionAllowed', 'generation']) {
    rejected('claim', { ...claim(), [field]: 1 });
  }
  for (const op of ['activate', 'complete', '__proto__', 'constructor']) rejected(op, claim());
});
test('no coercion, malformed identifiers or token normalization', () => {
  for (const value of [-1, 1.5, '0', null, NaN, Infinity, 2147483647]) rejected('claim', { ...claim(), expectedJobRevision: value });
  for (const value of ['', 'AB'.repeat(32), 'ab'.repeat(31), 'ab'.repeat(32) + ' ', null]) rejected('claim', { ...claim(), leaseToken: value });
  rejected('claim', { ...claim(), jobId: claim().jobId.toUpperCase() });
  for (const value of [0, -1, '1', 2147483647]) rejected('renew', { ...claim(), generation: value });
});
test('rejects getters, prototypes, symbols and missing keys without secret-bearing errors', () => {
  const getter = claim();
  Object.defineProperty(getter, 'leaseToken', { get() { throw new Error('must_not_execute'); } });
  rejected('claim', getter);
  rejected('claim', Object.assign(Object.create({}), claim()));
  rejected('claim', { ...claim(), [Symbol('extra')]: true });
  const missing = claim(); delete missing.leaseToken; rejected('claim', missing);
  rejected('claim', null);
});
