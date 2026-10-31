SET NOCOUNT ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM' OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1
 THROW 54401,'admin_platform_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='017_os_identity_execution_context_v1')
 OR EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='018_tenant_directory_evidence_v1')
 OR EXISTS(SELECT 1 FROM platform.provision_jobs WHERE state='leased')
 THROW 54402,'pre018_backup_baseline_requires_review',1;
DECLARE @file nvarchar(260)=N'/var/opt/mssql/data/INFRAFLOW_DEMO_PLATFORM_pre018_'+REPLACE(CONVERT(nvarchar(36),NEWID()),N'-',N'')+N'.bak';
BACKUP DATABASE [INFRAFLOW_DEMO_PLATFORM] TO DISK=@file WITH COPY_ONLY,CHECKSUM;
RESTORE VERIFYONLY FROM DISK=@file WITH CHECKSUM;
SELECT @file AS backup_verificat;
SELECT N'PRE018_BACKUP_VERIFIED' AS rezultat;
