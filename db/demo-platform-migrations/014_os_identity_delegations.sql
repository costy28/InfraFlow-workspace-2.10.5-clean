-- Durable preparation only. No OS execution authority, grants, accounts or job changes.
SET NOCOUNT ON;SET XACT_ABORT ON;SET ANSI_NULLS ON;SET QUOTED_IDENTIFIER ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM' OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1
 THROW 53901,'admin_platform_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='013_channel_review_probe_v1')
 THROW 53902,'channel_probe_schema_required',1;
BEGIN TRY BEGIN TRANSACTION;
 DECLARE @lock int;
 EXEC @lock=sys.sp_getapplock @Resource=N'infraflow-platform-migrations',@LockMode=N'Exclusive',@LockOwner=N'Transaction',@LockTimeout=5000;
 IF @lock<0 THROW 53903,'platform_migration_busy',1;
 IF EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='014_os_identity_delegations_v1')
 BEGIN COMMIT;SELECT N'OS_IDENTITY_DELEGATIONS_ALREADY_APPLIED';RETURN;END;
 IF EXISTS(SELECT 1 FROM platform.provision_jobs WITH(UPDLOCK,HOLDLOCK) WHERE state='leased')
 THROW 53904,'worker_not_idle',1;
 IF OBJECT_ID(N'platform.os_identity_delegations') IS NOT NULL OR OBJECT_ID(N'platform.os_identity_delegation_events') IS NOT NULL
 OR OBJECT_ID(N'platform.prepare_os_identity_delegation') IS NOT NULL
 THROW 53905,'os_delegation_partial_state_requires_review',1;
 CREATE TABLE platform.os_identity_delegations(
  intent_id uniqueidentifier NOT NULL PRIMARY KEY REFERENCES platform.provision_step_intents(intent_id),
  delegation_hash binary(32) NOT NULL UNIQUE,
  job_revision int NOT NULL CHECK(job_revision>0),
  resource_key varchar(256) COLLATE Latin1_General_100_BIN2 NOT NULL,
  state varchar(16) COLLATE Latin1_General_100_BIN2 NOT NULL DEFAULT 'prepared' CHECK(state='prepared'),
  prepared_at datetime2(3) NOT NULL,expires_at datetime2(3) NOT NULL,
  owner_name nvarchar(128) NOT NULL,sql_actor nvarchar(128) NOT NULL,
  CHECK(expires_at>prepared_at),
  CHECK(DATALENGTH(resource_key)=32 AND LEFT(resource_key,4)='ift_' AND SUBSTRING(resource_key,5,28) NOT LIKE '%[^0-9a-f]%')
 );
 CREATE TABLE platform.os_identity_delegation_events(
  event_id bigint IDENTITY PRIMARY KEY,
  intent_id uniqueidentifier NOT NULL REFERENCES platform.os_identity_delegations(intent_id),
  action varchar(32) NOT NULL CHECK(action='delegation.prepared'),
  sql_actor nvarchar(128) NOT NULL,created_at datetime2(3) NOT NULL
 );
 EXEC(N'CREATE PROCEDURE platform.prepare_os_identity_delegation @json nvarchar(max) AS
 BEGIN
 SET NOCOUNT ON;SET XACT_ABORT ON;
 IF @json IS NULL OR ISJSON(@json)<>1 OR LEFT(LTRIM(@json),1)<>N''{'' OR DATALENGTH(@json)>2048
 THROW 53910,''invalid_os_delegation'',1;
 DECLARE @keys TABLE(k nvarchar(32) COLLATE Latin1_General_100_BIN2 PRIMARY KEY,t int);
 INSERT @keys VALUES(N''jobId'',1),(N''generation'',2),(N''expectedJobRevision'',2),(N''leaseToken'',1),(N''intentId'',1),(N''delegationToken'',1);
 IF (SELECT COUNT(*) FROM OPENJSON(@json))<>6
 OR EXISTS(SELECT 1 FROM OPENJSON(@json) j LEFT JOIN @keys k ON j.[key] COLLATE Latin1_General_100_BIN2=k.k WHERE k.k IS NULL OR j.[type]<>k.t)
 OR EXISTS(SELECT [key] COLLATE Latin1_General_100_BIN2 FROM OPENJSON(@json) GROUP BY [key] COLLATE Latin1_General_100_BIN2 HAVING COUNT(*)<>1)
 THROW 53910,''invalid_os_delegation'',1;
 DECLARE @jt nvarchar(max)=JSON_VALUE(@json,''$.jobId''),@it nvarchar(max)=JSON_VALUE(@json,''$.intentId''),
 @gt nvarchar(max)=JSON_VALUE(@json,''$.generation''),@rt nvarchar(max)=JSON_VALUE(@json,''$.expectedJobRevision''),
 @lt nvarchar(max)=JSON_VALUE(@json,''$.leaseToken''),@dt nvarchar(max)=JSON_VALUE(@json,''$.delegationToken'');
 DECLARE @job uniqueidentifier=TRY_CONVERT(uniqueidentifier,@jt),@intent uniqueidentifier=TRY_CONVERT(uniqueidentifier,@it),
 @gen int=TRY_CONVERT(int,@gt),@rev int=TRY_CONVERT(int,@rt),@owner nvarchar(128)=USER_NAME();
 IF @job IS NULL OR DATALENGTH(@jt)<>72 OR @jt COLLATE Latin1_General_100_BIN2<>LOWER(CONVERT(nvarchar(36),@job)) COLLATE Latin1_General_100_BIN2
 OR @intent IS NULL OR DATALENGTH(@it)<>72 OR @it COLLATE Latin1_General_100_BIN2<>LOWER(CONVERT(nvarchar(36),@intent)) COLLATE Latin1_General_100_BIN2
 OR @gen IS NULL OR @gen<1 OR @gen>=2147483647 OR @gt COLLATE Latin1_General_100_BIN2<>CONVERT(nvarchar(20),@gen)
 OR @rev IS NULL OR @rev<1 OR @rev>=2147483647 OR @rt COLLATE Latin1_General_100_BIN2<>CONVERT(nvarchar(20),@rev)
 OR @lt IS NULL OR DATALENGTH(@lt)<>128 OR @lt COLLATE Latin1_General_100_BIN2 LIKE N''%[^0-9a-f]%''
 OR @dt IS NULL OR DATALENGTH(@dt)<>128 OR @dt COLLATE Latin1_General_100_BIN2 LIKE N''%[^0-9a-f]%''
 THROW 53910,''invalid_os_delegation'',1;
 BEGIN TRY BEGIN TRANSACTION;
 DECLARE @now datetime2(3)=SYSUTCDATETIME(),@expires datetime2(3),@resource varchar(256),@derived varchar(32),@saved binary(32),@savedRev int,@savedExpiry datetime2(3);
 SELECT @expires=j.lease_expires_at,@resource=r.resource_key,
 @derived=''ift_''+LEFT(REPLACE(LOWER(CONVERT(char(36),j.trial_id)),''-'',''''),28)
 FROM platform.provision_jobs j WITH(UPDLOCK,HOLDLOCK)
 JOIN platform.trials t WITH(UPDLOCK,HOLDLOCK) ON t.trial_id=j.trial_id
 JOIN platform.provision_step_intents i WITH(UPDLOCK,HOLDLOCK) ON i.job_id=j.job_id AND i.intent_id=@intent AND i.generation=j.generation
 JOIN platform.resource_reservations r ON r.job_id=j.job_id AND r.trial_id=j.trial_id AND r.resource_type=''os_identity''
 WHERE j.job_id=@job AND j.state=''leased'' AND j.job_revision=@rev AND j.generation=@gen AND j.execution_ready=0
 AND j.lease_owner COLLATE Latin1_General_100_BIN2=@owner COLLATE Latin1_General_100_BIN2
 AND j.lease_hash=HASHBYTES(''SHA2_256'',CONVERT(varbinary(32),@lt,2)) AND j.lease_expires_at>@now
 AND t.state=''queued'' AND t.revision=j.trial_revision AND t.activated_at IS NULL AND t.expires_at IS NULL
 AND i.step_name=''os_identity'' AND i.state=''intent_recorded'' AND i.job_revision=@rev
 AND i.owner_name COLLATE Latin1_General_100_BIN2=@owner COLLATE Latin1_General_100_BIN2
 AND DATALENGTH(r.resource_key)=32 AND DATALENGTH(JSON_VALUE(j.resource_manifest,''$.osIdentity''))=64
 AND JSON_VALUE(j.resource_manifest,''$.osIdentity'') COLLATE Latin1_General_100_BIN2=r.resource_key COLLATE Latin1_General_100_BIN2;
 SET @now=SYSUTCDATETIME();
 IF @expires IS NULL OR @expires<=@now OR @resource COLLATE Latin1_General_100_BIN2<>@derived COLLATE Latin1_General_100_BIN2
 THROW 53911,''os_delegation_binding_denied'',1;
 SELECT @saved=delegation_hash,@savedRev=job_revision,@savedExpiry=expires_at
 FROM platform.os_identity_delegations WITH(UPDLOCK,HOLDLOCK) WHERE intent_id=@intent;
 IF @saved IS NOT NULL AND (@saved<>HASHBYTES(''SHA2_256'',CONVERT(varbinary(32),@dt,2)) OR @savedRev<>@rev OR @savedExpiry<=@now)
 THROW 53912,''os_delegation_conflict_requires_review'',1;
 IF @saved IS NULL
 BEGIN
 INSERT platform.os_identity_delegations(intent_id,delegation_hash,job_revision,resource_key,prepared_at,expires_at,owner_name,sql_actor)
 VALUES(@intent,HASHBYTES(''SHA2_256'',CONVERT(varbinary(32),@dt,2)),@rev,@resource,@now,@expires,@owner,ORIGINAL_LOGIN());
 INSERT platform.os_identity_delegation_events(intent_id,action,sql_actor,created_at)
 VALUES(@intent,''delegation.prepared'',ORIGINAL_LOGIN(),@now);
 END;
 COMMIT;
 SELECT LOWER(CONVERT(char(36),@job)) jobId,LOWER(CONVERT(char(36),@intent)) intentId,@gen generation,@rev jobRevision,
 @resource resourceKey,''prepared'' state,CAST(0 AS bit) executionAllowed FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;
 END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
 END;');
 INSERT platform.schema_migrations(migration_id) VALUES('014_os_identity_delegations_v1');
 COMMIT;SELECT N'OS_IDENTITY_DELEGATIONS_APPLIED';
END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
