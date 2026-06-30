IF SCHEMA_ID(N'accounting') IS NULL EXEC(N'CREATE SCHEMA accounting');

IF OBJECT_ID(N'accounting.financial_statement_profiles', N'U') IS NULL
CREATE TABLE accounting.financial_statement_profiles (
  id INT IDENTITY(1,1) PRIMARY KEY,
  uuid CHAR(36) NOT NULL UNIQUE,
  code NVARCHAR(60) NOT NULL UNIQUE,
  label NVARCHAR(250) NOT NULL,
  entity_type NVARCHAR(50) NULL,
  valid_from DATE NULL,
  valid_to DATE NULL,
  source_url NVARCHAR(500) NULL,
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

IF COL_LENGTH(N'accounting.financial_statement_mappings', N'profile_code') IS NULL
ALTER TABLE accounting.financial_statement_mappings ADD profile_code NVARCHAR(60) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_financial_profiles_validity' AND object_id = OBJECT_ID(N'accounting.financial_statement_profiles'))
CREATE INDEX IX_financial_profiles_validity ON accounting.financial_statement_profiles(active, valid_from, valid_to);
