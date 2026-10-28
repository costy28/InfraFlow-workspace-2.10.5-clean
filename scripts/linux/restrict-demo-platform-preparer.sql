-- Existing dedicated preparer login only. No job, password or service changes.
SET NOCOUNT ON;SET XACT_ABORT ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM'
 THROW 52901,'platform_database_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='009_operator_prepare_change_v1')
 OR OBJECT_ID(N'platform.request_provision_job',N'P') IS NULL
 THROW 52902,'prepare_migrations_required',1;
DECLARE @name sysname=N'infraflow_demo_preparer',@sid varbinary(85)=SUSER_SID(N'infraflow_demo_preparer');
IF @sid IS NULL OR USER_ID(@name) IS NULL
 OR NOT EXISTS(SELECT 1 FROM sys.server_principals WHERE sid=@sid AND type='S' AND is_disabled=0)
 OR NOT EXISTS(SELECT 1 FROM sys.database_principals WHERE name=@name AND sid=@sid AND type='S')
 THROW 52903,'existing_preparer_mapping_required',1;
IF EXISTS(SELECT 1 FROM sys.server_role_members WHERE member_principal_id=SUSER_ID(@name))
 OR EXISTS(SELECT 1 FROM sys.database_role_members WHERE member_principal_id=USER_ID(@name))
 OR EXISTS(SELECT 1 FROM sys.schemas WHERE principal_id=USER_ID(@name))
 OR EXISTS(SELECT 1 FROM sys.objects WHERE principal_id=USER_ID(@name))
 OR EXISTS(SELECT 1 FROM sys.databases WHERE owner_sid=@sid)
 THROW 52904,'preparer_ownership_or_membership_requires_review',1;
DECLARE @impersonating bit=0;
BEGIN TRY
 BEGIN TRANSACTION;
 EXECUTE AS LOGIN=N'infraflow_demo_preparer';SET @impersonating=1;
 IF EXISTS(SELECT 1 FROM sys.fn_my_permissions(NULL,'SERVER') WHERE permission_name NOT IN('CONNECT SQL','VIEW ANY DATABASE'))
  OR COALESCE(HAS_DBACCESS(N'INFRAFLOW_DEMO'),1)<>0 THROW 52905,'preparer_server_scope_requires_review',1;
 REVERT;SET @impersonating=0;
 EXECUTE AS USER=N'infraflow_demo_preparer';SET @impersonating=1;
 IF EXISTS(SELECT 1 FROM sys.fn_my_permissions(NULL,'DATABASE') WHERE permission_name NOT IN('CONNECT','VIEW ANY COLUMN ENCRYPTION KEY DEFINITION','VIEW ANY COLUMN MASTER KEY DEFINITION'))
  THROW 52906,'preparer_database_scope_requires_review',1;
 REVERT;SET @impersonating=0;
 DENY SELECT,INSERT,UPDATE,DELETE ON SCHEMA::platform TO infraflow_demo_preparer;
 DENY SELECT,INSERT,UPDATE,DELETE ON SCHEMA::operator_security TO infraflow_demo_preparer;
 DECLARE @sql nvarchar(max)=N'';
 SELECT @sql=@sql+N'DENY EXECUTE ON OBJECT::'+QUOTENAME(s.name)+N'.'+QUOTENAME(o.name)+N' TO [infraflow_demo_preparer];'
 FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id
 WHERE s.name IN('platform','operator_security') AND o.type IN('P','PC')
 AND NOT(s.name='platform' AND o.name='request_provision_job');
 EXEC sys.sp_executesql @sql;
 GRANT EXECUTE ON OBJECT::platform.request_provision_job TO infraflow_demo_preparer;
 EXECUTE AS USER=N'infraflow_demo_preparer';SET @impersonating=1;
 IF COALESCE(HAS_PERMS_BY_NAME('platform.request_provision_job','OBJECT','EXECUTE'),0)<>1
  OR COALESCE(HAS_PERMS_BY_NAME('platform.provision_lease_command','OBJECT','EXECUTE'),1)<>0
  OR COALESCE(HAS_PERMS_BY_NAME('platform.activate_trial','OBJECT','EXECUTE'),1)<>0
  OR COALESCE(HAS_PERMS_BY_NAME('platform.queue_trial_by_operator','OBJECT','EXECUTE'),1)<>0
  OR COALESCE(HAS_PERMS_BY_NAME('operator_security.grant_prepare_scope','OBJECT','EXECUTE'),1)<>0
  OR COALESCE(HAS_PERMS_BY_NAME('operator_security.read_account','OBJECT','EXECUTE'),1)<>0
  OR COALESCE(HAS_PERMS_BY_NAME('platform.provision_jobs','OBJECT','SELECT'),1)<>0
  OR COALESCE(HAS_PERMS_BY_NAME('platform.provision_jobs','OBJECT','UPDATE'),1)<>0
  THROW 52907,'preparer_effective_scope_not_confirmed',1;
 REVERT;SET @impersonating=0;
 COMMIT;SELECT N'PREPARER_SQL_SCOPE_APPLIED';
END TRY
BEGIN CATCH
 IF @impersonating=1 REVERT;
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
