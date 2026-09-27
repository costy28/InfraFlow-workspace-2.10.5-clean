/* CRM Sprint 4 — link public securizat pentru o revizie exactă de ofertă. */
IF COL_LENGTH(N'crm.quote_public_links', N'quote_revision') IS NULL
  ALTER TABLE crm.quote_public_links ADD quote_revision INT NULL
GO
IF COL_LENGTH(N'crm.quote_public_links', N'status') IS NULL
  ALTER TABLE crm.quote_public_links ADD status NVARCHAR(20) NOT NULL CONSTRAINT DF_crm_quote_public_links_status DEFAULT N'active'
GO
IF COL_LENGTH(N'crm.quote_public_links', N'decided_at') IS NULL
  ALTER TABLE crm.quote_public_links ADD decided_at DATETIME2 NULL
GO
UPDATE l SET quote_revision = q.revision
FROM crm.quote_public_links l
INNER JOIN crm.quotes q ON q.id = l.quote_id
WHERE l.quote_revision IS NULL
GO
IF COL_LENGTH(N'crm.quote_decisions', N'quote_revision') IS NULL
  ALTER TABLE crm.quote_decisions ADD quote_revision INT NULL
GO
IF COL_LENGTH(N'crm.quote_decisions', N'request_fingerprint') IS NULL
  ALTER TABLE crm.quote_decisions ADD request_fingerprint CHAR(64) NULL
GO
UPDATE d SET quote_revision = q.revision
FROM crm.quote_decisions d
INNER JOIN crm.quotes q ON q.id = d.quote_id
WHERE d.quote_revision IS NULL
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_crm_quote_public_links_lookup' AND object_id=OBJECT_ID(N'crm.quote_public_links'))
  CREATE INDEX IX_crm_quote_public_links_lookup ON crm.quote_public_links(token_hash, status, expires_at)
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_crm_quote_public_links_revision' AND object_id=OBJECT_ID(N'crm.quote_public_links'))
  CREATE INDEX IX_crm_quote_public_links_revision ON crm.quote_public_links(quote_id, quote_revision, status, expires_at)
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UX_crm_quote_decisions_revision' AND object_id=OBJECT_ID(N'crm.quote_decisions'))
  CREATE UNIQUE INDEX UX_crm_quote_decisions_revision ON crm.quote_decisions(quote_id, quote_revision) WHERE cancelled_at IS NULL
GO
