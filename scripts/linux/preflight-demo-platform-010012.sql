-- Read-only pilot preflight. No grants, migration, job command or credential read.
SET NOCOUNT ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM'
 OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1
 THROW 53301,'admin_platform_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='009_operator_prepare_change_v1')
 THROW 53302,'baseline_009_required',1;
IF EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id IN(
 '010_provision_step_journal_v1','011_adapter_resource_review_v1','012_adapter_review_tickets_v1'))
 OR OBJECT_ID(N'platform.provision_step_intents') IS NOT NULL
 OR OBJECT_ID(N'platform.record_step_intent') IS NOT NULL
 OR OBJECT_ID(N'platform.read_adapter_resource_review') IS NOT NULL
 OR OBJECT_ID(N'platform.adapter_review_tickets') IS NOT NULL
 OR OBJECT_ID(N'platform.adapter_review_ticket_command') IS NOT NULL
 THROW 53303,'new_schema_exists_requires_review_no_retry',1;
DECLARE @job uniqueidentifier='00f612ed-a8ac-4688-a26f-679760eee0be',
 @trial uniqueidentifier='b1100b43-48d0-42fa-8a1d-73b1286f8242';
IF NOT EXISTS(SELECT 1 FROM platform.provision_jobs j JOIN platform.trials t ON t.trial_id=j.trial_id
 WHERE j.job_id=@job AND j.trial_id=@trial AND j.state='queued' AND j.job_revision=3 AND j.generation=1
  AND j.execution_ready=0 AND j.lease_owner IS NULL AND j.lease_hash IS NULL AND j.lease_expires_at IS NULL
  AND j.trial_revision=1 AND t.revision=1 AND t.state='queued' AND t.activated_at IS NULL AND t.expires_at IS NULL)
 THROW 53304,'pilot_snapshot_changed_requires_review',1;
IF (SELECT COUNT(*) FROM platform.resource_reservations WHERE job_id=@job AND trial_id=@trial)<>7
 OR (SELECT COUNT(*) FROM platform.provision_request_audit WHERE job_id=@job AND trial_id=@trial)<>1
 THROW 53305,'pilot_reservations_or_audit_changed',1;
SELECT N'PRE010012_PREFLIGHT_OK' AS rezultat;
SELECT state,job_revision,generation,execution_ready FROM platform.provision_jobs WHERE job_id=@job;
SELECT migration_id FROM platform.schema_migrations ORDER BY migration_id;
