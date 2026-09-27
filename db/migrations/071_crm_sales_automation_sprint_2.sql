/* CRM Sprint 2: completează fundația v2.12.561 fără rescrierea tabelelor. */
IF COL_LENGTH(N'crm.accounts', N'address') IS NULL ALTER TABLE crm.accounts ADD address NVARCHAR(500) NULL
IF COL_LENGTH(N'crm.accounts', N'city') IS NULL ALTER TABLE crm.accounts ADD city NVARCHAR(160) NULL
IF COL_LENGTH(N'crm.accounts', N'industry') IS NULL ALTER TABLE crm.accounts ADD industry NVARCHAR(160) NULL
GO

IF COL_LENGTH(N'crm.contacts', N'mobile') IS NULL ALTER TABLE crm.contacts ADD mobile NVARCHAR(80) NULL
IF COL_LENGTH(N'crm.contacts', N'status') IS NULL ALTER TABLE crm.contacts ADD status NVARCHAR(20) NOT NULL CONSTRAINT DF_crm_contacts_status DEFAULT N'active'
GO

IF COL_LENGTH(N'crm.leads', N'description') IS NULL ALTER TABLE crm.leads ADD description NVARCHAR(MAX) NULL
IF COL_LENGTH(N'crm.leads', N'qualification_status') IS NULL ALTER TABLE crm.leads ADD qualification_status NVARCHAR(20) NOT NULL CONSTRAINT DF_crm_leads_qualification_status DEFAULT N'pending'
IF COL_LENGTH(N'crm.leads', N'lost_reason') IS NULL ALTER TABLE crm.leads ADD lost_reason NVARCHAR(500) NULL
IF COL_LENGTH(N'crm.leads', N'notes') IS NULL ALTER TABLE crm.leads ADD notes NVARCHAR(MAX) NULL
GO

IF COL_LENGTH(N'crm.activities', N'subject') IS NULL ALTER TABLE crm.activities ADD subject NVARCHAR(300) NOT NULL CONSTRAINT DF_crm_activities_subject DEFAULT N'Activitate comercială'
IF COL_LENGTH(N'crm.activities', N'notes') IS NULL ALTER TABLE crm.activities ADD notes NVARCHAR(MAX) NULL
IF COL_LENGTH(N'crm.activities', N'outcome') IS NULL ALTER TABLE crm.activities ADD outcome NVARCHAR(500) NULL
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_crm_leads_followup' AND object_id = OBJECT_ID(N'crm.leads'))
  CREATE INDEX IX_crm_leads_followup ON crm.leads(status, responsible_user_id, created_at DESC) WHERE cancelled_at IS NULL
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_crm_activities_lead_history' AND object_id = OBJECT_ID(N'crm.activities'))
  CREATE INDEX IX_crm_activities_lead_history ON crm.activities(lead_id, occurred_at DESC) WHERE cancelled_at IS NULL
GO
