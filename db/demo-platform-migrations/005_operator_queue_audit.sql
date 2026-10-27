-- PLATFORM ONLY. No login/grant changes; legacy queue/activation remain unchanged.
SET NOCOUNT ON;SET XACT_ABORT ON;SET ANSI_NULLS ON;SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;SET ANSI_WARNINGS ON;SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;SET NUMERIC_ROUNDABORT OFF;
IF DB_NAME() COLLATE Latin1_General_100_BIN2 <> N'INFRAFLOW_DEMO_PLATFORM'
 THROW 51901,'platform_database_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='004_operator_procedures_v1')
 THROW 51902,'operator_procedures_required',1;
IF (SELECT principal_id FROM sys.schemas WHERE name=N'platform')<>(SELECT principal_id FROM sys.schemas WHERE name=N'operator_security')
 THROW 51902,'matching_schema_ownership_required',1;
BEGIN TRY
 BEGIN TRANSACTION;
 DECLARE @locked int;
 EXEC @locked=sys.sp_getapplock @Resource=N'infraflow-platform-migrations',@LockMode=N'Exclusive',@LockOwner=N'Transaction',@LockTimeout=5000;
 IF @locked<0 THROW 51903,'platform_migration_busy',1;
 IF EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='005_operator_queue_audit_v1')
 BEGIN COMMIT;SELECT N'OPERATOR_QUEUE_AUDIT_ALREADY_APPLIED';RETURN;END;
 IF OBJECT_ID(N'platform.operator_command_audit') IS NOT NULL OR OBJECT_ID(N'platform.queue_trial_by_operator') IS NOT NULL
  THROW 51904,'operator_command_partial_state_requires_review',1;
 CREATE TABLE platform.operator_command_audit(
  trial_id uniqueidentifier NOT NULL REFERENCES platform.trials(trial_id),
  command_id varchar(128) COLLATE Latin1_General_100_BIN2 NOT NULL,
  operator_id uniqueidentifier NOT NULL REFERENCES operator_security.accounts(operator_id),
  operator_revision int NOT NULL CHECK(operator_revision>=0),
  approval_id varchar(128) COLLATE Latin1_General_100_BIN2 NOT NULL,
  action varchar(32) NOT NULL CHECK(action='trial.queue'),
  sql_actor varchar(128) NOT NULL,
  request_digest binary(32) NOT NULL,
  occurred_at datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  PRIMARY KEY(trial_id,command_id),
  UNIQUE(operator_id,command_id),
  FOREIGN KEY(trial_id,command_id) REFERENCES platform.trial_commands(trial_id,command_id)
 );
 EXEC(N'CREATE PROCEDURE platform.queue_trial_by_operator @json nvarchar(max) AS
 BEGIN
 SET NOCOUNT ON;SET XACT_ABORT ON;SET ARITHABORT ON;
 IF ISJSON(@json)<>1 OR LEFT(LTRIM(@json),1)<>N''{'' OR DATALENGTH(@json)>8192
  THROW 51910,''invalid_operator_command'',1;
 IF (SELECT COUNT(*) FROM OPENJSON(@json))<>5 OR EXISTS(SELECT 1 FROM OPENJSON(@json)
  WHERE [key] NOT IN (N''operatorId'',N''operatorRevision'',N''approvalId'',N''companyName'',N''commandId'')
   OR ([key]=N''operatorRevision'' AND [type]<>2) OR ([key]<>N''operatorRevision'' AND [type]<>1))
  THROW 51910,''invalid_operator_command'',1;
 DECLARE @operator uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@json,''$.operatorId'')),
  @revision int=TRY_CONVERT(int,JSON_VALUE(@json,''$.operatorRevision'')),
  @approval nvarchar(max)=JSON_VALUE(@json,''$.approvalId''),@company nvarchar(max)=JSON_VALUE(@json,''$.companyName''),
  @command nvarchar(max)=JSON_VALUE(@json,''$.commandId'');
 IF @operator IS NULL OR DATALENGTH(JSON_VALUE(@json,''$.operatorId''))<>72 OR @revision IS NULL OR @revision<0
  OR @approval IS NULL OR DATALENGTH(@approval) NOT BETWEEN 2 AND 256
  OR REPLACE(@approval,N''-'',N'''') COLLATE Latin1_General_100_BIN2 LIKE N''%[^a-zA-Z0-9_.:]%''
  OR @command IS NULL OR DATALENGTH(@command) NOT BETWEEN 2 AND 256
  OR REPLACE(@command,N''-'',N'''') COLLATE Latin1_General_100_BIN2 LIKE N''%[^a-zA-Z0-9_.:]%''
  OR @company IS NULL OR DATALENGTH(@company) NOT BETWEEN 2 AND 400 OR LEN(LTRIM(RTRIM(@company)))=0
  THROW 51910,''invalid_operator_command'',1;
 SET @company=LTRIM(RTRIM(@company));
 DECLARE @enabled bit,@current int,@scopes nvarchar(1024),@id uniqueidentifier,@digest binary(32),
  @receipt nvarchar(max),@lock int,@resource nvarchar(255)=N''platform-approval:''+@approval,
  @sqlActor varchar(128)=CONVERT(varchar(128),ORIGINAL_LOGIN());
 SET @digest=HASHBYTES(''SHA2_256'',CONVERT(varbinary(max),
  (SELECT LOWER(CONVERT(char(36),@operator)) operatorId,@revision operatorRevision,
   @approval approvalId,@company companyName,@command commandId,N''trial.queue'' action FOR JSON PATH,WITHOUT_ARRAY_WRAPPER)));
 BEGIN TRY BEGIN TRANSACTION;
 -- Serialize against account revocation/revision updates until commit.
 SELECT @enabled=enabled,@current=revision,@scopes=scopes_json FROM operator_security.accounts WITH(UPDLOCK,HOLDLOCK)
  WHERE operator_id=@operator;
 IF @enabled IS NULL OR @enabled<>1 OR @current<>@revision
  OR NOT EXISTS(SELECT 1 FROM OPENJSON(@scopes) WHERE [type]=1 AND [value] COLLATE Latin1_General_100_BIN2=N''trial:queue'')
  THROW 51911,''operator_command_denied'',1;
 EXEC @lock=sys.sp_getapplock @Resource=@resource,@LockMode=N''Exclusive'',@LockOwner=N''Transaction'',@LockTimeout=5000;
 IF @lock<0 THROW 51912,''operator_command_busy'',1;
 IF EXISTS(SELECT 1 FROM platform.operator_command_audit WITH(UPDLOCK,HOLDLOCK)
  WHERE operator_id=@operator AND command_id=CONVERT(varchar(128),@command)
   AND (request_digest<>@digest OR approval_id<>CONVERT(varchar(128),@approval)))
  THROW 51913,''operator_command_conflict'',1;
 SELECT @id=trial_id FROM platform.trials WITH(UPDLOCK,HOLDLOCK) WHERE approval_id=CONVERT(varchar(128),@approval);
 IF @id IS NOT NULL
 BEGIN
  SELECT @receipt=c.result_json FROM platform.trial_commands c JOIN platform.operator_command_audit a
   ON a.trial_id=c.trial_id AND a.command_id=c.command_id
   WHERE c.trial_id=@id AND c.command_id=CONVERT(varchar(128),@command) AND c.request_digest=@digest
    AND a.operator_id=@operator AND a.operator_revision=@revision AND a.request_digest=@digest;
  IF @receipt IS NULL THROW 51913,''operator_command_conflict'',1;
  COMMIT;SELECT @receipt;RETURN;
 END;
 SET @id=NEWID();
 INSERT platform.trials(trial_id,approval_id,company_name,state)
 VALUES(@id,CONVERT(varchar(128),@approval),CONVERT(nvarchar(200),@company),''queued'');
 SET @receipt=(SELECT LOWER(CONVERT(char(36),trial_id)) id,state,revision,created_at createdAt
  FROM platform.trials WHERE trial_id=@id FOR JSON PATH,WITHOUT_ARRAY_WRAPPER);
 INSERT platform.trial_commands(trial_id,command_id,request_digest,result_revision,result_json)
 VALUES(@id,CONVERT(varchar(128),@command),@digest,0,@receipt);
 INSERT platform.trial_events(trial_id,revision,action,actor_ref)
 VALUES(@id,0,''queue'',''operator:''+LOWER(CONVERT(char(36),@operator)));
 INSERT platform.operator_command_audit(trial_id,command_id,operator_id,operator_revision,approval_id,action,sql_actor,request_digest)
 VALUES(@id,CONVERT(varchar(128),@command),@operator,@revision,CONVERT(varchar(128),@approval),''trial.queue'',@sqlActor,@digest);
 INSERT operator_security.audit(operator_id,action) VALUES(@operator,''trial.queue'');
 COMMIT;SELECT @receipt;
 END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
 END;');
 INSERT platform.schema_migrations(migration_id) VALUES('005_operator_queue_audit_v1');
 COMMIT;SELECT N'OPERATOR_QUEUE_AUDIT_APPLIED';
END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
