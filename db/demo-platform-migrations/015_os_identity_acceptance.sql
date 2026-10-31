-- Control-plane acceptance only. No host execution authority, grants or runtime installation.
SET NOCOUNT ON;SET XACT_ABORT ON;SET ANSI_NULLS ON;SET QUOTED_IDENTIFIER ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM' OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1
 THROW 54001,'admin_platform_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='014_os_identity_delegations_v1')
 THROW 54002,'os_delegations_required',1;
BEGIN TRY BEGIN TRANSACTION;
 DECLARE @lock int;
 EXEC @lock=sys.sp_getapplock @Resource=N'infraflow-platform-migrations',@LockMode=N'Exclusive',@LockOwner=N'Transaction',@LockTimeout=5000;
 IF @lock<0 THROW 54003,'platform_migration_busy',1;
 IF EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='015_os_identity_acceptance_v1')
 BEGIN COMMIT;SELECT N'OS_IDENTITY_ACCEPTANCE_ALREADY_APPLIED';RETURN;END;
 IF EXISTS(SELECT 1 FROM platform.provision_jobs WITH(UPDLOCK,HOLDLOCK) WHERE state='leased')
 THROW 54004,'worker_not_idle',1;
 IF OBJECT_ID(N'platform.os_identity_acceptances') IS NOT NULL OR OBJECT_ID(N'platform.os_identity_acceptance_events') IS NOT NULL
 OR OBJECT_ID(N'platform.accept_os_identity_delegation') IS NOT NULL
 THROW 54005,'os_acceptance_partial_state_requires_review',1;
 CREATE TABLE platform.os_identity_acceptances(
  intent_id uniqueidentifier NOT NULL PRIMARY KEY REFERENCES platform.os_identity_delegations(intent_id),
  accepted_at datetime2(3) NOT NULL,deadline datetime2(3) NOT NULL,
  executor_name nvarchar(128) NOT NULL,sql_actor nvarchar(128) NOT NULL,
  CHECK(deadline>accepted_at)
 );
 CREATE TABLE platform.os_identity_acceptance_events(
  event_id bigint IDENTITY PRIMARY KEY,intent_id uniqueidentifier NOT NULL REFERENCES platform.os_identity_acceptances(intent_id),
  action varchar(32) NOT NULL CHECK(action='delegation.accepted'),
  sql_actor nvarchar(128) NOT NULL,created_at datetime2(3) NOT NULL
 );
 EXEC(N'CREATE PROCEDURE platform.accept_os_identity_delegation @json nvarchar(max) AS
 BEGIN
 SET NOCOUNT ON;SET XACT_ABORT ON;
 IF USER_NAME() COLLATE Latin1_General_100_BIN2<>N''infraflow_demo_os_executor''
 THROW 54010,''os_executor_identity_required'',1;
 IF @json IS NULL OR ISJSON(@json)<>1 OR LEFT(LTRIM(@json),1)<>N''{'' OR DATALENGTH(@json)>1024
 THROW 54011,''invalid_os_acceptance'',1;
 DECLARE @keys TABLE(k nvarchar(32) COLLATE Latin1_General_100_BIN2 PRIMARY KEY);
 INSERT @keys VALUES(N''intentId''),(N''delegationToken'');
 IF (SELECT COUNT(*) FROM OPENJSON(@json))<>2
 OR EXISTS(SELECT 1 FROM OPENJSON(@json) j LEFT JOIN @keys k ON j.[key] COLLATE Latin1_General_100_BIN2=k.k WHERE k.k IS NULL OR j.[type]<>1)
 OR EXISTS(SELECT [key] COLLATE Latin1_General_100_BIN2 FROM OPENJSON(@json) GROUP BY [key] COLLATE Latin1_General_100_BIN2 HAVING COUNT(*)<>1)
 THROW 54011,''invalid_os_acceptance'',1;
 DECLARE @it nvarchar(max)=JSON_VALUE(@json,''$.intentId''),@token nvarchar(max)=JSON_VALUE(@json,''$.delegationToken'');
 DECLARE @intent uniqueidentifier=TRY_CONVERT(uniqueidentifier,@it);
 IF @intent IS NULL OR DATALENGTH(@it)<>72 OR @it COLLATE Latin1_General_100_BIN2<>LOWER(CONVERT(nvarchar(36),@intent)) COLLATE Latin1_General_100_BIN2
 OR @token IS NULL OR DATALENGTH(@token)<>128 OR @token COLLATE Latin1_General_100_BIN2 LIKE N''%[^0-9a-f]%''
 THROW 54011,''invalid_os_acceptance'',1;
 BEGIN TRY BEGIN TRANSACTION;
 DECLARE @job uniqueidentifier,@trial uniqueidentifier,@gen int,@rev int,@resource varchar(256),@deadline datetime2(3),@now datetime2(3);
 -- Hold update/range locks for the job, trial, intent and delegation until audit commit.
 SELECT @job=j.job_id,@trial=j.trial_id,@gen=j.generation,@rev=j.job_revision,@resource=r.resource_key,
 @deadline=CASE WHEN d.expires_at<j.lease_expires_at THEN d.expires_at ELSE j.lease_expires_at END
 FROM platform.provision_jobs j WITH(UPDLOCK,HOLDLOCK)
 JOIN platform.trials t WITH(UPDLOCK,HOLDLOCK) ON t.trial_id=j.trial_id
 JOIN platform.provision_step_intents i WITH(UPDLOCK,HOLDLOCK) ON i.job_id=j.job_id AND i.generation=j.generation AND i.intent_id=@intent
 JOIN platform.os_identity_delegations d WITH(UPDLOCK,HOLDLOCK) ON d.intent_id=i.intent_id
 JOIN platform.resource_reservations r ON r.job_id=j.job_id AND r.trial_id=j.trial_id AND r.resource_type=''os_identity''
 WHERE j.state=''leased'' AND j.execution_ready=0 AND j.job_revision=d.job_revision AND j.job_revision=i.job_revision
 AND j.lease_owner COLLATE Latin1_General_100_BIN2=d.owner_name COLLATE Latin1_General_100_BIN2
 AND i.owner_name COLLATE Latin1_General_100_BIN2=d.owner_name COLLATE Latin1_General_100_BIN2
 AND t.state=''queued'' AND t.revision=j.trial_revision AND t.activated_at IS NULL AND t.expires_at IS NULL
 AND i.step_name=''os_identity'' AND i.state=''intent_recorded'' AND d.state=''prepared''
 AND d.delegation_hash=HASHBYTES(''SHA2_256'',CONVERT(varbinary(32),@token,2))
 AND DATALENGTH(r.resource_key)=32 AND DATALENGTH(d.resource_key)=32
 AND DATALENGTH(JSON_VALUE(j.resource_manifest,''$.osIdentity''))=64
 AND r.resource_key COLLATE Latin1_General_100_BIN2=d.resource_key COLLATE Latin1_General_100_BIN2
 AND JSON_VALUE(j.resource_manifest,''$.osIdentity'') COLLATE Latin1_General_100_BIN2=r.resource_key COLLATE Latin1_General_100_BIN2
 AND r.resource_key COLLATE Latin1_General_100_BIN2=(''ift_''+LEFT(REPLACE(LOWER(CONVERT(char(36),j.trial_id)),''-'',''''),28)) COLLATE Latin1_General_100_BIN2;
 SET @now=SYSUTCDATETIME();
 IF @job IS NULL OR @deadline IS NULL OR @deadline<=@now
 THROW 54012,''os_acceptance_binding_denied'',1;
 IF EXISTS(SELECT 1 FROM platform.os_identity_acceptances WITH(UPDLOCK,HOLDLOCK) WHERE intent_id=@intent)
 THROW 54013,''os_acceptance_already_consumed_requires_review'',1;
 INSERT platform.os_identity_acceptances(intent_id,accepted_at,deadline,executor_name,sql_actor)
 VALUES(@intent,@now,@deadline,USER_NAME(),ORIGINAL_LOGIN());
 INSERT platform.os_identity_acceptance_events(intent_id,action,sql_actor,created_at)
 VALUES(@intent,''delegation.accepted'',ORIGINAL_LOGIN(),@now);
 COMMIT;
 SELECT LOWER(CONVERT(char(36),@job)) jobId,LOWER(CONVERT(char(36),@trial)) trialId,
 LOWER(CONVERT(char(36),@intent)) intentId,@gen generation,@rev jobRevision,@resource resourceKey,
 ''accepted'' state,CAST(0 AS bit) executionAllowed,''durable_result_and_reconciliation_protocol'' nextGate
 FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;
 END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
 END;');
 INSERT platform.schema_migrations(migration_id) VALUES('015_os_identity_acceptance_v1');
 COMMIT;SELECT N'OS_IDENTITY_ACCEPTANCE_APPLIED';
END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
