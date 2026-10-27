'use strict';
const { parseLeaseCommand } = require('./provision-lease-command');

// A transport port, not a worker and not an authorization boundary. No default
// connection: deployment must supply a separately restricted SQL RPC transport.
function createProvisionLeaseClient({ execute } = {}) {
  if (typeof execute !== 'function') throw Error('lease_transport_required');
  let closed = false, pending, stopping;
  const unavailable = () => Error('provision_lease_result_unconfirmed');
  return Object.freeze({
    execute(operation, input) {
      let command;
      try { command = parseLeaseCommand(operation, input); }
      catch { return Promise.reject(Error('invalid_provision_lease_command')); }
      if (closed || pending) return Promise.reject(unavailable());
      // The token goes only to the injected RPC transport. Do not log this payload.
      const run = Promise.resolve().then(async () => {
        try {
          if (closed) throw unavailable();
          const raw = await execute('platform.provision_lease_command', Object.freeze({ operation, json: JSON.stringify(command) }));
          if (closed || typeof raw !== 'string' || Buffer.byteLength(raw) > 2048) throw unavailable();
          const receipt = JSON.parse(raw);
          const keys = ['executionAllowed', 'generation', 'jobId', 'jobRevision', 'leaseExpiresAt'];
          if (!receipt || Object.getPrototypeOf(receipt) !== Object.prototype ||
              Object.keys(receipt).sort().join(',') !== keys.sort().join(',') ||
              receipt.jobId !== command.jobId || receipt.executionAllowed !== false ||
              !Number.isInteger(receipt.generation) || receipt.generation < 1 || receipt.generation >= 2147483647 ||
              !Number.isInteger(receipt.jobRevision) || receipt.jobRevision < 1 || receipt.jobRevision >= 2147483647) throw unavailable();
          if (operation !== 'claim' && receipt.generation !== command.generation) throw unavailable();
          if (operation !== 'verify' && receipt.jobRevision !== command.expectedJobRevision + 1) throw unavailable();
          if (operation === 'release') {
            if (receipt.leaseExpiresAt !== null) throw unavailable();
          } else {
            // SQL datetime2 JSON is UTC by contract, without timezone suffix.
            const date = receipt.leaseExpiresAt;
            if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/.test(date) ||
                !Number.isFinite(Date.parse(date + 'Z'))) throw unavailable();
          }
          return Object.freeze(receipt);
        } catch { throw unavailable(); }
      });
      pending = run;
      run.then(() => { pending = undefined; }, () => { pending = undefined; });
      return run;
    },
    shutdown() {
      if (!stopping) {
        closed = true;
        stopping = Promise.allSettled(pending ? [pending] : []).then(() => undefined);
      }
      return stopping;
    },
  });
}

module.exports = { createProvisionLeaseClient };
