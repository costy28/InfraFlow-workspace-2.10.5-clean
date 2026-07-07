IF OBJECT_ID('dbo.accounting_withholding_tax_entries', 'U') IS NULL
CREATE TABLE dbo.accounting_withholding_tax_entries (
  id INT IDENTITY(1,1) PRIMARY KEY, uuid NVARCHAR(80) NOT NULL,
  an INT NOT NULL, cnp_cui NVARCHAR(30) NOT NULL, nume NVARCHAR(250) NOT NULL,
  tip_venit NVARCHAR(100) NOT NULL, venit_brut DECIMAL(18,2) NOT NULL DEFAULT 0,
  impozit_retinut DECIMAL(18,2) NOT NULL DEFAULT 0, observatii NVARCHAR(500) NULL,
  cancelled_at DATETIME2 NULL, cancelled_by NVARCHAR(80) NULL, cancelled_reason NVARCHAR(500) NULL,
  updated_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(), updated_by NVARCHAR(80) NULL
);

IF OBJECT_ID('dbo.accounting_intrastat_entries', 'U') IS NULL
CREATE TABLE dbo.accounting_intrastat_entries (
  id INT IDENTITY(1,1) PRIMARY KEY, uuid NVARCHAR(80) NOT NULL,
  an INT NOT NULL, luna INT NOT NULL, flux NVARCHAR(20) NOT NULL,
  tara_partenera CHAR(2) NOT NULL, cod_nc CHAR(8) NOT NULL, natura_tranzactie NVARCHAR(10) NULL,
  masa_neta DECIMAL(18,3) NOT NULL DEFAULT 0, valoare_facturata DECIMAL(18,2) NOT NULL DEFAULT 0,
  descriere NVARCHAR(500) NULL, cancelled_at DATETIME2 NULL, cancelled_by NVARCHAR(80) NULL,
  cancelled_reason NVARCHAR(500) NULL, updated_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(), updated_by NVARCHAR(80) NULL
);
