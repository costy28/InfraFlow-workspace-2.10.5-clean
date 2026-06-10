IF OBJECT_ID(N'dbo.fleet_faz_nomenclator', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.fleet_faz_nomenclator (
    id INT IDENTITY(1,1) PRIMARY KEY,
    cod NVARCHAR(10) NOT NULL,
    denumire NVARCHAR(200) NOT NULL,
    activ BIT NOT NULL CONSTRAINT DF_fleet_faz_nomenclator_activ DEFAULT 1
  );
END;
GO

IF OBJECT_ID(N'dbo.fleet_faz_logs', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.fleet_faz_logs (
    id INT IDENTITY(1,1) PRIMARY KEY,
    uuid CHAR(36) NOT NULL UNIQUE DEFAULT NEWID(),
    utilaj_id INT NOT NULL,
    operator_name NVARCHAR(200) NULL,
    data DATE NOT NULL,
    locatie NVARCHAR(300) NULL,
    tip_activitate_id INT NULL,
    index_start DECIMAL(10,2) NULL,
    index_stop DECIMAL(10,2) NULL,
    ore_zi AS (CASE WHEN index_stop IS NOT NULL AND index_start IS NOT NULL THEN index_stop - index_start ELSE NULL END) PERSISTED,
    ore_lucrate DECIMAL(4,2) NULL,
    carburant_primit DECIMAL(8,2) NULL,
    consum_orar_normat DECIMAL(6,2) NULL,
    consum_normat AS (CASE WHEN ore_lucrate IS NOT NULL AND consum_orar_normat IS NOT NULL THEN ore_lucrate * consum_orar_normat ELSE NULL END) PERSISTED,
    consum_efectiv DECIMAL(8,2) NULL,
    diferenta_consum AS (CASE WHEN consum_efectiv IS NOT NULL AND ore_lucrate IS NOT NULL AND consum_orar_normat IS NOT NULL THEN consum_efectiv - (ore_lucrate * consum_orar_normat) ELSE NULL END) PERSISTED,
    observatii NVARCHAR(MAX) NULL,
    scan_path NVARCHAR(500) NULL,
    status NVARCHAR(20) NOT NULL CONSTRAINT DF_fleet_faz_logs_status DEFAULT N'draft',
    semnat_operator_la DATETIME2 NULL,
    aprobat_de INT NULL,
    aprobat_la DATETIME2 NULL,
    cancelled_at DATETIME2 NULL,
    cancelled_by INT NULL,
    cancelled_reason NVARCHAR(300) NULL,
    autominder_id INT NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_fleet_faz_logs_created_at DEFAULT SYSDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_fleet_faz_logs_updated_at DEFAULT SYSDATETIME()
  );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_fleet_faz_logs_utilaj_data' AND object_id = OBJECT_ID(N'dbo.fleet_faz_logs'))
  CREATE INDEX IX_fleet_faz_logs_utilaj_data ON dbo.fleet_faz_logs(utilaj_id, data);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_fleet_faz_logs_autominder' AND object_id = OBJECT_ID(N'dbo.fleet_faz_logs'))
  CREATE INDEX IX_fleet_faz_logs_autominder ON dbo.fleet_faz_logs(autominder_id);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.fleet_faz_nomenclator)
BEGIN
  INSERT INTO dbo.fleet_faz_nomenclator (cod, denumire, activ) VALUES
  (N'A01', N'DESZAPEZIRE', 1),
  (N'A02', N'BALASTARE STRADA TARNEI', 1),
  (N'A03', N'FREZAT - ASFALT', 1),
  (N'A04', N'DESCARCARE - PAVELE', 1),
  (N'A05', N'INCARCARE - BALAST, PAMANT', 1),
  (N'A06', N'INCARCARE - REFUZ FREZA', 1),
  (N'A07', N'MATURARE - MATURAT SUPRAFATA LUCRU', 1),
  (N'A08', N'INCARCARE - PAVELE', 1),
  (N'A09', N'REPARATII - DEFECT', 1),
  (N'A10', N'MUTAT AGREGATE', 1),
  (N'A11', N'INCARCAT BETON - FORMATIA BETOANE', 1),
  (N'A12', N'ALIMENTARE STATIE ASFALT', 1),
  (N'A13', N'PICONAT', 1),
  (N'A14', N'PICONAT SI INCARCAT', 1),
  (N'A15', N'ESCAVAT', 1),
  (N'A16', N'COMPACTAT ASFALT', 1),
  (N'A17', N'TERASAT', 1),
  (N'A18', N'ASTERNERE ASFALT', 1),
  (N'A19', N'SCHIMBARE PUNCT DE LUCRU - MUTAT FINISOR', 1),
  (N'A20', N'ALIMENTARE CU CARBURANT', 1),
  (N'A21', N'FREZAT ASFALT', 1),
  (N'A22', N'PICONAT', 1),
  (N'A23', N'TAIAT ASFALT', 1),
  (N'A24', N'IMPRASTIAT EMULSIE BITUMINOASA', 1),
  (N'A25', N'SPALAT UTILAJE', 1),
  (N'A26', N'TRANSPORT APA', 1),
  (N'A27', N'MATURAT', 1),
  (N'A28', N'TRANSPORT APA SI MATURAT', 1),
  (N'A29', N'SUDURA', 1),
  (N'A30', N'MARCAJ RUTIER', 1),
  (N'A31', N'TRACTAT MASINA MARCAJ', 1),
  (N'A32', N'CAMINE - SCHIMBARE PLANSEE', 1),
  (N'A33', N'BORDURI - SCHIMBAT/SPART BORDURA', 1),
  (N'A34', N'SPATII JOACA', 1),
  (N'A35', N'PROFILAT DRUM', 1),
  (N'A36', N'TERASAT', 1),
  (N'A37', N'TAIAT BETON', 1),
  (N'A38', N'COMPACTAT SI TERASAT', 1),
  (N'A39', N'PICONAT', 1),
  (N'A40', N'TAIAT', 1),
  (N'A41', N'ASTERNERE ASFALT', 1),
  (N'A42', N'STAT LA DISPOZITIE', 1),
  (N'A43', N'INTRETINERE', 1),
  (N'A44', N'STATIE ASFALT', 1);
END;
GO
