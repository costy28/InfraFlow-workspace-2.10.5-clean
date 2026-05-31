/*
  InfraFlow - modul AI Assistant
  Migrare idempotenta pentru ai.* si setari AI.
*/

SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'ai')
BEGIN
  EXEC(N'CREATE SCHEMA ai')
END

IF OBJECT_ID(N'ai.conversations', N'U') IS NULL
BEGIN
  CREATE TABLE ai.conversations (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_ai_conversations PRIMARY KEY,
    uuid CHAR(36) NOT NULL,
    user_id INT NOT NULL,
    titlu NVARCHAR(200) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT df_ai_conversations_created_at DEFAULT sysdatetime(),
    updated_at DATETIME2 NULL,
    CONSTRAINT uq_ai_conversations_uuid UNIQUE (uuid),
    CONSTRAINT fk_ai_conversations_user FOREIGN KEY (user_id) REFERENCES core.users(id) ON DELETE NO ACTION
  )
END

IF OBJECT_ID(N'ai.messages', N'U') IS NULL
BEGIN
  CREATE TABLE ai.messages (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_ai_messages PRIMARY KEY,
    conversation_id INT NOT NULL,
    rol NVARCHAR(20) NOT NULL,
    continut NVARCHAR(MAX) NOT NULL,
    query_sql NVARCHAR(MAX) NULL,
    date_json NVARCHAR(MAX) NULL,
    tokens_folositi INT NULL,
    durata_ms INT NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT df_ai_messages_created_at DEFAULT sysdatetime(),
    CONSTRAINT fk_ai_messages_conversation FOREIGN KEY (conversation_id) REFERENCES ai.conversations(id) ON DELETE NO ACTION,
    CONSTRAINT ck_ai_messages_rol CHECK (rol IN (N'user', N'assistant', N'system'))
  )
END

IF OBJECT_ID(N'ai.query_cache', N'U') IS NULL
BEGIN
  CREATE TABLE ai.query_cache (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_ai_query_cache PRIMARY KEY,
    hash_intrebare CHAR(64) NOT NULL,
    query_sql NVARCHAR(MAX) NULL,
    rezultat_json NVARCHAR(MAX) NULL,
    valid_pana DATETIME2 NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT df_ai_query_cache_created_at DEFAULT sysdatetime(),
    CONSTRAINT uq_ai_query_cache_hash_intrebare UNIQUE (hash_intrebare)
  )
END

IF OBJECT_ID(N'core.app_settings', N'U') IS NOT NULL
   AND COL_LENGTH('core.app_settings', 'ai_enabled') IS NULL
BEGIN
  ALTER TABLE core.app_settings ADD
    ai_enabled BIT CONSTRAINT df_core_app_settings_ai_enabled DEFAULT 0,
    ai_api_key_encrypted NVARCHAR(500) NULL,
    ai_model_default NVARCHAR(50) CONSTRAINT df_core_app_settings_ai_model_default DEFAULT 'claude-haiku-4-5',
    ai_monthly_budget DECIMAL(10,2) CONSTRAINT df_core_app_settings_ai_monthly_budget DEFAULT 200.00,
    ai_limit_per_user INT CONSTRAINT df_core_app_settings_ai_limit_per_user DEFAULT 30,
    ai_limit_per_company INT CONSTRAINT df_core_app_settings_ai_limit_per_company DEFAULT 500,
    ai_activated_by INT NULL,
    ai_activated_at DATETIME2 NULL
END

IF OBJECT_ID(N'core.app_settings', N'U') IS NOT NULL
   AND COL_LENGTH('core.app_settings', 'ai_activated_by') IS NOT NULL
   AND OBJECT_ID(N'fk_core_app_settings_ai_activated_by', N'F') IS NULL
BEGIN
  ALTER TABLE core.app_settings
    ADD CONSTRAINT fk_core_app_settings_ai_activated_by FOREIGN KEY (ai_activated_by) REFERENCES core.users(id) ON DELETE NO ACTION
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_ai_conversations_user_id' AND object_id = OBJECT_ID(N'ai.conversations'))
  CREATE INDEX ix_ai_conversations_user_id ON ai.conversations(user_id)

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_ai_conversations_created_at' AND object_id = OBJECT_ID(N'ai.conversations'))
  CREATE INDEX ix_ai_conversations_created_at ON ai.conversations(created_at)

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_ai_messages_conversation_id' AND object_id = OBJECT_ID(N'ai.messages'))
  CREATE INDEX ix_ai_messages_conversation_id ON ai.messages(conversation_id)

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_ai_messages_created_at' AND object_id = OBJECT_ID(N'ai.messages'))
  CREATE INDEX ix_ai_messages_created_at ON ai.messages(created_at)

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_ai_query_cache_hash_intrebare' AND object_id = OBJECT_ID(N'ai.query_cache'))
  CREATE INDEX ix_ai_query_cache_hash_intrebare ON ai.query_cache(hash_intrebare)

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_ai_query_cache_created_at' AND object_id = OBJECT_ID(N'ai.query_cache'))
  CREATE INDEX ix_ai_query_cache_created_at ON ai.query_cache(created_at)

COMMIT TRANSACTION;
