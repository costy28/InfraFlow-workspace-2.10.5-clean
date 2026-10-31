-- Evidence storage only. No grants, RPCs, host authority, jobs, accounts or activation.
SET NOCOUNT ON;SET XACT_ABORT ON;SET ANSI_NULLS ON;SET QUOTED_IDENTIFIER ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM' OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1
 THROW 54401,'admin_platform_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='017_os_identity_execution_context_v1')
 THROW 54402,'os_context_required',1;
BEGIN TRY BEGIN TRANSACTION;
 DECLARE @lock int;
 EXEC @lock=sys.sp_getapplock @Resource=N'infraflow-platform-migrations',@LockMode=N'Exclusive',@LockOwner=N'Transaction',@LockTimeout=5000;
 IF @lock<0 THROW 54403,'platform_migration_busy',1;
 IF EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='018_tenant_directory_evidence_v1')
 BEGIN COMMIT;SELECT N'TENANT_DIRECTORY_EVIDENCE_ALREADY_APPLIED';RETURN;END;
 IF EXISTS(SELECT 1 FROM platform.provision_jobs WITH(UPDLOCK,HOLDLOCK) WHERE state='leased')
 THROW 54404,'worker_not_idle',1;
 IF OBJECT_ID(N'platform.directory_attempts') IS NOT NULL OR OBJECT_ID(N'platform.directory_attempt_events') IS NOT NULL
 OR OBJECT_ID(N'platform.directory_results') IS NOT NULL OR OBJECT_ID(N'platform.directory_observations') IS NOT NULL
 OR OBJECT_ID(N'platform.directory_result_events') IS NOT NULL
 THROW 54405,'directory_schema_partial_requires_review',1;

 CREATE TABLE platform.directory_attempts(
  intent_id uniqueidentifier NOT NULL PRIMARY KEY REFERENCES platform.provision_step_intents(intent_id),
  prior_os_intent_id uniqueidentifier NOT NULL REFERENCES platform.os_identity_results(intent_id),
  attempt_id uniqueidentifier NOT NULL UNIQUE,
  attempt_hash binary(32) NOT NULL UNIQUE,
  generation int NOT NULL CHECK(generation>0 AND generation<2147483647),
  job_revision int NOT NULL CHECK(job_revision>0 AND job_revision<2147483647),
  observed_uid int NOT NULL CHECK(observed_uid>0 AND observed_uid<2147483647),
  observed_gid int NOT NULL CHECK(observed_gid>0 AND observed_gid<2147483647),
  storage_key varchar(256) COLLATE Latin1_General_100_BIN2 NOT NULL,
  config_key varchar(256) COLLATE Latin1_General_100_BIN2 NOT NULL,
  state varchar(16) COLLATE Latin1_General_100_BIN2 NOT NULL CHECK(state='prepared'),
  prepared_at datetime2(3) NOT NULL,deadline datetime2(3) NOT NULL,
  owner_name nvarchar(128) NOT NULL,sql_actor nvarchar(128) NOT NULL,
  CHECK(deadline>prepared_at),CHECK(intent_id<>prior_os_intent_id)
 );
 CREATE TABLE platform.directory_attempt_events(
  event_id bigint IDENTITY PRIMARY KEY,intent_id uniqueidentifier NOT NULL REFERENCES platform.directory_attempts(intent_id),
  action varchar(32) NOT NULL CHECK(action='directories.prepared'),
  sql_actor nvarchar(128) NOT NULL,created_at datetime2(3) NOT NULL
 );
 CREATE TABLE platform.directory_results(
  intent_id uniqueidentifier NOT NULL PRIMARY KEY REFERENCES platform.directory_attempts(intent_id),
  outcome varchar(24) COLLATE Latin1_General_100_BIN2 NOT NULL CHECK(outcome IN('observed_created','uncertain')),
  journal_digest binary(32) NULL,
  confirmed_count tinyint NOT NULL,
  executor_name nvarchar(128) NOT NULL,sql_actor nvarchar(128) NOT NULL,recorded_at datetime2(3) NOT NULL,
  CHECK((outcome='observed_created' AND confirmed_count=8 AND journal_digest IS NOT NULL)
     OR (outcome='uncertain' AND confirmed_count=0 AND journal_digest IS NULL))
 );
 -- Ordinals bind to a server-derived fixed policy; clients never store arbitrary paths here.
 CREATE TABLE platform.directory_observations(
  intent_id uniqueidentifier NOT NULL REFERENCES platform.directory_results(intent_id),
  ordinal tinyint NOT NULL CHECK(ordinal BETWEEN 0 AND 7),
  observed_uid int NOT NULL CHECK(observed_uid>=0 AND observed_uid<2147483647),
  observed_gid int NOT NULL CHECK(observed_gid>=0 AND observed_gid<2147483647),
  mode char(4) COLLATE Latin1_General_100_BIN2 NOT NULL,
  device decimal(20,0) NOT NULL CHECK(device>=0 AND device<=18446744073709551615),
  inode decimal(20,0) NOT NULL CHECK(inode>0 AND inode<=18446744073709551615),
  PRIMARY KEY(intent_id,ordinal),
  CHECK((ordinal IN(0,1) AND observed_uid=0 AND observed_gid=0 AND mode='0711')
     OR (ordinal=3 AND observed_uid=0 AND observed_gid>0 AND mode='0750')
     OR (ordinal IN(2,4,5,6,7) AND observed_uid>0 AND observed_gid>0 AND mode='0700'))
 );
 CREATE TABLE platform.directory_result_events(
  event_id bigint IDENTITY PRIMARY KEY,intent_id uniqueidentifier NOT NULL REFERENCES platform.directory_results(intent_id),
  action varchar(32) NOT NULL CHECK(action='directories.result_recorded'),
  sql_actor nvarchar(128) NOT NULL,created_at datetime2(3) NOT NULL
 );
 INSERT platform.schema_migrations(migration_id) VALUES('018_tenant_directory_evidence_v1');
 COMMIT;SELECT N'TENANT_DIRECTORY_EVIDENCE_APPLIED';
END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
