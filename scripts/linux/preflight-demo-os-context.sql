SET NOCOUNT ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM' OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1
 THROW 54201,'admin_platform_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='016_os_identity_results_v1')
 OR EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='017_os_identity_execution_context_v1')
 OR OBJECT_ID(N'platform.verify_os_identity_execution_context') IS NOT NULL
 THROW 54202,'os_context_baseline_requires_review',1;
IF EXISTS(SELECT 1 FROM platform.provision_jobs WHERE state='leased')
 OR EXISTS(SELECT 1 FROM platform.os_identity_delegations)
 OR EXISTS(SELECT 1 FROM platform.os_identity_acceptances)
 OR EXISTS(SELECT 1 FROM platform.os_identity_results)
 THROW 54204,'os_context_not_idle',1;
IF NOT EXISTS(SELECT 1 FROM platform.provision_jobs j JOIN platform.trials t ON t.trial_id=j.trial_id
 WHERE j.job_id='00f612ed-a8ac-4688-a26f-679760eee0be' AND j.trial_id='b1100b43-48d0-42fa-8a1d-73b1286f8242'
 AND j.state='queued' AND j.job_revision=5 AND j.generation=2 AND j.execution_ready=0
 AND j.lease_owner IS NULL AND j.lease_hash IS NULL AND j.lease_expires_at IS NULL
 AND t.state='queued' AND t.revision=1 AND j.trial_revision=1 AND t.activated_at IS NULL AND t.expires_at IS NULL)
 THROW 54206,'os_context_pilot_requires_review',1;
SELECT N'OS_CONTEXT_PREFLIGHT_OK' AS rezultat;
SELECT state,job_revision,generation,execution_ready FROM platform.provision_jobs WHERE job_id='00f612ed-a8ac-4688-a26f-679760eee0be';
