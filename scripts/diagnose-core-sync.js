'use strict'
const fs = require('node:fs')
const { analyzeCoreSync } = require('./lib/core-sync-preflight')
function run(argv) {
  const flags = {}
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--source','--target','--company-id'].includes(argv[i]) || !argv[i+1] || flags[argv[i]]) throw Error('usage')
    flags[argv[i]] = argv[i+1]
  }
  if (!flags['--source'] || !flags['--target']) throw Error('usage')
  const source = JSON.parse(fs.readFileSync(flags['--source'], 'utf8'))
  const target = JSON.parse(fs.readFileSync(flags['--target'], 'utf8'))
  return analyzeCoreSync(source, target, { companyId: flags['--company-id'] })
}
if (require.main === module) {
  try { const result = run(process.argv.slice(2)); console.log(JSON.stringify(result, null, 2)); if (result.totals.blockers) process.exitCode = 1 }
  catch { console.error('Analiza nu a fost executată. Folosește --source fișier.json --target snapshot.json --company-id UUID. Verifică argumentele, existența fișierelor și JSON-ul. Nicio scriere sau conexiune SQL nu este efectuată.'); process.exitCode = 2 }
}
module.exports = { run }
