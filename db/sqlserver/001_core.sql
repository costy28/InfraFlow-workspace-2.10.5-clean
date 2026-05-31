/*
  InfraFlow 1.0 - SQL Server core schema
  Rulat pe o baza de date separata InfraFlow.
*/

set xact_abort on;
begin transaction;

if not exists (select 1 from sys.schemas where name = N'core') exec(N'create schema core');

if object_id(N'core.schema_migrations', N'U') is null
begin
  create table core.schema_migrations (
    version nvarchar(60) not null constraint pk_core_schema_migrations primary key,
    description nvarchar(300) not null,
    applied_at datetime2(0) not null constraint df_core_schema_migrations_applied_at default sysdatetime()
  );
end;

if object_id(N'core.companies', N'U') is null
begin
  create table core.companies (
    id uniqueidentifier not null constraint pk_core_companies primary key default newid(),
    name nvarchar(220) not null,
    fiscal_code nvarchar(60) not null constraint df_core_companies_fiscal default N'',
    license_json nvarchar(max) not null constraint df_core_companies_license default N'{}',
    created_at datetime2(0) not null constraint df_core_companies_created default sysdatetime(),
    updated_at datetime2(0) null,
    constraint ck_core_companies_license_json check (isjson(license_json) = 1)
  );
end;

if object_id(N'core.sites', N'U') is null
begin
  create table core.sites (
    id uniqueidentifier not null constraint pk_core_sites primary key default newid(),
    company_id uniqueidentifier not null,
    name nvarchar(180) not null,
    location nvarchar(240) not null constraint df_core_sites_location default N'',
    active bit not null constraint df_core_sites_active default 1,
    created_at datetime2(0) not null constraint df_core_sites_created default sysdatetime(),
    constraint fk_core_sites_company foreign key (company_id) references core.companies(id)
  );
end;

if object_id(N'core.modules', N'U') is null
begin
  create table core.modules (
    module_key nvarchar(80) not null constraint pk_core_modules primary key,
    name nvarchar(160) not null,
    color nvarchar(30) not null constraint df_core_modules_color default N'#0f766e',
    icon nvarchar(80) not null constraint df_core_modules_icon default N'box',
    active_by_default bit not null constraint df_core_modules_default default 0,
    commercial_module bit not null constraint df_core_modules_commercial default 1
  );
end;

if object_id(N'core.departments', N'U') is null
begin
  create table core.departments (
    id uniqueidentifier not null constraint pk_core_departments primary key default newid(),
    company_id uniqueidentifier not null,
    module_key nvarchar(80) not null,
    name nvarchar(180) not null,
    active bit not null constraint df_core_departments_active default 1,
    created_at datetime2(0) not null constraint df_core_departments_created default sysdatetime(),
    constraint fk_core_departments_company foreign key (company_id) references core.companies(id),
    constraint fk_core_departments_module foreign key (module_key) references core.modules(module_key)
  );
end;

if object_id(N'core.roles', N'U') is null
begin
  create table core.roles (
    role_key nvarchar(80) not null constraint pk_core_roles primary key,
    name nvarchar(160) not null,
    level_no int not null constraint df_core_roles_level default 1,
    system_role bit not null constraint df_core_roles_system default 1
  );
end;

if object_id(N'core.permissions', N'U') is null
begin
  create table core.permissions (
    permission_key nvarchar(120) not null constraint pk_core_permissions primary key,
    module_key nvarchar(80) not null,
    label nvarchar(180) not null,
    constraint fk_core_permissions_module foreign key (module_key) references core.modules(module_key)
  );
end;

if object_id(N'core.role_permissions', N'U') is null
begin
  create table core.role_permissions (
    role_key nvarchar(80) not null,
    permission_key nvarchar(120) not null,
    constraint pk_core_role_permissions primary key (role_key, permission_key),
    constraint fk_core_role_permissions_role foreign key (role_key) references core.roles(role_key),
    constraint fk_core_role_permissions_permission foreign key (permission_key) references core.permissions(permission_key)
  );
end;

if object_id(N'core.users', N'U') is null
begin
  create table core.users (
    id uniqueidentifier not null constraint pk_core_users primary key default newid(),
    company_id uniqueidentifier not null,
    department_id uniqueidentifier null,
    role_key nvarchar(80) not null,
    username nvarchar(120) not null,
    display_name nvarchar(180) not null,
    password_hash nvarchar(300) not null,
    must_change_password bit not null constraint df_core_users_must_change default 0,
    active bit not null constraint df_core_users_active default 1,
    created_at datetime2(0) not null constraint df_core_users_created default sysdatetime(),
    updated_at datetime2(0) null,
    constraint uq_core_users_username unique (username),
    constraint fk_core_users_company foreign key (company_id) references core.companies(id),
    constraint fk_core_users_department foreign key (department_id) references core.departments(id),
    constraint fk_core_users_role foreign key (role_key) references core.roles(role_key)
  );
end;

if object_id(N'core.workstations', N'U') is null
begin
  create table core.workstations (
    id uniqueidentifier not null constraint pk_core_workstations primary key default newid(),
    company_id uniqueidentifier not null,
    department_id uniqueidentifier null,
    name nvarchar(180) not null,
    device_code nvarchar(160) not null,
    status nvarchar(40) not null constraint df_core_workstations_status default N'pending',
    last_seen_at datetime2(0) null,
    created_at datetime2(0) not null constraint df_core_workstations_created default sysdatetime(),
    constraint uq_core_workstations_device unique (device_code),
    constraint ck_core_workstations_status check (status in (N'pending', N'active', N'rejected', N'disabled')),
    constraint fk_core_workstations_company foreign key (company_id) references core.companies(id),
    constraint fk_core_workstations_department foreign key (department_id) references core.departments(id)
  );
end;

if object_id(N'core.audit_log', N'U') is null
begin
  create table core.audit_log (
    id uniqueidentifier not null constraint pk_core_audit_log primary key default newid(),
    company_id uniqueidentifier null,
    user_id uniqueidentifier null,
    action nvarchar(140) not null,
    entity_type nvarchar(120) not null constraint df_core_audit_entity default N'',
    entity_id nvarchar(120) not null constraint df_core_audit_entity_id default N'',
    details_json nvarchar(max) not null constraint df_core_audit_details default N'{}',
    created_at datetime2(0) not null constraint df_core_audit_created default sysdatetime(),
    constraint ck_core_audit_details_json check (isjson(details_json) = 1),
    constraint fk_core_audit_company foreign key (company_id) references core.companies(id),
    constraint fk_core_audit_user foreign key (user_id) references core.users(id)
  );
end;

if not exists (select 1 from core.schema_migrations where version = N'001_core')
  insert into core.schema_migrations (version, description)
  values (N'001_core', N'InfraFlow 1.0 core: firme, module, roluri, utilizatori, statii, audit');

commit transaction;

