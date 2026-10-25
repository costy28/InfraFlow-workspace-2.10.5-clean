'use strict'
// Isolated SQL proof, not imported by app.js or the live JSON orchestrator.
const fs = require('node:fs'), path = require('node:path')
const model = require('../../scripts/lib/demo-trial-registry')
function fail(code) { const error = new Error(code); error.code = code; throw error }
function assertTestDatabase(database) {
  if (process.env.NODE_ENV !== 'test' || !/^INFRAFLOW_TEST_TRIALS_[A-F0-9]{12}$/.test(database || '')) fail('synthetic_sql_database_required')
}
function createSqlTestTrialStore({ database, execute }) {
  assertTestDatabase(database)
  if (typeof execute !== 'function') fail('synthetic_sql_executor_required')
  const run = (sql, input = {}, options = {}) => { assertTestDatabase(database); return execute(database, sql, input, options) }
  async function readEnvelope() {
    const data = JSON.parse(await run(`SELECT store_revision AS version, JSON_QUERY(snapshot) AS registry
      FROM dbo.demo_registry WHERE singleton=1 FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;`))
    if (!Number.isSafeInteger(data.version) || data.version < 0) fail('invalid_sql_store_revision')
    model.validateRegistry(data.registry)
    return data
  }
  async function mutate(reduce, trialId, { fault } = {}) {
    if (fault !== undefined && !['before_commit','after_commit_ack'].includes(fault)) fail('invalid_synthetic_sql_fault')
    for (let attempt = 0; attempt < 8; attempt++) {
      const current = await readEnvelope(), next = reduce(current.registry)
      if (JSON.stringify(next) === JSON.stringify(current.registry)) return next
      const trial = next.trials.find(t => t.id === trialId)
      const result = JSON.parse(await run(`SET NOCOUNT ON; SET XACT_ABORT ON;
        BEGIN TRY
          BEGIN TRANSACTION;
          UPDATE dbo.demo_registry SET store_revision=store_revision+1, snapshot=JSON_QUERY(@json,'$.registry')
          WHERE singleton=1 AND store_revision=CONVERT(bigint,JSON_VALUE(@json,'$.version'));
          IF @@ROWCOUNT=0 BEGIN ROLLBACK; SELECT N'{"conflict":true}'; RETURN; END;
          DECLARE @id uniqueidentifier=CONVERT(uniqueidentifier,JSON_VALUE(@json,'$.trial.id'));
          IF EXISTS(SELECT 1 FROM dbo.demo_trials WHERE trial_id=@id)
            UPDATE dbo.demo_trials SET trial_revision=CONVERT(int,JSON_VALUE(@json,'$.trial.revision')),
              state=JSON_VALUE(@json,'$.trial.state'), snapshot=JSON_QUERY(@json,'$.trial') WHERE trial_id=@id;
          ELSE
            INSERT dbo.demo_trials(trial_id,approval_id,database_name,storage_key,runtime_key,key_ref,trial_revision,state,snapshot)
            SELECT @id,JSON_VALUE(@json,'$.trial.approvalId'),JSON_VALUE(@json,'$.trial.resources.database'),
              JSON_VALUE(@json,'$.trial.resources.storageKey'),JSON_VALUE(@json,'$.trial.resources.runtimeKey'),
              JSON_VALUE(@json,'$.trial.resources.keyRef'),CONVERT(int,JSON_VALUE(@json,'$.trial.revision')),
              JSON_VALUE(@json,'$.trial.state'),JSON_QUERY(@json,'$.trial');
          IF JSON_QUERY(@json,'$.command') IS NOT NULL
          BEGIN
            INSERT dbo.demo_commands VALUES(@id,JSON_VALUE(@json,'$.command.id'),JSON_VALUE(@json,'$.command.digest'));
            INSERT dbo.demo_events VALUES(@id,CONVERT(int,JSON_VALUE(@json,'$.event.revision')),
              JSON_VALUE(@json,'$.event.action'),JSON_VALUE(@json,'$.event.actorId'),CONVERT(bigint,JSON_VALUE(@json,'$.event.at')));
          END;
          INSERT dbo.demo_outbox(trial_id,revision,kind,state) VALUES(@id,CONVERT(int,JSON_VALUE(@json,'$.trial.revision')),'reconcile_trial','pending');
          IF JSON_VALUE(@json,'$.failBeforeCommit')='true' THROW 51102,'synthetic_before_commit',1;
          COMMIT;
          SELECT N'{"committed":true}';
        END TRY
        BEGIN CATCH
          IF XACT_STATE()<>0 ROLLBACK;
          THROW;
        END CATCH;`, { version: current.version, registry: next, trial,
        command: trial.commands.at(-1) || null, event: trial.events.at(-1) || null, failBeforeCommit: fault === 'before_commit' }))
      if (result.conflict) continue
      if (!result.committed) fail('invalid_sql_commit_result')
      if (fault === 'after_commit_ack') fail('synthetic_commit_ack_lost')
      return next
    }
    fail('sql_store_contention')
  }
  return {
    initialize: async () => {
      for (const file of ['001_trial_registry.sql','002_trial_job_leases.sql','003_synthetic_effect_receipts.sql','004_runtime_generations.sql']) {
        await run(fs.readFileSync(path.join(__dirname, '../../db/control-plane-test-migrations', file), 'utf8'))
      }
      return (await readEnvelope()).registry
    },
    read: async () => (await readEnvelope()).registry,
    queue: (input, options) => mutate(r => model.queueTrial(r, input), input.id, options),
    command: (input, options) => mutate(r => model.applyCommand(r, input), input.trialId, options),
    ...require('./demo-trial-sql-job-test-store').createSqlJobTestStore(run),
    ...require('./demo-trial-sql-report-test-store').createSqlReportTestStore(run),
    ...require('./demo-trial-sql-report-page-test-store').createSqlReportPageTestStore(run),
    ...require('./demo-trial-sql-runtime-test-store').createSqlRuntimeTestStore(run),
  }
}
module.exports = { createSqlTestTrialStore, assertTestDatabase }
