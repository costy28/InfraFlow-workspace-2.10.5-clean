const { Router } = require('express')
const crypto = require('crypto')
const { requireAuth } = require('../../core/auth')
const { requirePermission } = require('../../core/permissions')
const { readDb, writeDb, runMssqlScalar, DB_MODE, MSSQL_RELATIONAL_MODE } = require('../../core/db')
const { addAudit } = require('../../core/audit')

const router = Router()
function isMssqlMode() { return MSSQL_RELATIONAL_MODE && (DB_MODE === 'mssql' || DB_MODE === 'sqlserver') }
function sendJson(res, status, data) { res.status(status).json(data) }
function nowIso() { return new Date().toISOString() }
function nextId(items) { return items.reduce((max, item) => Math.max(max, Number(item.id || 0)), 0) + 1 }
function daysUntil(date) { return date ? Math.ceil((new Date(date).getTime() - Date.now()) / 86400000) : null }
function mssqlJson(sql, params = {}) { const r = runMssqlScalar(`DECLARE @p nvarchar(max) = @json;\n${sql}`, { jsonInput: JSON.stringify(params) }); return String(r || '').trim() ? JSON.parse(r) : null }
function mssqlArray(sql, params = {}) { return mssqlJson(sql, params) || [] }
function mssqlObject(sql, params = {}) { return mssqlArray(sql, params)[0] || null }
function ensureDb(db) {
  db.legal = db.legal || {}
  for (const key of ['contracts', 'litigation', 'litigationHearings', 'opinions']) db.legal[key] = Array.isArray(db.legal[key]) ? db.legal[key] : []
  db.documents = db.documents || {}; db.documents.documents = Array.isArray(db.documents.documents) ? db.documents.documents : []
  return db.legal
}
function contractView(item) { return { ...item, zile_pana_expirare: daysUntil(item.data_sfarsit) } }

router.get('/legal/contracts', (req, res, next) => {
  try {
    const auth = requireAuth(req, res); if (!auth) return
    if (!requirePermission(auth, res, 'legal:view')) return
    if (isMssqlMode()) return sendJson(res, 200, mssqlArray(`SELECT *, DATEDIFF(day, GETDATE(), data_sfarsit) AS zile_pana_expirare FROM legal.contracts WHERE (NULLIF(JSON_VALUE(@p,'$.status'),'') IS NULL OR status=JSON_VALUE(@p,'$.status')) AND (NULLIF(JSON_VALUE(@p,'$.tip'),'') IS NULL OR tip=JSON_VALUE(@p,'$.tip')) AND (NULLIF(JSON_VALUE(@p,'$.responsabil_id'),'') IS NULL OR responsabil_id=JSON_VALUE(@p,'$.responsabil_id')) ORDER BY data_sfarsit ASC FOR JSON PATH;`, req.query))
    let rows = ensureDb(readDb()).contracts
    if (req.query.status) rows = rows.filter(x => x.status === req.query.status)
    if (req.query.tip) rows = rows.filter(x => x.tip === req.query.tip)
    if (req.query.responsabil_id) rows = rows.filter(x => String(x.responsabil_id) === String(req.query.responsabil_id))
    sendJson(res, 200, rows.map(contractView))
  } catch (error) { next(error) }
})
router.post('/legal/contracts', (req, res, next) => {
  try {
    const auth = requireAuth(req, res); if (!auth) return
    if (!requirePermission(auth, res, 'legal:manage')) return
    const db = readDb(); const body = { ...req.body, uuid: crypto.randomUUID() }
    if (isMssqlMode()) {
      const item = mssqlObject(`INSERT INTO legal.contracts (uuid,nr_contract,partener,tip,data_semnare,data_start,data_sfarsit,valoare,status,responsabil_id) VALUES (JSON_VALUE(@p,'$.uuid'),JSON_VALUE(@p,'$.nr_contract'),JSON_VALUE(@p,'$.partener'),NULLIF(JSON_VALUE(@p,'$.tip'),''),TRY_CONVERT(date,NULLIF(JSON_VALUE(@p,'$.data_semnare'),'')),TRY_CONVERT(date,NULLIF(JSON_VALUE(@p,'$.data_start'),'')),TRY_CONVERT(date,NULLIF(JSON_VALUE(@p,'$.data_sfarsit'),'')),TRY_CONVERT(decimal(15,2),NULLIF(JSON_VALUE(@p,'$.valoare'),'')),COALESCE(NULLIF(JSON_VALUE(@p,'$.status'),''),N'draft'),NULLIF(JSON_VALUE(@p,'$.responsabil_id'),'')); SELECT TOP 1 * FROM legal.contracts WHERE id=SCOPE_IDENTITY() FOR JSON PATH;`, body)
      addAudit(db, auth.user, 'legal_contract_created', item?.nr_contract); writeDb(db); return sendJson(res, 201, item)
    }
    const legal = ensureDb(db); const item = { id: nextId(legal.contracts), ...body, created_at: nowIso(), updated_at: null }; legal.contracts.push(item); addAudit(db, auth.user, 'legal_contract_created', item.nr_contract); writeDb(db); sendJson(res, 201, item)
  } catch (error) { next(error) }
})
router.get('/legal/contracts/expiring', (req, res, next) => {
  try { const auth = requireAuth(req, res); if (!auth) return; if (!requirePermission(auth, res, 'legal:view')) return; if (isMssqlMode()) return sendJson(res, 200, mssqlArray(`SELECT *, DATEDIFF(day, GETDATE(), data_sfarsit) AS zile_pana_expirare FROM legal.contracts WHERE DATEDIFF(day, GETDATE(), data_sfarsit) <= 30 AND status IN (N'semnat',N'in_executie') ORDER BY data_sfarsit ASC FOR JSON PATH;`)); sendJson(res, 200, ensureDb(readDb()).contracts.map(contractView).filter(x => x.zile_pana_expirare <= 30 && ['semnat', 'in_executie'].includes(x.status))) } catch (error) { next(error) }
})

router.get('/legal/litigation', (req, res, next) => {
  try { const auth = requireAuth(req, res); if (!auth) return; if (!requirePermission(auth, res, 'legal:view')) return; if (isMssqlMode()) return sendJson(res, 200, mssqlArray(`SELECT * FROM legal.litigation ORDER BY termen_urmator ASC FOR JSON PATH;`)); sendJson(res, 200, ensureDb(readDb()).litigation) } catch (error) { next(error) }
})
router.post('/legal/litigation', (req, res, next) => {
  try {
    const auth = requireAuth(req, res); if (!auth) return; if (!requirePermission(auth, res, 'legal:manage')) return
    const db = readDb(); const body = { ...req.body, uuid: crypto.randomUUID() }
    if (isMssqlMode()) { const item = mssqlObject(`INSERT INTO legal.litigation (uuid,nr_dosar,instanta,obiect,parte_adversa,status,responsabil_id,termen_urmator,observatii) VALUES (JSON_VALUE(@p,'$.uuid'),JSON_VALUE(@p,'$.nr_dosar'),NULLIF(JSON_VALUE(@p,'$.instanta'),''),NULLIF(JSON_VALUE(@p,'$.obiect'),''),NULLIF(JSON_VALUE(@p,'$.parte_adversa'),''),COALESCE(NULLIF(JSON_VALUE(@p,'$.status'),''),N'activ'),NULLIF(JSON_VALUE(@p,'$.responsabil_id'),''),TRY_CONVERT(date,NULLIF(JSON_VALUE(@p,'$.termen_urmator'),'')),NULLIF(JSON_VALUE(@p,'$.observatii'),'')); SELECT TOP 1 * FROM legal.litigation WHERE id=SCOPE_IDENTITY() FOR JSON PATH;`, body); addAudit(db, auth.user, 'legal_litigation_created', item?.nr_dosar); writeDb(db); return sendJson(res, 201, item) }
    const legal = ensureDb(db); const item = { id: nextId(legal.litigation), ...body, created_at: nowIso(), updated_at: null }; legal.litigation.push(item); addAudit(db, auth.user, 'legal_litigation_created', item.nr_dosar); writeDb(db); sendJson(res, 201, item)
  } catch (error) { next(error) }
})
router.post('/legal/litigation/:uuid/hearing', (req, res, next) => {
  try {
    const auth = requireAuth(req, res); if (!auth) return; if (!requirePermission(auth, res, 'legal:manage')) return
    const db = readDb()
    if (isMssqlMode()) {
      const item = mssqlObject(`DECLARE @id int; SELECT @id=id FROM legal.litigation WHERE uuid=JSON_VALUE(@p,'$.uuid'); INSERT INTO legal.litigation_hearings (litigation_id,data_termen,instanta,rezultat,termen_urmator) VALUES (@id,TRY_CONVERT(datetime2,JSON_VALUE(@p,'$.data_termen')),NULLIF(JSON_VALUE(@p,'$.instanta'),''),NULLIF(JSON_VALUE(@p,'$.rezultat'),''),TRY_CONVERT(date,NULLIF(JSON_VALUE(@p,'$.termen_urmator'),''))); IF NULLIF(JSON_VALUE(@p,'$.termen_urmator'),'') IS NOT NULL UPDATE legal.litigation SET termen_urmator=TRY_CONVERT(date,JSON_VALUE(@p,'$.termen_urmator')), updated_at=sysdatetime() WHERE id=@id; SELECT TOP 1 * FROM legal.litigation_hearings WHERE id=SCOPE_IDENTITY() FOR JSON PATH;`, { ...req.body, uuid: req.params.uuid })
      addAudit(db, auth.user, 'legal_hearing_created', req.params.uuid); writeDb(db); return sendJson(res, 201, item)
    }
    const legal = ensureDb(db); const litigation = legal.litigation.find(x => x.uuid === req.params.uuid); if (!litigation) return sendJson(res, 404, { error: 'Dosarul nu a fost găsit.' })
    const item = { id: nextId(legal.litigationHearings), litigation_id: litigation.id, ...req.body, created_at: nowIso() }; legal.litigationHearings.push(item); if (req.body.termen_urmator) litigation.termen_urmator = req.body.termen_urmator
    addAudit(db, auth.user, 'legal_hearing_created', req.params.uuid); writeDb(db); sendJson(res, 201, item)
  } catch (error) { next(error) }
})
router.get('/legal/calendar', (req, res, next) => {
  try { const auth = requireAuth(req, res); if (!auth) return; if (!requirePermission(auth, res, 'legal:view')) return; if (isMssqlMode()) return sendJson(res, 200, mssqlArray(`SELECT lh.*, l.nr_dosar, l.parte_adversa FROM legal.litigation_hearings lh JOIN legal.litigation l ON l.id=lh.litigation_id WHERE lh.data_termen BETWEEN GETDATE() AND DATEADD(day,30,GETDATE()) ORDER BY lh.data_termen ASC FOR JSON PATH;`)); const legal=ensureDb(readDb()); const now=new Date(); const max=new Date(now.getTime()+30*86400000); sendJson(res,200,legal.litigationHearings.filter(h=>new Date(h.data_termen)>=now&&new Date(h.data_termen)<=max).map(h=>({...h,...(legal.litigation.find(l=>l.id===h.litigation_id)||{})}))) } catch (error) { next(error) }
})

router.get('/legal/opinions', (req, res, next) => {
  try { const auth=requireAuth(req,res); if(!auth)return; if(!requirePermission(auth,res,'legal:view'))return; if(isMssqlMode())return sendJson(res,200,mssqlArray(`SELECT * FROM legal.opinions ORDER BY created_at DESC FOR JSON PATH;`)); sendJson(res,200,ensureDb(readDb()).opinions) } catch(error){ next(error) }
})
router.post('/legal/opinions', (req, res, next) => {
  try {
    const auth=requireAuth(req,res); if(!auth)return; if(!requirePermission(auth,res,'legal:manage'))return
    const db=readDb(); const uuid=crypto.randomUUID()
    if(isMssqlMode()) {
      const item=mssqlObject(`DECLARE @docId int=NULL; IF EXISTS (SELECT 1 FROM documents.document_types WHERE id=N'OPJUR') BEGIN INSERT INTO documents.documents (uuid,tip_id,nr_document,titlu,date_json,status,creat_de,dept_initiatoare) VALUES (CONVERT(char(36),NEWID()),N'OPJUR',CONCAT(N'OPJUR-',FORMAT(GETDATE(),'yyyyMMddHHmmss')),JSON_VALUE(@p,'$.titlu'),@p,N'draft',JSON_VALUE(@p,'$.user_id'),JSON_VALUE(@p,'$.dept_id')); SET @docId=SCOPE_IDENTITY(); END; INSERT INTO legal.opinions (uuid,titlu,continut,solicitant_id,document_id) VALUES (JSON_VALUE(@p,'$.uuid'),JSON_VALUE(@p,'$.titlu'),NULLIF(JSON_VALUE(@p,'$.continut'),''),JSON_VALUE(@p,'$.user_id'),@docId); SELECT TOP 1 * FROM legal.opinions WHERE id=SCOPE_IDENTITY() FOR JSON PATH;`, {...req.body, uuid, user_id:auth.user.id, dept_id:auth.user.departmentId||auth.user.department_id})
      addAudit(db,auth.user,'legal_opinion_created',item?.titlu); writeDb(db); return sendJson(res,201,item)
    }
    const legal=ensureDb(db); const doc={id:nextId(db.documents.documents),uuid:crypto.randomUUID(),tip_id:'OPJUR',nr_document:`OPJUR-${Date.now()}`,titlu:req.body.titlu,date_json:JSON.stringify(req.body),status:'draft',creat_de:auth.user.id,dept_initiatoare:auth.user.departmentId||auth.user.department_id,created_at:nowIso()}; db.documents.documents.push(doc)
    const item={id:nextId(legal.opinions),uuid,titlu:req.body.titlu,continut:req.body.continut||null,solicitant_id:auth.user.id,document_id:doc.id,created_at:nowIso()}; legal.opinions.push(item); addAudit(db,auth.user,'legal_opinion_created',item.titlu); writeDb(db); sendJson(res,201,item)
  } catch(error){ next(error) }
})

module.exports = router
