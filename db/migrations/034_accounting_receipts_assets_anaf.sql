IF COL_LENGTH(N'dbo.accounting_fixed_assets', N'category_code') IS NULL
  ALTER TABLE dbo.accounting_fixed_assets ADD category_code NVARCHAR(30) NULL;
GO
IF COL_LENGTH(N'dbo.accounting_fixed_assets', N'depreciation_method') IS NULL
  ALTER TABLE dbo.accounting_fixed_assets ADD depreciation_method NVARCHAR(20) NULL;
GO
IF COL_LENGTH(N'dbo.accounting_fixed_assets', N'fiscal_life_months') IS NULL
  ALTER TABLE dbo.accounting_fixed_assets ADD fiscal_life_months INT NULL;
GO
IF COL_LENGTH(N'dbo.accounting_fixed_assets', N'location') IS NULL
  ALTER TABLE dbo.accounting_fixed_assets ADD location NVARCHAR(200) NULL;
GO
IF COL_LENGTH(N'dbo.accounting_fixed_assets', N'custodian') IS NULL
  ALTER TABLE dbo.accounting_fixed_assets ADD custodian NVARCHAR(200) NULL;
GO

IF OBJECT_ID(N'dbo.accounting_fixed_asset_categories', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.accounting_fixed_asset_categories (
    id INT IDENTITY(1,1) PRIMARY KEY,
    code NVARCHAR(30) NOT NULL,
    name NVARCHAR(300) NOT NULL,
    default_life_months INT NOT NULL,
    active BIT NOT NULL DEFAULT 1,
    category_json NVARCHAR(MAX) NULL
  );
  CREATE UNIQUE INDEX UX_accounting_fixed_asset_categories_code ON dbo.accounting_fixed_asset_categories(code);
END;
GO

IF OBJECT_ID(N'dbo.accounting_fixed_asset_inventories', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.accounting_fixed_asset_inventories (
    id INT IDENTITY(1,1) PRIMARY KEY,
    uuid CHAR(36) NOT NULL,
    inventory_date DATE NOT NULL,
    commission NVARCHAR(500) NULL,
    status NVARCHAR(20) NOT NULL,
    created_by INT NULL,
    created_at DATETIME2 DEFAULT SYSDATETIME(),
    inventory_json NVARCHAR(MAX) NULL
  );
  CREATE UNIQUE INDEX UX_accounting_fixed_asset_inventories_uuid ON dbo.accounting_fixed_asset_inventories(uuid);
END;
GO

IF OBJECT_ID(N'dbo.accounting_anaf_schemas', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.accounting_anaf_schemas (
    id INT IDENTITY(1,1) PRIMARY KEY,
    uuid CHAR(36) NOT NULL,
    code NVARCHAR(20) NOT NULL,
    original_name NVARCHAR(260) NOT NULL,
    file_path NVARCHAR(500) NOT NULL,
    sha256 CHAR(64) NOT NULL,
    active BIT NOT NULL DEFAULT 1,
    uploaded_by INT NULL,
    uploaded_at DATETIME2 DEFAULT SYSDATETIME(),
    schema_json NVARCHAR(MAX) NULL
  );
  CREATE UNIQUE INDEX UX_accounting_anaf_schemas_uuid ON dbo.accounting_anaf_schemas(uuid);
  CREATE INDEX IX_accounting_anaf_schemas_code ON dbo.accounting_anaf_schemas(code, active);
END;
GO
