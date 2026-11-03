SET NOCOUNT ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM' OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1
 THROW 55001,'admin_platform_required',1;
IF (SELECT COUNT(*) FROM platform.schema_migrations WHERE migration_id IN('019_prepare_tenant_directories_v1','020_tenant_directory_context_v1','021_tenant_directory_results_v1'))<>3
 OR OBJECT_ID(N'platform.prepare_tenant_directories',N'P') IS NULL
 OR OBJECT_ID(N'platform.verify_tenant_directory_context',N'P') IS NULL
 OR OBJECT_ID(N'platform.record_tenant_directory_result',N'P') IS NULL
 THROW 55002,'directory_cycle_schema_requires_review',1;
IF EXISTS(SELECT 1 FROM platform.provision_jobs WHERE state='leased')
 OR EXISTS(SELECT 1 FROM platform.directory_attempts) OR EXISTS(SELECT 1 FROM platform.directory_attempt_events)
 OR EXISTS(SELECT 1 FROM platform.directory_results) OR EXISTS(SELECT 1 FROM platform.directory_observations) OR EXISTS(SELECT 1 FROM platform.directory_result_events)
 OR EXISTS(SELECT 1 FROM platform.provision_step_intents WHERE job_id='00f612ed-a8ac-4688-a26f-679760eee0be' AND step_name='tenant_directories')
 THROW 55004,'directory_cycle_state_requires_review',1;
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
 AND a.executor_name COLLATE Latin1_General_100_BIN2=r.executor_name COLLATE Latin1_General_100_BIN2
 AND d.job_revision=6 AND d.resource_key COLLATE Latin1_General_100_BIN2='ift_b1100b4348d042fa8a1d73b1286f')
 THROW 55006,'directory_cycle_prior_os_requires_review',1;
SELECT N'DIRECTORY_CYCLE_FINAL_SQL_PREFLIGHT_OK' AS rezultat;
SELECT state,job_revision,generation,execution_ready FROM platform.provision_jobs WHERE job_id='00f612ed-a8ac-4688-a26f-679760eee0be';
