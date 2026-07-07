IF OBJECT_ID(N'hr.employee_files', N'U') IS NULL
BEGIN
  CREATE TABLE hr.employee_files (
    id INT IDENTITY(1,1) PRIMARY KEY,
    uuid CHAR(36) NOT NULL UNIQUE,
    employee_id INT NOT NULL,
    tip NVARCHAR(50) NOT NULL,
    denumire NVARCHAR(200) NULL,
    file_name NVARCHAR(200) NOT NULL,
    stored_name NVARCHAR(200) NOT NULL,
    mime_type NVARCHAR(100) NULL,
    file_size INT NULL,
    data_document DATE NULL,
    data_expirare DATE NULL,
    uploaded_by NVARCHAR(100) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    cancelled_at DATETIME2 NULL,
    cancelled_by NVARCHAR(100) NULL,
    cancelled_reason NVARCHAR(500) NULL
  );
END;

IF OBJECT_ID(N'hr.timesheet_locks', N'U') IS NULL
BEGIN
  CREATE TABLE hr.timesheet_locks (
    id INT IDENTITY(1,1) PRIMARY KEY,
    luna CHAR(7) NOT NULL,
    motiv NVARCHAR(500) NULL,
    locked_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    locked_by NVARCHAR(100) NULL,
    unlocked_at DATETIME2 NULL,
    unlocked_by NVARCHAR(100) NULL,
    unlock_reason NVARCHAR(500) NULL
  );
  CREATE INDEX IX_hr_timesheet_locks_luna ON hr.timesheet_locks(luna);
END;
