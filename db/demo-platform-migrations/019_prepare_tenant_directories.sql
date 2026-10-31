-- Preparation only, no grants or filesystem authority. Existing OS procedures are unchanged.
SET NOCOUNT ON;SET XACT_ABORT ON;SET ANSI_NULLS ON;SET QUOTED_IDENTIFIER ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM' OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1
 THROW 54501,'admin_platform_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='018_tenant_directory_evidence_v1')
 THROW 54502,'directory_evidence_required',1;
BEGIN TRY BEGIN TRANSACTION;
 DECLARE @lock int;
 EXEC @lock=sys.sp_getapplock @Resource=N'infraflow-platform-migrations',@LockMode=N'Exclusive',@LockOwner=N'Transaction',@LockTimeout=5000;
 IF @lock<0 THROW 54503,'platform_migration_busy',1;
 IF EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='019_prepare_tenant_directories_v1')
 BEGIN COMMIT;SELECT N'DIRECTORY_PREPARATION_ALREADY_APPLIED';RETURN;END;
 IF EXISTS(SELECT 1 FROM platform.provision_jobs WITH(UPDLOCK,HOLDLOCK) WHERE state='leased')
 THROW 54504,'worker_not_idle',1;
 IF OBJECT_ID(N'platform.prepare_tenant_directories') IS NOT NULL
 THROW 54505,'directory_preparation_partial_requires_review',1;
 EXEC(N'CREATE PROCEDURE platform.prepare_tenant_directories @json nvarchar(max) AS
 BEGIN
 SET NOCOUNT ON;SET XACT_ABORT ON;
 IF USER_NAME() COLLATE Latin1_General_100_BIN2<>N''infraflow_demo_lease''
 THROW 54510,''directory_worker_identity_required'',1;
 IF @json IS NULL OR ISJSON(@json)<>1 OR LEFT(LTRIM(@json),1)<>N''{'' OR DATALENGTH(@json)>4096
 THROW 54511,''invalid_directory_preparation'',1;
 DECLARE @keys TABLE(k nvarchar(32) COLLATE Latin1_General_100_BIN2 PRIMARY KEY,t int);
 INSERT @keys VALUES(N''jobId'',1),(N''generation'',2),(N''expectedJobRevision'',2),(N''leaseToken'',1),
 (N''intentId'',1),(N''priorOsIntentId'',1),(N''attemptId'',1),(N''attemptToken'',1);
 IF (SELECT COUNT(*) FROM OPENJSON(@json))<>8
 OR EXISTS(SELECT 1 FROM OPENJSON(@json) j LEFT JOIN @keys k ON j.[key] COLLATE Latin1_General_100_BIN2=k.k WHERE k.k IS NULL OR j.[type]<>k.t)
 OR EXISTS(SELECT [key] COLLATE Latin1_General_100_BIN2 FROM OPENJSON(@json) GROUP BY [key] COLLATE Latin1_General_100_BIN2 HAVING COUNT(*)<>1)
 THROW 54511,''invalid_directory_preparation'',1;
 DECLARE @jt nvarchar(max)=JSON_VALUE(@json,''$.jobId''),@it nvarchar(max)=JSON_VALUE(@json,''$.intentId''),
 @pt nvarchar(max)=JSON_VALUE(@json,''$.priorOsIntentId''),@at nvarchar(max)=JSON_VALUE(@json,''$.attemptId''),
 @gt nvarchar(max)=JSON_VALUE(@json,''$.generation''),@rt nvarchar(max)=JSON_VALUE(@json,''$.expectedJobRevision''),
 @lt nvarchar(max)=JSON_VALUE(@json,''$.leaseToken''),@token nvarchar(max)=JSON_VALUE(@json,''$.attemptToken'');
 DECLARE @job uniqueidentifier=TRY_CONVERT(uniqueidentifier,@jt),@intent uniqueidentifier=TRY_CONVERT(uniqueidentifier,@it),
 @prior uniqueidentifier=TRY_CONVERT(uniqueidentifier,@pt),@attempt uniqueidentifier=TRY_CONVERT(uniqueidentifier,@at),
 @gen int=TRY_CONVERT(int,@gt),@rev int=TRY_CONVERT(int,@rt),@owner nvarchar(128)=USER_NAME();
 IF @job IS NULL OR DATALENGTH(@jt)<>72 OR @jt COLLATE Latin1_General_100_BIN2<>LOWER(CONVERT(nvarchar(36),@job)) COLLATE Latin1_General_100_BIN2
 OR @intent IS NULL OR DATALENGTH(@it)<>72 OR @it COLLATE Latin1_General_100_BIN2<>LOWER(CONVERT(nvarchar(36),@intent)) COLLATE Latin1_General_100_BIN2
 OR @prior IS NULL OR DATALENGTH(@pt)<>72 OR @pt COLLATE Latin1_General_100_BIN2<>LOWER(CONVERT(nvarchar(36),@prior)) COLLATE Latin1_General_100_BIN2
 OR @attempt IS NULL OR DATALENGTH(@at)<>72 OR @at COLLATE Latin1_General_100_BIN2<>LOWER(CONVERT(nvarchar(36),@attempt)) COLLATE Latin1_General_100_BIN2
 OR @intent=@prior OR @attempt=@intent OR @attempt=@prior
 OR @gen IS NULL OR @gen<1 OR @gen>=2147483647 OR @gt COLLATE Latin1_General_100_BIN2<>CONVERT(nvarchar(20),@gen)
 OR @rev IS NULL OR @rev<1 OR @rev>=2147483647 OR @rt COLLATE Latin1_General_100_BIN2<>CONVERT(nvarchar(20),@rev)
 OR @lt IS NULL OR DATALENGTH(@lt)<>128 OR @lt COLLATE Latin1_General_100_BIN2 LIKE N''%[^0-9a-f]%''
 OR @token IS NULL OR DATALENGTH(@token)<>128 OR @token COLLATE Latin1_General_100_BIN2 LIKE N''%[^0-9a-f]%''
 OR @token COLLATE Latin1_General_100_BIN2=@lt COLLATE Latin1_General_100_BIN2
 THROW 54511,''invalid_directory_preparation'',1;
 BEGIN TRY BEGIN TRANSACTION;
 DECLARE @trial uniqueidentifier,@expiry datetime2(3),@now datetime2(3),@uid int,@gid int,@storage varchar(256),@config varchar(256),
 @hash binary(32)=HASHBYTES(''SHA2_256'',CONVERT(varbinary(32),@token,2));
 SELECT @trial=j.trial_id,@expiry=j.lease_expires_at,@uid=r.observed_uid,@gid=r.observed_gid,
 @storage=sr.resource_key,@config=cr.resource_key
 FROM platform.provision_jobs j WITH(UPDLOCK,HOLDLOCK)
 JOIN platform.trials t WITH(UPDLOCK,HOLDLOCK) ON t.trial_id=j.trial_id
 JOIN platform.provision_step_intents i WITH(UPDLOCK,HOLDLOCK) ON i.intent_id=@intent AND i.job_id=j.job_id AND i.generation=j.generation
 JOIN platform.provision_step_intents oldi WITH(HOLDLOCK) ON oldi.intent_id=@prior AND oldi.job_id=j.job_id
 JOIN platform.os_identity_results r WITH(HOLDLOCK) ON r.intent_id=oldi.intent_id
 JOIN platform.os_identity_acceptances a WITH(HOLDLOCK) ON a.intent_id=oldi.intent_id
 JOIN platform.os_identity_delegations d WITH(HOLDLOCK) ON d.intent_id=oldi.intent_id
 JOIN platform.resource_reservations sr WITH(HOLDLOCK) ON sr.job_id=j.job_id AND sr.trial_id=j.trial_id AND sr.resource_type=''storage_root''
 JOIN platform.resource_reservations cr WITH(HOLDLOCK) ON cr.job_id=j.job_id AND cr.trial_id=j.trial_id AND cr.resource_type=''config_root''
 JOIN platform.resource_reservations osr WITH(HOLDLOCK) ON osr.job_id=j.job_id AND osr.trial_id=j.trial_id AND osr.resource_type=''os_identity''
 WHERE j.job_id=@job AND j.state=''leased'' AND j.generation=@gen AND j.job_revision=@rev AND j.execution_ready=0
 AND j.lease_hash=HASHBYTES(''SHA2_256'',CONVERT(varbinary(32),@lt,2))
 AND j.lease_owner COLLATE Latin1_General_100_BIN2=@owner COLLATE Latin1_General_100_BIN2
 AND t.state=''queued'' AND t.revision=j.trial_revision AND t.activated_at IS NULL AND t.expires_at IS NULL
 AND i.step_name=''tenant_directories'' AND i.state=''intent_recorded'' AND i.job_revision=@rev
 AND i.owner_name COLLATE Latin1_General_100_BIN2=@owner COLLATE Latin1_General_100_BIN2
 AND oldi.step_name=''os_identity'' AND oldi.state=''intent_recorded'' AND oldi.generation<@gen AND oldi.job_revision<@rev
 AND r.outcome=''observed_created'' AND r.observed_uid>0 AND r.observed_gid>0 AND d.job_revision=oldi.job_revision
 AND r.executor_name COLLATE Latin1_General_100_BIN2=N''infraflow_demo_os_executor''
 AND a.executor_name COLLATE Latin1_General_100_BIN2=r.executor_name COLLATE Latin1_General_100_BIN2
 AND DATALENGTH(osr.resource_key)=32 AND DATALENGTH(d.resource_key)=32
 AND d.resource_key COLLATE Latin1_General_100_BIN2=osr.resource_key COLLATE Latin1_General_100_BIN2
 AND osr.resource_key COLLATE Latin1_General_100_BIN2=(''ift_''+LEFT(REPLACE(LOWER(CONVERT(char(36),j.trial_id)),''-'',''''),28)) COLLATE Latin1_General_100_BIN2
 AND DATALENGTH(sr.resource_key)=DATALENGTH(''/var/lib/infraflow-demo-tenants/''+LOWER(CONVERT(char(36),j.trial_id)))
 AND DATALENGTH(cr.resource_key)=DATALENGTH(''/etc/infraflow-demo-tenants/''+LOWER(CONVERT(char(36),j.trial_id)))
 AND sr.resource_key COLLATE Latin1_General_100_BIN2=(''/var/lib/infraflow-demo-tenants/''+LOWER(CONVERT(char(36),j.trial_id))) COLLATE Latin1_General_100_BIN2
 AND cr.resource_key COLLATE Latin1_General_100_BIN2=(''/etc/infraflow-demo-tenants/''+LOWER(CONVERT(char(36),j.trial_id))) COLLATE Latin1_General_100_BIN2
 AND DATALENGTH(JSON_VALUE(j.resource_manifest,''$.storageRoot''))=2*DATALENGTH(sr.resource_key)
 AND DATALENGTH(JSON_VALUE(j.resource_manifest,''$.configRoot''))=2*DATALENGTH(cr.resource_key)
 AND JSON_VALUE(j.resource_manifest,''$.storageRoot'') COLLATE Latin1_General_100_BIN2=sr.resource_key COLLATE Latin1_General_100_BIN2
 AND JSON_VALUE(j.resource_manifest,''$.configRoot'') COLLATE Latin1_General_100_BIN2=cr.resource_key COLLATE Latin1_General_100_BIN2
 AND DATALENGTH(JSON_VALUE(j.resource_manifest,''$.osIdentity''))=64
 AND JSON_VALUE(j.resource_manifest,''$.osIdentity'') COLLATE Latin1_General_100_BIN2=osr.resource_key COLLATE Latin1_General_100_BIN2;
 SET @now=SYSUTCDATETIME();
 IF @trial IS NULL OR @expiry IS NULL OR DATEDIFF(millisecond,@now,@expiry)<15000
 THROW 54512,''directory_preparation_binding_denied'',1;
 IF EXISTS(SELECT 1 FROM platform.directory_results WITH(HOLDLOCK) WHERE intent_id=@intent)
 THROW 54513,''directory_result_exists_requires_review'',1;
 IF EXISTS(SELECT 1 FROM platform.directory_attempts WITH(UPDLOCK,HOLDLOCK) WHERE intent_id=@intent)
 BEGIN
 IF NOT EXISTS(SELECT 1 FROM platform.directory_attempts WHERE intent_id=@intent AND prior_os_intent_id=@prior AND attempt_id=@attempt
 AND attempt_hash=@hash AND generation=@gen AND job_revision=@rev AND observed_uid=@uid AND observed_gid=@gid
 AND storage_key COLLATE Latin1_General_100_BIN2=@storage COLLATE Latin1_General_100_BIN2
 AND config_key COLLATE Latin1_General_100_BIN2=@config COLLATE Latin1_General_100_BIN2
 AND owner_name COLLATE Latin1_General_100_BIN2=@owner COLLATE Latin1_General_100_BIN2 AND deadline>@now)
 THROW 54513,''directory_attempt_conflict_requires_review'',1;
 END
 ELSE
 BEGIN
 INSERT platform.directory_attempts(intent_id,prior_os_intent_id,attempt_id,attempt_hash,generation,job_revision,observed_uid,observed_gid,storage_key,config_key,state,prepared_at,deadline,owner_name,sql_actor)
 VALUES(@intent,@prior,@attempt,@hash,@gen,@rev,@uid,@gid,@storage,@config,''prepared'',@now,@expiry,@owner,ORIGINAL_LOGIN());
 INSERT platform.directory_attempt_events(intent_id,action,sql_actor,created_at) VALUES(@intent,''directories.prepared'',ORIGINAL_LOGIN(),@now);
 END;
 COMMIT;
 SELECT LOWER(CONVERT(char(36),@job)) jobId,LOWER(CONVERT(char(36),@trial)) trialId,LOWER(CONVERT(char(36),@intent)) intentId,
 LOWER(CONVERT(char(36),@prior)) priorOsIntentId,LOWER(CONVERT(char(36),@attempt)) attemptId,@gen generation,@rev jobRevision,
 @uid uid,@gid gid,@storage storageRoot,@config configRoot,''prepared'' state,CAST(0 AS bit) executionAllowed
 FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;
 END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
 END;');
 INSERT platform.schema_migrations(migration_id) VALUES('019_prepare_tenant_directories_v1');
 COMMIT;SELECT N'DIRECTORY_PREPARATION_APPLIED';
END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
