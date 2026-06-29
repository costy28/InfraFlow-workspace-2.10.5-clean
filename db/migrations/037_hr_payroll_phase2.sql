IF SCHEMA_ID(N'hr') IS NULL EXEC(N'CREATE SCHEMA hr');

IF OBJECT_ID(N'hr.payroll_adjustments', N'U') IS NULL
CREATE TABLE hr.payroll_adjustments (
  id INT IDENTITY(1,1) PRIMARY KEY,
  uuid NVARCHAR(80) NOT NULL UNIQUE,
  employee_id INT NOT NULL,
  tip NVARCHAR(40) NOT NULL,
  cod NVARCHAR(50) NULL,
  descriere NVARCHAR(250) NULL,
  amount DECIMAL(18,2) NOT NULL,
  data_start DATE NOT NULL,
  data_sfarsit DATE NOT NULL,
  recurent BIT NOT NULL DEFAULT 0,
  active BIT NOT NULL DEFAULT 1,
  created_by INT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  updated_by INT NULL,
  updated_at DATETIME2 NULL,
  cancelled_by INT NULL,
  cancelled_at DATETIME2 NULL,
  cancelled_reason NVARCHAR(500) NULL
);

IF OBJECT_ID(N'hr.payroll_payments', N'U') IS NULL
CREATE TABLE hr.payroll_payments (
  id INT IDENTITY(1,1) PRIMARY KEY,
  run_id INT NOT NULL,
  status NVARCHAR(20) NOT NULL DEFAULT N'pregatit',
  amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  bank_file_name NVARCHAR(250) NULL,
  accounting_journal_id INT NULL,
  created_by INT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  cancelled_by INT NULL,
  cancelled_at DATETIME2 NULL,
  cancelled_reason NVARCHAR(500) NULL,
  CONSTRAINT fk_payroll_payments_run FOREIGN KEY (run_id) REFERENCES hr.payroll_runs(id)
);

IF COL_LENGTH(N'hr.payroll_runs', N'accounting_journal_id') IS NULL
  ALTER TABLE hr.payroll_runs ADD accounting_journal_id INT NULL;
