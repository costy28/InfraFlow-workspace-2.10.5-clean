IF OBJECT_ID(N'fleet.assets', N'U') IS NOT NULL
AND COL_LENGTH('fleet.assets', 'tip_asset') IS NULL
BEGIN
  ALTER TABLE fleet.assets ADD tip_asset NVARCHAR(20) NULL
END

IF OBJECT_ID(N'fleet.assets', N'U') IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_fleet_assets_tip_asset'
  AND object_id = OBJECT_ID(N'fleet.assets', N'U')
)
BEGIN
  CREATE INDEX IX_fleet_assets_tip_asset
  ON fleet.assets (tip_asset, status)
END
