const tls = require('tls')
const net = require('net')
const { decryptSettingSecret } = require('../../core/settings-crypto')
const { getEmailSettings } = require('./email')

function deriveImapSettings(db) {
  const appSettings = db?.settings || {}
  const email = getEmailSettings(db)
  const smtpHost = String(email.smtp_host || '').toLowerCase()
  let host = String(appSettings.imap_host || appSettings.imapHost || '').trim()
  let port = Number(appSettings.imap_port || appSettings.imapPort || 993)
  let secure = appSettings.imap_secure !== undefined ? Boolean(appSettings.imap_secure) : port === 993
  const user = String(appSettings.imap_user || appSettings.imapUser || email.smtp_user || '').trim()
  const encrypted = appSettings.imap_password_encrypted || appSettings.imapPasswordEncrypted || email.smtp_password_encrypted || ''

  if (!host) {
    if (smtpHost.includes('gmail')) host = 'imap.gmail.com'
    else if (smtpHost.includes('office365') || smtpHost.includes('outlook') || smtpHost.includes('microsoft')) host = 'outlook.office365.com'
    else if (smtpHost.includes('yahoo')) host = 'imap.mail.yahoo.com'
    else if (smtpHost.startsWith('smtp.')) host = smtpHost.replace(/^smtp\./, 'imap.')
  }

  if (host && !port) port = 993
  secure = port === 993 ? true : secure

  return { host, port, secure, user, encrypted, provider: providerFromHost(host || smtpHost) }
}

function providerFromHost(host = '') {
  const text = String(host).toLowerCase()
  if (text.includes('gmail')) return 'gmail'
  if (text.includes('office365') || text.includes('outlook') || text.includes('microsoft')) return 'office365'
  if (text.includes('smtp2go')) return 'smtp2go'
  return 'imap'
}

function decodeMailbox(text = '') {
  return String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function quoteImap(text = '') {
  return `"${decodeMailbox(text)}"`
}

function createImapError(message, code = 'IMAP_SYNC_FAILED', tips = [], details = '') {
  const error = new Error(message)
  error.imapDiagnostic = { error: message, code, tips, details }
  return error
}

function describeImapError(error) {
  if (error?.imapDiagnostic) return error.imapDiagnostic
  const raw = String(error?.message || error || '')
  const lower = raw.toLowerCase()
  if (lower.includes('authentication') || lower.includes('login failed') || lower.includes('invalid credentials')) {
    return {
      error: 'Serverul IMAP a respins autentificarea.',
      code: 'IMAP_AUTH_FAILED',
      details: raw,
      tips: [
        'Pentru Gmail folosește App Password, nu parola normală.',
        'Verifică dacă utilizatorul este adresa completă de email.',
        'Verifică dacă IMAP este activ în setările contului de email.'
      ]
    }
  }
  if (lower.includes('timeout') || lower.includes('enotfound') || lower.includes('econnrefused')) {
    return {
      error: 'Nu mă pot conecta la serverul IMAP.',
      code: 'IMAP_CONNECTION_FAILED',
      details: raw,
      tips: ['Verifică hostul IMAP, portul 993 și firewall-ul/antivirusul.']
    }
  }
  return {
    error: 'Sincronizarea IMAP nu a reușit.',
    code: 'IMAP_SYNC_FAILED',
    details: raw,
    tips: ['Verifică dacă providerul permite IMAP cu parola configurată.']
  }
}

async function testIncomingEmailConnection(db) {
  const result = await fetchIncomingEmails(db, { limit: 1 })
  return {
    ok: true,
    provider: result.provider,
    host: result.host,
    user: result.user,
    scanned: result.emails.length
  }
}

class SimpleImapClient {
  constructor({ host, port, secure, user, password, timeoutMs = 25000 }) {
    this.host = host
    this.port = port
    this.secure = secure
    this.user = user
    this.password = password
    this.timeoutMs = timeoutMs
    this.tag = 0
    this.socket = null
    this.buffer = ''
  }

  connect() {
    return new Promise((resolve, reject) => {
      const socket = this.secure
        ? tls.connect({ host: this.host, port: this.port, servername: this.host, timeout: this.timeoutMs })
        : net.connect({ host: this.host, port: this.port, timeout: this.timeoutMs })
      this.socket = socket
      const cleanup = () => {
        socket.off('error', onError)
        socket.off('timeout', onTimeout)
        socket.off('data', onData)
      }
      const onError = error => { cleanup(); reject(error) }
      const onTimeout = () => { cleanup(); socket.destroy(); reject(new Error('Timeout conectare IMAP.')) }
      const onData = chunk => {
        this.buffer += chunk.toString('utf8')
        if (/^\* OK/im.test(this.buffer)) {
          cleanup()
          resolve()
        }
      }
      socket.on('error', onError)
      socket.on('timeout', onTimeout)
      socket.on('data', onData)
    })
  }

  command(commandText) {
    const tag = `A${String(++this.tag).padStart(4, '0')}`
    const full = `${tag} ${commandText}\r\n`
    this.buffer = ''
    return new Promise((resolve, reject) => {
      const socket = this.socket
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error(`Timeout IMAP la comanda ${commandText.split(' ')[0]}.`))
      }, this.timeoutMs)
      const cleanup = () => {
        clearTimeout(timer)
        socket.off('data', onData)
        socket.off('error', onError)
      }
      const onError = error => { cleanup(); reject(error) }
      const onData = chunk => {
        this.buffer += chunk.toString('utf8')
        const done = new RegExp(`\\r?\\n${tag} (OK|NO|BAD)`, 'i').exec(this.buffer)
        if (!done) return
        cleanup()
        if (done[1].toUpperCase() === 'OK') resolve(this.buffer)
        else reject(new Error(this.buffer))
      }
      socket.on('data', onData)
      socket.on('error', onError)
      socket.write(full)
    })
  }

  async login() {
    await this.command(`LOGIN ${quoteImap(this.user)} ${quoteImap(this.password)}`)
  }

  async selectInbox() {
    await this.command('SELECT INBOX')
  }

  async searchAll() {
    const response = await this.command('UID SEARCH ALL')
    const line = response.split(/\r?\n/).find(item => /^\* SEARCH/i.test(item)) || ''
    return line.replace(/^\* SEARCH\s*/i, '').trim().split(/\s+/).map(Number).filter(Boolean)
  }

  async fetchRaw(uid) {
    const response = await this.command(`UID FETCH ${uid} (RFC822)`)
    const literal = /\{(\d+)\}\r?\n/.exec(response)
    if (!literal) return ''
    const start = literal.index + literal[0].length
    const length = Number(literal[1] || 0)
    return response.slice(start, start + length)
  }

  async logout() {
    try { await this.command('LOGOUT') } catch {}
    try { this.socket?.end() } catch {}
  }
}

function unfoldHeaders(rawHeaders) {
  const lines = String(rawHeaders || '').replace(/\r\n/g, '\n').split('\n')
  const result = []
  for (const line of lines) {
    if (/^\s/.test(line) && result.length) result[result.length - 1] += ` ${line.trim()}`
    else result.push(line)
  }
  return result
}

function headerMap(rawHeaders) {
  const map = {}
  for (const line of unfoldHeaders(rawHeaders)) {
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim().toLowerCase()
    const value = line.slice(idx + 1).trim()
    map[key] = map[key] ? `${map[key]}, ${value}` : value
  }
  return map
}

function decodeMimeWords(text = '') {
  return String(text).replace(/=\?([^?]+)\?([QB])\?([^?]*)\?=/gi, (_, charset, encoding, value) => {
    try {
      const normalized = encoding.toUpperCase() === 'B'
        ? Buffer.from(value, 'base64')
        : Buffer.from(value.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (m, hex) => String.fromCharCode(parseInt(hex, 16))), 'binary')
      return normalized.toString(String(charset || '').toLowerCase().includes('iso-8859-1') ? 'latin1' : 'utf8')
    } catch {
      return value
    }
  })
}

function decodeQuotedPrintable(text = '') {
  return String(text)
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

function decodeBody(text = '', encoding = '') {
  const enc = String(encoding || '').toLowerCase()
  if (enc.includes('base64')) {
    try { return Buffer.from(String(text).replace(/\s+/g, ''), 'base64').toString('utf8') } catch { return text }
  }
  if (enc.includes('quoted-printable')) return decodeQuotedPrintable(text)
  return text
}

function parseHeaderParams(value = '') {
  const result = { value: '', params: {} }
  const parts = String(value || '').split(';')
  result.value = String(parts.shift() || '').trim().toLowerCase()
  for (const part of parts) {
    const idx = part.indexOf('=')
    if (idx <= 0) continue
    const key = part.slice(0, idx).trim().toLowerCase()
    let paramValue = part.slice(idx + 1).trim().replace(/^"|"$/g, '')
    if (key.endsWith('*')) {
      paramValue = paramValue.replace(/^[^']*''/i, '')
      try { paramValue = decodeURIComponent(paramValue) } catch {}
    }
    result.params[key.replace(/\*$/, '')] = decodeMimeWords(paramValue)
  }
  return result
}

function parseMimeEntity(raw = '') {
  const split = /\r?\n\r?\n/.exec(raw)
  const rawHeaders = split ? raw.slice(0, split.index) : ''
  const rawBody = split ? raw.slice(split.index + split[0].length) : raw
  return { headers: headerMap(rawHeaders), rawBody }
}

function splitMultipartBody(rawBody = '', boundary = '') {
  if (!boundary) return []
  const marker = `--${boundary}`
  return String(rawBody || '')
    .split(marker)
    .slice(1)
    .map(part => part.replace(/^\r?\n/, '').replace(/\r?\n$/, ''))
    .filter(part => part && !part.startsWith('--'))
}

function flattenMimeParts(rawBody = '', headers = {}, depth = 0) {
  if (depth > 8) return []
  const contentType = headers['content-type'] || ''
  const boundary = extractBoundary(contentType)
  if (!boundary) return [{ headers, rawBody }]
  return splitMultipartBody(rawBody, boundary).flatMap(part => {
    const entity = parseMimeEntity(part)
    return flattenMimeParts(entity.rawBody, entity.headers, depth + 1)
  })
}

function attachmentFromPart(part, limits) {
  const contentType = parseHeaderParams(part.headers['content-type'] || '')
  const disposition = parseHeaderParams(part.headers['content-disposition'] || '')
  const filename = compactFilename(disposition.params.filename || contentType.params.name || '')
  const isAttachment = disposition.value === 'attachment' || Boolean(filename)
  if (!isAttachment || !filename) return null

  const encoding = String(part.headers['content-transfer-encoding'] || '').trim().toLowerCase()
  let buffer
  if (encoding.includes('base64')) {
    buffer = Buffer.from(String(part.rawBody || '').replace(/\s+/g, ''), 'base64')
  } else if (encoding.includes('quoted-printable')) {
    buffer = Buffer.from(decodeQuotedPrintable(part.rawBody || ''), 'utf8')
  } else {
    buffer = Buffer.from(String(part.rawBody || ''), 'utf8')
  }

  const size = buffer.length
  if (!size) return null
  if (size > limits.maxFileSize || limits.total + size > limits.maxTotalSize || limits.count >= limits.maxFiles) {
    return {
      name: filename,
      filename,
      size,
      type: contentType.value || 'application/octet-stream',
      contentType: contentType.value || 'application/octet-stream',
      skipped: true,
      skip_reason: 'Atașament prea mare pentru stocarea în Inbox ERP.'
    }
  }
  limits.total += size
  limits.count += 1
  return {
    name: filename,
    filename,
    size,
    type: contentType.value || 'application/octet-stream',
    contentType: contentType.value || 'application/octet-stream',
    content: buffer.toString('base64'),
    encoding: 'base64'
  }
}

function compactFilename(value = '') {
  return decodeMimeWords(String(value || ''))
    .replace(/[\\/:*?"<>|\r\n]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
}

function extractAttachments(rawBody, headers) {
  const parts = flattenMimeParts(rawBody, headers)
  const limits = { maxFiles: 5, maxFileSize: 2 * 1024 * 1024, maxTotalSize: 5 * 1024 * 1024, total: 0, count: 0 }
  return parts
    .map(part => attachmentFromPart(part, limits))
    .filter(Boolean)
}

function stripHtml(html = '') {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function extractBoundary(contentType = '') {
  const match = /boundary="?([^";]+)"?/i.exec(contentType)
  return match ? match[1] : ''
}

function extractBody(rawBody, headers) {
  const contentType = headers['content-type'] || ''
  const boundary = extractBoundary(contentType)
  if (boundary) {
    const parts = flattenMimeParts(rawBody, headers)
      .filter(part => !parseHeaderParams(part.headers['content-disposition'] || '').value.includes('attachment'))
      .filter(part => !parseHeaderParams(part.headers['content-disposition'] || '').params.filename)
    const plain = parts.find(item => String(item.headers['content-type'] || '').toLowerCase().includes('text/plain'))
    const html = parts.find(item => String(item.headers['content-type'] || '').toLowerCase().includes('text/html'))
    if (plain) return decodeBody(plain.rawBody, plain.headers['content-transfer-encoding'])
    if (html) return stripHtml(decodeBody(html.rawBody, html.headers['content-transfer-encoding']))
    return ''
  }
  const body = decodeBody(rawBody, headers['content-transfer-encoding'])
  if (String(contentType).toLowerCase().includes('text/html')) return stripHtml(body)
  return String(body || '').trim()
}

function parseAddress(value = '') {
  return decodeMimeWords(String(value || '')).replace(/\s+/g, ' ').trim()
}

function safeEmailDate(value) {
  const date = new Date(value || '')
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

function parseRawEmail(raw) {
  const split = /\r?\n\r?\n/.exec(raw)
  const rawHeaders = split ? raw.slice(0, split.index) : ''
  const rawBody = split ? raw.slice(split.index + split[0].length) : raw
  const headers = headerMap(rawHeaders)
  const body = extractBody(rawBody, headers)
  const preview = stripHtml(body).replace(/\s+/g, ' ').trim().slice(0, 240)
  const attachments = extractAttachments(rawBody, headers)
  const attachmentsCount = attachments.length || (String(raw || '').match(/content-disposition:\s*attachment/gi) || []).length
  return {
    external_id: headers['message-id'] || '',
    from: parseAddress(headers.from),
    to: parseAddress(headers.to),
    cc: parseAddress(headers.cc),
    subject: decodeMimeWords(headers.subject || '(fără subiect)'),
    body,
    preview,
    received_at: safeEmailDate(headers.date),
    content_type: headers['content-type'] || '',
    has_attachments: attachmentsCount > 0,
    attachments_count: attachmentsCount,
    attachments
  }
}

function classifyEmail(email) {
  const text = `${email.subject || ''} ${email.from || ''} ${email.preview || ''}`.toLowerCase()
  if (text.includes('contract')) return 'contracte'
  if (text.includes('factur') || text.includes('invoice') || text.includes('payment')) return 'contabilitate'
  if (text.includes('achiz') || text.includes('ofert') || text.includes('comand')) return 'achizitii'
  if (text.includes('hr') || text.includes('concediu') || text.includes('angajat')) return 'hr'
  if (text.includes('sesizare') || text.includes('ticket')) return 'sesizari'
  return 'general'
}

async function fetchIncomingEmails(db, { limit = 20 } = {}) {
  const settings = deriveImapSettings(db)
  if (!settings.host || !settings.user || !settings.encrypted) {
    throw createImapError(
      'Primirea emailurilor nu este configurată. SMTP trimite emailuri, dar pentru primire este nevoie de IMAP.',
      'IMAP_CONFIG_INCOMPLETE',
      ['Configurează SMTP cu adresa reală și parola de aplicație.', 'Pentru Gmail activează IMAP în setările contului.']
    )
  }
  if (settings.provider === 'smtp2go') {
    throw createImapError(
      'SMTP2GO este folosit pentru trimitere, nu pentru primirea emailurilor.',
      'IMAP_PROVIDER_UNSUPPORTED',
      ['Pentru primire configurează căsuța reală a domeniului clientului sau Gmail/Microsoft 365.']
    )
  }
  let password = ''
  try {
    password = decryptSettingSecret(settings.encrypted)
  } catch {
    throw createImapError('Parola salvată nu poate fi citită pentru sincronizarea IMAP.', 'IMAP_SECRET_UNREADABLE', ['Reintrodu parola în Setări și salvează.'])
  }

  const client = new SimpleImapClient({ ...settings, password })
  try {
    await client.connect()
    await client.login()
    await client.selectInbox()
    const uids = await client.searchAll()
    const latest = uids.slice(-Math.max(1, Math.min(Number(limit || 20), 50)))
    const emails = []
    for (const uid of latest) {
      const raw = await client.fetchRaw(uid)
      if (!raw) continue
      const parsed = parseRawEmail(raw)
      emails.push({
        ...parsed,
        uid,
        external_id: parsed.external_id || `imap:${settings.host}:${settings.user}:${uid}`,
        source_label: `IMAP ${settings.user}`,
        source_type: 'email_imap',
        category: classifyEmail(parsed)
      })
    }
    return { emails, provider: settings.provider, host: settings.host, user: settings.user }
  } finally {
    await client.logout()
  }
}

module.exports = { fetchIncomingEmails, testIncomingEmailConnection, describeImapError, classifyEmail }
