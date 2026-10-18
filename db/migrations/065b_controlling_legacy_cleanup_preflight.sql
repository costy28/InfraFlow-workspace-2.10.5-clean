-- Pregătire separată pentru compilarea migrării istorice 066.
-- Nu curățăm automat centre personalizate sau folosite în date operaționale.
SET XACT_ABORT ON;
DECLARE @alreadyApplied bit = 0;
IF OBJECT_ID(N'dbo.schema_migrations', N'U') IS NOT NULL
  EXEC sp_executesql N'SELECT @done = CASE WHEN EXISTS (SELECT 1 FROM dbo.schema_migrations WHERE filename = N''066_controlling_generic_cost_centers.sql'') THEN 1 ELSE 0 END;', N'@done bit OUTPUT', @done = @alreadyApplied OUTPUT;

IF OBJECT_ID(N'controlling.cost_centers', N'U') IS NOT NULL AND @alreadyApplied = 0
BEGIN
  CREATE TABLE #LegacyCostSeed(cod nvarchar(30) PRIMARY KEY, denumire nvarchar(200), tip nvarchar(30));
  INSERT #LegacyCostSeed VALUES
    (N'2018611',N'SERVICII SALUBRIZARE',N'operational'),
    (N'2018612',N'SERVICII DESZAPEZIRE',N'operational'),
    (N'0000005',N'REPARATII BETOANE',N'operational'),
    (N'0000053',N'PRODUCTIE INTERNA STATIE ASFALT',N'productie'),
    (N'0000109',N'ASTERNERE ASFALT',N'productie'),
    (N'0000002',N'SERVICII CANALIZARE - MARCAJE',N'operational'),
    (N'0000004',N'SERVICII CIRCULATIE - MARCAJE',N'operational'),
    (N'0000007',N'TERTI LUCRARI',N'operational'),
    (N'2018613',N'REPARATII MOBILIER STRADAL+SPATII JOACA',N'operational'),
    (N'2018614',N'SP B-DUL REPUBLICII',N'spatiu'),
    (N'2018615',N'SP STR. MUNCII',N'spatiu'),
    (N'2018616',N'SP MIHAIL KOGALNICEANU',N'spatiu'),
    (N'2018620',N'SP PETRU RARES',N'spatiu'),
    (N'2018621',N'SP DR. EMIL COSTINESCU',N'spatiu'),
    (N'0000034',N'SP STEFAN CEL MARE',N'spatiu'),
    (N'ADMINISTRATIV',N'SERVICII GENERALE ADMINISTRATIE',N'administrativ'),
    (N'2018623',N'CHELTUIELI INDIRECTE PRODUCTIE',N'indirect');

  IF EXISTS(SELECT 1 FROM controlling.cost_centers cc JOIN #LegacyCostSeed s ON s.cod=cc.cod
    WHERE cc.company_id<>1 OR cc.denumire<>s.denumire OR cc.tip<>s.tip)
    THROW 51066, 'Migrarea 066 necesita verificare manuala: cod istoric folosit de un centru personalizat. Nu s-au dezactivat centre.', 1;

  CREATE TABLE #LegacyCostIds(id int PRIMARY KEY);
  INSERT #LegacyCostIds SELECT cc.id FROM controlling.cost_centers cc JOIN #LegacyCostSeed s ON s.cod=cc.cod;
  DECLARE @schema sysname, @table sysname, @column sysname, @query nvarchar(max), @used bit=0;
  DECLARE costReferences CURSOR LOCAL FAST_FORWARD FOR
    SELECT OBJECT_SCHEMA_NAME(f.parent_object_id),OBJECT_NAME(f.parent_object_id),c.name
    FROM sys.foreign_key_columns f JOIN sys.columns c ON c.object_id=f.parent_object_id AND c.column_id=f.parent_column_id
    WHERE f.referenced_object_id=OBJECT_ID(N'controlling.cost_centers')
    UNION
    SELECT s.name,t.name,c.name FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
    JOIN sys.columns c ON c.object_id=t.object_id
    WHERE s.name IN(N'controlling',N'fleet') AND c.name IN(N'cost_center_id',N'cost_center_sursa_id',N'cost_center_tinta_id',N'subcentru_id');
  OPEN costReferences;
  FETCH NEXT FROM costReferences INTO @schema,@table,@column;
  WHILE @@FETCH_STATUS=0
  BEGIN
    SET @query=N'IF EXISTS(SELECT 1 FROM '+QUOTENAME(@schema)+N'.'+QUOTENAME(@table)+N' r JOIN #LegacyCostIds s ON r.'+QUOTENAME(@column)+N'=s.id) SET @found=1;';
    EXEC sp_executesql @query,N'@found bit OUTPUT',@found=@used OUTPUT;
    FETCH NEXT FROM costReferences INTO @schema,@table,@column;
  END;
  CLOSE costReferences;
  DEALLOCATE costReferences;
  IF @used=1
    THROW 51066, 'Migrarea 066 necesita verificare manuala: centre istorice au referinte operationale. Nu s-au modificat asocieri sau inregistrari.', 1;
  DROP TABLE #LegacyCostIds;
  DROP TABLE #LegacyCostSeed;
END;

IF OBJECT_ID(N'controlling.cost_centers', N'U') IS NOT NULL
BEGIN
  IF COL_LENGTH(N'controlling.cost_centers',N'cancelled_at') IS NULL
    ALTER TABLE controlling.cost_centers ADD cancelled_at datetime2(0) NULL;
  IF COL_LENGTH(N'controlling.cost_centers',N'cancelled_by') IS NULL
    ALTER TABLE controlling.cost_centers ADD cancelled_by nvarchar(100) NULL;
  IF COL_LENGTH(N'controlling.cost_centers',N'cancelled_reason') IS NULL
    ALTER TABLE controlling.cost_centers ADD cancelled_reason nvarchar(500) NULL;
END;
IF OBJECT_ID(N'controlling.cost_center_objects',N'U') IS NOT NULL
BEGIN
  IF COL_LENGTH(N'controlling.cost_center_objects',N'cancelled_at') IS NULL
    ALTER TABLE controlling.cost_center_objects ADD cancelled_at datetime2(0) NULL;
  IF COL_LENGTH(N'controlling.cost_center_objects',N'cancelled_reason') IS NULL
    ALTER TABLE controlling.cost_center_objects ADD cancelled_reason nvarchar(500) NULL;
END;
