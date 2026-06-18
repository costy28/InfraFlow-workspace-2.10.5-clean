IF OBJECT_ID(N'hr.department_transfers', N'U') IS NULL
BEGIN
  CREATE TABLE hr.department_transfers (
    id INT IDENTITY(1,1) PRIMARY KEY,
    uuid CHAR(36) UNIQUE NOT NULL,
    employee_id INT NOT NULL,
    dept_vechi NVARCHAR(80) NULL,
    dept_nou NVARCHAR(80) NOT NULL,
    data_transfer DATE NOT NULL,
    motiv NVARCHAR(500) NULL,
    aprobat_de uniqueidentifier NULL,
    created_at datetime2 DEFAULT sysdatetime(),
    CONSTRAINT FK_hr_department_transfers_employee FOREIGN KEY (employee_id) REFERENCES hr.employees(id) ON DELETE NO ACTION,
    CONSTRAINT FK_hr_department_transfers_user FOREIGN KEY (aprobat_de) REFERENCES core.users(id) ON DELETE NO ACTION
  )
END

IF OBJECT_ID(N'hr.timesheet_departments', N'U') IS NULL
BEGIN
  CREATE TABLE hr.timesheet_departments (
    id INT IDENTITY(1,1) PRIMARY KEY,
    luna CHAR(7) NOT NULL,
    department_cod NVARCHAR(80) NOT NULL,
    status NVARCHAR(30) DEFAULT N'in_lucru',
    completat_la datetime2 NULL,
    completat_de uniqueidentifier NULL,
    created_at datetime2 DEFAULT sysdatetime(),
    updated_at datetime2 NULL,
    CONSTRAINT UQ_hr_timesheet_departments UNIQUE (luna, department_cod),
    CONSTRAINT FK_hr_timesheet_departments_user FOREIGN KEY (completat_de) REFERENCES core.users(id) ON DELETE NO ACTION
  )
END

IF COL_LENGTH('hr.employees', 'sex') IS NULL
BEGIN
  ALTER TABLE hr.employees ADD
    sex NVARCHAR(1) NULL,
    data_nasterii DATE NULL,
    varsta INT NULL,
    department_cod NVARCHAR(80) NULL,
    tip_contract NVARCHAR(50) NULL
END

IF OBJECT_ID(N'core.app_settings', N'U') IS NOT NULL
AND COL_LENGTH('core.app_settings', 'smtp_host') IS NULL
BEGIN
  ALTER TABLE core.app_settings ADD
    smtp_host NVARCHAR(200) NULL,
    smtp_port INT NULL,
    smtp_user NVARCHAR(200) NULL,
    smtp_password_encrypted NVARCHAR(500) NULL,
    smtp_name NVARCHAR(200) NULL
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_hr_department_transfers_employee' AND object_id = OBJECT_ID(N'hr.department_transfers'))
BEGIN
  CREATE INDEX IX_hr_department_transfers_employee ON hr.department_transfers(employee_id, data_transfer)
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_hr_timesheet_departments_luna' AND object_id = OBJECT_ID(N'hr.timesheet_departments'))
BEGIN
  CREATE INDEX IX_hr_timesheet_departments_luna ON hr.timesheet_departments(luna, status)
END
