const { Router } = require('express')
const crypto = require('crypto')
const { requireAuth } = require('../../core/auth')
const { requirePermission } = require('../../core/permissions')
const { readDb, writeDb } = require('../../core/db')
const { addAudit } = require('../../core/audit')
const { requireAiEnabled } = require('./middleware')
const { isAiEnabled, getApiKey, encryptApiKey } = require('./key-manager')
const { detectEntitati, getRelevantSchema } = require('./schema-provider')
const {
  generateSQL, formatResponse, answerHelp,
  validateSQL, testConnection
} = require('./claude-client')

const router = Router()

router.use((req, res, next) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  req.auth = auth
  next()
})

function nowIso() {
  return new Date().toISOString()
}

function ensureAiDb(db) {
  db.ai = db.ai || {}
  db.ai.conversations = Array.isArray(db.ai.conversations) ? db.ai.conversations : []
  db.ai.messages = Array.isArray(db.ai.messages) ? db.ai.messages : []
  db.ai.queryCache = Array.isArray(db.ai.queryCache) ? db.ai.queryCache : []
  db.settings = db.settings || {}
  return db.ai
}

function nextId(items) {
  return items.reduce((max, item) => Math.max(max, Number(item.id || 0)), 0) + 1
}

function conversationTitle(message) {
  return String(message || '').trim().slice(0, 200) || 'Conversatie AI'
}

function getOrCreateConversation(ai, user, uuid, message) {
  let conversation = uuid
    ? ai.conversations.find(item => item.uuid === uuid && String(item.user_id) === String(user.id))
    : null
  if (!conversation) {
    conversation = {
      id: nextId(ai.conversations),
      uuid: uuid || crypto.randomUUID(),
      user_id: user.id,
      titlu: conversationTitle(message),
      created_at: nowIso(),
      updated_at: nowIso()
    }
    ai.conversations.push(conversation)
  }
  return conversation
}

function saveMessage(ai, conversationId, rol, continut, extra = {}) {
  const message = {
    id: nextId(ai.messages),
    conversation_id: conversationId,
    rol,
    continut,
    query_sql: extra.query_sql || null,
    date_json: extra.date_json || null,
    tokens_folositi: extra.tokens_folositi || null,
    durata_ms: extra.durata_ms || null,
    created_at: nowIso()
  }
  ai.messages.push(message)
  return message
}

// ── CHAT PRINCIPAL ──────────────────────────────────────

router.post('/ai/chat', requireAiEnabled, async (req, res) => {
  const auth = req.auth || requireAuth(req, res)
  if (!auth) return

  const { mesaj, conversatie_id } = req.body
  if (!mesaj?.trim()) {
    return res.status(400).json({ error: 'Mesajul este gol.' })
  }

  const start = Date.now()
  const apiKey = req.body?.api_key || req.body?.apiKey || getApiKey(auth.db)
  const settings = auth.db?.settings || {}

  // Rate limiting simplu
  // (în producție → verifică din ai.messages count azi)
  const limitZi = settings.ai_limit_per_user || 30
  void limitZi

  try {
    const entitati = detectEntitati(mesaj)
    const esteHelp = /^(cum|unde|ce este|cum se|cum pot|ajutor)/i.test(mesaj.trim())

    let raspuns, querySql = null, dateJson = null
    const userContext = {
      companyName: settings.companyName || 'Compania',
      rol: auth.user?.role || 'operator',
      model: settings.ai_model_default || 'claude-haiku-4-5'
    }

    if (esteHelp) {
      raspuns = await answerHelp(mesaj, apiKey)
    } else {
      const schema = getRelevantSchema(entitati, auth.user?.role)
      const { sql, explicatie } = await generateSQL(
        mesaj, schema, userContext, apiKey
      )
      void explicatie
      validateSQL(sql)
      querySql = sql

      // Execută query (read-only)
      const { runMssqlScalar } = require('../../core/db')
      const date = await runMssqlScalar(sql, {})
      dateJson = JSON.stringify(date)

      raspuns = await formatResponse(mesaj, date, userContext, apiKey)
    }

    // Salvează în DB
    const db = readDb()
    const ai = ensureAiDb(db)
    const conversation = getOrCreateConversation(ai, auth.user, conversatie_id, mesaj)
    const durataMs = Date.now() - start
    saveMessage(ai, conversation.id, 'user', mesaj)
    saveMessage(ai, conversation.id, 'assistant', raspuns, {
      query_sql: querySql,
      date_json: dateJson,
      durata_ms: durataMs
    })
    conversation.updated_at = nowIso()
    writeDb(db)
    const convUuid = conversation.uuid

    const sugestii = generateSugestii(entitati)

    res.json({
      raspuns,
      conversatie_id: convUuid,
      sugestii,
      durata_ms: durataMs
    })

  } catch (err) {
    console.error('AI error:', err.message)
    const mesajEroare = err.message.includes('interzisă')
      ? 'Întrebarea nu poate fi procesată din motive de securitate.'
      : 'Nu am putut procesa întrebarea. Încearcă să o reformulezi.'
    res.status(500).json({ error: mesajEroare })
  }
})

// ── CONVERSAȚII ─────────────────────────────────────────

router.get('/ai/conversations', requireAiEnabled, (req, res) => {
  const auth = req.auth || requireAuth(req, res)
  if (!auth) return
  const ai = ensureAiDb(auth.db)
  const conversations = ai.conversations
    .filter(item => String(item.user_id) === String(auth.user.id))
    .sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)))
    .slice(0, 20)
  res.json({ conversations })
})

router.get('/ai/conversations/:uuid', requireAiEnabled, (req, res) => {
  const auth = req.auth || requireAuth(req, res)
  if (!auth) return
  const ai = ensureAiDb(auth.db)
  const conversation = ai.conversations.find(item => item.uuid === req.params.uuid && String(item.user_id) === String(auth.user.id))
  if (!conversation) return res.status(404).json({ error: 'Conversatia nu a fost gasita.' })
  const messages = ai.messages.filter(item => String(item.conversation_id) === String(conversation.id))
  res.json({ conversation: { ...conversation, messages } })
})

router.delete('/ai/conversations/:uuid', requireAiEnabled, (req, res) => {
  const auth = req.auth || requireAuth(req, res)
  if (!auth) return
  const db = readDb()
  const ai = ensureAiDb(db)
  const conversation = ai.conversations.find(item => item.uuid === req.params.uuid && String(item.user_id) === String(auth.user.id))
  if (conversation) {
    ai.messages = ai.messages.filter(item => String(item.conversation_id) !== String(conversation.id))
    ai.conversations = ai.conversations.filter(item => item.id !== conversation.id)
    writeDb(db)
  }
  res.json({ ok: true })
})

// ── SUGESTII CONTEXTUALE ─────────────────────────────────

router.get('/ai/suggestions', requireAiEnabled, (req, res) => {
  const auth = req.auth || requireAuth(req, res)
  if (!auth) return
  const { pagina } = req.query
  const sugestiiMap = {
    inventory:    ['Care e stocul de bitum?', 'Materiale sub stoc minim'],
    production:   ['Câte tone s-au produs azi?', 'Consumuri luna aceasta'],
    fleet:        ['Utilaje disponibile azi', 'Utilaje cu ITP expirat'],
    hr:           ['Angajați prezenți azi', 'Cereri concediu în așteptare'],
    controlling:  ['Buget vs real luna aceasta', 'Centre de cost depășite'],
    snow_removal: ['Ultima intervenție', 'Total materiale sezon curent'],
    default:      ['Activitate șantiere azi', 'Documente de aprobat de mine',
                   'Sesizări deschise', 'Stoc materiale critice']
  }
  res.json({
    sugestii: sugestiiMap[pagina] || sugestiiMap.default
  })
})

// ── ADMIN — CONFIGURARE AI ───────────────────────────────

router.get('/admin/ai/status', (req, res) => {
  const auth = req.auth || requireAuth(req, res)
  if (!auth) return
  if (!requirePermission(auth, res, 'ai:admin')) return

  const settings = auth.db?.settings || {}
  res.json({
    enabled: !!settings.ai_enabled,
    model: settings.ai_model_default || 'claude-haiku-4-5',
    monthly_budget: settings.ai_monthly_budget || 200,
    limit_per_user: settings.ai_limit_per_user || 30,
    activated_at: settings.ai_activated_at || null,
    api_key_configured: !!settings.ai_api_key_encrypted
  })
})

router.post('/admin/ai/configure', async (req, res) => {
  const auth = req.auth || requireAuth(req, res)
  if (!auth) return
  if (!requirePermission(auth, res, 'ai:admin')) return

  const { api_key, model_default, monthly_budget, limit_per_user } = req.body

  if (!api_key?.startsWith('sk-ant-')) {
    return res.status(400).json({
      error: 'Cheia API invalidă. Trebuie să înceapă cu sk-ant-'
    })
  }

  // Test conexiune
  let test
  try {
    test = await testConnection(api_key)
    if (!test.ok) throw new Error('Test eșuat')
  } catch (err) {
    return res.status(400).json({
      error: 'Cheia API nu funcționează: ' + err.message
    })
  }

  // Criptează și salvează
  const db = await readDb()
  db.settings = db.settings || {}
  db.settings.ai_api_key_encrypted = encryptApiKey(api_key)
  db.settings.ai_model_default = model_default || 'claude-haiku-4-5'
  db.settings.ai_monthly_budget = monthly_budget || 200
  db.settings.ai_limit_per_user = limit_per_user || 30
  db.settings.ai_activated_by = auth.user.id
  db.settings.ai_activated_at = new Date().toISOString()
  await writeDb(db)

  addAudit(db, auth.user, 'ai_configured', 'Modul AI configurat')

  res.json({ ok: true, latenta_ms: test.latenta_ms })
})

router.post('/admin/ai/toggle', async (req, res) => {
  const auth = req.auth || requireAuth(req, res)
  if (!auth) return
  if (!requirePermission(auth, res, 'ai:admin')) return

  const { enabled } = req.body
  const db = await readDb()
  db.settings = db.settings || {}

  if (enabled && !db.settings.ai_api_key_encrypted) {
    return res.status(400).json({
      error: 'Configurează mai întâi cheia API.'
    })
  }

  db.settings.ai_enabled = enabled ? 1 : 0
  await writeDb(db)
  addAudit(db, auth.user, enabled ? 'ai_activat' : 'ai_dezactivat', '')
  res.json({ ok: true, enabled })
})

router.post('/admin/ai/test', async (req, res) => {
  const auth = req.auth || requireAuth(req, res)
  if (!auth) return
  if (!requirePermission(auth, res, 'ai:admin')) return

  const apiKey = getApiKey(auth.db)
  if (!apiKey) {
    return res.status(400).json({ error: 'Nicio cheie API configurată.' })
  }

  try {
    const result = await testConnection(apiKey)
    res.json(result)
  } catch (err) {
    res.status(400).json({ ok: false, eroare: err.message })
  }
})

// ── HELPER ──────────────────────────────────────────────

function generateSugestii(entitati) {
  const map = {
    stoc:         ['Care e stocul total?', 'Materiale sub minim'],
    utilaje:      ['Utilaje disponibile azi', 'Consum combustibil săptămâna asta'],
    personal:     ['Cine e prezent azi?', 'Concedii în curs'],
    financiar:    ['Buget vs real luna asta', 'Centre depășite'],
    santiere:     ['Progres șantiere active', 'Șantiere fără jurnal azi'],
    deszapezire:  ['Ultima intervenție', 'Materiale consumate sezon'],
  }
  return entitati.flatMap(e => map[e] || []).slice(0, 4)
}

module.exports = router
