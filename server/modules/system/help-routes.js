const { Router } = require('express')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const multer = require('multer')
const AdmZip = require('adm-zip')
const { requireAuth } = require('../../core/auth')
const { addAudit } = require('../../core/audit')
const { writeDb } = require('../../core/db')

const HELP_STORAGE = path.join(__dirname, '../../../storage/help')
const MAX_ARTICLES = 120
const MAX_IMAGE_BYTES = 3 * 1024 * 1024
const MAX_IMPORT_BYTES = 25 * 1024 * 1024

const defaultArticles = [
  ['Producție / Operațiuni', 'Înregistrează un consum operațional', 'Înregistrează consumul după ce ai verificat rețeta, lucrarea și cantitatea.', ['Deschide Producție / Operațiuni.', 'Alege tabul Consumuri.', 'Apasă „Adaugă consum nou”, completează datele și salvează.']],
  ['Producție / Operațiuni', 'Creează o rețetă nouă', 'Păstrează rețeta ca bază pentru planificare și consum.', ['Deschide tabul Rețete.', 'Apasă „Adaugă nou”.', 'Completează componentele și salvează.']],
  ['Stocuri', 'Înregistrează o intrare de stoc', 'Folosește mișcarea de intrare pentru materialele recepționate sau corectate.', ['Intră în Stocuri.', 'Alege „Mișcări stoc” și tipul „Intrare”.', 'Completează materialul, cantitatea și motivul, apoi salvează.']],
  ['Stocuri', 'Transferă materiale către un departament', 'Transferul păstrează evidența între stocul central și cel departamental.', ['Intră în Stocuri, tabul Transferuri.', 'Alege materialul, cantitatea și departamentul destinatar.', 'Salvează transferul.']],
  ['Parc & resurse', 'Adaugă o resursă nouă', 'Înregistrează un vehicul, utilaj sau altă resursă înainte de folosire.', ['Deschide Parc & Resurse.', 'Apasă „Resursă nouă”.', 'Completează datele tehnice și salvează.']],
  ['Parc & resurse', 'Completează raportul zilnic', 'Raportul zilnic păstrează orele, kilometrii și consumul asociat resursei.', ['Intră în Raport zilnic.', 'Alege resursa și data.', 'Completează indicatorii și combustibilul, dacă se aplică.']],
  ['HR', 'Adaugă un angajat', 'Creează dosarul de angajat înainte de contract, pontaj sau concedii.', ['Intră în HR, tabul Angajați.', 'Apasă „Angajat nou”.', 'Completează datele obligatorii și salvează.']],
  ['HR', 'Completează pontajul', 'Pontajul se completează pentru luna și departamentul selectate.', ['Intră în HR, tabul Pontaj.', 'Alege luna și departamentul.', 'Completează zilele și finalizează pontajul.']],
  ['Documente', 'Lansează un document în circuit', 'Un document trebuie păstrat ca draft până când este pregătit pentru aprobare.', ['Intră în Documente.', 'Creează sau deschide documentul draft.', 'Apasă „Lansează în circuit”.']],
  ['Documente', 'Aprobă sau respinge un document', 'Acțiunea se face din Inboxul Documente, cu comentariu când este necesar.', ['Deschide Inbox.', 'Alege documentul.', 'Apasă „Aprobă” sau „Respinge”.']],
  ['CRM / Vânzări', 'Creează o ofertă', 'Oferta pornește dintr-un lead sau dintr-un prospect și se păstrează ca draft până la aprobare.', ['Intră în CRM / Vânzări, secțiunea Oferte.', 'Apasă „Ofertă nouă”.', 'Selectează clientul, adaugă pozițiile și salvează draftul.']],
  ['Logistică & transport', 'Pregătește o cursă pentru livrare', 'Cursa poate fi legată de comanda client, contract și documentele de transport.', ['Intră în Logistică & transport.', 'Creează sau deschide cursa.', 'Verifică stocul, documentele și confirmă pregătirea manuală.']],
  ['Mesaje', 'Trimite un mesaj în canal', 'Canalele păstrează comunicarea pe echipă sau temă.', ['Intră în Mesaje.', 'Alege canalul.', 'Scrie mesajul și apasă „Trimite”.']],
  ['Solicitări & incidente', 'Creează o sesizare', 'Alege prioritatea corectă pentru ca solicitarea să ajungă în fluxul potrivit.', ['Intră în Solicitări & incidente.', 'Apasă „Sesizare nouă”.', 'Completează tipul, prioritatea, titlul și descrierea.']],
  ['Setări', 'Adaugă un utilizator', 'Doar administratorii gestionează conturile și rolurile.', ['Intră în Setări, tabul Utilizatori.', 'Apasă „Utilizator nou”.', 'Completează datele, rolul și departamentul, apoi salvează.']],
  ['Setări', 'Activează sau dezactivează module', 'Schimbarea modulelor nu elimină automat datele istorice.', ['Intră în Setări, Administrare module.', 'Alege categoria și modulele necesare.', 'Apasă „Salvează module”.']],
].map(([category, title, summary, steps], index) => ({
  id: `help-default-${index + 1}`,
  category,
  title,
  summary,
  steps,
  active: true,
  sort_order: (index + 1) * 10,
  image_id: '',
  image_caption: '',
  system_default: true,
}))

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES },
})

const helpImport = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMPORT_BYTES },
})

function isSuperadmin(user) {
  return user?.role === 'superadmin' || (Array.isArray(user?.roles) && user.roles.includes('superadmin'))
}

function text(value, max = 500) {
  return String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, max)
}

function normalizeSteps(value) {
  const values = Array.isArray(value) ? value : String(value || '').split('\n')
  return values.map(item => text(item, 500)).filter(Boolean).slice(0, 20)
}

function normalizeArticle(input = {}, previous = {}) {
  return {
    id: previous.id || `help-${crypto.randomUUID()}`,
    category: text(input.category ?? previous.category, 100),
    title: text(input.title ?? previous.title, 180),
    summary: text(input.summary ?? previous.summary, 1000),
    steps: normalizeSteps(input.steps ?? previous.steps),
    active: input.active === undefined ? previous.active !== false : input.active !== false,
    sort_order: Number.isFinite(Number(input.sort_order)) ? Math.max(0, Math.round(Number(input.sort_order))) : Number(previous.sort_order || 0),
    image_id: text(input.image_id ?? previous.image_id, 100),
    image_caption: text(input.image_caption ?? previous.image_caption, 500),
    system_default: previous.system_default === true,
    updated_at: new Date().toISOString(),
  }
}

function ensureHelpCenter(db) {
  db.settings = db.settings || {}
  const existing = db.settings.help_center && typeof db.settings.help_center === 'object' ? db.settings.help_center : {}
  const articles = Array.isArray(existing.articles) && existing.articles.length ? existing.articles : defaultArticles
  const assets = Array.isArray(existing.assets) ? existing.assets : []
  return { ...existing, articles, assets }
}

function publicArticle(article) {
  return {
    id: article.id,
    category: article.category,
    title: article.title,
    summary: article.summary,
    steps: Array.isArray(article.steps) ? article.steps : [],
    active: article.active !== false,
    sort_order: Number(article.sort_order || 0),
    image_id: article.image_id || '',
    image_caption: article.image_caption || '',
    updated_at: article.updated_at || '',
  }
}

function publicHelpCenter(db) {
  const helpCenter = ensureHelpCenter(db)
  const articles = helpCenter.articles
    .map(publicArticle)
    .filter(article => article.title && article.category)
    .sort((left, right) => left.category.localeCompare(right.category, 'ro') || left.sort_order - right.sort_order || left.title.localeCompare(right.title, 'ro'))
  return { articles, updated_at: helpCenter.updated_at || '' }
}

function assertArticle(article, throwHttp) {
  if (!article.category) throwHttp(400, 'Categoria articolului este obligatorie.')
  if (!article.title) throwHttp(400, 'Titlul articolului este obligatoriu.')
  if (!article.steps.length && !article.summary) throwHttp(400, 'Adaugă un rezumat sau cel puțin un pas.')
}

function safeAssetExtension(file) {
  const type = String(file.mimetype || '').toLowerCase()
  if (type === 'image/png') return '.png'
  if (type === 'image/jpeg') return '.jpg'
  if (type === 'image/webp') return '.webp'
  return ''
}

function hasValidImageSignature(file) {
  const source = file?.buffer || Buffer.alloc(0)
  if (source.length < 12) return false
  if (source[0] === 0x89 && source[1] === 0x50 && source[2] === 0x4e && source[3] === 0x47) return true
  if (source[0] === 0xff && source[1] === 0xd8 && source[2] === 0xff) return true
  return source.subarray(0, 4).toString('ascii') === 'RIFF' && source.subarray(8, 12).toString('ascii') === 'WEBP'
}

function imageMimeType(extension) {
  return ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' })[String(extension || '').toLowerCase()] || ''
}

function archiveImageExtension(name) {
  const extension = path.extname(String(name || '')).toLowerCase()
  return ['.png', '.jpg', '.webp'].includes(extension) ? extension : ''
}

function packageHelpLibrary(db) {
  const helpCenter = ensureHelpCenter(db)
  const zip = new AdmZip()
  const assets = []
  helpCenter.assets.forEach(asset => {
    const storageName = String(asset.storage_name || '')
    const extension = archiveImageExtension(storageName)
    const diskPath = path.resolve(HELP_STORAGE, storageName)
    if (!extension || !diskPath.startsWith(HELP_STORAGE + path.sep) || !fs.existsSync(diskPath)) return
    const archiveName = `images/${asset.id}${extension}`
    zip.addFile(archiveName, fs.readFileSync(diskPath))
    assets.push({ id: asset.id, archive_name: archiveName, mime_type: imageMimeType(extension) })
  })
  const attachedImageIds = new Set(assets.map(asset => asset.id))
  const articles = helpCenter.articles.map(article => ({
    ...publicArticle(article),
    image_id: attachedImageIds.has(article.image_id) ? article.image_id : '',
  }))
  zip.addFile('help-library.json', Buffer.from(JSON.stringify({
    format: 'infraflow-help-library-v1',
    exported_at: new Date().toISOString(),
    articles,
    assets,
  }, null, 2), 'utf8'))
  return zip.toBuffer()
}

function importHelpLibrary(buffer, throwHttp) {
  let zip
  try { zip = new AdmZip(buffer) } catch { throwHttp(400, 'Pachetul Ajutor nu este o arhivă ZIP validă.') }
  const entries = zip.getEntries()
  const uncompressedBytes = entries.reduce((total, entry) => total + Math.max(0, Number(entry.header?.size || 0)), 0)
  if (entries.length > MAX_ARTICLES + 10 || uncompressedBytes > MAX_IMPORT_BYTES + MAX_IMAGE_BYTES) throwHttp(400, 'Pachetul Ajutor depășește limitele admise.')
  const manifestEntry = zip.getEntry('help-library.json')
  if (!manifestEntry) throwHttp(400, 'Pachetul Ajutor nu conține fișierul de configurare.')
  let manifest
  try { manifest = JSON.parse(zip.readAsText(manifestEntry, 'utf8')) } catch { throwHttp(400, 'Fișierul de configurare Ajutor este invalid.') }
  if (manifest?.format !== 'infraflow-help-library-v1') throwHttp(400, 'Pachetul nu provine din exportul Ajutor InfraFlow.')
  if (!Array.isArray(manifest.articles) || manifest.articles.length > MAX_ARTICLES) throwHttp(400, 'Pachetul conține un număr invalid de articole.')
  const exportedAssets = Array.isArray(manifest.assets) ? manifest.assets : []
  const assetsById = new Map()
  const fileWrites = []
  exportedAssets.forEach(asset => {
    const sourceId = text(asset?.id, 100)
    const archiveName = String(asset?.archive_name || '')
    const extension = archiveImageExtension(archiveName)
    if (!sourceId || assetsById.has(sourceId) || !extension || !/^images\/[-a-z0-9]+\.(png|jpg|webp)$/i.test(archiveName)) throwHttp(400, 'Pachetul conține o referință de imagine invalidă.')
    const entry = zip.getEntry(archiveName)
    const bytes = entry ? zip.readFile(entry) : null
    if (!bytes || bytes.length > MAX_IMAGE_BYTES || !hasValidImageSignature({ buffer: bytes })) throwHttp(400, 'Pachetul conține o imagine invalidă sau prea mare.')
    const id = `help-image-${crypto.randomUUID()}`
    const storageName = `${id}${extension}`
    assetsById.set(sourceId, { id, storage_name: storageName, mime_type: imageMimeType(extension), size: bytes.length })
    fileWrites.push({ storageName, bytes })
  })
  const seenIds = new Set()
  const articles = manifest.articles.map((source, index) => {
    const article = normalizeArticle({
      ...source,
      image_id: assetsById.get(text(source?.image_id, 100))?.id || '',
      sort_order: source?.sort_order ?? (index + 1) * 10,
    }, { id: `help-${crypto.randomUUID()}` })
    assertArticle(article, throwHttp)
    const duplicateKey = `${article.category}\u0000${article.title}`.toLocaleLowerCase('ro-RO')
    if (seenIds.has(duplicateKey)) throwHttp(400, 'Pachetul conține articole duplicate.')
    seenIds.add(duplicateKey)
    return article
  })
  return { articles, assets: Array.from(assetsById.values()), fileWrites }
}

function createHelpRouter(context) {
  const { readJsonBody, sendJson, throwHttp } = context
  const router = Router()

  router.get('/help', (req, res) => {
    const auth = requireAuth(req, res)
    if (!auth) return
    sendJson(res, 200, { help: publicHelpCenter(auth.db), can_manage: isSuperadmin(auth.user) })
  })

  router.post('/help/articles', async (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!isSuperadmin(auth.user)) throwHttp(403, 'Doar superadminul poate modifica Ajutorul.')
      const body = await readJsonBody(req)
      const helpCenter = ensureHelpCenter(auth.db)
      if (helpCenter.articles.length >= MAX_ARTICLES) throwHttp(400, `Ajutorul poate conține cel mult ${MAX_ARTICLES} articole.`)
      const article = normalizeArticle(body, { sort_order: helpCenter.articles.length * 10 + 10 })
      assertArticle(article, throwHttp)
      if (article.image_id && !helpCenter.assets.some(asset => asset.id === article.image_id)) throwHttp(400, 'Imaginea selectată nu există.')
      helpCenter.articles.push(article)
      helpCenter.updated_at = new Date().toISOString()
      helpCenter.updated_by = auth.user.id
      auth.db.settings.help_center = helpCenter
      addAudit(auth.db, auth.user, 'ajutor_articol_creat', `${article.category}: ${article.title}`)
      writeDb(auth.db)
      sendJson(res, 201, { article: publicArticle(article), help: publicHelpCenter(auth.db) })
    } catch (error) {
      next(error)
    }
  })

  router.patch('/help/articles/:id', async (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!isSuperadmin(auth.user)) throwHttp(403, 'Doar superadminul poate modifica Ajutorul.')
      const body = await readJsonBody(req)
      const helpCenter = ensureHelpCenter(auth.db)
      const index = helpCenter.articles.findIndex(article => article.id === req.params.id)
      if (index < 0) throwHttp(404, 'Articolul de ajutor nu a fost găsit.')
      const article = normalizeArticle(body, helpCenter.articles[index])
      assertArticle(article, throwHttp)
      if (article.image_id && !helpCenter.assets.some(asset => asset.id === article.image_id)) throwHttp(400, 'Imaginea selectată nu există.')
      helpCenter.articles[index] = article
      helpCenter.updated_at = new Date().toISOString()
      helpCenter.updated_by = auth.user.id
      auth.db.settings.help_center = helpCenter
      addAudit(auth.db, auth.user, 'ajutor_articol_actualizat', `${article.category}: ${article.title}`)
      writeDb(auth.db)
      sendJson(res, 200, { article: publicArticle(article), help: publicHelpCenter(auth.db) })
    } catch (error) {
      next(error)
    }
  })

  router.delete('/help/articles/:id', async (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!isSuperadmin(auth.user)) throwHttp(403, 'Doar superadminul poate modifica Ajutorul.')
      const helpCenter = ensureHelpCenter(auth.db)
      const article = helpCenter.articles.find(item => item.id === req.params.id)
      if (!article) throwHttp(404, 'Articolul de ajutor nu a fost găsit.')
      helpCenter.articles = helpCenter.articles.filter(item => item.id !== article.id)
      helpCenter.updated_at = new Date().toISOString()
      helpCenter.updated_by = auth.user.id
      auth.db.settings.help_center = helpCenter
      addAudit(auth.db, auth.user, 'ajutor_articol_sters', `${article.category}: ${article.title}`)
      writeDb(auth.db)
      sendJson(res, 200, { ok: true, help: publicHelpCenter(auth.db) })
    } catch (error) {
      next(error)
    }
  })

  router.post('/help/images', imageUpload.single('image'), async (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!isSuperadmin(auth.user)) throwHttp(403, 'Doar superadminul poate încărca imagini în Ajutor.')
      if (!req.file) throwHttp(400, 'Selectează o imagine PNG, JPG sau WEBP.')
      const extension = safeAssetExtension(req.file)
      if (!extension || !hasValidImageSignature(req.file)) throwHttp(400, 'Imaginea trebuie să fie PNG, JPG sau WEBP validă.')
      fs.mkdirSync(HELP_STORAGE, { recursive: true })
      const id = `help-image-${crypto.randomUUID()}`
      const storageName = `${id}${extension}`
      fs.writeFileSync(path.join(HELP_STORAGE, storageName), req.file.buffer, { mode: 0o600 })
      const helpCenter = ensureHelpCenter(auth.db)
      const asset = {
        id,
        storage_name: storageName,
        mime_type: req.file.mimetype,
        size: req.file.size,
        uploaded_at: new Date().toISOString(),
        uploaded_by: auth.user.id,
      }
      helpCenter.assets.push(asset)
      helpCenter.updated_at = new Date().toISOString()
      helpCenter.updated_by = auth.user.id
      auth.db.settings.help_center = helpCenter
      addAudit(auth.db, auth.user, 'ajutor_imagine_incarcata', storageName)
      writeDb(auth.db)
      sendJson(res, 201, { image: { id: asset.id, mime_type: asset.mime_type, size: asset.size } })
    } catch (error) {
      next(error)
    }
  })

  router.get('/help/export', (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!isSuperadmin(auth.user)) throwHttp(403, 'Doar superadminul poate exporta Ajutorul.')
      const packageBuffer = packageHelpLibrary(auth.db)
      addAudit(auth.db, auth.user, 'ajutor_exportat', 'Bibliotecă Ajutor exportată')
      writeDb(auth.db)
      res.set('Cache-Control', 'no-store')
      res.attachment('infraflow-ajutor.zip').send(packageBuffer)
    } catch (error) {
      next(error)
    }
  })

  router.post('/help/import', helpImport.single('help_package'), async (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!isSuperadmin(auth.user)) throwHttp(403, 'Doar superadminul poate importa Ajutorul.')
      if (!req.file) throwHttp(400, 'Selectează arhiva ZIP exportată din Ajutor.')
      if (String(req.body?.replace || '') !== 'true') throwHttp(400, 'Confirmarea de înlocuire a bibliotecii este obligatorie.')
      const imported = importHelpLibrary(req.file.buffer, throwHttp)
      fs.mkdirSync(HELP_STORAGE, { recursive: true })
      imported.fileWrites.forEach(file => fs.writeFileSync(path.join(HELP_STORAGE, file.storageName), file.bytes, { mode: 0o600 }))
      const helpCenter = ensureHelpCenter(auth.db)
      helpCenter.articles = imported.articles
      helpCenter.assets = imported.assets.map(asset => ({ ...asset, uploaded_at: new Date().toISOString(), uploaded_by: auth.user.id }))
      helpCenter.updated_at = new Date().toISOString()
      helpCenter.updated_by = auth.user.id
      auth.db.settings.help_center = helpCenter
      addAudit(auth.db, auth.user, 'ajutor_importat', `${imported.articles.length} articole importate`)
      writeDb(auth.db)
      sendJson(res, 200, { ok: true, help: publicHelpCenter(auth.db) })
    } catch (error) {
      next(error)
    }
  })

  router.get('/help/images/:id', (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      const helpCenter = ensureHelpCenter(auth.db)
      const asset = helpCenter.assets.find(item => item.id === req.params.id)
      if (!asset || !/^[a-z0-9-]+\.(png|jpg|webp)$/i.test(String(asset.storage_name || ''))) throwHttp(404, 'Imaginea de ajutor nu a fost găsită.')
      const diskPath = path.resolve(HELP_STORAGE, asset.storage_name)
      if (!diskPath.startsWith(HELP_STORAGE + path.sep) || !fs.existsSync(diskPath)) throwHttp(404, 'Imaginea de ajutor nu mai este disponibilă.')
      res.set('Cache-Control', 'private, max-age=300')
      res.type(asset.mime_type || 'application/octet-stream').sendFile(diskPath)
    } catch (error) {
      next(error)
    }
  })

  return router
}

module.exports = { createHelpRouter, defaultArticles, normalizeArticle }
