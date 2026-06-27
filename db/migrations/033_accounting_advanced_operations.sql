IF OBJECT_ID(N'dbo.accounting_fixed_asset_events', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.accounting_fixed_asset_events (
    id INT IDENTITY(1,1) PRIMARY KEY,
    asset_id INT NOT NULL,
    action NVARCHAR(40) NOT NULL,
    data DATE NOT NULL,
    details NVARCHAR(1000) NULL,
    journal_id INT NULL,
    created_by INT NULL,
    created_at DATETIME2 DEFAULT SYSDATETIME()
  );
  CREATE INDEX IX_accounting_fixed_asset_events_asset ON dbo.accounting_fixed_asset_events(asset_id, data);
END;
GO

IF OBJECT_ID(N'dbo.accounting_declaration_runs', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.accounting_declaration_runs (
    id INT IDENTITY(1,1) PRIMARY KEY,
    code NVARCHAR(20) NOT NULL,
    an INT NOT NULL,
    luna INT NOT NULL,
    status NVARCHAR(30) NOT NULL,
    checksum CHAR(64) NULL,
    recipisa NVARCHAR(200) NULL,
    validated_by INT NULL,
    validated_at DATETIME2 NULL,
    submitted_by INT NULL,
    submitted_at DATETIME2 NULL,
    run_json NVARCHAR(MAX) NULL
  );
  CREATE INDEX IX_accounting_declaration_runs_period ON dbo.accounting_declaration_runs(an, luna, code);
END;
GO

IF OBJECT_ID(N'dbo.accounting_carryforward_runs', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.accounting_carryforward_runs (
    id INT IDENTITY(1,1) PRIMARY KEY,
    an INT NOT NULL,
    next_year INT NOT NULL,
    entries INT NOT NULL,
    checksum CHAR(64) NULL,
    status NVARCHAR(20) NOT NULL,
    created_by INT NULL,
    created_at DATETIME2 DEFAULT SYSDATETIME()
  );
  CREATE UNIQUE INDEX UX_accounting_carryforward_runs_year ON dbo.accounting_carryforward_runs(an);
END;
GO
