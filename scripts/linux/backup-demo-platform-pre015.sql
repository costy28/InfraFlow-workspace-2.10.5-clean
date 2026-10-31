SET NOCOUNT ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM' OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1
 THROW 54001,'admin_platform_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='014_os_identity_delegations_v1')
 OR EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='015_os_identity_acceptance_v1')
 THROW 54002,'backup_baseline_requires_review',1;
DECLARE @file nvarchar(260)=N'/var/opt/mssql/data/INFRAFLOW_DEMO_PLATFORM_pre015_'+REPLACE(CONVERT(nvarchar(36),NEWID()),N'-',N'')+N'.bak';
BACKUP DATABASE [INFRAFLOW_DEMO_PLATFORM] TO DISK=@file WITH COPY_ONLY,CHECKSUM;
RESTORE VERIFYONLY FROM DISK=@file WITH CHECKSUM;
SELECT @file AS backup_verificat;
SELECT N'PRE015_BACKUP_VERIFIED' AS rezultat;
