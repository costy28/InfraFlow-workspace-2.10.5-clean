-- Read-only liveness check. Not host authority; no grants, accounts or job changes.
SET NOCOUNT ON;SET XACT_ABORT ON;SET ANSI_NULLS ON;SET QUOTED_IDENTIFIER ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM' OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1
 THROW 54201,'admin_platform_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='016_os_identity_results_v1')
 THROW 54202,'os_results_required',1;
BEGIN TRY BEGIN TRANSACTION;
 DECLARE @lock int;
 EXEC @lock=sys.sp_getapplock @Resource=N'infraflow-platform-migrations',@LockMode=N'Exclusive',@LockOwner=N'Transaction',@LockTimeout=5000;
 IF @lock<0 THROW 54203,'platform_migration_busy',1;
 IF EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='017_os_identity_execution_context_v1')
 BEGIN COMMIT;SELECT N'OS_EXECUTION_CONTEXT_ALREADY_APPLIED';RETURN;END;
 IF EXISTS(SELECT 1 FROM platform.provision_jobs WITH(UPDLOCK,HOLDLOCK) WHERE state='leased')
 THROW 54204,'worker_not_idle',1;
 IF OBJECT_ID(N'platform.verify_os_identity_execution_context') IS NOT NULL
 THROW 54205,'os_context_partial_state_requires_review',1;
 EXEC(N'CREATE PROCEDURE platform.verify_os_identity_execution_context @json nvarchar(max) AS
 BEGIN
 SET NOCOUNT ON;SET XACT_ABORT ON;
 IF USER_NAME() COLLATE Latin1_General_100_BIN2<>N''infraflow_demo_os_executor''
 THROW 54210,''os_executor_identity_required'',1;
 IF @json IS NULL OR ISJSON(@json)<>1 OR LEFT(LTRIM(@json),1)<>N''{'' OR DATALENGTH(@json)>1024
 THROW 54211,''invalid_os_context'',1;
 DECLARE @keys TABLE(k nvarchar(32) COLLATE Latin1_General_100_BIN2 PRIMARY KEY);
 INSERT @keys VALUES(N''intentId''),(N''delegationToken'');
 IF (SELECT COUNT(*) FROM OPENJSON(@json))<>2
 OR EXISTS(SELECT 1 FROM OPENJSON(@json) j LEFT JOIN @keys k ON j.[key] COLLATE Latin1_General_100_BIN2=k.k WHERE k.k IS NULL OR j.[type]<>1)
 OR EXISTS(SELECT [key] COLLATE Latin1_General_100_BIN2 FROM OPENJSON(@json) GROUP BY [key] COLLATE Latin1_General_100_BIN2 HAVING COUNT(*)<>1)
 THROW 54211,''invalid_os_context'',1;
 DECLARE @it nvarchar(max)=JSON_VALUE(@json,''$.intentId''),@token nvarchar(max)=JSON_VALUE(@json,''$.delegationToken'');
 DECLARE @intent uniqueidentifier=TRY_CONVERT(uniqueidentifier,@it);
 IF @intent IS NULL OR DATALENGTH(@it)<>72 OR @it COLLATE Latin1_General_100_BIN2<>LOWER(CONVERT(nvarchar(36),@intent)) COLLATE Latin1_General_100_BIN2
 OR @token IS NULL OR DATALENGTH(@token)<>128 OR @token COLLATE Latin1_General_100_BIN2 LIKE N''%[^0-9a-f]%''
 THROW 54211,''invalid_os_context'',1;
 BEGIN TRY BEGIN TRANSACTION;
 DECLARE @job uniqueidentifier,@trial uniqueidentifier,@gen int,@rev int,@resource varchar(256),
 @deadline datetime2(3),@now datetime2(3),@remaining int;
 -- Read/range locks serialize against lease changes and result insertion only
 -- until this transaction ends. They do not fence a later host operation.
 SELECT @job=j.job_id,@trial=j.trial_id,@gen=j.generation,@rev=j.job_revision,@resource=r.resource_key,
 @deadline=(SELECT MIN(v) FROM (VALUES(d.expires_at),(j.lease_expires_at),(a.deadline)) limits(v))
 FROM platform.provision_jobs j WITH(HOLDLOCK)
 JOIN platform.trials t WITH(HOLDLOCK) ON t.trial_id=j.trial_id
 JOIN platform.provision_step_intents i WITH(HOLDLOCK) ON i.job_id=j.job_id AND i.generation=j.generation AND i.intent_id=@intent
 JOIN platform.os_identity_delegations d WITH(HOLDLOCK) ON d.intent_id=i.intent_id
 JOIN platform.os_identity_acceptances a WITH(HOLDLOCK) ON a.intent_id=d.intent_id
 JOIN platform.resource_reservations r WITH(HOLDLOCK) ON r.job_id=j.job_id AND r.trial_id=j.trial_id AND r.resource_type=''os_identity''
 WHERE j.state=''leased'' AND j.execution_ready=0 AND j.job_revision=d.job_revision AND j.job_revision=i.job_revision
 AND j.lease_expires_at IS NOT NULL
 AND j.lease_owner COLLATE Latin1_General_100_BIN2=d.owner_name COLLATE Latin1_General_100_BIN2
 AND i.owner_name COLLATE Latin1_General_100_BIN2=d.owner_name COLLATE Latin1_General_100_BIN2
 AND a.executor_name COLLATE Latin1_General_100_BIN2=USER_NAME() COLLATE Latin1_General_100_BIN2
 AND t.state=''queued'' AND t.revision=j.trial_revision AND t.activated_at IS NULL AND t.expires_at IS NULL
 AND i.step_name=''os_identity'' AND i.state=''intent_recorded'' AND d.state=''prepared''
 AND d.delegation_hash=HASHBYTES(''SHA2_256'',CONVERT(varbinary(32),@token,2))
 AND DATALENGTH(r.resource_key)=32 AND DATALENGTH(d.resource_key)=32
 AND DATALENGTH(JSON_VALUE(j.resource_manifest,''$.osIdentity''))=64
 AND r.resource_key COLLATE Latin1_General_100_BIN2=d.resource_key COLLATE Latin1_General_100_BIN2
 AND JSON_VALUE(j.resource_manifest,''$.osIdentity'') COLLATE Latin1_General_100_BIN2=r.resource_key COLLATE Latin1_General_100_BIN2
 AND r.resource_key COLLATE Latin1_General_100_BIN2=(''ift_''+LEFT(REPLACE(LOWER(CONVERT(char(36),j.trial_id)),''-'',''''),28)) COLLATE Latin1_General_100_BIN2;
 IF @job IS NULL THROW 54212,''os_context_binding_denied'',1;
 IF EXISTS(SELECT 1 FROM platform.os_identity_results WITH(HOLDLOCK) WHERE intent_id=@intent)
 THROW 54213,''os_context_result_exists_requires_review'',1;
 -- Refresh clock after all potentially blocking reads.
 SET @now=SYSUTCDATETIME();
 SET @remaining=DATEDIFF(millisecond,@now,@deadline);
 IF @remaining IS NULL OR @remaining<15000 THROW 54214,''os_context_deadline_insufficient'',1;
 COMMIT;
 SELECT LOWER(CONVERT(char(36),@job)) jobId,LOWER(CONVERT(char(36),@trial)) trialId,
 LOWER(CONVERT(char(36),@intent)) intentId,@gen generation,@rev jobRevision,@resource resourceKey,
 @remaining validForMs,CAST(1 AS bit) contextReady,CAST(0 AS bit) executionAllowed
 FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;
 END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
 END;');
 INSERT platform.schema_migrations(migration_id) VALUES('017_os_identity_execution_context_v1');
 COMMIT;SELECT N'OS_EXECUTION_CONTEXT_APPLIED';
END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
