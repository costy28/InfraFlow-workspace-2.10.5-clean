-- Read-only preflight for extending the EXISTING executor, not creating it.
SET NOCOUNT ON;SET XACT_ABORT ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM' OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1
 THROW 54301,'admin_platform_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='017_os_identity_execution_context_v1')
 OR OBJECT_ID(N'platform.verify_os_identity_execution_context',N'P') IS NULL
 THROW 54302,'os_context_schema_required',1;
DECLARE @name sysname=N'infraflow_demo_os_executor',@sid varbinary(85)=SUSER_SID(N'infraflow_demo_os_executor');
IF @sid IS NULL OR NOT EXISTS(SELECT 1 FROM sys.server_principals WHERE sid=@sid AND type='S' AND is_disabled=0)
 OR NOT EXISTS(SELECT 1 FROM sys.database_principals WHERE name=@name AND sid=@sid AND type='S')
 THROW 54303,'executor_mapping_required',1;
IF EXISTS(SELECT 1 FROM sys.server_role_members WHERE member_principal_id=SUSER_ID(@name))
 OR EXISTS(SELECT 1 FROM sys.database_role_members WHERE member_principal_id=USER_ID(@name))
 OR EXISTS(SELECT 1 FROM sys.schemas WHERE principal_id=USER_ID(@name))
 OR EXISTS(SELECT 1 FROM sys.objects WHERE principal_id=USER_ID(@name))
 OR EXISTS(SELECT 1 FROM sys.databases WHERE owner_sid=@sid)
 THROW 54304,'executor_membership_or_ownership_requires_review',1;
DECLARE @impersonating bit=0,@invalid bit=0;
BEGIN TRY BEGIN TRANSACTION;
 IF EXISTS(SELECT 1 FROM platform.provision_jobs WITH(UPDLOCK,HOLDLOCK) WHERE state='leased')
 OR EXISTS(SELECT 1 FROM platform.os_identity_delegations WITH(UPDLOCK,HOLDLOCK))
 OR EXISTS(SELECT 1 FROM platform.os_identity_acceptances WITH(UPDLOCK,HOLDLOCK))
 OR EXISTS(SELECT 1 FROM platform.os_identity_results WITH(UPDLOCK,HOLDLOCK))
 THROW 54305,'executor_not_idle_requires_review',1;
 EXECUTE AS LOGIN=N'infraflow_demo_os_executor';SET @impersonating=1;
 IF COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>0
 OR COALESCE(HAS_DBACCESS(N'INFRAFLOW_DEMO'),1)<>0
 OR EXISTS(SELECT 1 FROM sys.fn_my_permissions(NULL,'SERVER') WHERE permission_name NOT IN('CONNECT SQL','VIEW ANY DATABASE'))
 SET @invalid=1;
 REVERT;SET @impersonating=0;
 IF @invalid=1 THROW 54306,'executor_server_scope_requires_review',1;
 EXECUTE AS USER=N'infraflow_demo_os_executor';SET @impersonating=1;
 IF EXISTS(SELECT 1 FROM sys.fn_my_permissions(NULL,'DATABASE') WHERE permission_name NOT IN('CONNECT','VIEW ANY COLUMN ENCRYPTION KEY DEFINITION','VIEW ANY COLUMN MASTER KEY DEFINITION'))
 OR COALESCE(HAS_PERMS_BY_NAME('platform.accept_os_identity_delegation','OBJECT','EXECUTE'),0)<>1
 OR COALESCE(HAS_PERMS_BY_NAME('platform.record_os_identity_result','OBJECT','EXECUTE'),0)<>1
 OR COALESCE(HAS_PERMS_BY_NAME('platform.verify_os_identity_execution_context','OBJECT','EXECUTE'),-1)<>0
 OR EXISTS(SELECT 1 FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id
 CROSS APPLY sys.fn_my_permissions(QUOTENAME(s.name)+'.'+QUOTENAME(o.name),'OBJECT') p
 WHERE s.name IN('platform','operator_security')
 AND p.permission_name IN('SELECT','INSERT','UPDATE','DELETE','EXECUTE','ALTER','CONTROL','TAKE OWNERSHIP','REFERENCES','VIEW DEFINITION')
 AND NOT(s.name='platform' AND o.name IN('accept_os_identity_delegation','record_os_identity_result') AND p.permission_name='EXECUTE'))
 SET @invalid=1;
 REVERT;SET @impersonating=0;
 IF @invalid=1 THROW 54307,'executor_two_rpc_baseline_required',1;
 COMMIT;SELECT N'OS_CONTEXT_SCOPE_PREFLIGHT_OK';
END TRY BEGIN CATCH
 IF @impersonating=1 REVERT;
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
