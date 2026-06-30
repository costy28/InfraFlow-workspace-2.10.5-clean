IF SCHEMA_ID(N'hr') IS NULL EXEC(N'CREATE SCHEMA hr');

IF COL_LENGTH(N'hr.payroll_runs', N'run_type') IS NULL ALTER TABLE hr.payroll_runs ADD run_type NVARCHAR(20) NOT NULL DEFAULT N'normal';
IF COL_LENGTH(N'hr.payroll_runs', N'parent_run_id') IS NULL ALTER TABLE hr.payroll_runs ADD parent_run_id INT NULL;
IF COL_LENGTH(N'hr.payroll_runs', N'revision_no') IS NULL ALTER TABLE hr.payroll_runs ADD revision_no INT NULL;
IF COL_LENGTH(N'hr.payroll_runs', N'correction_reason') IS NULL ALTER TABLE hr.payroll_runs ADD correction_reason NVARCHAR(500) NULL;
IF COL_LENGTH(N'hr.payroll_lines', N'source_line_id') IS NULL ALTER TABLE hr.payroll_lines ADD source_line_id INT NULL;
IF COL_LENGTH(N'hr.payroll_lines', N'unpaid_leave_days') IS NULL ALTER TABLE hr.payroll_lines ADD unpaid_leave_days DECIMAL(8,2) NULL;
IF COL_LENGTH(N'hr.payroll_adjustments', N'medical_employer_amount') IS NULL ALTER TABLE hr.payroll_adjustments ADD medical_employer_amount DECIMAL(18,2) NULL;
IF COL_LENGTH(N'hr.payroll_adjustments', N'medical_fund_amount') IS NULL ALTER TABLE hr.payroll_adjustments ADD medical_fund_amount DECIMAL(18,2) NULL;
IF COL_LENGTH(N'hr.payroll_adjustments', N'medical_diagnostic_code') IS NULL ALTER TABLE hr.payroll_adjustments ADD medical_diagnostic_code NVARCHAR(30) NULL;
