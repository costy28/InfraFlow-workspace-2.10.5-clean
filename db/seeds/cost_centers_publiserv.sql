/*
  Seed centre cost/profit reale Publiserv.
  Aplicatia foloseste schema controlling.cost_centers pentru modulul Controlling.
*/

SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'controlling') EXEC(N'CREATE SCHEMA controlling');

MERGE INTO controlling.cost_centers AS target
USING (VALUES
  (N'2018611', N'SERVICII SALUBRIZARE', N'operational'),
  (N'2018612', N'SERVICII DESZAPEZIRE', N'operational'),
  (N'0000005', N'REPARATII BETOANE', N'operational'),
  (N'0000053', N'PRODUCTIE INTERNA STATIE ASFALT', N'productie'),
  (N'0000109', N'ASTERNERE ASFALT', N'productie'),
  (N'0000002', N'SERVICII CANALIZARE - MARCAJE', N'operational'),
  (N'0000004', N'SERVICII CIRCULATIE - MARCAJE', N'operational'),
  (N'0000007', N'TERTI LUCRARI', N'operational'),
  (N'2018613', N'REPARATII MOBILIER STRADAL+SPATII JOACA', N'operational'),
  (N'2018614', N'SP B-DUL REPUBLICII', N'spatiu'),
  (N'2018615', N'SP STR. MUNCII', N'spatiu'),
  (N'2018616', N'SP MIHAIL KOGALNICEANU', N'spatiu'),
  (N'2018620', N'SP PETRU RARES', N'spatiu'),
  (N'2018621', N'SP DR. EMIL COSTINESCU', N'spatiu'),
  (N'0000034', N'SP STEFAN CEL MARE', N'spatiu'),
  (N'ADMINISTRATIV', N'SERVICII GENERALE ADMINISTRATIE', N'administrativ'),
  (N'2018623', N'CHELTUIELI INDIRECTE PRODUCTIE', N'indirect')
) AS source (cod, denumire, tip)
ON target.cod = source.cod
WHEN MATCHED THEN UPDATE SET
  denumire = source.denumire,
  tip = source.tip,
  activ = 1,
  updated_at = sysdatetime()
WHEN NOT MATCHED THEN INSERT (company_id, cod, denumire, tip, activ, nivel, sort_order)
  VALUES (1, source.cod, source.denumire, source.tip, 1, 1, 0);

IF OBJECT_ID(N'fleet.assets', N'U') IS NOT NULL
BEGIN
  UPDATE fa SET cost_center_id = cc.id
  FROM fleet.assets fa
  JOIN controlling.cost_centers cc ON cc.cod = N'2018611'
  WHERE UPPER(COALESCE(fa.nr_inmatriculare, fa.registration, fa.cod, fa.assetCode, N'')) IN (N'NT12ZEW', N'NT10SCS', N'NT11SCS');

  UPDATE fa SET cost_center_id = cc.id
  FROM fleet.assets fa
  JOIN controlling.cost_centers cc ON cc.cod = N'2018612'
  WHERE UPPER(COALESCE(fa.nr_inmatriculare, fa.registration, fa.cod, fa.assetCode, N'')) IN (N'B100751', N'NT1292');

  UPDATE fa SET cost_center_id = cc.id
  FROM fleet.assets fa
  JOIN controlling.cost_centers cc ON cc.cod = N'0000053'
  WHERE UPPER(COALESCE(fa.nr_inmatriculare, fa.registration, fa.cod, fa.assetCode, N'')) IN (N'NT1673', N'NT1719', N'NT1348');

  UPDATE fa SET cost_center_id = cc.id
  FROM fleet.assets fa
  JOIN controlling.cost_centers cc ON cc.cod = N'0000002'
  WHERE UPPER(COALESCE(fa.nr_inmatriculare, fa.registration, fa.cod, fa.assetCode, N'')) IN (N'NT20SPS', N'NT21SPS');
END;

COMMIT TRANSACTION;
