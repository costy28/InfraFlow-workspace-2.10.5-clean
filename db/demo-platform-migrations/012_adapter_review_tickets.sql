-- Single-use review tickets, never external-effect authority. No grants.
SET NOCOUNT ON;SET XACT_ABORT ON;SET ANSI_NULLS ON;SET QUOTED_IDENTIFIER ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM'
 THROW 53201,'platform_database_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='011_adapter_resource_review_v1')
 THROW 53202,'adapter_review_required',1;
BEGIN TRY
 BEGIN TRANSACTION;
 DECLARE @lock int;
 EXEC @lock=sys.sp_getapplock @Resource=N'infraflow-platform-migrations',@LockMode=N'Exclusive',@LockOwner=N'Transaction',@LockTimeout=5000;
 IF @lock<0 THROW 53203,'platform_migration_busy',1;
 IF EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='012_adapter_review_tickets_v1')
 BEGIN COMMIT;SELECT N'ADAPTER_REVIEW_TICKETS_ALREADY_APPLIED';RETURN;END;
 IF OBJECT_ID(N'platform.adapter_review_tickets') IS NOT NULL OR OBJECT_ID(N'platform.adapter_review_ticket_command') IS NOT NULL
  THROW 53204,'review_ticket_partial_state_requires_review',1;
 CREATE TABLE platform.adapter_review_tickets(
  intent_id uniqueidentifier NOT NULL PRIMARY KEY REFERENCES platform.provision_step_intents(intent_id),
  ticket_hash binary(32) NOT NULL UNIQUE,
  job_revision int NOT NULL CHECK(job_revision>0),
  issued_at datetime2(3) NOT NULL,expires_at datetime2(3) NOT NULL,
  issuer nvarchar(128) NOT NULL,sql_issuer nvarchar(128) NOT NULL,
  consumed_at datetime2(3) NULL,consumer nvarchar(128) NULL,sql_consumer nvarchar(128) NULL,
  CHECK(expires_at=DATEADD(second,10,issued_at)),
  CHECK((consumed_at IS NULL AND consumer IS NULL AND sql_consumer IS NULL) OR
   (consumed_at IS NOT NULL AND consumed_at>=issued_at AND consumed_at<expires_at AND consumer IS NOT NULL AND sql_consumer IS NOT NULL))
 );
 EXEC(N'CREATE PROCEDURE platform.adapter_review_ticket_command @operation varchar(16),@json nvarchar(max) AS
 BEGIN
 SET NOCOUNT ON;SET XACT_ABORT ON;
 IF @operation IS NULL OR @operation COLLATE Latin1_General_100_BIN2 NOT IN(''issue'',''consume'')
  OR @json IS NULL OR ISJSON(@json)<>1 OR LEFT(LTRIM(@json),1)<>N''{'' OR DATALENGTH(@json)>2048
  THROW 53210,''invalid_review_ticket'',1;
 DECLARE @keys TABLE(k nvarchar(32) COLLATE Latin1_General_100_BIN2 PRIMARY KEY,t int);
 INSERT @keys VALUES(N''intentId'',1),(N''ticketToken'',1);
 IF @operation=''issue'' INSERT @keys VALUES(N''jobId'',1),(N''generation'',2),(N''expectedJobRevision'',2),(N''leaseToken'',1);
 IF (SELECT COUNT(*) FROM OPENJSON(@json))<>(SELECT COUNT(*) FROM @keys)
  OR EXISTS(SELECT 1 FROM OPENJSON(@json) j LEFT JOIN @keys k ON j.[key] COLLATE Latin1_General_100_BIN2=k.k WHERE k.k IS NULL OR j.[type]<>k.t)
  OR EXISTS(SELECT [key] COLLATE Latin1_General_100_BIN2 FROM OPENJSON(@json) GROUP BY [key] COLLATE Latin1_General_100_BIN2 HAVING COUNT(*)<>1)
  THROW 53210,''invalid_review_ticket'',1;
 DECLARE @it nvarchar(max)=JSON_VALUE(@json,''$.intentId''),@ticket nvarchar(max)=JSON_VALUE(@json,''$.ticketToken''),
  @jt nvarchar(max)=JSON_VALUE(@json,''$.jobId''),@lt nvarchar(max)=JSON_VALUE(@json,''$.leaseToken''),
  @gt nvarchar(max)=JSON_VALUE(@json,''$.generation''),@rt nvarchar(max)=JSON_VALUE(@json,''$.expectedJobRevision'');
 DECLARE @intent uniqueidentifier=TRY_CONVERT(uniqueidentifier,@it),@requestedJob uniqueidentifier=TRY_CONVERT(uniqueidentifier,@jt),
  @requestedGen int=TRY_CONVERT(int,@gt),@requestedRev int=TRY_CONVERT(int,@rt),@actor nvarchar(128)=USER_NAME();
 IF @intent IS NULL OR DATALENGTH(@it)<>72 OR @it COLLATE Latin1_General_100_BIN2<>LOWER(CONVERT(nvarchar(36),@intent)) COLLATE Latin1_General_100_BIN2
  OR @ticket IS NULL OR DATALENGTH(@ticket)<>128 OR @ticket COLLATE Latin1_General_100_BIN2 LIKE N''%[^0-9a-f]%''
  THROW 53210,''invalid_review_ticket'',1;
 IF @operation=''issue'' AND (@requestedJob IS NULL OR DATALENGTH(@jt)<>72 OR @jt COLLATE Latin1_General_100_BIN2<>LOWER(CONVERT(nvarchar(36),@requestedJob)) COLLATE Latin1_General_100_BIN2
  OR @lt IS NULL OR DATALENGTH(@lt)<>128 OR @lt COLLATE Latin1_General_100_BIN2 LIKE N''%[^0-9a-f]%''
  OR @requestedGen IS NULL OR @requestedGen<1 OR @gt COLLATE Latin1_General_100_BIN2<>CONVERT(nvarchar(20),@requestedGen)
  OR @requestedRev IS NULL OR @requestedRev<1 OR @rt COLLATE Latin1_General_100_BIN2<>CONVERT(nvarchar(20),@requestedRev))
  THROW 53210,''invalid_review_ticket'',1;
 IF @operation=''consume'' AND @actor COLLATE Latin1_General_100_BIN2<>N''infraflow_demo_adapter_review''
  THROW 53211,''review_ticket_denied'',1;
 DECLARE @job uniqueidentifier,@intentGen int,@step varchar(32),@intentOwner nvarchar(128),
  @state varchar(16),@rev int,@gen int,@owner varchar(128),@hash binary(32),@expiry datetime2(3),@now datetime2(3),
  @savedHash binary(32),@savedRev int,@ticketExpiry datetime2(3),@consumed datetime2(3),@issuer nvarchar(128),
  @ticketHash binary(32)=HASHBYTES(''SHA2_256'',CONVERT(varbinary(32),@ticket,2));
 BEGIN TRY BEGIN TRANSACTION;
 SELECT @job=job_id FROM platform.provision_step_intents WHERE intent_id=@intent;
 IF @job IS NULL THROW 53211,''review_ticket_denied'',1;
 SELECT @state=j.state,@rev=j.job_revision,@gen=j.generation,@owner=j.lease_owner,@hash=j.lease_hash,@expiry=j.lease_expires_at
 FROM platform.provision_jobs j WITH(UPDLOCK,HOLDLOCK) JOIN platform.trials t WITH(HOLDLOCK) ON t.trial_id=j.trial_id
 WHERE j.job_id=@job AND j.execution_ready=0 AND t.state=''queued'' AND t.revision=j.trial_revision
  AND t.activated_at IS NULL AND t.expires_at IS NULL;
 SELECT @intentGen=generation,@step=step_name,@intentOwner=owner_name FROM platform.provision_step_intents WITH(HOLDLOCK) WHERE intent_id=@intent;
 SET @now=SYSUTCDATETIME();
 IF @state IS NULL OR @state<>''leased'' OR @expiry<=@now OR @intentGen<>@gen
  OR @intentOwner COLLATE Latin1_General_100_BIN2<>@owner COLLATE Latin1_General_100_BIN2
  THROW 53211,''review_ticket_denied'',1;
 SELECT @savedHash=ticket_hash,@savedRev=job_revision,@ticketExpiry=expires_at,@consumed=consumed_at,@issuer=issuer
 FROM platform.adapter_review_tickets WITH(UPDLOCK,HOLDLOCK) WHERE intent_id=@intent;
 IF @operation=''issue''
 BEGIN
  IF @job<>@requestedJob OR @gen<>@requestedGen OR @rev<>@requestedRev
   OR @owner COLLATE Latin1_General_100_BIN2<>@actor COLLATE Latin1_General_100_BIN2
   OR @hash<>HASHBYTES(''SHA2_256'',CONVERT(varbinary(32),@lt,2)) THROW 53211,''review_ticket_denied'',1;
  IF @savedHash IS NOT NULL AND (@savedHash<>@ticketHash OR @savedRev<>@rev OR @ticketExpiry<=@now OR @consumed IS NOT NULL)
   THROW 53212,''review_ticket_conflict'',1;
  IF @savedHash IS NULL
  BEGIN
   SET @ticketExpiry=DATEADD(second,10,@now);
   INSERT platform.adapter_review_tickets(intent_id,ticket_hash,job_revision,issued_at,expires_at,issuer,sql_issuer)
    VALUES(@intent,@ticketHash,@rev,@now,@ticketExpiry,@actor,ORIGINAL_LOGIN());
  END;
 END
 ELSE
 BEGIN
  IF @savedHash IS NULL OR @savedHash<>@ticketHash OR @savedRev<>@rev OR @ticketExpiry<=@now OR @consumed IS NOT NULL
   OR @issuer COLLATE Latin1_General_100_BIN2<>@owner COLLATE Latin1_General_100_BIN2 THROW 53211,''review_ticket_denied'',1;
  UPDATE platform.adapter_review_tickets SET consumed_at=@now,consumer=@actor,sql_consumer=ORIGINAL_LOGIN() WHERE intent_id=@intent;
 END;
 COMMIT;
 SELECT LOWER(CONVERT(char(36),@job)) jobId,LOWER(CONVERT(char(36),@intent)) intentId,@gen generation,@rev jobRevision,
  @step step,@operation operation,CAST(0 AS bit) executionAllowed FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;
 END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
 END;');
 INSERT platform.schema_migrations(migration_id) VALUES('012_adapter_review_tickets_v1');
 COMMIT;SELECT N'ADAPTER_REVIEW_TICKETS_APPLIED';
END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
