IF SCHEMA_ID(N'accounting') IS NULL EXEC(N'CREATE SCHEMA accounting');

IF OBJECT_ID(N'accounting.fiscal_audit_findings', N'U') IS NULL
CREATE TABLE accounting.fiscal_audit_findings (
  id INT IDENTITY(1,1) PRIMARY KEY,
  uuid CHAR(36) NOT NULL UNIQUE,
  perioada CHAR(7) NOT NULL,
  finding_key NVARCHAR(100) NOT NULL,
  severity NVARCHAR(20) NOT NULL,
  message NVARCHAR(1000) NOT NULL,
  next_action NVARCHAR(1000) NULL,
  status NVARCHAR(20) NOT NULL DEFAULT N'deschis',
  resolved_by INT NULL,
  resolved_at DATETIME2 NULL,
  resolution_note NVARCHAR(1000) NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_fiscal_findings_period' AND object_id = OBJECT_ID(N'accounting.fiscal_audit_findings'))
CREATE INDEX IX_fiscal_findings_period ON accounting.fiscal_audit_findings(perioada, status, severity);
