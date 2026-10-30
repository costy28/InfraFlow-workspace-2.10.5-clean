-- Read-only verification after the separately authorized scope change.
SET NOCOUNT ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM' OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1
 THROW 53601,'admin_platform_required',1;
EXECUTE AS USER=N'infraflow_demo_lease';
BEGIN TRY
 IF COALESCE(HAS_PERMS_BY_NAME('platform.provision_lease_command','OBJECT','EXECUTE'),0)<>1
  OR COALESCE(HAS_PERMS_BY_NAME('platform.record_step_intent','OBJECT','EXECUTE'),0)<>1
  OR COALESCE(HAS_PERMS_BY_NAME('platform.adapter_review_ticket_command','OBJECT','EXECUTE'),0)<>1
  OR EXISTS(SELECT 1 FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id
   CROSS APPLY sys.fn_my_permissions(QUOTENAME(s.name)+'.'+QUOTENAME(o.name),'OBJECT') p
   WHERE s.name IN('platform','operator_security')
   AND p.permission_name IN('SELECT','INSERT','UPDATE','DELETE','EXECUTE','ALTER','CONTROL','TAKE OWNERSHIP','REFERENCES','VIEW DEFINITION')
   AND NOT(s.name='platform' AND o.name IN('provision_lease_command','record_step_intent','adapter_review_ticket_command') AND p.permission_name='EXECUTE'))
  THROW 53608,'worker_review_scope_not_confirmed',1;
 SELECT
  HAS_PERMS_BY_NAME('platform.provision_lease_command','OBJECT','EXECUTE') AS lease_rpc,
  HAS_PERMS_BY_NAME('platform.record_step_intent','OBJECT','EXECUTE') AS jurnal_rpc,
  HAS_PERMS_BY_NAME('platform.adapter_review_ticket_command','OBJECT','EXECUTE') AS bilete_rpc,
  COALESCE(HAS_PERMS_BY_NAME('platform.provision_jobs','OBJECT','SELECT'),0) AS citire_directa,
  COALESCE(HAS_PERMS_BY_NAME('platform.activate_trial','OBJECT','EXECUTE'),0) AS activare;
 REVERT;
END TRY BEGIN CATCH REVERT;THROW;END CATCH;
SELECT state,job_revision,generation,execution_ready FROM platform.provision_jobs
 WHERE job_id='00f612ed-a8ac-4688-a26f-679760eee0be';
SELECT (SELECT COUNT(*) FROM platform.provision_step_intents) AS intentii,
 (SELECT COUNT(*) FROM platform.adapter_review_tickets) AS bilete;
SELECT N'WORKER_REVIEW_SCOPE_VERIFIED' AS rezultat;
