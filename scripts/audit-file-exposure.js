#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const args = new Set(process.argv.slice(2))
const strict = args.has('--strict')

const scanRoots = [
  path.join(root, 'server'),
  path.join(root, 'client', 'src'),
]

const ignoredDirs = new Set(['node_modules', 'dist', 'build', 'output', '.git'])
const sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx'])

const findings = []

function relative(file) {
  return path.relative(root, file).replace(/\\/g, '/')
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, files)
    else if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) files.push(full)
  }
  return files
}

function addFinding(severity, file, line, kind, evidence, recommendation) {
  findings.push({
    severity,
    file: relative(file),
    line,
    kind,
    evidence: String(evidence || '').trim(),
    recommendation,
  })
}

function isAllowedStorageLine(file, line) {
  const rel = relative(file)
  if (rel === 'server/app.js' && /app\.use\(['"`]\/storage['"`]/.test(line)) return true
  if (/path\.join|path\.resolve|multer|dest:|STORAGE|storageRoot|ROOT|TICKETS_STORAGE|TASK_EVIDENCE_ROOT/i.test(line)) return true
  if (/download_url|downloadUrl|download-model|download\/|res\.download|sendProtectedStorageFile/i.test(line)) return true
  if (/storage\/temp|storage\\temp/i.test(line)) return true
  return false
}

function scanFile(file) {
  const text = fs.readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/)
  const rel = relative(file)

  lines.forEach((line, index) => {
    const lineNo = index + 1
    const compact = line.trim()
    if (!compact || compact.startsWith('//')) return

    if (/['"`]\/storage\//.test(line) && !isAllowedStorageLine(file, line)) {
      addFinding(
        'high',
        file,
        lineNo,
        'direct-storage-url',
        compact,
        'Folosește endpoint API dedicat, cu requireAuth și verificare pe entitate.'
      )
    }

    if (/href=\{[^}]*\b(file_path|fisier_path|local_path)\b[^}]*\}/i.test(line)) {
      addFinding(
        'high',
        file,
        lineNo,
        'client-direct-file-link',
        compact,
        'Frontend-ul trebuie să folosească *_download_url sau o acțiune API controlată, nu path brut.'
      )
    }

    if (/\b(local_path|diskPath|absolutePath)\b\s*[:=]/i.test(line) && /res\.json|return|\{/.test(line)) {
      addFinding(
        'medium',
        file,
        lineNo,
        'possible-local-path-leak',
        compact,
        'Nu trimite către client căi locale absolute; păstrează-le doar server-side.'
      )
    }

    if (/\b(file_path|fisier_path)\b\s*:/i.test(line) && /storage[\\/]/i.test(line) && !/download_url|downloadUrl/i.test(line)) {
      addFinding(
        'medium',
        file,
        lineNo,
        'stored-storage-path',
        compact,
        'OK ca stocare internă, dar API-ul public trebuie să expună doar indicatori și URL-uri de download controlate.'
      )
    }

    if (/fisier_model_path|email_attachment_download_url|download_url|downloadUrl/i.test(line)) {
      return
    }
  })

  if (rel.startsWith('client/src/') && /fisier_model_path|file_path|fisier_path|local_path/.test(text)) {
    const hasControlledDownload = /download_url|downloadUrl|_download_url|download-model|\/download/.test(text)
    const hasSanitizedReferenceOnly = /normalizeFleetDocumentReference|Referință document/.test(text)
    if (!hasControlledDownload && !hasSanitizedReferenceOnly) {
      addFinding(
        'medium',
        file,
        1,
        'client-file-fields-without-download-url',
        'Componenta folosește câmpuri de path fără semnal clar de download controlat.',
        'Adaugă/folosește URL-uri API controlate pentru descărcare.'
      )
    }
  }
}

function severityRank(severity) {
  return { high: 1, medium: 2, low: 3 }[severity] || 9
}

function main() {
  console.log('InfraFlow file exposure audit')
  console.log(`Mode: ${strict ? 'strict' : 'advisory'}`)

  const files = scanRoots.flatMap((dir) => walk(dir))
  files.forEach(scanFile)

  findings.sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.file.localeCompare(b.file) || a.line - b.line)

  const grouped = findings.reduce((acc, item) => {
    acc[item.severity] = (acc[item.severity] || 0) + 1
    return acc
  }, {})

  console.log(`Scanned files: ${files.length}`)
  console.log(`Findings: ${findings.length} (high=${grouped.high || 0}, medium=${grouped.medium || 0}, low=${grouped.low || 0})`)

  if (findings.length) {
    console.log('\nTop findings:')
    for (const item of findings.slice(0, 40)) {
      console.log(`- [${item.severity}] ${item.file}:${item.line} ${item.kind}`)
      console.log(`  ${item.evidence}`)
      console.log(`  Recomandare: ${item.recommendation}`)
    }
    if (findings.length > 40) console.log(`\n... încă ${findings.length - 40} rezultate. Rulează scriptul local pentru lista completă.`)
  }

  if (strict && findings.some((item) => item.severity === 'high')) {
    console.error('\nAudit file exposure EȘUAT în mod strict: există expuneri high.')
    process.exit(1)
  }

  console.log('\nAudit file exposure OK pentru modul advisory.')
}

main()
