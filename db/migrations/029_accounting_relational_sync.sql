/*
  InfraFlow - suport sincronizare app_state -> tabele contabile relationale
*/

IF OBJECT_ID(N'dbo.accounting_invoice_in_lines', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.accounting_invoice_in_lines (
    id INT IDENTITY(1,1) PRIMARY KEY,
    invoice_id INT NOT NULL,
    linie_nr INT NOT NULL,
    denumire NVARCHAR(300) NULL,
    um NVARCHAR(30) NULL,
    cantitate DECIMAL(18,3) DEFAULT 1,
    pret_unitar DECIMAL(18,2) DEFAULT 0,
    valoare DECIMAL(18,2) DEFAULT 0,
    tva_procent DECIMAL(5,2) DEFAULT 21,
    tva DECIMAL(18,2) DEFAULT 0,
    total DECIMAL(18,2) DEFAULT 0,
    cont_simbol NVARCHAR(20) NULL,
    cost_center_id INT NULL,
    subcentru_id INT NULL
  );
END;
GO

IF OBJECT_ID(N'dbo.accounting_invoice_out_lines', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.accounting_invoice_out_lines (
    id INT IDENTITY(1,1) PRIMARY KEY,
    invoice_id INT NOT NULL,
    linie_nr INT NOT NULL,
    denumire NVARCHAR(300) NULL,
    um NVARCHAR(30) NULL,
    cantitate DECIMAL(18,3) DEFAULT 1,
    pret_unitar DECIMAL(18,2) DEFAULT 0,
    valoare DECIMAL(18,2) DEFAULT 0,
    tva_procent DECIMAL(5,2) DEFAULT 21,
    tva DECIMAL(18,2) DEFAULT 0,
    total DECIMAL(18,2) DEFAULT 0,
    cont_simbol NVARCHAR(20) NULL,
    cost_center_id INT NULL,
    subcentru_id INT NULL
  );
END;
GO

IF OBJECT_ID(N'dbo.accounting_relational_sync', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.accounting_relational_sync (
    id INT IDENTITY(1,1) PRIMARY KEY,
    synced_at DATETIME2 DEFAULT SYSDATETIME(),
    synced_by INT NULL,
    source NVARCHAR(50) DEFAULT 'app_state',
    status NVARCHAR(20) DEFAULT 'ok',
    chart_count INT DEFAULT 0,
    third_parties_count INT DEFAULT 0,
    invoices_in_count INT DEFAULT 0,
    invoices_out_count INT DEFAULT 0,
    treasury_count INT DEFAULT 0,
    journals_count INT DEFAULT 0,
    journal_lines_count INT DEFAULT 0,
    message NVARCHAR(500) NULL
  );
END;
GO
