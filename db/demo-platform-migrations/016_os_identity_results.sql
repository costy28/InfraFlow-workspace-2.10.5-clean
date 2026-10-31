-- Append-only observed results. No host execution, grants, job completion or activation.
SET NOCOUNT ON;SET XACT_ABORT ON;SET ANSI_NULLS ON;SET QUOTED_IDENTIFIER ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM' OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1
 THROW 54101,'admin_platform_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='015_os_identity_acceptance_v1')
 THROW 54102,'os_acceptance_required',1;
BEGIN TRY BEGIN TRANSACTION;
 DECLARE @lock int;
 EXEC @lock=sys.sp_getapplock @Resource=N'infraflow-platform-migrations',@LockMode=N'Exclusive',@LockOwner=N'Transaction',@LockTimeout=5000;
 IF @lock<0 THROW 54103,'platform_migration_busy',1;
 IF EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='016_os_identity_results_v1')
 BEGIN COMMIT;SELECT N'OS_IDENTITY_RESULTS_ALREADY_APPLIED';RETURN;END;
 IF EXISTS(SELECT 1 FROM platform.provision_jobs WITH(UPDLOCK,HOLDLOCK) WHERE state='leased')
 THROW 54104,'worker_not_idle',1;
 IF OBJECT_ID(N'platform.os_identity_results') IS NOT NULL OR OBJECT_ID(N'platform.os_identity_result_events') IS NOT NULL
 OR OBJECT_ID(N'platform.record_os_identity_result') IS NOT NULL
 THROW 54105,'os_result_partial_state_requires_review',1;
 CREATE TABLE platform.os_identity_results(
  intent_id uniqueidentifier NOT NULL PRIMARY KEY REFERENCES platform.os_identity_acceptances(intent_id),
  outcome varchar(24) COLLATE Latin1_General_100_BIN2 NOT NULL CHECK(outcome IN('observed_created','uncertain')),
  observed_uid int NULL,observed_gid int NULL,recorded_at datetime2(3) NOT NULL,
  executor_name nvarchar(128) NOT NULL,sql_actor nvarchar(128) NOT NULL,
  CHECK((outcome='uncertain' AND observed_uid IS NULL AND observed_gid IS NULL) OR
        (outcome='observed_created' AND observed_uid IS NOT NULL AND observed_gid IS NOT NULL
         AND observed_uid>0 AND observed_gid>0 AND observed_uid<2147483647 AND observed_gid<2147483647))
 );
 CREATE TABLE platform.os_identity_result_events(
  event_id bigint IDENTITY PRIMARY KEY,intent_id uniqueidentifier NOT NULL REFERENCES platform.os_identity_results(intent_id),
  action varchar(32) NOT NULL CHECK(action='identity.result_recorded'),
  sql_actor nvarchar(128) NOT NULL,created_at datetime2(3) NOT NULL
 );
 EXEC(N'CREATE PROCEDURE platform.record_os_identity_result @json nvarchar(max) AS
 BEGIN
 SET NOCOUNT ON;SET XACT_ABORT ON;
 IF USER_NAME() COLLATE Latin1_General_100_BIN2<>N''infraflow_demo_os_executor''
 THROW 54110,''os_executor_identity_required'',1;
 IF @json IS NULL OR ISJSON(@json)<>1 OR LEFT(LTRIM(@json),1)<>N''{'' OR DATALENGTH(@json)>2048
 THROW 54111,''invalid_os_result'',1;
 DECLARE @keys TABLE(k nvarchar(32) COLLATE Latin1_General_100_BIN2 PRIMARY KEY);
 INSERT @keys VALUES(N''intentId''),(N''delegationToken''),(N''outcome''),(N''uid''),(N''gid'');
 IF (SELECT COUNT(*) FROM OPENJSON(@json))<>5
 OR EXISTS(SELECT 1 FROM OPENJSON(@json) j LEFT JOIN @keys k ON j.[key] COLLATE Latin1_General_100_BIN2=k.k WHERE k.k IS NULL)
 OR EXISTS(SELECT [key] COLLATE Latin1_General_100_BIN2 FROM OPENJSON(@json) GROUP BY [key] COLLATE Latin1_General_100_BIN2 HAVING COUNT(*)<>1)
 THROW 54111,''invalid_os_result'',1;
 DECLARE @it nvarchar(max)=JSON_VALUE(@json,''$.intentId''),@token nvarchar(max)=JSON_VALUE(@json,''$.delegationToken''),
 @outcome nvarchar(max)=JSON_VALUE(@json,''$.outcome''),@ut nvarchar(max)=JSON_VALUE(@json,''$.uid''),@gt nvarchar(max)=JSON_VALUE(@json,''$.gid'');
 DECLARE @intent uniqueidentifier=TRY_CONVERT(uniqueidentifier,@it),@uid int=TRY_CONVERT(int,@ut),@gid int=TRY_CONVERT(int,@gt);
 IF EXISTS(SELECT 1 FROM OPENJSON(@json) WHERE [key] COLLATE Latin1_General_100_BIN2 IN(N''intentId'',N''delegationToken'',N''outcome'') AND [type]<>1)
 OR @intent IS NULL OR DATALENGTH(@it)<>72 OR @it COLLATE Latin1_General_100_BIN2<>LOWER(CONVERT(nvarchar(36),@intent)) COLLATE Latin1_General_100_BIN2
 OR @token IS NULL OR DATALENGTH(@token)<>128 OR @token COLLATE Latin1_General_100_BIN2 LIKE N''%[^0-9a-f]%''
 OR @outcome IS NULL OR @outcome COLLATE Latin1_General_100_BIN2 NOT IN(N''observed_created'',N''uncertain'')
 OR DATALENGTH(@outcome)<>CASE WHEN @outcome COLLATE Latin1_General_100_BIN2=N''uncertain'' THEN 18 ELSE 32 END
 THROW 54111,''invalid_os_result'',1;
 IF @outcome COLLATE Latin1_General_100_BIN2=N''uncertain''
 BEGIN
 IF EXISTS(SELECT 1 FROM OPENJSON(@json) WHERE [key] COLLATE Latin1_General_100_BIN2 IN(N''uid'',N''gid'') AND [type]<>0)
 THROW 54111,''invalid_os_result'',1;
 END
 ELSE
 BEGIN
 IF EXISTS(SELECT 1 FROM OPENJSON(@json) WHERE [key] COLLATE Latin1_General_100_BIN2 IN(N''uid'',N''gid'') AND [type]<>2)
 OR @uid IS NULL OR @gid IS NULL OR @uid<1 OR @gid<1 OR @uid>=2147483647 OR @gid>=2147483647
 OR @ut COLLATE Latin1_General_100_BIN2<>CONVERT(nvarchar(20),@uid) OR @gt COLLATE Latin1_General_100_BIN2<>CONVERT(nvarchar(20),@gid)
 THROW 54111,''invalid_os_result'',1;
 END;
 BEGIN TRY BEGIN TRANSACTION;
 DECLARE @job uniqueidentifier,@gen int,@rev int,@currentRev int,@currentGen int,@leaseExpiry datetime2(3),@deadline datetime2(3),
 @leaseOwner nvarchar(128),@owner nvarchar(128),@state varchar(16),@trialState varchar(16),@trialRev int,@boundRev int,@activated datetime2(3),@expires datetime2(3),@gate bit,@now datetime2(3);
 SELECT @job=j.job_id,@gen=i.generation,@rev=d.job_revision,@currentRev=j.job_revision,@currentGen=j.generation,
 @leaseExpiry=j.lease_expires_at,@deadline=a.deadline,@leaseOwner=j.lease_owner,@owner=d.owner_name,@state=j.state,
 @trialState=t.state,@trialRev=t.revision,@boundRev=j.trial_revision,@activated=t.activated_at,@expires=t.expires_at,@gate=j.execution_ready
 FROM platform.provision_jobs j WITH(UPDLOCK,HOLDLOCK)
 JOIN platform.trials t WITH(UPDLOCK,HOLDLOCK) ON t.trial_id=j.trial_id
 JOIN platform.provision_step_intents i WITH(UPDLOCK,HOLDLOCK) ON i.job_id=j.job_id AND i.intent_id=@intent
 JOIN platform.os_identity_delegations d WITH(UPDLOCK,HOLDLOCK) ON d.intent_id=i.intent_id
 JOIN platform.os_identity_acceptances a WITH(UPDLOCK,HOLDLOCK) ON a.intent_id=d.intent_id
 WHERE i.step_name=''os_identity'' AND d.delegation_hash=HASHBYTES(''SHA2_256'',CONVERT(varbinary(32),@token,2))
 AND a.executor_name COLLATE Latin1_General_100_BIN2=USER_NAME() COLLATE Latin1_General_100_BIN2;
 SET @now=SYSUTCDATETIME();
 IF @job IS NULL THROW 54112,''os_result_binding_denied'',1;
 -- Uncertainty can be recorded after lease loss; never label that as success.
 IF @outcome COLLATE Latin1_General_100_BIN2=N''observed_created'' AND
 (@state<>''leased'' OR @currentRev<>@rev OR @currentGen<>@gen OR @gate<>0 OR @trialState<>''queued''
 OR @trialRev<>@boundRev OR @activated IS NOT NULL OR @expires IS NOT NULL
 OR @leaseExpiry IS NULL OR @leaseExpiry<=@now OR @deadline<=@now OR @leaseOwner IS NULL
 OR @leaseOwner COLLATE Latin1_General_100_BIN2<>@owner COLLATE Latin1_General_100_BIN2)
 THROW 54113,''os_result_fence_lost_record_uncertainty'',1;
 IF EXISTS(SELECT 1 FROM platform.os_identity_results WITH(UPDLOCK,HOLDLOCK) WHERE intent_id=@intent)
 THROW 54114,''os_result_already_recorded_requires_review'',1;
 INSERT platform.os_identity_results(intent_id,outcome,observed_uid,observed_gid,recorded_at,executor_name,sql_actor)
 VALUES(@intent,CONVERT(varchar(24),@outcome),@uid,@gid,@now,USER_NAME(),ORIGINAL_LOGIN());
 INSERT platform.os_identity_result_events(intent_id,action,sql_actor,created_at)
 VALUES(@intent,''identity.result_recorded'',ORIGINAL_LOGIN(),@now);
 COMMIT;
 SELECT LOWER(CONVERT(char(36),@job)) jobId,LOWER(CONVERT(char(36),@intent)) intentId,@gen generation,@rev jobRevision,
 @outcome outcome,@uid uid,@gid gid,CAST(0 AS bit) executionAllowed,CAST(1 AS bit) reconciliationRequired
 FOR JSON PATH,INCLUDE_NULL_VALUES,WITHOUT_ARRAY_WRAPPER;
 END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
 END;');
 INSERT platform.schema_migrations(migration_id) VALUES('016_os_identity_results_v1');
 COMMIT;SELECT N'OS_IDENTITY_RESULTS_APPLIED';
END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
