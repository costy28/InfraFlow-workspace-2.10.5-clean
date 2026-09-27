IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'crm')
BEGIN
  EXEC('CREATE SCHEMA crm')
END
GO

IF OBJECT_ID(N'crm.accounts', N'U') IS NULL
BEGIN
  CREATE TABLE crm.accounts (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_crm_accounts PRIMARY KEY,
    uuid UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_crm_accounts_uuid DEFAULT NEWID(),
    account_type NVARCHAR(30) NOT NULL CONSTRAINT DF_crm_accounts_type DEFAULT N'company',
    lifecycle_status NVARCHAR(30) NOT NULL CONSTRAINT DF_crm_accounts_status DEFAULT N'prospect',
    name NVARCHAR(300) NOT NULL,
    legal_name NVARCHAR(300) NULL,
    tax_id NVARCHAR(40) NULL,
    country_code CHAR(2) NULL,
    email NVARCHAR(254) NULL,
    phone NVARCHAR(80) NULL,
    website NVARCHAR(500) NULL,
    accounting_third_party_id INT NULL,
    owner_user_id NVARCHAR(80) NULL,
    notes NVARCHAR(MAX) NULL,
    created_by NVARCHAR(80) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_crm_accounts_created DEFAULT SYSUTCDATETIME(),
    updated_by NVARCHAR(80) NULL,
    updated_at DATETIME2 NULL,
    cancelled_by NVARCHAR(80) NULL,
    cancelled_at DATETIME2 NULL,
    cancelled_reason NVARCHAR(500) NULL,
    CONSTRAINT UQ_crm_accounts_uuid UNIQUE (uuid)
  )
END
GO

IF OBJECT_ID(N'crm.contacts', N'U') IS NULL
BEGIN
  CREATE TABLE crm.contacts (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_crm_contacts PRIMARY KEY,
    uuid UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_crm_contacts_uuid DEFAULT NEWID(),
    account_id INT NULL,
    first_name NVARCHAR(160) NULL,
    last_name NVARCHAR(160) NULL,
    display_name NVARCHAR(320) NOT NULL,
    job_title NVARCHAR(200) NULL,
    email NVARCHAR(254) NULL,
    phone NVARCHAR(80) NULL,
    is_primary BIT NOT NULL CONSTRAINT DF_crm_contacts_primary DEFAULT 0,
    notes NVARCHAR(MAX) NULL,
    created_by NVARCHAR(80) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_crm_contacts_created DEFAULT SYSUTCDATETIME(),
    updated_by NVARCHAR(80) NULL,
    updated_at DATETIME2 NULL,
    cancelled_by NVARCHAR(80) NULL,
    cancelled_at DATETIME2 NULL,
    cancelled_reason NVARCHAR(500) NULL,
    CONSTRAINT UQ_crm_contacts_uuid UNIQUE (uuid),
    CONSTRAINT FK_crm_contacts_account FOREIGN KEY (account_id) REFERENCES crm.accounts(id)
  )
END
GO

IF OBJECT_ID(N'crm.leads', N'U') IS NULL
BEGIN
  CREATE TABLE crm.leads (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_crm_leads PRIMARY KEY,
    uuid UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_crm_leads_uuid DEFAULT NEWID(),
    source NVARCHAR(40) NOT NULL CONSTRAINT DF_crm_leads_source DEFAULT N'manual',
    status NVARCHAR(40) NOT NULL CONSTRAINT DF_crm_leads_status DEFAULT N'new',
    title NVARCHAR(300) NOT NULL,
    account_id INT NULL,
    contact_id INT NULL,
    responsible_user_id NVARCHAR(80) NULL,
    estimated_value DECIMAL(18,2) NULL,
    currency CHAR(3) NOT NULL CONSTRAINT DF_crm_leads_currency DEFAULT N'RON',
    expected_close_date DATE NULL,
    qualification_notes NVARCHAR(MAX) NULL,
    source_reference NVARCHAR(200) NULL,
    created_by NVARCHAR(80) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_crm_leads_created DEFAULT SYSUTCDATETIME(),
    updated_by NVARCHAR(80) NULL,
    updated_at DATETIME2 NULL,
    cancelled_by NVARCHAR(80) NULL,
    cancelled_at DATETIME2 NULL,
    cancelled_reason NVARCHAR(500) NULL,
    CONSTRAINT UQ_crm_leads_uuid UNIQUE (uuid),
    CONSTRAINT CK_crm_leads_source CHECK (source IN (N'web', N'email', N'manual', N'phone', N'import', N'api', N'referral')),
    CONSTRAINT FK_crm_leads_account FOREIGN KEY (account_id) REFERENCES crm.accounts(id),
    CONSTRAINT FK_crm_leads_contact FOREIGN KEY (contact_id) REFERENCES crm.contacts(id)
  )
END
GO

IF OBJECT_ID(N'crm.activities', N'U') IS NULL
BEGIN
  CREATE TABLE crm.activities (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_crm_activities PRIMARY KEY,
    uuid UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_crm_activities_uuid DEFAULT NEWID(),
    activity_type NVARCHAR(40) NOT NULL,
    occurred_at DATETIME2 NOT NULL CONSTRAINT DF_crm_activities_occurred DEFAULT SYSUTCDATETIME(),
    lead_id INT NULL,
    account_id INT NULL,
    contact_id INT NULL,
    user_id NVARCHAR(80) NULL,
    result NVARCHAR(500) NULL,
    note NVARCHAR(MAX) NULL,
    email_reference NVARCHAR(120) NULL,
    task_reference NVARCHAR(120) NULL,
    document_reference NVARCHAR(120) NULL,
    created_by NVARCHAR(80) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_crm_activities_created DEFAULT SYSUTCDATETIME(),
    updated_by NVARCHAR(80) NULL,
    updated_at DATETIME2 NULL,
    cancelled_by NVARCHAR(80) NULL,
    cancelled_at DATETIME2 NULL,
    cancelled_reason NVARCHAR(500) NULL,
    CONSTRAINT UQ_crm_activities_uuid UNIQUE (uuid),
    CONSTRAINT FK_crm_activities_lead FOREIGN KEY (lead_id) REFERENCES crm.leads(id),
    CONSTRAINT FK_crm_activities_account FOREIGN KEY (account_id) REFERENCES crm.accounts(id),
    CONSTRAINT FK_crm_activities_contact FOREIGN KEY (contact_id) REFERENCES crm.contacts(id)
  )
END
GO

IF OBJECT_ID(N'crm.quotes', N'U') IS NULL
BEGIN
  CREATE TABLE crm.quotes (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_crm_quotes PRIMARY KEY,
    uuid UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_crm_quotes_uuid DEFAULT NEWID(),
    quote_group_uuid UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_crm_quotes_group DEFAULT NEWID(),
    quote_number NVARCHAR(80) NOT NULL,
    revision INT NOT NULL CONSTRAINT DF_crm_quotes_revision DEFAULT 1,
    status NVARCHAR(40) NOT NULL CONSTRAINT DF_crm_quotes_status DEFAULT N'draft',
    title NVARCHAR(300) NOT NULL,
    lead_id INT NULL,
    account_id INT NOT NULL,
    contact_id INT NULL,
    responsible_user_id NVARCHAR(80) NULL,
    currency CHAR(3) NOT NULL CONSTRAINT DF_crm_quotes_currency DEFAULT N'RON',
    valid_until DATE NULL,
    subtotal DECIMAL(18,2) NOT NULL CONSTRAINT DF_crm_quotes_subtotal DEFAULT 0,
    tax_total DECIMAL(18,2) NOT NULL CONSTRAINT DF_crm_quotes_tax DEFAULT 0,
    grand_total DECIMAL(18,2) NOT NULL CONSTRAINT DF_crm_quotes_total DEFAULT 0,
    snapshot_locked_at DATETIME2 NULL,
    created_by NVARCHAR(80) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_crm_quotes_created DEFAULT SYSUTCDATETIME(),
    updated_by NVARCHAR(80) NULL,
    updated_at DATETIME2 NULL,
    cancelled_by NVARCHAR(80) NULL,
    cancelled_at DATETIME2 NULL,
    cancelled_reason NVARCHAR(500) NULL,
    CONSTRAINT UQ_crm_quotes_uuid UNIQUE (uuid),
    CONSTRAINT UQ_crm_quotes_version UNIQUE (quote_group_uuid, revision),
    CONSTRAINT FK_crm_quotes_lead FOREIGN KEY (lead_id) REFERENCES crm.leads(id),
    CONSTRAINT FK_crm_quotes_account FOREIGN KEY (account_id) REFERENCES crm.accounts(id),
    CONSTRAINT FK_crm_quotes_contact FOREIGN KEY (contact_id) REFERENCES crm.contacts(id)
  )
END
GO

IF OBJECT_ID(N'crm.quote_lines', N'U') IS NULL
BEGIN
  CREATE TABLE crm.quote_lines (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_crm_quote_lines PRIMARY KEY,
    uuid UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_crm_quote_lines_uuid DEFAULT NEWID(),
    quote_id INT NOT NULL,
    line_no INT NOT NULL,
    item_code NVARCHAR(100) NULL,
    description NVARCHAR(1000) NOT NULL,
    unit NVARCHAR(40) NULL,
    quantity DECIMAL(18,4) NOT NULL CONSTRAINT DF_crm_quote_lines_quantity DEFAULT 0,
    unit_price DECIMAL(18,4) NOT NULL CONSTRAINT DF_crm_quote_lines_price DEFAULT 0,
    tax_rate DECIMAL(7,4) NOT NULL CONSTRAINT DF_crm_quote_lines_tax DEFAULT 0,
    line_total DECIMAL(18,2) NOT NULL CONSTRAINT DF_crm_quote_lines_total DEFAULT 0,
    created_by NVARCHAR(80) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_crm_quote_lines_created DEFAULT SYSUTCDATETIME(),
    updated_by NVARCHAR(80) NULL,
    updated_at DATETIME2 NULL,
    cancelled_by NVARCHAR(80) NULL,
    cancelled_at DATETIME2 NULL,
    cancelled_reason NVARCHAR(500) NULL,
    CONSTRAINT UQ_crm_quote_lines_uuid UNIQUE (uuid),
    CONSTRAINT UQ_crm_quote_lines_position UNIQUE (quote_id, line_no),
    CONSTRAINT FK_crm_quote_lines_quote FOREIGN KEY (quote_id) REFERENCES crm.quotes(id)
  )
END
GO

IF OBJECT_ID(N'crm.quote_public_links', N'U') IS NULL
BEGIN
  CREATE TABLE crm.quote_public_links (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_crm_quote_public_links PRIMARY KEY,
    uuid UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_crm_quote_public_links_uuid DEFAULT NEWID(),
    quote_id INT NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at DATETIME2 NULL,
    first_opened_at DATETIME2 NULL,
    last_opened_at DATETIME2 NULL,
    revoked_at DATETIME2 NULL,
    revoked_by NVARCHAR(80) NULL,
    created_by NVARCHAR(80) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_crm_quote_public_links_created DEFAULT SYSUTCDATETIME(),
    updated_by NVARCHAR(80) NULL,
    updated_at DATETIME2 NULL,
    cancelled_by NVARCHAR(80) NULL,
    cancelled_at DATETIME2 NULL,
    cancelled_reason NVARCHAR(500) NULL,
    CONSTRAINT UQ_crm_quote_public_links_uuid UNIQUE (uuid),
    CONSTRAINT UQ_crm_quote_public_links_token UNIQUE (token_hash),
    CONSTRAINT FK_crm_quote_public_links_quote FOREIGN KEY (quote_id) REFERENCES crm.quotes(id)
  )
END
GO

IF OBJECT_ID(N'crm.quote_decisions', N'U') IS NULL
BEGIN
  CREATE TABLE crm.quote_decisions (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_crm_quote_decisions PRIMARY KEY,
    uuid UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_crm_quote_decisions_uuid DEFAULT NEWID(),
    quote_id INT NOT NULL,
    quote_public_link_id INT NULL,
    decision NVARCHAR(30) NOT NULL,
    decided_at DATETIME2 NOT NULL CONSTRAINT DF_crm_quote_decisions_at DEFAULT SYSUTCDATETIME(),
    decided_by_name NVARCHAR(300) NULL,
    decided_by_email NVARCHAR(254) NULL,
    comment NVARCHAR(MAX) NULL,
    evidence_hash CHAR(64) NULL,
    created_by NVARCHAR(80) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_crm_quote_decisions_created DEFAULT SYSUTCDATETIME(),
    updated_by NVARCHAR(80) NULL,
    updated_at DATETIME2 NULL,
    cancelled_by NVARCHAR(80) NULL,
    cancelled_at DATETIME2 NULL,
    cancelled_reason NVARCHAR(500) NULL,
    CONSTRAINT UQ_crm_quote_decisions_uuid UNIQUE (uuid),
    CONSTRAINT FK_crm_quote_decisions_quote FOREIGN KEY (quote_id) REFERENCES crm.quotes(id),
    CONSTRAINT FK_crm_quote_decisions_link FOREIGN KEY (quote_public_link_id) REFERENCES crm.quote_public_links(id)
  )
END
GO

IF OBJECT_ID(N'crm.customer_orders', N'U') IS NULL
BEGIN
  CREATE TABLE crm.customer_orders (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_crm_customer_orders PRIMARY KEY,
    uuid UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_crm_customer_orders_uuid DEFAULT NEWID(),
    order_number NVARCHAR(80) NOT NULL,
    status NVARCHAR(40) NOT NULL CONSTRAINT DF_crm_customer_orders_status DEFAULT N'draft',
    source_quote_id INT NULL,
    account_id INT NOT NULL,
    contact_id INT NULL,
    currency CHAR(3) NOT NULL CONSTRAINT DF_crm_customer_orders_currency DEFAULT N'RON',
    subtotal DECIMAL(18,2) NOT NULL CONSTRAINT DF_crm_customer_orders_subtotal DEFAULT 0,
    tax_total DECIMAL(18,2) NOT NULL CONSTRAINT DF_crm_customer_orders_tax DEFAULT 0,
    grand_total DECIMAL(18,2) NOT NULL CONSTRAINT DF_crm_customer_orders_total DEFAULT 0,
    source_snapshot NVARCHAR(MAX) NULL,
    responsible_user_id NVARCHAR(80) NULL,
    created_by NVARCHAR(80) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_crm_customer_orders_created DEFAULT SYSUTCDATETIME(),
    updated_by NVARCHAR(80) NULL,
    updated_at DATETIME2 NULL,
    cancelled_by NVARCHAR(80) NULL,
    cancelled_at DATETIME2 NULL,
    cancelled_reason NVARCHAR(500) NULL,
    CONSTRAINT UQ_crm_customer_orders_uuid UNIQUE (uuid),
    CONSTRAINT FK_crm_customer_orders_quote FOREIGN KEY (source_quote_id) REFERENCES crm.quotes(id),
    CONSTRAINT FK_crm_customer_orders_account FOREIGN KEY (account_id) REFERENCES crm.accounts(id),
    CONSTRAINT FK_crm_customer_orders_contact FOREIGN KEY (contact_id) REFERENCES crm.contacts(id)
  )
END
GO

IF OBJECT_ID(N'crm.customer_order_lines', N'U') IS NULL
BEGIN
  CREATE TABLE crm.customer_order_lines (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_crm_customer_order_lines PRIMARY KEY,
    uuid UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_crm_customer_order_lines_uuid DEFAULT NEWID(),
    customer_order_id INT NOT NULL,
    source_quote_line_id INT NULL,
    line_no INT NOT NULL,
    item_code NVARCHAR(100) NULL,
    description NVARCHAR(1000) NOT NULL,
    unit NVARCHAR(40) NULL,
    quantity DECIMAL(18,4) NOT NULL CONSTRAINT DF_crm_customer_order_lines_quantity DEFAULT 0,
    unit_price DECIMAL(18,4) NOT NULL CONSTRAINT DF_crm_customer_order_lines_price DEFAULT 0,
    tax_rate DECIMAL(7,4) NOT NULL CONSTRAINT DF_crm_customer_order_lines_tax DEFAULT 0,
    line_total DECIMAL(18,2) NOT NULL CONSTRAINT DF_crm_customer_order_lines_total DEFAULT 0,
    line_snapshot NVARCHAR(MAX) NULL,
    created_by NVARCHAR(80) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_crm_customer_order_lines_created DEFAULT SYSUTCDATETIME(),
    updated_by NVARCHAR(80) NULL,
    updated_at DATETIME2 NULL,
    cancelled_by NVARCHAR(80) NULL,
    cancelled_at DATETIME2 NULL,
    cancelled_reason NVARCHAR(500) NULL,
    CONSTRAINT UQ_crm_customer_order_lines_uuid UNIQUE (uuid),
    CONSTRAINT UQ_crm_customer_order_lines_position UNIQUE (customer_order_id, line_no),
    CONSTRAINT FK_crm_customer_order_lines_order FOREIGN KEY (customer_order_id) REFERENCES crm.customer_orders(id),
    CONSTRAINT FK_crm_customer_order_lines_quote_line FOREIGN KEY (source_quote_line_id) REFERENCES crm.quote_lines(id)
  )
END
GO

IF OBJECT_ID(N'crm.inventory_checks', N'U') IS NULL
BEGIN
  CREATE TABLE crm.inventory_checks (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_crm_inventory_checks PRIMARY KEY,
    uuid UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_crm_inventory_checks_uuid DEFAULT NEWID(),
    customer_order_id INT NOT NULL,
    check_status NVARCHAR(40) NOT NULL CONSTRAINT DF_crm_inventory_checks_status DEFAULT N'pending',
    checked_at DATETIME2 NULL,
    requested_by NVARCHAR(80) NULL,
    result_snapshot NVARCHAR(MAX) NULL,
    created_by NVARCHAR(80) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_crm_inventory_checks_created DEFAULT SYSUTCDATETIME(),
    updated_by NVARCHAR(80) NULL,
    updated_at DATETIME2 NULL,
    cancelled_by NVARCHAR(80) NULL,
    cancelled_at DATETIME2 NULL,
    cancelled_reason NVARCHAR(500) NULL,
    CONSTRAINT UQ_crm_inventory_checks_uuid UNIQUE (uuid),
    CONSTRAINT FK_crm_inventory_checks_order FOREIGN KEY (customer_order_id) REFERENCES crm.customer_orders(id)
  )
END
GO

IF OBJECT_ID(N'crm.billing_documents', N'U') IS NULL
BEGIN
  CREATE TABLE crm.billing_documents (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_crm_billing_documents PRIMARY KEY,
    uuid UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_crm_billing_documents_uuid DEFAULT NEWID(),
    customer_order_id INT NOT NULL,
    document_kind NVARCHAR(30) NOT NULL,
    provider_key NVARCHAR(80) NULL,
    provider_document_id NVARCHAR(160) NULL,
    idempotency_key NVARCHAR(160) NULL,
    status NVARCHAR(40) NOT NULL CONSTRAINT DF_crm_billing_documents_status DEFAULT N'pending',
    request_snapshot NVARCHAR(MAX) NULL,
    response_snapshot NVARCHAR(MAX) NULL,
    created_by NVARCHAR(80) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_crm_billing_documents_created DEFAULT SYSUTCDATETIME(),
    updated_by NVARCHAR(80) NULL,
    updated_at DATETIME2 NULL,
    cancelled_by NVARCHAR(80) NULL,
    cancelled_at DATETIME2 NULL,
    cancelled_reason NVARCHAR(500) NULL,
    CONSTRAINT UQ_crm_billing_documents_uuid UNIQUE (uuid),
    CONSTRAINT FK_crm_billing_documents_order FOREIGN KEY (customer_order_id) REFERENCES crm.customer_orders(id)
  )
END
GO

IF OBJECT_ID(N'crm.integration_events', N'U') IS NULL
BEGIN
  CREATE TABLE crm.integration_events (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_crm_integration_events PRIMARY KEY,
    uuid UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_crm_integration_events_uuid DEFAULT NEWID(),
    provider_key NVARCHAR(80) NOT NULL,
    event_type NVARCHAR(120) NOT NULL,
    entity_type NVARCHAR(80) NULL,
    entity_uuid UNIQUEIDENTIFIER NULL,
    idempotency_key NVARCHAR(160) NULL,
    status NVARCHAR(40) NOT NULL CONSTRAINT DF_crm_integration_events_status DEFAULT N'pending',
    payload NVARCHAR(MAX) NULL,
    result NVARCHAR(MAX) NULL,
    processed_at DATETIME2 NULL,
    created_by NVARCHAR(80) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_crm_integration_events_created DEFAULT SYSUTCDATETIME(),
    updated_by NVARCHAR(80) NULL,
    updated_at DATETIME2 NULL,
    cancelled_by NVARCHAR(80) NULL,
    cancelled_at DATETIME2 NULL,
    cancelled_reason NVARCHAR(500) NULL,
    CONSTRAINT UQ_crm_integration_events_uuid UNIQUE (uuid)
  )
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_crm_accounts_status' AND object_id = OBJECT_ID(N'crm.accounts')) CREATE INDEX IX_crm_accounts_status ON crm.accounts(lifecycle_status, cancelled_at)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_crm_contacts_account' AND object_id = OBJECT_ID(N'crm.contacts')) CREATE INDEX IX_crm_contacts_account ON crm.contacts(account_id, cancelled_at)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_crm_leads_status' AND object_id = OBJECT_ID(N'crm.leads')) CREATE INDEX IX_crm_leads_status ON crm.leads(status, responsible_user_id, cancelled_at)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_crm_leads_account' AND object_id = OBJECT_ID(N'crm.leads')) CREATE INDEX IX_crm_leads_account ON crm.leads(account_id, contact_id)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_crm_activities_context' AND object_id = OBJECT_ID(N'crm.activities')) CREATE INDEX IX_crm_activities_context ON crm.activities(account_id, lead_id, occurred_at DESC)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_crm_quotes_account' AND object_id = OBJECT_ID(N'crm.quotes')) CREATE INDEX IX_crm_quotes_account ON crm.quotes(account_id, status, cancelled_at)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_crm_quotes_number' AND object_id = OBJECT_ID(N'crm.quotes')) CREATE INDEX IX_crm_quotes_number ON crm.quotes(quote_number, revision)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_crm_quote_links_quote' AND object_id = OBJECT_ID(N'crm.quote_public_links')) CREATE INDEX IX_crm_quote_links_quote ON crm.quote_public_links(quote_id, expires_at)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_crm_quote_decisions_quote' AND object_id = OBJECT_ID(N'crm.quote_decisions')) CREATE INDEX IX_crm_quote_decisions_quote ON crm.quote_decisions(quote_id, decided_at DESC)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_crm_orders_account' AND object_id = OBJECT_ID(N'crm.customer_orders')) CREATE INDEX IX_crm_orders_account ON crm.customer_orders(account_id, status, cancelled_at)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_crm_inventory_checks_order' AND object_id = OBJECT_ID(N'crm.inventory_checks')) CREATE INDEX IX_crm_inventory_checks_order ON crm.inventory_checks(customer_order_id, check_status)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_crm_billing_documents_order' AND object_id = OBJECT_ID(N'crm.billing_documents')) CREATE INDEX IX_crm_billing_documents_order ON crm.billing_documents(customer_order_id, status)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_crm_integration_events_status' AND object_id = OBJECT_ID(N'crm.integration_events')) CREATE INDEX IX_crm_integration_events_status ON crm.integration_events(provider_key, status, created_at)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_crm_customer_orders_source_quote' AND object_id = OBJECT_ID(N'crm.customer_orders')) CREATE UNIQUE INDEX UX_crm_customer_orders_source_quote ON crm.customer_orders(source_quote_id) WHERE source_quote_id IS NOT NULL
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_crm_billing_documents_idempotency' AND object_id = OBJECT_ID(N'crm.billing_documents')) CREATE UNIQUE INDEX UX_crm_billing_documents_idempotency ON crm.billing_documents(idempotency_key) WHERE idempotency_key IS NOT NULL
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_crm_integration_events_idempotency' AND object_id = OBJECT_ID(N'crm.integration_events')) CREATE UNIQUE INDEX UX_crm_integration_events_idempotency ON crm.integration_events(provider_key, idempotency_key) WHERE idempotency_key IS NOT NULL
GO
