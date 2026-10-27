-- Add prepare authorization audit only; never grant scope, change revision or TOTP.
SET NOCOUNT ON;SET XACT_ABORT ON;SET ANSI_NULLS ON;SET QUOTED_IDENTIFIER ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM'
 THROW 52601,'platform_database_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='007_provision_leases_v1')
 OR OBJECT_ID(N'operator_security.append_audit',N'P') IS NULL
 THROW 52602,'lease_and_operator_procedures_required',1;
BEGIN TRY
 BEGIN TRANSACTION;
 DECLARE @locked int;
 EXEC @locked=sys.sp_getapplock @Resource=N'infraflow-platform-migrations',@LockMode=N'Exclusive',@LockOwner=N'Transaction',@LockTimeout=5000;
 IF @locked<0 THROW 52603,'platform_migration_busy',1;
 IF EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='008_operator_prepare_audit_v1')
 BEGIN COMMIT;SELECT N'OPERATOR_PREPARE_AUDIT_ALREADY_APPLIED';RETURN;END;
 -- 003 created an unnamed column CHECK; resolve exactly that column, fail on drift.
 DECLARE @constraint sysname,@count int;
 SELECT @count=COUNT(*),@constraint=MAX(name) FROM sys.check_constraints
 WHERE parent_object_id=OBJECT_ID(N'operator_security.audit')
 AND parent_column_id=COLUMNPROPERTY(OBJECT_ID(N'operator_security.audit'),N'action','ColumnId')
 AND definition LIKE N'%operator_login%' AND definition LIKE N'%trial.queue%'
 AND definition NOT LIKE N'%trial.prepare%';
 IF @count<>1 OR OBJECT_ID(N'operator_security.CK_operator_audit_action_v2') IS NOT NULL
  THROW 52604,'operator_audit_constraint_requires_review',1;
 DECLARE @drop nvarchar(max)=N'ALTER TABLE operator_security.audit DROP CONSTRAINT '+QUOTENAME(@constraint);
 EXEC sys.sp_executesql @drop;
 ALTER TABLE operator_security.audit WITH CHECK ADD CONSTRAINT CK_operator_audit_action_v2
 CHECK(action IN('operator_login','operator_attempt_reserved','operator_attempt_limited','operator_totp_claimed',
 'trial.read','trial.queue','trial.prepare','trial.activate','session.logout'));
 EXEC(N'ALTER PROCEDURE operator_security.append_audit @json nvarchar(max) AS
 BEGIN
 SET NOCOUNT ON;SET XACT_ABORT ON;
 IF @json IS NULL OR ISJSON(@json)<>1 OR LEFT(LTRIM(@json),1)<>N''{'' OR DATALENGTH(@json)>2048
  THROW 51810,''invalid_operator_command'',1;
 IF (SELECT COUNT(*) FROM OPENJSON(@json))<>2
 OR EXISTS(SELECT 1 FROM OPENJSON(@json) WHERE [key] COLLATE Latin1_General_100_BIN2 NOT IN(N''id'',N''action'') OR [type]<>1)
 OR EXISTS(SELECT [key] COLLATE Latin1_General_100_BIN2 FROM OPENJSON(@json) GROUP BY [key] COLLATE Latin1_General_100_BIN2 HAVING COUNT(*)<>1)
  THROW 51810,''invalid_operator_command'',1;
 DECLARE @id uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@json,''$.id'')),@action nvarchar(4000)=JSON_VALUE(@json,''$.action'');
 IF @id IS NULL OR DATALENGTH(JSON_VALUE(@json,''$.id''))<>72 OR @action IS NULL OR DATALENGTH(@action)>128
 OR @action COLLATE Latin1_General_100_BIN2 NOT IN(N''operator_login'',N''trial.read'',N''trial.queue'',N''trial.prepare'',N''trial.activate'',N''session.logout'')
  THROW 51810,''invalid_operator_command'',1;
 INSERT operator_security.audit(operator_id,action) VALUES(@id,CONVERT(varchar(64),@action));SELECT 1;
 END;');
 INSERT platform.schema_migrations(migration_id) VALUES('008_operator_prepare_audit_v1');
 COMMIT;SELECT N'OPERATOR_PREPARE_AUDIT_APPLIED';
END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
