-- Read-only inventory before creating the dedicated directory SQL identity.
SET NOCOUNT ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM'
 OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1
 THROW 54801,'admin_platform_required',1;
IF (SELECT COUNT(*) FROM platform.schema_migrations WHERE migration_id IN
 ('019_prepare_tenant_directories_v1','020_tenant_directory_context_v1','021_tenant_directory_results_v1'))<>3
 OR OBJECT_ID(N'platform.prepare_tenant_directories',N'P') IS NULL
 OR OBJECT_ID(N'platform.verify_tenant_directory_context',N'P') IS NULL
 OR OBJECT_ID(N'platform.record_tenant_directory_result',N'P') IS NULL
 OR OBJECT_ID(N'platform.directory_live_bindings',N'V') IS NULL
 THROW 54802,'directory_schema_required',1;
IF SUSER_ID(N'infraflow_demo_directory_executor') IS NOT NULL
 OR USER_ID(N'infraflow_demo_directory_executor') IS NOT NULL
 THROW 54803,'directory_executor_identity_exists_requires_review',1;
IF EXISTS(SELECT 1 FROM platform.provision_jobs WHERE state='leased')
 OR EXISTS(SELECT 1 FROM platform.directory_attempts)
 OR EXISTS(SELECT 1 FROM platform.directory_attempt_events)
 OR EXISTS(SELECT 1 FROM platform.directory_results)
 OR EXISTS(SELECT 1 FROM platform.directory_observations)
 OR EXISTS(SELECT 1 FROM platform.directory_result_events)
 THROW 54804,'directory_state_requires_review',1;
IF NOT EXISTS(SELECT 1 FROM platform.provision_jobs j JOIN platform.trials t ON t.trial_id=j.trial_id
 WHERE j.job_id='00f612ed-a8ac-4688-a26f-679760eee0be'
 AND j.trial_id='b1100b43-48d0-42fa-8a1d-73b1286f8242'
 AND j.state='queued' AND j.job_revision=7 AND j.generation=3 AND j.execution_ready=0
 AND j.lease_owner IS NULL AND j.lease_hash IS NULL AND j.lease_expires_at IS NULL
 AND j.trial_revision=1 AND t.revision=1 AND t.state='queued'
 AND t.activated_at IS NULL AND t.expires_at IS NULL)
 THROW 54805,'directory_job_changed_requires_review',1;
IF EXISTS(SELECT 1 FROM sys.database_permissions p JOIN sys.objects o ON o.object_id=p.major_id
 WHERE o.schema_id=SCHEMA_ID('platform')
 AND o.name IN('prepare_tenant_directories','directory_live_bindings','verify_tenant_directory_context','record_tenant_directory_result')
 AND p.state IN('G','W'))
 THROW 54806,'directory_scope_already_changed_requires_review',1;
SELECT N'LIBER' AS login_executor,N'LIBER' AS user_executor;
SELECT N'DIRECTORY_EXECUTOR_LOGIN_PREFLIGHT_OK' AS rezultat;
