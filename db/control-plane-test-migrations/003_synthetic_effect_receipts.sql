-- Synthetic SQL receipt only; no external/ERP resource is created.
IF LEFT(DB_NAME(),22) COLLATE Latin1_General_100_BIN2 <> N'INFRAFLOW_TEST_TRIALS_'
  OR LEN(DB_NAME())<>34 OR RIGHT(DB_NAME(),12) COLLATE Latin1_General_100_BIN2 LIKE '%[^A-F0-9]%'
  THROW 51101, 'test_database_required', 1;
SET XACT_ABORT ON;
BEGIN TRY
BEGIN TRANSACTION;
IF OBJECT_ID('dbo.demo_synthetic_effects','U') IS NULL
  CREATE TABLE dbo.demo_synthetic_effects(
    trial_id uniqueidentifier NOT NULL, revision int NOT NULL,
    effect_count int NOT NULL CHECK(effect_count=1),
    first_generation bigint NOT NULL CHECK(first_generation>0),
    first_worker varchar(128) COLLATE Latin1_General_100_BIN2 NOT NULL,
    applied_at_ms bigint NOT NULL,
    PRIMARY KEY(trial_id,revision),
    FOREIGN KEY(trial_id,revision) REFERENCES dbo.demo_outbox(trial_id,revision)
  );
COMMIT;
END TRY BEGIN CATCH
  IF XACT_STATE()<>0 ROLLBACK;
  THROW;
END CATCH;
SELECT 1;
