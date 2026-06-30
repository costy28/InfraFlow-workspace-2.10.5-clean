IF SCHEMA_ID(N'accounting') IS NULL EXEC(N'CREATE SCHEMA accounting');

IF OBJECT_ID(N'accounting.financial_statement_mappings', N'U') IS NULL
CREATE TABLE accounting.financial_statement_mappings (
  id INT IDENTITY(1,1) PRIMARY KEY,
  uuid NVARCHAR(80) NOT NULL UNIQUE,
  statement_type NVARCHAR(20) NOT NULL,
  code NVARCHAR(30) NOT NULL,
  label NVARCHAR(250) NOT NULL,
  calculation NVARCHAR(30) NOT NULL,
  prefixes_json NVARCHAR(MAX) NULL,
  row_order INT NOT NULL DEFAULT 0,
  active BIT NOT NULL DEFAULT 1,
  system BIT NOT NULL DEFAULT 0,
  created_by INT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  updated_by INT NULL,
  updated_at DATETIME2 NULL,
  cancelled_by INT NULL,
  cancelled_at DATETIME2 NULL,
  cancelled_reason NVARCHAR(500) NULL
);

IF OBJECT_ID(N'accounting.financial_statement_runs', N'U') IS NULL
CREATE TABLE accounting.financial_statement_runs (
  id INT IDENTITY(1,1) PRIMARY KEY,
  statement_type NVARCHAR(20) NOT NULL,
  an INT NOT NULL,
  luna INT NOT NULL,
  status NVARCHAR(20) NOT NULL DEFAULT N'generat',
  report_json NVARCHAR(MAX) NULL,
  created_by INT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);

CREATE INDEX IX_financial_statement_mappings_type ON accounting.financial_statement_mappings(statement_type, active, row_order);
CREATE INDEX IX_financial_statement_runs_period ON accounting.financial_statement_runs(an, luna, statement_type);
