const { Router } = require('express')
const crypto = require('crypto')
const { requireAuth } = require('../../core/auth')
const { requirePermission } = require('../../core/permissions')
const { readDb, writeDb, runMssqlScalar, DB_MODE, MSSQL_RELATIONAL_MODE } = require('../../core/db')
const { addAudit } = require('../../core/audit')

const router = Router()
function isMssqlMode(){return MSSQL_RELATIONAL_MODE && (DB_MODE==='mssql'||DB_MODE==='sqlserver')}
function sendJson(res,status,data){res.status(status).json(data)}
function nowIso(){return new Date().toISOString()}
function nextId(items){return items.reduce((m,i)=>Math.max(m,Number(i.id||0)),0)+1}
function mssqlJson(sql,params={}){const r=runMssqlScalar(`DECLARE @p nvarchar(max) = @json;\n${sql}`,{jsonInput:JSON.stringify(params)});return String(r||'').trim()?JSON.parse(r):null}
function mssqlArray(sql,params={}){return mssqlJson(sql,params)||[]}
function mssqlObject(sql,params={}){return mssqlArray(sql,params)[0]||null}
function ensureDb(db){db.archive=db.archive||{}; for(const k of ['documents','requests']) db.archive[k]=Array.isArray(db.archive[k])?db.archive[k]:[]; return db.archive}
function addYears(date, years){const d=new Date(date); d.setFullYear(d.getFullYear()+Number(years||0)); return d.toISOString().slice(0,10)}

router.get('/archive/documents',(req,res,next)=>{try{
  const auth=requireAuth(req,res); if(!auth)return; if(!requirePermission(auth,res,'archive:view'))return
  if(isMssqlMode())return sendJson(res,200,mssqlArray(`SELECT * FROM archive.documents WHERE (NULLIF(JSON_VALUE(@p,'$.tip'),'') IS NULL OR tip=JSON_VALUE(@p,'$.tip')) AND (NULLIF(JSON_VALUE(@p,'$.an'),'') IS NULL OR an=TRY_CONVERT(int,JSON_VALUE(@p,'$.an'))) AND (NULLIF(JSON_VALUE(@p,'$.dept_id'),'') IS NULL OR dept_id=JSON_VALUE(@p,'$.dept_id')) AND (NULLIF(JSON_VALUE(@p,'$.q'),'') IS NULL OR COALESCE(denumire,titlu) LIKE N'%'+JSON_VALUE(@p,'$.q')+N'%') ORDER BY created_at DESC FOR JSON PATH;`,req.query))
  let rows=ensureDb(readDb()).documents
  if(req.query.tip)rows=rows.filter(x=>x.tip===req.query.tip); if(req.query.an)rows=rows.filter(x=>String(x.an)===String(req.query.an)); if(req.query.dept_id)rows=rows.filter(x=>String(x.dept_id)===String(req.query.dept_id)); if(req.query.q)rows=rows.filter(x=>String(x.denumire||x.titlu||'').toLowerCase().includes(String(req.query.q).toLowerCase()))
  sendJson(res,200,rows)
}catch(e){next(e)}})

router.post('/archive/documents',(req,res,next)=>{try{
  const auth=requireAuth(req,res); if(!auth)return; if(!requirePermission(auth,res,'archive:manage'))return
  const db=readDb(); const year=new Date().getFullYear()
  if(isMssqlMode()){
    const item=mssqlObject(`DECLARE @nr int=(SELECT COUNT(*)+1 FROM archive.documents WHERE ISNULL(an,YEAR(created_at))=YEAR(GETDATE())); DECLARE @created datetime2=sysdatetime(); INSERT INTO archive.documents (uuid,nr_inventar,nr_document,titlu,denumire,tip,an,dept_id,emitent,destinatar,data_document,termen_pastrare_ani,termen_pastrare,data_casare,status,observatii,created_at) VALUES (JSON_VALUE(@p,'$.uuid'),COALESCE(NULLIF(JSON_VALUE(@p,'$.nr_inventar'),''),CONCAT(N'INV-',YEAR(GETDATE()),N'-',@nr)),NULLIF(JSON_VALUE(@p,'$.nr_document'),''),COALESCE(NULLIF(JSON_VALUE(@p,'$.titlu'),''),JSON_VALUE(@p,'$.denumire')),NULLIF(JSON_VALUE(@p,'$.denumire'),''),NULLIF(JSON_VALUE(@p,'$.tip'),''),COALESCE(TRY_CONVERT(int,JSON_VALUE(@p,'$.an')),YEAR(GETDATE())),NULLIF(JSON_VALUE(@p,'$.dept_id'),''),NULLIF(JSON_VALUE(@p,'$.emitent'),''),NULLIF(JSON_VALUE(@p,'$.destinatar'),''),TRY_CONVERT(date,NULLIF(JSON_VALUE(@p,'$.data_document'),'')),TRY_CONVERT(int,NULLIF(JSON_VALUE(@p,'$.termen_pastrare'),'')),TRY_CONVERT(int,NULLIF(JSON_VALUE(@p,'$.termen_pastrare'),'')),CASE WHEN NULLIF(JSON_VALUE(@p,'$.termen_pastrare'),'') IS NULL THEN NULL ELSE DATEADD(year,TRY_CONVERT(int,JSON_VALUE(@p,'$.termen_pastrare')),@created) END,N'disponibil',NULLIF(JSON_VALUE(@p,'$.observatii'),''),@created); SELECT TOP 1 * FROM archive.documents WHERE id=SCOPE_IDENTITY() FOR JSON PATH;`,{...req.body,uuid:crypto.randomUUID()})
    addAudit(db,auth.user,'archive_document_created',item?.nr_inventar); writeDb(db); return sendJson(res,201,item)
  }
  const ar=ensureDb(db); const nr=ar.documents.filter(x=>String(x.created_at||'').startsWith(String(year))).length+1; const created=nowIso(); const item={id:nextId(ar.documents),uuid:crypto.randomUUID(),...req.body,nr_inventar:req.body.nr_inventar||`INV-${year}-${nr}`,an:req.body.an||year,status:'disponibil',disponibil:true,created_at:created,data_casare:req.body.termen_pastrare?addYears(created,req.body.termen_pastrare):null}; ar.documents.push(item); addAudit(db,auth.user,'archive_document_created',item.nr_inventar); writeDb(db); sendJson(res,201,item)
}catch(e){next(e)}})

router.get('/archive/documents/search',(req,res,next)=>{try{
  const auth=requireAuth(req,res); if(!auth)return; if(!requirePermission(auth,res,'archive:view'))return
  const q=String(req.query.q||''); if(q.length<3)return sendJson(res,400,{error:'Cautarea necesita minimum 3 caractere.'})
  if(isMssqlMode())return sendJson(res,200,mssqlArray(`SELECT * FROM archive.documents WHERE COALESCE(denumire,titlu,N'') LIKE N'%'+JSON_VALUE(@p,'$.q')+N'%' OR ISNULL(emitent,N'') LIKE N'%'+JSON_VALUE(@p,'$.q')+N'%' OR ISNULL(destinatar,N'') LIKE N'%'+JSON_VALUE(@p,'$.q')+N'%' OR ISNULL(observatii,N'') LIKE N'%'+JSON_VALUE(@p,'$.q')+N'%' ORDER BY created_at DESC FOR JSON PATH;`,{q}))
  sendJson(res,200,ensureDb(readDb()).documents.filter(x=>['denumire','titlu','emitent','destinatar','observatii'].some(k=>String(x[k]||'').toLowerCase().includes(q.toLowerCase()))))
}catch(e){next(e)}})

router.get('/archive/requests',(req,res,next)=>{try{
  const auth=requireAuth(req,res); if(!auth)return; if(!requirePermission(auth,res,'archive:view'))return
  if(isMssqlMode())return sendJson(res,200,mssqlArray(`SELECT ar.*, COALESCE(ad.denumire, ad.titlu, ad.nr_inventar) AS document_denumire FROM archive.requests ar LEFT JOIN archive.documents ad ON ad.id=ar.document_id ORDER BY ar.created_at DESC FOR JSON PATH;`))
  const db=readDb(); const ar=ensureDb(db)
  sendJson(res,200,ar.requests.map(x=>({...x,document_denumire:(ar.documents.find(d=>String(d.id)===String(x.document_id))||{}).denumire})))
}catch(e){next(e)}})

router.post('/archive/requests',(req,res,next)=>{try{
  const auth=requireAuth(req,res); if(!auth)return; if(!requirePermission(auth,res,'archive:request'))return
  const db=readDb()
  if(isMssqlMode()){
    const busy=mssqlObject(`SELECT TOP 1 id FROM archive.requests WHERE document_id=TRY_CONVERT(int,JSON_VALUE(@p,'$.document_id')) AND status IN (N'solicitata',N'imprumutata') FOR JSON PATH;`,req.body); if(busy)return sendJson(res,409,{error:'Documentul este deja împrumutat sau solicitat.'})
    const item=mssqlObject(`INSERT INTO archive.requests (uuid,document_id,scop,status,solicitat_de,data_returnare_planificata) VALUES (JSON_VALUE(@p,'$.uuid'),TRY_CONVERT(int,JSON_VALUE(@p,'$.document_id')),NULLIF(JSON_VALUE(@p,'$.scop'),''),N'solicitata',JSON_VALUE(@p,'$.user_id'),TRY_CONVERT(date,NULLIF(JSON_VALUE(@p,'$.data_returnare_planificata'),''))); UPDATE archive.documents SET disponibil=0,status=N'imprumutat' WHERE id=TRY_CONVERT(int,JSON_VALUE(@p,'$.document_id')); SELECT TOP 1 * FROM archive.requests WHERE id=SCOPE_IDENTITY() FOR JSON PATH;`,{...req.body,uuid:crypto.randomUUID(),user_id:auth.user.id})
    addAudit(db,auth.user,'archive_request_created',item?.uuid); writeDb(db); return sendJson(res,201,item)
  }
  const ar=ensureDb(db); if(ar.requests.some(x=>String(x.document_id)===String(req.body.document_id)&&['solicitata','imprumutata'].includes(x.status)))return sendJson(res,409,{error:'Documentul este deja împrumutat sau solicitat.'})
  const item={id:nextId(ar.requests),uuid:crypto.randomUUID(),...req.body,status:'solicitata',solicitat_de:auth.user.id,created_at:nowIso()}; ar.requests.push(item); const doc=ar.documents.find(x=>String(x.id)===String(req.body.document_id)); if(doc){doc.disponibil=false;doc.status='imprumutat'} addAudit(db,auth.user,'archive_request_created',item.uuid); writeDb(db); sendJson(res,201,item)
}catch(e){next(e)}})

router.post('/archive/requests/:uuid/return',(req,res,next)=>{try{
  const auth=requireAuth(req,res); if(!auth)return; if(!requirePermission(auth,res,'archive:manage'))return
  const db=readDb()
  if(isMssqlMode()){const item=mssqlObject(`UPDATE archive.requests SET status=N'returnata', data_returnare_efectiva=sysdatetime() WHERE uuid=JSON_VALUE(@p,'$.uuid'); UPDATE d SET disponibil=1,status=N'disponibil' FROM archive.documents d JOIN archive.requests r ON r.document_id=d.id WHERE r.uuid=JSON_VALUE(@p,'$.uuid'); SELECT TOP 1 * FROM archive.requests WHERE uuid=JSON_VALUE(@p,'$.uuid') FOR JSON PATH;`,req.params); addAudit(db,auth.user,'archive_request_returned',req.params.uuid); writeDb(db); return sendJson(res,200,item)}
  const ar=ensureDb(db); const item=ar.requests.find(x=>x.uuid===req.params.uuid); if(!item)return sendJson(res,404,{error:'Solicitarea nu a fost găsită.'}); item.status='returnata'; item.data_returnare_efectiva=nowIso(); const doc=ar.documents.find(x=>String(x.id)===String(item.document_id)); if(doc){doc.disponibil=true;doc.status='disponibil'} addAudit(db,auth.user,'archive_request_returned',item.uuid); writeDb(db); sendJson(res,200,item)
}catch(e){next(e)}})

router.get('/archive/overdue',(req,res,next)=>{try{const auth=requireAuth(req,res); if(!auth)return; if(!requirePermission(auth,res,'archive:view'))return; if(isMssqlMode())return sendJson(res,200,mssqlArray(`SELECT * FROM archive.requests WHERE data_returnare_planificata < GETDATE() AND status=N'imprumutata' ORDER BY data_returnare_planificata ASC FOR JSON PATH;`)); const today=new Date().toISOString().slice(0,10); sendJson(res,200,ensureDb(readDb()).requests.filter(x=>x.data_returnare_planificata<today&&x.status==='imprumutata'))}catch(e){next(e)}})
router.get('/archive/casare',(req,res,next)=>{try{const auth=requireAuth(req,res); if(!auth)return; if(!requirePermission(auth,res,'archive:view'))return; if(isMssqlMode())return sendJson(res,200,mssqlArray(`SELECT * FROM archive.documents WHERE data_casare < GETDATE() AND data_casare IS NOT NULL ORDER BY data_casare ASC FOR JSON PATH;`)); const today=new Date().toISOString().slice(0,10); sendJson(res,200,ensureDb(readDb()).documents.filter(x=>x.data_casare&&x.data_casare<today))}catch(e){next(e)}})

module.exports = router
