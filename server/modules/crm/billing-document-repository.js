const { runMssqlScalar } = require('../../core/db')

function json(sql, params = {}) {
  const value = runMssqlScalar(`DECLARE @p nvarchar(max)=@json;\n${sql}`, { jsonInput: JSON.stringify(params), timeoutMs: 60000 })
  return String(value || '').trim() ? JSON.parse(value) : null
}

function one(sql, params) {
  const value = json(sql, params)
  return Array.isArray(value) ? value[0] || null : value
}

function parseSnapshot(value) {
  try { return value ? JSON.parse(value) : null } catch { return null }
}

function hydrate(row) {
  if (!row) return null
  return { ...row, request: parseSnapshot(row.request_snapshot), response: parseSnapshot(row.response_snapshot) }
}

const fields = 'id,CONVERT(nvarchar(36),uuid) uuid,customer_order_id,document_kind,provider_key,provider_document_id,idempotency_key,status,request_snapshot,response_snapshot,created_at,created_by,updated_at,updated_by'

function createOrGet({ orderId, documentKind, providerKey = 'infraflow_internal', idempotencyKey, request, actor }) {
  const row = one(`
SET XACT_ABORT ON;
BEGIN TRANSACTION;
DECLARE @existing int=(SELECT id FROM crm.billing_documents WITH(UPDLOCK,HOLDLOCK) WHERE idempotency_key=JSON_VALUE(@p,'$.idempotencyKey') AND cancelled_at IS NULL);
IF @existing IS NOT NULL
BEGIN
  COMMIT TRANSACTION;
  SELECT ${fields},CAST(1 AS bit) AS already_created FROM crm.billing_documents WHERE id=@existing FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;
  RETURN;
END;
INSERT INTO crm.billing_documents(customer_order_id,document_kind,provider_key,idempotency_key,status,request_snapshot,created_by)
SELECT TRY_CONVERT(int,JSON_VALUE(@p,'$.orderId')),JSON_VALUE(@p,'$.documentKind'),JSON_VALUE(@p,'$.providerKey'),JSON_VALUE(@p,'$.idempotencyKey'),N'pending',payload.request_snapshot,JSON_VALUE(@p,'$.actor')
FROM OPENJSON(@p) WITH(request_snapshot nvarchar(max) '$.request_snapshot') payload;
DECLARE @id int=SCOPE_IDENTITY();
COMMIT TRANSACTION;
SELECT ${fields},CAST(0 AS bit) AS already_created FROM crm.billing_documents WHERE id=@id FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;
`, { orderId, documentKind, providerKey, idempotencyKey, request_snapshot: JSON.stringify(request), actor })
  return hydrate(row)
}

function completeInternal(id, { providerDocumentId, status, response, actor }) {
  return hydrate(one(`
UPDATE document
SET provider_document_id=JSON_VALUE(@p,'$.providerDocumentId'),status=JSON_VALUE(@p,'$.status'),response_snapshot=payload.response_snapshot,updated_at=SYSUTCDATETIME(),updated_by=JSON_VALUE(@p,'$.actor')
FROM crm.billing_documents document
CROSS APPLY OPENJSON(@p) WITH(response_snapshot nvarchar(max) '$.response_snapshot') payload
WHERE document.id=TRY_CONVERT(int,JSON_VALUE(@p,'$.id')) AND document.cancelled_at IS NULL;
SELECT ${fields} FROM crm.billing_documents WHERE id=TRY_CONVERT(int,JSON_VALUE(@p,'$.id')) FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;
`, { id, providerDocumentId, status, response_snapshot: JSON.stringify(response), actor }))
}

function listForOrder(orderId) {
  const value = json(`SELECT ${fields} FROM crm.billing_documents WHERE customer_order_id=TRY_CONVERT(int,JSON_VALUE(@p,'$.orderId')) AND cancelled_at IS NULL ORDER BY created_at DESC FOR JSON PATH`, { orderId })
  return (Array.isArray(value) ? value : []).map(hydrate)
}

module.exports = { createOrGet, completeInternal, listForOrder }
