IF SCHEMA_ID(N'accounting') IS NULL EXEC(N'CREATE SCHEMA accounting');

IF OBJECT_ID(N'accounting.validator_configs', N'U') IS NULL
CREATE TABLE accounting.validator_configs (
  id INT IDENTITY(1,1) PRIMARY KEY,
  code NVARCHAR(20) NOT NULL UNIQUE,
  validator_path NVARCHAR(500) NULL,
  validator_command NVARCHAR(500) NULL,
  validator_args NVARCHAR(MAX) NULL,
  schema_version NVARCHAR(100) NULL,
  source_url NVARCHAR(1000) NULL,
  updated_by INT NULL,
  updated_at DATETIME2 NULL
);

IF OBJECT_ID(N'accounting.declaration_validation_runs', N'U') IS NULL
CREATE TABLE accounting.declaration_validation_runs (
  id INT IDENTITY(1,1) PRIMARY KEY,
  code NVARCHAR(20) NOT NULL,
  an INT NOT NULL,
  luna INT NOT NULL,
  perioada CHAR(7) NOT NULL,
  file_name NVARCHAR(250) NULL,
  stored_file NVARCHAR(1000) NULL,
  accepted BIT NOT NULL DEFAULT 0,
  exit_code INT NULL,
  stdout NVARCHAR(MAX) NULL,
  stderr NVARCHAR(MAX) NULL,
  sha256 CHAR(64) NULL,
  validator_path NVARCHAR(500) NULL,
  schema_version NVARCHAR(100) NULL,
  validated_at DATETIME2 NULL,
  created_by INT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);

CREATE INDEX ix_declaration_validation_period ON accounting.declaration_validation_runs(code, an, luna);
