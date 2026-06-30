IF SCHEMA_ID(N'hr') IS NULL EXEC(N'CREATE SCHEMA hr');

IF OBJECT_ID(N'hr.payroll_payment_orders', N'U') IS NULL
CREATE TABLE hr.payroll_payment_orders (
  id INT IDENTITY(1,1) PRIMARY KEY,
  uuid CHAR(36) NOT NULL UNIQUE,
  run_id INT NOT NULL,
  luna CHAR(7) NOT NULL,
  code NVARCHAR(20) NOT NULL,
  label NVARCHAR(200) NOT NULL,
  beneficiary NVARCHAR(200) NULL,
  budget_account NVARCHAR(100) NULL,
  accounting_account NVARCHAR(30) NOT NULL,
  amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  due_date DATE NULL,
  status NVARCHAR(20) NOT NULL DEFAULT N'pregatit',
  payment_date DATE NULL,
  treasury_uuid CHAR(36) NULL,
  accounting_journal_id INT NULL,
  storno_journal_id INT NULL,
  created_by INT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  paid_by INT NULL,
  paid_at DATETIME2 NULL,
  cancelled_by INT NULL,
  cancelled_at DATETIME2 NULL,
  cancelled_reason NVARCHAR(500) NULL,
  CONSTRAINT fk_payroll_payment_orders_run FOREIGN KEY (run_id) REFERENCES hr.payroll_runs(id)
);
