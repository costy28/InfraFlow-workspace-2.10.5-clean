/*
  InfraFlow 1.0 - inventory and workflow foundation
*/

set xact_abort on;
begin transaction;

if not exists (select 1 from sys.schemas where name = N'inventory') exec(N'create schema inventory');
if not exists (select 1 from sys.schemas where name = N'workflow') exec(N'create schema workflow');
if not exists (select 1 from sys.schemas where name = N'work') exec(N'create schema work');

if object_id(N'work.projects', N'U') is null
begin
  create table work.projects (
    id uniqueidentifier not null constraint pk_work_projects primary key default newid(),
    company_id uniqueidentifier not null,
    code nvarchar(80) not null constraint df_work_projects_code default N'',
    name nvarchar(240) not null,
    client_name nvarchar(220) not null constraint df_work_projects_client default N'',
    location nvarchar(260) not null constraint df_work_projects_location default N'',
    status nvarchar(40) not null constraint df_work_projects_status default N'active',
    start_date date null,
    due_date date null,
    created_at datetime2(0) not null constraint df_work_projects_created default sysdatetime(),
    constraint fk_work_projects_company foreign key (company_id) references core.companies(id)
  );
end;

if object_id(N'inventory.materials', N'U') is null
begin
  create table inventory.materials (
    id uniqueidentifier not null constraint pk_inventory_materials primary key default newid(),
    company_id uniqueidentifier not null,
    name nvarchar(220) not null,
    unit nvarchar(30) not null,
    material_type nvarchar(60) not null constraint df_inventory_materials_type default N'general',
    recipe_material bit not null constraint df_inventory_materials_recipe default 0,
    alert_threshold decimal(18,3) not null constraint df_inventory_materials_alert default 0,
    active bit not null constraint df_inventory_materials_active default 1,
    created_at datetime2(0) not null constraint df_inventory_materials_created default sysdatetime(),
    constraint uq_inventory_materials_company_name unique (company_id, name),
    constraint fk_inventory_materials_company foreign key (company_id) references core.companies(id)
  );
end;

if object_id(N'inventory.stock_movements', N'U') is null
begin
  create table inventory.stock_movements (
    id uniqueidentifier not null constraint pk_inventory_stock_movements primary key default newid(),
    company_id uniqueidentifier not null,
    material_id uniqueidentifier not null,
    movement_date date not null,
    movement_type nvarchar(50) not null,
    quantity decimal(18,3) not null,
    unit nvarchar(30) not null,
    source_module nvarchar(80) not null constraint df_inventory_stock_source_module default N'',
    source_id nvarchar(120) not null constraint df_inventory_stock_source_id default N'',
    department_id uniqueidentifier null,
    project_id uniqueidentifier null,
    document_no nvarchar(140) not null constraint df_inventory_stock_document default N'',
    partner_name nvarchar(220) not null constraint df_inventory_stock_partner default N'',
    note nvarchar(max) not null constraint df_inventory_stock_note default N'',
    confirmation_status nvarchar(40) not null constraint df_inventory_stock_confirmation default N'confirmed',
    created_by uniqueidentifier null,
    created_at datetime2(0) not null constraint df_inventory_stock_created default sysdatetime(),
    canceled_at datetime2(0) null,
    constraint ck_inventory_stock_type check (movement_type in (N'initial', N'in', N'out', N'transfer', N'consumption', N'adjustment', N'reversal')),
    constraint ck_inventory_stock_confirmation check (confirmation_status in (N'pending', N'confirmed', N'rejected')),
    constraint fk_inventory_stock_company foreign key (company_id) references core.companies(id),
    constraint fk_inventory_stock_material foreign key (material_id) references inventory.materials(id),
    constraint fk_inventory_stock_department foreign key (department_id) references core.departments(id),
    constraint fk_inventory_stock_project foreign key (project_id) references work.projects(id),
    constraint fk_inventory_stock_created_by foreign key (created_by) references core.users(id)
  );
end;

if object_id(N'workflow.templates', N'U') is null
begin
  create table workflow.templates (
    id uniqueidentifier not null constraint pk_workflow_templates primary key default newid(),
    company_id uniqueidentifier null,
    request_type nvarchar(80) not null,
    name nvarchar(180) not null,
    module_key nvarchar(80) not null,
    active bit not null constraint df_workflow_templates_active default 1,
    constraint fk_workflow_templates_company foreign key (company_id) references core.companies(id)
  );
end;

if object_id(N'workflow.requests', N'U') is null
begin
  create table workflow.requests (
    id uniqueidentifier not null constraint pk_workflow_requests primary key default newid(),
    company_id uniqueidentifier not null,
    template_id uniqueidentifier null,
    request_type nvarchar(80) not null,
    title nvarchar(260) not null,
    status nvarchar(40) not null constraint df_workflow_requests_status default N'DRAFT',
    priority nvarchar(40) not null constraint df_workflow_requests_priority default N'medie',
    requester_user_id uniqueidentifier null,
    requester_department_id uniqueidentifier null,
    target_department_id uniqueidentifier null,
    project_id uniqueidentifier null,
    payload_json nvarchar(max) not null constraint df_workflow_requests_payload default N'{}',
    needed_date date null,
    created_at datetime2(0) not null constraint df_workflow_requests_created default sysdatetime(),
    updated_at datetime2(0) null,
    completed_at datetime2(0) null,
    constraint ck_workflow_requests_status check (status in (N'DRAFT', N'SUBMIS', N'IN_APROBARE', N'APROBAT', N'RESPINS', N'IN_EXECUTIE', N'FINALIZAT', N'ANULAT')),
    constraint ck_workflow_requests_payload_json check (isjson(payload_json) = 1),
    constraint fk_workflow_requests_company foreign key (company_id) references core.companies(id),
    constraint fk_workflow_requests_template foreign key (template_id) references workflow.templates(id),
    constraint fk_workflow_requests_user foreign key (requester_user_id) references core.users(id),
    constraint fk_workflow_requests_requester_department foreign key (requester_department_id) references core.departments(id),
    constraint fk_workflow_requests_target_department foreign key (target_department_id) references core.departments(id),
    constraint fk_workflow_requests_project foreign key (project_id) references work.projects(id)
  );
end;

if object_id(N'workflow.request_audit', N'U') is null
begin
  create table workflow.request_audit (
    id uniqueidentifier not null constraint pk_workflow_request_audit primary key default newid(),
    request_id uniqueidentifier not null,
    action nvarchar(120) not null,
    old_status nvarchar(40) not null constraint df_workflow_request_audit_old default N'',
    new_status nvarchar(40) not null constraint df_workflow_request_audit_new default N'',
    user_id uniqueidentifier null,
    details_json nvarchar(max) not null constraint df_workflow_request_audit_details default N'{}',
    created_at datetime2(0) not null constraint df_workflow_request_audit_created default sysdatetime(),
    constraint ck_workflow_request_audit_details_json check (isjson(details_json) = 1),
    constraint fk_workflow_request_audit_request foreign key (request_id) references workflow.requests(id),
    constraint fk_workflow_request_audit_user foreign key (user_id) references core.users(id)
  );
end;

if not exists (select 1 from core.schema_migrations where version = N'002_inventory_workflow')
  insert into core.schema_migrations (version, description)
  values (N'002_inventory_workflow', N'InfraFlow 1.0 stocuri, lucrari si workflow generic');

commit transaction;

