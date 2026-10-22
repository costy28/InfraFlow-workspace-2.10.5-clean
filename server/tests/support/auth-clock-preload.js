'use strict'
// Încărcat numai prin --require în procesul de test, niciodată din server/app.js.
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const file = process.env.INFRAFLOW_TEST_AUTH_CLOCK_FILE
const relative = file ? path.relative(os.tmpdir(), path.resolve(file)) : '..'
if (process.env.NODE_ENV !== 'test' || !file || relative.startsWith('..') || path.isAbsolute(relative) || path.basename(file) !== 'auth-clock.json') {
  throw Error('Ceasul sintetic este disponibil numai în procesul de test izolat.')
}
const original = Date.now.bind(Date)
Date.now = () => {
  const value = JSON.parse(fs.readFileSync(file, 'utf8')).offsetMs
  if (!Number.isSafeInteger(value) || Math.abs(value) > 7 * 24 * 60 * 60 * 1000) throw Error('Offset sintetic invalid.')
  return original() + value
}
