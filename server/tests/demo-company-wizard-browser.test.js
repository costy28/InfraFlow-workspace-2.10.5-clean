'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto')
const { spawn } = require('node:child_process')
const { createSyntheticTrialStore } = require('../../scripts/lib/demo-trial-store')
const { ROLE } = require('../../scripts/lib/demo-company-setup')
const { createSyntheticApprovalOrchestrator } = require('../../scripts/lib/demo-approval-orchestrator')
const { createLocalSyntheticInstance } = require('./support/demo-local-instance')
test('Chrome: invitație, parolă, login, wizard, aplicare și mobil', {
  skip: !process.env.INFRAFLOW_PLAYWRIGHT_MODULE, timeout: 180000,
}, async () => {
  const { chromium } = require(process.env.INFRAFLOW_PLAYWRIGHT_MODULE)
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'infraflow-trial-store-')), store = createSyntheticTrialStore(dir)
  const previousEnv = process.env.NODE_ENV; process.env.NODE_ENV = 'test'
  const instance = createLocalSyntheticInstance(dir)
  const dbFile = instance.dbFile, now = Date.now() - 1000
  const trialId = '11111111-1111-4111-8111-111111111111'
  const password = `Synthetic-${crypto.randomBytes(16).toString('hex')}!aA1`
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
    await store.initialize()
    const prepare = createSyntheticApprovalOrchestrator({ store, ensureInstance: instance.ensureInstance })
    const { invitation } = await prepare({ trialId, approvalId: 'wizard-browser', ownerId: 'owner', allowedModules: ['documents'], invitationId: 'browser-invite', now })
    const vitePort = await start('demo-wizard-vite.mjs', { SYNTHETIC_API_ORIGIN: instance.origin })
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const failures = [], urls = []; page.on('pageerror', e => failures.push(e.message)); page.on('request', req => urls.push(req.url()))
    const base = `http://127.0.0.1:${vitePort}/synthetic-demo-setup.html`
    await page.goto(base + '#invite=' + invitation.token)
    await page.getByLabel('Parolă nouă', { exact: true }).waitFor()
    assert.equal(page.url().includes(invitation.token), false)
    const qa = path.resolve(__dirname, '../../installer/output/qa'); await fs.mkdir(qa, { recursive: true })
    await page.screenshot({ path: path.join(qa, 'demo-activation.png'), fullPage: true })
    await page.reload()
    await page.getByRole('heading', { name: 'Redeschide invitația originală' }).waitFor()
    await page.goto(base + '#invite=' + invitation.token)
    await page.getByLabel('Parolă nouă', { exact: true }).fill(password)
    await page.getByLabel('Confirmă parola', { exact: true }).fill('different-password')
    await page.getByRole('button', { name: 'Activează contul de test' }).click()
    await page.getByRole('alert').filter({ hasText: 'Parolele nu coincid' }).waitFor()
    await page.getByLabel('Confirmă parola', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Activează contul de test' }).click()
    await page.getByRole('heading', { name: 'Contul de test a fost activat' }).waitFor()
    const activated = (await store.read()).trials[0]
    assert.equal(activated.expiresAt - activated.activatedAt, 15 * 86400000)
    assert.equal(await page.evaluate(token => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }).includes(token), invitation.token), false)
    assert.equal(urls.some(url => url.includes(invitation.token)), false)
    await page.getByRole('button', { name: 'Continuă la autentificare' }).click()
    await page.getByLabel('Utilizator', { exact: true }).fill('owner')
    await page.getByLabel('Parolă', { exact: true }).fill('wrong-password')
    await page.getByRole('button', { name: 'Autentificare', exact: true }).click()
    await page.getByRole('alert').waitFor()
    await page.getByLabel('Parolă', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Autentificare', exact: true }).click()
    await page.getByLabel('Numele companiei').waitFor()
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
    const conflictResponse = page.waitForResponse(r => r.url().endsWith('/api/demo-company/setup') && r.request().method() === 'PATCH')
    await page.getByRole('button', { name: 'Salvează și continuă' }).click()
    const conflict = await conflictResponse
    assert.equal(conflict.status(), 409, 'concurrent setup change must return conflict')
    assert.equal((await conflict.json()).code, 'revision_conflict')
    await page.getByRole('alert').filter({ hasText: 'Configurația s-a schimbat' }).waitFor()
    await page.getByRole('button', { name: 'Reîncarcă progresul' }).click()
    await page.getByRole('button', { name: 'Confirmă configurația de test' }).waitFor()
    await page.setViewportSize({ width: 390, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.screenshot({ path: path.join(qa, 'demo-wizard-mobile.png'), fullPage: true })
    await page.getByRole('button', { name: 'Confirmă configurația de test' }).click()
    await page.getByRole('heading', { name: 'Configurația de test a fost salvată' }).waitFor()
    const trial = (await store.read()).trials[0]
    assert.ok(trial.setup.completedAt); assert.equal(trial.expiresAt, activated.expiresAt)
    assert.deepEqual(trial.setup.modules, ['documents']); assert.deepEqual(failures, [])
    await page.reload(); await page.getByRole('heading', { name: 'Configurația de test a fost salvată' }).waitFor()
    await page.getByRole('button', { name: 'Aplică în ERP-ul de test' }).click()
    await page.getByRole('heading', { name: 'Configurația a fost aplicată în ERP-ul de test' }).waitFor()
    const refreshed = page.waitForResponse(r => r.url().endsWith('/api/demo-company/setup') && r.request().method() === 'GET')
    await page.reload()
    const refreshedResponse = await refreshed
    assert.equal(refreshedResponse.status(), 200, 'setup after application refresh')
    assert.ok((await refreshedResponse.json()).application, 'application receipt survives refresh')
    await page.getByRole('heading', { name: 'Configurația a fost aplicată în ERP-ul de test' }).waitFor()
    const erp = JSON.parse(await fs.readFile(dbFile, 'utf8'))
    assert.equal(erp.settings.companyName, 'Companie actualizată')
    assert.equal(erp.audit.filter(a => a.action === 'demo_company_setup_applied').length, 1)
    assert.equal(erp.audit.filter(a => a.action === 'demo_trial_activated').length, 1)
    const replay = await browser.newPage()
    await replay.goto(base + '#invite=' + invitation.token)
    await replay.getByLabel('Parolă nouă', { exact: true }).fill(password)
    await replay.getByLabel('Confirmă parola', { exact: true }).fill(password)
    const rejectedInvitation = replay.waitForResponse(r => r.url().endsWith('/api/demo-company/activate') && r.request().method() === 'POST')
    await replay.getByRole('button', { name: 'Activează contul de test' }).click()
    const rejectedResponse = await rejectedInvitation
    assert.equal(rejectedResponse.status(), 401, 'consumed invitation must be rejected')
    assert.equal((await rejectedResponse.json()).code, 'invitation_invalid')
    await replay.getByRole('alert').filter({ hasText: 'Invitația este invalidă, expirată sau deja folosită' }).waitFor()
    assert.equal((await store.read()).trials[0].expiresAt, activated.expiresAt)
    await replay.close()
    await store.command({ trialId, commandId: 'expire-browser', action: 'expire', expectedRevision: trial.revision, now: trial.expiresAt, actor: { id: 'worker', kind: 'worker' } })
    await page.reload(); await page.getByRole('alert').filter({ hasText: 'Trialul nu mai este activ' }).waitFor()
    console.log('Chrome: invitație în fragment eliminat din URL, activare unică, login real, wizard/aplicare, replay refuzat și termen păstrat.')
  } finally {
    if (browser) await browser.close()
    await instance.stop()
    for (const child of processes.reverse()) if (child.exitCode === null && child.signalCode === null) {
      const done = new Promise(resolve => child.once('exit', resolve)); child.send('stop'); await done
    }
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir())); assert.ok(path.basename(dir).startsWith('infraflow-trial-store-'))
    await fs.rm(dir, { recursive: true, force: true })
    if (previousEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousEnv
  }
})
