IF SCHEMA_ID(N'accounting') IS NULL EXEC(N'CREATE SCHEMA accounting');

IF OBJECT_ID(N'accounting.fiscal_acceptance_runs', N'U') IS NULL
CREATE TABLE accounting.fiscal_acceptance_runs (
  id INT IDENTITY(1,1) PRIMARY KEY,
  uuid CHAR(36) NOT NULL UNIQUE,
  perioada CHAR(7) NOT NULL,
  status NVARCHAR(30) NOT NULL,
  checksum CHAR(64) NOT NULL,
  report_json NVARCHAR(MAX) NULL,
  created_by INT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_fiscal_acceptance_period' AND object_id = OBJECT_ID(N'accounting.fiscal_acceptance_runs'))
CREATE INDEX IX_fiscal_acceptance_period ON accounting.fiscal_acceptance_runs(perioada, created_at);
