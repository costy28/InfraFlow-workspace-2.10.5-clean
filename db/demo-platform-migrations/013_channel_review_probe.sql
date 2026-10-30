-- Dedicated review-only step; leaves real provisioning step names available. No grants/effects.
SET NOCOUNT ON;SET XACT_ABORT ON;SET ANSI_NULLS ON;SET QUOTED_IDENTIFIER ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM' OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1
 THROW 53701,'admin_platform_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='012_adapter_review_tickets_v1')
 THROW 53702,'review_tickets_required',1;
BEGIN TRY BEGIN TRANSACTION;
 DECLARE @lock int;
 EXEC @lock=sys.sp_getapplock @Resource=N'infraflow-platform-migrations',@LockMode=N'Exclusive',@LockOwner=N'Transaction',@LockTimeout=5000;
 IF @lock<0 THROW 53703,'platform_migration_busy',1;
 IF EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='013_channel_review_probe_v1')
 BEGIN COMMIT;SELECT N'CHANNEL_REVIEW_PROBE_ALREADY_APPLIED';RETURN;END;
 IF EXISTS(SELECT 1 FROM platform.provision_jobs WITH(UPDLOCK,HOLDLOCK) WHERE state='leased')
  THROW 53704,'worker_not_idle',1;
 DECLARE @object int=OBJECT_ID(N'platform.provision_step_intents'),@constraint sysname,@definition nvarchar(max),@expected nvarchar(max),@count int;
 SELECT @count=COUNT(*),@constraint=MIN(name),@definition=MIN(CONVERT(nvarchar(4000),definition))
 FROM sys.check_constraints WHERE parent_object_id=@object AND parent_column_id=COLUMNPROPERTY(@object,N'step_name','ColumnId');
 IF @object IS NULL OR @count<>1 OR OBJECT_ID(N'platform.CK_provision_step_name_v2') IS NOT NULL
  THROW 53705,'step_constraint_requires_review',1;
 -- Compare against the current engine canonical form of the exact old constraint.
 CREATE TABLE #expected_step_name(step_name varchar(32) COLLATE Latin1_General_100_BIN2 NOT NULL
  CHECK(step_name IN('os_identity','tenant_directories','tenant_key','sql_database','sql_login','schema_bootstrap','runtime_unit')));
 SELECT @expected=definition FROM tempdb.sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'tempdb..#expected_step_name');
 DROP TABLE #expected_step_name;
 IF @definition IS NULL OR @expected IS NULL OR @definition COLLATE Latin1_General_100_BIN2<>@expected COLLATE Latin1_General_100_BIN2
  THROW 53705,'step_constraint_requires_review',1;
 DECLARE @proc nvarchar(max)=OBJECT_DEFINITION(OBJECT_ID(N'platform.record_step_intent')),
  @old nvarchar(max)=N'NOT IN(N''os_identity'',N''tenant_directories'',N''tenant_key'',N''sql_database'',N''sql_login'',N''schema_bootstrap'',N''runtime_unit'')',
  @new nvarchar(max)=N'NOT IN(N''os_identity'',N''tenant_directories'',N''tenant_key'',N''sql_database'',N''sql_login'',N''schema_bootstrap'',N''runtime_unit'',N''channel_review_probe'')',
  @prefix nvarchar(100)=N'CREATE PROCEDURE platform.record_step_intent';
 IF @proc IS NULL OR LEFT(@proc,LEN(@prefix)) COLLATE Latin1_General_100_BIN2<>@prefix COLLATE Latin1_General_100_BIN2
  OR (LEN(@proc)-LEN(REPLACE(@proc,@old,N'')))<>LEN(@old)
  THROW 53706,'step_procedure_requires_review',1;
 DECLARE @sql nvarchar(max)=N'ALTER TABLE platform.provision_step_intents DROP CONSTRAINT '+QUOTENAME(@constraint)+N';';
 EXEC sys.sp_executesql @sql;
 ALTER TABLE platform.provision_step_intents WITH CHECK ADD CONSTRAINT CK_provision_step_name_v2
  CHECK(step_name IN('os_identity','tenant_directories','tenant_key','sql_database','sql_login','schema_bootstrap','runtime_unit','channel_review_probe'));
 SET @proc=REPLACE(@proc,@old,@new);
 SET @proc=N'ALTER'+SUBSTRING(@proc,7,LEN(@proc));
 EXEC sys.sp_executesql @proc;
 INSERT platform.schema_migrations(migration_id) VALUES('013_channel_review_probe_v1');
 COMMIT;SELECT N'CHANNEL_REVIEW_PROBE_APPLIED';
END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
