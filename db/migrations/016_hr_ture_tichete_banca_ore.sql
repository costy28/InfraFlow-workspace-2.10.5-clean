IF COL_LENGTH('hr.employees', 'adresa') IS NULL ALTER TABLE hr.employees ADD adresa nvarchar(500) NULL;
IF COL_LENGTH('hr.employees', 'stare_civila') IS NULL ALTER TABLE hr.employees ADD stare_civila nvarchar(20) NULL;
IF COL_LENGTH('hr.employees', 'iban') IS NULL ALTER TABLE hr.employees ADD iban nvarchar(34) NULL;
IF COL_LENGTH('hr.employees', 'salariu_baza') IS NULL ALTER TABLE hr.employees ADD salariu_baza decimal(15,2) NULL;
IF COL_LENGTH('hr.employees', 'data_expirare_contract') IS NULL ALTER TABLE hr.employees ADD data_expirare_contract date NULL;
IF COL_LENGTH('hr.employees', 'data_expirare_permis') IS NULL ALTER TABLE hr.employees ADD data_expirare_permis date NULL;
IF COL_LENGTH('hr.employees', 'data_expirare_iscir') IS NULL ALTER TABLE hr.employees ADD data_expirare_iscir date NULL;
IF COL_LENGTH('hr.employees', 'adeverinta_medicala') IS NULL ALTER TABLE hr.employees ADD adeverinta_medicala date NULL;
IF COL_LENGTH('hr.employees', 'zile_co_drept') IS NULL ALTER TABLE hr.employees ADD zile_co_drept int NULL CONSTRAINT df_hr_employees_zile_co_drept DEFAULT 21;
IF COL_LENGTH('hr.employees', 'photo_url') IS NULL ALTER TABLE hr.employees ADD photo_url nvarchar(500) NULL;
IF COL_LENGTH('hr.employees', 'nr_copii_intretinere') IS NULL ALTER TABLE hr.employees ADD nr_copii_intretinere int NULL CONSTRAINT df_hr_employees_nr_copii_intretinere DEFAULT 0;
IF COL_LENGTH('hr.employees', 'casa_sanatate') IS NULL ALTER TABLE hr.employees ADD casa_sanatate nvarchar(100) NULL;
IF COL_LENGTH('hr.employees', 'functie_cor') IS NULL ALTER TABLE hr.employees ADD functie_cor nvarchar(10) NULL;
IF COL_LENGTH('hr.employees', 'nivel_studii') IS NULL ALTER TABLE hr.employees ADD nivel_studii nvarchar(50) NULL;
IF COL_LENGTH('hr.employees', 'norma_ore_zi') IS NULL ALTER TABLE hr.employees ADD norma_ore_zi decimal(4,2) NULL CONSTRAINT df_hr_employees_norma_ore_zi DEFAULT 8;
IF COL_LENGTH('hr.employees', 'deducere_personala') IS NULL ALTER TABLE hr.employees ADD deducere_personala decimal(10,2) NULL;
IF COL_LENGTH('hr.employees', 'permis_conducere_categorii') IS NULL ALTER TABLE hr.employees ADD permis_conducere_categorii nvarchar(50) NULL;
IF COL_LENGTH('hr.employees', 'permis_conducere_expira') IS NULL ALTER TABLE hr.employees ADD permis_conducere_expira date NULL;
IF COL_LENGTH('hr.employees', 'apt_medical_expira') IS NULL ALTER TABLE hr.employees ADD apt_medical_expira date NULL;
IF COL_LENGTH('hr.employees', 'acord_gdpr') IS NULL ALTER TABLE hr.employees ADD acord_gdpr bit NULL CONSTRAINT df_hr_employees_acord_gdpr DEFAULT 0;
IF COL_LENGTH('hr.employees', 'data_acord_gdpr') IS NULL ALTER TABLE hr.employees ADD data_acord_gdpr date NULL;
GO

IF OBJECT_ID(N'hr.tures', N'U') IS NULL
BEGIN
  CREATE TABLE hr.tures (
    id int identity(1,1) not null constraint pk_hr_tures primary key,
    uuid uniqueidentifier not null constraint df_hr_tures_uuid default newid(),
    nume nvarchar(100) not null,
    ora_start nvarchar(5) not null,
    ora_sfarsit nvarchar(5) not null,
    ore_normale decimal(4,2) not null constraint df_hr_tures_ore_normale default 8,
    culoare nvarchar(20) not null constraint df_hr_tures_culoare default N'#3B82F6',
    activ bit not null constraint df_hr_tures_activ default 1,
    created_at datetime2(0) not null constraint df_hr_tures_created_at default sysdatetime(),
    updated_at datetime2(0) null
  );

  INSERT INTO hr.tures (nume, ora_start, ora_sfarsit, ore_normale, culoare)
  VALUES
    (N'Tura I', N'06:00', N'14:00', 8, N'#F59E0B'),
    (N'Tura II', N'14:00', N'22:00', 8, N'#0EA5E9'),
    (N'Tura III', N'22:00', N'06:00', 8, N'#6366F1'),
    (N'Normal', N'08:00', N'16:00', 8, N'#10B981');
END
GO

IF OBJECT_ID(N'hr.schedules', N'U') IS NULL
BEGIN
  CREATE TABLE hr.schedules (
    id int identity(1,1) not null constraint pk_hr_schedules primary key,
    uuid uniqueidentifier not null constraint df_hr_schedules_uuid default newid(),
    employee_id int not null,
    data date not null,
    tura_id int null,
    department nvarchar(100) null,
    created_at datetime2(0) not null constraint df_hr_schedules_created_at default sysdatetime(),
    updated_at datetime2(0) null,
    constraint uq_hr_schedules_employee_data unique (employee_id, data),
    constraint fk_hr_schedules_employee foreign key (employee_id) references hr.employees(id) on delete no action,
    constraint fk_hr_schedules_tura foreign key (tura_id) references hr.tures(id) on delete set null
  );
END
GO

IF OBJECT_ID(N'hr.overtime_compensations', N'U') IS NULL
BEGIN
  CREATE TABLE hr.overtime_compensations (
    id int identity(1,1) not null constraint pk_hr_overtime_compensations primary key,
    uuid uniqueidentifier not null constraint df_hr_overtime_compensations_uuid default newid(),
    employee_id int not null,
    ore decimal(6,2) not null,
    tip nvarchar(30) not null,
    data date not null,
    created_by nvarchar(100) null,
    created_at datetime2(0) not null constraint df_hr_overtime_compensations_created_at default sysdatetime(),
    constraint fk_hr_overtime_compensations_employee foreign key (employee_id) references hr.employees(id) on delete no action
  );
END
GO

IF COL_LENGTH('hr.time_sheets', 'ore_suplimentare_s1') IS NULL
BEGIN
  ALTER TABLE hr.time_sheets ADD
    ore_suplimentare_s1 decimal(5,2) not null constraint df_hr_time_sheets_ore_sup_s1 default 0,
    ore_suplimentare_s2 decimal(5,2) not null constraint df_hr_time_sheets_ore_sup_s2 default 0,
    ore_noapte decimal(5,2) not null constraint df_hr_time_sheets_ore_noapte default 0;
END
GO
