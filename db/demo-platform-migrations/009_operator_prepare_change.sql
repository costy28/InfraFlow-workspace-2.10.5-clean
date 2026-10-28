-- Administrative CAS only. No scope is granted by applying this migration.
SET NOCOUNT ON;SET XACT_ABORT ON;SET ANSI_NULLS ON;SET QUOTED_IDENTIFIER ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM'
 THROW 52701,'platform_database_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='008_operator_prepare_audit_v1')
 THROW 52702,'prepare_audit_required',1;
BEGIN TRY
 BEGIN TRANSACTION;
 DECLARE @locked int;
 EXEC @locked=sys.sp_getapplock @Resource=N'infraflow-platform-migrations',@LockMode=N'Exclusive',@LockOwner=N'Transaction',@LockTimeout=5000;
 IF @locked<0 THROW 52703,'platform_migration_busy',1;
 IF EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='009_operator_prepare_change_v1')
 BEGIN COMMIT;SELECT N'OPERATOR_PREPARE_CHANGE_ALREADY_APPLIED';RETURN;END;
 IF OBJECT_ID(N'operator_security.scope_changes') IS NOT NULL OR OBJECT_ID(N'operator_security.grant_prepare_scope') IS NOT NULL
  THROW 52704,'scope_change_partial_state_requires_review',1;
 CREATE TABLE operator_security.scope_changes(
  change_id uniqueidentifier NOT NULL PRIMARY KEY,
  operator_id uniqueidentifier NOT NULL REFERENCES operator_security.accounts(operator_id),
  old_revision int NOT NULL,new_revision int NOT NULL,
  request_digest binary(32) NOT NULL,
  action varchar(64) NOT NULL CHECK(action='trial.prepare.granted'),
  sql_actor nvarchar(128) NOT NULL,occurred_at datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  UNIQUE(operator_id,new_revision),CHECK(new_revision=old_revision+1)
 );
 EXEC(N'CREATE PROCEDURE operator_security.grant_prepare_scope @json nvarchar(max) AS
 BEGIN
 SET NOCOUNT ON;SET XACT_ABORT ON;
 -- Not a runtime API: even an accidental EXECUTE grant is insufficient.
 IF COALESCE(IS_SRVROLEMEMBER(''sysadmin''),0)<>1 THROW 52711,''administrative_identity_required'',1;
 IF @json IS NULL OR ISJSON(@json)<>1 OR LEFT(LTRIM(@json),1)<>N''{'' OR DATALENGTH(@json)>12000
  THROW 52710,''invalid_prepare_change'',1;
 DECLARE @keys TABLE(k nvarchar(32) COLLATE Latin1_General_100_BIN2 PRIMARY KEY,t int);
 INSERT @keys VALUES(N''operatorId'',1),(N''expectedRevision'',2),(N''expectedEnvelope'',1),(N''expectedScopesJson'',1),
 (N''revision'',2),(N''envelope'',1),(N''scopesJson'',1),(N''changeId'',1);
 IF (SELECT COUNT(*) FROM OPENJSON(@json))<>8
 OR EXISTS(SELECT 1 FROM OPENJSON(@json) j LEFT JOIN @keys k ON j.[key] COLLATE Latin1_General_100_BIN2=k.k WHERE k.k IS NULL OR j.[type]<>k.t)
 OR EXISTS(SELECT [key] COLLATE Latin1_General_100_BIN2 FROM OPENJSON(@json) GROUP BY [key] COLLATE Latin1_General_100_BIN2 HAVING COUNT(*)<>1)
  THROW 52710,''invalid_prepare_change'',1;
 DECLARE @id uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@json,''$.operatorId'')),
  @change uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@json,''$.changeId'')),
  @old int=TRY_CONVERT(int,JSON_VALUE(@json,''$.expectedRevision'')),@new int=TRY_CONVERT(int,JSON_VALUE(@json,''$.revision'')),
  @oldEnvelope nvarchar(4000)=JSON_VALUE(@json,''$.expectedEnvelope''),@newEnvelope nvarchar(4000)=JSON_VALUE(@json,''$.envelope''),
  @oldScopes nvarchar(4000)=JSON_VALUE(@json,''$.expectedScopesJson''),@newScopes nvarchar(4000)=JSON_VALUE(@json,''$.scopesJson'');
 IF @id IS NULL OR @change IS NULL OR DATALENGTH(JSON_VALUE(@json,''$.operatorId''))<>72 OR DATALENGTH(JSON_VALUE(@json,''$.changeId''))<>72
  OR @old IS NULL OR @old<0 OR @old>=2147483647 OR @new IS NULL OR CONVERT(bigint,@new)<>CONVERT(bigint,@old)+1
  OR @oldEnvelope IS NULL OR @newEnvelope IS NULL OR DATALENGTH(@oldEnvelope)<>174 OR DATALENGTH(@newEnvelope)<>174
  OR LEFT(@oldEnvelope,7) COLLATE Latin1_General_100_BIN2<>N''gcm-v1:'' OR LEFT(@newEnvelope,7) COLLATE Latin1_General_100_BIN2<>N''gcm-v1:''
  OR SUBSTRING(@oldEnvelope,8,80) COLLATE Latin1_General_100_BIN2 LIKE N''%[^A-Za-z0-9+/]%''
  OR SUBSTRING(@newEnvelope,8,80) COLLATE Latin1_General_100_BIN2 LIKE N''%[^A-Za-z0-9+/]%''
  OR @oldEnvelope COLLATE Latin1_General_100_BIN2=@newEnvelope COLLATE Latin1_General_100_BIN2
  OR @oldScopes IS NULL OR @newScopes IS NULL OR DATALENGTH(@oldScopes)>2048 OR DATALENGTH(@newScopes)>2048
  OR ISJSON(@oldScopes)<>1 OR ISJSON(@newScopes)<>1 OR LEFT(LTRIM(@oldScopes),1)<>N''['' OR LEFT(LTRIM(@newScopes),1)<>N''[''
  THROW 52710,''invalid_prepare_change'',1;
 IF EXISTS(SELECT 1 FROM OPENJSON(@oldScopes) WHERE [type]<>1 OR [value] COLLATE Latin1_General_100_BIN2 NOT IN(N''trial:read'',N''trial:queue'',N''trial:activate'',N''session:own''))
  OR EXISTS(SELECT 1 FROM OPENJSON(@newScopes) WHERE [type]<>1 OR [value] COLLATE Latin1_General_100_BIN2 NOT IN(N''trial:read'',N''trial:queue'',N''trial:activate'',N''session:own'',N''trial:prepare''))
  OR EXISTS(SELECT [value] COLLATE Latin1_General_100_BIN2 FROM OPENJSON(@oldScopes) GROUP BY [value] COLLATE Latin1_General_100_BIN2 HAVING COUNT(*)>1)
  OR EXISTS(SELECT [value] COLLATE Latin1_General_100_BIN2 FROM OPENJSON(@newScopes) GROUP BY [value] COLLATE Latin1_General_100_BIN2 HAVING COUNT(*)>1)
  OR NOT EXISTS(SELECT 1 FROM OPENJSON(@oldScopes) WHERE [value] COLLATE Latin1_General_100_BIN2=N''trial:read'')
  OR NOT EXISTS(SELECT 1 FROM OPENJSON(@newScopes) WHERE [value] COLLATE Latin1_General_100_BIN2=N''trial:prepare'')
  OR (SELECT COUNT(*) FROM OPENJSON(@newScopes))<>(SELECT COUNT(*)+1 FROM OPENJSON(@oldScopes))
  OR EXISTS(SELECT [value] COLLATE Latin1_General_100_BIN2 FROM OPENJSON(@oldScopes) EXCEPT SELECT [value] COLLATE Latin1_General_100_BIN2 FROM OPENJSON(@newScopes))
  THROW 52710,''invalid_prepare_change'',1;
 DECLARE @canonical nvarchar(max)=(SELECT @id operatorId,@change changeId,@old expectedRevision,@new revision,
  @oldEnvelope expectedEnvelope,@newEnvelope envelope,@oldScopes expectedScopesJson,@newScopes scopesJson FOR JSON PATH,WITHOUT_ARRAY_WRAPPER),
  @digest binary(32),@current int,@enabled bit,@envelope varchar(256),@scopes nvarchar(1024),@saved binary(32);
 SET @digest=HASHBYTES(''SHA2_256'',CONVERT(varbinary(max),@canonical));
 BEGIN TRY
 BEGIN TRANSACTION;
 SELECT @current=revision,@enabled=enabled,@envelope=totp_envelope,@scopes=scopes_json
 FROM operator_security.accounts WITH(UPDLOCK,HOLDLOCK) WHERE operator_id=@id;
 SELECT @saved=request_digest FROM operator_security.scope_changes WITH(UPDLOCK,HOLDLOCK) WHERE change_id=@change;
 IF @saved IS NOT NULL
 BEGIN
  IF @saved<>@digest OR @enabled<>1 OR @current<>@new OR @envelope COLLATE Latin1_General_100_BIN2<>@newEnvelope COLLATE Latin1_General_100_BIN2
   OR @scopes COLLATE Latin1_General_100_BIN2<>@newScopes COLLATE Latin1_General_100_BIN2 THROW 52712,''prepare_change_conflict'',1;
  COMMIT;SELECT N''OPERATOR_PREPARE_SCOPE_APPLIED'';RETURN;
 END;
 IF @enabled IS NULL OR @enabled<>1 OR @current<>@old
  OR @envelope COLLATE Latin1_General_100_BIN2<>@oldEnvelope COLLATE Latin1_General_100_BIN2
  OR @scopes COLLATE Latin1_General_100_BIN2<>@oldScopes COLLATE Latin1_General_100_BIN2
  OR DATALENGTH(@scopes)<>DATALENGTH(@oldScopes)
  THROW 52712,''prepare_change_conflict'',1;
 UPDATE operator_security.accounts SET revision=@new,totp_envelope=CONVERT(varchar(256),@newEnvelope),scopes_json=@newScopes WHERE operator_id=@id;
 INSERT operator_security.scope_changes(change_id,operator_id,old_revision,new_revision,request_digest,action,sql_actor)
 VALUES(@change,@id,@old,@new,@digest,''trial.prepare.granted'',ORIGINAL_LOGIN());
 COMMIT;SELECT N''OPERATOR_PREPARE_SCOPE_APPLIED'';
 END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
 END;');
 INSERT platform.schema_migrations(migration_id) VALUES('009_operator_prepare_change_v1');
 COMMIT;SELECT N'OPERATOR_PREPARE_CHANGE_APPLIED';
END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
