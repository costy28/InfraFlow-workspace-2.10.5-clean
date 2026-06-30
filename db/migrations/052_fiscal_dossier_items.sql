IF SCHEMA_ID(N'accounting') IS NULL EXEC(N'CREATE SCHEMA accounting');

IF OBJECT_ID(N'accounting.fiscal_dossier_items', N'U') IS NULL
CREATE TABLE accounting.fiscal_dossier_items (
  id INT IDENTITY(1,1) PRIMARY KEY,
  dossier_id INT NULL,
  an INT NOT NULL,
  luna INT NOT NULL,
  category NVARCHAR(40) NOT NULL,
  document_code NVARCHAR(40) NULL,
  original_name NVARCHAR(250) NULL,
  stored_file NVARCHAR(500) NULL,
  sha256 CHAR(64) NULL,
  validation_status NVARCHAR(30) NULL,
  created_by INT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_fiscal_dossier_items_period' AND object_id = OBJECT_ID(N'accounting.fiscal_dossier_items'))
CREATE INDEX IX_fiscal_dossier_items_period ON accounting.fiscal_dossier_items(an, luna, category);
