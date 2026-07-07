IF COL_LENGTH('dbo.accounting_withholding_tax_entries', 'tip_plata') IS NULL
  ALTER TABLE dbo.accounting_withholding_tax_entries ADD tip_plata INT NULL;
IF COL_LENGTH('dbo.accounting_withholding_tax_entries', 'rezidenta') IS NULL
  ALTER TABLE dbo.accounting_withholding_tax_entries ADD rezidenta INT NULL;
IF COL_LENGTH('dbo.accounting_withholding_tax_entries', 'stat_rezidenta') IS NULL
  ALTER TABLE dbo.accounting_withholding_tax_entries ADD stat_rezidenta CHAR(2) NULL;
IF COL_LENGTH('dbo.accounting_withholding_tax_entries', 'dividende_distribuite') IS NULL
  ALTER TABLE dbo.accounting_withholding_tax_entries ADD dividende_distribuite DECIMAL(18,2) NOT NULL DEFAULT 0;
IF COL_LENGTH('dbo.accounting_withholding_tax_entries', 'dividende_platite') IS NULL
  ALTER TABLE dbo.accounting_withholding_tax_entries ADD dividende_platite DECIMAL(18,2) NOT NULL DEFAULT 0;

IF COL_LENGTH('dbo.accounting_intrastat_entries', 'tara_origine') IS NULL
  ALTER TABLE dbo.accounting_intrastat_entries ADD tara_origine CHAR(2) NULL;
IF COL_LENGTH('dbo.accounting_intrastat_entries', 'judet_destinatie') IS NULL
  ALTER TABLE dbo.accounting_intrastat_entries ADD judet_destinatie CHAR(2) NULL;
IF COL_LENGTH('dbo.accounting_intrastat_entries', 'conditie_livrare') IS NULL
  ALTER TABLE dbo.accounting_intrastat_entries ADD conditie_livrare NVARCHAR(10) NULL;
IF COL_LENGTH('dbo.accounting_intrastat_entries', 'mod_transport') IS NULL
  ALTER TABLE dbo.accounting_intrastat_entries ADD mod_transport NVARCHAR(10) NULL;
IF COL_LENGTH('dbo.accounting_intrastat_entries', 'valoare_statistica') IS NULL
  ALTER TABLE dbo.accounting_intrastat_entries ADD valoare_statistica DECIMAL(18,2) NOT NULL DEFAULT 0;
