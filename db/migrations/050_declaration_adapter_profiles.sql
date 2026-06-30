IF SCHEMA_ID(N'accounting') IS NULL EXEC(N'CREATE SCHEMA accounting');

IF OBJECT_ID(N'accounting.declaration_adapter_profiles', N'U') IS NULL
CREATE TABLE accounting.declaration_adapter_profiles (
  id INT IDENTITY(1,1) PRIMARY KEY,
  uuid CHAR(36) NOT NULL UNIQUE,
  declaration_code NVARCHAR(20) NOT NULL,
  schema_id INT NULL,
  mapping_json NVARCHAR(MAX) NULL,
  active BIT NOT NULL DEFAULT 1,
  created_by INT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  updated_by INT NULL,
  updated_at DATETIME2 NULL,
  cancelled_by INT NULL,
  cancelled_at DATETIME2 NULL,
  cancelled_reason NVARCHAR(500) NULL
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_declaration_adapter_code' AND object_id = OBJECT_ID(N'accounting.declaration_adapter_profiles'))
CREATE INDEX IX_declaration_adapter_code ON accounting.declaration_adapter_profiles(declaration_code, active);
