IF OBJECT_ID(N'dbo.accounting_anaf_schemas', N'U') IS NOT NULL
BEGIN
  IF COL_LENGTH(N'dbo.accounting_anaf_schemas', N'valid_from') IS NULL ALTER TABLE dbo.accounting_anaf_schemas ADD valid_from DATE NULL;
  IF COL_LENGTH(N'dbo.accounting_anaf_schemas', N'valid_to') IS NULL ALTER TABLE dbo.accounting_anaf_schemas ADD valid_to DATE NULL;
  IF COL_LENGTH(N'dbo.accounting_anaf_schemas', N'order_reference') IS NULL ALTER TABLE dbo.accounting_anaf_schemas ADD order_reference NVARCHAR(200) NULL;
  IF COL_LENGTH(N'dbo.accounting_anaf_schemas', N'source_url') IS NULL ALTER TABLE dbo.accounting_anaf_schemas ADD source_url NVARCHAR(1000) NULL;
END;

IF OBJECT_ID(N'dbo.accounting_anaf_schemas', N'U') IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_accounting_anaf_schemas_period' AND object_id = OBJECT_ID(N'dbo.accounting_anaf_schemas'))
CREATE INDEX IX_accounting_anaf_schemas_period ON dbo.accounting_anaf_schemas(code, active, valid_from, valid_to);
