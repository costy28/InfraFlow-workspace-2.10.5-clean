IF SCHEMA_ID(N'accounting') IS NULL EXEC(N'CREATE SCHEMA accounting');

IF OBJECT_ID(N'accounting.declaration_candidates', N'U') IS NULL
CREATE TABLE accounting.declaration_candidates (
  id INT IDENTITY(1,1) PRIMARY KEY,
  code NVARCHAR(20) NOT NULL,
  an INT NOT NULL,
  luna INT NOT NULL,
  perioada CHAR(7) NOT NULL,
  schema_version NVARCHAR(100) NULL,
  stored_file NVARCHAR(1000) NOT NULL,
  sha256 CHAR(64) NOT NULL,
  accepted BIT NOT NULL DEFAULT 0,
  validation_json NVARCHAR(MAX) NULL,
  created_by INT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);

CREATE INDEX ix_declaration_candidates_period ON accounting.declaration_candidates(code, an, luna, accepted);
