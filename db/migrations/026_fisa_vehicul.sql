IF OBJECT_ID(N'dbo.fleet_asset_drivers', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.fleet_asset_drivers (
    id INT IDENTITY(1,1) PRIMARY KEY,
    asset_id INT NOT NULL,
    employee_id INT NOT NULL,
    tip NVARCHAR(20) NOT NULL CONSTRAINT DF_fleet_asset_drivers_tip DEFAULT N'sofer',
    data_start DATE NOT NULL,
    data_sfarsit DATE NULL,
    activ BIT NOT NULL CONSTRAINT DF_fleet_asset_drivers_activ DEFAULT 1,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_fleet_asset_drivers_created_at DEFAULT SYSDATETIME()
  );
END;
GO

IF OBJECT_ID(N'dbo.fleet_asset_files', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.fleet_asset_files (
    id INT IDENTITY(1,1) PRIMARY KEY,
    uuid CHAR(36) NOT NULL UNIQUE DEFAULT NEWID(),
    asset_id INT NOT NULL,
    tip NVARCHAR(50) NOT NULL,
    denumire NVARCHAR(200) NULL,
    file_path NVARCHAR(500) NULL,
    file_name NVARCHAR(200) NULL,
    file_size INT NULL,
    uploaded_by INT NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_fleet_asset_files_created_at DEFAULT SYSDATETIME()
  );
END;
GO

IF COL_LENGTH(N'dbo.fleet_assets', N'consum_orar_normat') IS NULL
  ALTER TABLE dbo.fleet_assets ADD consum_orar_normat DECIMAL(6,2) NULL;
GO

IF COL_LENGTH(N'dbo.fleet_assets', N'consum_normat_km') IS NULL
  ALTER TABLE dbo.fleet_assets ADD consum_normat_km DECIMAL(6,2) NULL;
GO

IF COL_LENGTH(N'dbo.fleet_assets', N'tip_combustibil') IS NULL
  ALTER TABLE dbo.fleet_assets ADD tip_combustibil NVARCHAR(20) NULL;
GO

IF COL_LENGTH(N'dbo.fleet_assets', N'gps_device_id') IS NULL
  ALTER TABLE dbo.fleet_assets ADD gps_device_id NVARCHAR(100) NULL;
GO

IF COL_LENGTH(N'dbo.fleet_assets', N'sofer_principal_id') IS NULL
  ALTER TABLE dbo.fleet_assets ADD sofer_principal_id INT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_fleet_asset_drivers_asset' AND object_id = OBJECT_ID(N'dbo.fleet_asset_drivers'))
  CREATE INDEX IX_fleet_asset_drivers_asset ON dbo.fleet_asset_drivers(asset_id, activ, data_start);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_fleet_asset_files_asset' AND object_id = OBJECT_ID(N'dbo.fleet_asset_files'))
  CREATE INDEX IX_fleet_asset_files_asset ON dbo.fleet_asset_files(asset_id, tip, created_at);
GO
