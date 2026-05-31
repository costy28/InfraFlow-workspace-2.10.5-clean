const crypto = require('crypto')
const fs = require('fs')
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
})
fs.writeFileSync('private-key.pem', privateKey)
fs.writeFileSync('server/core/infraflow-public.pem', publicKey)
console.log('Chei generate! private-key.pem → PĂSTREAZĂ SECRET')
