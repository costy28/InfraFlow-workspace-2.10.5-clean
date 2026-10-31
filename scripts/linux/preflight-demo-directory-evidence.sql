-- Read-only exact post-OS baseline. No grants or filesystem effects.
SET NOCOUNT ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM' OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1
 THROW 54401,'admin_platform_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='017_os_identity_execution_context_v1')
 OR EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='018_tenant_directory_evidence_v1')
 THROW 54402,'directory_baseline_requires_review',1;
IF EXISTS(SELECT 1 FROM sys.objects WHERE schema_id=SCHEMA_ID('platform') AND name IN('directory_attempts','directory_attempt_events','directory_results','directory_observations','directory_result_events'))
 THROW 54405,'directory_partial_state_requires_review',1;
IF EXISTS(SELECT 1 FROM platform.provision_jobs WHERE state='leased')
 OR EXISTS(SELECT 1 FROM platform.provision_step_intents WHERE job_id='00f612ed-a8ac-4688-a26f-679760eee0be' AND step_name='tenant_directories')
 THROW 54404,'directory_worker_state_requires_review',1;
IF NOT EXISTS(SELECT 1 FROM platform.provision_jobs j JOIN platform.trials t ON t.trial_id=j.trial_id
 JOIN platform.provision_step_intents i ON i.job_id=j.job_id
 JOIN platform.os_identity_results r ON r.intent_id=i.intent_id
 JOIN platform.os_identity_acceptances a ON a.intent_id=i.intent_id
 JOIN platform.os_identity_delegations d ON d.intent_id=i.intent_id
 WHERE j.job_id='00f612ed-a8ac-4688-a26f-679760eee0be' AND j.trial_id='b1100b43-48d0-42fa-8a1d-73b1286f8242'
 AND j.state='queued' AND j.job_revision=7 AND j.generation=3 AND j.execution_ready=0
 AND j.lease_owner IS NULL AND j.lease_hash IS NULL AND j.lease_expires_at IS NULL
 AND t.state='queued' AND t.revision=1 AND j.trial_revision=1 AND t.activated_at IS NULL AND t.expires_at IS NULL
 AND i.intent_id='40f385e6-c722-429a-a8fe-46c6119c4834' AND i.step_name='os_identity' AND i.generation=3 AND i.job_revision=6
 AND r.outcome='observed_created' AND r.observed_uid=992 AND r.observed_gid=983
 AND r.executor_name COLLATE Latin1_General_100_BIN2=N'infraflow_demo_os_executor'
 AND d.job_revision=6 AND d.resource_key COLLATE Latin1_General_100_BIN2='ift_b1100b4348d042fa8a1d73b1286f')
 THROW 54406,'prior_os_evidence_requires_review',1;
SELECT N'DIRECTORY_EVIDENCE_PREFLIGHT_OK' AS rezultat;
SELECT state,job_revision,generation,execution_ready FROM platform.provision_jobs WHERE job_id='00f612ed-a8ac-4688-a26f-679760eee0be';
