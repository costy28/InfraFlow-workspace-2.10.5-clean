#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.resolve(__dirname, '..')
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const args = new Set(process.argv.slice(2))
const includeAdvisory = args.has('--advisory')
const skipBuild = args.has('--skip-build')

const failures = []
const advisoryFailures = []

function title(label) {
  console.log(`\n=== ${label} ===`)
}

function run(label, command, commandArgs, options = {}) {
  title(label)
  const spawnTarget = buildSpawnTarget(command, commandArgs)
  const result = spawnSync(spawnTarget.command, spawnTarget.args, {
    cwd: options.cwd || root,
    stdio: 'inherit',
    shell: false,
  })

  if (result.error || result.status !== 0) {
    const message = result.error
      ? `${label}: ${result.error.message}`
      : `${label}: exit ${result.status}`
    if (options.advisory) advisoryFailures.push(message)
    else failures.push(message)
    return false
  }

  return true
}

function buildSpawnTarget(command, commandArgs) {
  if (process.platform !== 'win32' || !command.toLowerCase().endsWith('.cmd')) {
    return { command, args: commandArgs }
  }

  return {
    command: process.env.ComSpec || 'cmd.exe',
    args: ['/d', '/c', [command, ...commandArgs].join(' ')],
  }
}

function listJsFiles(dir) {
  const files = []
  const ignoredDirs = new Set(['node_modules', 'dist', 'build', 'output'])

  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (ignoredDirs.has(entry.name)) continue
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && full.endsWith('.js')) files.push(full)
    }
  }

  walk(dir)
  return files
}

function checkServerSyntax() {
  title('Backend JS syntax check')
  const files = listJsFiles(path.join(root, 'server'))
  const failed = []

  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], {
      cwd: root,
      encoding: 'utf8',
      shell: false,
    })
    if (result.status !== 0) {
      failed.push({
        file: path.relative(root, file),
        output: `${result.stdout || ''}${result.stderr || ''}`.trim(),
      })
    }
  }

  if (failed.length) {
    for (const item of failed) {
      console.error(`\n${item.file}`)
      if (item.output) console.error(item.output)
    }
    failures.push(`Backend JS syntax check: ${failed.length} fișiere cu erori`)
    return false
  }

  console.log(`OK — ${files.length} fișiere verificate`)
  return true
}

function main() {
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
  console.log(`InfraFlow audit local — v${version}`)

  checkServerSyntax()
  run('HR regression tests', npmCmd, ['run', 'test:hr'])
  run('Accounting regression tests', npmCmd, ['run', 'test:accounting'])
  run('Release acceptance smoke', npmCmd, ['run', 'test:release'])
  run('Module read-only smoke suite', npmCmd, ['run', 'test:smoke'])
  run('Backup roundtrip check', npmCmd, ['run', 'test:backup'])

  if (!skipBuild) run('Frontend production build', npmCmd, ['run', 'build'])
  else console.log('\n=== Frontend production build ===\nSărit prin --skip-build')

  if (includeAdvisory) {
    run('Client lint advisory', npmCmd, ['run', 'lint'], {
      cwd: path.join(root, 'client'),
      advisory: true,
    })
    run('Root dependency audit advisory', npmCmd, ['audit', '--omit=dev', '--audit-level=moderate'], {
      advisory: true,
    })
    run('Server dependency audit advisory', npmCmd, ['audit', '--omit=dev', '--audit-level=moderate'], {
      cwd: path.join(root, 'server'),
      advisory: true,
    })
    run('Client dependency audit advisory', npmCmd, ['audit', '--omit=dev', '--audit-level=moderate'], {
      cwd: path.join(root, 'client'),
      advisory: true,
    })
  } else {
    console.log('\nPentru lint + npm audit non-blocant: npm run audit:advisory')
  }

  if (advisoryFailures.length) {
    console.log('\nAvertismente advisory:')
    for (const item of advisoryFailures) console.log(`- ${item}`)
  }

  if (failures.length) {
    console.error('\nAudit local EȘUAT:')
    for (const item of failures) console.error(`- ${item}`)
    process.exit(1)
  }

  console.log('\nAudit local OK.')
}

main()
