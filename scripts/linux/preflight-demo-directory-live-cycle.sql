-- Read-only gate for a NEW attempt. Does not resume the released generation 4.
SET NOCOUNT ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM' OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1
 THROW 55101,'admin_platform_required',1;
IF (SELECT COUNT(*) FROM platform.schema_migrations WHERE migration_id IN
 ('019_prepare_tenant_directories_v1','020_tenant_directory_context_v1','021_tenant_directory_results_v1'))<>3
 THROW 55102,'directory_schema_requires_review',1;
IF EXISTS(SELECT 1 FROM platform.provision_jobs WHERE state='leased')
 OR EXISTS(SELECT 1 FROM platform.directory_results)
 OR EXISTS(SELECT 1 FROM platform.directory_observations)
 OR EXISTS(SELECT 1 FROM platform.directory_result_events)
 OR (SELECT COUNT(*) FROM platform.directory_attempts)<>1
 OR (SELECT COUNT(*) FROM platform.directory_attempt_events)<>1
 THROW 55103,'directory_counts_require_review',1;
IF NOT EXISTS(SELECT 1 FROM platform.provision_jobs j JOIN platform.trials t ON t.trial_id=j.trial_id
 WHERE j.job_id='00f612ed-a8ac-4688-a26f-679760eee0be'
 AND j.trial_id='b1100b43-48d0-42fa-8a1d-73b1286f8242'
 AND j.state='queued' AND j.job_revision=9 AND j.generation=4 AND j.execution_ready=0
 AND j.lease_owner IS NULL AND j.lease_hash IS NULL AND j.lease_expires_at IS NULL
 AND j.trial_revision=1 AND t.revision=1 AND t.state='queued' AND t.activated_at IS NULL AND t.expires_at IS NULL)
 THROW 55104,'current_job_requires_review',1;
IF NOT EXISTS(SELECT 1 FROM platform.directory_attempts a
 JOIN platform.provision_step_intents i ON i.intent_id=a.intent_id
 JOIN platform.directory_attempt_events e ON e.intent_id=a.intent_id
 WHERE a.intent_id='4754bdb4-d245-4315-8f65-956e84eba68c'
 AND a.attempt_id='6e108f09-fb63-46f0-8ec8-151dd4db1dd5'
 AND a.prior_os_intent_id='40f385e6-c722-429a-a8fe-46c6119c4834'
 AND i.job_id='00f612ed-a8ac-4688-a26f-679760eee0be' AND i.step_name='tenant_directories'
 AND i.generation=4 AND i.job_revision=8 AND a.generation=4 AND a.job_revision=8
 AND a.observed_uid=992 AND a.observed_gid=983 AND a.state='prepared'
 AND a.deadline<SYSUTCDATETIME()
 AND a.owner_name COLLATE Latin1_General_100_BIN2=N'infraflow_demo_lease'
 AND a.sql_actor COLLATE Latin1_General_100_BIN2=N'infraflow_demo_lease'
 AND e.action='directories.prepared' AND e.sql_actor COLLATE Latin1_General_100_BIN2=N'infraflow_demo_lease'
 AND a.storage_key COLLATE Latin1_General_100_BIN2='/var/lib/infraflow-demo-tenants/b1100b43-48d0-42fa-8a1d-73b1286f8242'
 AND a.config_key COLLATE Latin1_General_100_BIN2='/etc/infraflow-demo-tenants/b1100b43-48d0-42fa-8a1d-73b1286f8242')
 THROW 55105,'released_attempt_requires_review',1;
IF (SELECT COUNT(*) FROM platform.provision_step_intents WHERE job_id='00f612ed-a8ac-4688-a26f-679760eee0be' AND step_name='tenant_directories')<>1
 THROW 55106,'directory_intents_require_review',1;
IF NOT EXISTS(SELECT 1 FROM platform.os_identity_results r
 JOIN platform.provision_step_intents i ON i.intent_id=r.intent_id
 WHERE r.intent_id='40f385e6-c722-429a-a8fe-46c6119c4834'
 AND i.job_id='00f612ed-a8ac-4688-a26f-679760eee0be' AND i.step_name='os_identity'
 AND i.generation=3 AND i.job_revision=6
 AND r.outcome='observed_created' AND r.observed_uid=992 AND r.observed_gid=983
 AND r.executor_name COLLATE Latin1_General_100_BIN2=N'infraflow_demo_os_executor')
 THROW 55107,'prior_os_requires_review',1;
SELECT state,job_revision,generation,execution_ready FROM platform.provision_jobs
 WHERE job_id='00f612ed-a8ac-4688-a26f-679760eee0be';
SELECT (SELECT COUNT(*) FROM platform.directory_attempts) AS incercari,
 (SELECT COUNT(*) FROM platform.directory_results) AS rezultate,
 (SELECT COUNT(*) FROM platform.directory_observations) AS observatii;
SELECT N'DIRECTORY_NEW_ATTEMPT_BASELINE_OK' AS rezultat;
-- No token/hash/password is selected. This gate grants no execution authority.
