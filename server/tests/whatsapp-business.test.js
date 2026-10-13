const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { normalizeWebhookMessages, signatureIsValid } = require('../modules/messaging/whatsapp')
const { normalizeLeadPayload } = require('../modules/crm/service')
const root = path.resolve(__dirname, '../..')
const messagingPage = fs.readFileSync(path.join(root, 'client/src/pages/modules/MessagingPage.jsx'), 'utf8')
const whatsappRoutes = fs.readFileSync(path.join(root, 'server/modules/messaging/whatsapp.js'), 'utf8')

test('WhatsApp normalizează mesaj text și atașament fără a expune payload-ul brut', () => {
  const rows = normalizeWebhookMessages({
    entry: [{ changes: [{ field: 'messages', value: {
      metadata: { phone_number_id: '123' },
      contacts: [{ wa_id: '40700000000', profile: { name: 'Client Demo' } }],
      messages: [
        { id: 'wamid.text', from: '40700000000', type: 'text', text: { body: 'Bună ziua' }, timestamp: '1760000000' },
        { id: 'wamid.file', from: '40700000000', type: 'document', document: { id: 'media-1', filename: 'cerere.pdf', mime_type: 'application/pdf' }, timestamp: '1760000001' },
      ],
    } }] }],
  })
  assert.equal(rows.length, 2)
  assert.equal(rows[0].contact_name, 'Client Demo')
  assert.equal(rows[0].body, 'Bună ziua')
  assert.equal(rows[1].attachment.filename, 'cerere.pdf')
  assert.equal(rows[1].attachment.status, 'pending_download')
})

test('WhatsApp acceptă numai semnătura HMAC SHA-256 corespunzătoare corpului brut', () => {
  const rawBody = Buffer.from('{"object":"whatsapp_business_account"}', 'utf8')
  const secret = 'test-secret'
  const signature = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`
  const req = { rawBody, get: name => name === 'x-hub-signature-256' ? signature : '' }
  assert.equal(signatureIsValid(req, secret), true)
  assert.equal(signatureIsValid(req, 'wrong-secret'), false)
})

test('Lead-ul provenit din WhatsApp este validat ca sursă CRM explicită', () => {
  const lead = normalizeLeadPayload({ source: 'whatsapp', title: 'Solicitare WhatsApp', description: 'Mesaj client' })
  assert.equal(lead.source, 'whatsapp')
})

test('acțiunile CRM din Inbox WhatsApp respectă aceleași permisiuni în UI și server', () => {
  assert.match(whatsappRoutes, /requirePermission\(auth, res, 'crm:lead_create'\)/)
  assert.match(messagingPage, /canAccess\(user, 'crm:view'\)/)
  assert.match(messagingPage, /canAccess\(user, 'crm:lead_create'\)/)
  assert.match(messagingPage, /!message\.lead_id && canCreateCrmLead/)
  assert.match(messagingPage, /message\.lead_id && canViewCrm/)
})
