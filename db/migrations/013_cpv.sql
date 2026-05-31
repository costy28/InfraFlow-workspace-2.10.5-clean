IF SCHEMA_ID(N'nomenclator') IS NULL
BEGIN
  EXEC(N'CREATE SCHEMA nomenclator')
END

IF SCHEMA_ID(N'procurement') IS NULL
BEGIN
  EXEC(N'CREATE SCHEMA procurement')
END

IF OBJECT_ID(N'nomenclator.cpv_codes', N'U') IS NULL
BEGIN
  CREATE TABLE nomenclator.cpv_codes (
    id INT IDENTITY(1,1) PRIMARY KEY,
    cod NVARCHAR(20) NOT NULL UNIQUE,
    denumire_ro NVARCHAR(500) NOT NULL,
    denumire_en NVARCHAR(500) NULL,
    activ BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    created_by UNIQUEIDENTIFIER NULL,
    CONSTRAINT FK_nomenclator_cpv_codes_user FOREIGN KEY (created_by) REFERENCES core.users(id)
  )
END

IF OBJECT_ID(N'procurement.paap', N'U') IS NULL
BEGIN
  CREATE TABLE procurement.paap (
    id INT IDENTITY(1,1) PRIMARY KEY,
    an INT NOT NULL,
    cpv_cod NVARCHAR(20) NOT NULL,
    cpv_denumire NVARCHAR(500) NULL,
    material NVARCHAR(300) NOT NULL,
    um NVARCHAR(30) NULL,
    cantitate DECIMAL(15,3) NOT NULL DEFAULT 0,
    valoare_estimata DECIMAL(15,2) NOT NULL DEFAULT 0,
    procedura NVARCHAR(100) NOT NULL,
    trimestru TINYINT NOT NULL DEFAULT 1,
    valoare_executata DECIMAL(15,2) NOT NULL DEFAULT 0,
    sursa NVARCHAR(100) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    created_by UNIQUEIDENTIFIER NULL,
    cancelled_at DATETIME2 NULL,
    cancelled_by UNIQUEIDENTIFIER NULL,
    cancelled_reason NVARCHAR(500) NULL,
    CONSTRAINT FK_procurement_paap_user FOREIGN KEY (created_by) REFERENCES core.users(id),
    CONSTRAINT FK_procurement_paap_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES core.users(id)
  )
END

IF OBJECT_ID(N'procurement.paap_executie', N'U') IS NULL
BEGIN
  CREATE TABLE procurement.paap_executie (
    id INT IDENTITY(1,1) PRIMARY KEY,
    paap_id INT NOT NULL,
    factura_id NVARCHAR(80) NULL,
    comanda_id NVARCHAR(80) NULL,
    valoare DECIMAL(15,2) NOT NULL DEFAULT 0,
    data DATE NOT NULL,
    note NVARCHAR(500) NULL,
    CONSTRAINT FK_procurement_paap_executie_paap FOREIGN KEY (paap_id) REFERENCES procurement.paap(id)
  )
END

IF COL_LENGTH(N'procurement.referate_items', N'cpv_cod') IS NULL
BEGIN
  ALTER TABLE procurement.referate_items ADD cpv_cod NVARCHAR(20) NULL
END

IF OBJECT_ID(N'procurement.orders', N'U') IS NOT NULL AND COL_LENGTH(N'procurement.orders', N'cpv_cod') IS NULL
BEGIN
  ALTER TABLE procurement.orders ADD cpv_cod NVARCHAR(20) NULL
END

IF OBJECT_ID(N'inventory.materials', N'U') IS NOT NULL AND COL_LENGTH(N'inventory.materials', N'cpv_cod') IS NULL
BEGIN
  ALTER TABLE inventory.materials ADD cpv_cod NVARCHAR(20) NULL
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_nomenclator_cpv_codes_cod' AND object_id = OBJECT_ID(N'nomenclator.cpv_codes'))
BEGIN
  CREATE INDEX IX_nomenclator_cpv_codes_cod ON nomenclator.cpv_codes(cod)
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_nomenclator_cpv_codes_denumire_ro' AND object_id = OBJECT_ID(N'nomenclator.cpv_codes'))
BEGIN
  CREATE INDEX IX_nomenclator_cpv_codes_denumire_ro ON nomenclator.cpv_codes(denumire_ro)
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_procurement_paap_an' AND object_id = OBJECT_ID(N'procurement.paap'))
BEGIN
  CREATE INDEX IX_procurement_paap_an ON procurement.paap(an, cpv_cod)
END

