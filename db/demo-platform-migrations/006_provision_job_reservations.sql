-- PLATFORM ONLY. Durable request/reservations, no resource creation, lease execution or grants.
SET NOCOUNT ON;SET XACT_ABORT ON;SET ANSI_NULLS ON;SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;SET ANSI_WARNINGS ON;SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;SET NUMERIC_ROUNDABORT OFF;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM'
 THROW 52201,'platform_database_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='005_operator_queue_audit_v1')
 THROW 52202,'operator_queue_audit_required',1;
BEGIN TRY
 BEGIN TRANSACTION;
 DECLARE @locked int;
 EXEC @locked=sys.sp_getapplock @Resource=N'infraflow-platform-migrations',@LockMode=N'Exclusive',@LockOwner=N'Transaction',@LockTimeout=5000;
 IF @locked<0 THROW 52203,'platform_migration_busy',1;
 IF EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='006_provision_reservations_v1')
 BEGIN COMMIT;SELECT N'PROVISION_RESERVATIONS_ALREADY_APPLIED';RETURN;END;
 IF OBJECT_ID(N'platform.provision_jobs') IS NOT NULL OR OBJECT_ID(N'platform.resource_reservations') IS NOT NULL
  OR OBJECT_ID(N'platform.provision_request_audit') IS NOT NULL OR OBJECT_ID(N'platform.request_provision_job') IS NOT NULL
  THROW 52204,'provision_partial_state_requires_review',1;
 CREATE TABLE platform.provision_jobs(
  job_id uniqueidentifier NOT NULL PRIMARY KEY,
  trial_id uniqueidentifier NOT NULL UNIQUE REFERENCES platform.trials(trial_id),
  trial_revision int NOT NULL CHECK(trial_revision>=1),
  job_revision int NOT NULL DEFAULT 0 CHECK(job_revision>=0),
  state varchar(16) NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','leased','completed','failed')),
  generation int NOT NULL DEFAULT 0 CHECK(generation>=0),
  lease_owner varchar(128) NULL,lease_hash binary(32) NULL,lease_expires_at datetime2(3) NULL,
  execution_ready bit NOT NULL DEFAULT 0 CONSTRAINT CK_provision_execution_closed CHECK(execution_ready=0),
  resource_manifest nvarchar(max) NOT NULL CHECK(ISJSON(resource_manifest)=1),
  created_at datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  UNIQUE(job_id,trial_id),
  CONSTRAINT CK_provision_lease_context CHECK(
   (state='leased' AND generation>0 AND lease_owner IS NOT NULL AND lease_hash IS NOT NULL AND lease_expires_at IS NOT NULL)
   OR (state<>'leased' AND lease_owner IS NULL AND lease_hash IS NULL AND lease_expires_at IS NULL))
 );
 CREATE TABLE platform.resource_reservations(
  resource_type varchar(32) COLLATE Latin1_General_100_BIN2 NOT NULL
   CHECK(resource_type IN ('database','sql_login','os_identity','storage_root','config_root','systemd_unit','key_ref')),
  resource_key varchar(256) COLLATE Latin1_General_100_BIN2 NOT NULL,
  job_id uniqueidentifier NOT NULL,trial_id uniqueidentifier NOT NULL,
  created_at datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  PRIMARY KEY(resource_type,resource_key),UNIQUE(trial_id,resource_type),
  FOREIGN KEY(job_id,trial_id) REFERENCES platform.provision_jobs(job_id,trial_id)
 );
 CREATE TABLE platform.provision_request_audit(
  job_id uniqueidentifier NOT NULL,trial_id uniqueidentifier NOT NULL,
  command_id varchar(128) COLLATE Latin1_General_100_BIN2 NOT NULL,
  operator_id uniqueidentifier NOT NULL REFERENCES operator_security.accounts(operator_id),
  operator_revision int NOT NULL CHECK(operator_revision>=0),
  request_digest binary(32) NOT NULL,sql_actor varchar(128) NOT NULL,
  occurred_at datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  PRIMARY KEY(trial_id,command_id),UNIQUE(operator_id,command_id),
  FOREIGN KEY(job_id,trial_id) REFERENCES platform.provision_jobs(job_id,trial_id),
  FOREIGN KEY(trial_id,command_id) REFERENCES platform.trial_commands(trial_id,command_id)
 );
 EXEC(N'CREATE PROCEDURE platform.request_provision_job @json nvarchar(max) AS
 BEGIN
 SET NOCOUNT ON;SET XACT_ABORT ON;SET ARITHABORT ON;
 IF ISJSON(@json)<>1 OR LEFT(LTRIM(@json),1)<>N''{'' OR DATALENGTH(@json)>4096
  THROW 52210,''invalid_provision_request'',1;
 IF (SELECT COUNT(*) FROM OPENJSON(@json))<>5 OR EXISTS(SELECT 1 FROM OPENJSON(@json)
  WHERE [key] NOT IN (N''trialId'',N''expectedRevision'',N''operatorId'',N''operatorRevision'',N''commandId'')
   OR ([key] IN(N''expectedRevision'',N''operatorRevision'') AND [type]<>2)
   OR ([key] NOT IN(N''expectedRevision'',N''operatorRevision'') AND [type]<>1))
  THROW 52210,''invalid_provision_request'',1;
 DECLARE @trial uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@json,''$.trialId'')),
  @operator uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@json,''$.operatorId'')),
  @expected int=TRY_CONVERT(int,JSON_VALUE(@json,''$.expectedRevision'')),
  @opRev int=TRY_CONVERT(int,JSON_VALUE(@json,''$.operatorRevision'')),
  @command nvarchar(max)=JSON_VALUE(@json,''$.commandId'');
 IF @trial IS NULL OR DATALENGTH(JSON_VALUE(@json,''$.trialId''))<>72
  OR @operator IS NULL OR DATALENGTH(JSON_VALUE(@json,''$.operatorId''))<>72
  OR @expected IS NULL OR @expected<0 OR @expected>=2147483647 OR @opRev IS NULL OR @opRev<0
  OR @command IS NULL OR DATALENGTH(@command) NOT BETWEEN 2 AND 256
  OR REPLACE(@command,N''-'',N'''') COLLATE Latin1_General_100_BIN2 LIKE N''%[^a-zA-Z0-9_.:]%''
  THROW 52210,''invalid_provision_request'',1;
 DECLARE @enabled bit,@currentOp int,@scopes nvarchar(1024),@state varchar(32),@rev int,
  @activated datetime2(3),@expires datetime2(3),@job uniqueidentifier,@digest binary(32),@receipt nvarchar(max),@lock int,
  @id char(36)=LOWER(CONVERT(char(36),@trial)),@compact char(32)=LOWER(REPLACE(CONVERT(char(36),@trial),''-'','''')),
  @manifest nvarchar(max),@sqlActor varchar(128)=CONVERT(varchar(128),ORIGINAL_LOGIN());
 SET @digest=HASHBYTES(''SHA2_256'',CONVERT(varbinary(max),
  (SELECT @id trialId,@expected expectedRevision,LOWER(CONVERT(char(36),@operator)) operatorId,
   @opRev operatorRevision,@command commandId,N''trial.prepare'' action FOR JSON PATH,WITHOUT_ARRAY_WRAPPER)));
 BEGIN TRY BEGIN TRANSACTION;
 SELECT @enabled=enabled,@currentOp=revision,@scopes=scopes_json FROM operator_security.accounts WITH(UPDLOCK,HOLDLOCK)
  WHERE operator_id=@operator;
 IF @enabled IS NULL OR @enabled<>1 OR @currentOp<>@opRev
  OR NOT EXISTS(SELECT 1 FROM OPENJSON(@scopes) WHERE [type]=1 AND [value] COLLATE Latin1_General_100_BIN2=N''trial:prepare'')
  THROW 52211,''operator_prepare_denied'',1;
 SELECT @state=state,@rev=revision,@activated=activated_at,@expires=expires_at
  FROM platform.trials WITH(UPDLOCK,HOLDLOCK) WHERE trial_id=@trial;
 IF @state IS NULL THROW 52212,''trial_not_found'',1;
 IF EXISTS(SELECT 1 FROM platform.provision_request_audit WITH(UPDLOCK,HOLDLOCK)
  WHERE operator_id=@operator AND command_id=CONVERT(varchar(128),@command) AND request_digest<>@digest)
  THROW 52213,''provision_command_conflict'',1;
 SELECT @receipt=c.result_json FROM platform.trial_commands c JOIN platform.provision_request_audit a
  ON a.trial_id=c.trial_id AND a.command_id=c.command_id
  WHERE c.trial_id=@trial AND c.command_id=CONVERT(varchar(128),@command) AND c.request_digest=@digest
   AND a.operator_id=@operator AND a.operator_revision=@opRev AND a.request_digest=@digest;
 IF @receipt IS NOT NULL BEGIN COMMIT;SELECT @receipt;RETURN;END;
 IF EXISTS(SELECT 1 FROM platform.trial_commands WHERE trial_id=@trial AND command_id=CONVERT(varchar(128),@command))
  OR EXISTS(SELECT 1 FROM platform.provision_jobs WHERE trial_id=@trial)
  THROW 52213,''provision_command_conflict'',1;
 IF @state<>''queued'' OR @rev<>@expected OR @activated IS NOT NULL OR @expires IS NOT NULL
  THROW 52214,''trial_not_preparable'',1;
 EXEC @lock=sys.sp_getapplock @Resource=N''platform-resource-reservations'',@LockMode=N''Exclusive'',@LockOwner=N''Transaction'',@LockTimeout=5000;
 IF @lock<0 THROW 52215,''resource_reservations_busy'',1;
 DECLARE @resources TABLE(kind varchar(32) COLLATE Latin1_General_100_BIN2,value varchar(256) COLLATE Latin1_General_100_BIN2);
 INSERT @resources VALUES
 (''database'',''INFRAFLOW_DEMO_T_''+UPPER(@compact)),(''sql_login'',''infraflow_t_''+@compact),
 (''os_identity'',''ift_''+LEFT(@compact,28)),(''storage_root'',''/var/lib/infraflow-demo-tenants/''+@id),
 (''config_root'',''/etc/infraflow-demo-tenants/''+@id),(''systemd_unit'',''infraflow-trial-''+@compact+''.service''),
 (''key_ref'',''trial:''+@id);
 IF EXISTS(SELECT 1 FROM @resources r JOIN platform.resource_reservations p WITH(UPDLOCK,HOLDLOCK)
  ON p.resource_type=r.kind AND p.resource_key=r.value)
  THROW 52216,''resource_already_reserved'',1;
 SET @manifest=(SELECT ''infraflow-provision-job-v1'' format,@id trialId,
  ''INFRAFLOW_DEMO_T_''+UPPER(@compact) databaseName,''infraflow_t_''+@compact sqlLogin,
  ''ift_''+LEFT(@compact,28) osIdentity,''/var/lib/infraflow-demo-tenants/''+@id storageRoot,
  ''/etc/infraflow-demo-tenants/''+@id configRoot,''infraflow-trial-''+@compact+''.service'' unitName,
  ''trial:''+@id keyRef,CAST(NULL AS int) runtimePort,CAST(NULL AS varchar(64)) codeRelease
  FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES);
 SET @job=NEWID();
 INSERT platform.provision_jobs(job_id,trial_id,trial_revision,resource_manifest) VALUES(@job,@trial,@rev+1,@manifest);
 INSERT platform.resource_reservations(resource_type,resource_key,job_id,trial_id) SELECT kind,value,@job,@trial FROM @resources;
 UPDATE platform.trials SET revision=revision+1 WHERE trial_id=@trial;
 SET @receipt=(SELECT LOWER(CONVERT(char(36),@job)) jobId,@id trialId,''queued'' jobState,@rev+1 trialRevision,
  CAST(0 AS bit) executionAllowed FOR JSON PATH,WITHOUT_ARRAY_WRAPPER);
 INSERT platform.trial_commands(trial_id,command_id,request_digest,result_revision,result_json)
 VALUES(@trial,CONVERT(varchar(128),@command),@digest,@rev+1,@receipt);
 INSERT platform.trial_events(trial_id,revision,action,actor_ref)
 VALUES(@trial,@rev+1,''provision_requested'',''operator:''+LOWER(CONVERT(char(36),@operator)));
 INSERT platform.provision_request_audit(job_id,trial_id,command_id,operator_id,operator_revision,request_digest,sql_actor)
 VALUES(@job,@trial,CONVERT(varchar(128),@command),@operator,@opRev,@digest,@sqlActor);
 COMMIT;SELECT @receipt;
 END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
 END;');
 INSERT platform.schema_migrations(migration_id) VALUES('006_provision_reservations_v1');
 COMMIT;SELECT N'PROVISION_RESERVATIONS_APPLIED';
END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
