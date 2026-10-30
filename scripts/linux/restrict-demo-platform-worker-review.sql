-- Explicit scope transition for existing worker only. No password, job, ticket or service mutation.
SET NOCOUNT ON;SET XACT_ABORT ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM' OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1
 THROW 53601,'admin_platform_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='012_adapter_review_tickets_v1')
 OR OBJECT_ID(N'platform.record_step_intent',N'P') IS NULL OR OBJECT_ID(N'platform.adapter_review_ticket_command',N'P') IS NULL
 THROW 53602,'worker_review_schema_required',1;
DECLARE @name sysname=N'infraflow_demo_lease',@sid varbinary(85)=SUSER_SID(N'infraflow_demo_lease');
IF @sid IS NULL OR USER_ID(@name) IS NULL
 OR NOT EXISTS(SELECT 1 FROM sys.server_principals WHERE sid=@sid AND type='S' AND is_disabled=0)
 OR NOT EXISTS(SELECT 1 FROM sys.database_principals WHERE name=@name AND sid=@sid AND type='S')
 THROW 53603,'worker_mapping_required',1;
IF EXISTS(SELECT 1 FROM sys.server_role_members WHERE member_principal_id=SUSER_ID(@name))
 OR EXISTS(SELECT 1 FROM sys.database_role_members WHERE member_principal_id=USER_ID(@name))
 OR EXISTS(SELECT 1 FROM sys.schemas WHERE principal_id=USER_ID(@name))
 OR EXISTS(SELECT 1 FROM sys.objects WHERE principal_id=USER_ID(@name))
 OR EXISTS(SELECT 1 FROM sys.databases WHERE owner_sid=@sid)
 THROW 53604,'worker_membership_or_ownership_requires_review',1;
DECLARE @impersonating bit=0;
BEGIN TRY BEGIN TRANSACTION;
 IF EXISTS(SELECT 1 FROM platform.provision_jobs WITH(UPDLOCK,HOLDLOCK) WHERE state='leased')
  THROW 53605,'worker_not_idle_stop_no_changes',1;
 EXECUTE AS LOGIN=N'infraflow_demo_lease';SET @impersonating=1;
 IF EXISTS(SELECT 1 FROM sys.fn_my_permissions(NULL,'SERVER') WHERE permission_name NOT IN('CONNECT SQL','VIEW ANY DATABASE'))
  OR COALESCE(HAS_DBACCESS(N'INFRAFLOW_DEMO'),1)<>0 THROW 53606,'worker_server_scope_requires_review',1;
 REVERT;SET @impersonating=0;
 EXECUTE AS USER=N'infraflow_demo_lease';SET @impersonating=1;
 IF EXISTS(SELECT 1 FROM sys.fn_my_permissions(NULL,'DATABASE') WHERE permission_name NOT IN('CONNECT','VIEW ANY COLUMN ENCRYPTION KEY DEFINITION','VIEW ANY COLUMN MASTER KEY DEFINITION'))
  OR COALESCE(HAS_PERMS_BY_NAME('platform.provision_lease_command','OBJECT','EXECUTE'),0)<>1
  OR COALESCE(HAS_PERMS_BY_NAME('platform.record_step_intent','OBJECT','EXECUTE'),0)<>COALESCE(HAS_PERMS_BY_NAME('platform.adapter_review_ticket_command','OBJECT','EXECUTE'),0)
  OR EXISTS(SELECT 1 FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id
   CROSS APPLY sys.fn_my_permissions(QUOTENAME(s.name)+'.'+QUOTENAME(o.name),'OBJECT') p
   WHERE s.name IN('platform','operator_security')
   AND p.permission_name IN('SELECT','INSERT','UPDATE','DELETE','EXECUTE','ALTER','CONTROL','TAKE OWNERSHIP','REFERENCES','VIEW DEFINITION')
   AND NOT(s.name='platform' AND o.name IN('provision_lease_command','record_step_intent','adapter_review_ticket_command') AND p.permission_name='EXECUTE'))
  THROW 53607,'worker_unexpected_effective_scope',1;
 REVERT;SET @impersonating=0;
 DENY SELECT,INSERT,UPDATE,DELETE ON SCHEMA::platform TO infraflow_demo_lease;
 DENY SELECT,INSERT,UPDATE,DELETE ON SCHEMA::operator_security TO infraflow_demo_lease;
 DECLARE @sql nvarchar(max)=N'';
 SELECT @sql=@sql+N'DENY EXECUTE ON OBJECT::'+QUOTENAME(s.name)+N'.'+QUOTENAME(o.name)+N' TO [infraflow_demo_lease];'
 FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id
 WHERE s.name IN('platform','operator_security') AND o.type IN('P','PC')
 AND NOT(s.name='platform' AND o.name IN('provision_lease_command','record_step_intent','adapter_review_ticket_command'));
 EXEC sys.sp_executesql @sql;
 GRANT EXECUTE ON OBJECT::platform.provision_lease_command TO infraflow_demo_lease;
 GRANT EXECUTE ON OBJECT::platform.record_step_intent TO infraflow_demo_lease;
 GRANT EXECUTE ON OBJECT::platform.adapter_review_ticket_command TO infraflow_demo_lease;
 EXECUTE AS USER=N'infraflow_demo_lease';SET @impersonating=1;
 IF COALESCE(HAS_PERMS_BY_NAME('platform.provision_lease_command','OBJECT','EXECUTE'),0)<>1
  OR COALESCE(HAS_PERMS_BY_NAME('platform.record_step_intent','OBJECT','EXECUTE'),0)<>1
  OR COALESCE(HAS_PERMS_BY_NAME('platform.adapter_review_ticket_command','OBJECT','EXECUTE'),0)<>1
  OR EXISTS(SELECT 1 FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id
   CROSS APPLY sys.fn_my_permissions(QUOTENAME(s.name)+'.'+QUOTENAME(o.name),'OBJECT') p
   WHERE s.name IN('platform','operator_security')
   AND p.permission_name IN('SELECT','INSERT','UPDATE','DELETE','EXECUTE','ALTER','CONTROL','TAKE OWNERSHIP','REFERENCES','VIEW DEFINITION')
   AND NOT(s.name='platform' AND o.name IN('provision_lease_command','record_step_intent','adapter_review_ticket_command') AND p.permission_name='EXECUTE'))
  THROW 53608,'worker_review_scope_not_confirmed',1;
 REVERT;SET @impersonating=0;
 COMMIT;SELECT N'WORKER_REVIEW_SQL_SCOPE_APPLIED';
END TRY BEGIN CATCH
 IF @impersonating=1 REVERT;
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
