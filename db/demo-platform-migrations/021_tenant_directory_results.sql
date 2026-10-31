-- Atomic observations + audit. No grants, host effects, job completion or activation.
SET NOCOUNT ON;SET XACT_ABORT ON;SET ANSI_NULLS ON;SET QUOTED_IDENTIFIER ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM' OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1
 THROW 54701,'admin_platform_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='020_tenant_directory_context_v1')
 THROW 54702,'directory_context_required',1;
BEGIN TRY BEGIN TRANSACTION;
 DECLARE @lock int;
 EXEC @lock=sys.sp_getapplock @Resource=N'infraflow-platform-migrations',@LockMode=N'Exclusive',@LockOwner=N'Transaction',@LockTimeout=5000;
 IF @lock<0 THROW 54703,'platform_migration_busy',1;
 IF EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='021_tenant_directory_results_v1')
 BEGIN COMMIT;SELECT N'DIRECTORY_RESULTS_ALREADY_APPLIED';RETURN;END;
 IF EXISTS(SELECT 1 FROM platform.provision_jobs WITH(UPDLOCK,HOLDLOCK) WHERE state='leased')
 THROW 54704,'worker_not_idle',1;
 IF OBJECT_ID(N'platform.record_tenant_directory_result') IS NOT NULL
 THROW 54705,'directory_results_partial_requires_review',1;
 EXEC(N'CREATE PROCEDURE platform.record_tenant_directory_result @json nvarchar(max) AS
 BEGIN
 SET NOCOUNT ON;SET XACT_ABORT ON;
 IF USER_NAME() COLLATE Latin1_General_100_BIN2<>N''infraflow_demo_directory_executor''
 THROW 54710,''directory_executor_identity_required'',1;
 IF @json IS NULL OR ISJSON(@json)<>1 OR LEFT(LTRIM(@json),1)<>N''{'' OR DATALENGTH(@json)>12000
 THROW 54711,''invalid_directory_result'',1;
 IF (SELECT COUNT(*) FROM OPENJSON(@json))<>5
 OR EXISTS(SELECT 1 FROM OPENJSON(@json) WHERE [key] COLLATE Latin1_General_100_BIN2 NOT IN(N''intentId'',N''attemptToken'',N''outcome'',N''journalDigest'',N''observations''))
 OR EXISTS(SELECT [key] COLLATE Latin1_General_100_BIN2 FROM OPENJSON(@json) GROUP BY [key] COLLATE Latin1_General_100_BIN2 HAVING COUNT(*)<>1)
 OR EXISTS(SELECT 1 FROM OPENJSON(@json) WHERE ([key] COLLATE Latin1_General_100_BIN2 IN(N''intentId'',N''attemptToken'',N''outcome'') AND [type]<>1)
 OR ([key] COLLATE Latin1_General_100_BIN2=N''observations'' AND [type]<>4))
 THROW 54711,''invalid_directory_result'',1;
 DECLARE @it nvarchar(max)=JSON_VALUE(@json,''$.intentId''),@token nvarchar(max)=JSON_VALUE(@json,''$.attemptToken''),
 @outcome nvarchar(max)=JSON_VALUE(@json,''$.outcome''),@digest nvarchar(max)=JSON_VALUE(@json,''$.journalDigest''),@obs nvarchar(max)=JSON_QUERY(@json,''$.observations'');
 DECLARE @intent uniqueidentifier=TRY_CONVERT(uniqueidentifier,@it),@hash binary(32),@count tinyint;
 IF @intent IS NULL OR DATALENGTH(@it)<>72 OR @it COLLATE Latin1_General_100_BIN2<>LOWER(CONVERT(nvarchar(36),@intent)) COLLATE Latin1_General_100_BIN2
 OR @token IS NULL OR DATALENGTH(@token)<>128 OR @token COLLATE Latin1_General_100_BIN2 LIKE N''%[^0-9a-f]%''
 OR @outcome IS NULL OR @outcome COLLATE Latin1_General_100_BIN2 NOT IN(N''observed_created'',N''uncertain'')
 OR DATALENGTH(@outcome)<>CASE WHEN @outcome COLLATE Latin1_General_100_BIN2=N''uncertain'' THEN 18 ELSE 32 END
 THROW 54711,''invalid_directory_result'',1;
 SET @hash=HASHBYTES(''SHA2_256'',CONVERT(varbinary(32),@token,2));
 IF @outcome COLLATE Latin1_General_100_BIN2=N''uncertain''
 BEGIN
 IF EXISTS(SELECT 1 FROM OPENJSON(@json) WHERE [key] COLLATE Latin1_General_100_BIN2=N''journalDigest'' AND [type]<>0)
 OR (SELECT COUNT(*) FROM OPENJSON(@obs))<>0
 THROW 54711,''invalid_directory_result'',1;
 SET @count=0;
 END
 ELSE
 BEGIN
 IF EXISTS(SELECT 1 FROM OPENJSON(@json) WHERE [key] COLLATE Latin1_General_100_BIN2=N''journalDigest'' AND [type]<>1)
 OR @digest IS NULL OR DATALENGTH(@digest)<>128 OR @digest COLLATE Latin1_General_100_BIN2 LIKE N''%[^0-9a-f]%''
 OR (SELECT COUNT(*) FROM OPENJSON(@obs))<>8 OR EXISTS(SELECT 1 FROM OPENJSON(@obs) WHERE [type]<>5)
 THROW 54711,''invalid_directory_result'',1;
 SET @count=8;
 END;
 BEGIN TRY BEGIN TRANSACTION;
 DECLARE @job uniqueidentifier,@trial uniqueidentifier,@attempt uniqueidentifier,@prior uniqueidentifier,@gen int,@rev int,@uid int,@gid int,@deadline datetime2(3);
 SELECT @job=i.job_id,@trial=j.trial_id,@attempt=da.attempt_id,@prior=da.prior_os_intent_id,@gen=da.generation,@rev=da.job_revision,@uid=da.observed_uid,@gid=da.observed_gid
 FROM platform.directory_attempts da WITH(UPDLOCK,HOLDLOCK)
 JOIN platform.provision_step_intents i WITH(HOLDLOCK) ON i.intent_id=da.intent_id AND i.step_name=''tenant_directories'' AND i.generation=da.generation AND i.job_revision=da.job_revision
 JOIN platform.provision_jobs j WITH(HOLDLOCK) ON j.job_id=i.job_id
 JOIN platform.provision_step_intents oldi WITH(HOLDLOCK) ON oldi.intent_id=da.prior_os_intent_id AND oldi.job_id=i.job_id AND oldi.step_name=''os_identity'' AND oldi.generation<da.generation
 JOIN platform.os_identity_results r WITH(HOLDLOCK) ON r.intent_id=oldi.intent_id AND r.outcome=''observed_created'' AND r.observed_uid=da.observed_uid AND r.observed_gid=da.observed_gid
 WHERE da.intent_id=@intent AND da.attempt_hash=@hash AND da.state=''prepared'';
 IF @job IS NULL THROW 54712,''directory_result_binding_denied'',1;
 IF EXISTS(SELECT 1 FROM platform.directory_results WITH(UPDLOCK,HOLDLOCK) WHERE intent_id=@intent)
 THROW 54713,''directory_result_exists_requires_review'',1;
 DECLARE @rows TABLE(ordinal tinyint PRIMARY KEY,uid int,gid int,mode char(4),device decimal(20,0),inode decimal(20,0));
 IF @count=8
 BEGIN
 SELECT @deadline=(SELECT MIN(v) FROM (VALUES(attempt_deadline),(lease_deadline)) limits(v))
 FROM platform.directory_live_bindings WITH(HOLDLOCK) WHERE intent_id=@intent AND attempt_hash=@hash;
 IF @deadline IS NULL OR @deadline<=SYSUTCDATETIME() THROW 54714,''directory_result_live_context_required'',1;
 DECLARE @n int=0,@item nvarchar(max),@ot nvarchar(max),@ut nvarchar(max),@gt nvarchar(max),@mt nvarchar(max),@dt nvarchar(max),@nt nvarchar(max),
 @o int,@u int,@g int,@device decimal(20,0),@inode decimal(20,0);
 WHILE @n<8
 BEGIN
 SET @item=NULL;
 SELECT @item=[value] FROM OPENJSON(@obs) WHERE [key] COLLATE Latin1_General_100_BIN2=CONVERT(nvarchar(10),@n);
 IF @item IS NULL OR (SELECT COUNT(*) FROM OPENJSON(@item))<>6
 OR EXISTS(SELECT 1 FROM OPENJSON(@item) WHERE [key] COLLATE Latin1_General_100_BIN2 NOT IN(N''ordinal'',N''uid'',N''gid'',N''mode'',N''device'',N''inode'')
 OR ([key] COLLATE Latin1_General_100_BIN2 IN(N''ordinal'',N''uid'',N''gid'') AND [type]<>2)
 OR ([key] COLLATE Latin1_General_100_BIN2 IN(N''mode'',N''device'',N''inode'') AND [type]<>1))
 OR EXISTS(SELECT [key] COLLATE Latin1_General_100_BIN2 FROM OPENJSON(@item) GROUP BY [key] COLLATE Latin1_General_100_BIN2 HAVING COUNT(*)<>1)
 THROW 54711,''invalid_directory_result'',1;
 SELECT @ot=JSON_VALUE(@item,''$.ordinal''),@ut=JSON_VALUE(@item,''$.uid''),@gt=JSON_VALUE(@item,''$.gid''),
 @mt=JSON_VALUE(@item,''$.mode''),@dt=JSON_VALUE(@item,''$.device''),@nt=JSON_VALUE(@item,''$.inode'');
 SELECT @o=TRY_CONVERT(int,@ot),@u=TRY_CONVERT(int,@ut),@g=TRY_CONVERT(int,@gt),@device=TRY_CONVERT(decimal(20,0),@dt),@inode=TRY_CONVERT(decimal(20,0),@nt);
 IF @o IS NULL OR @o<>@n OR @ot COLLATE Latin1_General_100_BIN2<>CONVERT(nvarchar(10),@o)
 OR @u IS NULL OR @ut COLLATE Latin1_General_100_BIN2<>CONVERT(nvarchar(20),@u)
 OR @g IS NULL OR @gt COLLATE Latin1_General_100_BIN2<>CONVERT(nvarchar(20),@g)
 OR @u<>CASE WHEN @n IN(0,1,3) THEN 0 ELSE @uid END OR @g<>CASE WHEN @n IN(0,1) THEN 0 ELSE @gid END
 OR @mt IS NULL OR DATALENGTH(@mt)<>8 OR @mt COLLATE Latin1_General_100_BIN2<>CASE WHEN @n IN(0,1) THEN N''0711'' WHEN @n=3 THEN N''0750'' ELSE N''0700'' END
 OR @device IS NULL OR @device<0 OR @device>18446744073709551615 OR @dt IS NULL OR DATALENGTH(@dt)<>DATALENGTH(CONVERT(nvarchar(20),@device)) OR @dt COLLATE Latin1_General_100_BIN2<>CONVERT(nvarchar(20),@device)
 OR @inode IS NULL OR @inode<1 OR @inode>18446744073709551615 OR @nt IS NULL OR DATALENGTH(@nt)<>DATALENGTH(CONVERT(nvarchar(20),@inode)) OR @nt COLLATE Latin1_General_100_BIN2<>CONVERT(nvarchar(20),@inode)
 THROW 54711,''invalid_directory_result'',1;
 INSERT @rows VALUES(@o,@u,@g,CONVERT(char(4),@mt),@device,@inode);
 SET @n=@n+1;
 END;
 IF EXISTS(SELECT device,inode FROM @rows GROUP BY device,inode HAVING COUNT(*)<>1)
 THROW 54711,''invalid_directory_result'',1;
 END;
 INSERT platform.directory_results(intent_id,outcome,journal_digest,confirmed_count,executor_name,sql_actor,recorded_at)
 VALUES(@intent,CONVERT(varchar(24),@outcome),CASE WHEN @count=8 THEN CONVERT(binary(32),@digest,2) ELSE NULL END,@count,USER_NAME(),ORIGINAL_LOGIN(),SYSUTCDATETIME());
 INSERT platform.directory_observations(intent_id,ordinal,observed_uid,observed_gid,mode,device,inode)
 SELECT @intent,ordinal,uid,gid,mode,device,inode FROM @rows;
 INSERT platform.directory_result_events(intent_id,action,sql_actor,created_at) VALUES(@intent,''directories.result_recorded'',ORIGINAL_LOGIN(),SYSUTCDATETIME());
 COMMIT;
 SELECT LOWER(CONVERT(char(36),@job)) jobId,LOWER(CONVERT(char(36),@trial)) trialId,LOWER(CONVERT(char(36),@intent)) intentId,
 LOWER(CONVERT(char(36),@prior)) priorOsIntentId,LOWER(CONVERT(char(36),@attempt)) attemptId,@gen generation,@rev jobRevision,
 @outcome outcome,@count confirmedCount,@digest journalDigest,CAST(0 AS bit) executionAllowed,CAST(1 AS bit) reconciliationRequired
 FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES;
 END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
 END;');
 INSERT platform.schema_migrations(migration_id) VALUES('021_tenant_directory_results_v1');
 COMMIT;SELECT N'DIRECTORY_RESULTS_APPLIED';
END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
