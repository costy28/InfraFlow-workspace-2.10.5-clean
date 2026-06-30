IF SCHEMA_ID(N'accounting') IS NULL EXEC(N'CREATE SCHEMA accounting');

IF OBJECT_ID(N'accounting.saft_runs', N'U') IS NULL
CREATE TABLE accounting.saft_runs (
  id INT IDENTITY(1,1) PRIMARY KEY,
  uuid CHAR(36) NOT NULL UNIQUE,
  perioada CHAR(7) NOT NULL,
  status NVARCHAR(30) NOT NULL,
  schema_json NVARCHAR(MAX) NULL,
  source_summary_json NVARCHAR(MAX) NULL,
  issues_json NVARCHAR(MAX) NULL,
  validation_json NVARCHAR(MAX) NULL,
  stored_file NVARCHAR(500) NULL,
  sha256 CHAR(64) NOT NULL,
  created_by INT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_saft_runs_period' AND object_id = OBJECT_ID(N'accounting.saft_runs'))
CREATE INDEX IX_saft_runs_period ON accounting.saft_runs(perioada, status, created_at);
