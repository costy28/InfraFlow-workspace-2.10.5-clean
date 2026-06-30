IF OBJECT_ID(N'accounting.declaration_validation_runs', N'U') IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_declaration_validation_accepted' AND object_id = OBJECT_ID(N'accounting.declaration_validation_runs'))
CREATE INDEX ix_declaration_validation_accepted ON accounting.declaration_validation_runs(code, perioada, accepted);

IF OBJECT_ID(N'hr.payroll_payment_orders', N'U') IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_payroll_payment_orders_run' AND object_id = OBJECT_ID(N'hr.payroll_payment_orders'))
CREATE INDEX ix_payroll_payment_orders_run ON hr.payroll_payment_orders(run_id, status);
