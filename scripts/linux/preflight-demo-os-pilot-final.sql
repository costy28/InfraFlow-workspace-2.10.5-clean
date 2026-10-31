-- Read-only CAS snapshot. Success is not execution authority.
SET NOCOUNT ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM'
 OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1
 THROW 54301,'admin_platform_required',1;
IF (SELECT COUNT(*) FROM platform.schema_migrations WHERE migration_id IN
 ('014_os_identity_delegations_v1','015_os_identity_acceptance_v1','016_os_identity_results_v1','017_os_identity_execution_context_v1'))<>4
 THROW 54302,'os_schema_requires_review',1;
IF EXISTS(SELECT 1 FROM platform.provision_jobs WHERE state='leased')
 OR EXISTS(SELECT 1 FROM platform.os_identity_delegations)
 OR EXISTS(SELECT 1 FROM platform.os_identity_acceptances)
 OR EXISTS(SELECT 1 FROM platform.os_identity_results)
 THROW 54303,'os_state_requires_review',1;
IF NOT EXISTS(SELECT 1 FROM platform.provision_jobs j JOIN platform.trials t ON t.trial_id=j.trial_id
 JOIN platform.resource_reservations r ON r.job_id=j.job_id AND r.trial_id=j.trial_id AND r.resource_type='os_identity'
 WHERE j.job_id='00f612ed-a8ac-4688-a26f-679760eee0be' AND j.trial_id='b1100b43-48d0-42fa-8a1d-73b1286f8242'
 AND j.state='queued' AND j.job_revision=5 AND j.generation=2 AND j.execution_ready=0
 AND j.lease_owner IS NULL AND j.lease_hash IS NULL AND j.lease_expires_at IS NULL
 AND j.trial_revision=1 AND t.revision=1 AND t.state='queued' AND t.activated_at IS NULL AND t.expires_at IS NULL
 AND DATALENGTH(r.resource_key)=32
 AND r.resource_key COLLATE Latin1_General_100_BIN2='ift_b1100b4348d042fa8a1d73b1286f'
 AND JSON_VALUE(j.resource_manifest,'$.osIdentity') COLLATE Latin1_General_100_BIN2=r.resource_key COLLATE Latin1_General_100_BIN2)
 THROW 54304,'pilot_binding_requires_review',1;
IF EXISTS(SELECT 1 FROM platform.provision_step_intents WHERE job_id='00f612ed-a8ac-4688-a26f-679760eee0be' AND step_name='os_identity')
 THROW 54305,'os_intent_requires_review',1;
SELECT state,job_revision,generation,execution_ready FROM platform.provision_jobs WHERE job_id='00f612ed-a8ac-4688-a26f-679760eee0be';
SELECT N'OS_PILOT_FINAL_SQL_PREFLIGHT_OK' AS rezultat;
