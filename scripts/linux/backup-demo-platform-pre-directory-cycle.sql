SET NOCOUNT ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM' OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1
 THROW 55001,'admin_platform_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='021_tenant_directory_results_v1')
 OR EXISTS(SELECT 1 FROM platform.provision_jobs WHERE state='leased')
 OR EXISTS(SELECT 1 FROM platform.directory_attempts)
 OR EXISTS(SELECT 1 FROM platform.directory_attempt_events)
 OR EXISTS(SELECT 1 FROM platform.directory_results)
 OR EXISTS(SELECT 1 FROM platform.directory_observations)
 OR EXISTS(SELECT 1 FROM platform.directory_result_events)
 OR NOT EXISTS(SELECT 1 FROM platform.provision_jobs j JOIN platform.trials t ON t.trial_id=j.trial_id
 WHERE j.job_id='00f612ed-a8ac-4688-a26f-679760eee0be' AND j.state='queued' AND j.job_revision=7 AND j.generation=3 AND j.execution_ready=0
 AND j.lease_owner IS NULL AND j.lease_hash IS NULL AND j.lease_expires_at IS NULL
 AND t.state='queued' AND t.activated_at IS NULL AND t.expires_at IS NULL)
 THROW 55004,'directory_cycle_backup_baseline_requires_review',1;
DECLARE @file nvarchar(260)=N'/var/opt/mssql/data/INFRAFLOW_DEMO_PLATFORM_pre_directory_cycle_'+REPLACE(CONVERT(nvarchar(36),NEWID()),N'-',N'')+N'.bak';
BACKUP DATABASE [INFRAFLOW_DEMO_PLATFORM] TO DISK=@file WITH COPY_ONLY,CHECKSUM;
RESTORE VERIFYONLY FROM DISK=@file WITH CHECKSUM;
SELECT @file AS backup_verificat;
SELECT N'DIRECTORY_CYCLE_BACKUP_VERIFIED' AS rezultat;
