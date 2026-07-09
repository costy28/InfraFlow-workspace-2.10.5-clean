/*
  InfraFlow - Acte aditionale contracte HR
*/

SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'hr') EXEC(N'CREATE SCHEMA hr');

IF OBJECT_ID(N'hr.contract_amendments', N'U') IS NULL
BEGIN
  CREATE TABLE hr.contract_amendments (
    id int identity(1,1) not null constraint pk_hr_contract_amendments primary key,
    uuid uniqueidentifier not null constraint df_hr_contract_amendments_uuid default newid(),
    employee_id int not null,
    contract_id int not null,
    tip nvarchar(40) not null,
    numar_act nvarchar(100) null,
    data_act date null,
    data_efect date not null,
    salariu_baza decimal(15,2) null,
    norma_ore decimal(5,2) null,
    functia nvarchar(150) null,
    functie_cor nvarchar(20) null,
    department_id uniqueidentifier null,
    status_contract nvarchar(30) null,
    observatii nvarchar(max) null,
    created_by uniqueidentifier null,
    created_at datetime2(0) not null constraint df_hr_contract_amendments_created_at default sysdatetime(),
    cancelled_at datetime2(0) null,
    cancelled_by uniqueidentifier null,
    cancelled_reason nvarchar(300) null,
    constraint ck_hr_contract_amendments_tip check (tip in (N'salariu', N'functie', N'norma', N'departament', N'suspendare', N'incetare', N'altul')),
    constraint ck_hr_contract_amendments_status check (status_contract is null or status_contract in (N'activ', N'suspendat', N'incetat')),
    constraint fk_hr_contract_amendments_employee foreign key (employee_id) references hr.employees(id) on delete no action,
    constraint fk_hr_contract_amendments_contract foreign key (contract_id) references hr.contracts(id) on delete no action
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_hr_contract_amendments_employee' AND object_id = OBJECT_ID(N'hr.contract_amendments'))
  CREATE INDEX ix_hr_contract_amendments_employee ON hr.contract_amendments(employee_id, data_efect DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_hr_contract_amendments_contract' AND object_id = OBJECT_ID(N'hr.contract_amendments'))
  CREATE INDEX ix_hr_contract_amendments_contract ON hr.contract_amendments(contract_id, data_efect DESC);

COMMIT;
