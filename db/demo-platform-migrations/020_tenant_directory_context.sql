-- Closed read-only context. No grants, acceptance, execution authority, or job changes.
SET NOCOUNT ON;SET XACT_ABORT ON;SET ANSI_NULLS ON;SET QUOTED_IDENTIFIER ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM' OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1
 THROW 54601,'admin_platform_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='019_prepare_tenant_directories_v1')
 THROW 54602,'directory_preparation_required',1;
BEGIN TRY BEGIN TRANSACTION;
 DECLARE @lock int;
 EXEC @lock=sys.sp_getapplock @Resource=N'infraflow-platform-migrations',@LockMode=N'Exclusive',@LockOwner=N'Transaction',@LockTimeout=5000;
 IF @lock<0 THROW 54603,'platform_migration_busy',1;
 IF EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='020_tenant_directory_context_v1')
 BEGIN COMMIT;SELECT N'DIRECTORY_CONTEXT_ALREADY_APPLIED';RETURN;END;
 IF EXISTS(SELECT 1 FROM platform.provision_jobs WITH(UPDLOCK,HOLDLOCK) WHERE state='leased')
 THROW 54604,'worker_not_idle',1;
 IF OBJECT_ID(N'platform.directory_live_bindings') IS NOT NULL OR OBJECT_ID(N'platform.verify_tenant_directory_context') IS NOT NULL
 THROW 54605,'directory_context_partial_requires_review',1;
 EXEC(N'CREATE VIEW platform.directory_live_bindings AS
 SELECT da.intent_id,da.prior_os_intent_id,da.attempt_id,da.attempt_hash,j.job_id,j.trial_id,
 da.generation,da.job_revision,da.observed_uid,da.observed_gid,da.storage_key,da.config_key,
 da.deadline AS attempt_deadline,j.lease_expires_at AS lease_deadline
 FROM platform.directory_attempts da
 JOIN platform.provision_step_intents i ON i.intent_id=da.intent_id
 JOIN platform.provision_jobs j ON j.job_id=i.job_id
 JOIN platform.trials t ON t.trial_id=j.trial_id
 JOIN platform.provision_step_intents oldi ON oldi.intent_id=da.prior_os_intent_id AND oldi.job_id=j.job_id
 JOIN platform.os_identity_results r ON r.intent_id=oldi.intent_id
 JOIN platform.os_identity_acceptances a ON a.intent_id=oldi.intent_id
 JOIN platform.os_identity_delegations d ON d.intent_id=oldi.intent_id
 JOIN platform.resource_reservations sr ON sr.job_id=j.job_id AND sr.trial_id=j.trial_id AND sr.resource_type=''storage_root''
 JOIN platform.resource_reservations cr ON cr.job_id=j.job_id AND cr.trial_id=j.trial_id AND cr.resource_type=''config_root''
 JOIN platform.resource_reservations osr ON osr.job_id=j.job_id AND osr.trial_id=j.trial_id AND osr.resource_type=''os_identity''
 WHERE j.state=''leased'' AND j.execution_ready=0 AND j.generation=da.generation AND j.job_revision=da.job_revision
 AND j.lease_expires_at IS NOT NULL AND da.state=''prepared''
 AND j.lease_owner COLLATE Latin1_General_100_BIN2=da.owner_name COLLATE Latin1_General_100_BIN2
 AND da.owner_name COLLATE Latin1_General_100_BIN2=N''infraflow_demo_lease''
 AND i.generation=j.generation AND i.job_revision=j.job_revision AND i.step_name=''tenant_directories'' AND i.state=''intent_recorded''
 AND i.owner_name COLLATE Latin1_General_100_BIN2=da.owner_name COLLATE Latin1_General_100_BIN2
 AND t.state=''queued'' AND t.revision=j.trial_revision AND t.activated_at IS NULL AND t.expires_at IS NULL
 AND oldi.step_name=''os_identity'' AND oldi.generation<j.generation AND oldi.job_revision<j.job_revision AND d.job_revision=oldi.job_revision
 AND r.outcome=''observed_created'' AND r.observed_uid=da.observed_uid AND r.observed_gid=da.observed_gid
 AND r.executor_name COLLATE Latin1_General_100_BIN2=N''infraflow_demo_os_executor''
 AND a.executor_name COLLATE Latin1_General_100_BIN2=r.executor_name COLLATE Latin1_General_100_BIN2
 AND DATALENGTH(osr.resource_key)=32 AND DATALENGTH(d.resource_key)=32
 AND d.resource_key COLLATE Latin1_General_100_BIN2=osr.resource_key COLLATE Latin1_General_100_BIN2
 AND osr.resource_key COLLATE Latin1_General_100_BIN2=(''ift_''+LEFT(REPLACE(LOWER(CONVERT(char(36),j.trial_id)),''-'',''''),28)) COLLATE Latin1_General_100_BIN2
 AND DATALENGTH(sr.resource_key)=DATALENGTH(da.storage_key) AND DATALENGTH(cr.resource_key)=DATALENGTH(da.config_key)
 AND sr.resource_key COLLATE Latin1_General_100_BIN2=da.storage_key COLLATE Latin1_General_100_BIN2
 AND cr.resource_key COLLATE Latin1_General_100_BIN2=da.config_key COLLATE Latin1_General_100_BIN2
 AND DATALENGTH(da.storage_key)=DATALENGTH(''/var/lib/infraflow-demo-tenants/''+LOWER(CONVERT(char(36),j.trial_id)))
 AND DATALENGTH(da.config_key)=DATALENGTH(''/etc/infraflow-demo-tenants/''+LOWER(CONVERT(char(36),j.trial_id)))
 AND da.storage_key COLLATE Latin1_General_100_BIN2=(''/var/lib/infraflow-demo-tenants/''+LOWER(CONVERT(char(36),j.trial_id))) COLLATE Latin1_General_100_BIN2
 AND da.config_key COLLATE Latin1_General_100_BIN2=(''/etc/infraflow-demo-tenants/''+LOWER(CONVERT(char(36),j.trial_id))) COLLATE Latin1_General_100_BIN2
 AND DATALENGTH(JSON_VALUE(j.resource_manifest,''$.storageRoot''))=2*DATALENGTH(da.storage_key)
 AND DATALENGTH(JSON_VALUE(j.resource_manifest,''$.configRoot''))=2*DATALENGTH(da.config_key)
 AND DATALENGTH(JSON_VALUE(j.resource_manifest,''$.osIdentity''))=64
 AND JSON_VALUE(j.resource_manifest,''$.storageRoot'') COLLATE Latin1_General_100_BIN2=da.storage_key COLLATE Latin1_General_100_BIN2
 AND JSON_VALUE(j.resource_manifest,''$.configRoot'') COLLATE Latin1_General_100_BIN2=da.config_key COLLATE Latin1_General_100_BIN2
 AND JSON_VALUE(j.resource_manifest,''$.osIdentity'') COLLATE Latin1_General_100_BIN2=osr.resource_key COLLATE Latin1_General_100_BIN2;');
 EXEC(N'CREATE PROCEDURE platform.verify_tenant_directory_context @json nvarchar(max) AS
 BEGIN
 SET NOCOUNT ON;SET XACT_ABORT ON;
 IF USER_NAME() COLLATE Latin1_General_100_BIN2<>N''infraflow_demo_directory_executor''
 THROW 54610,''directory_executor_identity_required'',1;
 IF @json IS NULL OR ISJSON(@json)<>1 OR LEFT(LTRIM(@json),1)<>N''{'' OR DATALENGTH(@json)>1024
 THROW 54611,''invalid_directory_context'',1;
 IF (SELECT COUNT(*) FROM OPENJSON(@json))<>2
 OR EXISTS(SELECT 1 FROM OPENJSON(@json) WHERE [type]<>1 OR [key] COLLATE Latin1_General_100_BIN2 NOT IN(N''intentId'',N''attemptToken''))
 OR EXISTS(SELECT [key] COLLATE Latin1_General_100_BIN2 FROM OPENJSON(@json) GROUP BY [key] COLLATE Latin1_General_100_BIN2 HAVING COUNT(*)<>1)
 THROW 54611,''invalid_directory_context'',1;
 DECLARE @it nvarchar(max)=JSON_VALUE(@json,''$.intentId''),@token nvarchar(max)=JSON_VALUE(@json,''$.attemptToken'');
 DECLARE @intent uniqueidentifier=TRY_CONVERT(uniqueidentifier,@it);
 IF @intent IS NULL OR DATALENGTH(@it)<>72 OR @it COLLATE Latin1_General_100_BIN2<>LOWER(CONVERT(nvarchar(36),@intent)) COLLATE Latin1_General_100_BIN2
 OR @token IS NULL OR DATALENGTH(@token)<>128 OR @token COLLATE Latin1_General_100_BIN2 LIKE N''%[^0-9a-f]%''
 THROW 54611,''invalid_directory_context'',1;
 BEGIN TRY BEGIN TRANSACTION;
 DECLARE @job uniqueidentifier,@trial uniqueidentifier,@prior uniqueidentifier,@attempt uniqueidentifier,@gen int,@rev int,
 @uid int,@gid int,@storage varchar(256),@config varchar(256),@deadline datetime2(3),@remaining int;
 SELECT @job=job_id,@trial=trial_id,@prior=prior_os_intent_id,@attempt=attempt_id,@gen=generation,@rev=job_revision,
 @uid=observed_uid,@gid=observed_gid,@storage=storage_key,@config=config_key,
 @deadline=(SELECT MIN(v) FROM (VALUES(attempt_deadline),(lease_deadline)) limits(v))
 FROM platform.directory_live_bindings WITH(HOLDLOCK)
 WHERE intent_id=@intent AND attempt_hash=HASHBYTES(''SHA2_256'',CONVERT(varbinary(32),@token,2));
 IF @job IS NULL THROW 54612,''directory_context_binding_denied'',1;
 IF EXISTS(SELECT 1 FROM platform.directory_results WITH(HOLDLOCK) WHERE intent_id=@intent)
 THROW 54613,''directory_result_exists_requires_review'',1;
 SET @remaining=DATEDIFF(millisecond,SYSUTCDATETIME(),@deadline);
 IF @remaining IS NULL OR @remaining<15000 THROW 54614,''directory_context_deadline_insufficient'',1;
 IF @remaining>60000 SET @remaining=60000;
 COMMIT;
 SELECT LOWER(CONVERT(char(36),@job)) jobId,LOWER(CONVERT(char(36),@trial)) trialId,LOWER(CONVERT(char(36),@intent)) intentId,
 LOWER(CONVERT(char(36),@prior)) priorOsIntentId,LOWER(CONVERT(char(36),@attempt)) attemptId,@gen generation,@rev jobRevision,
 @uid uid,@gid gid,@storage storageRoot,@config configRoot,@remaining validForMs,CAST(1 AS bit) contextReady,CAST(0 AS bit) executionAllowed
 FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;
 END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
 END;');
 INSERT platform.schema_migrations(migration_id) VALUES('020_tenant_directory_context_v1');
 COMMIT;SELECT N'DIRECTORY_CONTEXT_APPLIED';
END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
