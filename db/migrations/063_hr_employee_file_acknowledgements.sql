IF OBJECT_ID(N'hr.employee_files', N'U') IS NOT NULL
BEGIN
  IF COL_LENGTH(N'hr.employee_files', N'generated') IS NULL
    ALTER TABLE hr.employee_files ADD generated BIT NOT NULL CONSTRAINT DF_hr_employee_files_generated DEFAULT 0;

  IF COL_LENGTH(N'hr.employee_files', N'generated_source') IS NULL
    ALTER TABLE hr.employee_files ADD generated_source NVARCHAR(80) NULL;

  IF COL_LENGTH(N'hr.employee_files', N'requires_ack') IS NULL
    ALTER TABLE hr.employee_files ADD requires_ack BIT NOT NULL CONSTRAINT DF_hr_employee_files_requires_ack DEFAULT 0;

  IF COL_LENGTH(N'hr.employee_files', N'kiosk_visible') IS NULL
    ALTER TABLE hr.employee_files ADD kiosk_visible BIT NOT NULL CONSTRAINT DF_hr_employee_files_kiosk_visible DEFAULT 0;

  IF COL_LENGTH(N'hr.employee_files', N'acknowledged_at') IS NULL
    ALTER TABLE hr.employee_files ADD acknowledged_at DATETIME2 NULL;

  IF COL_LENGTH(N'hr.employee_files', N'acknowledged_by') IS NULL
    ALTER TABLE hr.employee_files ADD acknowledged_by NVARCHAR(100) NULL;

  IF COL_LENGTH(N'hr.employee_files', N'acknowledged_by_name') IS NULL
    ALTER TABLE hr.employee_files ADD acknowledged_by_name NVARCHAR(200) NULL;

  IF COL_LENGTH(N'hr.employee_files', N'acknowledged_note') IS NULL
    ALTER TABLE hr.employee_files ADD acknowledged_note NVARCHAR(300) NULL;

  IF COL_LENGTH(N'hr.employee_files', N'acknowledged_ip') IS NULL
    ALTER TABLE hr.employee_files ADD acknowledged_ip NVARCHAR(80) NULL;

  UPDATE hr.employee_files
  SET requires_ack = 1, kiosk_visible = 1
  WHERE ISNULL(generated, 0) = 1
    AND cancelled_at IS NULL;
END;
