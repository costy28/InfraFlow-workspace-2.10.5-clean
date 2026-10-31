SET NOCOUNT ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM' OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1
 THROW 54501,'admin_platform_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='018_tenant_directory_evidence_v1')
 OR EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id IN('019_prepare_tenant_directories_v1','020_tenant_directory_context_v1','021_tenant_directory_results_v1'))
 OR EXISTS(SELECT 1 FROM platform.provision_jobs WHERE state='leased')
 THROW 54502,'directory_commands_backup_baseline_requires_review',1;
DECLARE @file nvarchar(260)=N'/var/opt/mssql/data/INFRAFLOW_DEMO_PLATFORM_pre019021_'+REPLACE(CONVERT(nvarchar(36),NEWID()),N'-',N'')+N'.bak';
BACKUP DATABASE [INFRAFLOW_DEMO_PLATFORM] TO DISK=@file WITH COPY_ONLY,CHECKSUM;
RESTORE VERIFYONLY FROM DISK=@file WITH CHECKSUM;
SELECT @file AS backup_verificat;
SELECT N'PRE019021_BACKUP_VERIFIED' AS rezultat;
