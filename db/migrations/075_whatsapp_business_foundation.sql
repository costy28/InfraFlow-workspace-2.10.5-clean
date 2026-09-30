/* WhatsApp Business — fundație relațională pentru instanțe MSSQL noi.
   Mesajele live rămân compatibile cu app_state până la migrarea completă a Inbox ERP. */
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'integration') EXEC(N'CREATE SCHEMA integration')
GO

IF OBJECT_ID(N'crm.leads', N'U') IS NOT NULL
BEGIN
  IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_crm_leads_source' AND parent_object_id = OBJECT_ID(N'crm.leads'))
    ALTER TABLE crm.leads DROP CONSTRAINT CK_crm_leads_source
  ALTER TABLE crm.leads ADD CONSTRAINT CK_crm_leads_source CHECK (source IN (N'web', N'email', N'manual', N'phone', N'whatsapp', N'import', N'api', N'referral'))
END
GO

IF OBJECT_ID(N'integration.whatsapp_connections', N'U') IS NULL
BEGIN
  CREATE TABLE integration.whatsapp_connections (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_whatsapp_connections PRIMARY KEY,
    provider_key NVARCHAR(40) NOT NULL CONSTRAINT DF_whatsapp_connections_provider DEFAULT N'meta_whatsapp',
    phone_number_id NVARCHAR(100) NULL,
    display_phone_number NVARCHAR(80) NULL,
    status NVARCHAR(30) NOT NULL CONSTRAINT DF_whatsapp_connections_status DEFAULT N'disabled',
    created_at DATETIME2 NOT NULL CONSTRAINT DF_whatsapp_connections_created DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NULL,
    cancelled_at DATETIME2 NULL
  )
END
GO

IF OBJECT_ID(N'integration.whatsapp_events', N'U') IS NULL
BEGIN
  CREATE TABLE integration.whatsapp_events (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_whatsapp_events PRIMARY KEY,
    event_hash CHAR(64) NOT NULL,
    received_at DATETIME2 NOT NULL CONSTRAINT DF_whatsapp_events_received DEFAULT SYSUTCDATETIME(),
    message_count INT NOT NULL CONSTRAINT DF_whatsapp_events_count DEFAULT 0,
    status NVARCHAR(30) NOT NULL CONSTRAINT DF_whatsapp_events_status DEFAULT N'processed',
    CONSTRAINT UQ_whatsapp_events_hash UNIQUE (event_hash)
  )
END
GO

IF OBJECT_ID(N'integration.whatsapp_messages', N'U') IS NULL
BEGIN
  CREATE TABLE integration.whatsapp_messages (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_whatsapp_messages PRIMARY KEY,
    provider_message_id NVARCHAR(300) NOT NULL,
    from_phone NVARCHAR(80) NULL,
    contact_name NVARCHAR(300) NULL,
    message_type NVARCHAR(40) NOT NULL,
    body NVARCHAR(MAX) NULL,
    attachment_meta NVARCHAR(MAX) NULL,
    received_at DATETIME2 NOT NULL,
    status NVARCHAR(30) NOT NULL CONSTRAINT DF_whatsapp_messages_status DEFAULT N'unread',
    crm_lead_id INT NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_whatsapp_messages_created DEFAULT SYSUTCDATETIME(),
    cancelled_at DATETIME2 NULL,
    CONSTRAINT UQ_whatsapp_messages_provider UNIQUE (provider_message_id)
  )
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_whatsapp_messages_inbox' AND object_id = OBJECT_ID(N'integration.whatsapp_messages'))
  CREATE INDEX IX_whatsapp_messages_inbox ON integration.whatsapp_messages(status, received_at DESC)
GO
