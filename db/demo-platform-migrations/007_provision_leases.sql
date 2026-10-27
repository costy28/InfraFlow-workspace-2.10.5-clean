-- Private control-plane leases only. Execution gate remains CLOSED. No grants.
SET NOCOUNT ON;SET XACT_ABORT ON;SET ANSI_NULLS ON;SET QUOTED_IDENTIFIER ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM'
 THROW 52301,'platform_database_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='006_provision_reservations_v1')
 THROW 52302,'provision_reservations_required',1;
BEGIN TRY
 BEGIN TRANSACTION;
 DECLARE @lock int;
 EXEC @lock=sys.sp_getapplock @Resource=N'infraflow-platform-migrations',@LockMode=N'Exclusive',@LockOwner=N'Transaction',@LockTimeout=5000;
 IF @lock<0 THROW 52303,'platform_migration_busy',1;
 IF EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='007_provision_leases_v1')
 BEGIN COMMIT;SELECT N'PROVISION_LEASES_ALREADY_APPLIED';RETURN;END;
 IF OBJECT_ID(N'platform.provision_lease_events') IS NOT NULL OR OBJECT_ID(N'platform.provision_lease_command') IS NOT NULL
  THROW 52304,'lease_partial_state_requires_review',1;
 CREATE TABLE platform.provision_lease_events(
  job_id uniqueidentifier NOT NULL REFERENCES platform.provision_jobs(job_id),
  job_revision int NOT NULL,generation int NOT NULL,
  action varchar(16) NOT NULL CHECK(action IN('claim','renew','release')),
  owner_name nvarchar(128) NOT NULL,sql_actor nvarchar(128) NOT NULL,
  occurred_at datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  PRIMARY KEY(job_id,job_revision)
 );
 EXEC(N'CREATE PROCEDURE platform.provision_lease_command @operation varchar(16),@json nvarchar(max) AS
 BEGIN
 SET NOCOUNT ON;SET XACT_ABORT ON;
 IF @operation IS NULL OR @operation COLLATE Latin1_General_100_BIN2 NOT IN(''claim'',''verify'',''renew'',''release'')
  OR @json IS NULL OR ISJSON(@json)<>1 OR LEFT(LTRIM(@json),1)<>N''{'' OR DATALENGTH(@json)>2048
  THROW 52310,''invalid_lease_command'',1;
 DECLARE @keys TABLE(k nvarchar(32) COLLATE Latin1_General_100_BIN2 PRIMARY KEY,t int);
 INSERT @keys VALUES(N''jobId'',1),(N''leaseToken'',1);
 IF @operation<>''claim'' INSERT @keys VALUES(N''generation'',2);
 IF @operation<>''verify'' INSERT @keys VALUES(N''expectedJobRevision'',2);
 IF (SELECT COUNT(*) FROM OPENJSON(@json))<>(SELECT COUNT(*) FROM @keys)
  OR EXISTS(SELECT 1 FROM OPENJSON(@json) j LEFT JOIN @keys k ON j.[key] COLLATE Latin1_General_100_BIN2=k.k WHERE k.k IS NULL OR j.[type]<>k.t)
  OR EXISTS(SELECT j.[key] COLLATE Latin1_General_100_BIN2 FROM OPENJSON(@json) j GROUP BY j.[key] COLLATE Latin1_General_100_BIN2 HAVING COUNT(*)<>1)
  THROW 52310,''invalid_lease_command'',1;
 DECLARE @idText nvarchar(100)=JSON_VALUE(@json,''$.jobId''),@token nvarchar(100)=JSON_VALUE(@json,''$.leaseToken''),
  @revText nvarchar(100)=JSON_VALUE(@json,''$.expectedJobRevision''),@genText nvarchar(100)=JSON_VALUE(@json,''$.generation'');
 DECLARE @id uniqueidentifier=TRY_CONVERT(uniqueidentifier,@idText),@expected int=TRY_CONVERT(int,@revText),@requestedGen int=TRY_CONVERT(int,@genText);
 IF @id IS NULL OR DATALENGTH(@idText)<>72 OR @idText COLLATE Latin1_General_100_BIN2<>LOWER(CONVERT(nvarchar(36),@id)) COLLATE Latin1_General_100_BIN2
  OR @token IS NULL OR DATALENGTH(@token)<>128 OR @token COLLATE Latin1_General_100_BIN2 LIKE N''%[^0-9a-f]%''
  OR (@operation<>''verify'' AND (@expected IS NULL OR @expected<0 OR @expected>=2147483647 OR @revText COLLATE Latin1_General_100_BIN2<>CONVERT(nvarchar(20),@expected)))
  OR (@operation<>''claim'' AND (@requestedGen IS NULL OR @requestedGen<1 OR @requestedGen>=2147483647 OR @genText COLLATE Latin1_General_100_BIN2<>CONVERT(nvarchar(20),@requestedGen)))
  THROW 52310,''invalid_lease_command'',1;
 DECLARE @hash binary(32)=HASHBYTES(''SHA2_256'',CONVERT(varbinary(32),@token,2)),@owner nvarchar(128)=USER_NAME(),
  @state varchar(16),@rev int,@gen int,@savedOwner varchar(128),@savedHash binary(32),@expiry datetime2(3),@now datetime2(3),@trial uniqueidentifier;
 BEGIN TRY
 BEGIN TRANSACTION;
 SELECT @state=j.state,@rev=j.job_revision,@gen=j.generation,@savedOwner=j.lease_owner,@savedHash=j.lease_hash,
  @expiry=j.lease_expires_at,@trial=j.trial_id
 FROM platform.provision_jobs j WITH(UPDLOCK,HOLDLOCK)
 JOIN platform.trials t WITH(UPDLOCK,HOLDLOCK) ON t.trial_id=j.trial_id
 WHERE j.job_id=@id AND t.state=''queued'' AND t.revision=j.trial_revision
  AND t.activated_at IS NULL AND t.expires_at IS NULL AND j.execution_ready=0;
 SET @now=SYSUTCDATETIME();
 IF @state IS NULL THROW 52311,''lease_unavailable'',1;
 IF @operation=''claim''
 BEGIN
  IF @state=''leased'' AND @expiry>@now AND @savedHash=@hash AND @savedOwner COLLATE Latin1_General_100_BIN2=@owner COLLATE Latin1_General_100_BIN2 AND @rev=@expected+1
  BEGIN
   -- Exact live claim replay does not extend the lease or change the generation.
   COMMIT;
   SELECT LOWER(CONVERT(char(36),@id)) jobId,@gen generation,@rev jobRevision,@expiry leaseExpiresAt,CAST(0 AS bit) executionAllowed FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;RETURN;
  END;
  IF @rev<>@expected OR @gen>=2147483646 OR @rev>=2147483646
   OR @state NOT IN(''queued'',''leased'') OR (@state=''leased'' AND (@expiry>@now OR @savedHash=@hash))
   THROW 52312,''lease_conflict'',1;
  -- Principal names must round-trip into the existing varchar owner column.
  IF CONVERT(nvarchar(128),CONVERT(varchar(128),@owner)) COLLATE Latin1_General_100_BIN2<>@owner COLLATE Latin1_General_100_BIN2
   THROW 52312,''lease_conflict'',1;
  SET @gen=@gen+1;SET @expiry=DATEADD(second,60,@now);
  UPDATE platform.provision_jobs SET state=''leased'',generation=@gen,lease_owner=@owner,lease_hash=@hash,lease_expires_at=@expiry,job_revision=job_revision+1 WHERE job_id=@id;
 END
 ELSE
 BEGIN
  IF @state<>''leased'' OR @expiry<=@now OR @gen<>@requestedGen OR @savedHash<>@hash
   OR @savedOwner COLLATE Latin1_General_100_BIN2<>@owner COLLATE Latin1_General_100_BIN2
   THROW 52312,''lease_conflict'',1;
  IF @operation<>''verify''
  BEGIN
   IF @rev<>@expected OR @rev>=2147483646 THROW 52312,''lease_conflict'',1;
   IF @operation=''renew''
   BEGIN
    SET @expiry=DATEADD(second,60,@now);
    UPDATE platform.provision_jobs SET lease_expires_at=@expiry,job_revision=job_revision+1 WHERE job_id=@id;
   END
   ELSE
   BEGIN
    SET @expiry=NULL;
    UPDATE platform.provision_jobs SET state=''queued'',lease_owner=NULL,lease_hash=NULL,lease_expires_at=NULL,job_revision=job_revision+1 WHERE job_id=@id;
   END;
  END;
 END;
 IF @operation<>''verify''
 BEGIN
  SET @rev=@rev+1;
  INSERT platform.provision_lease_events(job_id,job_revision,generation,action,owner_name,sql_actor) VALUES(@id,@rev,@gen,@operation,@owner,ORIGINAL_LOGIN());
 END;
 COMMIT;
 SELECT LOWER(CONVERT(char(36),@id)) jobId,@gen generation,@rev jobRevision,@expiry leaseExpiresAt,CAST(0 AS bit) executionAllowed FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES;
 END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
 END;');
 INSERT platform.schema_migrations(migration_id) VALUES('007_provision_leases_v1');
 COMMIT;SELECT N'PROVISION_LEASES_APPLIED';
END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
