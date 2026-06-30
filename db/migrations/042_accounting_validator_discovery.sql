IF SCHEMA_ID(N'accounting') IS NULL EXEC(N'CREATE SCHEMA accounting');

IF OBJECT_ID(N'accounting.validator_diagnostics', N'U') IS NULL
CREATE TABLE accounting.validator_diagnostics (
  id INT IDENTITY(1,1) PRIMARY KEY,
  code NVARCHAR(20) NOT NULL,
  command NVARCHAR(500) NULL,
  ok BIT NOT NULL DEFAULT 0,
  exit_code INT NULL,
  output NVARCHAR(MAX) NULL,
  tested_by INT NULL,
  tested_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
