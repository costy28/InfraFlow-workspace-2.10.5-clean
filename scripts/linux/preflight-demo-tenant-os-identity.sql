-- Read-only pilot binding. No lease acquisition or execution authority.
SET NOCOUNT ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM'
 THROW 53801,'platform_database_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.provision_jobs j JOIN platform.trials t ON t.trial_id=j.trial_id
 JOIN platform.resource_reservations r ON r.job_id=j.job_id AND r.trial_id=j.trial_id AND r.resource_type='os_identity'
 WHERE j.job_id='00f612ed-a8ac-4688-a26f-679760eee0be' AND j.trial_id='b1100b43-48d0-42fa-8a1d-73b1286f8242'
 AND j.state='queued' AND j.job_revision=5 AND j.generation=2 AND j.execution_ready=0
 AND j.lease_owner IS NULL AND j.lease_hash IS NULL AND j.lease_expires_at IS NULL
 AND j.trial_revision=1 AND t.revision=1 AND t.state='queued' AND t.activated_at IS NULL AND t.expires_at IS NULL
 AND r.resource_key='ift_b1100b4348d042fa8a1d73b1286f'
 AND JSON_VALUE(j.resource_manifest,'$.osIdentity') COLLATE Latin1_General_100_BIN2=r.resource_key COLLATE Latin1_General_100_BIN2)
 THROW 53802,'pilot_identity_binding_requires_review',1;
IF EXISTS(SELECT 1 FROM platform.provision_step_intents WHERE job_id='00f612ed-a8ac-4688-a26f-679760eee0be' AND step_name='os_identity')
 THROW 53803,'os_identity_intent_already_exists_requires_review',1;
SELECT N'TENANT_OS_SQL_BINDING_OK' AS rezultat;
SELECT resource_key AS identitate_os FROM platform.resource_reservations
 WHERE job_id='00f612ed-a8ac-4688-a26f-679760eee0be' AND resource_type='os_identity';
