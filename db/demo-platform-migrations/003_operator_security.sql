-- Separate operator security schema: platform_reader gets no access here.
SET NOCOUNT ON; SET XACT_ABORT ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2 <> N'INFRAFLOW_DEMO_PLATFORM'
 THROW 51601,'platform_database_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='002_trial_commands_v1')
 THROW 51602,'platform_commands_required',1;
BEGIN TRY
 BEGIN TRANSACTION;
 DECLARE @locked int;
 EXEC @locked=sys.sp_getapplock @Resource=N'infraflow-platform-migrations',@LockMode=N'Exclusive',@LockOwner=N'Transaction',@LockTimeout=5000;
 IF @locked<0 THROW 51603,'platform_migration_busy',1;
 IF EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='003_operator_security_v1')
 BEGIN COMMIT; SELECT N'OPERATOR_SECURITY_ALREADY_APPLIED'; RETURN; END;
 IF SCHEMA_ID(N'operator_security') IS NOT NULL THROW 51604,'operator_schema_requires_review',1;
 EXEC(N'CREATE SCHEMA operator_security AUTHORIZATION dbo');
 CREATE TABLE operator_security.accounts(
  operator_id uniqueidentifier NOT NULL PRIMARY KEY,
  username varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL UNIQUE,
  revision int NOT NULL CHECK(revision>=0), enabled bit NOT NULL DEFAULT 0,
  password_hash varchar(128) NOT NULL,
  totp_envelope varchar(256) NOT NULL,
  scopes_json nvarchar(1024) NOT NULL CHECK(ISJSON(scopes_json)=1),
  last_totp_counter bigint NOT NULL DEFAULT -1 CHECK(last_totp_counter>=-1),
  window_started_at datetime2(3) NULL,
  attempt_count int NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 5)
 );
 CREATE TABLE operator_security.audit(
  audit_id bigint IDENTITY PRIMARY KEY,
  operator_id uniqueidentifier NOT NULL REFERENCES operator_security.accounts(operator_id),
  action varchar(64) NOT NULL CHECK(action IN ('operator_login','operator_attempt_reserved','operator_attempt_limited','operator_totp_claimed',
   'trial.read','trial.queue','trial.activate','session.logout')),
  occurred_at datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME()
 );
 CREATE INDEX IX_operator_security_audit ON operator_security.audit(operator_id,audit_id);
 INSERT platform.schema_migrations(migration_id) VALUES('003_operator_security_v1');
 COMMIT; SELECT N'OPERATOR_SECURITY_APPLIED';
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
-- No account, key, login or grant is created by this migration.
