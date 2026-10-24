'use strict'
const { normalizePageRequest, prepareJobReportPage } = require('../../scripts/lib/demo-sql-job-report-page')
function createSqlReportPageTestStore(run) {
  if (process.env.NODE_ENV !== 'test') throw Error('synthetic_test_only')
  return { async readJobReportPage(input) {
    const request = normalizePageRequest(input)
    const data = JSON.parse(await run(`SET NOCOUNT ON; SET XACT_ABORT ON; SET LOCK_TIMEOUT 5000;
      DECLARE @id uniqueidentifier=CONVERT(uniqueidentifier,JSON_VALUE(@json,'$.trialId')),@revision int,
        @raw nvarchar(max),@page nvarchar(max),@result nvarchar(max),@fp varchar(64),
        @take int=CONVERT(int,JSON_VALUE(@json,'$.pageSize'))+1,
        @after int=CONVERT(int,JSON_VALUE(@json,'$.afterRevision')),
        @now bigint=CONVERT(bigint,JSON_VALUE(@json,'$.now'));
      BEGIN TRY BEGIN TRANSACTION;
        SELECT @revision=trial_revision FROM dbo.demo_trials WITH(UPDLOCK,HOLDLOCK) WHERE trial_id=@id;
        SELECT @raw=(SELECT @revision AS currentRevision,JSON_QUERY((
          SELECT o.revision,o.generation,o.state,o.claimed_at_ms AS claimedAt,o.lease_until_ms AS leaseUntil,
            o.completed_at_ms AS completedAt,CAST(CASE WHEN e.trial_id IS NULL THEN 0 ELSE 1 END AS bit) AS receiptPresent,
            e.first_generation AS firstEffectGeneration FROM dbo.demo_outbox o LEFT JOIN dbo.demo_synthetic_effects e
            ON e.trial_id=o.trial_id AND e.revision=o.revision WHERE o.trial_id=@id ORDER BY o.revision
            FOR JSON PATH,INCLUDE_NULL_VALUES)) AS jobs FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES);
        SET @fp=LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',CONCAT(@raw,'|',CONVERT(varchar(36),@id),'|',
          JSON_VALUE(@json,'$.now'),'|',JSON_VALUE(@json,'$.state'),'|',JSON_VALUE(@json,'$.receipt'),'|',JSON_VALUE(@json,'$.pageSize'))),2));
        IF JSON_VALUE(@json,'$.expectedFingerprint') IS NOT NULL AND JSON_VALUE(@json,'$.expectedFingerprint')<>@fp
          SET @result=N'{"changed":true}';
        ELSE BEGIN
          DECLARE @rows TABLE(revision int,generation bigint,state varchar(32),claimedAt bigint,leaseUntil bigint,
            completedAt bigint,receiptPresent bit,firstEffectGeneration bigint,effectiveState varchar(32));
          INSERT @rows SELECT *,CASE WHEN revision<@revision AND state IN ('pending','leased') THEN 'superseded'
            WHEN state='leased' AND @now>=leaseUntil THEN 'lease_expired' ELSE state END
          FROM OPENJSON(@raw,'$.jobs') WITH(revision int,generation bigint,state varchar(32),claimedAt bigint,
            leaseUntil bigint,completedAt bigint,receiptPresent bit,firstEffectGeneration bigint);
          DECLARE @total int=(SELECT COUNT(*) FROM @rows),@matched int;
          DELETE FROM @rows WHERE (JSON_VALUE(@json,'$.state')<>'all' AND effectiveState<>JSON_VALUE(@json,'$.state'))
            OR (JSON_VALUE(@json,'$.receipt')='present' AND receiptPresent=0)
            OR (JSON_VALUE(@json,'$.receipt')='missing' AND receiptPresent=1);
          SELECT @matched=COUNT(*) FROM @rows;
          SELECT @page=COALESCE((SELECT TOP(@take) revision,generation,state,claimedAt,leaseUntil,completedAt,receiptPresent,firstEffectGeneration
            FROM @rows WHERE revision>@after ORDER BY revision FOR JSON PATH,INCLUDE_NULL_VALUES),N'[]');
          SELECT @result=(SELECT CONVERT(varchar(36),@id) AS trialId,@revision AS currentRevision,@fp AS fingerprint,
            @total AS totalJobs,@matched AS totalMatched,JSON_QUERY(@page) AS jobs FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES);
        END;
        COMMIT; SELECT @result;
      END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK; THROW; END CATCH;`, request))
    if (data.currentRevision === null) throw Object.assign(Error('job_report_trial_not_found'), { code: 'job_report_trial_not_found' })
    return prepareJobReportPage(data, input)
  } }
}
module.exports = { createSqlReportPageTestStore }
