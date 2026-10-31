SET NOCOUNT ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM' OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1
 THROW 53501,'admin_platform_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='016_os_identity_results_v1')
 OR OBJECT_ID(N'platform.accept_os_identity_delegation',N'P') IS NULL
 OR OBJECT_ID(N'platform.record_os_identity_result',N'P') IS NULL
 THROW 53501,'os_executor_schema_required',1;
IF SUSER_ID(N'infraflow_demo_os_executor') IS NOT NULL OR USER_ID(N'infraflow_demo_os_executor') IS NOT NULL
 THROW 53502,'os_executor_identity_exists_stop',1;
SELECT N'OS_EXECUTOR_LOGIN_PREFLIGHT_OK' AS rezultat;
SELECT N'LIBER' AS login_executor,N'LIBER' AS user_executor;
