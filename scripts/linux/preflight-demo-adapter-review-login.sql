-- Read-only inventory before separately confirmed SQL login creation.
SET NOCOUNT ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'INFRAFLOW_DEMO_PLATFORM'
 OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1 THROW 53501,'admin_platform_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='012_adapter_review_tickets_v1')
 OR OBJECT_ID(N'platform.read_adapter_resource_review',N'P') IS NULL
 OR OBJECT_ID(N'platform.adapter_review_ticket_command',N'P') IS NULL
 THROW 53501,'adapter_migrations_required',1;
IF SUSER_ID(N'infraflow_demo_adapter_review') IS NOT NULL OR USER_ID(N'infraflow_demo_adapter_review') IS NOT NULL
 THROW 53502,'adapter_identity_exists_stop',1;
SELECT N'LIBER' AS login_adaptor,N'LIBER' AS user_adaptor;
SELECT N'ADAPTER_REVIEW_LOGIN_PREFLIGHT_OK' AS rezultat;
