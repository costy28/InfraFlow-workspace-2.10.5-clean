/*
  InfraFlow - siguranta circulatiei
*/

SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'traffic_safety') EXEC(N'CREATE SCHEMA traffic_safety');

IF OBJECT_ID(N'traffic_safety.signs', N'U') IS NULL
BEGIN
  CREATE TABLE traffic_safety.signs (
    id int identity(1,1) not null constraint pk_traffic_safety_signs primary key,
    uuid char(36) not null,
    cod nvarchar(50) null,
    tip nvarchar(100) not null,
    denumire nvarchar(200) null,
    locatie nvarchar(300) null,
    lat decimal(10,7) null,
    lng decimal(10,7) null,
    stare nvarchar(30) not null constraint df_traffic_safety_signs_stare default N'buna',
    data_montaj date null,
    ultima_inspectie date null,
    department_id uniqueidentifier null,
    activ bit not null constraint df_traffic_safety_signs_activ default 1,
    created_at datetime2(0) not null constraint df_traffic_safety_signs_created_at default sysdatetime(),
    updated_at datetime2(0) null,
    constraint uq_traffic_safety_signs_uuid unique (uuid),
    constraint ck_traffic_safety_signs_stare check (stare in (N'buna', N'deteriorata', N'lipsa', N'inlocuire')),
    constraint fk_traffic_safety_signs_department foreign key (department_id) references core.departments(id) on delete no action
  );
END;

IF OBJECT_ID(N'traffic_safety.markings', N'U') IS NULL
BEGIN
  CREATE TABLE traffic_safety.markings (
    id int identity(1,1) not null constraint pk_traffic_safety_markings primary key,
    uuid char(36) not null,
    tronson nvarchar(300) not null,
    tip nvarchar(100) not null,
    suprafata_mp decimal(12,2) null,
    lungime_ml decimal(12,2) null,
    material nvarchar(100) null,
    data_executie date null,
    stare nvarchar(30) not null constraint df_traffic_safety_markings_stare default N'buna',
    santier_id uniqueidentifier null,
    activ bit not null constraint df_traffic_safety_markings_activ default 1,
    created_at datetime2(0) not null constraint df_traffic_safety_markings_created_at default sysdatetime(),
    updated_at datetime2(0) null,
    constraint uq_traffic_safety_markings_uuid unique (uuid),
    constraint ck_traffic_safety_markings_stare check (stare in (N'buna', N'uzata', N'de_refacut')),
    constraint fk_traffic_safety_markings_santier foreign key (santier_id) references work.projects(id) on delete no action
  );
END;

IF OBJECT_ID(N'traffic_safety.furniture', N'U') IS NULL
BEGIN
  CREATE TABLE traffic_safety.furniture (
    id int identity(1,1) not null constraint pk_traffic_safety_furniture primary key,
    uuid char(36) not null,
    tip nvarchar(100) not null,
    denumire nvarchar(200) null,
    locatie nvarchar(300) null,
    lat decimal(10,7) null,
    lng decimal(10,7) null,
    stare nvarchar(30) not null constraint df_traffic_safety_furniture_stare default N'buna',
    data_montaj date null,
    ultima_inspectie date null,
    activ bit not null constraint df_traffic_safety_furniture_activ default 1,
    created_at datetime2(0) not null constraint df_traffic_safety_furniture_created_at default sysdatetime(),
    updated_at datetime2(0) null,
    constraint uq_traffic_safety_furniture_uuid unique (uuid),
    constraint ck_traffic_safety_furniture_stare check (stare in (N'buna', N'deteriorata', N'lipsa', N'inlocuire'))
  );
END;

IF OBJECT_ID(N'traffic_safety.work_orders', N'U') IS NULL
BEGIN
  CREATE TABLE traffic_safety.work_orders (
    id int identity(1,1) not null constraint pk_traffic_safety_work_orders primary key,
    uuid char(36) not null,
    tip nvarchar(80) not null,
    obiect_tip nvarchar(40) null,
    obiect_id int null,
    titlu nvarchar(300) not null,
    descriere nvarchar(max) null,
    prioritate nvarchar(30) not null constraint df_traffic_safety_work_orders_prioritate default N'normala',
    status nvarchar(30) not null constraint df_traffic_safety_work_orders_status default N'deschis',
    asignat_la uniqueidentifier null,
    termen_limita date null,
    data_executie date null,
    materiale_json nvarchar(max) null,
    finalizat_la datetime2(0) null,
    creat_de uniqueidentifier null,
    created_at datetime2(0) not null constraint df_traffic_safety_work_orders_created_at default sysdatetime(),
    updated_at datetime2(0) null,
    constraint uq_traffic_safety_work_orders_uuid unique (uuid),
    constraint ck_traffic_safety_work_orders_obiect_tip check (obiect_tip is null or obiect_tip in (N'sign', N'marking', N'furniture')),
    constraint ck_traffic_safety_work_orders_prioritate check (prioritate in (N'scazuta', N'normala', N'normal', N'ridicata', N'urgenta')),
    constraint ck_traffic_safety_work_orders_status check (status in (N'planificat', N'deschis', N'in_lucru', N'finalizat', N'anulat')),
    constraint fk_traffic_safety_work_orders_asignat_la foreign key (asignat_la) references core.users(id) on delete no action,
    constraint fk_traffic_safety_work_orders_creat_de foreign key (creat_de) references core.users(id) on delete no action
  );
END;

IF OBJECT_ID(N'traffic_safety.inspections', N'U') IS NULL
BEGIN
  CREATE TABLE traffic_safety.inspections (
    id int identity(1,1) not null constraint pk_traffic_safety_inspections primary key,
    uuid char(36) not null,
    obiect_tip nvarchar(40) not null,
    obiect_id int not null,
    data date not null,
    stare nvarchar(30) not null,
    stare_constatata nvarchar(30) null,
    necesita_interventie bit not null constraint df_traffic_safety_inspections_necesita_interventie default 0,
    work_order_id int null,
    constatari nvarchar(max) null,
    actiuni_recomandate nvarchar(max) null,
    inspector_id uniqueidentifier null,
    created_at datetime2(0) not null constraint df_traffic_safety_inspections_created_at default sysdatetime(),
    constraint uq_traffic_safety_inspections_uuid unique (uuid),
    constraint ck_traffic_safety_inspections_obiect_tip check (obiect_tip in (N'sign', N'marking', N'furniture')),
    constraint ck_traffic_safety_inspections_stare check (stare in (N'buna', N'necesita_interventie', N'critica')),
    constraint fk_traffic_safety_inspections_inspector foreign key (inspector_id) references core.users(id) on delete no action,
    constraint fk_traffic_safety_inspections_work_order foreign key (work_order_id) references traffic_safety.work_orders(id) on delete no action
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_traffic_safety_signs_uuid' AND object_id = OBJECT_ID(N'traffic_safety.signs'))
  CREATE INDEX ix_traffic_safety_signs_uuid ON traffic_safety.signs(uuid);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_traffic_safety_signs_stare' AND object_id = OBJECT_ID(N'traffic_safety.signs'))
  CREATE INDEX ix_traffic_safety_signs_stare ON traffic_safety.signs(stare);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_traffic_safety_markings_uuid' AND object_id = OBJECT_ID(N'traffic_safety.markings'))
  CREATE INDEX ix_traffic_safety_markings_uuid ON traffic_safety.markings(uuid);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_traffic_safety_markings_santier' AND object_id = OBJECT_ID(N'traffic_safety.markings'))
  CREATE INDEX ix_traffic_safety_markings_santier ON traffic_safety.markings(santier_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_traffic_safety_furniture_uuid' AND object_id = OBJECT_ID(N'traffic_safety.furniture'))
  CREATE INDEX ix_traffic_safety_furniture_uuid ON traffic_safety.furniture(uuid);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_traffic_safety_work_orders_status' AND object_id = OBJECT_ID(N'traffic_safety.work_orders'))
  CREATE INDEX ix_traffic_safety_work_orders_status ON traffic_safety.work_orders(status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_traffic_safety_work_orders_asignat' AND object_id = OBJECT_ID(N'traffic_safety.work_orders'))
  CREATE INDEX ix_traffic_safety_work_orders_asignat ON traffic_safety.work_orders(asignat_la);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_traffic_safety_inspections_obiect' AND object_id = OBJECT_ID(N'traffic_safety.inspections'))
  CREATE INDEX ix_traffic_safety_inspections_obiect ON traffic_safety.inspections(obiect_tip, obiect_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_traffic_safety_inspections_data' AND object_id = OBJECT_ID(N'traffic_safety.inspections'))
  CREATE INDEX ix_traffic_safety_inspections_data ON traffic_safety.inspections(data);

COMMIT TRANSACTION;
