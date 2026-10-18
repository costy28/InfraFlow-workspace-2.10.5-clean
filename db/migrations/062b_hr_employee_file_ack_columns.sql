-- Pregătire înainte de 063: SQL Server compilează UPDATE înaintea ALTER TABLE
-- din același batch. Păstrăm migrarea istorică și separăm coloanele referite.
IF OBJECT_ID(N'hr.employee_files', N'U') IS NOT NULL
BEGIN
  IF COL_LENGTH(N'hr.employee_files', N'generated') IS NULL
    ALTER TABLE hr.employee_files ADD generated BIT NOT NULL CONSTRAINT DF_hr_employee_files_generated DEFAULT 0;

  IF COL_LENGTH(N'hr.employee_files', N'requires_ack') IS NULL
    ALTER TABLE hr.employee_files ADD requires_ack BIT NOT NULL CONSTRAINT DF_hr_employee_files_requires_ack DEFAULT 0;

  IF COL_LENGTH(N'hr.employee_files', N'kiosk_visible') IS NULL
    ALTER TABLE hr.employee_files ADD kiosk_visible BIT NOT NULL CONSTRAINT DF_hr_employee_files_kiosk_visible DEFAULT 0;
END;
