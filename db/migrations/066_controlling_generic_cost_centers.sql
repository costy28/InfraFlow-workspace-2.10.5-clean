/*
  InfraFlow - centre de cost generice pentru produs comercial
  Dezactiveaza seed-ul istoric Publiserv si permite asocierea centrelor
  la departamente, utilaje/vehicule si lucrari/proiecte.
*/

SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'controlling') EXEC(N'CREATE SCHEMA controlling');

IF OBJECT_ID(N'controlling.cost_centers', N'U') IS NOT NULL
BEGIN
  IF COL_LENGTH(N'controlling.cost_centers', N'cancelled_at') IS NULL
    ALTER TABLE controlling.cost_centers ADD cancelled_at datetime2(0) NULL;

  IF COL_LENGTH(N'controlling.cost_centers', N'cancelled_by') IS NULL
    ALTER TABLE controlling.cost_centers ADD cancelled_by nvarchar(100) NULL;

  IF COL_LENGTH(N'controlling.cost_centers', N'cancelled_reason') IS NULL
    ALTER TABLE controlling.cost_centers ADD cancelled_reason nvarchar(500) NULL;

  UPDATE controlling.cost_centers
  SET activ = 0,
      updated_at = sysdatetime(),
      cancelled_at = COALESCE(cancelled_at, sysdatetime()),
      cancelled_reason = COALESCE(cancelled_reason, N'Dezactivat automat: seed vechi Publiserv eliminat din produsul comercial.')
  WHERE cod IN (
    N'2018611', N'2018612', N'0000005', N'0000053', N'0000109', N'0000002', N'0000004',
    N'0000007', N'2018613', N'2018614', N'2018615', N'2018616', N'2018620', N'2018621',
    N'0000034', N'ADMINISTRATIV', N'2018623'
  )
    AND activ = 1;
END;

IF OBJECT_ID(N'controlling.cost_center_objects', N'U') IS NOT NULL
BEGIN
  IF COL_LENGTH(N'controlling.cost_center_objects', N'cancelled_at') IS NULL
    ALTER TABLE controlling.cost_center_objects ADD cancelled_at datetime2(0) NULL;

  IF COL_LENGTH(N'controlling.cost_center_objects', N'cancelled_reason') IS NULL
    ALTER TABLE controlling.cost_center_objects ADD cancelled_reason nvarchar(500) NULL;

  IF OBJECT_ID(N'controlling.ck_controlling_cost_center_objects_type', N'C') IS NOT NULL
    ALTER TABLE controlling.cost_center_objects DROP CONSTRAINT ck_controlling_cost_center_objects_type;

  ALTER TABLE controlling.cost_center_objects
    ADD CONSTRAINT ck_controlling_cost_center_objects_type
    CHECK (object_type in (N'vehicle', N'equipment', N'project', N'department'));

  UPDATE cco
  SET activ = 0,
      cancelled_at = COALESCE(cco.cancelled_at, sysdatetime()),
      cancelled_reason = COALESCE(cco.cancelled_reason, N'Centrul Publiserv asociat a fost dezactivat.')
  FROM controlling.cost_center_objects cco
  JOIN controlling.cost_centers cc ON cc.id = cco.cost_center_id
  WHERE cc.cod IN (
    N'2018611', N'2018612', N'0000005', N'0000053', N'0000109', N'0000002', N'0000004',
    N'0000007', N'2018613', N'2018614', N'2018615', N'2018616', N'2018620', N'2018621',
    N'0000034', N'ADMINISTRATIV', N'2018623'
  )
    AND ISNULL(cco.activ, 1) = 1;
END;

IF OBJECT_ID(N'fleet.assets', N'U') IS NOT NULL
AND COL_LENGTH(N'fleet.assets', N'cost_center_id') IS NOT NULL
AND OBJECT_ID(N'controlling.cost_centers', N'U') IS NOT NULL
BEGIN
  UPDATE fa
  SET cost_center_id = NULL
  FROM fleet.assets fa
  JOIN controlling.cost_centers cc ON cc.id = fa.cost_center_id
  WHERE cc.cod IN (
    N'2018611', N'2018612', N'0000005', N'0000053', N'0000109', N'0000002', N'0000004',
    N'0000007', N'2018613', N'2018614', N'2018615', N'2018616', N'2018620', N'2018621',
    N'0000034', N'ADMINISTRATIV', N'2018623'
  );
END;

COMMIT TRANSACTION;
