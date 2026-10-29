-- Control-plane intent journal only. No external effects, execution gate changes or grants.
SET NOCOUNT ON;SET XACT_ABORT ON;SET ANSI_NULLS ON;SET QUOTED_IDENTIFIER ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM'
 THROW 52801,'platform_database_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='009_operator_prepare_change_v1')
 THROW 52802,'prepare_change_required',1;
BEGIN TRY
 BEGIN TRANSACTION;
 DECLARE @lock int;
 EXEC @lock=sys.sp_getapplock @Resource=N'infraflow-platform-migrations',@LockMode=N'Exclusive',@LockOwner=N'Transaction',@LockTimeout=5000;
 IF @lock<0 THROW 52803,'platform_migration_busy',1;
 IF EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='010_provision_step_journal_v1')
 BEGIN COMMIT;SELECT N'PROVISION_STEP_JOURNAL_ALREADY_APPLIED';RETURN;END;
 IF OBJECT_ID(N'platform.provision_step_intents') IS NOT NULL OR OBJECT_ID(N'platform.record_step_intent') IS NOT NULL
  THROW 52804,'step_journal_partial_state_requires_review',1;
 CREATE TABLE platform.provision_step_intents(
  job_id uniqueidentifier NOT NULL REFERENCES platform.provision_jobs(job_id),
  generation int NOT NULL CHECK(generation>0),
  step_name varchar(32) COLLATE Latin1_General_100_BIN2 NOT NULL
   CHECK(step_name IN('os_identity','tenant_directories','tenant_key','sql_database','sql_login','schema_bootstrap','runtime_unit')),
  intent_id uniqueidentifier NOT NULL UNIQUE,
  job_revision int NOT NULL CHECK(job_revision>0),
  state varchar(24) NOT NULL DEFAULT 'intent_recorded' CHECK(state='intent_recorded'),
  owner_name nvarchar(128) NOT NULL,sql_actor nvarchar(128) NOT NULL,
  recorded_at datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  PRIMARY KEY(job_id,generation,step_name)
 );
 EXEC(N'CREATE PROCEDURE platform.record_step_intent @json nvarchar(max) AS
 BEGIN
 SET NOCOUNT ON;SET XACT_ABORT ON;
 IF @json IS NULL OR ISJSON(@json)<>1 OR LEFT(LTRIM(@json),1)<>N''{'' OR DATALENGTH(@json)>2048
  THROW 52810,''invalid_step_intent'',1;
 DECLARE @keys TABLE(k nvarchar(32) COLLATE Latin1_General_100_BIN2 PRIMARY KEY,t int);
 INSERT @keys VALUES(N''jobId'',1),(N''generation'',2),(N''expectedJobRevision'',2),(N''leaseToken'',1),(N''step'',1),(N''intentId'',1);
 IF (SELECT COUNT(*) FROM OPENJSON(@json))<>6
  OR EXISTS(SELECT 1 FROM OPENJSON(@json) j LEFT JOIN @keys k ON j.[key] COLLATE Latin1_General_100_BIN2=k.k WHERE k.k IS NULL OR k.t<>j.[type])
  OR EXISTS(SELECT [key] COLLATE Latin1_General_100_BIN2 FROM OPENJSON(@json) GROUP BY [key] COLLATE Latin1_General_100_BIN2 HAVING COUNT(*)<>1)
  THROW 52810,''invalid_step_intent'',1;
 DECLARE @idText nvarchar(max)=JSON_VALUE(@json,''$.jobId''),@intentText nvarchar(max)=JSON_VALUE(@json,''$.intentId''),
  @token nvarchar(max)=JSON_VALUE(@json,''$.leaseToken''),@step nvarchar(max)=JSON_VALUE(@json,''$.step''),
  @revText nvarchar(max)=JSON_VALUE(@json,''$.expectedJobRevision''),@genText nvarchar(max)=JSON_VALUE(@json,''$.generation'');
 DECLARE @id uniqueidentifier=TRY_CONVERT(uniqueidentifier,@idText),@intent uniqueidentifier=TRY_CONVERT(uniqueidentifier,@intentText),
  @rev int=TRY_CONVERT(int,@revText),@gen int=TRY_CONVERT(int,@genText),@owner nvarchar(128)=USER_NAME();
 IF @id IS NULL OR DATALENGTH(@idText)<>72 OR @idText COLLATE Latin1_General_100_BIN2<>LOWER(CONVERT(nvarchar(36),@id)) COLLATE Latin1_General_100_BIN2
  OR @intent IS NULL OR DATALENGTH(@intentText)<>72 OR @intentText COLLATE Latin1_General_100_BIN2<>LOWER(CONVERT(nvarchar(36),@intent)) COLLATE Latin1_General_100_BIN2
  OR @token IS NULL OR DATALENGTH(@token)<>128 OR @token COLLATE Latin1_General_100_BIN2 LIKE N''%[^0-9a-f]%''
  OR @gen IS NULL OR @gen<1 OR @gen>=2147483647 OR @genText COLLATE Latin1_General_100_BIN2<>CONVERT(nvarchar(20),@gen)
  OR @rev IS NULL OR @rev<1 OR @rev>=2147483647 OR @revText COLLATE Latin1_General_100_BIN2<>CONVERT(nvarchar(20),@rev)
  OR @step IS NULL OR @step COLLATE Latin1_General_100_BIN2 NOT IN(N''os_identity'',N''tenant_directories'',N''tenant_key'',N''sql_database'',N''sql_login'',N''schema_bootstrap'',N''runtime_unit'')
  THROW 52810,''invalid_step_intent'',1;
 BEGIN TRY BEGIN TRANSACTION;
 DECLARE @found bit=0,@saved uniqueidentifier;
 SELECT @found=1 FROM platform.provision_jobs j WITH(UPDLOCK,HOLDLOCK)
 JOIN platform.trials t WITH(UPDLOCK,HOLDLOCK) ON t.trial_id=j.trial_id
 WHERE j.job_id=@id AND j.state=''leased'' AND j.job_revision=@rev AND j.generation=@gen
  AND j.lease_owner COLLATE Latin1_General_100_BIN2=@owner COLLATE Latin1_General_100_BIN2
  AND j.lease_hash=HASHBYTES(''SHA2_256'',CONVERT(varbinary(32),@token,2)) AND j.lease_expires_at>SYSUTCDATETIME()
  AND j.execution_ready=0 AND t.state=''queued'' AND t.revision=j.trial_revision AND t.activated_at IS NULL AND t.expires_at IS NULL;
 IF @found=0 THROW 52811,''step_lease_denied'',1;
 SELECT @saved=intent_id FROM platform.provision_step_intents WITH(UPDLOCK,HOLDLOCK)
  WHERE job_id=@id AND generation=@gen AND step_name=CONVERT(varchar(32),@step);
 IF @saved IS NOT NULL AND @saved<>@intent THROW 52812,''step_intent_conflict'',1;
 IF @saved IS NULL
 BEGIN
  -- A previous generation intent may have an unknown external outcome. Never adopt or repeat it automatically.
  IF EXISTS(SELECT 1 FROM platform.provision_step_intents WHERE job_id=@id AND step_name=CONVERT(varchar(32),@step))
   THROW 52813,''step_reconciliation_required'',1;
  INSERT platform.provision_step_intents(job_id,generation,step_name,intent_id,job_revision,owner_name,sql_actor)
   VALUES(@id,@gen,CONVERT(varchar(32),@step),@intent,@rev,@owner,ORIGINAL_LOGIN());
 END;
 COMMIT;
 SELECT LOWER(CONVERT(char(36),@id)) jobId,@gen generation,LOWER(CONVERT(char(36),@intent)) intentId,
  @step step,''intent_recorded'' state,CAST(0 AS bit) executionAllowed FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;
 END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
 END;');
 INSERT platform.schema_migrations(migration_id) VALUES('010_provision_step_journal_v1');
 COMMIT;SELECT N'PROVISION_STEP_JOURNAL_APPLIED';
END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
