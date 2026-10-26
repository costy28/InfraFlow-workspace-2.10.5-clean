-- PLATFORM ONLY. No identities or EXECUTE grants are created here.
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
IF DB_NAME() COLLATE Latin1_General_100_BIN2 <> N'INFRAFLOW_DEMO_PLATFORM'
 THROW 51301,'platform_database_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='001_company_registry_v1')
 THROW 51302,'platform_registry_required',1;
BEGIN TRY
 BEGIN TRANSACTION;
 DECLARE @lockResult int;
 EXEC @lockResult=sys.sp_getapplock @Resource=N'infraflow-platform-migrations',
  @LockMode=N'Exclusive',@LockOwner=N'Transaction',@LockTimeout=5000;
 IF @lockResult<0 THROW 51303,'platform_migration_busy',1;
 IF EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='002_trial_commands_v1')
 BEGIN COMMIT; SELECT N'PLATFORM_COMMANDS_ALREADY_APPLIED'; RETURN; END;
 IF OBJECT_ID(N'platform.queue_trial') IS NOT NULL OR OBJECT_ID(N'platform.activate_trial') IS NOT NULL
  THROW 51304,'platform_partial_commands_requires_review',1;
 EXEC(N'CREATE PROCEDURE platform.queue_trial
 @approval_id nvarchar(max),@company_name nvarchar(max),@command_id nvarchar(max)
 AS
 BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON; SET ARITHABORT ON;
 IF @approval_id IS NULL OR DATALENGTH(@approval_id) NOT BETWEEN 2 AND 256
  OR REPLACE(@approval_id,N''-'',N'''') COLLATE Latin1_General_100_BIN2 LIKE N''%[^a-zA-Z0-9_.:]%''
  OR @command_id IS NULL OR DATALENGTH(@command_id) NOT BETWEEN 2 AND 256
  OR REPLACE(@command_id,N''-'',N'''') COLLATE Latin1_General_100_BIN2 LIKE N''%[^a-zA-Z0-9_.:]%''
  OR @company_name IS NULL OR DATALENGTH(@company_name) NOT BETWEEN 2 AND 400
  OR LEN(LTRIM(RTRIM(@company_name)))=0
  THROW 51310,''invalid_trial_request'',1;
 DECLARE @actor varchar(128)=CONVERT(varchar(128),ORIGINAL_LOGIN()),
  @id uniqueidentifier,@digest binary(32),@receipt nvarchar(max),@lock int,
  @resource nvarchar(255)=N''platform-approval:''+@approval_id;
 SET @company_name=LTRIM(RTRIM(@company_name));
 SET @digest=HASHBYTES(''SHA2_256'',CONVERT(varbinary(max),
  (SELECT @approval_id approvalId,@company_name companyName,@command_id commandId,
   @actor actor,N''queue'' action FOR JSON PATH,WITHOUT_ARRAY_WRAPPER)));
 BEGIN TRY
 BEGIN TRANSACTION;
 EXEC @lock=sys.sp_getapplock @Resource=@resource,@LockMode=N''Exclusive'',@LockOwner=N''Transaction'',@LockTimeout=5000;
 IF @lock<0 THROW 51311,''trial_command_busy'',1;
 SELECT @id=trial_id FROM platform.trials WITH(UPDLOCK,HOLDLOCK) WHERE approval_id=CONVERT(varchar(128),@approval_id);
 IF @id IS NOT NULL
 BEGIN
  SELECT @receipt=result_json FROM platform.trial_commands
   WHERE trial_id=@id AND command_id=CONVERT(varchar(128),@command_id) AND request_digest=@digest;
  IF @receipt IS NULL THROW 51312,''approval_already_bound_or_command_changed'',1;
  COMMIT; SELECT @receipt; RETURN;
 END;
 SET @id=NEWID();
 INSERT platform.trials(trial_id,approval_id,company_name,state)
 VALUES(@id,CONVERT(varchar(128),@approval_id),CONVERT(nvarchar(200),@company_name),''queued'');
 SET @receipt=(SELECT LOWER(CONVERT(char(36),trial_id)) id,state,revision,created_at createdAt
  FROM platform.trials WHERE trial_id=@id FOR JSON PATH,WITHOUT_ARRAY_WRAPPER);
 INSERT platform.trial_commands(trial_id,command_id,request_digest,result_revision,result_json)
 VALUES(@id,CONVERT(varchar(128),@command_id),@digest,0,@receipt);
 INSERT platform.trial_events(trial_id,revision,action,actor_ref) VALUES(@id,0,''queue'',@actor);
 COMMIT; SELECT @receipt;
 END TRY
 BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
 END CATCH;
 END;');
 EXEC(N'CREATE PROCEDURE platform.activate_trial
 @trial_id uniqueidentifier,@command_id nvarchar(max),@expected_revision int
 AS
 BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON; SET ARITHABORT ON;
 IF @trial_id IS NULL OR @expected_revision IS NULL OR @expected_revision<0 OR @expected_revision>=2147483647
  OR @command_id IS NULL OR DATALENGTH(@command_id) NOT BETWEEN 2 AND 256
  OR REPLACE(@command_id,N''-'',N'''') COLLATE Latin1_General_100_BIN2 LIKE N''%[^a-zA-Z0-9_.:]%''
  THROW 51310,''invalid_trial_request'',1;
 DECLARE @actor varchar(128)=CONVERT(varchar(128),ORIGINAL_LOGIN()),@digest binary(32),
  @receipt nvarchar(max),@oldDigest binary(32),@state varchar(32),@revision int,@now datetime2(3);
 SET @digest=HASHBYTES(''SHA2_256'',CONVERT(varbinary(max),
  (SELECT LOWER(CONVERT(char(36),@trial_id)) trialId,@command_id commandId,
   @expected_revision expectedRevision,@actor actor,N''activate'' action FOR JSON PATH,WITHOUT_ARRAY_WRAPPER)));
 BEGIN TRY
 BEGIN TRANSACTION;
 SELECT @state=state,@revision=revision FROM platform.trials WITH(UPDLOCK,HOLDLOCK) WHERE trial_id=@trial_id;
 IF @state IS NULL THROW 51313,''trial_not_found'',1;
 SELECT @oldDigest=request_digest,@receipt=result_json FROM platform.trial_commands
  WHERE trial_id=@trial_id AND command_id=CONVERT(varchar(128),@command_id);
 IF @oldDigest IS NOT NULL
 BEGIN
  IF @oldDigest<>@digest THROW 51314,''command_id_reused'',1;
  COMMIT; SELECT @receipt; RETURN;
 END;
 IF @revision<>@expected_revision THROW 51315,''trial_revision_conflict'',1;
 IF @state<>''awaiting_activation'' THROW 51316,''trial_not_activatable'',1;
 SET @now=SYSUTCDATETIME();
 UPDATE platform.trials SET state=''active'',revision=revision+1,activated_at=@now,expires_at=DATEADD(day,15,@now)
  WHERE trial_id=@trial_id;
 SET @receipt=(SELECT LOWER(CONVERT(char(36),trial_id)) id,state,revision,activated_at activatedAt,expires_at expiresAt
  FROM platform.trials WHERE trial_id=@trial_id FOR JSON PATH,WITHOUT_ARRAY_WRAPPER);
 INSERT platform.trial_commands(trial_id,command_id,request_digest,result_revision,result_json)
 VALUES(@trial_id,CONVERT(varchar(128),@command_id),@digest,@revision+1,@receipt);
 INSERT platform.trial_events(trial_id,revision,action,actor_ref) VALUES(@trial_id,@revision+1,''activate'',@actor);
 COMMIT; SELECT @receipt;
 END TRY
 BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
 END CATCH;
 END;');
 INSERT platform.schema_migrations(migration_id) VALUES('002_trial_commands_v1');
 COMMIT;
 SELECT N'PLATFORM_COMMANDS_APPLIED';
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
