const { hashPassword } = require('../server/core/auth')

const PASSWORD = 'demo123'
const users = [
  'admin',
  'director',
  'contabil',
  'sef.mecanizare',
  'sef.gestiune',
  'sofer1',
  'sofer2',
  'gestionar',
  'hr',
  'demo'
]

users.forEach((username) => {
  console.log(`${username}: ${hashPassword(PASSWORD)}`)
})
