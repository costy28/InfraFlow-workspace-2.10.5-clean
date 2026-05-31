/*
  InfraFlow - salubrizare
*/

SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'sanitation') EXEC(N'CREATE SCHEMA sanitation');

IF OBJECT_ID(N'sanitation.zones', N'U') IS NULL
BEGIN
  CREATE TABLE sanitation.zones (
    id int identity(1,1) not null constraint pk_sanitation_zones primary key,
    cod nvarchar(50) not null,
    denumire nvarchar(200) not null,
    descriere nvarchar(max) null,
    geojson nvarchar(max) null,
    activ bit not null constraint df_sanitation_zones_activ default 1,
    created_at datetime2(0) not null constraint df_sanitation_zones_created_at default sysdatetime(),
    updated_at datetime2(0) null,
    constraint uq_sanitation_zones_cod unique (cod)
  );
END;

IF OBJECT_ID(N'sanitation.routes', N'U') IS NULL
BEGIN
  CREATE TABLE sanitation.routes (
    id int identity(1,1) not null constraint pk_sanitation_routes primary key,
    uuid char(36) not null,
    zone_id int null,
    cod nvarchar(50) not null,
    denumire nvarchar(200) not null,
    frecventa nvarchar(80) null,
    zi_programata nvarchar(30) null,
    vehicul_id int null,
    responsabil_id nvarchar(64) null,
    activ bit not null constraint df_sanitation_routes_activ default 1,
    created_at datetime2(0) not null constraint df_sanitation_routes_created_at default sysdatetime(),
    updated_at datetime2(0) null,
    constraint uq_sanitation_routes_uuid unique (uuid),
    constraint uq_sanitation_routes_cod unique (cod),
    constraint fk_sanitation_routes_zone foreign key (zone_id) references sanitation.zones(id) on delete no action,
    constraint fk_sanitation_routes_vehicul foreign key (vehicul_id) references fleet.assets(id) on delete no action,
    constraint fk_sanitation_routes_responsabil foreign key (responsabil_id) references core.users(id) on delete no action
  );
END;

IF OBJECT_ID(N'sanitation.route_stops', N'U') IS NULL
BEGIN
  CREATE TABLE sanitation.route_stops (
    id int identity(1,1) not null constraint pk_sanitation_route_stops primary key,
    route_id int not null,
    denumire nvarchar(200) not null,
    adresa nvarchar(300) null,
    lat decimal(10,7) null,
    lng decimal(10,7) null,
    ordine int not null constraint df_sanitation_route_stops_ordine default 0,
    tip nvarchar(50) null,
    activ bit not null constraint df_sanitation_route_stops_activ default 1,
    created_at datetime2(0) not null constraint df_sanitation_route_stops_created_at default sysdatetime(),
    updated_at datetime2(0) null,
    constraint fk_sanitation_route_stops_route foreign key (route_id) references sanitation.routes(id) on delete no action
  );
END;

IF OBJECT_ID(N'sanitation.collections', N'U') IS NULL
BEGIN
  CREATE TABLE sanitation.collections (
    id int identity(1,1) not null constraint pk_sanitation_collections primary key,
    uuid char(36) not null,
    route_id int not null,
    zone_id int null,
    vehicul_id int null,
    echipaj nvarchar(max) null,
    data date not null,
    ora_start time(0) null,
    ora_sfarsit time(0) null,
    km_efectuati decimal(10,2) null,
    status nvarchar(30) not null constraint df_sanitation_collections_status default N'planificat',
    observatii nvarchar(max) null,
    raportat_de nvarchar(64) null,
    created_at datetime2(0) not null constraint df_sanitation_collections_created_at default sysdatetime(),
    updated_at datetime2(0) null,
    constraint uq_sanitation_collections_uuid unique (uuid),
    constraint ck_sanitation_collections_status check (status in (N'planificat', N'in_lucru', N'in_executie', N'finalizat', N'anulat')),
    constraint fk_sanitation_collections_route foreign key (route_id) references sanitation.routes(id) on delete no action,
    constraint fk_sanitation_collections_zone foreign key (zone_id) references sanitation.zones(id) on delete no action,
    constraint fk_sanitation_collections_vehicul foreign key (vehicul_id) references fleet.assets(id) on delete no action,
    constraint fk_sanitation_collections_raportat_de foreign key (raportat_de) references core.users(id) on delete no action
  );
END;

IF OBJECT_ID(N'sanitation.waste_records', N'U') IS NULL
BEGIN
  CREATE TABLE sanitation.waste_records (
    id int identity(1,1) not null constraint pk_sanitation_waste_records primary key,
    collection_id int not null,
    waste_type nvarchar(80) not null,
    cantitate_kg decimal(12,3) not null constraint df_sanitation_waste_records_cantitate_kg default 0,
    volum_mc decimal(12,3) null,
    destinatie nvarchar(200) null,
    document_predare nvarchar(100) null,
    created_at datetime2(0) not null constraint df_sanitation_waste_records_created_at default sysdatetime(),
    constraint fk_sanitation_waste_records_collection foreign key (collection_id) references sanitation.collections(id) on delete no action
  );
END;

IF OBJECT_ID(N'sanitation.contracts', N'U') IS NULL
BEGIN
  CREATE TABLE sanitation.contracts (
    id int identity(1,1) not null constraint pk_sanitation_contracts primary key,
    uuid char(36) not null,
    beneficiar nvarchar(200) not null,
    cui nvarchar(30) null,
    nr_contract nvarchar(100) not null,
    data_start date not null,
    data_sfarsit date null,
    zona_id int null,
    valoare_lunara decimal(15,2) null,
    status nvarchar(30) not null constraint df_sanitation_contracts_status default N'activ',
    created_at datetime2(0) not null constraint df_sanitation_contracts_created_at default sysdatetime(),
    updated_at datetime2(0) null,
    constraint uq_sanitation_contracts_uuid unique (uuid),
    constraint ck_sanitation_contracts_status check (status in (N'activ', N'expirat', N'anulat')),
    constraint fk_sanitation_contracts_zona foreign key (zona_id) references sanitation.zones(id) on delete no action
  );
END;

IF OBJECT_ID(N'sanitation.monthly_reports', N'U') IS NULL
BEGIN
  CREATE TABLE sanitation.monthly_reports (
    id int identity(1,1) not null constraint pk_sanitation_monthly_reports primary key,
    an int not null,
    luna int not null,
    zone_id int null,
    total_colectari int not null constraint df_sanitation_monthly_reports_total_colectari default 0,
    total_kg decimal(15,3) not null constraint df_sanitation_monthly_reports_total_kg default 0,
    status nvarchar(30) not null constraint df_sanitation_monthly_reports_status default N'draft',
    generat_de nvarchar(64) null,
    created_at datetime2(0) not null constraint df_sanitation_monthly_reports_created_at default sysdatetime(),
    updated_at datetime2(0) null,
    constraint uq_sanitation_monthly_reports_an_luna_zone unique (an, luna, zone_id),
    constraint ck_sanitation_monthly_reports_luna check (luna between 1 and 12),
    constraint ck_sanitation_monthly_reports_status check (status in (N'draft', N'finalizat', N'trimis')),
    constraint fk_sanitation_monthly_reports_zone foreign key (zone_id) references sanitation.zones(id) on delete no action,
    constraint fk_sanitation_monthly_reports_generat_de foreign key (generat_de) references core.users(id) on delete no action
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_sanitation_routes_zone' AND object_id = OBJECT_ID(N'sanitation.routes'))
  CREATE INDEX ix_sanitation_routes_zone ON sanitation.routes(zone_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_sanitation_route_stops_route' AND object_id = OBJECT_ID(N'sanitation.route_stops'))
  CREATE INDEX ix_sanitation_route_stops_route ON sanitation.route_stops(route_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_sanitation_collections_route' AND object_id = OBJECT_ID(N'sanitation.collections'))
  CREATE INDEX ix_sanitation_collections_route ON sanitation.collections(route_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_sanitation_collections_data' AND object_id = OBJECT_ID(N'sanitation.collections'))
  CREATE INDEX ix_sanitation_collections_data ON sanitation.collections(data);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_sanitation_collections_status' AND object_id = OBJECT_ID(N'sanitation.collections'))
  CREATE INDEX ix_sanitation_collections_status ON sanitation.collections(status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_sanitation_waste_records_collection' AND object_id = OBJECT_ID(N'sanitation.waste_records'))
  CREATE INDEX ix_sanitation_waste_records_collection ON sanitation.waste_records(collection_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_sanitation_contracts_status' AND object_id = OBJECT_ID(N'sanitation.contracts'))
  CREATE INDEX ix_sanitation_contracts_status ON sanitation.contracts(status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_sanitation_monthly_reports_an_luna' AND object_id = OBJECT_ID(N'sanitation.monthly_reports'))
  CREATE INDEX ix_sanitation_monthly_reports_an_luna ON sanitation.monthly_reports(an, luna);

COMMIT TRANSACTION;
