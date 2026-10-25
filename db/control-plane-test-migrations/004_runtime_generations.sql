-- Isolated control-plane proof only. Never run by ERP migrations.
SET XACT_ABORT ON;
IF OBJECT_ID(N'dbo.demo_runtime_generations', N'U') IS NULL
CREATE TABLE dbo.demo_runtime_generations (
  trial_id uniqueidentifier NOT NULL PRIMARY KEY REFERENCES dbo.demo_trials(trial_id),
  generation int NOT NULL CHECK (generation > 0),
  epoch uniqueidentifier NOT NULL UNIQUE,
  changed_at bigint NOT NULL CHECK (changed_at >= 0)
);
IF OBJECT_ID(N'dbo.demo_runtime_generation_commands', N'U') IS NULL
CREATE TABLE dbo.demo_runtime_generation_commands (
  trial_id uniqueidentifier NOT NULL REFERENCES dbo.demo_trials(trial_id),
  command_id nvarchar(128) NOT NULL,
  digest char(64) NOT NULL,
  generation int NOT NULL CHECK (generation > 0),
  epoch uniqueidentifier NOT NULL,
  changed_at bigint NOT NULL,
  PRIMARY KEY(trial_id, command_id),
  UNIQUE(trial_id, generation)
);
SELECT 1;
