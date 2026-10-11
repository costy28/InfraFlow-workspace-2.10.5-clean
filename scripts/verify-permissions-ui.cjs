// Browser rendering against a temporary build; all API traffic is mocked.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { chromium } = require(process.env.INFRAFLOW_PLAYWRIGHT_MODULE || 'playwright')
const dist = path.resolve(__dirname, '../client/.permission-build-check-3')
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
    for (const [name, permissions] of [['own', ['hr:timesheet', 'hr:view_own']], ['viewer', ['hr:view']], ['reader', ['hr:timesheets_view']]]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
      await context.addInitScript(() => localStorage.setItem('infraflow_token', 'ui-test-only'))
      const calls = []
      await context.route('**/api/**', async route => {
        const p = new URL(route.request().url()).pathname
        calls.push(p)
        let data = []
        if (p === '/api/session') data = { user: { id: name, username: name, role: 'limited', permissions } }
        else if (p === '/api/settings') data = { settings: { company_name: 'Test permisiuni', modules_enabled: [] } }
        else if (p === '/api/notifications') data = { notifications: [], summary: { total: 0 } }
        else if (p === '/api/hr/stats') data = {}
        else if (p === '/api/hr/country-rules') data = { current: null }
        else if (p === '/api/hr/document-templates') data = { templates: [] }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
      })
      const page = await context.newPage()
      await page.goto(base + '/hr')
      await page.waitForSelector('.hr-navigation')
      const nav = await page.locator('.hr-navigation').innerText()
      if (name === 'own') { assert.ok(nav.includes('Pontaj')); assert.ok(!nav.includes('Dashboard HR')); assert.ok(!nav.includes('Angajați')) }
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
      await page.screenshot({ path: path.join(output, `${name}-hr.png`), fullPage: true })
      await page.goto(base + '/crm/oferte')
      await page.getByText('Acces restricționat', { exact: true }).waitFor()
      assert.ok(!calls.some(p => p.startsWith('/api/crm/')))
      await page.screenshot({ path: path.join(output, `${name}-crm-denied.png`), fullPage: true })
      await context.close()
    }
    console.log(`OK: UI pentru trei roluri restrictive, HR filtrat, pontaj read-only fără acțiuni de scriere/export Nexus, CRM blocat. API simulate. Capturi: ${output}`)
  } finally {
    if (browser) await browser.close()
    await new Promise(resolve => server.close(resolve))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
