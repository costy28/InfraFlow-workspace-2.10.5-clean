/*
  InfraFlow - departamente suport: mediu, juridic, arhiva, secretariat
*/

SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'environment') EXEC(N'CREATE SCHEMA environment');
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'legal') EXEC(N'CREATE SCHEMA legal');
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'archive') EXEC(N'CREATE SCHEMA archive');
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'secretariat') EXEC(N'CREATE SCHEMA secretariat');

IF OBJECT_ID(N'environment.permits', N'U') IS NULL
BEGIN
  CREATE TABLE environment.permits (
    id int identity(1,1) not null constraint pk_environment_permits primary key,
    uuid char(36) not null,
    tip nvarchar(100) not null,
    numar_document nvarchar(100) not null,
    emitent nvarchar(200) null,
    data_emitere date null,
    data_expirare date null,
    status nvarchar(30) not null constraint df_environment_permits_status default N'activ',
    responsabil_id uniqueidentifier null,
    fisier_path nvarchar(500) null,
    alertat_la datetime2(0) null,
    observatii nvarchar(max) null,
    created_at datetime2(0) not null constraint df_environment_permits_created_at default sysdatetime(),
    updated_at datetime2(0) null,
    constraint uq_environment_permits_uuid unique (uuid),
    constraint ck_environment_permits_status check (status in (N'activ', N'valida', N'expirat', N'in_renovare', N'anulat')),
    constraint fk_environment_permits_responsabil foreign key (responsabil_id) references core.users(id) on delete no action
  );
END;

IF OBJECT_ID(N'environment.monitoring_points', N'U') IS NULL
BEGIN
  CREATE TABLE environment.monitoring_points (
    id int identity(1,1) not null constraint pk_environment_monitoring_points primary key,
    cod nvarchar(50) not null,
    denumire nvarchar(200) not null,
    tip nvarchar(80) not null,
    locatie nvarchar(300) null,
    santier_id uniqueidentifier null,
    lat decimal(10,7) null,
    lng decimal(10,7) null,
    activ bit not null constraint df_environment_monitoring_points_activ default 1,
    created_at datetime2(0) not null constraint df_environment_monitoring_points_created_at default sysdatetime(),
    updated_at datetime2(0) null,
    constraint uq_environment_monitoring_points_cod unique (cod),
    constraint fk_environment_monitoring_points_santier foreign key (santier_id) references work.projects(id) on delete no action
  );
END;

IF OBJECT_ID(N'environment.measurements', N'U') IS NULL
BEGIN
  CREATE TABLE environment.measurements (
    id int identity(1,1) not null constraint pk_environment_measurements primary key,
    point_id int not null,
    data datetime2(0) not null,
    indicator nvarchar(100) not null,
    valoare decimal(15,4) not null,
    um nvarchar(20) null,
    limita_legala decimal(15,4) null,
    depasire bit not null constraint df_environment_measurements_depasire default 0,
    raportat_de uniqueidentifier null,
    created_at datetime2(0) not null constraint df_environment_measurements_created_at default sysdatetime(),
    constraint fk_environment_measurements_point foreign key (point_id) references environment.monitoring_points(id) on delete no action,
    constraint fk_environment_measurements_raportat_de foreign key (raportat_de) references core.users(id) on delete no action
  );
END;

IF OBJECT_ID(N'environment.waste_transfers', N'U') IS NULL
BEGIN
  CREATE TABLE environment.waste_transfers (
    id int identity(1,1) not null constraint pk_environment_waste_transfers primary key,
    uuid char(36) not null,
    data date not null,
    tip_deseu nvarchar(100) not null,
    cantitate_kg decimal(15,3) not null,
    transportator nvarchar(200) null,
    destinatar nvarchar(200) null,
    nr_document nvarchar(100) null,
    fisier_path nvarchar(500) null,
    created_at datetime2(0) not null constraint df_environment_waste_transfers_created_at default sysdatetime(),
    constraint uq_environment_waste_transfers_uuid unique (uuid)
  );
END;

IF OBJECT_ID(N'legal.cases', N'U') IS NULL
BEGIN
  CREATE TABLE legal.cases (
    id int identity(1,1) not null constraint pk_legal_cases primary key,
    uuid char(36) not null,
    numar_dosar nvarchar(100) not null,
    instanta nvarchar(200) null,
    obiect nvarchar(300) not null,
    parte_adversa nvarchar(200) null,
    status nvarchar(30) not null constraint df_legal_cases_status default N'activ',
    responsabil_id uniqueidentifier null,
    termen_urmator date null,
    observatii nvarchar(max) null,
    created_at datetime2(0) not null constraint df_legal_cases_created_at default sysdatetime(),
    updated_at datetime2(0) null,
    constraint uq_legal_cases_uuid unique (uuid),
    constraint ck_legal_cases_status check (status in (N'activ', N'suspendat', N'inchis')),
    constraint fk_legal_cases_responsabil foreign key (responsabil_id) references core.users(id) on delete no action
  );
END;

IF OBJECT_ID(N'legal.contracts', N'U') IS NULL
BEGIN
  CREATE TABLE legal.contracts (
    id int identity(1,1) not null constraint pk_legal_contracts primary key,
    uuid char(36) not null,
    nr_contract nvarchar(100) not null,
    partener nvarchar(200) not null,
    tip nvarchar(80) null,
    data_semnare date null,
    data_start date null,
    data_sfarsit date null,
    valoare decimal(15,2) null,
    status nvarchar(30) not null constraint df_legal_contracts_status default N'activ',
    document_id int null,
    responsabil_id uniqueidentifier null,
    created_at datetime2(0) not null constraint df_legal_contracts_created_at default sysdatetime(),
    updated_at datetime2(0) null,
    constraint uq_legal_contracts_uuid unique (uuid),
    constraint ck_legal_contracts_status check (status in (N'draft', N'activ', N'semnat', N'in_executie', N'expirat', N'reziliat')),
    constraint fk_legal_contracts_document foreign key (document_id) references documents.documents(id) on delete no action,
    constraint fk_legal_contracts_responsabil foreign key (responsabil_id) references core.users(id) on delete no action
  );
END;

IF OBJECT_ID(N'legal.deadlines', N'U') IS NULL
BEGIN
  CREATE TABLE legal.deadlines (
    id int identity(1,1) not null constraint pk_legal_deadlines primary key,
    case_id int null,
    contract_id int null,
    titlu nvarchar(300) not null,
    data_scadenta datetime2(0) not null,
    status nvarchar(30) not null constraint df_legal_deadlines_status default N'deschis',
    responsabil_id uniqueidentifier null,
    created_at datetime2(0) not null constraint df_legal_deadlines_created_at default sysdatetime(),
    updated_at datetime2(0) null,
    constraint ck_legal_deadlines_status check (status in (N'deschis', N'finalizat', N'anulat')),
    constraint fk_legal_deadlines_case foreign key (case_id) references legal.cases(id) on delete no action,
    constraint fk_legal_deadlines_contract foreign key (contract_id) references legal.contracts(id) on delete no action,
    constraint fk_legal_deadlines_responsabil foreign key (responsabil_id) references core.users(id) on delete no action
  );
END;

IF OBJECT_ID(N'archive.boxes', N'U') IS NULL
BEGIN
  CREATE TABLE archive.boxes (
    id int identity(1,1) not null constraint pk_archive_boxes primary key,
    cod nvarchar(50) not null,
    locatie nvarchar(200) null,
    raft nvarchar(50) null,
    descriere nvarchar(max) null,
    status nvarchar(30) not null constraint df_archive_boxes_status default N'activ',
    created_at datetime2(0) not null constraint df_archive_boxes_created_at default sysdatetime(),
    updated_at datetime2(0) null,
    constraint uq_archive_boxes_cod unique (cod),
    constraint ck_archive_boxes_status check (status in (N'activ', N'plin', N'arhivat', N'distrus'))
  );
END;

IF OBJECT_ID(N'archive.documents', N'U') IS NULL
BEGIN
  CREATE TABLE archive.documents (
    id int identity(1,1) not null constraint pk_archive_documents primary key,
    uuid char(36) not null,
    box_id int null,
    document_id int null,
    nr_document nvarchar(100) null,
    nr_inventar nvarchar(100) null,
    titlu nvarchar(300) not null,
    denumire nvarchar(300) null,
    tip nvarchar(100) null,
    an int null,
    dept_id uniqueidentifier null,
    emitent nvarchar(200) null,
    destinatar nvarchar(200) null,
    data_document date null,
    termen_pastrare_ani int null,
    termen_pastrare int null,
    distrugere_la date null,
    data_casare date null,
    disponibil bit not null constraint df_archive_documents_disponibil default 1,
    observatii nvarchar(max) null,
    status nvarchar(30) not null constraint df_archive_documents_status default N'arhivat',
    fisier_path nvarchar(500) null,
    created_at datetime2(0) not null constraint df_archive_documents_created_at default sysdatetime(),
    updated_at datetime2(0) null,
    constraint uq_archive_documents_uuid unique (uuid),
    constraint ck_archive_documents_status check (status in (N'arhivat', N'disponibil', N'imprumutat', N'distrus')),
    constraint fk_archive_documents_box foreign key (box_id) references archive.boxes(id) on delete no action,
    constraint fk_archive_documents_document foreign key (document_id) references documents.documents(id) on delete no action,
    constraint fk_archive_documents_dept foreign key (dept_id) references core.departments(id) on delete no action
  );
END;

IF OBJECT_ID(N'archive.loans', N'U') IS NULL
BEGIN
  CREATE TABLE archive.loans (
    id int identity(1,1) not null constraint pk_archive_loans primary key,
    archive_document_id int not null,
    imprumutat_de uniqueidentifier not null,
    data_imprumut datetime2(0) not null constraint df_archive_loans_data_imprumut default sysdatetime(),
    termen_returnare date null,
    returnat_la datetime2(0) null,
    observatii nvarchar(max) null,
    created_at datetime2(0) not null constraint df_archive_loans_created_at default sysdatetime(),
    constraint fk_archive_loans_document foreign key (archive_document_id) references archive.documents(id) on delete no action,
    constraint fk_archive_loans_imprumutat_de foreign key (imprumutat_de) references core.users(id) on delete no action
  );
END;

IF OBJECT_ID(N'secretariat.registries', N'U') IS NULL
BEGIN
  CREATE TABLE secretariat.registries (
    id int identity(1,1) not null constraint pk_secretariat_registries primary key,
    cod nvarchar(50) not null,
    denumire nvarchar(200) not null,
    an int not null,
    nr_curent int not null constraint df_secretariat_registries_nr_curent default 0,
    activ bit not null constraint df_secretariat_registries_activ default 1,
    created_at datetime2(0) not null constraint df_secretariat_registries_created_at default sysdatetime(),
    constraint uq_secretariat_registries_cod_an unique (cod, an)
  );
END;

IF OBJECT_ID(N'secretariat.incoming', N'U') IS NULL
BEGIN
  CREATE TABLE secretariat.incoming (
    id int identity(1,1) not null constraint pk_secretariat_incoming primary key,
    uuid char(36) not null,
    registry_id int not null,
    nr_inregistrare nvarchar(100) not null,
    data_inregistrare datetime2(0) not null constraint df_secretariat_incoming_data_inregistrare default sysdatetime(),
    expeditor nvarchar(200) not null,
    subiect nvarchar(300) not null,
    departament_destinatar uniqueidentifier null,
    responsabil_id uniqueidentifier null,
    status nvarchar(30) not null constraint df_secretariat_incoming_status default N'inregistrat',
    fisier_path nvarchar(500) null,
    created_at datetime2(0) not null constraint df_secretariat_incoming_created_at default sysdatetime(),
    updated_at datetime2(0) null,
    constraint uq_secretariat_incoming_uuid unique (uuid),
    constraint fk_secretariat_incoming_registry foreign key (registry_id) references secretariat.registries(id) on delete no action,
    constraint fk_secretariat_incoming_department foreign key (departament_destinatar) references core.departments(id) on delete no action,
    constraint fk_secretariat_incoming_responsabil foreign key (responsabil_id) references core.users(id) on delete no action
  );
END;

IF OBJECT_ID(N'secretariat.outgoing', N'U') IS NULL
BEGIN
  CREATE TABLE secretariat.outgoing (
    id int identity(1,1) not null constraint pk_secretariat_outgoing primary key,
    uuid char(36) not null,
    registry_id int not null,
    nr_inregistrare nvarchar(100) not null,
    data_inregistrare datetime2(0) not null constraint df_secretariat_outgoing_data_inregistrare default sysdatetime(),
    destinatar nvarchar(200) not null,
    subiect nvarchar(300) not null,
    departament_emitent uniqueidentifier null,
    intocmit_de uniqueidentifier null,
    status nvarchar(30) not null constraint df_secretariat_outgoing_status default N'inregistrat',
    fisier_path nvarchar(500) null,
    created_at datetime2(0) not null constraint df_secretariat_outgoing_created_at default sysdatetime(),
    updated_at datetime2(0) null,
    constraint uq_secretariat_outgoing_uuid unique (uuid),
    constraint fk_secretariat_outgoing_registry foreign key (registry_id) references secretariat.registries(id) on delete no action,
    constraint fk_secretariat_outgoing_department foreign key (departament_emitent) references core.departments(id) on delete no action,
    constraint fk_secretariat_outgoing_intocmit_de foreign key (intocmit_de) references core.users(id) on delete no action
  );
END;

IF OBJECT_ID(N'environment.waste_manifests', N'U') IS NULL
BEGIN
  CREATE TABLE environment.waste_manifests (
    id int identity(1,1) not null constraint pk_environment_waste_manifests primary key,
    uuid char(36) not null constraint uq_environment_waste_manifests_uuid unique,
    nr_formular nvarchar(100) not null,
    data date not null,
    tip_deseu nvarchar(100) null,
    cantitate_kg decimal(15,3) null,
    transportator nvarchar(200) null,
    destinatar nvarchar(200) null,
    status nvarchar(30) not null constraint df_environment_waste_manifests_status default N'inregistrat',
    created_at datetime2(0) not null constraint df_environment_waste_manifests_created_at default sysdatetime()
  );
END;

IF OBJECT_ID(N'environment.monitoring', N'U') IS NULL
BEGIN
  CREATE TABLE environment.monitoring (
    id int identity(1,1) not null constraint pk_environment_monitoring primary key,
    uuid char(36) not null constraint uq_environment_monitoring_uuid unique,
    tip nvarchar(100) not null,
    data datetime2(0) not null constraint df_environment_monitoring_data default sysdatetime(),
    locatie nvarchar(300) null,
    valoare decimal(15,4) null,
    limita_legala decimal(15,4) null,
    limite_depasit bit not null constraint df_environment_monitoring_limite_depasit default 0,
    observatii nvarchar(max) null,
    raportat_de uniqueidentifier null,
    created_at datetime2(0) not null constraint df_environment_monitoring_created_at default sysdatetime(),
    constraint fk_environment_monitoring_raportat_de foreign key (raportat_de) references core.users(id) on delete no action
  );
END;

IF OBJECT_ID(N'environment.incidents', N'U') IS NULL
BEGIN
  CREATE TABLE environment.incidents (
    id int identity(1,1) not null constraint pk_environment_incidents primary key,
    uuid char(36) not null constraint uq_environment_incidents_uuid unique,
    tip nvarchar(100) not null,
    data datetime2(0) not null constraint df_environment_incidents_data default sysdatetime(),
    locatie nvarchar(300) null,
    descriere nvarchar(max) null,
    severitate nvarchar(30) null,
    status nvarchar(30) not null constraint df_environment_incidents_status default N'deschis',
    raportat_de uniqueidentifier null,
    created_at datetime2(0) not null constraint df_environment_incidents_created_at default sysdatetime(),
    constraint fk_environment_incidents_raportat_de foreign key (raportat_de) references core.users(id) on delete no action
  );
END;

IF OBJECT_ID(N'legal.litigation', N'U') IS NULL
BEGIN
  CREATE TABLE legal.litigation (
    id int identity(1,1) not null constraint pk_legal_litigation primary key,
    uuid char(36) not null constraint uq_legal_litigation_uuid unique,
    nr_dosar nvarchar(100) not null,
    instanta nvarchar(200) null,
    obiect nvarchar(300) null,
    parte_adversa nvarchar(200) null,
    status nvarchar(30) not null constraint df_legal_litigation_status default N'activ',
    responsabil_id uniqueidentifier null,
    termen_urmator date null,
    observatii nvarchar(max) null,
    created_at datetime2(0) not null constraint df_legal_litigation_created_at default sysdatetime(),
    updated_at datetime2(0) null,
    constraint fk_legal_litigation_responsabil foreign key (responsabil_id) references core.users(id) on delete no action
  );
END;

IF OBJECT_ID(N'legal.litigation_hearings', N'U') IS NULL
BEGIN
  CREATE TABLE legal.litigation_hearings (
    id int identity(1,1) not null constraint pk_legal_litigation_hearings primary key,
    litigation_id int not null,
    data_termen datetime2(0) not null,
    instanta nvarchar(200) null,
    rezultat nvarchar(max) null,
    termen_urmator date null,
    created_at datetime2(0) not null constraint df_legal_litigation_hearings_created_at default sysdatetime(),
    constraint fk_legal_litigation_hearings_litigation foreign key (litigation_id) references legal.litigation(id) on delete no action
  );
END;

IF OBJECT_ID(N'legal.opinions', N'U') IS NULL
BEGIN
  CREATE TABLE legal.opinions (
    id int identity(1,1) not null constraint pk_legal_opinions primary key,
    uuid char(36) not null constraint uq_legal_opinions_uuid unique,
    titlu nvarchar(300) not null,
    continut nvarchar(max) null,
    solicitant_id uniqueidentifier null,
    document_id int null,
    created_at datetime2(0) not null constraint df_legal_opinions_created_at default sysdatetime(),
    constraint fk_legal_opinions_solicitant foreign key (solicitant_id) references core.users(id) on delete no action,
    constraint fk_legal_opinions_document foreign key (document_id) references documents.documents(id) on delete no action
  );
END;

IF OBJECT_ID(N'archive.requests', N'U') IS NULL
BEGIN
  CREATE TABLE archive.requests (
    id int identity(1,1) not null constraint pk_archive_requests primary key,
    uuid char(36) not null constraint uq_archive_requests_uuid unique,
    document_id int not null,
    scop nvarchar(max) null,
    status nvarchar(30) not null constraint df_archive_requests_status default N'solicitata',
    solicitat_de uniqueidentifier null,
    data_returnare_planificata date null,
    data_returnare_efectiva datetime2(0) null,
    created_at datetime2(0) not null constraint df_archive_requests_created_at default sysdatetime(),
    constraint fk_archive_requests_document foreign key (document_id) references archive.documents(id) on delete no action,
    constraint fk_archive_requests_solicitat_de foreign key (solicitat_de) references core.users(id) on delete no action
  );
END;

IF OBJECT_ID(N'secretariat.registry', N'U') IS NULL
BEGIN
  CREATE TABLE secretariat.registry (
    id int identity(1,1) not null constraint pk_secretariat_registry primary key,
    uuid char(36) not null constraint uq_secretariat_registry_uuid unique,
    tip nvarchar(40) not null,
    an int not null,
    nr_curent int not null,
    nr_inregistrare nvarchar(100) not null,
    data_inregistrare datetime2(0) not null constraint df_secretariat_registry_data_inregistrare default sysdatetime(),
    expeditor nvarchar(200) null,
    destinatar nvarchar(200) null,
    subiect nvarchar(300) not null,
    dept_destinatar uniqueidentifier null,
    user_responsabil uniqueidentifier null,
    status nvarchar(30) not null constraint df_secretariat_registry_status default N'inregistrat',
    fisier_path nvarchar(500) null,
    created_at datetime2(0) not null constraint df_secretariat_registry_created_at default sysdatetime(),
    updated_at datetime2(0) null,
    constraint fk_secretariat_registry_dept foreign key (dept_destinatar) references core.departments(id) on delete no action,
    constraint fk_secretariat_registry_user foreign key (user_responsabil) references core.users(id) on delete no action
  );
END;

IF OBJECT_ID(N'secretariat.correspondence_tracking', N'U') IS NULL
BEGIN
  CREATE TABLE secretariat.correspondence_tracking (
    id int identity(1,1) not null constraint pk_secretariat_correspondence_tracking primary key,
    registry_id int not null,
    dept_id uniqueidentifier not null,
    user_id uniqueidentifier null,
    termen_raspuns date null,
    status nvarchar(30) not null constraint df_secretariat_correspondence_tracking_status default N'repartizat',
    created_at datetime2(0) not null constraint df_secretariat_correspondence_tracking_created_at default sysdatetime(),
    constraint fk_secretariat_correspondence_tracking_registry foreign key (registry_id) references secretariat.registry(id) on delete no action,
    constraint fk_secretariat_correspondence_tracking_dept foreign key (dept_id) references core.departments(id) on delete no action,
    constraint fk_secretariat_correspondence_tracking_user foreign key (user_id) references core.users(id) on delete no action
  );
END;

IF OBJECT_ID(N'secretariat.appointments', N'U') IS NULL
BEGIN
  CREATE TABLE secretariat.appointments (
    id int identity(1,1) not null constraint pk_secretariat_appointments primary key,
    uuid char(36) not null constraint uq_secretariat_appointments_uuid unique,
    tip nvarchar(80) null,
    titlu nvarchar(300) not null,
    data_start datetime2(0) not null,
    data_sfarsit datetime2(0) null,
    participanti_json nvarchar(max) null,
    minuta nvarchar(max) null,
    status nvarchar(30) not null constraint df_secretariat_appointments_status default N'programat',
    created_at datetime2(0) not null constraint df_secretariat_appointments_created_at default sysdatetime(),
    updated_at datetime2(0) null
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_environment_permits_status' AND object_id = OBJECT_ID(N'environment.permits'))
  CREATE INDEX ix_environment_permits_status ON environment.permits(status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_environment_permits_expirare' AND object_id = OBJECT_ID(N'environment.permits'))
  CREATE INDEX ix_environment_permits_expirare ON environment.permits(data_expirare);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_environment_measurements_point_data' AND object_id = OBJECT_ID(N'environment.measurements'))
  CREATE INDEX ix_environment_measurements_point_data ON environment.measurements(point_id, data);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_environment_waste_transfers_data' AND object_id = OBJECT_ID(N'environment.waste_transfers'))
  CREATE INDEX ix_environment_waste_transfers_data ON environment.waste_transfers(data);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_legal_cases_status' AND object_id = OBJECT_ID(N'legal.cases'))
  CREATE INDEX ix_legal_cases_status ON legal.cases(status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_legal_cases_termen' AND object_id = OBJECT_ID(N'legal.cases'))
  CREATE INDEX ix_legal_cases_termen ON legal.cases(termen_urmator);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_legal_contracts_status' AND object_id = OBJECT_ID(N'legal.contracts'))
  CREATE INDEX ix_legal_contracts_status ON legal.contracts(status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_legal_deadlines_data' AND object_id = OBJECT_ID(N'legal.deadlines'))
  CREATE INDEX ix_legal_deadlines_data ON legal.deadlines(data_scadenta);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_archive_documents_box' AND object_id = OBJECT_ID(N'archive.documents'))
  CREATE INDEX ix_archive_documents_box ON archive.documents(box_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_archive_documents_status' AND object_id = OBJECT_ID(N'archive.documents'))
  CREATE INDEX ix_archive_documents_status ON archive.documents(status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_archive_loans_document' AND object_id = OBJECT_ID(N'archive.loans'))
  CREATE INDEX ix_archive_loans_document ON archive.loans(archive_document_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_secretariat_incoming_registry' AND object_id = OBJECT_ID(N'secretariat.incoming'))
  CREATE INDEX ix_secretariat_incoming_registry ON secretariat.incoming(registry_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_secretariat_incoming_data' AND object_id = OBJECT_ID(N'secretariat.incoming'))
  CREATE INDEX ix_secretariat_incoming_data ON secretariat.incoming(data_inregistrare);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_secretariat_outgoing_registry' AND object_id = OBJECT_ID(N'secretariat.outgoing'))
  CREATE INDEX ix_secretariat_outgoing_registry ON secretariat.outgoing(registry_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_secretariat_outgoing_data' AND object_id = OBJECT_ID(N'secretariat.outgoing'))
  CREATE INDEX ix_secretariat_outgoing_data ON secretariat.outgoing(data_inregistrare);

COMMIT TRANSACTION;
