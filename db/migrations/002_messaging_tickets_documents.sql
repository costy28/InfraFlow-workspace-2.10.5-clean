/*
  InfraFlow - messaging, tickets, documents, field
*/

SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'messaging') EXEC(N'CREATE SCHEMA messaging');
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'tickets') EXEC(N'CREATE SCHEMA tickets');
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'documents') EXEC(N'CREATE SCHEMA documents');
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'field') EXEC(N'CREATE SCHEMA field');

-- MESSAGING
IF OBJECT_ID(N'messaging.channels', N'U') IS NULL
BEGIN
  CREATE TABLE messaging.channels (
    id int identity(1,1) not null constraint pk_messaging_channels primary key,
    tip nvarchar(30) not null,
    nume nvarchar(200) null,
    entitate_tip nvarchar(80) null,
    entitate_id nvarchar(64) null,
    creat_de uniqueidentifier null,
    activ bit not null constraint df_messaging_channels_activ default 1,
    created_at datetime2(0) not null constraint df_messaging_channels_created_at default sysdatetime(),
    constraint ck_messaging_channels_tip check (tip in (N'direct', N'departament', N'contextual')),
    constraint fk_messaging_channels_creat_de foreign key (creat_de) references core.users(id) on delete no action
  );
END;

IF OBJECT_ID(N'messaging.channel_members', N'U') IS NULL
BEGIN
  CREATE TABLE messaging.channel_members (
    channel_id int not null,
    user_id uniqueidentifier not null,
    rol nvarchar(30) not null constraint df_messaging_channel_members_rol default N'member',
    joined_at datetime2(0) not null constraint df_messaging_channel_members_joined_at default sysdatetime(),
    last_read_at datetime2(0) null,
    created_at datetime2(0) not null constraint df_messaging_channel_members_created_at default sysdatetime(),
    constraint pk_messaging_channel_members primary key (channel_id, user_id),
    constraint ck_messaging_channel_members_rol check (rol in (N'member', N'admin')),
    constraint fk_messaging_channel_members_channel foreign key (channel_id) references messaging.channels(id) on delete no action,
    constraint fk_messaging_channel_members_user foreign key (user_id) references core.users(id) on delete no action
  );
END;

IF OBJECT_ID(N'messaging.messages', N'U') IS NULL
BEGIN
  CREATE TABLE messaging.messages (
    id bigint identity(1,1) not null constraint pk_messaging_messages primary key,
    channel_id int not null,
    sender_id uniqueidentifier not null,
    tip nvarchar(40) not null,
    continut nvarchar(max) null,
    fisier_path nvarchar(500) null,
    fisier_nume nvarchar(200) null,
    fisier_marime int null,
    reply_to_id bigint null,
    citit_de nvarchar(max) null,
    editat_la datetime2(0) null,
    sters_la datetime2(0) null,
    created_at datetime2(0) not null constraint df_messaging_messages_created_at default sysdatetime(),
    constraint ck_messaging_messages_tip check (tip in (N'text', N'fisier', N'sistem', N'aprobare_ceruta')),
    constraint fk_messaging_messages_channel foreign key (channel_id) references messaging.channels(id) on delete no action,
    constraint fk_messaging_messages_sender foreign key (sender_id) references core.users(id) on delete no action,
    constraint fk_messaging_messages_reply foreign key (reply_to_id) references messaging.messages(id) on delete no action
  );
END;

IF OBJECT_ID(N'messaging.mentions', N'U') IS NULL
BEGIN
  CREATE TABLE messaging.mentions (
    message_id bigint not null,
    user_id uniqueidentifier not null,
    created_at datetime2(0) not null constraint df_messaging_mentions_created_at default sysdatetime(),
    constraint pk_messaging_mentions primary key (message_id, user_id),
    constraint fk_messaging_mentions_message foreign key (message_id) references messaging.messages(id) on delete no action,
    constraint fk_messaging_mentions_user foreign key (user_id) references core.users(id) on delete no action
  );
END;

-- TICKETS
IF OBJECT_ID(N'tickets.tickets', N'U') IS NULL
BEGIN
  CREATE TABLE tickets.tickets (
    id int identity(1,1) not null constraint pk_tickets_tickets primary key,
    uuid char(36) not null,
    tip nvarchar(30) not null,
    prioritate nvarchar(30) not null constraint df_tickets_tickets_prioritate default N'normala',
    status nvarchar(40) not null constraint df_tickets_tickets_status default N'deschis',
    titlu nvarchar(300) not null,
    descriere nvarchar(max) null,
    dept_sursa_id uniqueidentifier null,
    dept_responsabil_id uniqueidentifier null,
    asignat_la uniqueidentifier null,
    creat_de uniqueidentifier not null,
    rezolvat_de uniqueidentifier null,
    rezolvat_la datetime2(0) null,
    termen_limita datetime2(0) null,
    entitate_tip nvarchar(80) null,
    entitate_id nvarchar(64) null,
    created_at datetime2(0) not null constraint df_tickets_tickets_created_at default sysdatetime(),
    updated_at datetime2(0) null,
    constraint uq_tickets_tickets_uuid unique (uuid),
    constraint ck_tickets_tickets_tip check (tip in (N'sesizare', N'idee', N'tehnic', N'admin')),
    constraint ck_tickets_tickets_prioritate check (prioritate in (N'scazuta', N'normala', N'ridicata', N'urgenta', N'critica')),
    constraint ck_tickets_tickets_status check (status in (N'deschis', N'in_lucru', N'in_asteptare', N'rezolvat', N'inchis', N'respins')),
    constraint fk_tickets_tickets_dept_sursa foreign key (dept_sursa_id) references core.departments(id) on delete no action,
    constraint fk_tickets_tickets_dept_responsabil foreign key (dept_responsabil_id) references core.departments(id) on delete no action,
    constraint fk_tickets_tickets_asignat_la foreign key (asignat_la) references core.users(id) on delete no action,
    constraint fk_tickets_tickets_creat_de foreign key (creat_de) references core.users(id) on delete no action,
    constraint fk_tickets_tickets_rezolvat_de foreign key (rezolvat_de) references core.users(id) on delete no action
  );
END;

IF OBJECT_ID(N'tickets.comments', N'U') IS NULL
BEGIN
  CREATE TABLE tickets.comments (
    id int identity(1,1) not null constraint pk_tickets_comments primary key,
    ticket_id int not null,
    user_id uniqueidentifier not null,
    tip nvarchar(40) not null,
    continut nvarchar(max) null,
    vizibil_pentru_autor bit not null constraint df_tickets_comments_vizibil default 1,
    created_at datetime2(0) not null constraint df_tickets_comments_created_at default sysdatetime(),
    constraint ck_tickets_comments_tip check (tip in (N'comentariu', N'actiune', N'statuschange', N'rezolutie')),
    constraint fk_tickets_comments_ticket foreign key (ticket_id) references tickets.tickets(id) on delete no action,
    constraint fk_tickets_comments_user foreign key (user_id) references core.users(id) on delete no action
  );
END;

IF OBJECT_ID(N'tickets.attachments', N'U') IS NULL
BEGIN
  CREATE TABLE tickets.attachments (
    id int identity(1,1) not null constraint pk_tickets_attachments primary key,
    ticket_id int not null,
    comment_id int null,
    fisier_path nvarchar(500) null,
    fisier_nume nvarchar(200) null,
    fisier_marime int null,
    incarcat_de uniqueidentifier not null,
    created_at datetime2(0) not null constraint df_tickets_attachments_created_at default sysdatetime(),
    constraint fk_tickets_attachments_ticket foreign key (ticket_id) references tickets.tickets(id) on delete no action,
    constraint fk_tickets_attachments_comment foreign key (comment_id) references tickets.comments(id) on delete no action,
    constraint fk_tickets_attachments_incarcat_de foreign key (incarcat_de) references core.users(id) on delete no action
  );
END;

IF OBJECT_ID(N'tickets.escalations', N'U') IS NULL
BEGIN
  CREATE TABLE tickets.escalations (
    id int identity(1,1) not null constraint pk_tickets_escalations primary key,
    ticket_id int not null,
    de_la_user_id uniqueidentifier null,
    catre_user_id uniqueidentifier null,
    motiv nvarchar(500) null,
    created_at datetime2(0) not null constraint df_tickets_escalations_created_at default sysdatetime(),
    constraint fk_tickets_escalations_ticket foreign key (ticket_id) references tickets.tickets(id) on delete no action,
    constraint fk_tickets_escalations_de_la foreign key (de_la_user_id) references core.users(id) on delete no action,
    constraint fk_tickets_escalations_catre foreign key (catre_user_id) references core.users(id) on delete no action
  );
END;

-- DOCUMENTS
IF OBJECT_ID(N'documents.document_types', N'U') IS NULL
BEGIN
  CREATE TABLE documents.document_types (
    id nvarchar(20) not null constraint pk_documents_document_types primary key,
    denumire nvarchar(200) null,
    template_html nvarchar(max) null,
    workflow_template_id uniqueidentifier null,
    serie_prefix nvarchar(10) null,
    nr_curent int not null constraint df_documents_document_types_nr_curent default 0,
    activ bit not null constraint df_documents_document_types_activ default 1,
    created_at datetime2(0) not null constraint df_documents_document_types_created_at default sysdatetime(),
    constraint fk_documents_document_types_workflow_template foreign key (workflow_template_id) references workflow.templates(id) on delete no action
  );
END;

IF OBJECT_ID(N'documents.documents', N'U') IS NULL
BEGIN
  CREATE TABLE documents.documents (
    id int identity(1,1) not null constraint pk_documents_documents primary key,
    uuid char(36) not null,
    tip_id nvarchar(20) not null,
    nr_document nvarchar(100) not null,
    titlu nvarchar(300) null,
    date_json nvarchar(max) null,
    status nvarchar(40) not null constraint df_documents_documents_status default N'draft',
    versiune int not null constraint df_documents_documents_versiune default 1,
    creat_de uniqueidentifier not null,
    dept_initiatoare uniqueidentifier null,
    prioritate nvarchar(30) not null constraint df_documents_documents_prioritate default N'normal',
    termen_limita datetime2(0) null,
    fisier_draft_path nvarchar(500) null,
    fisier_final_path nvarchar(500) null,
    created_at datetime2(0) not null constraint df_documents_documents_created_at default sysdatetime(),
    updated_at datetime2(0) null,
    constraint uq_documents_documents_uuid unique (uuid),
    constraint uq_documents_documents_nr_document unique (nr_document),
    constraint ck_documents_documents_status check (status in (N'draft', N'in_circuit', N'aprobat', N'respins', N'anulat', N'arhivat')),
    constraint ck_documents_documents_prioritate check (prioritate in (N'normal', N'urgent', N'critic')),
    constraint fk_documents_documents_tip foreign key (tip_id) references documents.document_types(id) on delete no action,
    constraint fk_documents_documents_creat_de foreign key (creat_de) references core.users(id) on delete no action,
    constraint fk_documents_documents_dept foreign key (dept_initiatoare) references core.departments(id) on delete no action
  );
END;

IF OBJECT_ID(N'documents.circuit_steps', N'U') IS NULL
BEGIN
  CREATE TABLE documents.circuit_steps (
    id int identity(1,1) not null constraint pk_documents_circuit_steps primary key,
    document_id int not null,
    nr_pas tinyint not null,
    tip nvarchar(30) not null,
    rol_responsabil nvarchar(80) null,
    user_responsabil uniqueidentifier null,
    status nvarchar(40) not null constraint df_documents_circuit_steps_status default N'asteptare',
    comentariu nvarchar(max) null,
    actionat_de uniqueidentifier null,
    actionat_la datetime2(0) null,
    termen_ore int not null constraint df_documents_circuit_steps_termen_ore default 48,
    created_at datetime2(0) not null constraint df_documents_circuit_steps_created_at default sysdatetime(),
    constraint ck_documents_circuit_steps_tip check (tip in (N'aprobare', N'avizare', N'informare', N'semnare')),
    constraint ck_documents_circuit_steps_status check (status in (N'asteptare', N'aprobat', N'avizat', N'respins', N'delegat', N'sarit')),
    constraint fk_documents_circuit_steps_document foreign key (document_id) references documents.documents(id) on delete no action,
    constraint fk_documents_circuit_steps_rol foreign key (rol_responsabil) references core.roles(role_key) on delete no action,
    constraint fk_documents_circuit_steps_user foreign key (user_responsabil) references core.users(id) on delete no action,
    constraint fk_documents_circuit_steps_actionat_de foreign key (actionat_de) references core.users(id) on delete no action
  );
END;

-- APPEND ONLY, niciodata UPDATE/DELETE
IF OBJECT_ID(N'documents.circuit_audit', N'U') IS NULL
BEGIN
  CREATE TABLE documents.circuit_audit (
    id bigint identity(1,1) not null constraint pk_documents_circuit_audit primary key,
    document_id int not null,
    user_id uniqueidentifier null,
    actiune nvarchar(50) not null,
    status_vechi nvarchar(30) null,
    status_nou nvarchar(30) null,
    comentariu nvarchar(max) null,
    ip_address nvarchar(45) null,
    created_at datetime2(0) not null constraint df_documents_circuit_audit_created_at default sysdatetime(),
    constraint fk_documents_circuit_audit_document foreign key (document_id) references documents.documents(id) on delete no action,
    constraint fk_documents_circuit_audit_user foreign key (user_id) references core.users(id) on delete no action
  );
END;

IF OBJECT_ID(N'documents.document_shares', N'U') IS NULL
BEGIN
  CREATE TABLE documents.document_shares (
    id int identity(1,1) not null constraint pk_documents_document_shares primary key,
    document_id int not null,
    shared_with_dept uniqueidentifier null,
    shared_with_user uniqueidentifier null,
    nivel_acces nvarchar(30) not null constraint df_documents_document_shares_nivel default N'citire',
    shared_by uniqueidentifier not null,
    created_at datetime2(0) not null constraint df_documents_document_shares_created_at default sysdatetime(),
    expires_at datetime2(0) null,
    constraint ck_documents_document_shares_nivel check (nivel_acces in (N'citire', N'descarcare')),
    constraint fk_documents_document_shares_document foreign key (document_id) references documents.documents(id) on delete no action,
    constraint fk_documents_document_shares_dept foreign key (shared_with_dept) references core.departments(id) on delete no action,
    constraint fk_documents_document_shares_user foreign key (shared_with_user) references core.users(id) on delete no action,
    constraint fk_documents_document_shares_by foreign key (shared_by) references core.users(id) on delete no action
  );
END;

-- FIELD
IF OBJECT_ID(N'field.site_journals', N'U') IS NULL
BEGIN
  CREATE TABLE field.site_journals (
    id int identity(1,1) not null constraint pk_field_site_journals primary key,
    uuid char(36) not null,
    santier_id uniqueidentifier not null,
    data date not null,
    tura nvarchar(20) not null constraint df_field_site_journals_tura default N'zi',
    sef_santier_id uniqueidentifier null,
    status nvarchar(40) not null constraint df_field_site_journals_status default N'draft',
    temperatura_min int null,
    temperatura_max int null,
    conditii_meteo nvarchar(30) null,
    conditii_lucru nvarchar(30) null,
    descriere_lucrari nvarchar(max) null,
    probleme_intalnite nvarchar(max) null,
    masuri_luate nvarchar(max) null,
    observatii nvarchar(max) null,
    semnat_sef_santier_la datetime2(0) null,
    semnat_diriginte_la datetime2(0) null,
    diriginte_nume nvarchar(200) null,
    diriginte_semnatura_path nvarchar(500) null,
    verificat_de uniqueidentifier null,
    verificat_la datetime2(0) null,
    aprobat_de uniqueidentifier null,
    aprobat_la datetime2(0) null,
    sync_status nvarchar(30) not null constraint df_field_site_journals_sync_status default N'synced',
    created_at datetime2(0) not null constraint df_field_site_journals_created_at default sysdatetime(),
    updated_at datetime2(0) null,
    constraint uq_field_site_journals_uuid unique (uuid),
    constraint ck_field_site_journals_tura check (tura in (N'zi', N'noapte', N'full')),
    constraint ck_field_site_journals_status check (status in (N'draft', N'trimis', N'verificat', N'aprobat')),
    constraint ck_field_site_journals_meteo check (conditii_meteo is null or conditii_meteo in (N'senin', N'noros', N'ploaie', N'vant', N'ninsoare', N'inghet')),
    constraint ck_field_site_journals_lucru check (conditii_lucru is null or conditii_lucru in (N'normale', N'dificile', N'imposibile')),
    constraint ck_field_site_journals_sync check (sync_status in (N'synced', N'pending')),
    constraint fk_field_site_journals_santier foreign key (santier_id) references work.projects(id) on delete no action,
    constraint fk_field_site_journals_sef foreign key (sef_santier_id) references core.users(id) on delete no action,
    constraint fk_field_site_journals_verificat foreign key (verificat_de) references core.users(id) on delete no action,
    constraint fk_field_site_journals_aprobat foreign key (aprobat_de) references core.users(id) on delete no action
  );
END;

IF OBJECT_ID(N'field.journal_activities', N'U') IS NULL
BEGIN
  CREATE TABLE field.journal_activities (
    id int identity(1,1) not null constraint pk_field_journal_activities primary key,
    journal_id int not null,
    tip nvarchar(30) not null,
    descriere nvarchar(300) not null,
    articol_deviz nvarchar(30) null,
    um nvarchar(20) null,
    cantitate_executata decimal(12,3) null,
    utilaj_id int null,
    material_id int null,
    ore_lucrate decimal(4,2) null,
    sort_order int not null constraint df_field_journal_activities_sort_order default 0,
    created_at datetime2(0) not null constraint df_field_journal_activities_created_at default sysdatetime(),
    constraint ck_field_journal_activities_tip check (tip in (N'lucrare', N'material', N'utilaj', N'personal', N'incident', N'inspectie')),
    constraint fk_field_journal_activities_journal foreign key (journal_id) references field.site_journals(id) on delete no action
  );
END;

IF OBJECT_ID(N'field.journal_photos', N'U') IS NULL
BEGIN
  CREATE TABLE field.journal_photos (
    id int identity(1,1) not null constraint pk_field_journal_photos primary key,
    journal_id int not null,
    activity_id int null,
    fisier_path nvarchar(500) not null,
    fisier_thumb_path nvarchar(500) null,
    denumire nvarchar(200) null,
    locatie_gps nvarchar(100) null,
    incarcat_de uniqueidentifier not null,
    created_at datetime2(0) not null constraint df_field_journal_photos_created_at default sysdatetime(),
    constraint fk_field_journal_photos_journal foreign key (journal_id) references field.site_journals(id) on delete no action,
    constraint fk_field_journal_photos_activity foreign key (activity_id) references field.journal_activities(id) on delete no action,
    constraint fk_field_journal_photos_incarcat_de foreign key (incarcat_de) references core.users(id) on delete no action
  );
END;

IF OBJECT_ID(N'field.journal_crew', N'U') IS NULL
BEGIN
  CREATE TABLE field.journal_crew (
    id int identity(1,1) not null constraint pk_field_journal_crew primary key,
    journal_id int not null,
    angajat_id uniqueidentifier null,
    nume_extern nvarchar(200) null,
    functie nvarchar(100) null,
    ore_lucrate decimal(4,2) null,
    observatii nvarchar(200) null,
    created_at datetime2(0) not null constraint df_field_journal_crew_created_at default sysdatetime(),
    constraint fk_field_journal_crew_journal foreign key (journal_id) references field.site_journals(id) on delete no action,
    constraint fk_field_journal_crew_angajat foreign key (angajat_id) references core.users(id) on delete no action
  );
END;

IF OBJECT_ID(N'field.project_milestones', N'U') IS NULL
BEGIN
  CREATE TABLE field.project_milestones (
    id int identity(1,1) not null constraint pk_field_project_milestones primary key,
    santier_id uniqueidentifier not null,
    denumire nvarchar(300) not null,
    data_planificata date null,
    data_realizata date null,
    status nvarchar(40) not null constraint df_field_project_milestones_status default N'planificat',
    progres_procent tinyint not null constraint df_field_project_milestones_progres default 0,
    responsabil_id uniqueidentifier null,
    observatii nvarchar(max) null,
    created_at datetime2(0) not null constraint df_field_project_milestones_created_at default sysdatetime(),
    updated_at datetime2(0) null,
    constraint ck_field_project_milestones_status check (status in (N'planificat', N'in_executie', N'realizat', N'intarziat', N'blocat')),
    constraint fk_field_project_milestones_santier foreign key (santier_id) references work.projects(id) on delete no action,
    constraint fk_field_project_milestones_responsabil foreign key (responsabil_id) references core.users(id) on delete no action
  );
END;

IF OBJECT_ID(N'field.project_progress', N'U') IS NULL
BEGIN
  CREATE TABLE field.project_progress (
    id int identity(1,1) not null constraint pk_field_project_progress primary key,
    santier_id uniqueidentifier not null,
    data date not null,
    progres_fizic_procent decimal(5,2) null,
    progres_valoric_procent decimal(5,2) null,
    snapshot_json nvarchar(max) null,
    calculat_la datetime2(0) null,
    calculat_de nvarchar(30) null,
    created_at datetime2(0) not null constraint df_field_project_progress_created_at default sysdatetime(),
    constraint ck_field_project_progress_calculat_de check (calculat_de is null or calculat_de in (N'automat', N'manual')),
    constraint fk_field_project_progress_santier foreign key (santier_id) references work.projects(id) on delete no action
  );
END;

IF OBJECT_ID(N'field.site_issues', N'U') IS NULL
BEGIN
  CREATE TABLE field.site_issues (
    id int identity(1,1) not null constraint pk_field_site_issues primary key,
    uuid char(36) not null,
    santier_id uniqueidentifier not null,
    journal_id int null,
    tip nvarchar(40) not null,
    gravitate nvarchar(30) not null,
    titlu nvarchar(300) not null,
    descriere nvarchar(max) null,
    status nvarchar(40) not null constraint df_field_site_issues_status default N'deschisa',
    raportat_de uniqueidentifier not null,
    asignat_la uniqueidentifier null,
    rezolvat_la datetime2(0) null,
    rezolvat_prin nvarchar(max) null,
    created_at datetime2(0) not null constraint df_field_site_issues_created_at default sysdatetime(),
    updated_at datetime2(0) null,
    constraint uq_field_site_issues_uuid unique (uuid),
    constraint ck_field_site_issues_tip check (tip in (N'calitate', N'ssm', N'tehnic', N'aprovizionare', N'proiect', N'administrativ', N'altul')),
    constraint ck_field_site_issues_gravitate check (gravitate in (N'minora', N'majora', N'blocanta')),
    constraint ck_field_site_issues_status check (status in (N'deschisa', N'in_lucru', N'rezolvata', N'inchisa')),
    constraint fk_field_site_issues_santier foreign key (santier_id) references work.projects(id) on delete no action,
    constraint fk_field_site_issues_journal foreign key (journal_id) references field.site_journals(id) on delete no action,
    constraint fk_field_site_issues_raportat_de foreign key (raportat_de) references core.users(id) on delete no action,
    constraint fk_field_site_issues_asignat_la foreign key (asignat_la) references core.users(id) on delete no action
  );
END;

IF OBJECT_ID(N'field.sign_tokens', N'U') IS NULL
BEGIN
  CREATE TABLE field.sign_tokens (
    id int identity(1,1) not null constraint pk_field_sign_tokens primary key,
    journal_id int not null,
    token char(64) not null,
    expires_at datetime2(0) not null,
    used_at datetime2(0) null,
    created_at datetime2(0) not null constraint df_field_sign_tokens_created_at default sysdatetime(),
    constraint uq_field_sign_tokens_token unique (token),
    constraint fk_field_sign_tokens_journal foreign key (journal_id) references field.site_journals(id) on delete no action
  );
END;

-- Indexes
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_messaging_channels_entitate' AND object_id = OBJECT_ID(N'messaging.channels'))
  CREATE INDEX ix_messaging_channels_entitate ON messaging.channels(entitate_tip, entitate_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_messaging_channels_created_at' AND object_id = OBJECT_ID(N'messaging.channels'))
  CREATE INDEX ix_messaging_channels_created_at ON messaging.channels(created_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_messaging_channel_members_created_at' AND object_id = OBJECT_ID(N'messaging.channel_members'))
  CREATE INDEX ix_messaging_channel_members_created_at ON messaging.channel_members(created_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_messaging_messages_created_at' AND object_id = OBJECT_ID(N'messaging.messages'))
  CREATE INDEX ix_messaging_messages_created_at ON messaging.messages(created_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_messaging_mentions_created_at' AND object_id = OBJECT_ID(N'messaging.mentions'))
  CREATE INDEX ix_messaging_mentions_created_at ON messaging.mentions(created_at DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_tickets_tickets_status' AND object_id = OBJECT_ID(N'tickets.tickets'))
  CREATE INDEX ix_tickets_tickets_status ON tickets.tickets(status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_tickets_tickets_uuid' AND object_id = OBJECT_ID(N'tickets.tickets'))
  CREATE INDEX ix_tickets_tickets_uuid ON tickets.tickets(uuid);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_tickets_tickets_created_at' AND object_id = OBJECT_ID(N'tickets.tickets'))
  CREATE INDEX ix_tickets_tickets_created_at ON tickets.tickets(created_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_tickets_tickets_entitate' AND object_id = OBJECT_ID(N'tickets.tickets'))
  CREATE INDEX ix_tickets_tickets_entitate ON tickets.tickets(entitate_tip, entitate_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_tickets_comments_created_at' AND object_id = OBJECT_ID(N'tickets.comments'))
  CREATE INDEX ix_tickets_comments_created_at ON tickets.comments(created_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_tickets_attachments_created_at' AND object_id = OBJECT_ID(N'tickets.attachments'))
  CREATE INDEX ix_tickets_attachments_created_at ON tickets.attachments(created_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_tickets_escalations_created_at' AND object_id = OBJECT_ID(N'tickets.escalations'))
  CREATE INDEX ix_tickets_escalations_created_at ON tickets.escalations(created_at DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_documents_document_types_created_at' AND object_id = OBJECT_ID(N'documents.document_types'))
  CREATE INDEX ix_documents_document_types_created_at ON documents.document_types(created_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_documents_documents_status' AND object_id = OBJECT_ID(N'documents.documents'))
  CREATE INDEX ix_documents_documents_status ON documents.documents(status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_documents_documents_uuid' AND object_id = OBJECT_ID(N'documents.documents'))
  CREATE INDEX ix_documents_documents_uuid ON documents.documents(uuid);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_documents_documents_created_at' AND object_id = OBJECT_ID(N'documents.documents'))
  CREATE INDEX ix_documents_documents_created_at ON documents.documents(created_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_documents_circuit_steps_status' AND object_id = OBJECT_ID(N'documents.circuit_steps'))
  CREATE INDEX ix_documents_circuit_steps_status ON documents.circuit_steps(status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_documents_circuit_steps_created_at' AND object_id = OBJECT_ID(N'documents.circuit_steps'))
  CREATE INDEX ix_documents_circuit_steps_created_at ON documents.circuit_steps(created_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_documents_circuit_audit_created_at' AND object_id = OBJECT_ID(N'documents.circuit_audit'))
  CREATE INDEX ix_documents_circuit_audit_created_at ON documents.circuit_audit(created_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_documents_document_shares_created_at' AND object_id = OBJECT_ID(N'documents.document_shares'))
  CREATE INDEX ix_documents_document_shares_created_at ON documents.document_shares(created_at DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_field_site_journals_status' AND object_id = OBJECT_ID(N'field.site_journals'))
  CREATE INDEX ix_field_site_journals_status ON field.site_journals(status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_field_site_journals_uuid' AND object_id = OBJECT_ID(N'field.site_journals'))
  CREATE INDEX ix_field_site_journals_uuid ON field.site_journals(uuid);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_field_site_journals_created_at' AND object_id = OBJECT_ID(N'field.site_journals'))
  CREATE INDEX ix_field_site_journals_created_at ON field.site_journals(created_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_field_site_journals_santier' AND object_id = OBJECT_ID(N'field.site_journals'))
  CREATE INDEX ix_field_site_journals_santier ON field.site_journals(santier_id, data DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_field_site_journals_sync_status' AND object_id = OBJECT_ID(N'field.site_journals'))
  CREATE INDEX ix_field_site_journals_sync_status ON field.site_journals(sync_status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_field_journal_activities_created_at' AND object_id = OBJECT_ID(N'field.journal_activities'))
  CREATE INDEX ix_field_journal_activities_created_at ON field.journal_activities(created_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_field_journal_photos_created_at' AND object_id = OBJECT_ID(N'field.journal_photos'))
  CREATE INDEX ix_field_journal_photos_created_at ON field.journal_photos(created_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_field_journal_crew_created_at' AND object_id = OBJECT_ID(N'field.journal_crew'))
  CREATE INDEX ix_field_journal_crew_created_at ON field.journal_crew(created_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_field_project_milestones_status' AND object_id = OBJECT_ID(N'field.project_milestones'))
  CREATE INDEX ix_field_project_milestones_status ON field.project_milestones(status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_field_project_milestones_santier' AND object_id = OBJECT_ID(N'field.project_milestones'))
  CREATE INDEX ix_field_project_milestones_santier ON field.project_milestones(santier_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_field_project_milestones_created_at' AND object_id = OBJECT_ID(N'field.project_milestones'))
  CREATE INDEX ix_field_project_milestones_created_at ON field.project_milestones(created_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_field_project_progress_santier' AND object_id = OBJECT_ID(N'field.project_progress'))
  CREATE INDEX ix_field_project_progress_santier ON field.project_progress(santier_id, data DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_field_project_progress_created_at' AND object_id = OBJECT_ID(N'field.project_progress'))
  CREATE INDEX ix_field_project_progress_created_at ON field.project_progress(created_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_field_site_issues_status' AND object_id = OBJECT_ID(N'field.site_issues'))
  CREATE INDEX ix_field_site_issues_status ON field.site_issues(status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_field_site_issues_uuid' AND object_id = OBJECT_ID(N'field.site_issues'))
  CREATE INDEX ix_field_site_issues_uuid ON field.site_issues(uuid);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_field_site_issues_created_at' AND object_id = OBJECT_ID(N'field.site_issues'))
  CREATE INDEX ix_field_site_issues_created_at ON field.site_issues(created_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_field_site_issues_santier' AND object_id = OBJECT_ID(N'field.site_issues'))
  CREATE INDEX ix_field_site_issues_santier ON field.site_issues(santier_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_field_sign_tokens_token' AND object_id = OBJECT_ID(N'field.sign_tokens'))
  CREATE INDEX ix_field_sign_tokens_token ON field.sign_tokens(token);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_field_sign_tokens_created_at' AND object_id = OBJECT_ID(N'field.sign_tokens'))
  CREATE INDEX ix_field_sign_tokens_created_at ON field.sign_tokens(created_at DESC);

COMMIT TRANSACTION;
