/*
  InfraFlow - Intersoft integration
*/

SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'integration') EXEC(N'CREATE SCHEMA integration');

IF OBJECT_ID(N'integration.intersoft_projects', N'U') IS NULL
BEGIN
  CREATE TABLE integration.intersoft_projects (
    id int identity(1,1) not null constraint pk_integration_intersoft_projects primary key,
    santier_id int not null,
    denumire_intersoft nvarchar(300) not null,
    cale_fisier nvarchar(500) null,
    data_import date not null,
    versiune_deviz nvarchar(50) null,
    activ bit not null constraint df_integration_intersoft_projects_activ default 1,
    created_at datetime2(0) not null constraint df_integration_intersoft_projects_created_at default sysdatetime(),
    constraint fk_integration_intersoft_projects_santier foreign key (santier_id) references work.projects(id) on delete no action
  );
END;

IF OBJECT_ID(N'integration.intersoft_articles', N'U') IS NULL
BEGIN
  CREATE TABLE integration.intersoft_articles (
    id int identity(1,1) not null constraint pk_integration_intersoft_articles primary key,
    project_id int not null,
    cod_articol nvarchar(30) not null,
    simbol nvarchar(100) null,
    denumire nvarchar(500) not null,
    um nvarchar(20) null,
    cantitate_deviz decimal(12,3) null,
    pret_unitar decimal(12,4) null,
    valoare_totala decimal(15,2) null,
    capitol nvarchar(100) null,
    deviz_cod nvarchar(50) null,
    sort_order int null,
    created_at datetime2(0) not null constraint df_integration_intersoft_articles_created_at default sysdatetime(),
    constraint fk_integration_intersoft_articles_project foreign key (project_id) references integration.intersoft_projects(id) on delete no action
  );
END;

IF OBJECT_ID(N'integration.intersoft_sync_log', N'U') IS NULL
BEGIN
  CREATE TABLE integration.intersoft_sync_log (
    id int identity(1,1) not null constraint pk_integration_intersoft_sync_log primary key,
    project_id int not null,
    tip nvarchar(40) not null,
    fisier_sursa nvarchar(500) null,
    nr_articole int null,
    status nvarchar(30) not null,
    mesaj nvarchar(max) null,
    efectuat_de nvarchar(64) null,
    created_at datetime2(0) not null constraint df_integration_intersoft_sync_log_created_at default sysdatetime(),
    constraint ck_integration_intersoft_sync_log_tip check (tip in (N'import_deviz', N'export_cantitati', N'import_situatie')),
    constraint ck_integration_intersoft_sync_log_status check (status in (N'ok', N'eroare', N'partial')),
    constraint fk_integration_intersoft_sync_log_project foreign key (project_id) references integration.intersoft_projects(id) on delete no action,
    constraint fk_integration_intersoft_sync_log_efectuat_de foreign key (efectuat_de) references core.users(id) on delete no action
  );
END;

IF OBJECT_ID(N'integration.situation_imports', N'U') IS NULL
BEGIN
  CREATE TABLE integration.situation_imports (
    id int identity(1,1) not null constraint pk_integration_situation_imports primary key,
    uuid char(36) not null,
    project_id int not null,
    nr_situatie nvarchar(100) null,
    data_situatie date null,
    tip nvarchar(30) not null,
    fisier_original_path nvarchar(500) null,
    total_fara_tva decimal(15,2) null,
    tva decimal(15,2) null,
    total_cu_tva decimal(15,2) null,
    status nvarchar(40) not null constraint df_integration_situation_imports_status default N'importat',
    document_id int null,
    created_at datetime2(0) not null constraint df_integration_situation_imports_created_at default sysdatetime(),
    constraint uq_integration_situation_imports_uuid unique (uuid),
    constraint ck_integration_situation_imports_tip check (tip in (N'realizat', N'renuntare', N'ncs')),
    constraint ck_integration_situation_imports_status check (status in (N'importat', N'in_circuit', N'aprobat', N'facturat')),
    constraint fk_integration_situation_imports_project foreign key (project_id) references integration.intersoft_projects(id) on delete no action,
    constraint fk_integration_situation_imports_document foreign key (document_id) references documents.documents(id) on delete no action
  );
END;

IF OBJECT_ID(N'integration.situation_items', N'U') IS NULL
BEGIN
  CREATE TABLE integration.situation_items (
    id int identity(1,1) not null constraint pk_integration_situation_items primary key,
    situatie_id int not null,
    article_id int not null,
    cantitate_realizata decimal(12,3) null,
    cantitate_renuntata decimal(12,3) not null constraint df_integration_situation_items_cantitate_renuntata default 0,
    cantitate_suplimentata decimal(12,3) not null constraint df_integration_situation_items_cantitate_suplimentata default 0,
    valoare_realizata decimal(15,2) null,
    valoare_renuntata decimal(15,2) not null constraint df_integration_situation_items_valoare_renuntata default 0,
    valoare_suplimentata decimal(15,2) not null constraint df_integration_situation_items_valoare_suplimentata default 0,
    created_at datetime2(0) not null constraint df_integration_situation_items_created_at default sysdatetime(),
    constraint fk_integration_situation_items_situatie foreign key (situatie_id) references integration.situation_imports(id) on delete no action,
    constraint fk_integration_situation_items_article foreign key (article_id) references integration.intersoft_articles(id) on delete no action
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_integration_intersoft_projects_santier' AND object_id = OBJECT_ID(N'integration.intersoft_projects'))
  CREATE INDEX ix_integration_intersoft_projects_santier ON integration.intersoft_projects(santier_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_integration_intersoft_projects_created_at' AND object_id = OBJECT_ID(N'integration.intersoft_projects'))
  CREATE INDEX ix_integration_intersoft_projects_created_at ON integration.intersoft_projects(created_at DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_integration_intersoft_articles_project' AND object_id = OBJECT_ID(N'integration.intersoft_articles'))
  CREATE INDEX ix_integration_intersoft_articles_project ON integration.intersoft_articles(project_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_integration_intersoft_articles_cod_articol' AND object_id = OBJECT_ID(N'integration.intersoft_articles'))
  CREATE INDEX ix_integration_intersoft_articles_cod_articol ON integration.intersoft_articles(cod_articol);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_integration_intersoft_articles_created_at' AND object_id = OBJECT_ID(N'integration.intersoft_articles'))
  CREATE INDEX ix_integration_intersoft_articles_created_at ON integration.intersoft_articles(created_at DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_integration_intersoft_sync_log_project' AND object_id = OBJECT_ID(N'integration.intersoft_sync_log'))
  CREATE INDEX ix_integration_intersoft_sync_log_project ON integration.intersoft_sync_log(project_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_integration_intersoft_sync_log_status' AND object_id = OBJECT_ID(N'integration.intersoft_sync_log'))
  CREATE INDEX ix_integration_intersoft_sync_log_status ON integration.intersoft_sync_log(status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_integration_intersoft_sync_log_created_at' AND object_id = OBJECT_ID(N'integration.intersoft_sync_log'))
  CREATE INDEX ix_integration_intersoft_sync_log_created_at ON integration.intersoft_sync_log(created_at DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_integration_situation_imports_project' AND object_id = OBJECT_ID(N'integration.situation_imports'))
  CREATE INDEX ix_integration_situation_imports_project ON integration.situation_imports(project_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_integration_situation_imports_status' AND object_id = OBJECT_ID(N'integration.situation_imports'))
  CREATE INDEX ix_integration_situation_imports_status ON integration.situation_imports(status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_integration_situation_imports_created_at' AND object_id = OBJECT_ID(N'integration.situation_imports'))
  CREATE INDEX ix_integration_situation_imports_created_at ON integration.situation_imports(created_at DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_integration_situation_items_situatie' AND object_id = OBJECT_ID(N'integration.situation_items'))
  CREATE INDEX ix_integration_situation_items_situatie ON integration.situation_items(situatie_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_integration_situation_items_article' AND object_id = OBJECT_ID(N'integration.situation_items'))
  CREATE INDEX ix_integration_situation_items_article ON integration.situation_items(article_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_integration_situation_items_created_at' AND object_id = OBJECT_ID(N'integration.situation_items'))
  CREATE INDEX ix_integration_situation_items_created_at ON integration.situation_items(created_at DESC);

COMMIT TRANSACTION;
