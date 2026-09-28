const { runMssqlScalar } = require('../../core/db')

function json(sql, params = {}) {
  const value = runMssqlScalar(`DECLARE @p nvarchar(max)=@json;\n${sql}`, { jsonInput: JSON.stringify(params), timeoutMs: 60000 })
  return String(value || '').trim() ? JSON.parse(value) : null
}

function hydrate(row) {
  if (!row) return null
  let result = null
  try { result = row.result_snapshot ? JSON.parse(row.result_snapshot) : null } catch { result = null }
  return { ...row, result }
}

function fields() {
  return 'id,CONVERT(nvarchar(36),uuid) uuid,customer_order_id,check_status,checked_at,requested_by,result_snapshot,created_at,created_by'
}

function recordCheck(orderId, result, actor) {
  // JSON_VALUE is limited to 4,000 characters. A stock check can contain many
  // order lines, so read its snapshot through OPENJSON as nvarchar(max).
  const row = json(`INSERT INTO crm.inventory_checks(customer_order_id,check_status,checked_at,requested_by,result_snapshot,created_by) SELECT TRY_CONVERT(int,JSON_VALUE(@p,'$.orderId')),JSON_VALUE(@p,'$.check_status'),SYSUTCDATETIME(),JSON_VALUE(@p,'$.actor'),payload.result_snapshot,JSON_VALUE(@p,'$.actor') FROM OPENJSON(@p) WITH(result_snapshot nvarchar(max) '$.result_snapshot') payload; SELECT ${fields()} FROM crm.inventory_checks WHERE id=SCOPE_IDENTITY() FOR JSON PATH,WITHOUT_ARRAY_WRAPPER`, { orderId, check_status: result.check_status, result_snapshot: JSON.stringify(result), actor })
  return hydrate(row)
}

function latestCheck(orderId) {
  return hydrate(json(`SELECT TOP 1 ${fields()} FROM crm.inventory_checks WHERE customer_order_id=TRY_CONVERT(int,JSON_VALUE(@p,'$.orderId')) AND cancelled_at IS NULL ORDER BY checked_at DESC,id DESC FOR JSON PATH,WITHOUT_ARRAY_WRAPPER`, { orderId }))
}

module.exports = { recordCheck, latestCheck }
