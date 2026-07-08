IF COL_LENGTH(N'hr.time_sheets', N'overtime_status') IS NULL
  ALTER TABLE hr.time_sheets ADD overtime_status NVARCHAR(20) NULL;
IF COL_LENGTH(N'hr.time_sheets', N'overtime_approved_by') IS NULL
  ALTER TABLE hr.time_sheets ADD overtime_approved_by NVARCHAR(100) NULL;
IF COL_LENGTH(N'hr.time_sheets', N'overtime_approved_at') IS NULL
  ALTER TABLE hr.time_sheets ADD overtime_approved_at DATETIME2 NULL;
IF COL_LENGTH(N'hr.time_sheets', N'overtime_rejection_reason') IS NULL
  ALTER TABLE hr.time_sheets ADD overtime_rejection_reason NVARCHAR(500) NULL;

