IF COL_LENGTH(N'hr.time_sheets', N'ore_compensate') IS NULL
  ALTER TABLE hr.time_sheets ADD ore_compensate DECIMAL(5,2) NOT NULL CONSTRAINT df_hr_time_sheets_ore_compensate DEFAULT 0;
