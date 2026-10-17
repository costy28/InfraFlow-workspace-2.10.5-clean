// Browser rendering against a temporary build; all API traffic is mocked.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { chromium } = require(process.env.INFRAFLOW_PLAYWRIGHT_MODULE || 'playwright')
const dist = path.resolve(__dirname, '../client/dist')
const output = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'infraflow-permissions-ui-'))
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  const requested = path.resolve(dist, '.' + pathname)
  if (!requested.startsWith(dist + path.sep) && requested !== dist) { res.writeHead(403); return res.end() }
  const file = fs.existsSync(requested) && fs.statSync(requested).isFile() ? requested : path.join(dist, 'index.html')
  const types = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream')
  fs.createReadStream(file).pipe(res)
})
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  let browser
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    for (const [name, permissions] of [['own', ['hr:timesheet', 'hr:view_own']], ['viewer', ['hr:view']], ['reader', ['hr:timesheets_view']], ['admin-restricted', ['hr:timesheet', 'hr:view_own']]]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
      await context.addInitScript(() => localStorage.setItem('infraflow_token', 'ui-test-only'))
      const calls = []
      const month = new Date().toISOString().slice(0, 7)
      await context.route('**/api/**', async route => {
        const p = new URL(route.request().url()).pathname
        calls.push(p)
        let data = []
        if (p === '/api/session') data = { user: { id: name, username: name, role: name === 'admin-restricted' ? 'admin' : 'limited', permissions } }
        else if (p === '/api/settings') data = { settings: { company_name: 'Test permisiuni', modules_enabled: [] } }
        else if (p === '/api/notifications') data = { notifications: [], summary: { total: 0 } }
        else if (p === '/api/hr/stats') data = {}
        else if (p === '/api/hr/employees') data = [{ id: 1, user_id: name, nume: 'Angajat test', activ: true }]
        else if (p === '/api/hr/timesheets/monthly-sheet') data = [{ employee_id: 1, nume: 'Angajat test', zile: { [`${month}-01`]: 8, [`${month}-02`]: 8 }, validated_days: [`${month}-01`] }]
        else if (p === '/api/hr/timesheets/lock') data = { locked: false, can_manage: false }
        else if (p === '/api/hr/country-rules') data = { current: null }
        else if (p === '/api/hr/document-templates') data = { templates: [] }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
      })
      const page = await context.newPage()
      await page.goto(base + '/hr')
      await page.waitForSelector('.hr-navigation')
      const nav = await page.locator('.hr-navigation').innerText()
      if (name === 'own' || name === 'admin-restricted') { assert.ok(nav.includes('Pontaj')); assert.ok(!nav.includes('Dashboard HR')); assert.ok(!nav.includes('Angajați')); assert.ok(!nav.includes('Echipamente')); assert.ok(!nav.includes('Documente HR')) }
      if (name === 'own' || name === 'admin-restricted') {
        await page.getByTitle('Pontaj validat. Devalidează ziua înainte de modificare.').waitFor()
        assert.equal(await page.getByTitle('Pontaj validat. Devalidează ziua înainte de modificare.').isDisabled(), true)
        assert.equal(await page.getByTitle(`Editeaza Angajat test - ${month}-02`, { exact: true }).isEnabled(), true)
        assert.equal(await page.getByRole('button', { name: /Validează luna/ }).count(), 0)
      }
      assert.ok(!nav.includes('Inbox HR'))
      assert.equal(await page.getByText('Flux simplu HR', { exact: true }).count(), 0)
      assert.equal(await page.getByText('Asistent HR', { exact: true }).count(), 0)
      assert.equal(await page.getByRole('button', { name: /Angajat nou/ }).count(), 0)
      if (name === 'reader') {
        assert.equal(await page.getByRole('button', { name: /Export Nexus/ }).count(), 0)
        assert.equal(await page.getByRole('button', { name: /Completeaza zilele lucratoare/ }).count(), 0)
        assert.equal(await page.getByRole('button', { name: /Validează luna/ }).count(), 0)
      }
      assert.ok(!calls.includes('/api/hr/reges/history'))
      assert.ok(!calls.includes('/api/hr/linkable-users'))
      assert.equal(await page.locator('a[href="/crm"]').count(), 0)
      await page.evaluate(() => sessionStorage.setItem('infraflow_workspace_tabs_v1', JSON.stringify([
        { label: 'Ofertă recentă restricționată', url: '/crm/oferte/7' },
        { label: 'Pontaj recent permis', url: '/hr?section=pontaj' },
      ])))
      await page.getByRole('button', { name: 'Caută în InfraFlow', exact: true }).click()
      const search = page.getByRole('dialog', { name: 'Caută în InfraFlow' })
      assert.equal(await search.getByText('Ofertă recentă restricționată', { exact: true }).count(), 0)
      assert.equal(await search.getByText('Pontaj recent permis', { exact: true }).count(), 1)
      await page.getByRole('textbox', { name: 'Căutare globală' }).fill('CRM')
      assert.equal(await search.getByRole('button', { name: /CRM|Ofertă recentă/ }).count(), 0)
      await page.getByRole('button', { name: 'Închide căutarea' }).click()
      await page.screenshot({ path: path.join(output, `${name}-hr.png`), fullPage: true })
      {
        await page.goto(base + '/crm/oferte')
        await page.getByText('Acces restricționat', { exact: true }).waitFor()
        assert.ok(!calls.some(p => p.startsWith('/api/crm/')))
        await page.screenshot({ path: path.join(output, `${name}-crm-denied.png`), fullPage: true })
      }
      await context.close()
    }
    for (const [name, role, permissions, canManage] of [
      ['admin-module-reader', 'admin', ['documents:view_own', 'messaging:view'], false],
      ['delegated-module-manager', 'limited', ['documents:templates', 'messaging:view', 'messaging:admin'], true],
      ['document-creator', 'limited', ['documents:view_own', 'documents:create', 'messaging:view'], false],
      ['document-approver', 'limited', ['documents:view_own', 'documents:approve', 'messaging:view'], false],
      ['document-no-email', 'limited', ['documents:view_own'], false],
      ['message-sender', 'limited', ['documents:view_own', 'messaging:view', 'messaging:send'], false],
    ]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
      await context.addInitScript(() => localStorage.setItem('infraflow_token', 'ui-test-only'))
      const testDocument = { id: 901, uuid: 'ui-document', titlu: 'Document verificare circuit', nr_document: 'UI-901', status: 'in_circuit', creat_de: name, prioritate: 'normal' }
      testDocument.date_json = JSON.stringify({ source_type: 'email', source_id: 'ui-email', email_subject: 'Sursă email test' })
      const calls = []
      const emailWrites = []
      await context.route('**/api/**', async route => {
        const p = new URL(route.request().url()).pathname
        calls.push(p)
        if (p.startsWith('/api/messaging/email/') && route.request().method() !== 'GET') emailWrites.push(p)
        let data = []
        if (p === '/api/session') data = { user: { id: name, username: name, role, permissions } }
        else if (p === '/api/settings') data = { settings: { company_name: 'Test drepturi', modules_enabled: [] } }
        else if (p === '/api/notifications') data = { notifications: [], summary: { total: 0 } }
        else if (p === '/api/documents/templates') data = { templates: [] }
        else if (p === '/api/documents' || p === '/api/documents/inbox') data = { documents: [testDocument] }
        else if (p === '/api/documents/ui-document') data = { document: testDocument, steps: [{ id: 1, nr_pas: 1, status: 'asteptare', user_responsabil: name, tip: 'aprobare' }], audit: [] }
        else if (p === '/api/messaging/channels') data = { channels: [{ id: 1, nume: 'General', tip: 'public', readonly: false }] }
        else if (p === '/api/messaging/email/inbox') data = { emails: [{ id: 910, subject: 'Email test UI', direction: 'inbound', status: 'unread', category: 'general', body: 'Conținut verificare' }], stats: { total: 1, unread: 1 }, categories: [] }
        else if (p.endsWith('/messages')) data = { messages: [] }
        else if (p.endsWith('/members')) data = { members: [] }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
      })
      const page = await context.newPage()
      await page.goto(base + '/documente' + (canManage ? '' : '?document=ui-document'))
      await page.getByRole('main').getByRole('heading', { name: 'Documente', exact: true }).waitFor()
      assert.equal(await page.getByRole('button', { name: '+ Document nou', exact: true }).count(), permissions.includes('documents:create') ? 1 : 0)
      assert.equal(await page.getByRole('button', { name: 'Template-uri', exact: true }).count(), canManage ? 1 : 0)
      assert.equal(await page.getByRole('button', { name: 'Inbox', exact: true }).count(), permissions.includes('documents:approve') ? 1 : 0)
      if (canManage) await page.getByRole('button', { name: 'Template-uri', exact: true }).click()
      if (canManage) await page.getByRole('button', { name: '+ Template nou', exact: true }).waitFor()
      assert.equal(await page.getByRole('button', { name: '+ Template nou', exact: true }).count(), canManage ? 1 : 0)
      if (!canManage) {
        await page.getByText('Pas 1:', { exact: false }).first().waitFor()
        assert.equal(await page.getByRole('button', { name: 'Respinge', exact: true }).count(), permissions.includes('documents:approve') ? 1 : 0)
      }
      await page.screenshot({ path: path.join(output, `${name}-documents.png`), fullPage: true })
      if (!permissions.includes('messaging:view')) {
        await page.getByText('Nu ai drept de consultare a mesajelor.', { exact: true }).waitFor()
        assert.equal(await page.getByRole('button', { name: 'Deschide Inbox', exact: true }).count(), 0)
        assert.ok(!calls.includes('/api/messaging/email/links'))
        await page.goto(base + '/mesaje')
        await page.getByText('Acces restricționat', { exact: true }).waitFor()
        await context.close()
        continue
      }
      await page.goto(base + '/mesaje')
      await page.getByText('#General', { exact: true }).first().waitFor()
      assert.equal(await page.getByTitle('Canal nou', { exact: true }).count(), canManage ? 1 : 0)
      await page.getByText('#General', { exact: true }).first().click()
      assert.equal(await page.getByPlaceholder(/Scrie în #General/).count(), permissions.includes('messaging:send') ? 1 : 0)
      await page.screenshot({ path: path.join(output, `${name}-messaging.png`), fullPage: true })
      await page.getByRole('button', { name: /^Inbox ERP/ }).click()
      await page.getByRole('button', { name: 'Email nou', exact: true }).waitFor()
      assert.equal(await page.getByRole('button', { name: 'Email nou', exact: true }).isEnabled(), permissions.includes('messaging:send'))
      assert.equal(await page.getByRole('button', { name: 'Sincronizează inbox', exact: true }).isEnabled(), permissions.includes('messaging:send'))
      await page.getByRole('button', { name: 'Deschide', exact: true }).first().click()
      await page.getByText('Detalii email', { exact: true }).waitFor()
      assert.equal(await page.getByRole('button', { name: 'Răspunde', exact: true }).last().isEnabled(), permissions.includes('messaging:send'))
      if (!permissions.includes('messaging:send')) assert.deepEqual(emailWrites, [])
      await page.screenshot({ path: path.join(output, `${name}-email.png`), fullPage: true })
      await context.close()
    }
    console.log(`OK: UI HR/navigare pentru patru profiluri; Documente/Mesaje pentru cititor admin, gestionar delegat, creator și aprobator. API simulate. Capturi: ${output}`)
  } finally {
    if (browser) await browser.close()
    await new Promise(resolve => server.close(resolve))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
