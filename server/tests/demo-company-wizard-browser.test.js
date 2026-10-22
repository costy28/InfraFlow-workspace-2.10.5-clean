'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto')
const { spawn } = require('node:child_process')
const { createSyntheticTrialStore } = require('../../scripts/lib/demo-trial-store')
const { ROLE, companyRole } = require('../../scripts/lib/demo-company-setup')
test('wizard în Chrome: profil, module, reluare, confirmare și mobil', {
  skip: !process.env.INFRAFLOW_PLAYWRIGHT_MODULE, timeout: 180000,
}, async () => {
  const { chromium } = require(process.env.INFRAFLOW_PLAYWRIGHT_MODULE)
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'infraflow-trial-store-')), store = createSyntheticTrialStore(dir)
  const dbFile = path.join(dir, 'synthetic-db.json'), now = Date.now() - 1000
  const trialId = '11111111-1111-4111-8111-111111111111'
  const password = `Synthetic-${crypto.randomBytes(16).toString('hex')}!aA1`, salt = crypto.randomBytes(16).toString('hex')
  const passwordHash = `scrypt:${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`
  const processes = []; let browser
  async function start(file, env) {
    const child = spawn(process.execPath, [path.join(__dirname, 'support', file)], { windowsHide: true,
      cwd: file.endsWith('.mjs') ? path.resolve(__dirname, '../../client') : path.resolve(__dirname, '../..'),
      env: { ...process.env, NODE_ENV: 'test', ...env }, stdio: ['ignore','pipe','pipe','ipc'] })
    processes.push(child); child.stdout.on('data', () => {}); child.stderr.on('data', () => {})
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Preview startup timeout')), 45000)
      child.once('message', msg => { clearTimeout(timer); resolve(msg.port) })
      child.once('error', e => { clearTimeout(timer); reject(e) })
      child.once('exit', () => { clearTimeout(timer); reject(Error('Preview exited')) })
    })
  }
  try {
    await fs.writeFile(dbFile, JSON.stringify({ settings: { setupCompleted: true, networkAccessMode: 'open',
      license: { plan: 'internal', modules: ['all'], maxDevices: 20 }, modules_enabled: ['documents'], customRoles: [companyRole()] },
      users: [{ id: 'owner', username: 'owner', name: 'Synthetic owner', role: ROLE, active: true, passwordHash }], devices: [], departments: [], audit: [] }))
    await store.initialize(); await store.queue({ id: trialId, approvalId: 'wizard-browser', now })
    for (const action of ['provision','ready','activate']) {
      const trial = (await store.read()).trials[0]
      await store.command({ trialId, commandId: action, action, expectedRevision: trial.revision, now,
        actor: { id: 'service', kind: action === 'activate' ? 'activation_agent' : 'worker' } })
    }
    await store.bindSetup({ trialId, ownerId: 'owner', allowedModules: ['documents'] })
    const apiPort = await start('demo-setup-http-server.js', { APP_KEY: crypto.randomBytes(32).toString('hex'), INFRAFLOW_DB_PROVIDER: 'json', DB_MODE: 'json',
      INFRAFLOW_DB_FILE: dbFile, INFRAFLOW_SEED_FILE: dbFile, SYNTHETIC_STORE_DIR: dir, SYNTHETIC_TRIAL_ID: trialId })
    const vitePort = await start('demo-wizard-vite.mjs', { SYNTHETIC_API_ORIGIN: `http://127.0.0.1:${apiPort}` })
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const failures = []; page.on('pageerror', e => failures.push(e.message))
    await page.goto(`http://127.0.0.1:${vitePort}/synthetic-demo-setup.html`)
    await page.getByLabel('Utilizator', { exact: true }).fill('owner')
    await page.getByLabel('Parolă', { exact: true }).fill('wrong-password')
    await page.getByRole('button', { name: 'Autentificare', exact: true }).click()
    await page.getByRole('alert').waitFor()
    await page.getByLabel('Parolă', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Autentificare', exact: true }).click()
    await page.getByLabel('Numele companiei').waitFor()
    const qa = path.resolve(__dirname, '../../installer/output/qa'); await fs.mkdir(qa, { recursive: true })
    await page.screenshot({ path: path.join(qa, 'demo-wizard-profile.png'), fullPage: true })
    await page.getByLabel('Numele companiei').fill('Companie de test')
    await page.getByRole('button', { name: 'Salvează și continuă' }).click()
    await page.getByRole('checkbox', { name: 'Documente', exact: true }).check()
    await page.getByRole('button', { name: 'Salvează și continuă' }).click()
    await page.getByRole('button', { name: 'Confirmă configurația de test' }).waitFor()
    await page.reload()
    await page.getByRole('button', { name: 'Confirmă configurația de test' }).waitFor()
    const beforeConflict = (await store.read()).trials[0]
    await store.configureSetup({ trialId, user: { id: 'owner', role: ROLE, active: true }, now: Date.now(),
      command: { step: 'profile', input: { ...beforeConflict.setup.profile, companyName: 'Companie actualizată' }, expectedRevision: beforeConflict.setup.revision } })
    await page.getByRole('button', { name: 'Înapoi', exact: true }).click()
    assert.equal(await page.getByRole('checkbox', { name: 'Documente', exact: true }).isChecked(), true)
    await page.getByRole('button', { name: 'Salvează și continuă' }).click()
    await page.getByRole('alert').filter({ hasText: 'Configurația s-a schimbat' }).waitFor()
    await page.getByRole('button', { name: 'Reîncarcă progresul' }).click()
    await page.getByRole('button', { name: 'Confirmă configurația de test' }).waitFor()
    await page.setViewportSize({ width: 390, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.screenshot({ path: path.join(qa, 'demo-wizard-mobile.png'), fullPage: true })
    await page.getByRole('button', { name: 'Confirmă configurația de test' }).click()
    await page.getByRole('heading', { name: 'Configurația de test a fost salvată' }).waitFor()
    const trial = (await store.read()).trials[0]
    assert.ok(trial.setup.completedAt); assert.equal(trial.expiresAt, now + 15 * 86400000)
    assert.deepEqual(trial.setup.modules, ['documents']); assert.deepEqual(failures, [])
    await page.reload(); await page.getByRole('heading', { name: 'Configurația de test a fost salvată' }).waitFor()
    await store.command({ trialId, commandId: 'expire-browser', action: 'expire', expectedRevision: trial.revision, now: trial.expiresAt, actor: { id: 'worker', kind: 'worker' } })
    await page.reload(); await page.getByRole('alert').filter({ hasText: 'Trialul nu mai este activ' }).waitFor()
    console.log('Wizard Chrome: login real, pași salvați, reluare, conflict de revizie, expirare și mobil fără overflow.')
  } finally {
    if (browser) await browser.close()
    for (const child of processes.reverse()) if (child.exitCode === null && child.signalCode === null) {
      const done = new Promise(resolve => child.once('exit', resolve)); child.send('stop'); await done
    }
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir())); assert.ok(path.basename(dir).startsWith('infraflow-trial-store-'))
    await fs.rm(dir, { recursive: true, force: true })
  }
})
