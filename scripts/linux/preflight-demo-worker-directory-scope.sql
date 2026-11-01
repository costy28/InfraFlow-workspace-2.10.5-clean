-- Explicit one-time transition: one additional worker RPC, no job/OS/password change.
SET NOCOUNT ON;SET XACT_ABORT ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM' OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1
 THROW 54901,'admin_platform_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='021_tenant_directory_results_v1')
 OR OBJECT_ID(N'platform.prepare_os_identity_delegation',N'P') IS NULL
 OR OBJECT_ID(N'platform.prepare_tenant_directories',N'P') IS NULL
 THROW 54902,'worker_delegation_schema_required',1;
DECLARE @name sysname=N'infraflow_demo_lease',@sid varbinary(85)=SUSER_SID(N'infraflow_demo_lease');
IF @sid IS NULL OR NOT EXISTS(SELECT 1 FROM sys.server_principals WHERE sid=@sid AND type='S' AND is_disabled=0)
 OR NOT EXISTS(SELECT 1 FROM sys.database_principals WHERE name=@name AND sid=@sid AND type='S')
 THROW 54903,'worker_mapping_required',1;
IF EXISTS(SELECT 1 FROM sys.server_role_members WHERE member_principal_id=SUSER_ID(@name))
 OR EXISTS(SELECT 1 FROM sys.database_role_members WHERE member_principal_id=USER_ID(@name))
 OR EXISTS(SELECT 1 FROM sys.schemas WHERE principal_id=USER_ID(@name))
 OR EXISTS(SELECT 1 FROM sys.objects WHERE principal_id=USER_ID(@name))
 OR EXISTS(SELECT 1 FROM sys.databases WHERE owner_sid=@sid)
 THROW 54904,'worker_membership_or_ownership_requires_review',1;
DECLARE @impersonating bit=0,@invalid bit=0;
BEGIN TRY BEGIN TRANSACTION;
 IF EXISTS(SELECT 1 FROM platform.provision_jobs WITH(UPDLOCK,HOLDLOCK) WHERE state='leased')
 OR EXISTS(SELECT 1 FROM platform.directory_attempts WITH(UPDLOCK,HOLDLOCK))
 OR EXISTS(SELECT 1 FROM platform.directory_results WITH(UPDLOCK,HOLDLOCK))
 OR EXISTS(SELECT 1 FROM platform.directory_observations WITH(UPDLOCK,HOLDLOCK))
 THROW 54905,'worker_not_idle_requires_review',1;
 IF NOT EXISTS(SELECT 1 FROM platform.provision_jobs j WITH(UPDLOCK,HOLDLOCK) JOIN platform.trials t WITH(UPDLOCK,HOLDLOCK) ON t.trial_id=j.trial_id
 WHERE j.job_id='00f612ed-a8ac-4688-a26f-679760eee0be' AND j.trial_id='b1100b43-48d0-42fa-8a1d-73b1286f8242'
 AND j.state='queued' AND j.job_revision=7 AND j.generation=3 AND j.execution_ready=0
 AND j.lease_owner IS NULL AND j.lease_hash IS NULL AND j.lease_expires_at IS NULL
 AND j.trial_revision=1 AND t.revision=1 AND t.state='queued' AND t.activated_at IS NULL AND t.expires_at IS NULL)
 THROW 54905,'worker_pilot_state_requires_review',1;
 EXECUTE AS LOGIN=N'infraflow_demo_lease';SET @impersonating=1;
 IF COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>0
 OR COALESCE(HAS_DBACCESS(N'INFRAFLOW_DEMO'),1)<>0
 OR EXISTS(SELECT 1 FROM sys.fn_my_permissions(NULL,'SERVER') WHERE permission_name NOT IN('CONNECT SQL','VIEW ANY DATABASE'))
 SET @invalid=1;
 REVERT;SET @impersonating=0;
 IF @invalid=1 THROW 54906,'worker_server_scope_requires_review',1;
 EXECUTE AS USER=N'infraflow_demo_lease';SET @impersonating=1;
 IF EXISTS(SELECT 1 FROM sys.fn_my_permissions(NULL,'DATABASE') WHERE permission_name NOT IN('CONNECT','VIEW ANY COLUMN ENCRYPTION KEY DEFINITION','VIEW ANY COLUMN MASTER KEY DEFINITION'))
 OR COALESCE(HAS_PERMS_BY_NAME('platform.provision_lease_command','OBJECT','EXECUTE'),0)<>1
 OR COALESCE(HAS_PERMS_BY_NAME('platform.record_step_intent','OBJECT','EXECUTE'),0)<>1
 OR COALESCE(HAS_PERMS_BY_NAME('platform.adapter_review_ticket_command','OBJECT','EXECUTE'),0)<>1
 OR COALESCE(HAS_PERMS_BY_NAME('platform.prepare_os_identity_delegation','OBJECT','EXECUTE'),0)<>1
 OR COALESCE(HAS_PERMS_BY_NAME('platform.prepare_tenant_directories','OBJECT','EXECUTE'),-1)<>0
 OR EXISTS(SELECT 1 FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id
 CROSS APPLY sys.fn_my_permissions(QUOTENAME(s.name)+'.'+QUOTENAME(o.name),'OBJECT') p
 WHERE s.name IN('platform','operator_security')
 AND p.permission_name IN('SELECT','INSERT','UPDATE','DELETE','EXECUTE','ALTER','CONTROL','TAKE OWNERSHIP','REFERENCES','VIEW DEFINITION')
 AND NOT(s.name='platform' AND o.name IN('provision_lease_command','record_step_intent','adapter_review_ticket_command','prepare_os_identity_delegation') AND p.permission_name='EXECUTE'))
 SET @invalid=1;
 REVERT;SET @impersonating=0;
 IF @invalid=1 THROW 54907,'worker_four_rpc_baseline_required',1;
 COMMIT;SELECT N'WORKER_DIRECTORY_SCOPE_PREFLIGHT_OK';
END TRY BEGIN CATCH
 IF @impersonating=1 REVERT;
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
