/* CRM Sprint 3 — ofertare internă. Extinde fundația, fără link public/comenzi/facturare. */
IF COL_LENGTH(N'crm.quotes', N'issue_date') IS NULL ALTER TABLE crm.quotes ADD issue_date DATE NULL
IF COL_LENGTH(N'crm.quotes', N'payment_terms') IS NULL ALTER TABLE crm.quotes ADD payment_terms NVARCHAR(1000) NULL
IF COL_LENGTH(N'crm.quotes', N'delivery_terms') IS NULL ALTER TABLE crm.quotes ADD delivery_terms NVARCHAR(1000) NULL
IF COL_LENGTH(N'crm.quotes', N'notes_internal') IS NULL ALTER TABLE crm.quotes ADD notes_internal NVARCHAR(MAX) NULL
IF COL_LENGTH(N'crm.quotes', N'notes_client') IS NULL ALTER TABLE crm.quotes ADD notes_client NVARCHAR(MAX) NULL
IF COL_LENGTH(N'crm.quotes', N'discount_total') IS NULL ALTER TABLE crm.quotes ADD discount_total DECIMAL(18,2) NOT NULL CONSTRAINT DF_crm_quotes_discount_total DEFAULT 0
IF COL_LENGTH(N'crm.quotes', N'approved_by') IS NULL ALTER TABLE crm.quotes ADD approved_by NVARCHAR(80) NULL
IF COL_LENGTH(N'crm.quotes', N'approved_at') IS NULL ALTER TABLE crm.quotes ADD approved_at DATETIME2 NULL
IF COL_LENGTH(N'crm.quotes', N'sent_at') IS NULL ALTER TABLE crm.quotes ADD sent_at DATETIME2 NULL
IF COL_LENGTH(N'crm.quotes', N'document_path') IS NULL ALTER TABLE crm.quotes ADD document_path NVARCHAR(500) NULL
GO
IF COL_LENGTH(N'crm.quote_lines', N'item_type') IS NULL ALTER TABLE crm.quote_lines ADD item_type NVARCHAR(30) NOT NULL CONSTRAINT DF_crm_quote_lines_item_type DEFAULT N'custom'
IF COL_LENGTH(N'crm.quote_lines', N'item_reference') IS NULL ALTER TABLE crm.quote_lines ADD item_reference NVARCHAR(160) NULL
IF COL_LENGTH(N'crm.quote_lines', N'discount_percent') IS NULL ALTER TABLE crm.quote_lines ADD discount_percent DECIMAL(7,4) NOT NULL CONSTRAINT DF_crm_quote_lines_discount_percent DEFAULT 0
IF COL_LENGTH(N'crm.quote_lines', N'line_subtotal') IS NULL ALTER TABLE crm.quote_lines ADD line_subtotal DECIMAL(18,2) NOT NULL CONSTRAINT DF_crm_quote_lines_subtotal DEFAULT 0
IF COL_LENGTH(N'crm.quote_lines', N'line_discount') IS NULL ALTER TABLE crm.quote_lines ADD line_discount DECIMAL(18,2) NOT NULL CONSTRAINT DF_crm_quote_lines_discount DEFAULT 0
IF COL_LENGTH(N'crm.quote_lines', N'line_tax') IS NULL ALTER TABLE crm.quote_lines ADD line_tax DECIMAL(18,2) NOT NULL CONSTRAINT DF_crm_quote_lines_tax_value DEFAULT 0
IF COL_LENGTH(N'crm.quote_lines', N'notes') IS NULL ALTER TABLE crm.quote_lines ADD notes NVARCHAR(MAX) NULL
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UX_crm_quotes_number_revision' AND object_id=OBJECT_ID(N'crm.quotes')) CREATE UNIQUE INDEX UX_crm_quotes_number_revision ON crm.quotes(quote_number, revision) WHERE cancelled_at IS NULL
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_crm_quotes_status_validity' AND object_id=OBJECT_ID(N'crm.quotes')) CREATE INDEX IX_crm_quotes_status_validity ON crm.quotes(status, valid_until) WHERE cancelled_at IS NULL
GO
