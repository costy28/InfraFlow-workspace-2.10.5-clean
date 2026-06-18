/*
  InfraFlow - CRUD centre de cost si subcentre
  Compatibil cu schema existenta controlling.cost_centers (id int).
*/

SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'controlling') EXEC(N'CREATE SCHEMA controlling');

IF OBJECT_ID(N'controlling.cost_centers', N'U') IS NOT NULL
BEGIN
  IF COL_LENGTH(N'controlling.cost_centers', N'parinte_id') IS NULL
    ALTER TABLE controlling.cost_centers ADD parinte_id int NULL;

  IF COL_LENGTH(N'controlling.cost_centers', N'culoare') IS NULL
    ALTER TABLE controlling.cost_centers ADD culoare nvarchar(20) NOT NULL CONSTRAINT df_controlling_cost_centers_culoare DEFAULT N'#3B82F6';

  IF COL_LENGTH(N'controlling.cost_centers', N'tip') IS NULL
    ALTER TABLE controlling.cost_centers ADD tip nvarchar(30) NOT NULL CONSTRAINT df_controlling_cost_centers_tip DEFAULT N'general';

  IF COL_LENGTH(N'controlling.cost_centers', N'activ') IS NULL
    ALTER TABLE controlling.cost_centers ADD activ bit NOT NULL CONSTRAINT df_controlling_cost_centers_activ_crud DEFAULT 1;

  IF OBJECT_ID(N'controlling.fk_controlling_cost_centers_parinte', N'F') IS NULL
    ALTER TABLE controlling.cost_centers
      ADD CONSTRAINT fk_controlling_cost_centers_parinte
      FOREIGN KEY (parinte_id) REFERENCES controlling.cost_centers(id);

  IF OBJECT_ID(N'controlling.ck_controlling_cost_centers_tip', N'C') IS NOT NULL
    ALTER TABLE controlling.cost_centers DROP CONSTRAINT ck_controlling_cost_centers_tip;

  ALTER TABLE controlling.cost_centers
    ADD CONSTRAINT ck_controlling_cost_centers_tip
    CHECK (tip IN (
      N'general', N'departament', N'utilaj', N'lucrare', N'proiect', N'administrativ', N'auxiliar',
      N'operational', N'productie', N'spatiu', N'indirect'
    ));
END;

IF OBJECT_ID(N'controlling.cost_center_objects', N'U') IS NULL
BEGIN
  CREATE TABLE controlling.cost_center_objects (
    id int identity(1,1) not null constraint pk_controlling_cost_center_objects primary key,
    cost_center_id int not null,
    object_id nvarchar(100) not null,
    object_type nvarchar(30) not null,
    object_name nvarchar(200) null,
    created_at datetime2(0) not null constraint df_controlling_cost_center_objects_created_at default sysdatetime(),
    constraint fk_controlling_cost_center_objects_center
      foreign key (cost_center_id) references controlling.cost_centers(id) on delete no action,
    constraint ck_controlling_cost_center_objects_type
      check (object_type in (N'vehicle', N'equipment', N'project')),
    constraint uq_controlling_cost_center_objects_unique
      unique (cost_center_id, object_id, object_type)
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_controlling_cost_center_objects_center' AND object_id = OBJECT_ID(N'controlling.cost_center_objects'))
  CREATE INDEX ix_controlling_cost_center_objects_center ON controlling.cost_center_objects(cost_center_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_controlling_cost_center_objects_object' AND object_id = OBJECT_ID(N'controlling.cost_center_objects'))
  CREATE INDEX ix_controlling_cost_center_objects_object ON controlling.cost_center_objects(object_type, object_id);

COMMIT TRANSACTION;
