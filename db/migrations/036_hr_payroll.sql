IF SCHEMA_ID(N'hr') IS NULL EXEC(N'CREATE SCHEMA hr');

IF OBJECT_ID(N'hr.payroll_profiles', N'U') IS NULL
CREATE TABLE hr.payroll_profiles (
  id INT IDENTITY(1,1) PRIMARY KEY,
  uuid NVARCHAR(80) NOT NULL UNIQUE,
  name NVARCHAR(200) NOT NULL,
  effective_from DATE NOT NULL,
  cas_rate DECIMAL(6,3) NOT NULL,
  cass_rate DECIMAL(6,3) NOT NULL,
  income_tax_rate DECIMAL(6,3) NOT NULL,
  cam_rate DECIMAL(6,3) NOT NULL,
  profile_json NVARCHAR(MAX) NULL,
  active BIT NOT NULL DEFAULT 1,
  created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);

IF OBJECT_ID(N'hr.payroll_runs', N'U') IS NULL
CREATE TABLE hr.payroll_runs (
  id INT IDENTITY(1,1) PRIMARY KEY,
  uuid CHAR(36) NOT NULL UNIQUE,
  luna CHAR(7) NOT NULL,
  status NVARCHAR(20) NOT NULL DEFAULT N'draft',
  employee_count INT NOT NULL DEFAULT 0,
  total_gross DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_net DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_employer_cost DECIMAL(18,2) NOT NULL DEFAULT 0,
  run_json NVARCHAR(MAX) NULL,
  validated_by INT NULL,
  validated_at DATETIME2 NULL,
  cancelled_by INT NULL,
  cancelled_at DATETIME2 NULL,
  cancelled_reason NVARCHAR(500) NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);

IF OBJECT_ID(N'hr.payroll_lines', N'U') IS NULL
CREATE TABLE hr.payroll_lines (
  id INT IDENTITY(1,1) PRIMARY KEY,
  run_id INT NOT NULL,
  employee_id INT NOT NULL,
  gross DECIMAL(18,2) NOT NULL DEFAULT 0,
  cas DECIMAL(18,2) NOT NULL DEFAULT 0,
  cass DECIMAL(18,2) NOT NULL DEFAULT 0,
  income_tax DECIMAL(18,2) NOT NULL DEFAULT 0,
  net DECIMAL(18,2) NOT NULL DEFAULT 0,
  cam DECIMAL(18,2) NOT NULL DEFAULT 0,
  line_json NVARCHAR(MAX) NULL,
  cancelled_at DATETIME2 NULL,
  CONSTRAINT fk_payroll_lines_run FOREIGN KEY (run_id) REFERENCES hr.payroll_runs(id)
);
