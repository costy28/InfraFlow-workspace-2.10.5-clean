const { runMssqlScalar } = require('../../core/db')

function json(sql, params = {}) {
  const value = runMssqlScalar(`DECLARE @p nvarchar(max)=@json;\n${sql}`, { jsonInput: JSON.stringify(params), timeoutMs: 60000 })
  return String(value || '').trim() ? JSON.parse(value) : null
}
function array(sql, params) { const value = json(sql, params); return Array.isArray(value) ? value : [] }
function one(sql, params) { const value = json(sql, params); return Array.isArray(value) ? value[0] || null : value }

const orderFields = `o.id,CONVERT(nvarchar(36),o.uuid) uuid,o.order_number,o.status,o.source_quote_id,o.source_quote_revision,o.source_decision_id,o.account_id,o.contact_id,o.currency,o.subtotal,o.tax_total,o.grand_total AS total,o.responsible_user_id,o.created_at,o.created_by,o.updated_at,o.updated_by,a.name account_name,a.accounting_third_party_id,c.display_name contact_name,q.quote_number,q.revision AS quote_revision`
function select(where) { return `SELECT ${orderFields} FROM crm.customer_orders o LEFT JOIN crm.accounts a ON a.id=o.account_id LEFT JOIN crm.contacts c ON c.id=o.contact_id LEFT JOIN crm.quotes q ON q.id=o.source_quote_id WHERE ${where}` }
function orderDetail(where) { return `SELECT ${orderFields},JSON_QUERY((SELECT id,line_no AS position,source_quote_line_id,item_code,description,unit,quantity,unit_price,tax_rate,line_total,line_snapshot FROM crm.customer_order_lines WHERE customer_order_id=o.id AND cancelled_at IS NULL ORDER BY line_no FOR JSON PATH)) lines FROM crm.customer_orders o LEFT JOIN crm.accounts a ON a.id=o.account_id LEFT JOIN crm.contacts c ON c.id=o.contact_id LEFT JOIN crm.quotes q ON q.id=o.source_quote_id WHERE ${where}` }

function getOrder(id) { return one(`${orderDetail("o.id=TRY_CONVERT(int,JSON_VALUE(@p,'$.id')) AND o.cancelled_at IS NULL")} FOR JSON PATH,WITHOUT_ARRAY_WRAPPER`, { id }) }
function getOrderForQuote(quoteId) { return one(`${orderDetail("o.source_quote_id=TRY_CONVERT(int,JSON_VALUE(@p,'$.quoteId')) AND o.cancelled_at IS NULL")} FOR JSON PATH,WITHOUT_ARRAY_WRAPPER`, { quoteId }) }
function listOrders(filters = {}) {
  return array(`${select("o.cancelled_at IS NULL AND (NULLIF(JSON_VALUE(@p,'$.source_quote_id'),'') IS NULL OR o.source_quote_id=TRY_CONVERT(int,JSON_VALUE(@p,'$.source_quote_id'))) AND (NULLIF(JSON_VALUE(@p,'$.status'),'') IS NULL OR o.status=JSON_VALUE(@p,'$.status'))")} ORDER BY o.created_at DESC FOR JSON PATH`, filters)
}

function createFromAcceptedQuote(quoteId, actor) {
  return one(`
SET XACT_ABORT ON;
BEGIN TRANSACTION;
DECLARE @quoteId int=TRY_CONVERT(int,JSON_VALUE(@p,'$.quoteId'));
DECLARE @quoteStatus nvarchar(40), @revision int, @existing int;
SELECT @quoteStatus=status,@revision=revision FROM crm.quotes WITH (UPDLOCK,HOLDLOCK) WHERE id=@quoteId AND cancelled_at IS NULL;
IF @quoteStatus IS NULL THROW 51020,'Oferta nu există sau este anulată.',1;
IF @quoteStatus<>N'accepted' THROW 51021,'Comanda client poate fi creată numai dintr-o ofertă acceptată.',1;
SELECT @existing=id FROM crm.customer_orders WITH (UPDLOCK,HOLDLOCK) WHERE source_quote_id=@quoteId AND cancelled_at IS NULL;
IF @existing IS NOT NULL
BEGIN
  COMMIT TRANSACTION;
  SELECT ${orderFields},CAST(1 AS bit) AS already_created FROM crm.customer_orders o LEFT JOIN crm.accounts a ON a.id=o.account_id LEFT JOIN crm.contacts c ON c.id=o.contact_id LEFT JOIN crm.quotes q ON q.id=o.source_quote_id WHERE o.id=@existing FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;
  RETURN;
END;
DECLARE @year nvarchar(4)=CONVERT(nvarchar(4),YEAR(GETDATE()));
DECLARE @next int=(SELECT COUNT(*)+1 FROM crm.customer_orders WITH (UPDLOCK,HOLDLOCK) WHERE YEAR(created_at)=YEAR(GETDATE()));
DECLARE @number nvarchar(80)=CONCAT(N'CO-',@year,N'-',RIGHT(CONCAT(N'0000',@next),4));
DECLARE @decisionId int=(SELECT TOP 1 id FROM crm.quote_decisions WHERE quote_id=@quoteId AND quote_revision=@revision AND decision=N'accepted' AND cancelled_at IS NULL ORDER BY decided_at DESC,id DESC);
IF @decisionId IS NULL THROW 51022,'Decizia de acceptare a ofertei nu a fost găsită.',1;
INSERT INTO crm.customer_orders(order_number,status,source_quote_id,source_quote_revision,source_decision_id,account_id,contact_id,currency,subtotal,tax_total,grand_total,source_snapshot,responsible_user_id,created_by)
SELECT @number,N'confirmed',q.id,q.revision,@decisionId,q.account_id,q.contact_id,q.currency,q.subtotal,q.tax_total,q.grand_total,(SELECT q.quote_number,q.revision,q.status,q.title,q.issue_date,q.valid_until,q.payment_terms,q.delivery_terms,q.notes_client,q.subtotal,q.discount_total,q.tax_total,q.grand_total FOR JSON PATH,WITHOUT_ARRAY_WRAPPER),q.responsible_user_id,JSON_VALUE(@p,'$.actor')
FROM crm.quotes q WHERE q.id=@quoteId;
DECLARE @orderId int=SCOPE_IDENTITY();
INSERT INTO crm.customer_order_lines(customer_order_id,source_quote_line_id,line_no,item_code,description,unit,quantity,unit_price,tax_rate,line_total,line_snapshot,created_by)
SELECT @orderId,l.id,l.line_no,l.item_reference,l.description,l.unit,l.quantity,l.unit_price,l.tax_rate,l.line_total,(SELECT l.item_type,l.item_reference,l.description,l.quantity,l.unit,l.unit_price,l.discount_percent,l.tax_rate,l.line_subtotal,l.line_discount,l.line_tax,l.line_total,l.notes FOR JSON PATH,WITHOUT_ARRAY_WRAPPER),JSON_VALUE(@p,'$.actor')
FROM crm.quote_lines l WHERE l.quote_id=@quoteId AND l.cancelled_at IS NULL ORDER BY l.line_no;
COMMIT TRANSACTION;
SELECT ${orderFields},CAST(0 AS bit) AS already_created FROM crm.customer_orders o LEFT JOIN crm.accounts a ON a.id=o.account_id LEFT JOIN crm.contacts c ON c.id=o.contact_id LEFT JOIN crm.quotes q ON q.id=o.source_quote_id WHERE o.id=@orderId FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;
`, { quoteId, actor })
}

function cancelOrder(id, reason, actor) {
  return one(`UPDATE crm.customer_orders SET status=N'cancelled',cancelled_at=SYSUTCDATETIME(),cancelled_by=JSON_VALUE(@p,'$.actor'),cancelled_reason=JSON_VALUE(@p,'$.reason'),updated_at=SYSUTCDATETIME(),updated_by=JSON_VALUE(@p,'$.actor') WHERE id=TRY_CONVERT(int,JSON_VALUE(@p,'$.id')) AND cancelled_at IS NULL; SELECT @@ROWCOUNT AS changed FOR JSON PATH,WITHOUT_ARRAY_WRAPPER`, { id, reason, actor })
}

module.exports = { getOrder, getOrderForQuote, listOrders, createFromAcceptedQuote, cancelOrder }
