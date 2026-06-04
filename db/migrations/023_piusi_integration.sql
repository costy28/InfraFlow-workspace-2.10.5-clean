/*
  InfraFlow - Integrare PIUSI Self-Service.
  Import alimentari carburant din Self.mdb / Erogaz.
*/

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'integration')
  EXEC(N'CREATE SCHEMA integration');
GO

IF OBJECT_ID(N'integration.piusi_sync', N'U') IS NULL
BEGIN
  CREATE TABLE integration.piusi_sync (
    id int identity(1,1) not null constraint pk_integration_piusi_sync primary key,
    piusi_id_prog int not null constraint uq_integration_piusi_sync_idprog unique,
    data_ora datetime not null,
    numar_pompa int null,
    serial_cheie nvarchar(50) null,
    cantitate_litri decimal(10,3) not null,
    operator_cod nvarchar(100) null,
    odometru int not null constraint df_integration_piusi_sync_odometru default 0,
    asset_id int null,
    importat_la datetime not null constraint df_integration_piusi_sync_importat default getdate(),
    procesat bit not null constraint df_integration_piusi_sync_procesat default 0,
    eroare nvarchar(500) null,
    constraint fk_integration_piusi_sync_asset foreign key (asset_id) references fleet.assets(id) on delete no action
  );
END
GO

IF OBJECT_ID(N'integration.piusi_mapare', N'U') IS NULL
BEGIN
  CREATE TABLE integration.piusi_mapare (
    id int identity(1,1) not null constraint pk_integration_piusi_mapare primary key,
    operator_cod nvarchar(100) not null constraint uq_integration_piusi_mapare_operator unique,
    asset_id int null,
    denumire nvarchar(200) null,
    activ bit not null constraint df_integration_piusi_mapare_activ default 1,
    updated_at datetime not null constraint df_integration_piusi_mapare_updated default getdate(),
    constraint fk_integration_piusi_mapare_asset foreign key (asset_id) references fleet.assets(id) on delete no action
  );
END
GO

IF OBJECT_ID(N'integration.piusi_config', N'U') IS NULL
BEGIN
  CREATE TABLE integration.piusi_config (
    id int identity(1,1) not null constraint pk_integration_piusi_config primary key,
    cheie nvarchar(100) not null constraint uq_integration_piusi_config_cheie unique,
    valoare nvarchar(500) null
  );
END
GO

IF OBJECT_ID(N'integration.piusi_sync', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_integration_piusi_sync_data_asset' AND object_id = OBJECT_ID(N'integration.piusi_sync'))
  CREATE INDEX ix_integration_piusi_sync_data_asset ON integration.piusi_sync(data_ora, asset_id, procesat);
GO
