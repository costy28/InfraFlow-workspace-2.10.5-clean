SET NOCOUNT ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM' OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1
 THROW 55001,'admin_platform_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.provision_jobs j JOIN platform.trials t ON t.trial_id=j.trial_id
 WHERE j.job_id='00f612ed-a8ac-4688-a26f-679760eee0be' AND j.trial_id='b1100b43-48d0-42fa-8a1d-73b1286f8242'
 AND j.state='queued' AND j.job_revision=9 AND j.generation=4 AND j.execution_ready=0
 AND j.lease_owner IS NULL AND j.lease_hash IS NULL AND j.lease_expires_at IS NULL
 AND j.trial_revision=1 AND t.revision=1 AND t.state='queued' AND t.activated_at IS NULL AND t.expires_at IS NULL)
 THROW 55011,'directory_cycle_job_requires_review',1;
IF (SELECT COUNT(*) FROM platform.directory_attempts)<>1
 OR (SELECT COUNT(*) FROM platform.directory_attempt_events)<>1
 OR EXISTS(SELECT 1 FROM platform.directory_results)
 OR EXISTS(SELECT 1 FROM platform.directory_observations)
 OR EXISTS(SELECT 1 FROM platform.directory_result_events)
 OR (SELECT COUNT(*) FROM platform.provision_step_intents WHERE job_id='00f612ed-a8ac-4688-a26f-679760eee0be' AND step_name='tenant_directories')<>1
 THROW 55012,'directory_cycle_counts_require_review',1;
IF NOT EXISTS(SELECT 1 FROM platform.directory_attempts a
 JOIN platform.provision_step_intents i ON i.intent_id=a.intent_id
 JOIN platform.directory_attempt_events e ON e.intent_id=a.intent_id
 WHERE i.job_id='00f612ed-a8ac-4688-a26f-679760eee0be' AND i.step_name='tenant_directories'
 AND i.generation=4 AND i.job_revision=8 AND a.generation=4 AND a.job_revision=8
 AND a.prior_os_intent_id='40f385e6-c722-429a-a8fe-46c6119c4834'
 AND a.observed_uid=992 AND a.observed_gid=983 AND a.state='prepared'
 AND a.owner_name COLLATE Latin1_General_100_BIN2=N'infraflow_demo_lease'
 AND a.sql_actor COLLATE Latin1_General_100_BIN2=N'infraflow_demo_lease'
 AND e.action='directories.prepared' AND e.sql_actor COLLATE Latin1_General_100_BIN2=N'infraflow_demo_lease'
 AND a.storage_key COLLATE Latin1_General_100_BIN2='/var/lib/infraflow-demo-tenants/b1100b43-48d0-42fa-8a1d-73b1286f8242'
 AND a.config_key COLLATE Latin1_General_100_BIN2='/etc/infraflow-demo-tenants/b1100b43-48d0-42fa-8a1d-73b1286f8242')
 THROW 55013,'directory_cycle_binding_requires_review',1;
SELECT state,job_revision,generation,execution_ready FROM platform.provision_jobs WHERE job_id='00f612ed-a8ac-4688-a26f-679760eee0be';
SELECT a.intent_id,a.attempt_id,a.generation,a.job_revision,a.state,a.observed_uid,a.observed_gid FROM platform.directory_attempts a;
SELECT N'DIRECTORY_FIRST_SQL_CYCLE_VERIFIED_NO_OS_EFFECT' AS rezultat;
