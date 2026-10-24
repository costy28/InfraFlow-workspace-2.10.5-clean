'use strict'
// Test-only job ownership/acknowledgement. No handler executes a resource operation.
function fail(code) { const error = new Error(code); error.code = code; throw error }
function validate(input, claim) {
  const keys = claim ? ['trialId','workerId','now','leaseMs'] : ['trialId','workerId','now','revision','generation']
  if (!input || Object.getPrototypeOf(input) !== Object.prototype || Object.keys(input).some(k => !keys.includes(k))
    || typeof input.trialId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(input.trialId)
    || typeof input.workerId !== 'string' || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(input.workerId)
    || !Number.isSafeInteger(input.now) || input.now<0 || input.now>Number.MAX_SAFE_INTEGER-60000) fail('invalid_synthetic_job_request')
  if (claim ? !Number.isInteger(input.leaseMs) || input.leaseMs<1 || input.leaseMs>60000
    : !Number.isSafeInteger(input.revision) || input.revision<0 || input.revision>2147483647
      || !Number.isSafeInteger(input.generation) || input.generation<1) fail('invalid_synthetic_job_request')
}
function transaction(body) {
  return `SET NOCOUNT ON; SET XACT_ABORT ON; SET LOCK_TIMEOUT 5000;
    DECLARE @result nvarchar(max), @id uniqueidentifier=CONVERT(uniqueidentifier,JSON_VALUE(@json,'$.trialId')),
      @worker varchar(128)=JSON_VALUE(@json,'$.workerId'), @now bigint=CONVERT(bigint,JSON_VALUE(@json,'$.now')), @current int;
    BEGIN TRY
      BEGIN TRANSACTION;
      SELECT @current=trial_revision FROM dbo.demo_trials WITH(UPDLOCK,HOLDLOCK) WHERE trial_id=@id;
      ${body}
      COMMIT;
      SELECT @result;
    END TRY BEGIN CATCH
      IF XACT_STATE()<>0 ROLLBACK;
      THROW;
    END CATCH;`
}
function createSqlJobTestStore(run) {
  if (process.env.NODE_ENV !== 'test') fail('synthetic_test_only')
  return {
    async renewJob(input) {
      if (!input || Object.getPrototypeOf(input) !== Object.prototype) fail('invalid_synthetic_job_request')
      const { leaseMs, expectedLeaseUntil, ...identity } = input
      validate(identity, false)
      if (!Number.isInteger(leaseMs) || leaseMs<1 || leaseMs>60000
        || !Number.isSafeInteger(expectedLeaseUntil) || expectedLeaseUntil<0) fail('invalid_synthetic_job_request')
      const result = JSON.parse(await run(transaction(`
        SET @result=N'{"status":"refused"}';
        DECLARE @revision int=CONVERT(int,JSON_VALUE(@json,'$.revision'));
        IF @current=@revision
        BEGIN
          UPDATE dbo.demo_outbox SET lease_until_ms=@now+CONVERT(bigint,JSON_VALUE(@json,'$.leaseMs'))
            WHERE trial_id=@id AND revision=@revision AND state='leased' AND worker_id=@worker
              AND generation=CONVERT(bigint,JSON_VALUE(@json,'$.generation'))
              AND lease_until_ms=CONVERT(bigint,JSON_VALUE(@json,'$.expectedLeaseUntil'))
              AND @now>=claimed_at_ms AND @now<lease_until_ms
              AND @now+CONVERT(bigint,JSON_VALUE(@json,'$.leaseMs'))>lease_until_ms;
          IF @@ROWCOUNT=1
            SELECT @result=(SELECT 'renewed' AS status,lease_until_ms AS leaseUntil,generation
              FROM dbo.demo_outbox WHERE trial_id=@id AND revision=@revision FOR JSON PATH,WITHOUT_ARRAY_WRAPPER);
        END;`), input))
      if (result.status !== 'renewed') fail('job_lease_refused')
      return result
    },
    async applySyntheticEffect(input) {
      validate(input, false)
      const result = JSON.parse(await run(transaction(`
        DECLARE @revision int=CONVERT(int,JSON_VALUE(@json,'$.revision')),
          @generation bigint=CONVERT(bigint,JSON_VALUE(@json,'$.generation'));
        SET @result=N'{"status":"refused"}';
        IF @current=@revision AND EXISTS(SELECT 1 FROM dbo.demo_outbox WHERE trial_id=@id AND revision=@revision
          AND state='leased' AND worker_id=@worker AND generation=@generation AND @now>=claimed_at_ms AND @now<lease_until_ms)
        BEGIN
          IF EXISTS(SELECT 1 FROM dbo.demo_synthetic_effects WHERE trial_id=@id AND revision=@revision)
            SET @result=N'{"status":"replayed","effectCount":1}';
          ELSE BEGIN
            INSERT dbo.demo_synthetic_effects VALUES(@id,@revision,1,@generation,@worker,@now);
            SET @result=N'{"status":"applied","effectCount":1}';
          END;
        END;`), input))
      if (!['applied','replayed'].includes(result.status)) fail('job_lease_refused')
      return result
    },
    async claimJob(input) {
      validate(input, true)
      return JSON.parse(await run(transaction(`
        SET @result=N'{"job":null}';
        IF @current IS NOT NULL
        BEGIN
          UPDATE dbo.demo_outbox SET state='superseded'
            WHERE trial_id=@id AND revision<@current AND state IN ('pending','leased');
          UPDATE dbo.demo_outbox SET state='leased', generation=generation+1, worker_id=@worker,
            claimed_at_ms=@now, lease_until_ms=@now+CONVERT(bigint,JSON_VALUE(@json,'$.leaseMs'))
            WHERE trial_id=@id AND revision=@current AND generation<9007199254740991
              AND (state='pending' OR (state='leased' AND lease_until_ms<=@now));
          IF @@ROWCOUNT=1
            SELECT @result=(SELECT JSON_QUERY((SELECT CONVERT(varchar(36),trial_id) AS trialId,revision,generation,
              worker_id AS workerId,claimed_at_ms AS claimedAt,lease_until_ms AS leaseUntil
              FROM dbo.demo_outbox WHERE trial_id=@id AND revision=@current
              FOR JSON PATH,WITHOUT_ARRAY_WRAPPER)) AS job FOR JSON PATH,WITHOUT_ARRAY_WRAPPER);
        END;`), input))
    },
    async completeJob(input) {
      validate(input, false)
      const result = JSON.parse(await run(transaction(`
        DECLARE @revision int=CONVERT(int,JSON_VALUE(@json,'$.revision')),
          @generation bigint=CONVERT(bigint,JSON_VALUE(@json,'$.generation'));
        SET @result=N'{"status":"refused"}';
        IF EXISTS(SELECT 1 FROM dbo.demo_outbox WHERE trial_id=@id AND revision=@revision AND state='completed'
          AND worker_id=@worker AND generation=@generation AND completed_at_ms<=@now)
          SET @result=N'{"status":"already_completed"}';
        ELSE IF @current=@revision
        BEGIN
          UPDATE dbo.demo_outbox SET state='completed',completed_at_ms=@now
            WHERE trial_id=@id AND revision=@revision AND state='leased' AND worker_id=@worker
              AND generation=@generation AND @now>=claimed_at_ms AND @now<lease_until_ms;
          IF @@ROWCOUNT=1 SET @result=N'{"status":"completed"}';
        END;`), input))
      if (result.status === 'refused') fail('job_lease_refused')
      return result
    },
  }
}
module.exports = { createSqlJobTestStore }
