'use strict'
const { prepareJobReport } = require('../../scripts/lib/demo-sql-job-report')
function createSqlReportTestStore(run) {
  if (process.env.NODE_ENV !== 'test') throw Error('synthetic_test_only')
  return { async readJobReport(input) {
    if (!input || Object.getPrototypeOf(input) !== Object.prototype || Object.keys(input).some(k => !['trialId','now'].includes(k))
      || typeof input.trialId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(input.trialId)
      || !Number.isSafeInteger(input.now) || input.now<0) throw Object.assign(Error('invalid_synthetic_job_request'), { code: 'invalid_synthetic_job_request' })
    const data = JSON.parse(await run(`SET NOCOUNT ON; SET XACT_ABORT ON; SET LOCK_TIMEOUT 5000;
      DECLARE @id uniqueidentifier=CONVERT(uniqueidentifier,JSON_VALUE(@json,'$.trialId')), @revision int,@result nvarchar(max);
      BEGIN TRY BEGIN TRANSACTION;
        -- Same short lock order as claim/ack. No UPDATE, INSERT or lifecycle operation.
        SELECT @revision=trial_revision FROM dbo.demo_trials WITH(UPDLOCK,HOLDLOCK) WHERE trial_id=@id;
        SELECT @result=(SELECT CONVERT(varchar(36),@id) AS trialId,@revision AS currentRevision,
          JSON_QUERY((SELECT TOP(101) o.revision,o.generation,o.state,o.claimed_at_ms AS claimedAt,
            o.lease_until_ms AS leaseUntil,o.completed_at_ms AS completedAt,
            CAST(CASE WHEN e.trial_id IS NULL THEN 0 ELSE 1 END AS bit) AS receiptPresent,
            e.first_generation AS firstEffectGeneration
            FROM dbo.demo_outbox o LEFT JOIN dbo.demo_synthetic_effects e ON e.trial_id=o.trial_id AND e.revision=o.revision
            WHERE o.trial_id=@id ORDER BY o.revision FOR JSON PATH,INCLUDE_NULL_VALUES)) AS jobs
          FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES);
        COMMIT; SELECT @result;
      END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK; THROW; END CATCH;`, input))
    if (data.currentRevision === null) throw Object.assign(Error('job_report_trial_not_found'), { code: 'job_report_trial_not_found' })
    return prepareJobReport(data, input)
  } }
}
module.exports = { createSqlReportTestStore }
