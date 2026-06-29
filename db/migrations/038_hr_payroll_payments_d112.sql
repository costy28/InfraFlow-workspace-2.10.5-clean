IF SCHEMA_ID(N'hr') IS NULL EXEC(N'CREATE SCHEMA hr');

IF OBJECT_ID(N'hr.payroll_bank_profiles', N'U') IS NULL
CREATE TABLE hr.payroll_bank_profiles (
  id INT IDENTITY(1,1) PRIMARY KEY,
  uuid NVARCHAR(80) NOT NULL UNIQUE,
  name NVARCHAR(150) NOT NULL,
  bank_name NVARCHAR(150) NULL,
  format NVARCHAR(30) NOT NULL,
  treasury_account NVARCHAR(30) NOT NULL DEFAULT N'5121',
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

IF COL_LENGTH(N'hr.payroll_adjustments', N'quantity') IS NULL ALTER TABLE hr.payroll_adjustments ADD quantity DECIMAL(18,2) NULL;
IF COL_LENGTH(N'hr.payroll_adjustments', N'unit_value') IS NULL ALTER TABLE hr.payroll_adjustments ADD unit_value DECIMAL(18,2) NULL;
IF COL_LENGTH(N'hr.payroll_adjustments', N'certificate_code') IS NULL ALTER TABLE hr.payroll_adjustments ADD certificate_code NVARCHAR(50) NULL;
IF COL_LENGTH(N'hr.payroll_adjustments', N'operator_confirmed') IS NULL ALTER TABLE hr.payroll_adjustments ADD operator_confirmed BIT NOT NULL DEFAULT 0;
IF COL_LENGTH(N'hr.payroll_payments', N'uuid') IS NULL ALTER TABLE hr.payroll_payments ADD uuid NVARCHAR(80) NULL;
IF COL_LENGTH(N'hr.payroll_payments', N'profile_id') IS NULL ALTER TABLE hr.payroll_payments ADD profile_id NVARCHAR(80) NULL;
IF COL_LENGTH(N'hr.payroll_payments', N'treasury_uuid') IS NULL ALTER TABLE hr.payroll_payments ADD treasury_uuid NVARCHAR(80) NULL;
IF COL_LENGTH(N'hr.payroll_payments', N'payment_date') IS NULL ALTER TABLE hr.payroll_payments ADD payment_date DATE NULL;
IF COL_LENGTH(N'hr.payroll_payments', N'storno_journal_id') IS NULL ALTER TABLE hr.payroll_payments ADD storno_journal_id INT NULL;
IF COL_LENGTH(N'hr.payroll_runs', N'accounting_storno_journal_id') IS NULL ALTER TABLE hr.payroll_runs ADD accounting_storno_journal_id INT NULL;
IF COL_LENGTH(N'hr.payroll_runs', N'accounting_reversed_at') IS NULL ALTER TABLE hr.payroll_runs ADD accounting_reversed_at DATETIME2 NULL;
IF COL_LENGTH(N'hr.payroll_runs', N'accounting_reversed_by') IS NULL ALTER TABLE hr.payroll_runs ADD accounting_reversed_by INT NULL;
IF COL_LENGTH(N'hr.payroll_runs', N'accounting_reversal_reason') IS NULL ALTER TABLE hr.payroll_runs ADD accounting_reversal_reason NVARCHAR(500) NULL;
IF COL_LENGTH(N'hr.payroll_runs', N'payment_status') IS NULL ALTER TABLE hr.payroll_runs ADD payment_status NVARCHAR(20) NULL;
IF COL_LENGTH(N'hr.payroll_runs', N'paid_at') IS NULL ALTER TABLE hr.payroll_runs ADD paid_at DATETIME2 NULL;
