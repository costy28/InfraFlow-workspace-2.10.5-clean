-- PLATFORM ONLY. No login, role membership or EXECUTE grant in this migration.
SET NOCOUNT ON;SET XACT_ABORT ON;SET ANSI_NULLS ON;SET QUOTED_IDENTIFIER ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2 <> N'INFRAFLOW_DEMO_PLATFORM'
 THROW 51801,'platform_database_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='003_operator_security_v1')
 THROW 51802,'operator_security_required',1;
BEGIN TRY
 BEGIN TRANSACTION;
 DECLARE @locked int;
 EXEC @locked=sys.sp_getapplock @Resource=N'infraflow-platform-migrations',@LockMode=N'Exclusive',@LockOwner=N'Transaction',@LockTimeout=5000;
 IF @locked<0 THROW 51803,'platform_migration_busy',1;
 IF EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='004_operator_procedures_v1')
 BEGIN COMMIT;SELECT N'OPERATOR_PROCEDURES_ALREADY_APPLIED';RETURN;END;
 IF OBJECT_ID(N'operator_security.read_account') IS NOT NULL OR OBJECT_ID(N'operator_security.reserve_attempt') IS NOT NULL
  OR OBJECT_ID(N'operator_security.claim_totp') IS NOT NULL OR OBJECT_ID(N'operator_security.append_audit') IS NOT NULL
  THROW 51804,'operator_procedures_require_review',1;
 EXEC(N'CREATE PROCEDURE operator_security.read_account @json nvarchar(max) AS
 BEGIN
 SET NOCOUNT ON;
 IF ISJSON(@json)<>1 OR LEFT(LTRIM(@json),1)<>N''{'' THROW 51810,''invalid_auth_request'',1;
 IF (SELECT COUNT(*) FROM OPENJSON(@json))<>1 OR EXISTS(SELECT 1 FROM OPENJSON(@json) WHERE [key]<>N''id'' OR [type]<>1)
  THROW 51810,''invalid_auth_request'',1;
 DECLARE @id uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@json,''$.id''));
 IF @id IS NULL OR DATALENGTH(JSON_VALUE(@json,''$.id''))<>72 THROW 51810,''invalid_auth_request'',1;
 SELECT LOWER(CONVERT(char(36),operator_id)) id,username,revision,enabled,password_hash passwordHash,
  totp_envelope envelope,JSON_QUERY(scopes_json) scopes FROM operator_security.accounts WHERE operator_id=@id
  FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;
 END;');
 EXEC(N'CREATE PROCEDURE operator_security.reserve_attempt @json nvarchar(max) AS
 BEGIN
 SET NOCOUNT ON;SET XACT_ABORT ON;
 IF ISJSON(@json)<>1 OR LEFT(LTRIM(@json),1)<>N''{'' THROW 51810,''invalid_auth_request'',1;
 IF (SELECT COUNT(*) FROM OPENJSON(@json))<>1 OR EXISTS(SELECT 1 FROM OPENJSON(@json) WHERE [key]<>N''id'' OR [type]<>1)
  THROW 51810,''invalid_auth_request'',1;
 DECLARE @id uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@json,''$.id'')),@enabled bit,@count int,
  @start datetime2(3),@now datetime2(3)=SYSUTCDATETIME();
 IF @id IS NULL OR DATALENGTH(JSON_VALUE(@json,''$.id''))<>72 THROW 51810,''invalid_auth_request'',1;
 BEGIN TRY BEGIN TRANSACTION;
 SELECT @enabled=enabled,@count=attempt_count,@start=window_started_at
  FROM operator_security.accounts WITH(UPDLOCK,HOLDLOCK) WHERE operator_id=@id;
 IF @enabled IS NULL OR @enabled=0 BEGIN ROLLBACK;SELECT 0;RETURN;END;
 IF @start IS NOT NULL AND @now<@start BEGIN ROLLBACK;SELECT 0;RETURN;END;
 IF @start IS NULL OR @now>=DATEADD(minute,15,@start) BEGIN SET @count=0;SET @start=@now;END;
 IF @count>=5 BEGIN
  INSERT operator_security.audit(operator_id,action) VALUES(@id,''operator_attempt_limited'');
  COMMIT;SELECT 0;RETURN;
 END;
 UPDATE operator_security.accounts SET attempt_count=@count+1,window_started_at=@start WHERE operator_id=@id;
 INSERT operator_security.audit(operator_id,action) VALUES(@id,''operator_attempt_reserved'');
 COMMIT;SELECT 1;
 END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
 END;');
 EXEC(N'CREATE PROCEDURE operator_security.claim_totp @json nvarchar(max) AS
 BEGIN
 SET NOCOUNT ON;SET XACT_ABORT ON;
 IF ISJSON(@json)<>1 OR LEFT(LTRIM(@json),1)<>N''{'' THROW 51810,''invalid_auth_request'',1;
 IF (SELECT COUNT(*) FROM OPENJSON(@json))<>3 OR EXISTS(SELECT 1 FROM OPENJSON(@json)
  WHERE [key] NOT IN (N''id'',N''counter'',N''revision'') OR ([key]=N''id'' AND [type]<>1) OR ([key]<>N''id'' AND [type]<>2))
  THROW 51810,''invalid_auth_request'',1;
 DECLARE @id uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@json,''$.id'')),
  @counter bigint=TRY_CONVERT(bigint,JSON_VALUE(@json,''$.counter'')),@revision int=TRY_CONVERT(int,JSON_VALUE(@json,''$.revision'')),
  @nowCounter bigint=DATEDIFF_BIG(second,CONVERT(datetime2,''1970-01-01''),SYSUTCDATETIME())/30;
 IF @id IS NULL OR DATALENGTH(JSON_VALUE(@json,''$.id''))<>72 OR @counter IS NULL OR @counter<0 OR @revision IS NULL OR @revision<0
  THROW 51810,''invalid_auth_request'',1;
 BEGIN TRY BEGIN TRANSACTION;
 IF @counter NOT BETWEEN @nowCounter-1 AND @nowCounter BEGIN ROLLBACK;SELECT 0;RETURN;END;
 UPDATE operator_security.accounts WITH(UPDLOCK) SET last_totp_counter=@counter
  WHERE operator_id=@id AND enabled=1 AND revision=@revision AND last_totp_counter<@counter;
 IF @@ROWCOUNT=0 BEGIN ROLLBACK;SELECT 0;RETURN;END;
 INSERT operator_security.audit(operator_id,action) VALUES(@id,''operator_totp_claimed'');
 COMMIT;SELECT 1;
 END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
 END;');
 EXEC(N'CREATE PROCEDURE operator_security.append_audit @json nvarchar(max) AS
 BEGIN
 SET NOCOUNT ON;
 IF ISJSON(@json)<>1 OR LEFT(LTRIM(@json),1)<>N''{'' THROW 51810,''invalid_auth_request'',1;
 IF (SELECT COUNT(*) FROM OPENJSON(@json))<>2 OR EXISTS(SELECT 1 FROM OPENJSON(@json) WHERE [key] NOT IN (N''id'',N''action'') OR [type]<>1)
  THROW 51810,''invalid_auth_request'',1;
 DECLARE @id uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@json,''$.id'')),@action nvarchar(4000)=JSON_VALUE(@json,''$.action'');
 IF @id IS NULL OR DATALENGTH(JSON_VALUE(@json,''$.id''))<>72 OR @action IS NULL OR DATALENGTH(@action)>128
  OR @action COLLATE Latin1_General_100_BIN2 NOT IN (N''operator_login'',N''trial.read'',N''trial.queue'',N''trial.activate'',N''session.logout'')
  THROW 51810,''invalid_auth_request'',1;
 INSERT operator_security.audit(operator_id,action) VALUES(@id,CONVERT(varchar(64),@action));SELECT 1;
 END;');
 INSERT platform.schema_migrations(migration_id) VALUES('004_operator_procedures_v1');
 COMMIT;SELECT N'OPERATOR_PROCEDURES_APPLIED';
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
