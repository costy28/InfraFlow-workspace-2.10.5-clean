const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const test = require('node:test')
const { SimpleImapClient } = require('../modules/messaging/imap')

test('clientul IMAP acceptă răspunsul etichetat aflat pe primul rând', async () => {
  const socket = new EventEmitter()
  socket.write = () => {
    socket.emit('data', Buffer.from('A0001 OK LOGIN completed\r\n'))
  }
  const client = new SimpleImapClient({ host: 'imap.example.test', port: 993, secure: true, user: 'user', password: 'secret', timeoutMs: 50 })
  client.socket = socket
  await client.login()
  assert.equal(client.tag, 1)
})

test('clientul IMAP păstrează un listener pentru eroarea socketului după o comandă', async () => {
  const socket = new EventEmitter()
  socket.write = command => {
    const tag = String(command).split(' ')[0]
    socket.emit('data', Buffer.from(`${tag} OK completed\r\n`))
  }
  const client = new SimpleImapClient({ host: 'imap.example.test', port: 993, secure: true, user: 'user', password: 'secret', timeoutMs: 50 })
  client.socket = socket
  client.attachSocketErrorListener(socket)

  await client.login()
  const reset = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })
  assert.doesNotThrow(() => socket.emit('error', reset))
  assert.equal(client.socketError, reset)
  await assert.rejects(() => client.selectInbox(), { code: 'ECONNRESET' })
})
