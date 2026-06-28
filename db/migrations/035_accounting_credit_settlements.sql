IF OBJECT_ID(N'dbo.accounting_credit_notes', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.accounting_credit_notes (
    id INT IDENTITY(1,1) PRIMARY KEY,
    uuid CHAR(36) NOT NULL,
    invoice_id INT NOT NULL,
    return_id NVARCHAR(100) NULL,
    furnizor_id INT NOT NULL,
    an INT NOT NULL,
    luna TINYINT NOT NULL,
    data DATE NOT NULL,
    nr_document NVARCHAR(100) NOT NULL,
    valoare DECIMAL(18,2) NOT NULL DEFAULT 0,
    tva DECIMAL(18,2) NOT NULL DEFAULT 0,
    total DECIMAL(18,2) NOT NULL DEFAULT 0,
    journal_id INT NULL,
    status NVARCHAR(20) NOT NULL DEFAULT 'draft',
    created_by INT NULL,
    created_at DATETIME2 DEFAULT SYSDATETIME(),
    note_json NVARCHAR(MAX) NULL
  );
  CREATE UNIQUE INDEX UX_accounting_credit_notes_uuid ON dbo.accounting_credit_notes(uuid);
  CREATE INDEX IX_accounting_credit_notes_invoice ON dbo.accounting_credit_notes(invoice_id, status);
END;
GO

IF OBJECT_ID(N'dbo.accounting_settlements', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.accounting_settlements (
    id INT IDENTITY(1,1) PRIMARY KEY,
    uuid CHAR(36) NOT NULL,
    group_uuid CHAR(36) NOT NULL,
    treasury_id INT NOT NULL,
    invoice_in_id INT NULL,
    invoice_out_id INT NULL,
    tert_id INT NOT NULL,
    an INT NOT NULL,
    luna TINYINT NOT NULL,
    data DATE NOT NULL,
    suma DECIMAL(18,2) NOT NULL,
    source_type NVARCHAR(20) NOT NULL,
    journal_id INT NULL,
    status NVARCHAR(20) NOT NULL DEFAULT 'activ',
    created_by INT NULL,
    created_at DATETIME2 DEFAULT SYSDATETIME(),
    cancelled_by INT NULL,
    cancelled_at DATETIME2 NULL,
    cancelled_reason NVARCHAR(500) NULL,
    settlement_json NVARCHAR(MAX) NULL
  );
  CREATE UNIQUE INDEX UX_accounting_settlements_uuid ON dbo.accounting_settlements(uuid);
  CREATE INDEX IX_accounting_settlements_treasury ON dbo.accounting_settlements(treasury_id, status);
  CREATE INDEX IX_accounting_settlements_invoice_in ON dbo.accounting_settlements(invoice_in_id, status);
  CREATE INDEX IX_accounting_settlements_invoice_out ON dbo.accounting_settlements(invoice_out_id, status);
END;
GO
