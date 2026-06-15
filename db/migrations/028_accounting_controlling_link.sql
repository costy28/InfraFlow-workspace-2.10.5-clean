/*
  InfraFlow - legatura Contabilitate -> Controlling
*/

IF COL_LENGTH('dbo.accounting_invoices_in', 'cost_center_id') IS NULL
  ALTER TABLE dbo.accounting_invoices_in ADD cost_center_id INT NULL;
GO
IF COL_LENGTH('dbo.accounting_invoices_in', 'subcentru_id') IS NULL
  ALTER TABLE dbo.accounting_invoices_in ADD subcentru_id INT NULL;
GO
IF COL_LENGTH('dbo.accounting_invoices_in', 'santier_id') IS NULL
  ALTER TABLE dbo.accounting_invoices_in ADD santier_id INT NULL;
GO
IF COL_LENGTH('dbo.accounting_invoices_in', 'controlling_registered') IS NULL
  ALTER TABLE dbo.accounting_invoices_in ADD controlling_registered BIT NULL;
GO

IF COL_LENGTH('dbo.accounting_invoices_out', 'cost_center_id') IS NULL
  ALTER TABLE dbo.accounting_invoices_out ADD cost_center_id INT NULL;
GO
IF COL_LENGTH('dbo.accounting_invoices_out', 'subcentru_id') IS NULL
  ALTER TABLE dbo.accounting_invoices_out ADD subcentru_id INT NULL;
GO
IF COL_LENGTH('dbo.accounting_invoices_out', 'santier_id') IS NULL
  ALTER TABLE dbo.accounting_invoices_out ADD santier_id INT NULL;
GO

IF COL_LENGTH('dbo.accounting_journals', 'cost_center_id') IS NULL
  ALTER TABLE dbo.accounting_journals ADD cost_center_id INT NULL;
GO
IF COL_LENGTH('dbo.accounting_journals', 'subcentru_id') IS NULL
  ALTER TABLE dbo.accounting_journals ADD subcentru_id INT NULL;
GO

IF COL_LENGTH('dbo.accounting_journal_lines', 'cost_center_id') IS NULL
  ALTER TABLE dbo.accounting_journal_lines ADD cost_center_id INT NULL;
GO
IF COL_LENGTH('dbo.accounting_journal_lines', 'subcentru_id') IS NULL
  ALTER TABLE dbo.accounting_journal_lines ADD subcentru_id INT NULL;
GO
