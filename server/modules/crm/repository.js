const { runMssqlScalar } = require('../../core/db')

function mssqlJson(sql, params = {}) {
  const result = runMssqlScalar(`DECLARE @p nvarchar(max) = @json;\n${sql}`, { jsonInput: JSON.stringify(params), timeoutMs: 60000 })
  const text = String(result || '').trim()
  return text ? JSON.parse(text) : null
}

function mssqlArray(sql, params = {}) {
  const value = mssqlJson(sql, params)
  return Array.isArray(value) ? value : []
}

function mssqlObject(sql, params = {}) {
  const value = mssqlJson(sql, params)
  return Array.isArray(value) ? value[0] || null : value
}

const leadFields = `
  l.id, CONVERT(nvarchar(36), l.uuid) AS uuid, l.source, l.source_reference,
  l.title, l.title AS subject, l.description, l.status, l.qualification_status,
  l.account_id, l.contact_id, l.responsible_user_id AS assigned_to,
  l.estimated_value, l.currency, l.expected_close_date, l.lost_reason, l.notes,
  l.created_at, l.created_by, l.updated_at, l.updated_by,
  a.name AS account_name, c.display_name AS contact_name,
  last_activity.occurred_at AS last_activity_at
`

function leadSelect(where) {
  return `SELECT ${leadFields}
    FROM crm.leads l
    LEFT JOIN crm.accounts a ON a.id = l.account_id AND a.cancelled_at IS NULL
    LEFT JOIN crm.contacts c ON c.id = l.contact_id AND c.cancelled_at IS NULL
    OUTER APPLY (SELECT TOP 1 occurred_at FROM crm.activities WHERE lead_id = l.id AND cancelled_at IS NULL ORDER BY occurred_at DESC, id DESC) last_activity
    WHERE ${where}`
}

function listLeads(filters = {}) {
  return mssqlArray(`${leadSelect(`l.cancelled_at IS NULL
      AND (NULLIF(JSON_VALUE(@p, '$.status'), '') IS NULL OR l.status = JSON_VALUE(@p, '$.status'))
      AND (NULLIF(JSON_VALUE(@p, '$.source'), '') IS NULL OR l.source = JSON_VALUE(@p, '$.source'))
      AND (NULLIF(JSON_VALUE(@p, '$.assigned_to'), '') IS NULL OR l.responsible_user_id = JSON_VALUE(@p, '$.assigned_to'))
      AND (NULLIF(JSON_VALUE(@p, '$.date_from'), '') IS NULL OR l.created_at >= TRY_CONVERT(datetime2, JSON_VALUE(@p, '$.date_from')))
      AND (NULLIF(JSON_VALUE(@p, '$.date_to'), '') IS NULL OR l.created_at < DATEADD(day, 1, TRY_CONVERT(datetime2, JSON_VALUE(@p, '$.date_to'))))
      AND (NULLIF(JSON_VALUE(@p, '$.q'), '') IS NULL OR l.title LIKE N'%' + JSON_VALUE(@p, '$.q') + N'%' OR ISNULL(l.description, N'') LIKE N'%' + JSON_VALUE(@p, '$.q') + N'%' OR ISNULL(a.name, N'') LIKE N'%' + JSON_VALUE(@p, '$.q') + N'%' OR ISNULL(c.display_name, N'') LIKE N'%' + JSON_VALUE(@p, '$.q') + N'%')`)} ORDER BY l.created_at DESC FOR JSON PATH;`, filters)
}

function getLead(id, tasks = []) {
  const lead = mssqlObject(`${leadSelect("l.id = TRY_CONVERT(int, JSON_VALUE(@p, '$.id')) AND l.cancelled_at IS NULL")} FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;`, { id })
  if (!lead) return null
  const activities = mssqlArray(`SELECT id, CONVERT(nvarchar(36), uuid) AS uuid, lead_id, account_id, contact_id, activity_type, occurred_at, user_id, subject, notes, outcome, task_reference, email_reference, document_reference, created_at, created_by FROM crm.activities WHERE lead_id = TRY_CONVERT(int, JSON_VALUE(@p, '$.id')) AND cancelled_at IS NULL ORDER BY occurred_at DESC, id DESC FOR JSON PATH;`, { id })
  return { ...lead, activities, tasks: (tasks || []).filter(task => String(task.source_type) === 'crm_lead' && String(task.source_id) === String(id)) }
}

function findAccount(id) {
  return mssqlObject(`SELECT TOP 1 id, CONVERT(nvarchar(36), uuid) AS uuid, name, lifecycle_status, email, phone, cancelled_at FROM crm.accounts WHERE id = TRY_CONVERT(int, JSON_VALUE(@p, '$.id')) FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;`, { id })
}

function findContact(id) {
  return mssqlObject(`SELECT TOP 1 id, CONVERT(nvarchar(36), uuid) AS uuid, account_id, display_name, email, cancelled_at FROM crm.contacts WHERE id = TRY_CONVERT(int, JSON_VALUE(@p, '$.id')) FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;`, { id })
}

function listAccounts(filters = {}) {
  return mssqlArray(`SELECT id, CONVERT(nvarchar(36), uuid) AS uuid, name, lifecycle_status AS type, lifecycle_status AS status, tax_id, email, phone, website, address, city, country_code, industry, owner_user_id, accounting_third_party_id, notes, created_at, updated_at FROM crm.accounts WHERE cancelled_at IS NULL AND (NULLIF(JSON_VALUE(@p, '$.q'), '') IS NULL OR name LIKE N'%' + JSON_VALUE(@p, '$.q') + N'%' OR ISNULL(tax_id, N'') LIKE N'%' + JSON_VALUE(@p, '$.q') + N'%') ORDER BY name FOR JSON PATH;`, filters)
}

function getAccount(id) {
  return mssqlObject(`SELECT TOP 1 id, CONVERT(nvarchar(36), uuid) AS uuid, name, lifecycle_status AS type, lifecycle_status AS status, tax_id, email, phone, website, address, city, country_code, industry, owner_user_id, accounting_third_party_id, notes, created_at, updated_at FROM crm.accounts WHERE id = TRY_CONVERT(int, JSON_VALUE(@p, '$.id')) AND cancelled_at IS NULL FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;`, { id })
}

function listContacts(filters = {}) {
  return mssqlArray(`SELECT c.id, CONVERT(nvarchar(36), c.uuid) AS uuid, c.account_id, a.name AS account_name, c.first_name, c.last_name, c.display_name, c.job_title, c.email, c.phone, c.mobile, c.is_primary, c.status, c.notes, c.created_at, c.updated_at FROM crm.contacts c LEFT JOIN crm.accounts a ON a.id = c.account_id WHERE c.cancelled_at IS NULL AND (NULLIF(JSON_VALUE(@p, '$.account_id'), '') IS NULL OR c.account_id = TRY_CONVERT(int, JSON_VALUE(@p, '$.account_id'))) ORDER BY c.display_name FOR JSON PATH;`, filters)
}

function createLead(payload, actor) {
  return mssqlObject(`INSERT INTO crm.leads (source, source_reference, title, description, status, qualification_status, account_id, contact_id, responsible_user_id, estimated_value, expected_close_date, lost_reason, notes, created_by) VALUES (JSON_VALUE(@p, '$.source'), NULLIF(JSON_VALUE(@p, '$.source_reference'), ''), JSON_VALUE(@p, '$.title'), NULLIF(JSON_VALUE(@p, '$.description'), ''), JSON_VALUE(@p, '$.status'), JSON_VALUE(@p, '$.qualification_status'), TRY_CONVERT(int, NULLIF(JSON_VALUE(@p, '$.account_id'), '')), TRY_CONVERT(int, NULLIF(JSON_VALUE(@p, '$.contact_id'), '')), NULLIF(JSON_VALUE(@p, '$.assigned_to'), ''), TRY_CONVERT(decimal(18,2), NULLIF(JSON_VALUE(@p, '$.estimated_value'), '')), TRY_CONVERT(date, NULLIF(JSON_VALUE(@p, '$.expected_close_date'), '')), NULLIF(JSON_VALUE(@p, '$.lost_reason'), ''), NULLIF(JSON_VALUE(@p, '$.notes'), ''), JSON_VALUE(@p, '$.actor')); SELECT TOP 1 id, CONVERT(nvarchar(36), uuid) AS uuid, source, source_reference, title, title AS subject, description, status, qualification_status, account_id, contact_id, responsible_user_id AS assigned_to, estimated_value, expected_close_date, lost_reason, notes, created_at, created_by FROM crm.leads WHERE id = SCOPE_IDENTITY() FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;`, { ...payload, actor })
}

function updateLead(id, payload, actor) {
  const marked = markPayload(payload)
  return mssqlObject(`UPDATE crm.leads SET source = COALESCE(NULLIF(JSON_VALUE(@p, '$.source'), ''), source), source_reference = CASE WHEN JSON_VALUE(@p, '$.has_source_reference') = 'true' THEN NULLIF(JSON_VALUE(@p, '$.source_reference'), '') ELSE source_reference END, title = COALESCE(NULLIF(JSON_VALUE(@p, '$.title'), ''), title), description = CASE WHEN JSON_VALUE(@p, '$.has_description') = 'true' THEN NULLIF(JSON_VALUE(@p, '$.description'), '') ELSE description END, status = COALESCE(NULLIF(JSON_VALUE(@p, '$.status'), ''), status), qualification_status = COALESCE(NULLIF(JSON_VALUE(@p, '$.qualification_status'), ''), qualification_status), account_id = CASE WHEN JSON_VALUE(@p, '$.has_account_id') = 'true' THEN TRY_CONVERT(int, NULLIF(JSON_VALUE(@p, '$.account_id'), '')) ELSE account_id END, contact_id = CASE WHEN JSON_VALUE(@p, '$.has_contact_id') = 'true' THEN TRY_CONVERT(int, NULLIF(JSON_VALUE(@p, '$.contact_id'), '')) ELSE contact_id END, responsible_user_id = CASE WHEN JSON_VALUE(@p, '$.has_assigned_to') = 'true' THEN NULLIF(JSON_VALUE(@p, '$.assigned_to'), '') ELSE responsible_user_id END, estimated_value = CASE WHEN JSON_VALUE(@p, '$.has_estimated_value') = 'true' THEN TRY_CONVERT(decimal(18,2), NULLIF(JSON_VALUE(@p, '$.estimated_value'), '')) ELSE estimated_value END, expected_close_date = CASE WHEN JSON_VALUE(@p, '$.has_expected_close_date') = 'true' THEN TRY_CONVERT(date, NULLIF(JSON_VALUE(@p, '$.expected_close_date'), '')) ELSE expected_close_date END, lost_reason = CASE WHEN JSON_VALUE(@p, '$.has_lost_reason') = 'true' THEN NULLIF(JSON_VALUE(@p, '$.lost_reason'), '') ELSE lost_reason END, notes = CASE WHEN JSON_VALUE(@p, '$.has_notes') = 'true' THEN NULLIF(JSON_VALUE(@p, '$.notes'), '') ELSE notes END, updated_at = SYSUTCDATETIME(), updated_by = JSON_VALUE(@p, '$.actor') WHERE id = TRY_CONVERT(int, JSON_VALUE(@p, '$.id')) AND cancelled_at IS NULL; ${leadSelect("l.id = TRY_CONVERT(int, JSON_VALUE(@p, '$.id')) AND l.cancelled_at IS NULL")} FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;`, { ...marked, id, actor })
}

function cancelLead(id, reason, actor) {
  return mssqlObject(`UPDATE crm.leads SET cancelled_at = SYSUTCDATETIME(), cancelled_by = JSON_VALUE(@p, '$.actor'), cancelled_reason = JSON_VALUE(@p, '$.reason'), updated_at = SYSUTCDATETIME(), updated_by = JSON_VALUE(@p, '$.actor') WHERE id = TRY_CONVERT(int, JSON_VALUE(@p, '$.id')) AND cancelled_at IS NULL; SELECT @@ROWCOUNT AS cancelled FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;`, { id, reason, actor })
}

function createAccount(payload, actor) {
  return mssqlObject(`INSERT INTO crm.accounts (name, lifecycle_status, tax_id, email, phone, website, address, city, country_code, industry, owner_user_id, accounting_third_party_id, notes, created_by) VALUES (JSON_VALUE(@p, '$.name'), COALESCE(NULLIF(JSON_VALUE(@p, '$.lifecycle_status'), ''), N'prospect'), NULLIF(JSON_VALUE(@p, '$.tax_id'), ''), NULLIF(JSON_VALUE(@p, '$.email'), ''), NULLIF(JSON_VALUE(@p, '$.phone'), ''), NULLIF(JSON_VALUE(@p, '$.website'), ''), NULLIF(JSON_VALUE(@p, '$.address'), ''), NULLIF(JSON_VALUE(@p, '$.city'), ''), NULLIF(JSON_VALUE(@p, '$.country_code'), ''), NULLIF(JSON_VALUE(@p, '$.industry'), ''), NULLIF(JSON_VALUE(@p, '$.owner_user_id'), ''), TRY_CONVERT(int, NULLIF(JSON_VALUE(@p, '$.accounting_third_party_id'), '')), NULLIF(JSON_VALUE(@p, '$.notes'), ''), JSON_VALUE(@p, '$.actor')); SELECT TOP 1 id, CONVERT(nvarchar(36), uuid) AS uuid, name, lifecycle_status AS type, lifecycle_status AS status, email, phone, created_at FROM crm.accounts WHERE id = SCOPE_IDENTITY() FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;`, { ...payload, actor })
}

function updateAccount(id, payload, actor) {
  const marked = markPayload(payload)
  return mssqlObject(`UPDATE crm.accounts SET name = COALESCE(NULLIF(JSON_VALUE(@p, '$.name'), ''), name), lifecycle_status = COALESCE(NULLIF(JSON_VALUE(@p, '$.lifecycle_status'), ''), lifecycle_status), tax_id = CASE WHEN JSON_VALUE(@p, '$.has_tax_id')='true' THEN NULLIF(JSON_VALUE(@p, '$.tax_id'),'') ELSE tax_id END, email = CASE WHEN JSON_VALUE(@p, '$.has_email')='true' THEN NULLIF(JSON_VALUE(@p, '$.email'),'') ELSE email END, phone = CASE WHEN JSON_VALUE(@p, '$.has_phone')='true' THEN NULLIF(JSON_VALUE(@p, '$.phone'),'') ELSE phone END, website = CASE WHEN JSON_VALUE(@p, '$.has_website')='true' THEN NULLIF(JSON_VALUE(@p, '$.website'),'') ELSE website END, address = CASE WHEN JSON_VALUE(@p, '$.has_address')='true' THEN NULLIF(JSON_VALUE(@p, '$.address'),'') ELSE address END, city = CASE WHEN JSON_VALUE(@p, '$.has_city')='true' THEN NULLIF(JSON_VALUE(@p, '$.city'),'') ELSE city END, country_code = CASE WHEN JSON_VALUE(@p, '$.has_country_code')='true' THEN NULLIF(JSON_VALUE(@p, '$.country_code'),'') ELSE country_code END, industry = CASE WHEN JSON_VALUE(@p, '$.has_industry')='true' THEN NULLIF(JSON_VALUE(@p, '$.industry'),'') ELSE industry END, owner_user_id = CASE WHEN JSON_VALUE(@p, '$.has_owner_user_id')='true' THEN NULLIF(JSON_VALUE(@p, '$.owner_user_id'),'') ELSE owner_user_id END, accounting_third_party_id = CASE WHEN JSON_VALUE(@p, '$.has_accounting_third_party_id')='true' THEN TRY_CONVERT(int, NULLIF(JSON_VALUE(@p, '$.accounting_third_party_id'),'')) ELSE accounting_third_party_id END, notes = CASE WHEN JSON_VALUE(@p, '$.has_notes')='true' THEN NULLIF(JSON_VALUE(@p, '$.notes'),'') ELSE notes END, updated_at=SYSUTCDATETIME(), updated_by=JSON_VALUE(@p, '$.actor') WHERE id=TRY_CONVERT(int, JSON_VALUE(@p, '$.id')) AND cancelled_at IS NULL; SELECT TOP 1 id, CONVERT(nvarchar(36), uuid) AS uuid, name, lifecycle_status AS type, lifecycle_status AS status, tax_id, email, phone, website, address, city, country_code, industry, owner_user_id, accounting_third_party_id, notes, updated_at FROM crm.accounts WHERE id=TRY_CONVERT(int, JSON_VALUE(@p, '$.id')) AND cancelled_at IS NULL FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;`, { ...marked, id, actor })
}

function createContact(payload, actor) {
  return mssqlObject(`INSERT INTO crm.contacts (account_id, first_name, last_name, display_name, job_title, email, phone, mobile, is_primary, notes, status, created_by) VALUES (TRY_CONVERT(int, NULLIF(JSON_VALUE(@p, '$.account_id'), '')), NULLIF(JSON_VALUE(@p, '$.first_name'), ''), NULLIF(JSON_VALUE(@p, '$.last_name'), ''), JSON_VALUE(@p, '$.display_name'), NULLIF(JSON_VALUE(@p, '$.job_title'), ''), NULLIF(JSON_VALUE(@p, '$.email'), ''), NULLIF(JSON_VALUE(@p, '$.phone'), ''), NULLIF(JSON_VALUE(@p, '$.mobile'), ''), CASE WHEN JSON_VALUE(@p, '$.is_primary')='true' THEN 1 ELSE 0 END, NULLIF(JSON_VALUE(@p, '$.notes'), ''), COALESCE(NULLIF(JSON_VALUE(@p, '$.status'), ''), N'active'), JSON_VALUE(@p, '$.actor')); SELECT TOP 1 id, CONVERT(nvarchar(36), uuid) AS uuid, account_id, display_name, email, phone, mobile, status, created_at FROM crm.contacts WHERE id=SCOPE_IDENTITY() FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;`, { ...payload, actor })
}

function updateContact(id, payload, actor) {
  const marked = markPayload(payload)
  return mssqlObject(`UPDATE crm.contacts SET account_id=CASE WHEN JSON_VALUE(@p,'$.has_account_id')='true' THEN TRY_CONVERT(int,NULLIF(JSON_VALUE(@p,'$.account_id'),'')) ELSE account_id END, first_name=CASE WHEN JSON_VALUE(@p,'$.has_first_name')='true' THEN NULLIF(JSON_VALUE(@p,'$.first_name'),'') ELSE first_name END, last_name=CASE WHEN JSON_VALUE(@p,'$.has_last_name')='true' THEN NULLIF(JSON_VALUE(@p,'$.last_name'),'') ELSE last_name END, display_name=COALESCE(NULLIF(JSON_VALUE(@p,'$.display_name'),''),display_name), job_title=CASE WHEN JSON_VALUE(@p,'$.has_job_title')='true' THEN NULLIF(JSON_VALUE(@p,'$.job_title'),'') ELSE job_title END, email=CASE WHEN JSON_VALUE(@p,'$.has_email')='true' THEN NULLIF(JSON_VALUE(@p,'$.email'),'') ELSE email END, phone=CASE WHEN JSON_VALUE(@p,'$.has_phone')='true' THEN NULLIF(JSON_VALUE(@p,'$.phone'),'') ELSE phone END, mobile=CASE WHEN JSON_VALUE(@p,'$.has_mobile')='true' THEN NULLIF(JSON_VALUE(@p,'$.mobile'),'') ELSE mobile END, is_primary=CASE WHEN JSON_VALUE(@p,'$.has_is_primary')='true' AND JSON_VALUE(@p,'$.is_primary')='true' THEN 1 WHEN JSON_VALUE(@p,'$.has_is_primary')='true' THEN 0 ELSE is_primary END, notes=CASE WHEN JSON_VALUE(@p,'$.has_notes')='true' THEN NULLIF(JSON_VALUE(@p,'$.notes'),'') ELSE notes END, status=CASE WHEN JSON_VALUE(@p,'$.has_status')='true' THEN JSON_VALUE(@p,'$.status') ELSE status END, updated_at=SYSUTCDATETIME(), updated_by=JSON_VALUE(@p,'$.actor') WHERE id=TRY_CONVERT(int,JSON_VALUE(@p,'$.id')) AND cancelled_at IS NULL; SELECT TOP 1 id, CONVERT(nvarchar(36), uuid) AS uuid, account_id, display_name, email, phone, mobile, status, updated_at FROM crm.contacts WHERE id=TRY_CONVERT(int,JSON_VALUE(@p,'$.id')) AND cancelled_at IS NULL FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;`, { ...marked, id, actor })
}

function listActivities(filters = {}) {
  return mssqlArray(`SELECT id, CONVERT(nvarchar(36), uuid) AS uuid, lead_id, account_id, contact_id, activity_type, occurred_at, user_id, subject, notes, outcome, task_reference, email_reference, document_reference, created_at, created_by FROM crm.activities WHERE cancelled_at IS NULL AND (NULLIF(JSON_VALUE(@p,'$.lead_id'),'') IS NULL OR lead_id=TRY_CONVERT(int,JSON_VALUE(@p,'$.lead_id'))) AND (NULLIF(JSON_VALUE(@p,'$.account_id'),'') IS NULL OR account_id=TRY_CONVERT(int,JSON_VALUE(@p,'$.account_id'))) ORDER BY occurred_at DESC, id DESC FOR JSON PATH;`, filters)
}

function createActivity(payload, actor) {
  return mssqlObject(`INSERT INTO crm.activities (activity_type, occurred_at, lead_id, account_id, contact_id, user_id, subject, notes, outcome, task_reference, email_reference, document_reference, created_by) VALUES (JSON_VALUE(@p,'$.activity_type'), TRY_CONVERT(datetime2,JSON_VALUE(@p,'$.occurred_at')), TRY_CONVERT(int,NULLIF(JSON_VALUE(@p,'$.lead_id'),'')), TRY_CONVERT(int,NULLIF(JSON_VALUE(@p,'$.account_id'),'')), TRY_CONVERT(int,NULLIF(JSON_VALUE(@p,'$.contact_id'),'')), JSON_VALUE(@p,'$.actor'), JSON_VALUE(@p,'$.subject'), NULLIF(JSON_VALUE(@p,'$.notes'),''), NULLIF(JSON_VALUE(@p,'$.outcome'),''), NULLIF(JSON_VALUE(@p,'$.task_reference'),''), NULLIF(JSON_VALUE(@p,'$.email_reference'),''), NULLIF(JSON_VALUE(@p,'$.document_reference'),''), JSON_VALUE(@p,'$.actor')); SELECT TOP 1 id, CONVERT(nvarchar(36), uuid) AS uuid, lead_id, account_id, contact_id, activity_type, occurred_at, user_id, subject, notes, outcome, task_reference, created_at FROM crm.activities WHERE id=SCOPE_IDENTITY() FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;`, { ...payload, actor })
}

function convertLead(id, conversion, actor) {
  return mssqlObject(`SET XACT_ABORT ON; BEGIN TRANSACTION;
DECLARE @leadId int=TRY_CONVERT(int,JSON_VALUE(@p,'$.id'));
DECLARE @existingAccount int=(SELECT account_id FROM crm.leads WHERE id=@leadId AND cancelled_at IS NULL);
IF @existingAccount IS NULL BEGIN INSERT INTO crm.accounts (name,lifecycle_status,email,phone,owner_user_id,notes,created_by) VALUES (COALESCE(NULLIF(JSON_VALUE(@p,'$.account.name'),''),(SELECT title FROM crm.leads WHERE id=@leadId)),N'prospect',NULLIF(JSON_VALUE(@p,'$.account.email'),''),NULLIF(JSON_VALUE(@p,'$.account.phone'),''),NULLIF(JSON_VALUE(@p,'$.actor'),''),NULLIF(JSON_VALUE(@p,'$.account.notes'),''),JSON_VALUE(@p,'$.actor')); SET @existingAccount=SCOPE_IDENTITY(); END;
DECLARE @existingContact int=(SELECT contact_id FROM crm.leads WHERE id=@leadId AND cancelled_at IS NULL);
IF @existingContact IS NULL AND NULLIF(JSON_VALUE(@p,'$.contact.display_name'),'') IS NOT NULL BEGIN INSERT INTO crm.contacts (account_id,first_name,last_name,display_name,email,phone,mobile,status,created_by) VALUES (@existingAccount,NULLIF(JSON_VALUE(@p,'$.contact.first_name'),''),NULLIF(JSON_VALUE(@p,'$.contact.last_name'),''),JSON_VALUE(@p,'$.contact.display_name'),NULLIF(JSON_VALUE(@p,'$.contact.email'),''),NULLIF(JSON_VALUE(@p,'$.contact.phone'),''),NULLIF(JSON_VALUE(@p,'$.contact.mobile'),''),N'active',JSON_VALUE(@p,'$.actor')); SET @existingContact=SCOPE_IDENTITY(); END;
UPDATE crm.leads SET account_id=@existingAccount,contact_id=@existingContact,status=COALESCE(NULLIF(JSON_VALUE(@p,'$.status'),''),N'qualified'),qualification_status=N'qualified',updated_at=SYSUTCDATETIME(),updated_by=JSON_VALUE(@p,'$.actor') WHERE id=@leadId AND cancelled_at IS NULL;
DECLARE @result nvarchar(max)=(SELECT l.id,CONVERT(nvarchar(36),l.uuid) AS uuid,l.status,l.qualification_status,l.account_id,l.contact_id,a.name AS account_name,c.display_name AS contact_name FROM crm.leads l LEFT JOIN crm.accounts a ON a.id=l.account_id LEFT JOIN crm.contacts c ON c.id=l.contact_id WHERE l.id=@leadId FOR JSON PATH,WITHOUT_ARRAY_WRAPPER); COMMIT TRANSACTION; SELECT @result;`, { id, ...conversion, actor })
}

function markPayload(payload) {
  const marked = { ...payload }
  Object.keys(payload).forEach(key => { marked[`has_${key}`] = true })
  return marked
}

module.exports = { listLeads, getLead, findAccount, findContact, listAccounts, getAccount, listContacts, createLead, updateLead, cancelLead, createAccount, updateAccount, createContact, updateContact, listActivities, createActivity, convertLead }
