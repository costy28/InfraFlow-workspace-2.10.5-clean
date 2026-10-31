SET NOCOUNT ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM' OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1
 THROW 54401,'admin_platform_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='018_tenant_directory_evidence_v1')
 OR (SELECT COUNT(*) FROM sys.tables WHERE schema_id=SCHEMA_ID('platform') AND name IN('directory_attempts','directory_attempt_events','directory_results','directory_observations','directory_result_events'))<>5
 THROW 54405,'directory_schema_requires_review',1;
IF EXISTS(SELECT 1 FROM platform.directory_attempts) OR EXISTS(SELECT 1 FROM platform.directory_attempt_events)
 OR EXISTS(SELECT 1 FROM platform.directory_results) OR EXISTS(SELECT 1 FROM platform.directory_observations)
 OR EXISTS(SELECT 1 FROM platform.directory_result_events)
 THROW 54407,'directory_evidence_not_empty_requires_review',1;
IF EXISTS(SELECT 1 FROM sys.database_permissions p JOIN sys.objects o ON o.object_id=p.major_id
 WHERE o.schema_id=SCHEMA_ID('platform') AND o.name IN('directory_attempts','directory_attempt_events','directory_results','directory_observations','directory_result_events') AND p.state IN('G','W'))
 THROW 54408,'unexpected_directory_grant',1;
IF NOT EXISTS(SELECT 1 FROM platform.provision_jobs j JOIN platform.trials t ON t.trial_id=j.trial_id
 WHERE j.job_id='00f612ed-a8ac-4688-a26f-679760eee0be' AND j.state='queued' AND j.job_revision=7 AND j.generation=3 AND j.execution_ready=0
 AND j.lease_owner IS NULL AND j.lease_hash IS NULL AND j.lease_expires_at IS NULL
 AND t.state='queued' AND t.activated_at IS NULL AND t.expires_at IS NULL)
 THROW 54406,'directory_job_changed_requires_review',1;
SELECT migration_id FROM platform.schema_migrations WHERE migration_id='018_tenant_directory_evidence_v1';
SELECT (SELECT COUNT(*) FROM platform.directory_attempts) AS incercari,(SELECT COUNT(*) FROM platform.directory_results) AS rezultate,(SELECT COUNT(*) FROM platform.directory_observations) AS observatii;
SELECT state,job_revision,generation,execution_ready FROM platform.provision_jobs WHERE job_id='00f612ed-a8ac-4688-a26f-679760eee0be';
SELECT N'DIRECTORY_EVIDENCE_SCHEMA_VERIFIED_NO_SCOPE_CHANGE' AS rezultat;
