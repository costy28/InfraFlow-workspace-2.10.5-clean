IF COL_LENGTH(N'hr.medical_leave_certificates', N'baza_calcul_zilnica') IS NULL
  ALTER TABLE hr.medical_leave_certificates ADD baza_calcul_zilnica DECIMAL(15,4) NULL;
IF COL_LENGTH(N'hr.medical_leave_certificates', N'procent_indemnizatie') IS NULL
  ALTER TABLE hr.medical_leave_certificates ADD procent_indemnizatie DECIMAL(6,2) NULL;
IF COL_LENGTH(N'hr.medical_leave_certificates', N'zile_angajator') IS NULL
  ALTER TABLE hr.medical_leave_certificates ADD zile_angajator INT NULL;
IF COL_LENGTH(N'hr.medical_leave_certificates', N'zile_fnuass') IS NULL
  ALTER TABLE hr.medical_leave_certificates ADD zile_fnuass INT NULL;
IF COL_LENGTH(N'hr.medical_leave_certificates', N'zile_neindemnizate') IS NULL
  ALTER TABLE hr.medical_leave_certificates ADD zile_neindemnizate INT NULL;
IF COL_LENGTH(N'hr.medical_leave_certificates', N'suma_angajator') IS NULL
  ALTER TABLE hr.medical_leave_certificates ADD suma_angajator DECIMAL(15,2) NULL;
IF COL_LENGTH(N'hr.medical_leave_certificates', N'suma_fnuass') IS NULL
  ALTER TABLE hr.medical_leave_certificates ADD suma_fnuass DECIMAL(15,2) NULL;
IF COL_LENGTH(N'hr.medical_leave_certificates', N'payroll_synced_at') IS NULL
  ALTER TABLE hr.medical_leave_certificates ADD payroll_synced_at DATETIME2 NULL;
IF COL_LENGTH(N'hr.medical_leave_certificates', N'payroll_synced_by') IS NULL
  ALTER TABLE hr.medical_leave_certificates ADD payroll_synced_by UNIQUEIDENTIFIER NULL;
