IF SCHEMA_ID(N'procurement') IS NULL
BEGIN
  EXEC(N'CREATE SCHEMA procurement')
END

IF OBJECT_ID(N'procurement.suppliers', N'U') IS NULL
BEGIN
  CREATE TABLE procurement.suppliers (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    company_id UNIQUEIDENTIFIER NULL,
    name NVARCHAR(220) NOT NULL,
    fiscal_code NVARCHAR(60) NULL,
    active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_procurement_suppliers_company FOREIGN KEY (company_id) REFERENCES core.companies(id)
  )
END

IF OBJECT_ID(N'procurement.referate', N'U') IS NULL
BEGIN
  CREATE TABLE procurement.referate (
    id INT IDENTITY(1,1) PRIMARY KEY,
    uuid UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() UNIQUE,
    numar INT NOT NULL,
    serie NVARCHAR(10) NOT NULL,
    data_intocmire DATE NOT NULL,
    tip NVARCHAR(20) NOT NULL,
    departament_id UNIQUEIDENTIFIER NULL,
    intocmit_de UNIQUEIDENTIFIER NULL,
    furnizor_id UNIQUEIDENTIFIER NULL,
    furnizor_manual NVARCHAR(200) NULL,
    observatii NVARCHAR(MAX) NULL,
    status NVARCHAR(30) NOT NULL DEFAULT N'draft',
    valoare_referat DECIMAL(15,2) NOT NULL DEFAULT 0,
    valoare_factura DECIMAL(15,2) NOT NULL DEFAULT 0,
    diferenta_prc AS (CASE WHEN valoare_referat = 0 THEN CONVERT(DECIMAL(15,2), 0) ELSE CONVERT(DECIMAL(15,2), ((valoare_factura - valoare_referat) * 100.0) / valoare_referat) END),
    nr_inregistrare NVARCHAR(50) NULL,
    data_inregistrare DATETIME2 NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    cancelled_at DATETIME2 NULL,
    cancelled_by UNIQUEIDENTIFIER NULL,
    cancelled_reason NVARCHAR(500) NULL,
    CONSTRAINT FK_procurement_referate_department FOREIGN KEY (departament_id) REFERENCES core.departments(id),
    CONSTRAINT FK_procurement_referate_user FOREIGN KEY (intocmit_de) REFERENCES core.users(id),
    CONSTRAINT FK_procurement_referate_supplier FOREIGN KEY (furnizor_id) REFERENCES procurement.suppliers(id),
    CONSTRAINT FK_procurement_referate_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES core.users(id)
  )
END

IF OBJECT_ID(N'procurement.referate_items', N'U') IS NULL
BEGIN
  CREATE TABLE procurement.referate_items (
    id INT IDENTITY(1,1) PRIMARY KEY,
    referat_id INT NOT NULL,
    nr_crt INT NOT NULL,
    denumire NVARCHAR(300) NOT NULL,
    caracteristici NVARCHAR(500) NULL,
    um NVARCHAR(30) NULL,
    cantitate DECIMAL(15,3) NOT NULL,
    pret_unitar DECIMAL(15,2) NOT NULL DEFAULT 0,
    valoare_tva DECIMAL(15,2) NOT NULL DEFAULT 0,
    stoc_magazie DECIMAL(15,3) NOT NULL DEFAULT 0,
    material_id UNIQUEIDENTIFIER NULL,
    cpv_cod NVARCHAR(20) NULL,
    CONSTRAINT FK_procurement_referate_items_referat FOREIGN KEY (referat_id) REFERENCES procurement.referate(id),
    CONSTRAINT FK_procurement_referate_items_material FOREIGN KEY (material_id) REFERENCES inventory.materials(id)
  )
END

IF OBJECT_ID(N'procurement.referate_flux', N'U') IS NULL
BEGIN
  CREATE TABLE procurement.referate_flux (
    id INT IDENTITY(1,1) PRIMARY KEY,
    referat_id INT NOT NULL,
    pas NVARCHAR(50) NOT NULL,
    actiune NVARCHAR(20) NOT NULL,
    user_id UNIQUEIDENTIFIER NULL,
    data_actiune DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    observatii NVARCHAR(500) NULL,
    CONSTRAINT FK_procurement_referate_flux_referat FOREIGN KEY (referat_id) REFERENCES procurement.referate(id),
    CONSTRAINT FK_procurement_referate_flux_user FOREIGN KEY (user_id) REFERENCES core.users(id)
  )
END

IF OBJECT_ID(N'procurement.referate_counter', N'U') IS NULL
BEGIN
  CREATE TABLE procurement.referate_counter (
    an INT PRIMARY KEY,
    last_nr INT NOT NULL DEFAULT 0
  )
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_procurement_referate_status' AND object_id = OBJECT_ID(N'procurement.referate'))
BEGIN
  CREATE INDEX IX_procurement_referate_status ON procurement.referate(status, data_intocmire)
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_procurement_referate_items_referat' AND object_id = OBJECT_ID(N'procurement.referate_items'))
BEGIN
  CREATE INDEX IX_procurement_referate_items_referat ON procurement.referate_items(referat_id)
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_procurement_referate_flux_referat' AND object_id = OBJECT_ID(N'procurement.referate_flux'))
BEGIN
  CREATE INDEX IX_procurement_referate_flux_referat ON procurement.referate_flux(referat_id, data_actiune)
END
