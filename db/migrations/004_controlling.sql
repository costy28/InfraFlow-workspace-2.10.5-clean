/*
  InfraFlow - controlling / centre de cost
*/

SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'controlling') EXEC(N'CREATE SCHEMA controlling');

IF OBJECT_ID(N'controlling.cost_centers', N'U') IS NULL
BEGIN
  CREATE TABLE controlling.cost_centers (
    id int identity(1,1) not null constraint pk_controlling_cost_centers primary key,
    company_id int not null,
    cod nvarchar(30) not null,
    denumire nvarchar(200) not null,
    tip nvarchar(30) not null,
    dept_id nvarchar(64) null,
    parinte_id int null,
    nivel tinyint not null constraint df_controlling_cost_centers_nivel default 1,
    tip_resursa nvarchar(30) null,
    resursa_ref_id int null,
    buget_lunar decimal(15,2) null,
    buget_anual decimal(15,2) null,
    responsabil_id nvarchar(64) null,
    activ bit not null constraint df_controlling_cost_centers_activ default 1,
    sort_order int not null constraint df_controlling_cost_centers_sort_order default 0,
    created_at datetime2(0) not null constraint df_controlling_cost_centers_created_at default sysdatetime(),
    updated_at datetime2(0) null,
    constraint uq_controlling_cost_centers_cod unique (cod),
    constraint ck_controlling_cost_centers_tip check (tip in (N'departament', N'proiect', N'administrativ', N'auxiliar')),
    constraint ck_controlling_cost_centers_tip_resursa check (tip_resursa is null or tip_resursa in (N'utilaj', N'vehicul', N'echipa', N'ruta', N'punct_lucru', N'alt')),
    constraint fk_controlling_cost_centers_dept foreign key (dept_id) references core.departments(id) on delete no action,
    constraint fk_controlling_cost_centers_parinte foreign key (parinte_id) references controlling.cost_centers(id) on delete no action,
    constraint fk_controlling_cost_centers_responsabil foreign key (responsabil_id) references core.users(id) on delete no action
  );
END;

-- APPEND ONLY pe cost_entries: niciodată UPDATE/DELETE.
IF OBJECT_ID(N'controlling.cost_entries', N'U') IS NULL
BEGIN
  CREATE TABLE controlling.cost_entries (
    id bigint identity(1,1) not null constraint pk_controlling_cost_entries primary key,
    uuid char(36) not null,
    company_id int not null,
    cost_center_id int not null,
    subcentru_id int null,
    santier_id int null,
    data date not null,
    luna date not null,
    categorie nvarchar(50) not null,
    subcategorie nvarchar(100) null,
    descriere nvarchar(500) null,
    valoare decimal(15,2) not null,
    tva decimal(15,2) not null constraint df_controlling_cost_entries_tva default 0,
    moneda char(3) not null constraint df_controlling_cost_entries_moneda default 'RON',
    sursa nvarchar(40) not null,
    sursa_ref_id nvarchar(64) null,
    nr_document nvarchar(100) null,
    furnizor nvarchar(200) null,
    validat bit not null constraint df_controlling_cost_entries_validat default 0,
    validat_de nvarchar(64) null,
    validat_la datetime2(0) null,
    inregistrat_de nvarchar(64) null,
    observatii nvarchar(max) null,
    created_at datetime2(0) not null constraint df_controlling_cost_entries_created_at default sysdatetime(),
    constraint uq_controlling_cost_entries_uuid unique (uuid),
    constraint ck_controlling_cost_entries_categorie check (categorie in (N'combustibil', N'piese_schimb', N'reparatii', N'manopera', N'subcontractori', N'materiale', N'consumabile', N'amortizare', N'chirii', N'taxe_impozite', N'asigurari', N'alte_cheltuieli')),
    constraint ck_controlling_cost_entries_sursa check (sursa in (N'manual', N'bon_consum', N'pontaj', N'raport_utilaj', N'nexus_import', N'factura_furnizor', N'bon_fiscal')),
    constraint fk_controlling_cost_entries_cost_center foreign key (cost_center_id) references controlling.cost_centers(id) on delete no action,
    constraint fk_controlling_cost_entries_subcentru foreign key (subcentru_id) references controlling.cost_centers(id) on delete no action,
    constraint fk_controlling_cost_entries_santier foreign key (santier_id) references work.projects(id) on delete no action,
    constraint fk_controlling_cost_entries_validat_de foreign key (validat_de) references core.users(id) on delete no action,
    constraint fk_controlling_cost_entries_inregistrat_de foreign key (inregistrat_de) references core.users(id) on delete no action
  );
END;

IF OBJECT_ID(N'controlling.budgets', N'U') IS NULL
BEGIN
  CREATE TABLE controlling.budgets (
    id int identity(1,1) not null constraint pk_controlling_budgets primary key,
    cost_center_id int not null,
    an int not null,
    luna int null,
    categorie nvarchar(50) null,
    valoare decimal(15,2) not null,
    aprobat_de nvarchar(64) null,
    aprobat_la datetime2(0) null,
    created_at datetime2(0) not null constraint df_controlling_budgets_created_at default sysdatetime(),
    constraint uq_controlling_budgets_cost_center_an_luna_categorie unique (cost_center_id, an, luna, categorie),
    constraint ck_controlling_budgets_luna check (luna is null or luna between 1 and 12),
    constraint fk_controlling_budgets_cost_center foreign key (cost_center_id) references controlling.cost_centers(id) on delete no action,
    constraint fk_controlling_budgets_aprobat_de foreign key (aprobat_de) references core.users(id) on delete no action
  );
END;

IF OBJECT_ID(N'controlling.allocation_rules', N'U') IS NULL
BEGIN
  CREATE TABLE controlling.allocation_rules (
    id int identity(1,1) not null constraint pk_controlling_allocation_rules primary key,
    denumire nvarchar(200) null,
    cost_center_sursa_id int not null,
    metoda nvarchar(30) not null,
    activ bit not null constraint df_controlling_allocation_rules_activ default 1,
    created_at datetime2(0) not null constraint df_controlling_allocation_rules_created_at default sysdatetime(),
    constraint ck_controlling_allocation_rules_metoda check (metoda in (N'procent', N'ore', N'km', N'uniform')),
    constraint fk_controlling_allocation_rules_cost_center_sursa foreign key (cost_center_sursa_id) references controlling.cost_centers(id) on delete no action
  );
END;

IF OBJECT_ID(N'controlling.allocation_targets', N'U') IS NULL
BEGIN
  CREATE TABLE controlling.allocation_targets (
    id int identity(1,1) not null constraint pk_controlling_allocation_targets primary key,
    rule_id int not null,
    cost_center_tinta_id int not null,
    procent decimal(5,2) null,
    created_at datetime2(0) not null constraint df_controlling_allocation_targets_created_at default sysdatetime(),
    constraint fk_controlling_allocation_targets_rule foreign key (rule_id) references controlling.allocation_rules(id) on delete no action,
    constraint fk_controlling_allocation_targets_cost_center_tinta foreign key (cost_center_tinta_id) references controlling.cost_centers(id) on delete no action
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_controlling_cost_centers_dept' AND object_id = OBJECT_ID(N'controlling.cost_centers'))
  CREATE INDEX ix_controlling_cost_centers_dept ON controlling.cost_centers(dept_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_controlling_cost_centers_parinte' AND object_id = OBJECT_ID(N'controlling.cost_centers'))
  CREATE INDEX ix_controlling_cost_centers_parinte ON controlling.cost_centers(parinte_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_controlling_cost_entries_cost_center' AND object_id = OBJECT_ID(N'controlling.cost_entries'))
  CREATE INDEX ix_controlling_cost_entries_cost_center ON controlling.cost_entries(cost_center_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_controlling_cost_entries_data' AND object_id = OBJECT_ID(N'controlling.cost_entries'))
  CREATE INDEX ix_controlling_cost_entries_data ON controlling.cost_entries(data);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_controlling_cost_entries_luna' AND object_id = OBJECT_ID(N'controlling.cost_entries'))
  CREATE INDEX ix_controlling_cost_entries_luna ON controlling.cost_entries(luna);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_controlling_cost_entries_santier' AND object_id = OBJECT_ID(N'controlling.cost_entries'))
  CREATE INDEX ix_controlling_cost_entries_santier ON controlling.cost_entries(santier_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_controlling_cost_entries_sursa' AND object_id = OBJECT_ID(N'controlling.cost_entries'))
  CREATE INDEX ix_controlling_cost_entries_sursa ON controlling.cost_entries(sursa);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_controlling_cost_entries_categorie' AND object_id = OBJECT_ID(N'controlling.cost_entries'))
  CREATE INDEX ix_controlling_cost_entries_categorie ON controlling.cost_entries(categorie);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_controlling_cost_entries_validat' AND object_id = OBJECT_ID(N'controlling.cost_entries'))
  CREATE INDEX ix_controlling_cost_entries_validat ON controlling.cost_entries(validat);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_controlling_budgets_cost_center' AND object_id = OBJECT_ID(N'controlling.budgets'))
  CREATE INDEX ix_controlling_budgets_cost_center ON controlling.budgets(cost_center_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_controlling_budgets_luna' AND object_id = OBJECT_ID(N'controlling.budgets'))
  CREATE INDEX ix_controlling_budgets_luna ON controlling.budgets(luna);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_controlling_budgets_categorie' AND object_id = OBJECT_ID(N'controlling.budgets'))
  CREATE INDEX ix_controlling_budgets_categorie ON controlling.budgets(categorie);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_controlling_allocation_rules_cost_center_sursa' AND object_id = OBJECT_ID(N'controlling.allocation_rules'))
  CREATE INDEX ix_controlling_allocation_rules_cost_center_sursa ON controlling.allocation_rules(cost_center_sursa_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_controlling_allocation_targets_rule' AND object_id = OBJECT_ID(N'controlling.allocation_targets'))
  CREATE INDEX ix_controlling_allocation_targets_rule ON controlling.allocation_targets(rule_id);

INSERT INTO controlling.cost_centers (company_id, cod, denumire, tip, dept_id, nivel, activ, sort_order)
SELECT
  1,
  N'CC-' + dept.cod,
  dept.denumire,
  N'departament',
  dept.id,
  1,
  1,
  0
FROM core.departments dept
WHERE dept.activ = 1
  AND NOT EXISTS (
    SELECT 1
    FROM controlling.cost_centers cc
    WHERE cc.cod = N'CC-' + dept.cod
  );

COMMIT TRANSACTION;
