const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const test = require('node:test')

const root = path.resolve(__dirname, '..', '..')
const script = path.join(root, 'scripts', 'promote-preview-release.js')

function payload(channel, version) {
  return {
    format: 'infraflow-release-catalog-v1',
    releases: [{
      version,
      channel,
      components: [{
        id: 'core', type: 'core', artifacts: {
          'server-linux': { url: 'https://updates.example/package.tar.gz', sha256: 'a'.repeat(64) }
        }
      }]
    }]
  }
}

function execute(args) {
  return spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8' })
}

test('promovarea copiază exclusiv versiunea Preview în Stable și scrie istoric local', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'infraflow-promote-'))
  const preview = path.join(dir, 'preview.payload.json')
  const stable = path.join(dir, 'stable.payload.json')
  const output = path.join(dir, 'published', 'stable.payload.json')
  const history = path.join(dir, 'history', 'promotion-history.jsonl')
  fs.writeFileSync(preview, JSON.stringify(payload('preview', '2.12.700')))
  fs.writeFileSync(stable, JSON.stringify(payload('stable', '2.12.699')))

  const result = execute([
    '--preview-input', preview, '--stable-input', stable, '--output', output, '--history', history,
    '--version', '2.12.700', '--confirm-promote', '2.12.700', '--approval-note', 'validat manual'
  ])
  assert.equal(result.status, 0, result.stderr)
  const catalog = JSON.parse(fs.readFileSync(output, 'utf8'))
  assert.deepEqual(catalog.releases.map((release) => [release.version, release.channel]), [['2.12.700', 'stable'], ['2.12.699', 'stable']])
  const event = JSON.parse(fs.readFileSync(history, 'utf8').trim())
  assert.equal(event.version, '2.12.700')
  assert.equal(event.from_channel, 'preview')
})

test('promovarea cere confirmarea exactă și nu suprascrie Preview', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'infraflow-promote-'))
  const preview = path.join(dir, 'preview.payload.json')
  const stable = path.join(dir, 'stable.payload.json')
  const history = path.join(dir, 'history.jsonl')
  fs.writeFileSync(preview, JSON.stringify(payload('preview', '2.12.700')))
  fs.writeFileSync(stable, JSON.stringify(payload('stable', '2.12.699')))

  const wrongConfirmation = execute([
    '--preview-input', preview, '--stable-input', stable, '--output', stable, '--history', history,
    '--version', '2.12.700', '--confirm-promote', '2.12.699', '--approval-note', 'validat manual'
  ])
  assert.notEqual(wrongConfirmation.status, 0)
  assert.match(wrongConfirmation.stderr, /confirmarea/i)

  const overwritePreview = execute([
    '--preview-input', preview, '--stable-input', stable, '--output', preview, '--history', history,
    '--version', '2.12.700', '--confirm-promote', '2.12.700', '--approval-note', 'validat manual'
  ])
  assert.notEqual(overwritePreview.status, 0)
  assert.match(overwritePreview.stderr, /nu poate fi suprascris/i)
})
