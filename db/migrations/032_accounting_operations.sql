IF OBJECT_ID(N'dbo.accounting_bank_imports', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.accounting_bank_imports (
    id INT IDENTITY(1,1) PRIMARY KEY,
    file_name NVARCHAR(260) NOT NULL,
    imported_at DATETIME2 DEFAULT SYSDATETIME(),
    imported_by INT NULL,
    result_json NVARCHAR(MAX) NULL
  );
END;
GO

IF OBJECT_ID(N'dbo.accounting_stock_postings', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.accounting_stock_postings (
    id INT IDENTITY(1,1) PRIMARY KEY,
    movement_id NVARCHAR(100) NOT NULL,
    journal_id INT NOT NULL,
    an INT NOT NULL,
    luna INT NOT NULL,
    created_at DATETIME2 DEFAULT SYSDATETIME()
  );
  CREATE UNIQUE INDEX UX_accounting_stock_postings_movement ON dbo.accounting_stock_postings(movement_id);
END;
GO

IF OBJECT_ID(N'dbo.accounting_fixed_assets', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.accounting_fixed_assets (
    id INT IDENTITY(1,1) PRIMARY KEY,
    uuid CHAR(36) NOT NULL,
    inventory_no NVARCHAR(100) NOT NULL,
    name NVARCHAR(300) NOT NULL,
    acquisition_date DATE NULL,
    depreciation_start DATE NULL,
    acquisition_value DECIMAL(18,2) NOT NULL,
    residual_value DECIMAL(18,2) DEFAULT 0,
    useful_life_months INT NOT NULL,
    accumulated_depreciation DECIMAL(18,2) DEFAULT 0,
    net_value DECIMAL(18,2) DEFAULT 0,
    account_asset NVARCHAR(20) NULL,
    account_depreciation NVARCHAR(20) NULL,
    account_expense NVARCHAR(20) NULL,
    status NVARCHAR(20) DEFAULT 'activ',
    created_at DATETIME2 DEFAULT SYSDATETIME()
  );
  CREATE UNIQUE INDEX UX_accounting_fixed_assets_uuid ON dbo.accounting_fixed_assets(uuid);
  CREATE UNIQUE INDEX UX_accounting_fixed_assets_inventory ON dbo.accounting_fixed_assets(inventory_no);
END;
GO

IF OBJECT_ID(N'dbo.accounting_depreciation_runs', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.accounting_depreciation_runs (
    id INT IDENTITY(1,1) PRIMARY KEY,
    an INT NOT NULL,
    luna INT NOT NULL,
    status NVARCHAR(20) NOT NULL,
    total DECIMAL(18,2) DEFAULT 0,
    created_by INT NULL,
    created_at DATETIME2 DEFAULT SYSDATETIME(),
    run_json NVARCHAR(MAX) NULL
  );
  CREATE UNIQUE INDEX UX_accounting_depreciation_runs_period ON dbo.accounting_depreciation_runs(an, luna);
END;
GO

IF OBJECT_ID(N'dbo.accounting_annual_closings', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.accounting_annual_closings (
    id INT IDENTITY(1,1) PRIMARY KEY,
    an INT NOT NULL,
    journal_id INT NOT NULL,
    result DECIMAL(18,2) DEFAULT 0,
    status NVARCHAR(20) NOT NULL,
    created_by INT NULL,
    created_at DATETIME2 DEFAULT SYSDATETIME()
  );
  CREATE UNIQUE INDEX UX_accounting_annual_closings_year ON dbo.accounting_annual_closings(an);
END;
GO
