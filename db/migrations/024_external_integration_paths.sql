IF OBJECT_ID(N'core.app_settings', N'U') IS NOT NULL
BEGIN
  MERGE INTO core.app_settings AS target
  USING (VALUES
    (N'piusi_mdb_path', N'', N'integrari'),
    (N'piusi_sync_min', N'30', N'integrari'),
    (N'cantar_db_path', N'', N'integrari'),
    (N'cantar_sync_min', N'5', N'integrari'),
    (N'autominder_db_path', N'', N'integrari'),
    (N'autominder_sync_min', N'60', N'integrari')
  ) AS source ([key], [value], [group])
  ON target.[key] = source.[key]
  WHEN NOT MATCHED THEN
    INSERT ([key], [value], [group])
    VALUES (source.[key], source.[value], source.[group]);
END
