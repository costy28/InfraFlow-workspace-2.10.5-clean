-- TEST ONLY. Outside db/migrations: never applied by the ERP migration runner.
IF LEFT(DB_NAME(),22) COLLATE Latin1_General_100_BIN2 <> N'INFRAFLOW_TEST_TRIALS_'
  OR LEN(DB_NAME())<>34 OR RIGHT(DB_NAME(),12) COLLATE Latin1_General_100_BIN2 LIKE '%[^A-F0-9]%'
  THROW 51101, 'test_database_required', 1;
SET XACT_ABORT ON;
BEGIN TRY
BEGIN TRANSACTION;
IF OBJECT_ID(N'dbo.demo_registry', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.demo_registry (
    singleton int NOT NULL PRIMARY KEY CHECK(singleton = 1),
    store_revision bigint NOT NULL CHECK(store_revision >= 0),
    snapshot nvarchar(max) NOT NULL CHECK(ISJSON(snapshot) = 1)
  );
  INSERT dbo.demo_registry VALUES(1, 0, N'{"format":"infraflow-demo-trials-v1","trials":[]}');
  CREATE TABLE dbo.demo_trials (
    trial_id uniqueidentifier NOT NULL PRIMARY KEY,
    approval_id varchar(128) COLLATE Latin1_General_100_BIN2 NOT NULL UNIQUE,
    database_name varchar(128) COLLATE Latin1_General_100_BIN2 NOT NULL UNIQUE,
    storage_key varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL UNIQUE,
    runtime_key varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL UNIQUE,
    key_ref varchar(128) COLLATE Latin1_General_100_BIN2 NOT NULL UNIQUE,
    trial_revision int NOT NULL CHECK(trial_revision >= 0),
    state varchar(32) NOT NULL CHECK(state IN ('queued','provisioning','awaiting_activation','active','expired','purge_pending','purging','deleted')),
    snapshot nvarchar(max) NOT NULL CHECK(ISJSON(snapshot) = 1)
  );
  CREATE TABLE dbo.demo_commands (
    trial_id uniqueidentifier NOT NULL REFERENCES dbo.demo_trials(trial_id),
    command_id varchar(128) COLLATE Latin1_General_100_BIN2 NOT NULL,
    digest char(64) NOT NULL,
    PRIMARY KEY(trial_id, command_id)
  );
  CREATE TABLE dbo.demo_events (
    trial_id uniqueidentifier NOT NULL REFERENCES dbo.demo_trials(trial_id),
    revision int NOT NULL, action varchar(64) NOT NULL, actor_id varchar(128) NOT NULL, at_ms bigint NOT NULL,
    PRIMARY KEY(trial_id, revision)
  );
  CREATE TABLE dbo.demo_outbox (
    trial_id uniqueidentifier NOT NULL REFERENCES dbo.demo_trials(trial_id),
    revision int NOT NULL,
    kind varchar(32) NOT NULL CHECK(kind = 'reconcile_trial'),
    state varchar(16) NOT NULL CHECK(state = 'pending'),
    PRIMARY KEY(trial_id, revision)
  );
END;
COMMIT;
END TRY
BEGIN CATCH
  IF XACT_STATE()<>0 ROLLBACK;
  THROW;
END CATCH;
SELECT 1;
