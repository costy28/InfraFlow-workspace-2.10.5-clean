IF SCHEMA_ID(N'core') IS NOT NULL AND OBJECT_ID(N'core.push_subscriptions', N'U') IS NULL
BEGIN
  CREATE TABLE core.push_subscriptions (
    id int identity(1,1) not null constraint pk_core_push_subscriptions primary key,
    user_id uniqueidentifier not null,
    endpoint nvarchar(500) not null,
    p256dh nvarchar(200) not null,
    auth nvarchar(100) not null,
    device_name nvarchar(100) null,
    created_at datetime2(0) not null constraint df_core_push_subscriptions_created_at default sysdatetime(),
    constraint fk_core_push_subscriptions_user foreign key (user_id) references core.users(id) on delete no action,
    constraint uq_core_push_subscriptions_endpoint unique (endpoint)
  );
  CREATE INDEX ix_core_push_subscriptions_user ON core.push_subscriptions(user_id);
END;

IF OBJECT_ID(N'fleet.trip_logs', N'U') IS NOT NULL
BEGIN
  IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name=N'df_fleet_trip_logs_status')
    ALTER TABLE fleet.trip_logs DROP CONSTRAINT df_fleet_trip_logs_status;
  IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id=OBJECT_ID(N'fleet.trip_logs') AND parent_column_id=COLUMNPROPERTY(OBJECT_ID(N'fleet.trip_logs'), N'status', 'ColumnId'))
    ALTER TABLE fleet.trip_logs ADD CONSTRAINT df_fleet_trip_logs_status DEFAULT N'draft' FOR status;

  IF COL_LENGTH(N'fleet.trip_logs', N'trimisa_la') IS NULL ALTER TABLE fleet.trip_logs ADD trimisa_la datetime2(0) NULL;
  IF COL_LENGTH(N'fleet.trip_logs', N'trimisa_catre') IS NULL ALTER TABLE fleet.trip_logs ADD trimisa_catre uniqueidentifier NULL;
  IF COL_LENGTH(N'fleet.trip_logs', N'trimisa_catre') IS NOT NULL
     AND TYPE_NAME(COLUMNPROPERTY(OBJECT_ID(N'fleet.trip_logs'), N'trimisa_catre', 'SystemTypeId')) <> N'uniqueidentifier'
    ALTER TABLE fleet.trip_logs ALTER COLUMN trimisa_catre uniqueidentifier NULL;
  IF COL_LENGTH(N'fleet.trip_logs', N'completata_la') IS NULL ALTER TABLE fleet.trip_logs ADD completata_la datetime2(0) NULL;
  IF COL_LENGTH(N'fleet.trip_logs', N'semnat_sofer_la') IS NULL ALTER TABLE fleet.trip_logs ADD semnat_sofer_la datetime2(0) NULL;
  IF COL_LENGTH(N'fleet.trip_logs', N'semnat_sofer_svg') IS NULL ALTER TABLE fleet.trip_logs ADD semnat_sofer_svg nvarchar(max) NULL;
  IF COL_LENGTH(N'fleet.trip_logs', N'responsabil_id') IS NULL ALTER TABLE fleet.trip_logs ADD responsabil_id uniqueidentifier NULL;
  IF COL_LENGTH(N'fleet.trip_logs', N'responsabil_id') IS NOT NULL
     AND TYPE_NAME(COLUMNPROPERTY(OBJECT_ID(N'fleet.trip_logs'), N'responsabil_id', 'SystemTypeId')) <> N'uniqueidentifier'
    ALTER TABLE fleet.trip_logs ALTER COLUMN responsabil_id uniqueidentifier NULL;
  IF COL_LENGTH(N'fleet.trip_logs', N'semnat_resp_la') IS NULL ALTER TABLE fleet.trip_logs ADD semnat_resp_la datetime2(0) NULL;
  IF COL_LENGTH(N'fleet.trip_logs', N'semnat_resp_svg') IS NULL ALTER TABLE fleet.trip_logs ADD semnat_resp_svg nvarchar(max) NULL;
  IF COL_LENGTH(N'fleet.trip_logs', N'sign_token') IS NULL ALTER TABLE fleet.trip_logs ADD sign_token char(64) NULL;
  IF COL_LENGTH(N'fleet.trip_logs', N'sign_token_exp') IS NULL ALTER TABLE fleet.trip_logs ADD sign_token_exp datetime2(0) NULL;
  IF COL_LENGTH(N'fleet.trip_logs', N'sign_token_used_at') IS NULL ALTER TABLE fleet.trip_logs ADD sign_token_used_at datetime2(0) NULL;
  IF COL_LENGTH(N'fleet.trip_logs', N'aprobat_de') IS NULL ALTER TABLE fleet.trip_logs ADD aprobat_de uniqueidentifier NULL;
  IF COL_LENGTH(N'fleet.trip_logs', N'aprobat_de') IS NOT NULL
     AND TYPE_NAME(COLUMNPROPERTY(OBJECT_ID(N'fleet.trip_logs'), N'aprobat_de', 'SystemTypeId')) <> N'uniqueidentifier'
    ALTER TABLE fleet.trip_logs ALTER COLUMN aprobat_de uniqueidentifier NULL;
  IF COL_LENGTH(N'fleet.trip_logs', N'aprobat_la') IS NULL ALTER TABLE fleet.trip_logs ADD aprobat_la datetime2(0) NULL;
  IF COL_LENGTH(N'fleet.trip_logs', N'pdf_final_path') IS NULL ALTER TABLE fleet.trip_logs ADD pdf_final_path nvarchar(500) NULL;

END;
GO

IF OBJECT_ID(N'fleet.trip_logs', N'U') IS NOT NULL
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'fk_fleet_trip_logs_trimisa_catre')
    ALTER TABLE fleet.trip_logs ADD CONSTRAINT fk_fleet_trip_logs_trimisa_catre FOREIGN KEY (trimisa_catre) REFERENCES core.users(id);
  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'fk_fleet_trip_logs_responsabil')
    ALTER TABLE fleet.trip_logs ADD CONSTRAINT fk_fleet_trip_logs_responsabil FOREIGN KEY (responsabil_id) REFERENCES core.users(id);
  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'fk_fleet_trip_logs_aprobat_de')
    ALTER TABLE fleet.trip_logs ADD CONSTRAINT fk_fleet_trip_logs_aprobat_de FOREIGN KEY (aprobat_de) REFERENCES core.users(id);
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'ix_fleet_trip_logs_sign_token' AND object_id=OBJECT_ID(N'fleet.trip_logs'))
    CREATE UNIQUE INDEX ix_fleet_trip_logs_sign_token ON fleet.trip_logs(sign_token) WHERE sign_token IS NOT NULL;
END;
