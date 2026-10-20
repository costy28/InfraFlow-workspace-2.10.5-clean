'use strict'
const fs = require('node:fs')
const { validateCoreManifest, fingerprint } = require('./lib/core-sync-manifest')
function run(argv) {
  const simulate = argv[0] === '--simulate'
  if (simulate) argv = argv.slice(1)
  const flags = {}
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--source', '--target', '--manifest'].includes(argv[i]) || !argv[i + 1] || Object.hasOwn(flags, argv[i])) throw Error('usage')
    flags[argv[i]] = argv[i + 1]
  }
  if (Object.keys(flags).length !== 3) throw Error('usage')
  const source = fs.readFileSync(flags['--source']), target = fs.readFileSync(flags['--target'])
  const manifest = JSON.parse(fs.readFileSync(flags['--manifest'], 'utf8'))
  const analyze = simulate ? require('./lib/core-sync-simulation').simulateCoreSync : validateCoreManifest
  return analyze(JSON.parse(source.toString('utf8')), JSON.parse(target.toString('utf8')), manifest,
    { source: fingerprint(source), target: fingerprint(target) })
}
if (require.main === module) {
  try {
    const result = run(process.argv.slice(2)); console.log(JSON.stringify(result, null, 2))
    if (result.status === 'blocked') process.exitCode = 1
  } catch {
    console.error('Validarea nu a fost executată. Verifică [--simulate], --source, --target, --manifest și fișierele JSON. Fără scriere sau conexiune SQL.')
    process.exitCode = 2
  }
}
module.exports = { run }
