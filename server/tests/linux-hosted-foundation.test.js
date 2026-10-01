const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..', '..')
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8')

test('executorul MSSQL Linux folosește driverul Node fără PowerShell', () => {
  const db = read('server', 'core', 'db.js')
  const executor = read('server', 'core', 'mssql-executor.js')
  assert.match(db, /process\.platform !== "win32"/)
  assert.match(db, /server", "core", "mssql-executor\.js"/)
  assert.match(db, /127\.0\.0\.1,1433/)
  assert.match(executor, /require\("mssql"\)/)
  assert.match(executor, /request\.input\("json"/)
  assert.doesNotMatch(executor, /powershell\.exe/i)
})

test('serviciul Ubuntu rulează ca utilizator dedicat și nu expune datele scriibile', () => {
  const service = read('scripts', 'linux', 'infraflow.service')
  assert.match(service, /^User=infraflow$/m)
  assert.match(service, /^NoNewPrivileges=true$/m)
  assert.match(service, /^ProtectSystem=full$/m)
  assert.match(service, /^EnvironmentFile=\/etc\/infraflow\/infraflow\.env$/m)
  assert.match(service, /ReadWritePaths=.*\/storage.*\/logs.*\/runtime/m)
  assert.match(read('server', 'app.js'), /process\.platform === 'win32' \? '' : '127\.0\.0\.1'/)
})

test('backupul Linux nu expune parola SQL în argumentele sqlcmd', () => {
  const backup = read('scripts', 'linux', 'backup-mssql.sh')
  assert.match(backup, /export SQLCMDPASSWORD=/)
  assert.match(backup, /WITH COPY_ONLY, CHECKSUM, COMPRESSION/)
  assert.doesNotMatch(backup, /sqlcmd[^\n]*-P\s/)
})

test('ghidul Ubuntu explică izolarea și limitele conectorilor locali', () => {
  const guide = read('docs', 'INSTALARE_SERVER_UBUNTU_24_04.md')
  ;['Cloudflare Tunnel', '127.0.0.1:4180', 'backup', 'PIUSI', 'agent local Windows'].forEach((marker) => assert.match(guide, new RegExp(marker, 'i')))
})

test('importul PIUSI exclusiv Windows nu blochează instalarea Ubuntu', () => {
  const serverPackage = JSON.parse(read('server', 'package.json'))
  assert.equal(serverPackage.dependencies['node-adodb'], undefined)
  assert.equal(serverPackage.optionalDependencies['node-adodb'], '^5.0.3')
  assert.equal(serverPackage.dependencies['https-proxy-agent'], '^7.0.0')
})

test('update-ul Linux este primit controlat și aplicat exclusiv de systemd', () => {
  const routes = read('server', 'modules', 'system', 'update-routes.js')
  const worker = read('scripts', 'linux', 'apply-update.sh')
  const installer = read('scripts', 'linux', 'install-service.sh')
  assert.match(routes, /linuxUpdateInbox/)
  assert.match(routes, /moveUpdatePackage/)
  assert.match(routes, /error\?\.code !== 'EXDEV'/)
  assert.match(routes, /linux_update/)
  assert.match(worker, /app-before-update-/)
  assert.match(worker, /EROARE: update eșuat; se restaurează backupul anterior/)
  assert.match(worker, /systemctl stop infraflow\.service/)
  assert.match(worker, /flock -n 9/)
  assert.match(worker, /api\/health/)
  assert.match(worker, /Pachet valid: \$CURRENT_VERSION -> \$STAGED_VERSION/)
  assert.match(worker, /require\('mssql'\); require\('https-proxy-agent'\); require\('sprintf-js'\)/)
  assert.match(worker, /refresh_worker_for_next_update/)
  assert.match(worker, /Versiunea instalată \$INSTALLED_VERSION nu corespunde pachetului/)
  assert.match(worker, /\[\[ "\$exit_code" -ne 0 && "\$CHANGED" -eq 1/)
  assert.match(installer, /systemctl enable --now infraflow-update\.path/)
})

test('pachetul hosted poate porni în demo chiar când rutele tehnice demo sunt excluse', () => {
  const app = read('server', 'app.js')
  assert.match(app, /const demoRoutesPath = path\.join\(__dirname, 'modules', 'system', 'demo-routes\.js'\)/)
  assert.match(app, /fs\.existsSync\(demoRoutesPath\)/)
  assert.match(app, /Rutele tehnice demo nu sunt incluse în acest pachet/)
})
