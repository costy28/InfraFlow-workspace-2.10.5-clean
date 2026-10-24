-- TEST ONLY: no ERP/runtime migration runner imports this directory.
IF LEFT(DB_NAME(),22) COLLATE Latin1_General_100_BIN2 <> N'INFRAFLOW_TEST_TRIALS_'
  OR LEN(DB_NAME())<>34 OR RIGHT(DB_NAME(),12) COLLATE Latin1_General_100_BIN2 LIKE '%[^A-F0-9]%'
  THROW 51101, 'test_database_required', 1;
SET XACT_ABORT ON;
BEGIN TRY
BEGIN TRANSACTION;
IF COL_LENGTH('dbo.demo_outbox','generation') IS NULL
BEGIN
  DECLARE @check sysname;
  SELECT @check=name FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID('dbo.demo_outbox')
    AND parent_column_id=COLUMNPROPERTY(OBJECT_ID('dbo.demo_outbox'),'state','ColumnId');
  IF @check IS NULL THROW 51103,'outbox_schema_unrecognized',1;
  DECLARE @drop nvarchar(max)=N'ALTER TABLE dbo.demo_outbox DROP CONSTRAINT '+QUOTENAME(@check);
  EXEC(@drop);
  ALTER TABLE dbo.demo_outbox ADD
    generation bigint NOT NULL CONSTRAINT DF_demo_outbox_generation DEFAULT(0),
    worker_id varchar(128) COLLATE Latin1_General_100_BIN2 NULL,
    claimed_at_ms bigint NULL, lease_until_ms bigint NULL, completed_at_ms bigint NULL;
  EXEC(N'ALTER TABLE dbo.demo_outbox ADD CONSTRAINT CK_demo_outbox_state
    CHECK(state IN (''pending'',''leased'',''completed'',''superseded''));
    ALTER TABLE dbo.demo_outbox ADD CONSTRAINT CK_demo_outbox_lease CHECK(
      generation>=0 AND (
        (state=''pending'' AND worker_id IS NULL AND claimed_at_ms IS NULL AND lease_until_ms IS NULL AND completed_at_ms IS NULL)
        OR (state=''leased'' AND generation>0 AND worker_id IS NOT NULL AND claimed_at_ms IS NOT NULL
          AND lease_until_ms IS NOT NULL AND lease_until_ms>claimed_at_ms AND completed_at_ms IS NULL)
        OR (state=''completed'' AND generation>0 AND worker_id IS NOT NULL AND claimed_at_ms IS NOT NULL
          AND lease_until_ms IS NOT NULL AND completed_at_ms IS NOT NULL
          AND completed_at_ms>=claimed_at_ms AND completed_at_ms<lease_until_ms)
        OR state=''superseded''));');
END;
COMMIT;
END TRY
BEGIN CATCH
  IF XACT_STATE()<>0 ROLLBACK;
  THROW;
END CATCH;
SELECT 1;
