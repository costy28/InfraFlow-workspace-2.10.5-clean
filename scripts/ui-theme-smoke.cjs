/* Read-only visual smoke: all API requests are intercepted; no real account or DB. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.INFRAFLOW_PLAYWRIGHT_MODULE || 'playwright')
const url = process.env.INFRAFLOW_UI_URL || 'http://127.0.0.1:5175'
const output = process.env.INFRAFLOW_UI_OUTPUT || path.join(require('node:os').tmpdir(), 'infraflow-theme-smoke')
const user = { username: 'theme-test', name: 'Administrator test UI', role: 'superadmin', permissions: [] }
const quote = { id: 1, quote_number: 'OF-TEST-0001', revision_number: 1, account_name: 'Client test UI', status: 'accepted', total: 1200, currency: 'RON', customer_order_number: 'CO-TEST-0001', customer_order_status: 'confirmed' }
const contract = { id: 1, numar: 'CT-TEST-0001', titlu: 'Contract test UI', partener: 'Client test UI', status: 'activ', valoare_contract: 10000, valoare_consumata: 1000, valoare_ramasa: 9000, procent_consum: 10, moneda: 'RON', responsabil_nume: 'Manager test', alerte: [], consumuri: [], atasamente: [], acte_aditionale: [] }
const document = { id: 1, uuid: 'DOC-TEST-0001', nr_document: 'DOC-TEST-0001', titlu: 'Document test UI', status: 'draft', prioritate: 'normal', creat_de: 'theme-test', tip_id: 'TPL-TEST', created_at: '2026-10-06' }
const template = { id: 'TPL-TEST', denumire: 'Model test UI', variables: ['client'], activ: true }

async function main() {
  fs.mkdirSync(output, { recursive: true })
  const browser = await chromium.launch({ channel: process.env.INFRAFLOW_BROWSER_CHANNEL || 'chrome', headless: true })
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
    await context.addInitScript(() => localStorage.setItem('infraflow_token', 'visual-test-only'))
    const requests = []
    await context.route('**/api/**', async route => {
      const request = route.request()
      const parsed = new URL(request.url())
      requests.push({ path: parsed.pathname, query: parsed.search, method: request.method() })
      let data = {}
      if (parsed.pathname === '/api/session') data = { user }
      else if (parsed.pathname === '/api/settings') data = { settings: { company_name: 'Organizație test UI', modules_enabled: [] } }
      else if (parsed.pathname === '/api/notifications') data = { notifications: [], summary: { total: 0 } }
      else if (parsed.pathname === '/api/crm/quotes/workspace') data = { quotes: [quote], accounts: [{ id: 1, name: 'Client test UI' }], contacts: [] }
      else if (parsed.pathname === '/api/daily-report') data = { report: { criticalStocks: [{ name: 'Material test', quantity: 1 }], metrics: { outputTotal: 142 } } }
      else if (parsed.pathname === '/api/fleet-assets') data = { assets: [{ id: 1, active: true }] }
      else if (parsed.pathname === '/api/users') data = { users: [user] }
      else if (parsed.pathname === '/api/contracts') data = { contracts: [contract] }
      else if (parsed.pathname === '/api/contracts/1') data = { contract }
      else if (parsed.pathname === '/api/contracts/dashboard') data = { contracts_active: 1, contracts_total: 1, total_contractat: 10000, total_consumat: 1000, alerts: [], risks: [] }
      else if (parsed.pathname === '/api/contracts/tasks') data = { tasks: [] }
      else if (['/api/documents', '/api/documents/inbox'].includes(parsed.pathname)) data = { documents: [document] }
      else if (['/api/documents/templates', '/api/documents/template-catalog'].includes(parsed.pathname)) data = { templates: [template] }
      else if (parsed.pathname === '/api/materials') data = { materials: [{ id: 1, name: 'Material test UI', unit: 'buc', stock: 4, alert: 10, categorie: 'general', cod_intern: 'MAT-TEST', pret_achizitie: 20 }] }
      else if (parsed.pathname === '/api/gestiune/dashboard') data = { stats: { totalMateriale: 1, valoareTotal: 80, valoareIntrari: 80, valoareIesiri: 0, alerteStoc: 1, bcPending: 0 }, alerteStoc: [], ultimeleNir: [], ultimeleBc: [] }
      else if (parsed.pathname.startsWith('/api/gestiune/')) data = []
      else if (parsed.pathname === '/api/procurement-orders') data = { orders: [{ id: 1, orderNo: 'CA-TEST-0001', supplier: 'Furnizor test UI', status: 'ordered', material: 'Material test UI', amount: 5, unitPrice: 20 }], receipts: [] }
      else if (parsed.pathname === '/api/procurement-requirements') data = { requirements: [] }
      else if (parsed.pathname === '/api/scale/tickets') data = { tickets: [] }
      else if (parsed.pathname === '/api/scale/product-map') data = { productMap: {} }
      else if (parsed.pathname === '/api/scale/status') data = { connected: false }
      else if (parsed.pathname === '/api/paap') data = []
      await route.fulfill({ json: data })
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const screenshot = async name => {
      // Allow appearance and responsive drawer transitions to finish before visual QA.
      await page.waitForTimeout(350)
      await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true })
    }
    const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'page must fit viewport')
    await page.goto(`${url}/dashboard`)
    await page.locator('.dashboard-kpi').first().waitFor()
    assert.equal(await page.locator('.dashboard-kpi').count(), 4)
    assert.equal(await page.locator('.dashboard-kpi svg').count(), 4)
    await noOverflow()
    await screenshot('dashboard-light')
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await page.waitForTimeout(350)
    const sidebarGeometry = await page.locator('.app-sidebar').evaluate(element => {
      const rect = element.getBoundingClientRect()
      const nav = element.querySelector('nav')
      return { top: rect.top, bottom: rect.bottom, height: rect.height, viewport: innerHeight, horizontalOverflow: nav.scrollWidth > nav.clientWidth }
    })
    assert.ok(Math.abs(sidebarGeometry.top) < 2 && Math.abs(sidebarGeometry.bottom - sidebarGeometry.viewport) < 2, 'desktop sidebar must cover the viewport after scrolling a long page')
    assert.equal(sidebarGeometry.horizontalOverflow, false, 'sidebar must not overflow horizontally')
    await page.screenshot({ path: path.join(output, 'dashboard-scrolled.png'), fullPage: false })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.goto(`${url}/crm/oferte`)
    await page.getByRole('link', { name: 'OF-TEST-0001' }).waitFor()
    await page.getByLabel('Caută oferte').fill('Client')
    await Promise.all([
      page.waitForResponse(response => response.url().includes('/crm/quotes/workspace?q=Client')),
      page.getByRole('button', { name: 'Aplică filtre' }).click(),
    ])
    assert.ok(requests.some(request => request.query.includes('q=Client')))
    await screenshot('quotes-light')
    await page.keyboard.press('Control+k')
    await page.getByRole('dialog', { name: 'Caută în InfraFlow' }).waitFor()
    await page.getByLabel('Căutare globală').fill('ofert')
    await page.getByRole('button', { name: /Oferte CRM/ }).first().waitFor()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '+ Ofertă nouă' }).click()
    await page.locator('.crm-field').first().waitFor()
    await noOverflow()
    await screenshot('quote-form-light')
    await page.evaluate(() => { localStorage.setItem('infraflow_theme', 'dark'); window.dispatchEvent(new Event('infraflow:appearance')) })
    await screenshot('quote-form-dark')
    await page.goto(`${url}/crm/oferte`)
    await page.getByRole('link', { name: 'OF-TEST-0001' }).waitFor()
    await screenshot('quotes-dark')
    const densitySizes = []
    for (const density of ['compact', 'normal', 'comfortable']) {
      await page.evaluate(value => { localStorage.setItem('infraflow_density', value); window.dispatchEvent(new Event('infraflow:appearance')) }, density)
      densitySizes.push(await page.getByLabel('Caută oferte').evaluate(element => element.getBoundingClientRect().height))
    }
    assert.ok(densitySizes[0] < densitySizes[1] && densitySizes[1] < densitySizes[2], 'density controls must remain effective')
    await page.setViewportSize({ width: 390, height: 844 })
    await noOverflow()
    const createButton = await page.getByRole('button', { name: '+ Ofertă nouă' }).boundingBox()
    assert.ok(createButton && createButton.x >= 0 && createButton.x + createButton.width <= 390, 'mobile action must not be clipped')
    await screenshot('quotes-mobile')
    await page.getByRole('button', { name: 'Deschide meniul' }).click()
    await page.getByRole('link', { name: 'Dashboard', exact: true }).click()
    await page.locator('.dashboard-kpi').first().waitFor()
    await noOverflow()
    await screenshot('dashboard-mobile')
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.evaluate(() => { localStorage.setItem('infraflow_theme', 'light'); localStorage.setItem('infraflow_density', 'normal'); window.dispatchEvent(new Event('infraflow:appearance')) })
    await page.goto(`${url}/contracte`)
    await page.getByText('CT-TEST-0001', { exact: true }).first().waitFor()
    assert.equal(await page.locator('.contracts-workspace .module-metrics .ui-card').count(), 6)
    await noOverflow()
    await screenshot('contracts-light')
    await page.getByLabel('Caută', { exact: true }).fill('Fără rezultat în portofoliu')
    assert.equal(await page.locator('.contracts-workspace .ui-table').getByText('CT-TEST-0001', { exact: true }).count(), 0)
    await page.getByLabel('Caută', { exact: true }).fill('')
    await page.locator('.contracts-workspace .ui-table').getByRole('button', { name: 'Detalii', exact: true }).click()
    await page.getByRole('heading', { name: 'Dosar contract', exact: true }).waitFor()
    await page.getByText('Consumuri care scad contractul', { exact: true }).waitFor()
    await screenshot('contract-dossier-light')
    await page.getByRole('button', { name: 'Închide', exact: true }).click()
    await page.getByRole('button', { name: '+ Contract nou', exact: true }).click()
    await page.getByLabel('Număr contract', { exact: true }).fill('CT-LOCAL-PREVIEW')
    await page.getByLabel('Titlu / obiect contract', { exact: true }).fill('Fără salvare în test')
    await screenshot('contract-form-light')
    await page.getByRole('button', { name: 'Închide', exact: true }).click()
    await page.evaluate(() => { localStorage.setItem('infraflow_theme', 'dark'); window.dispatchEvent(new Event('infraflow:appearance')) })
    await screenshot('contracts-dark')
    assert.equal(await page.locator('.contracts-workspace .bg-emerald-50').first().evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(18, 58, 49)', 'dark success panels must use the readable dark surface')
    await page.setViewportSize({ width: 390, height: 844 })
    await noOverflow()
    await screenshot('contracts-mobile')
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(`${url}/documente`)
    await page.locator('.documents-workspace .ui-table').getByText('DOC-TEST-0001', { exact: true }).waitFor()
    await noOverflow()
    await screenshot('documents-dark')
    await page.evaluate(() => { localStorage.setItem('infraflow_theme', 'light'); window.dispatchEvent(new Event('infraflow:appearance')) })
    await screenshot('documents-light')
    await page.getByRole('button', { name: '+ Document nou', exact: true }).click()
    await page.getByLabel('Titlu document', { exact: true }).fill('Document preview local')
    await screenshot('document-form-light')
    await page.evaluate(() => { localStorage.setItem('infraflow_theme', 'dark'); window.dispatchEvent(new Event('infraflow:appearance')) })
    await screenshot('document-form-dark')
    await page.setViewportSize({ width: 390, height: 844 })
    await noOverflow()
    await screenshot('document-form-mobile')
    await page.getByRole('button', { name: 'Închide', exact: true }).click()
    await noOverflow()
    await screenshot('documents-mobile')
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(`${url}/gestiune`)
    await page.locator('.inventory-workspace').getByRole('heading', { name: 'Stocuri & Depozite', exact: true }).waitFor()
    assert.equal(await page.locator('.inventory-workspace .module-metrics .ui-card').count(), 6)
    await screenshot('inventory-dark')
    await page.evaluate(() => { localStorage.setItem('infraflow_theme', 'light'); window.dispatchEvent(new Event('infraflow:appearance')) })
    await page.getByRole('button', { name: 'Nomenclator', exact: true }).click()
    await page.locator('.inventory-workspace .ui-table').getByText('MAT-TEST', { exact: true }).waitFor()
    await screenshot('inventory-light')
    await page.getByRole('button', { name: '+ Material nou', exact: true }).click()
    await page.getByLabel('Denumire *', { exact: true }).fill('Material preview fără salvare')
    await screenshot('inventory-form-light')
    await page.setViewportSize({ width: 390, height: 844 })
    await noOverflow()
    await screenshot('inventory-form-mobile')
    await page.getByRole('button', { name: 'Închide', exact: true }).click()
    await noOverflow()
    await screenshot('inventory-mobile')
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(`${url}/achizitii`)
    await page.locator('.procurement-workspace header').getByRole('button', { name: 'Comandă nouă', exact: true }).waitFor()
    await page.locator('.procurement-workspace .ui-table').getByText('Furnizor test UI', { exact: true }).waitFor()
    await screenshot('procurement-light')
    await page.locator('.procurement-workspace header').getByRole('button', { name: 'Comandă nouă', exact: true }).click()
    await page.getByLabel('Număr comandă', { exact: true }).fill('CA-PREVIEW')
    await screenshot('procurement-form-light')
    await page.evaluate(() => { localStorage.setItem('infraflow_theme', 'dark'); window.dispatchEvent(new Event('infraflow:appearance')) })
    await screenshot('procurement-form-dark')
    await page.setViewportSize({ width: 390, height: 844 })
    await noOverflow()
    await screenshot('procurement-form-mobile')
    await page.getByRole('button', { name: 'Închide', exact: true }).click()
    await noOverflow()
    await screenshot('procurement-mobile')
    assert.ok(requests.filter(request => /^\/api\/(gestiune|materials|procurement-orders|procurement-requirements)(\/|$)/.test(request.path)).every(request => request.method === 'GET'), 'visual test never changes stock or submits orders')
    assert.deepEqual(errors, [], 'no unhandled browser exceptions')
    assert.ok(requests.filter(request => request.path.startsWith('/api/crm/')).every(request => request.method === 'GET'), 'visual test never submits a quote or billing action')
    assert.ok(requests.filter(request => /^\/api\/(contracts|documents)(\/|$)/.test(request.path)).every(request => request.method === 'GET'), 'visual test never saves a contract or launches a document')
    console.log(JSON.stringify({ ok: true, checks: ['dashboard', 'sidebar scroll', 'quotes', 'filters', 'new quote form', 'Ctrl+K', 'contracts', 'contract form', 'documents', 'document form', 'inventory', 'material form', 'procurement', 'order form', 'dark', 'density', 'mobile'], screenshots: output }))
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
