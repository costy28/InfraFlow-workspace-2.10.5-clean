-- Adapter review projection only. No effect authority or grants.
SET NOCOUNT ON;SET XACT_ABORT ON;SET ANSI_NULLS ON;SET QUOTED_IDENTIFIER ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM'
 THROW 53101,'platform_database_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='010_provision_step_journal_v1')
 THROW 53102,'step_journal_required',1;
BEGIN TRY
 BEGIN TRANSACTION;
 DECLARE @lock int;
 EXEC @lock=sys.sp_getapplock @Resource=N'infraflow-platform-migrations',@LockMode=N'Exclusive',@LockOwner=N'Transaction',@LockTimeout=5000;
 IF @lock<0 THROW 53103,'platform_migration_busy',1;
 IF EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='011_adapter_resource_review_v1')
 BEGIN COMMIT;SELECT N'ADAPTER_REVIEW_ALREADY_APPLIED';RETURN;END;
 IF OBJECT_ID(N'platform.read_adapter_resource_review') IS NOT NULL
  THROW 53104,'adapter_review_partial_state_requires_review',1;
 EXEC(N'CREATE PROCEDURE platform.read_adapter_resource_review @json nvarchar(max) AS
 BEGIN
 SET NOCOUNT ON;SET XACT_ABORT ON;
 IF @json IS NULL OR ISJSON(@json)<>1 OR LEFT(LTRIM(@json),1)<>N''{'' OR DATALENGTH(@json)>512
  THROW 53110,''invalid_adapter_review'',1;
 IF (SELECT COUNT(*) FROM OPENJSON(@json))<>1 OR EXISTS(SELECT 1 FROM OPENJSON(@json)
  WHERE [key] COLLATE Latin1_General_100_BIN2<>N''jobId'' OR [type]<>1)
  THROW 53110,''invalid_adapter_review'',1;
 DECLARE @text nvarchar(max)=JSON_VALUE(@json,''$.jobId''),@id uniqueidentifier;
 SET @id=TRY_CONVERT(uniqueidentifier,@text);
 IF @id IS NULL OR DATALENGTH(@text)<>72 OR @text COLLATE Latin1_General_100_BIN2<>LOWER(CONVERT(nvarchar(36),@id)) COLLATE Latin1_General_100_BIN2
  THROW 53110,''invalid_adapter_review'',1;
 BEGIN TRY BEGIN TRANSACTION;
 DECLARE @snapshot nvarchar(max);
 -- Consistent short review, never an external-effect fence. No secret hash/token projection.
 SELECT @snapshot=(SELECT LOWER(CONVERT(char(36),j.job_id)) jobId,LOWER(CONVERT(char(36),j.trial_id)) trialId,
  j.job_revision jobRevision,j.generation,t.revision trialRevision,j.state,t.state trialState,
  j.execution_ready executionReady,CAST(CASE WHEN j.lease_owner IS NULL AND j.lease_hash IS NULL AND j.lease_expires_at IS NULL THEN 1 ELSE 0 END AS bit) leaseAbsent,
  t.activated_at activatedAt,t.expires_at expiresAt,JSON_QUERY(j.resource_manifest) manifest,
  JSON_QUERY((SELECT r.resource_type resourceType,r.resource_key resourceKey,
   LOWER(CONVERT(char(36),r.job_id)) jobId,LOWER(CONVERT(char(36),r.trial_id)) trialId
   FROM platform.resource_reservations r WITH(HOLDLOCK) WHERE r.job_id=j.job_id ORDER BY r.resource_type FOR JSON PATH)) reservations
  FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES)
 FROM platform.provision_jobs j WITH(HOLDLOCK) JOIN platform.trials t WITH(HOLDLOCK) ON t.trial_id=j.trial_id
 WHERE j.job_id=@id AND t.revision=j.trial_revision AND j.state=''queued'' AND t.state=''queued''
  AND j.execution_ready=0 AND t.activated_at IS NULL AND t.expires_at IS NULL;
 IF @snapshot IS NULL THROW 53111,''adapter_review_unavailable'',1;
 COMMIT;SELECT @snapshot;
 END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
 END;');
 INSERT platform.schema_migrations(migration_id) VALUES('011_adapter_resource_review_v1');
 COMMIT;SELECT N'ADAPTER_REVIEW_APPLIED';
END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
