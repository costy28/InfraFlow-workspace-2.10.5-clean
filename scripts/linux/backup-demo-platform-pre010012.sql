-- Explicit administrator backup step, not an automatic migration or restore.
SET NOCOUNT ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM'
 OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1
 THROW 53311,'admin_platform_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='009_operator_prepare_change_v1')
 OR EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id IN(
 '010_provision_step_journal_v1','011_adapter_resource_review_v1','012_adapter_review_tickets_v1'))
 THROW 53312,'backup_baseline_requires_review',1;
DECLARE @file nvarchar(260)=N'/var/opt/mssql/data/INFRAFLOW_DEMO_PLATFORM_pre010012_'+REPLACE(CONVERT(nvarchar(36),NEWID()),N'-',N'')+N'.bak';
BACKUP DATABASE [INFRAFLOW_DEMO_PLATFORM] TO DISK=@file WITH COPY_ONLY,CHECKSUM;
RESTORE VERIFYONLY FROM DISK=@file WITH CHECKSUM;
SELECT @file AS backup_verificat;
SELECT N'PRE010012_BACKUP_VERIFIED' AS rezultat;
