#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.resolve(__dirname, '..')
const args = new Set(process.argv.slice(2))
const skipZip = args.has('--no-zip')
const failures = []
const warnings = []

function rel(...parts) {
  return path.join(root, ...parts)
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(rel(relativePath), 'utf8'))
}

function readText(relativePath) {
  return fs.readFileSync(rel(relativePath), 'utf8')
}

function ok(message) {
  console.log(`OK  ${message}`)
}

function warn(message) {
  warnings.push(message)
  console.warn(`WARN ${message}`)
}

function fail(message) {
  failures.push(message)
  console.error(`FAIL ${message}`)
}

function assert(condition, message) {
  if (condition) ok(message)
  else fail(message)
}

function normalizeZipName(name) {
  return String(name || '').replace(/\\/g, '/').replace(/^\/+/, '')
}

function getZipEntries(zipPath) {
  const script = `
    $ErrorActionPreference = 'Stop'
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead(${JSON.stringify(zipPath)})
    try {
      $zip.Entries | ForEach-Object { [PSCustomObject]@{ name = $_.FullName; length = $_.Length } } | ConvertTo-Json -Compress
    } finally {
      $zip.Dispose()
    }
  `
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  const result = spawnSync('powershell.exe', ['-NoProfile', '-EncodedCommand', encoded], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.error || result.status !== 0) {
    const output = `${result.stdout || ''}${result.stderr || ''}`.trim()
    throw new Error(output || result.error?.message || `PowerShell exit ${result.status}`)
  }
  const parsed = JSON.parse(String(result.stdout || '[]').trim() || '[]')
  return Array.isArray(parsed) ? parsed : [parsed]
}

function latestUpdateFromAgents(agentsText, version) {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`${escaped}\\s*→\\s*UPDATE\\s+(\\d+)\\s+([^\\n✅]+)`, 'i')
  const match = agentsText.match(regex)
  if (!match) return null
  return {
    number: Number(match[1]),
    title: match[2].trim(),
  }
}

function findUpdateNote(updateNumber) {
  const prefix = `UPDATE_${String(updateNumber).padStart(3, '0')}_`
  const files = fs.readdirSync(rel('updates')).filter((name) => name.startsWith(prefix) && name.endsWith('.md'))
  return files.length ? path.join('updates', files[0]) : ''
}

function checkVersions() {
  const files = ['package.json', 'server/package.json', 'client/package.json', 'version.json']
  const versions = files.map((file) => ({ file, version: readJson(file).version }))
  const expected = versions[0].version
  versions.forEach(({ file, version }) => assert(version === expected, `${file} version=${version}`))
  return expected
}

function checkDocumentation(version) {
  const changelog = readText('CHANGELOG.md')
  const agents = readText('AGENTS.md')
  const versionJson = readJson('version.json')
  const current = latestUpdateFromAgents(agents, version)

  assert(changelog.includes(`# v${version} -`), `CHANGELOG.md conține v${version}`)
  assert(String(versionJson.changelog || '').includes(`v${version}`), `version.json changelog conține v${version}`)
  assert(agents.includes(`Versiune curentă sursă: v${version}`), `AGENTS.md versiune curentă v${version}`)
  assert(agents.includes(`UPDATE ZIP CURENT: ${version}`), `AGENTS.md ZIP curent ${version}`)
  assert(Boolean(current), `AGENTS.md mapare versiune ${version} → UPDATE`)

  if (!current) return { updateNumber: null, updateNote: '' }

  const updateNote = findUpdateNote(current.number)
  assert(Boolean(updateNote), `există notă updates/UPDATE_${String(current.number).padStart(3, '0')}_*.md`)
  if (updateNote) {
    const note = readText(updateNote)
    assert(note.includes(version), `${updateNote} conține versiunea ${version}`)
  }
  return { updateNumber: current.number, updateNote }
}

function checkZip(version, updateNote) {
  if (skipZip) {
    warn('Verificarea ZIP a fost sărită prin --no-zip.')
    return
  }

  const zipPath = rel('installer', 'output', `InfraFlow-update-v${version}.zip`)
  assert(fs.existsSync(zipPath), `există ZIP ${path.relative(root, zipPath)}`)
  if (!fs.existsSync(zipPath)) return

  const size = fs.statSync(zipPath).size
  assert(size > 1024 * 1024, `ZIP are dimensiune credibilă (${size} bytes)`)

  const entries = new Map(getZipEntries(zipPath).map((entry) => [normalizeZipName(entry.name), Number(entry.length) || 0]))
  const required = [
    'version.json',
    'CHANGELOG.md',
    'server/app.js',
    'server/package.json',
    'client/dist/index.html',
  ]
  if (updateNote) required.push(normalizeZipName(updateNote))

  required.forEach((entry) => assert(entries.has(entry), `ZIP conține ${entry}`))

  if (entries.has('version.json')) {
    const extractScript = `
      $ErrorActionPreference = 'Stop'
      Add-Type -AssemblyName System.IO.Compression.FileSystem
      $zip = [System.IO.Compression.ZipFile]::OpenRead(${JSON.stringify(zipPath)})
      try {
        $entry = $zip.Entries | Where-Object { $_.FullName -replace '\\\\','/' -eq 'version.json' } | Select-Object -First 1
        if (-not $entry) { throw 'version.json lipsă' }
        $reader = [System.IO.StreamReader]::new($entry.Open())
        try { $reader.ReadToEnd() } finally { $reader.Dispose() }
      } finally {
        $zip.Dispose()
      }
    `
    const encoded = Buffer.from(extractScript, 'utf16le').toString('base64')
    const result = spawnSync('powershell.exe', ['-NoProfile', '-EncodedCommand', encoded], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    })
    const body = String(result.stdout || '')
    assert(result.status === 0 && body.includes(`"version": "${version}"`), `version.json din ZIP are ${version}`)
  }
}

function checkGitAwareness() {
  const result = spawnSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8', shell: false })
  if (result.status !== 0) {
    warn('Nu am putut citi git status pentru sumarul release.')
    return
  }
  const changed = String(result.stdout || '').trim().split(/\r?\n/).filter(Boolean)
  if (changed.length) warn(`Working tree are ${changed.length} modificări necomise; release check validează starea curentă, nu un commit.`)
  else ok('working tree curat')
}

function main() {
  console.log('InfraFlow release check')
  const version = checkVersions()
  const { updateNote } = checkDocumentation(version)
  checkZip(version, updateNote)
  checkGitAwareness()

  if (warnings.length) {
    console.log('\nAvertismente:')
    warnings.forEach((item) => console.log(`- ${item}`))
  }

  if (failures.length) {
    console.error('\nRelease check EȘUAT:')
    failures.forEach((item) => console.error(`- ${item}`))
    process.exit(1)
  }

  console.log(`\nRelease check OK pentru v${version}.`)
}

main()
