-- Sprint 5 CRM: comanda client pastreaza oferta si decizia exacta din care a rezultat.
IF COL_LENGTH(N'crm.customer_orders', N'source_quote_revision') IS NULL
  ALTER TABLE crm.customer_orders ADD source_quote_revision INT NULL
GO

IF COL_LENGTH(N'crm.customer_orders', N'source_decision_id') IS NULL
  ALTER TABLE crm.customer_orders ADD source_decision_id INT NULL
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_crm_customer_orders_decision')
  ALTER TABLE crm.customer_orders ADD CONSTRAINT FK_crm_customer_orders_decision
    FOREIGN KEY (source_decision_id) REFERENCES crm.quote_decisions(id)
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_crm_customer_orders_quote_revision' AND object_id=OBJECT_ID(N'crm.customer_orders'))
  CREATE INDEX IX_crm_customer_orders_quote_revision ON crm.customer_orders(source_quote_id, source_quote_revision, cancelled_at)
GO
