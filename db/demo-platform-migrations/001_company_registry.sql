-- PLATFORM ONLY. Never put in the ERP migration runner.
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
IF DB_NAME() COLLATE Latin1_General_100_BIN2 <> N'INFRAFLOW_DEMO_PLATFORM'
 THROW 51201,'platform_database_required',1;
IF SCHEMA_ID(N'platform') IS NULL OR OBJECT_ID(N'platform.bootstrap',N'U') IS NULL
 THROW 51202,'platform_bootstrap_required',1;
BEGIN TRY
 BEGIN TRANSACTION;
 -- Serialize migration attempts without locking unrelated databases.
 DECLARE @lockResult int;
 EXEC @lockResult=sys.sp_getapplock @Resource=N'infraflow-platform-migrations',
  @LockMode=N'Exclusive',@LockOwner=N'Transaction',@LockTimeout=5000;
 IF @lockResult<0 THROW 51203,'platform_migration_busy',1;
 IF OBJECT_ID(N'platform.schema_migrations',N'U') IS NULL
  CREATE TABLE platform.schema_migrations(
   migration_id varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
   applied_at datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME()
  );
 IF EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='001_company_registry_v1')
 BEGIN
  COMMIT; SELECT N'PLATFORM_REGISTRY_ALREADY_APPLIED'; RETURN;
 END;
 IF OBJECT_ID(N'platform.trials',N'U') IS NOT NULL
  OR OBJECT_ID(N'platform.trial_commands',N'U') IS NOT NULL
  OR OBJECT_ID(N'platform.trial_events',N'U') IS NOT NULL
  THROW 51204,'platform_partial_schema_requires_review',1;
 CREATE TABLE platform.trials(
  trial_id uniqueidentifier NOT NULL PRIMARY KEY,
  approval_id varchar(128) COLLATE Latin1_General_100_BIN2 NOT NULL UNIQUE,
  company_name nvarchar(200) NOT NULL CHECK(LEN(LTRIM(RTRIM(company_name)))>0),
  state varchar(32) COLLATE Latin1_General_100_BIN2 NOT NULL
   CHECK(state IN ('queued','provisioning','awaiting_activation','active','expired','purge_pending','purging','deleted')),
  revision int NOT NULL DEFAULT 0 CHECK(revision>=0),
  created_at datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  activated_at datetime2(3) NULL,
  expires_at datetime2(3) NULL,
  database_name AS (CONVERT(varchar(64),'INFRAFLOW_DEMO_T_'+UPPER(REPLACE(CONVERT(char(36),trial_id),'-','')))) PERSISTED,
  storage_key AS (LOWER(CONVERT(char(36),trial_id))) PERSISTED,
  runtime_key AS (LOWER(CONVERT(char(36),trial_id))) PERSISTED,
  key_ref AS (CONVERT(varchar(64),'trial:'+LOWER(CONVERT(char(36),trial_id)))) PERSISTED,
  CONSTRAINT CK_platform_trial_activation CHECK(
   (activated_at IS NULL AND expires_at IS NULL AND state IN ('queued','provisioning','awaiting_activation')) OR
   (activated_at IS NOT NULL AND expires_at IS NOT NULL AND activated_at>=created_at AND expires_at>activated_at
    AND state IN ('active','expired','purge_pending','purging','deleted')))
 );
 CREATE UNIQUE INDEX UX_platform_trial_database ON platform.trials(database_name);
 CREATE INDEX IX_platform_trial_expiry ON platform.trials(state,expires_at);
 CREATE TABLE platform.trial_commands(
  trial_id uniqueidentifier NOT NULL REFERENCES platform.trials(trial_id),
  command_id varchar(128) COLLATE Latin1_General_100_BIN2 NOT NULL,
  request_digest binary(32) NOT NULL,
  result_revision int NOT NULL CHECK(result_revision>=0),
  result_json nvarchar(max) NOT NULL CHECK(ISJSON(result_json)=1),
  created_at datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  PRIMARY KEY(trial_id,command_id)
 );
 CREATE TABLE platform.trial_events(
  trial_id uniqueidentifier NOT NULL REFERENCES platform.trials(trial_id),
  revision int NOT NULL CHECK(revision>=0),
  action varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
  actor_ref varchar(128) COLLATE Latin1_General_100_BIN2 NOT NULL,
  occurred_at datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  PRIMARY KEY(trial_id,revision)
 );
 INSERT platform.schema_migrations(migration_id) VALUES('001_company_registry_v1');
 COMMIT;
 SELECT N'PLATFORM_REGISTRY_APPLIED';
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
-- No writer login, DML grants, public route or resource provisioning in this migration.
