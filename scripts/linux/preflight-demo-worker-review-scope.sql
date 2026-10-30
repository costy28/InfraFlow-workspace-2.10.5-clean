-- Read-only preflight. Requires explicit administrator context for complete metadata.
SET NOCOUNT ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM' OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1
 THROW 53601,'admin_platform_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='012_adapter_review_tickets_v1')
 OR SUSER_ID(N'infraflow_demo_lease') IS NULL OR USER_ID(N'infraflow_demo_lease') IS NULL
 THROW 53602,'worker_review_baseline_required',1;
IF EXISTS(SELECT 1 FROM platform.provision_jobs WHERE state='leased')
 THROW 53605,'worker_not_idle_stop_no_changes',1;
EXECUTE AS USER=N'infraflow_demo_lease';
SELECT
 COALESCE(HAS_PERMS_BY_NAME('platform.provision_lease_command','OBJECT','EXECUTE'),0) AS lease_rpc,
 COALESCE(HAS_PERMS_BY_NAME('platform.record_step_intent','OBJECT','EXECUTE'),0) AS jurnal_rpc,
 COALESCE(HAS_PERMS_BY_NAME('platform.adapter_review_ticket_command','OBJECT','EXECUTE'),0) AS bilete_rpc,
 COALESCE(HAS_PERMS_BY_NAME('platform.provision_jobs','OBJECT','SELECT'),0) AS citire_directa;
REVERT;
SELECT state,job_revision,generation,execution_ready FROM platform.provision_jobs
 WHERE job_id='00f612ed-a8ac-4688-a26f-679760eee0be';
SELECT N'WORKER_REVIEW_PREFLIGHT_READ_ONLY' AS rezultat;
