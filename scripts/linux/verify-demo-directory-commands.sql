SET NOCOUNT ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM' OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1
 THROW 54501,'admin_platform_required',1;
IF (SELECT COUNT(*) FROM platform.schema_migrations WHERE migration_id IN('019_prepare_tenant_directories_v1','020_tenant_directory_context_v1','021_tenant_directory_results_v1'))<>3
 OR OBJECT_ID(N'platform.prepare_tenant_directories',N'P') IS NULL
 OR OBJECT_ID(N'platform.directory_live_bindings',N'V') IS NULL
 OR OBJECT_ID(N'platform.verify_tenant_directory_context',N'P') IS NULL
 OR OBJECT_ID(N'platform.record_tenant_directory_result',N'P') IS NULL
 THROW 54505,'directory_commands_schema_requires_review',1;
IF EXISTS(SELECT 1 FROM platform.directory_attempts) OR EXISTS(SELECT 1 FROM platform.directory_attempt_events)
 OR EXISTS(SELECT 1 FROM platform.directory_results) OR EXISTS(SELECT 1 FROM platform.directory_observations) OR EXISTS(SELECT 1 FROM platform.directory_result_events)
 THROW 54504,'directory_commands_not_empty_requires_review',1;
IF EXISTS(SELECT 1 FROM sys.database_permissions p JOIN sys.objects o ON o.object_id=p.major_id
 WHERE o.schema_id=SCHEMA_ID('platform') AND o.name IN('prepare_tenant_directories','directory_live_bindings','verify_tenant_directory_context','record_tenant_directory_result') AND p.state IN('G','W'))
 THROW 54507,'directory_commands_unexpected_grant',1;
IF NOT EXISTS(SELECT 1 FROM platform.provision_jobs j JOIN platform.trials t ON t.trial_id=j.trial_id
 WHERE j.job_id='00f612ed-a8ac-4688-a26f-679760eee0be' AND j.state='queued' AND j.job_revision=7 AND j.generation=3 AND j.execution_ready=0
 AND j.lease_owner IS NULL AND j.lease_hash IS NULL AND j.lease_expires_at IS NULL
 AND t.state='queued' AND t.activated_at IS NULL AND t.expires_at IS NULL)
 THROW 54506,'directory_commands_job_changed_requires_review',1;
SELECT migration_id FROM platform.schema_migrations WHERE migration_id IN('019_prepare_tenant_directories_v1','020_tenant_directory_context_v1','021_tenant_directory_results_v1') ORDER BY migration_id;
SELECT (SELECT COUNT(*) FROM platform.directory_attempts) AS incercari,(SELECT COUNT(*) FROM platform.directory_results) AS rezultate,(SELECT COUNT(*) FROM platform.directory_observations) AS observatii;
SELECT state,job_revision,generation,execution_ready FROM platform.provision_jobs WHERE job_id='00f612ed-a8ac-4688-a26f-679760eee0be';
SELECT N'DIRECTORY_COMMANDS_VERIFIED_NO_SCOPE_CHANGE' AS rezultat;
