IF OBJECT_ID(N'fleet.trip_logs', N'U') IS NULL
BEGIN
  CREATE TABLE fleet.trip_logs (
    id INT IDENTITY(1,1) PRIMARY KEY,
    uuid CHAR(36) UNIQUE DEFAULT CONVERT(char(36), NEWID()),
    asset_id INT NOT NULL,
    sofer_id INT NULL,
    sofer_text NVARCHAR(150) NULL,
    data DATE NOT NULL,
    nr_foaie NVARCHAR(30) UNIQUE,
    serie NVARCHAR(10) NULL,
    data_plecare DATETIME2 NULL,
    km_plecare INT NOT NULL DEFAULT 0,
    combustibil_sold_initial DECIMAL(8,2) NULL,
    data_sosire DATETIME2 NULL,
    km_sosire INT NULL,
    combustibil_sold_final DECIMAL(8,2) NULL,
    km_parcursi AS (km_sosire - km_plecare),
    combustibil_primit DECIMAL(8,2) NULL,
    consum_normat DECIMAL(8,2) NULL,
    consum_efectiv AS (
      combustibil_sold_initial + ISNULL(combustibil_primit,0)
      - ISNULL(combustibil_sold_final,0)
    ),
    itinerariu NVARCHAR(MAX) NULL,
    scop_deplasare NVARCHAR(300) NULL,
    sarcini_transport NVARCHAR(MAX) NULL,
    loc_parcare NVARCHAR(100) NULL,
    conditii_speciale NVARCHAR(100) NULL,
    loc_prezentare NVARCHAR(100) NULL,
    expeditor NVARCHAR(MAX) NULL,
    observatii NVARCHAR(MAX) NULL,
    status NVARCHAR(20) DEFAULT 'deschisa',
    sosit BIT DEFAULT 0,
    autominder_id INT NULL,
    creat_de INT NULL,
    modified_de INT NULL,
    created_at DATETIME2 DEFAULT SYSDATETIME(),
    updated_at DATETIME2 NULL,
    CONSTRAINT FK_fleet_trip_logs_asset
      FOREIGN KEY (asset_id) REFERENCES fleet.assets(id) ON DELETE NO ACTION,
    CONSTRAINT FK_fleet_trip_logs_sofer
      FOREIGN KEY (sofer_id) REFERENCES hr.employees(id) ON DELETE NO ACTION,
    CONSTRAINT FK_fleet_trip_logs_creat_de
      FOREIGN KEY (creat_de) REFERENCES core.users(id) ON DELETE NO ACTION,
    CONSTRAINT FK_fleet_trip_logs_modified_de
      FOREIGN KEY (modified_de) REFERENCES core.users(id) ON DELETE NO ACTION
  )
END

IF OBJECT_ID(N'fleet.trip_logs', N'U') IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_fleet_trip_logs_asset_id'
  AND object_id = OBJECT_ID(N'fleet.trip_logs', N'U')
)
BEGIN
  CREATE INDEX IX_fleet_trip_logs_asset_id ON fleet.trip_logs(asset_id)
END

IF OBJECT_ID(N'fleet.trip_logs', N'U') IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_fleet_trip_logs_sofer_id'
  AND object_id = OBJECT_ID(N'fleet.trip_logs', N'U')
)
BEGIN
  CREATE INDEX IX_fleet_trip_logs_sofer_id ON fleet.trip_logs(sofer_id)
END

IF OBJECT_ID(N'fleet.trip_logs', N'U') IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_fleet_trip_logs_data'
  AND object_id = OBJECT_ID(N'fleet.trip_logs', N'U')
)
BEGIN
  CREATE INDEX IX_fleet_trip_logs_data ON fleet.trip_logs(data)
END

IF OBJECT_ID(N'fleet.trip_logs', N'U') IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_fleet_trip_logs_status'
  AND object_id = OBJECT_ID(N'fleet.trip_logs', N'U')
)
BEGIN
  CREATE INDEX IX_fleet_trip_logs_status ON fleet.trip_logs(status)
END

IF OBJECT_ID(N'fleet.trip_logs', N'U') IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_fleet_trip_logs_nr_foaie'
  AND object_id = OBJECT_ID(N'fleet.trip_logs', N'U')
)
BEGIN
  CREATE INDEX IX_fleet_trip_logs_nr_foaie ON fleet.trip_logs(nr_foaie)
END
