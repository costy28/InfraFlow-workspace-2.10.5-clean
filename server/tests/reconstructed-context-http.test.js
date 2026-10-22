'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const net = require('node:net')
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')
const { totpCode } = require('../core/two-factor')
const { createDocumentsSqlFixture } = require('./support/documents-sql-fixture')
const { createIntegratedStage } = require('../../scripts/lib/core-integrated-stage-prototype')
const { createSyntheticStageStore } = require('../../scripts/lib/synthetic-stage-store')
const { openCoreSnapshot } = require('../../scripts/lib/core-sync-capsule')
const { fingerprint } = require('../../scripts/lib/core-sync-manifest')
const { decodePolicyContext } = require('../../scripts/lib/core-policy-prototype')
const { decodeRoleLinks } = require('../../scripts/lib/core-role-links-prototype')

test('app.js HTTP: context reconstruit din staging, login real, ACL și sesiuni', {
  skip: process.env.INFRAFLOW_TEST_FULL_APP_SQL !== '1' && process.env.INFRAFLOW_TEST_RECOVERY_SQL !== '1', timeout: 600000
}, async () => {
  const f = createDocumentsSqlFixture(), root = path.resolve(__dirname, '../..')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'infraflow-reconstructed-http-'))
  const recovery = process.env.INFRAFLOW_TEST_RECOVERY_SQL === '1'
  let runtimeRoot = root
  if (recovery) {
    runtimeRoot = path.join(dir, 'isolated-app')
    fs.mkdirSync(runtimeRoot)
    fs.cpSync(path.join(root, 'server'), path.join(runtimeRoot, 'server'), { recursive: true,
      filter: source => !['node_modules', 'tests'].includes(path.basename(source)) })
    fs.cpSync(path.join(root, 'db'), path.join(runtimeRoot, 'db'), { recursive: true })
    for (const name of ['version.json', 'package.json']) fs.copyFileSync(path.join(root, name), path.join(runtimeRoot, name))
    fs.symlinkSync(path.join(root, 'server/node_modules'), path.join(runtimeRoot, 'server/node_modules'), 'junction')
    // Exercise real signature verification without copying an installed license/key.
    const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
    const license = { licenseId: 'SYNTHETIC-RECOVERY', client: { nume: 'Synthetic recovery', cui: '' },
      pachet: 'Synthetic', module: ['all'], limite: { max_utilizatori: 20, max_dispozitive: 20 },
      valabilitate: { tip: 'test', expira_la: '2099-01-01' } }
    const semnatura = crypto.sign('sha256', Buffer.from(JSON.stringify(license)), pair.privateKey).toString('base64')
    fs.writeFileSync(path.join(runtimeRoot, 'server/core/infraflow-public.pem'), pair.publicKey.export({ type: 'spki', format: 'pem' }))
    fs.writeFileSync(path.join(runtimeRoot, 'licenta.iflic'), JSON.stringify({ ...license, semnatura }))
  }
  const seed = path.join(dir, 'seed.json'), key = crypto.randomBytes(32)
  const clockFile = path.join(dir, 'auth-clock.json')
  const setClock = offsetMs => {
    const next = path.join(dir, 'auth-clock.next.json')
    fs.writeFileSync(next, JSON.stringify({ offsetMs })); fs.renameSync(next, clockFile)
  } // Only synthetic process reads this file; replace atomically, not truncate in place.
  setClock(0)
  const password = `Synthetic-${crypto.randomBytes(16).toString('hex')}!aA1`, salt = crypto.randomBytes(16).toString('hex')
  const passwordHash = `scrypt:${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`
  const state = { settings: { setupCompleted: true, initialSetupCompleted: true, networkAccessMode: 'open',
    license: { plan: 'internal', modules: ['all'], maxDevices: 20 }, modules_enabled: ['documents', 'messaging', 'hr'],
    session_idle_timeout_min: 15, session_absolute_timeout_hours: 1,
    rolePermissionOverrides: {}, customRoles: [{ id: 'stage-reader', name: 'Cititor sintetic', permissions: ['documents:view_own'] },
      { id: 'stage-mail', name: 'Mesaje sintetic', permissions: ['messaging:view'] }] },
    users: [{ id: f.users.reader, username: 'stage_reader', name: 'Cititor sintetic', role: 'stage-reader', roles: ['stage-mail'], active: true, passwordHash,
      createdBy: 'demo-leads-webhook', demoAccessExpiresAt: new Date(Date.now() + 4 * 3600000).toISOString() },
      { id: f.users.approver, username: 'stage_admin', name: 'Admin sintetic', role: 'superadmin', active: true, passwordHash }],
    departments: [], devices: [], audit: [], notifications: [],
    documents: { documents: [{ id: 1, uuid: f.uuids[1], titlu: 'Propriu sintetic', nr_document: 'STAGE-1', creat_de: f.users.reader, status: 'draft' },
      { id: 2, uuid: f.uuids[2], titlu: 'Strain sintetic', nr_document: 'STAGE-2', creat_de: f.users.other, status: 'draft' }],
    documentTypes: recovery ? [{ id: 'TEST', denumire: 'Synthetic recovery model',
      fisier_model_path: 'storage/document-templates/TEST/recovery.txt', fisier_model_name: 'recovery.txt' }] : [],
    circuitSteps: [], circuitAudit: [], documentShares: [] },
    messaging: { emailMessages: [{ id: 1, subject: 'Email sintetic', source_type: 'document', source_id: f.uuids[1] }] } }
  const company = 'aaaaaaaa-0000-0000-0000-000000000001'
  const target = Buffer.from(JSON.stringify({ companies: [{ id: company }], users: [], departments: [], modules: [],
    roles: ['stage-reader', 'stage-mail', 'superadmin'].map(role_key => ({ role_key })) }))
  const source = Buffer.from(JSON.stringify(state)), manifest = { format: 'infraflow-core-sync-manifest-v1', revision: 1, companyId: company,
    snapshots: { sourceSha256: fingerprint(source), targetSha256: fingerprint(target) }, mappings: {
      users: state.users.map(u => ({ source: u.id, target: u.id })), departments: [], modules: [],
      roles: ['stage-reader', 'stage-mail', 'superadmin'].map(r => ({ source: r, target: r })) } }
  const stage = createIntegratedStage(source, target, manifest, key), run = crypto.randomUUID()
  const store = createSyntheticStageStore({ database: f.database, sql: f.sql, allowSyntheticStaging: true })
  store.initialize(); store.apply(run, stage, target, manifest, key); store.materialize(run, target, manifest, key)
  assert.equal(store.reconcileMaterialized(run, target, manifest, key).usersCompared, 2)
  const persisted = JSON.parse(f.sql(`SELECT payload FROM dbo.synthetic_stage_runs WHERE run_id='${run}';`))
  const bytes = openCoreSnapshot(persisted.capsule, target, manifest, key)
  let rebuilt
  try { rebuilt = JSON.parse(bytes.toString('utf8')) } finally { bytes.fill(0); key.fill(0) }
  const policyRows = JSON.parse(f.sql(`SELECT section,entry_key [key],payload FROM dbo.synthetic_stage_policies WHERE run_id='${run}' FOR JSON PATH;`))
  const context = decodePolicyContext({ format: stage.policy.format, rows: policyRows })
  rebuilt.settings = { ...rebuilt.settings, ...context.settings }; rebuilt.departments = context.departments
  const users = JSON.parse(f.sql(`SELECT CONVERT(nvarchar(36),u.user_id) id,u.primary_role primaryRole,
    JSON_QUERY(COALESCE((SELECT role_key roleKey,position FROM dbo.synthetic_stage_roles r WHERE r.run_id=u.run_id AND r.user_id=u.user_id ORDER BY position FOR JSON PATH),N'[]')) links
    FROM dbo.synthetic_stage_users u WHERE run_id='${run}' FOR JSON PATH;`))
  const catalog = new Set(JSON.parse(target.toString()).roles.map(r => r.role_key))
  rebuilt.users = rebuilt.users.map(u => { const row = users.find(r => r.id.toLowerCase() === u.id.toLowerCase()); assert.ok(row); return { ...u, ...decodeRoleLinks(row.primaryRole, row.links, catalog) } })
  fs.writeFileSync(seed, JSON.stringify(rebuilt)) // Synthetic credentials only, isolated temporary seed.
  const listener = net.createServer(); await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve))
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve))
  const origin = `http://127.0.0.1:${port}/api`
  const env = { ...process.env, NODE_ENV: 'test', APP_KEY: crypto.randomBytes(32).toString('hex'),
    INFRAFLOW_TEST_AUTH_CLOCK_FILE: clockFile,
    INFRAFLOW_DB_PROVIDER: 'mssql', DB_MODE: 'mssql', DB_SERVER: '.\\SQLEXPRESS', DB_DATABASE: f.database,
    DB_TRUSTED_CONNECTION: 'true', DB_ENCRYPT: 'false', INFRAFLOW_DB_FILE: seed, INFRAFLOW_SEED_FILE: seed,
    INFRAFLOW_SQL_RELATIONAL: '0', MSSQL_RELATIONAL: '0', INFRAFLOW_DISABLE_APP_STATE_RECOVERY: '1',
    INFRAFLOW_SCHEDULER_DISABLED: '1', INFRAFLOW_AUDIT_SMOKE: 'true', HOST: '127.0.0.1', INFRAFLOW_HOST: '127.0.0.1', PORT: String(port), INFRAFLOW_PORT: String(port) }
  let attachment, attachmentBytes, recoveryBackup, keyFile
  if (recovery) {
    keyFile = path.join(runtimeRoot, 'runtime/app.key')
    fs.mkdirSync(path.dirname(keyFile), { recursive: true })
    fs.writeFileSync(keyFile, env.APP_KEY, { mode: 0o600 })
    delete env.APP_KEY // Exercise loading the recovered runtime/app.key, not inherited key.
    attachment = path.join(runtimeRoot, 'storage/document-templates/TEST/recovery.txt')
    attachmentBytes = Buffer.from('Synthetic recovery attachment ' + crypto.randomUUID())
    fs.mkdirSync(path.dirname(attachment), { recursive: true }); fs.writeFileSync(attachment, attachmentBytes)
    f.sql(`UPDATE documents.document_types SET fisier_model_path=N'document-templates/TEST/recovery.txt',fisier_model_name=N'recovery.txt' WHERE id=N'TEST';`)
  }
  let child, checks = 0
  async function stop() {
    if (!child || child.exitCode !== null || child.signalCode !== null) return
    const done = new Promise(resolve => child.once('exit', resolve)); child.kill(); await done
  }
  async function start() {
    child = spawn(process.execPath, ['--require', path.join(__dirname, 'support/auth-clock-preload.js'), path.join(runtimeRoot, 'server/app.js')], { cwd: runtimeRoot, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.on('data', () => {}); child.stderr.on('data', () => {})
    const deadline = Date.now() + 240000
    while (Date.now() < deadline && child.exitCode === null) {
      try { if ((await fetch(origin + '/health', { headers: { Connection: 'close' }, signal: AbortSignal.timeout(1000) })).ok) return } catch {}
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    assert.fail('Serverul sintetic nu a devenit disponibil.')
  }
  async function request(url, token, method = 'GET', body, expected = 200) {
    const res = await fetch(origin + url, { method, headers: { 'Content-Type': 'application/json', Connection: 'close', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(120000) })
    assert.equal(res.status, expected, `${method} ${url}`); checks++
    console.log(`Context reconstruit HTTP: ${checks} cereri verificate`)
    return res.json()
  }
  const login = name => request('/login', null, 'POST', { username: name, password })
  try {
    await start()
    const health = await request('/system/health'); assert.equal(health.database, f.database)
    await request('/session', null, 'GET', undefined, 401)
    await request('/login', null, 'POST', { username: 'stage_reader', password: 'wrong' }, 401)
    let reader = (await login('stage_reader')).token
    const admin = (await login('stage_admin')).token
    assert.ok(reader); assert.ok(admin)
    const session = await request('/session', reader)
    assert.ok(session.permissions.includes('documents:view_own')); assert.ok(session.permissions.includes('messaging:view'))
    assert.equal(session.user.passwordHash, undefined)
    await request(`/documents/${f.uuids[1]}`, reader)
    for (const suffix of ['', '/audit', '/pdf']) await request(`/documents/${f.uuids[2]}${suffix}`, reader, 'GET', undefined, 403)
    await request('/messaging/email/inbox', reader)
    setClock(16 * 60000)
    const idle = await request(`/documents/${f.uuids[1]}`, reader, 'GET', undefined, 401)
    assert.match(idle.error, /inactivit/)
    setClock(0); await request('/session', reader, 'GET', undefined, 401)
    reader = (await login('stage_reader')).token
    for (const minutes of [10, 20, 30, 40, 50]) { setClock(minutes * 60000); await request('/session', reader) }
    setClock(61 * 60000)
    const absolute = await request('/session', reader, 'GET', undefined, 401)
    assert.ok(!absolute.error.includes('inactivit'))
    setClock(0); await request('/session', reader, 'GET', undefined, 401)
    const nearExpiry = Date.parse(state.users[0].demoAccessExpiresAt) - Date.now() - 5 * 60000
    setClock(nearExpiry); const demoToken = (await login('stage_reader')).token
    await request('/session', demoToken)
    setClock(nearExpiry + 10 * 60000)
    const expired = await request(`/documents/${f.uuids[1]}`, demoToken, 'GET', undefined, 401)
    assert.match(expired.error, /Demo a expirat/)
    await request('/login', null, 'POST', { username: 'stage_reader', password }, 403)
    setClock(0); await request('/session', demoToken, 'GET', undefined, 401)
    reader = (await login('stage_reader')).token
    await request('/roles/stage-reader/permissions', admin, 'PATCH', { permissions: [] })
    await request(`/documents/${f.uuids[1]}`, reader, 'GET', undefined, 403)
    await request('/messaging/email/inbox', reader) // Secondary role remains effective.
    await request('/logout', reader, 'POST', {})
    await request('/session', reader, 'GET', undefined, 401)
    const next = (await login('stage_reader')).token
    await request(`/users/${f.users.reader}`, admin, 'PATCH', { active: false })
    await request('/session', next, 'GET', undefined, 401)
    await request('/auth/2fa/setup', reader, 'POST', {}, 401)
    const setup = await request('/auth/2fa/setup', admin, 'POST', {})
    const otp = () => totpCode(setup.secret, Math.floor(Date.now() / 30000))
    await request('/auth/2fa/confirm', admin, 'POST', { setupToken: setup.setupToken, code: 'invalid' }, 400)
    const enrolled = await request('/auth/2fa/confirm', admin, 'POST', { setupToken: setup.setupToken, code: otp() })
    assert.equal(enrolled.recoveryCodes.length, 10)
    const challenge = () => request('/login', null, 'POST', { username: 'stage_admin', password }, 202)
    const pending = await challenge(); assert.equal(pending.token, undefined)
    await request('/login/2fa', null, 'POST', { challengeToken: pending.challengeToken, code: 'invalid' }, 401)
    const recovered = await request('/login/2fa', null, 'POST', { challengeToken: pending.challengeToken, code: enrolled.recoveryCodes[0] })
    assert.ok(recovered.token)
    await request('/login/2fa', null, 'POST', { challengeToken: pending.challengeToken, code: otp() }, 401)
    const expiredChallenge = await challenge()
    setClock(6 * 60000)
    await request('/login/2fa', null, 'POST', { challengeToken: expiredChallenge.challengeToken, code: 'invalid' }, 401)
    setClock(0)
    if (recovery) {
      // Copy only synthetic storage/key files and backup only the allowlisted test DB.
      assert.match(f.database, /^INFRAFLOW_TEST_DOCS_[A-F0-9]{12}$/)
      const backupDir = path.join(dir, 'recovery-copy'); fs.mkdirSync(backupDir)
      fs.copyFileSync(attachment, path.join(backupDir, 'attachment.txt'))
      fs.copyFileSync(keyFile, path.join(backupDir, 'app.key'))
      recoveryBackup = f.sql(`SELECT CONVERT(nvarchar(4000),SERVERPROPERTY('InstanceDefaultBackupPath')) + N'\\${f.database}-recovery.bak';`).trim()
      assert.ok(recoveryBackup.endsWith(`${f.database}-recovery.bak`))
      const escaped = recoveryBackup.replace(/'/g, "''")
      await stop()
      f.sql(`BACKUP DATABASE [${f.database}] TO DISK=N'${escaped}' WITH INIT,CHECKSUM;
        RESTORE VERIFYONLY FROM DISK=N'${escaped}' WITH CHECKSUM;`)
      f.sql(`UPDATE dbo.app_state SET data=N'{}'; UPDATE documents.document_types SET fisier_model_path=NULL WHERE id=N'TEST';`)
      fs.writeFileSync(attachment, 'damaged synthetic attachment'); fs.writeFileSync(keyFile, 'damaged synthetic key')
      const began = Date.now()
      f.sql(`USE master; ALTER DATABASE [${f.database}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
        BEGIN TRY
          RESTORE DATABASE [${f.database}] FROM DISK=N'${escaped}' WITH REPLACE,RECOVERY,CHECKSUM;
          ALTER DATABASE [${f.database}] SET MULTI_USER;
        END TRY BEGIN CATCH ALTER DATABASE [${f.database}] SET MULTI_USER; THROW; END CATCH;`)
      fs.copyFileSync(path.join(backupDir, 'attachment.txt'), attachment)
      fs.copyFileSync(path.join(backupDir, 'app.key'), keyFile)
      assert.equal(fs.readFileSync(attachment).equals(attachmentBytes), true)
      console.log(`Recuperare SQL/storage/APP_KEY sintetică: ${Date.now() - began} ms înainte de pornire.`)
    } else await stop()
    await start()
    await request('/session', admin, 'GET', undefined, 401) // Sessions are in-memory, not restored.
    await request('/login', null, 'POST', { username: 'stage_reader', password }, 401)
    const persistedChallenge = await challenge()
    await request('/login/2fa', null, 'POST', { challengeToken: persistedChallenge.challengeToken, code: enrolled.recoveryCodes[0] }, 401)
    const after = (await request('/login/2fa', null, 'POST', { challengeToken: persistedChallenge.challengeToken, code: otp() })).token
    const factorStatus = await request('/auth/2fa/status', after)
    assert.equal(factorStatus.enabled, true)
    assert.equal(factorStatus.recoveryCodesRemaining, 9)
    const list = await request('/users', after)
    assert.equal(list.users.find(u => u.id === f.users.reader).active, false)
    if (recovery) {
      const download = await fetch(origin + '/documents/templates/TEST/download-model', {
        headers: { Authorization: `Bearer ${after}`, Connection: 'close' }, signal: AbortSignal.timeout(30000) })
      assert.equal(download.status, 200)
      assert.equal(Buffer.from(await download.arrayBuffer()).equals(attachmentBytes), true)
      checks++
      console.log('Atașament sintetic recuperat și descărcat autorizat, conținut identic.')
    }
    console.log(`Context reconstruit app.js OK: ${checks} cereri, două porniri, ${f.database}; MSSQL app_state standard, fără adaptor/VM.`)
  } finally { await stop(); setClock(0) }
})
