/*
  InfraFlow - HR complet / REGES
*/

SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'hr') EXEC(N'CREATE SCHEMA hr');

IF OBJECT_ID(N'hr.employees', N'U') IS NULL
BEGIN
  CREATE TABLE hr.employees (
    id int identity(1,1) not null constraint pk_hr_employees primary key,
    uuid char(36) not null,
    user_id nvarchar(64) null,
    company_id int not null,
    marca nvarchar(50) null,
    nume nvarchar(100) not null,
    prenume nvarchar(100) not null,
    cnp nvarchar(13) null,
    email nvarchar(200) null,
    telefon nvarchar(50) null,
    functia nvarchar(150) null,
    department_id nvarchar(64) null,
    data_angajare date null,
    data_plecare date null,
    activ bit not null constraint df_hr_employees_activ default 1,
    created_at datetime2(0) not null constraint df_hr_employees_created_at default sysdatetime(),
    updated_at datetime2(0) null,
    constraint uq_hr_employees_uuid unique (uuid),
    constraint uq_hr_employees_marca unique (marca),
    constraint fk_hr_employees_user foreign key (user_id) references core.users(id) on delete no action,
    constraint fk_hr_employees_department foreign key (department_id) references core.departments(id) on delete no action
  );
END;

IF OBJECT_ID(N'hr.contracts', N'U') IS NULL
BEGIN
  CREATE TABLE hr.contracts (
    id int identity(1,1) not null constraint pk_hr_contracts primary key,
    employee_id int not null,
    tip nvarchar(40) not null,
    numar_contract nvarchar(100) not null,
    data_contract date null,
    data_start date not null,
    data_sfarsit date null,
    norma_ore decimal(5,2) null,
    salariu_baza decimal(15,2) null,
    cost_ora decimal(12,2) null,
    status nvarchar(30) not null constraint df_hr_contracts_status default N'activ',
    observatii nvarchar(max) null,
    created_at datetime2(0) not null constraint df_hr_contracts_created_at default sysdatetime(),
    updated_at datetime2(0) null,
    constraint ck_hr_contracts_tip check (tip in (N'CIM', N'PFA', N'zilier', N'detasat')),
    constraint ck_hr_contracts_status check (status in (N'activ', N'suspendat', N'incetat')),
    constraint fk_hr_contracts_employee foreign key (employee_id) references hr.employees(id) on delete no action
  );
END;

IF OBJECT_ID(N'hr.time_sheets', N'U') IS NULL
BEGIN
  CREATE TABLE hr.time_sheets (
    id int identity(1,1) not null constraint pk_hr_time_sheets primary key,
    employee_id int not null,
    data date not null,
    ore_lucrate decimal(5,2) not null constraint df_hr_time_sheets_ore_lucrate default 0,
    tip nvarchar(40) not null constraint df_hr_time_sheets_tip default N'lucru',
    santier_id int null,
    cost_center_id int null,
    validat bit not null constraint df_hr_time_sheets_validat default 0,
    validat_de nvarchar(64) null,
    validat_la datetime2(0) null,
    observatii nvarchar(max) null,
    created_at datetime2(0) not null constraint df_hr_time_sheets_created_at default sysdatetime(),
    updated_at datetime2(0) null,
    constraint uq_hr_time_sheets_employee_data unique (employee_id, data),
    constraint ck_hr_time_sheets_tip check (tip in (N'lucru', N'concediu_odihna', N'concediu_medical', N'nemotivat', N'delegatie', N'liber')),
    constraint fk_hr_time_sheets_employee foreign key (employee_id) references hr.employees(id) on delete no action,
    constraint fk_hr_time_sheets_santier foreign key (santier_id) references work.projects(id) on delete no action,
    constraint fk_hr_time_sheets_cost_center foreign key (cost_center_id) references controlling.cost_centers(id) on delete no action,
    constraint fk_hr_time_sheets_validat_de foreign key (validat_de) references core.users(id) on delete no action
  );
END;

IF OBJECT_ID(N'hr.leave_requests', N'U') IS NULL
BEGIN
  CREATE TABLE hr.leave_requests (
    id int identity(1,1) not null constraint pk_hr_leave_requests primary key,
    uuid char(36) not null,
    employee_id int not null,
    tip nvarchar(40) not null,
    data_start date not null,
    data_sfarsit date not null,
    zile decimal(6,2) null,
    motiv nvarchar(max) null,
    status nvarchar(30) not null constraint df_hr_leave_requests_status default N'cerut',
    aprobat_de nvarchar(64) null,
    aprobat_la datetime2(0) null,
    respins_motiv nvarchar(max) null,
    created_at datetime2(0) not null constraint df_hr_leave_requests_created_at default sysdatetime(),
    updated_at datetime2(0) null,
    constraint uq_hr_leave_requests_uuid unique (uuid),
    constraint ck_hr_leave_requests_tip check (tip in (N'CO', N'CM', N'nemotivat', N'delegatie', N'alt')),
    constraint ck_hr_leave_requests_status check (status in (N'cerut', N'aprobat', N'aprobata', N'respins', N'anulat')),
    constraint fk_hr_leave_requests_employee foreign key (employee_id) references hr.employees(id) on delete no action,
    constraint fk_hr_leave_requests_aprobat_de foreign key (aprobat_de) references core.users(id) on delete no action
  );
END;

IF OBJECT_ID(N'hr.authorizations', N'U') IS NULL
BEGIN
  CREATE TABLE hr.authorizations (
    id int identity(1,1) not null constraint pk_hr_authorizations primary key,
    employee_id int not null,
    tip nvarchar(80) not null,
    denumire nvarchar(200) not null,
    numar_document nvarchar(100) null,
    emitent nvarchar(200) null,
    data_emitere date null,
    data_expirare date null,
    fisier_path nvarchar(500) null,
    alertat_la datetime2(0) null,
    activ bit not null constraint df_hr_authorizations_activ default 1,
    status nvarchar(30) not null constraint df_hr_authorizations_status default N'activ',
    created_at datetime2(0) not null constraint df_hr_authorizations_created_at default sysdatetime(),
    updated_at datetime2(0) null,
    constraint ck_hr_authorizations_status check (status in (N'activ', N'expirat', N'anulat')),
    constraint fk_hr_authorizations_employee foreign key (employee_id) references hr.employees(id) on delete no action
  );
END;

IF OBJECT_ID(N'hr.reges_exports', N'U') IS NULL
BEGIN
  CREATE TABLE hr.reges_exports (
    id int identity(1,1) not null constraint pk_hr_reges_exports primary key,
    uuid char(36) not null,
    tip nvarchar(50) not null,
    perioada_start date null,
    perioada_sfarsit date null,
    fisier_path nvarchar(500) null,
    status nvarchar(30) not null constraint df_hr_reges_exports_status default N'generat',
    mesaj nvarchar(max) null,
    generat_de nvarchar(64) null,
    created_at datetime2(0) not null constraint df_hr_reges_exports_created_at default sysdatetime(),
    constraint uq_hr_reges_exports_uuid unique (uuid),
    constraint ck_hr_reges_exports_status check (status in (N'generat', N'trimis', N'eroare')),
    constraint fk_hr_reges_exports_generat_de foreign key (generat_de) references core.users(id) on delete no action
  );
END;

IF OBJECT_ID(N'hr.training', N'U') IS NULL
BEGIN
  CREATE TABLE hr.training (
    id int identity(1,1) not null constraint pk_hr_training primary key,
    denumire nvarchar(200) not null,
    tip nvarchar(80) null,
    furnizor nvarchar(200) null,
    data_start date null,
    data_sfarsit date null,
    valabil_pana_la date null,
    cost_total decimal(15,2) null,
    created_at datetime2(0) not null constraint df_hr_training_created_at default sysdatetime(),
    updated_at datetime2(0) null
  );
END;

IF OBJECT_ID(N'hr.training_employees', N'U') IS NULL
BEGIN
  CREATE TABLE hr.training_employees (
    training_id int not null,
    employee_id int not null,
    status nvarchar(30) not null constraint df_hr_training_employees_status default N'inscris',
    rezultat nvarchar(100) null,
    certificat_path nvarchar(500) null,
    created_at datetime2(0) not null constraint df_hr_training_employees_created_at default sysdatetime(),
    constraint pk_hr_training_employees primary key (training_id, employee_id),
    constraint ck_hr_training_employees_status check (status in (N'inscris', N'finalizat', N'absent', N'anulat')),
    constraint fk_hr_training_employees_training foreign key (training_id) references hr.training(id) on delete no action,
    constraint fk_hr_training_employees_employee foreign key (employee_id) references hr.employees(id) on delete no action
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_hr_employees_department' AND object_id = OBJECT_ID(N'hr.employees'))
  CREATE INDEX ix_hr_employees_department ON hr.employees(department_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_hr_employees_activ' AND object_id = OBJECT_ID(N'hr.employees'))
  CREATE INDEX ix_hr_employees_activ ON hr.employees(activ);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_hr_contracts_employee' AND object_id = OBJECT_ID(N'hr.contracts'))
  CREATE INDEX ix_hr_contracts_employee ON hr.contracts(employee_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_hr_time_sheets_employee' AND object_id = OBJECT_ID(N'hr.time_sheets'))
  CREATE INDEX ix_hr_time_sheets_employee ON hr.time_sheets(employee_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_hr_time_sheets_data' AND object_id = OBJECT_ID(N'hr.time_sheets'))
  CREATE INDEX ix_hr_time_sheets_data ON hr.time_sheets(data);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_hr_time_sheets_santier' AND object_id = OBJECT_ID(N'hr.time_sheets'))
  CREATE INDEX ix_hr_time_sheets_santier ON hr.time_sheets(santier_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_hr_leave_requests_status' AND object_id = OBJECT_ID(N'hr.leave_requests'))
  CREATE INDEX ix_hr_leave_requests_status ON hr.leave_requests(status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_hr_authorizations_expirare' AND object_id = OBJECT_ID(N'hr.authorizations'))
  CREATE INDEX ix_hr_authorizations_expirare ON hr.authorizations(data_expirare);

COMMIT TRANSACTION;
