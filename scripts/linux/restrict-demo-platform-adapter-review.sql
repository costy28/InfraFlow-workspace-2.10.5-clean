-- Existing dedicated adapter review login only. No jobs, tickets, secrets or service changes.
SET NOCOUNT ON;SET XACT_ABORT ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM'
 THROW 53401,'platform_database_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='012_adapter_review_tickets_v1')
 OR OBJECT_ID(N'platform.read_adapter_resource_review',N'P') IS NULL
 OR OBJECT_ID(N'platform.adapter_review_ticket_command',N'P') IS NULL
 THROW 53402,'adapter_migrations_required',1;
DECLARE @name sysname=N'infraflow_demo_adapter_review',@sid varbinary(85)=SUSER_SID(N'infraflow_demo_adapter_review');
IF @sid IS NULL OR USER_ID(@name) IS NULL
 OR NOT EXISTS(SELECT 1 FROM sys.server_principals WHERE sid=@sid AND type='S' AND is_disabled=0)
 OR NOT EXISTS(SELECT 1 FROM sys.database_principals WHERE name=@name AND sid=@sid AND type='S')
 THROW 53403,'adapter_mapping_required',1;
IF EXISTS(SELECT 1 FROM sys.server_role_members WHERE member_principal_id=SUSER_ID(@name))
 OR EXISTS(SELECT 1 FROM sys.database_role_members WHERE member_principal_id=USER_ID(@name))
 OR EXISTS(SELECT 1 FROM sys.schemas WHERE principal_id=USER_ID(@name))
 OR EXISTS(SELECT 1 FROM sys.objects WHERE principal_id=USER_ID(@name))
 OR EXISTS(SELECT 1 FROM sys.databases WHERE owner_sid=@sid)
 THROW 53404,'adapter_membership_or_ownership_requires_review',1;
DECLARE @impersonating bit=0;
BEGIN TRY BEGIN TRANSACTION;
 EXECUTE AS LOGIN=N'infraflow_demo_adapter_review';SET @impersonating=1;
 IF EXISTS(SELECT 1 FROM sys.fn_my_permissions(NULL,'SERVER') WHERE permission_name NOT IN('CONNECT SQL','VIEW ANY DATABASE'))
  OR COALESCE(HAS_DBACCESS(N'INFRAFLOW_DEMO'),1)<>0 THROW 53405,'adapter_server_scope_requires_review',1;
 REVERT;SET @impersonating=0;
 EXECUTE AS USER=N'infraflow_demo_adapter_review';SET @impersonating=1;
 IF EXISTS(SELECT 1 FROM sys.fn_my_permissions(NULL,'DATABASE') WHERE permission_name NOT IN('CONNECT','VIEW ANY COLUMN ENCRYPTION KEY DEFINITION','VIEW ANY COLUMN MASTER KEY DEFINITION'))
  THROW 53406,'adapter_database_scope_requires_review',1;
 REVERT;SET @impersonating=0;
 DENY SELECT,INSERT,UPDATE,DELETE ON SCHEMA::platform TO infraflow_demo_adapter_review;
 DENY SELECT,INSERT,UPDATE,DELETE ON SCHEMA::operator_security TO infraflow_demo_adapter_review;
 DECLARE @sql nvarchar(max)=N'';
 SELECT @sql=@sql+N'DENY EXECUTE ON OBJECT::'+QUOTENAME(s.name)+N'.'+QUOTENAME(o.name)+N' TO [infraflow_demo_adapter_review];'
 FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id
 WHERE s.name IN('platform','operator_security') AND o.type IN('P','PC')
  AND NOT(s.name='platform' AND o.name IN('read_adapter_resource_review','adapter_review_ticket_command'));
 EXEC sys.sp_executesql @sql;
 GRANT EXECUTE ON OBJECT::platform.read_adapter_resource_review TO infraflow_demo_adapter_review;
 GRANT EXECUTE ON OBJECT::platform.adapter_review_ticket_command TO infraflow_demo_adapter_review;
 EXECUTE AS USER=N'infraflow_demo_adapter_review';SET @impersonating=1;
 IF COALESCE(HAS_PERMS_BY_NAME('platform.read_adapter_resource_review','OBJECT','EXECUTE'),0)<>1
  OR COALESCE(HAS_PERMS_BY_NAME('platform.adapter_review_ticket_command','OBJECT','EXECUTE'),0)<>1
  OR EXISTS(SELECT 1 FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id
   CROSS APPLY sys.fn_my_permissions(QUOTENAME(s.name)+'.'+QUOTENAME(o.name),'OBJECT') p
   WHERE s.name IN('platform','operator_security')
   AND p.permission_name IN('SELECT','INSERT','UPDATE','DELETE','EXECUTE','ALTER','CONTROL','TAKE OWNERSHIP','REFERENCES','VIEW DEFINITION')
   AND NOT(s.name='platform' AND o.name IN('read_adapter_resource_review','adapter_review_ticket_command') AND p.permission_name='EXECUTE'))
  THROW 53407,'adapter_effective_scope_not_confirmed',1;
 REVERT;SET @impersonating=0;
 COMMIT;SELECT N'ADAPTER_REVIEW_SQL_SCOPE_APPLIED';
END TRY BEGIN CATCH
 IF @impersonating=1 REVERT;
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
