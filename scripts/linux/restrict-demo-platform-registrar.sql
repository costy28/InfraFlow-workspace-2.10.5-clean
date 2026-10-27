-- Explicit permission transition only. No login/password change, company, resource or restart.
SET NOCOUNT ON;SET XACT_ABORT ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM'
 THROW 52001,'platform_database_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='005_operator_queue_audit_v1')
 OR OBJECT_ID(N'platform.queue_trial_by_operator',N'P') IS NULL
 THROW 52002,'operator_queue_migration_required',1;
IF SUSER_ID(N'infraflow_demo_registrar') IS NULL OR USER_ID(N'infraflow_demo_registrar') IS NULL
 OR (SELECT sid FROM sys.database_principals WHERE name=N'infraflow_demo_registrar')<>SUSER_SID(N'infraflow_demo_registrar')
 THROW 52003,'existing_registrar_mapping_required',1;
DECLARE @impersonating bit=0;
BEGIN TRY
 BEGIN TRANSACTION;
 REVOKE EXECUTE ON OBJECT::platform.queue_trial FROM infraflow_demo_registrar;
 DENY EXECUTE ON OBJECT::platform.queue_trial TO infraflow_demo_registrar;
 DENY EXECUTE ON OBJECT::platform.activate_trial TO infraflow_demo_registrar;
 DENY SELECT,INSERT,UPDATE,DELETE ON SCHEMA::platform TO infraflow_demo_registrar;
 DENY SELECT,INSERT,UPDATE,DELETE ON SCHEMA::operator_security TO infraflow_demo_registrar;
 DENY EXECUTE ON OBJECT::operator_security.read_account TO infraflow_demo_registrar;
 DENY EXECUTE ON OBJECT::operator_security.reserve_attempt TO infraflow_demo_registrar;
 DENY EXECUTE ON OBJECT::operator_security.claim_totp TO infraflow_demo_registrar;
 DENY EXECUTE ON OBJECT::operator_security.append_audit TO infraflow_demo_registrar;
 GRANT EXECUTE ON OBJECT::platform.queue_trial_by_operator TO infraflow_demo_registrar;
 EXECUTE AS USER=N'infraflow_demo_registrar';SET @impersonating=1;
 IF COALESCE(HAS_PERMS_BY_NAME(N'platform.queue_trial_by_operator',N'OBJECT',N'EXECUTE'),0)<>1
  OR COALESCE(HAS_PERMS_BY_NAME(N'platform.queue_trial',N'OBJECT',N'EXECUTE'),1)<>0
  OR COALESCE(HAS_PERMS_BY_NAME(N'platform.activate_trial',N'OBJECT',N'EXECUTE'),1)<>0
  OR COALESCE(HAS_PERMS_BY_NAME(N'platform.trials',N'OBJECT',N'SELECT'),1)<>0
  OR COALESCE(HAS_PERMS_BY_NAME(N'platform.trials',N'OBJECT',N'INSERT'),1)<>0
  OR COALESCE(HAS_PERMS_BY_NAME(N'platform.trials',N'OBJECT',N'UPDATE'),1)<>0
  OR COALESCE(HAS_PERMS_BY_NAME(N'platform.trials',N'OBJECT',N'DELETE'),1)<>0
  OR COALESCE(HAS_PERMS_BY_NAME(N'operator_security.accounts',N'OBJECT',N'SELECT'),1)<>0
  THROW 52004,'registrar_scope_not_confirmed',1;
 IF EXISTS(SELECT 1 FROM sys.fn_my_permissions(NULL,N'DATABASE')
  WHERE permission_name NOT IN (N'CONNECT',N'VIEW ANY COLUMN MASTER KEY DEFINITION',N'VIEW ANY COLUMN ENCRYPTION KEY DEFINITION'))
  THROW 52004,'unexpected_registrar_database_permission',1;
 REVERT;SET @impersonating=0;
 COMMIT;
 SELECT N'REGISTRAR_OPERATOR_SCOPE_APPLIED';
END TRY
BEGIN CATCH
 IF @impersonating=1 REVERT;
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
