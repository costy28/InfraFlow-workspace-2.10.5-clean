/*
  InfraFlow - Controlling automat din Mecanizare
  Adauga campuri de alocare centru de cost pe inregistrarile operationale.
*/

SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'controlling') EXEC(N'CREATE SCHEMA controlling');
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'fleet') EXEC(N'CREATE SCHEMA fleet');

IF OBJECT_ID(N'controlling.cost_center_objects', N'U') IS NOT NULL
BEGIN
  IF COL_LENGTH(N'controlling.cost_center_objects', N'activ') IS NULL
    ALTER TABLE controlling.cost_center_objects
      ADD activ bit NOT NULL CONSTRAINT df_controlling_cost_center_objects_activ DEFAULT 1;

  IF COL_LENGTH(N'controlling.cost_center_objects', N'created_by') IS NULL
    ALTER TABLE controlling.cost_center_objects ADD created_by nvarchar(100) NULL;
END;

IF OBJECT_ID(N'fleet.assets', N'U') IS NOT NULL AND COL_LENGTH(N'fleet.assets', N'cost_center_id') IS NULL
  ALTER TABLE fleet.assets ADD cost_center_id int NULL;

IF OBJECT_ID(N'fleet.work_logs', N'U') IS NOT NULL AND COL_LENGTH(N'fleet.work_logs', N'cost_center_id') IS NULL
  ALTER TABLE fleet.work_logs ADD cost_center_id int NULL;

IF OBJECT_ID(N'fleet.fuel_logs', N'U') IS NOT NULL AND COL_LENGTH(N'fleet.fuel_logs', N'cost_center_id') IS NULL
  ALTER TABLE fleet.fuel_logs ADD cost_center_id int NULL;

IF OBJECT_ID(N'fleet.interventions', N'U') IS NOT NULL AND COL_LENGTH(N'fleet.interventions', N'cost_center_id') IS NULL
  ALTER TABLE fleet.interventions ADD cost_center_id int NULL;

COMMIT TRANSACTION;
