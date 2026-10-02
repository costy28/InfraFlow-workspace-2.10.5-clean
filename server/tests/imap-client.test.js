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
