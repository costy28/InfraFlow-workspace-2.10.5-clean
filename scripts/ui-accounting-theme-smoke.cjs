/* Read-only accounting visual smoke: every API request is intercepted. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { chromium } = require(process.env.INFRAFLOW_PLAYWRIGHT_MODULE || 'playwright')

const url = process.env.INFRAFLOW_UI_URL || 'http://127.0.0.1:5175'
const output = process.env.INFRAFLOW_UI_OUTPUT || path.join(os.tmpdir(), 'infraflow-accounting-theme-smoke')
const user = { username: 'accounting-theme-test', name: 'Administrator test UI', role: 'superadmin', permissions: [] }
const supplier = {
  id: 1,
  tip: 'furnizor',
  cod: 'F-TEST',
  denumire: 'Furnizor test UI',
  cui: 'RO123456',
  tara: 'RO',
  activ: true,
  zile_scadenta: 30,
  cont_analitic_furnizor: '401.0001',
  sold: 1190,
  nescadent: 1190,
  bucket_1_30: 0,
  bucket_31_60: 0,
  bucket_61_90: 0,
  bucket_over_90: 0,
  invoice_count: 1,
}
const invoice = {
  id: 1,
  uuid: 'INV-TEST-0001',
  data: '2026-10-08',
  data_scadenta: '2026-11-07',
  nr_document: 'FI-TEST-0001',
  furnizor_id: 1,
  valoare: 1000,
  tva: 190,
  total: 1190,
  achitat: 0,
  neachitat: 1190,
  status: 'validat',
}
const accounts = [
  { simbol: '401', denumire: 'Furnizori', clasa: 4, tip_cont: 'pasiv' },
  { simbol: '5121', denumire: 'Conturi la bănci în lei', clasa: 5, tip_cont: 'bifunctional' },
  { simbol: '628', denumire: 'Alte cheltuieli', clasa: 6, tip_cont: 'activ' },
]

async function main() {
  fs.mkdirSync(output, { recursive: true })
  const browser = await chromium.launch({ channel: process.env.INFRAFLOW_BROWSER_CHANNEL || 'chrome', headless: true })
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
    await context.addInitScript(() => {
      localStorage.setItem('infraflow_token', 'visual-test-only')
      localStorage.setItem('infraflow_theme', 'light')
    })
    const requests = []
    const errors = []
    await context.route('**/api/**', async route => {
      const request = route.request()
      const parsed = new URL(request.url())
      requests.push({ path: parsed.pathname, method: request.method() })
      let data = {}
      if (parsed.pathname === '/api/session') data = { user }
      else if (parsed.pathname === '/api/settings') data = { settings: { company_name: 'Organizație test UI', modules_enabled: ['accounting'] } }
      else if (parsed.pathname === '/api/notifications') data = { notifications: [], summary: { total: 0 } }
      else if (parsed.pathname === '/api/messaging/stream-ticket') data = { ticket: 'visual-only' }
      else if (parsed.pathname === '/api/accounting/summary') data = { period: { status: 'deschisa' }, invoicesIn: { count: 1, total: 1190 }, invoicesOut: { count: 1, total: 1785 }, vat: { diferenta: 95 }, overdueSuppliers: 1, overdueClients: 0, alertsNew: 0 }
      else if (parsed.pathname === '/api/accounting/health') data = { checks: [] }
      else if (parsed.pathname === '/api/accounting/reconciliation') data = { status: 'ok', checks: [], issues: {} }
      else if (parsed.pathname === '/api/accounting/suppliers-status') data = { rows: [supplier] }
      else if (parsed.pathname === '/api/accounting/clients-status') data = { rows: [] }
      else if (parsed.pathname === '/api/accounting/third-parties') data = { thirdParties: [supplier] }
      else if (parsed.pathname === '/api/accounting/invoices-in') data = { invoices: [invoice] }
      else if (parsed.pathname === '/api/accounting/invoices-out') data = { invoices: [] }
      else if (parsed.pathname === '/api/accounting/chart') data = { accounts }
      else if (parsed.pathname === '/api/accounting/opening-balances') data = { balances: [] }
      else if (parsed.pathname === '/api/accounting/journals') data = { journals: [] }
      else if (parsed.pathname === '/api/accounting/balance-sheet') data = { rows: [], totals: {}, balanced: true }
      else if (parsed.pathname === '/api/accounting/general-ledger') data = { rows: [], totals: {} }
      else if (parsed.pathname === '/api/accounting/profit-loss') data = { rows: [], totals: {} }
      else if (parsed.pathname === '/api/accounting/financial-statements') data = { rows: [], control: {} }
      else if (parsed.pathname === '/api/accounting/financial-statements/mappings') data = { mappings: [] }
      else if (parsed.pathname === '/api/accounting/financial-statements/profiles') data = { profiles: [] }
      else if (parsed.pathname === '/api/accounting/d300') data = { decont: { randuri: [] } }
      else if (parsed.pathname === '/api/accounting/vat-journal') data = { jurnal_cumparari: [], jurnal_vanzari: [], cote: [] }
      else if (parsed.pathname === '/api/accounting/declarations/readiness') data = { checks: [], declarations: [] }
      else if (parsed.pathname === '/api/accounting/d394') data = { terti: [], warnings: [], totaluri: {} }
      else if (parsed.pathname === '/api/accounting/saft/readiness') data = { areas: [], issues: [], coverage: 0 }
      else if (parsed.pathname === '/api/accounting/d112/readiness') data = { checks: [], issues: [], employees: [], totals: {} }
      else if (parsed.pathname === '/api/accounting/declarations/history') data = { runs: [] }
      else if (parsed.pathname === '/api/accounting/declarations/register') data = { declarations: [] }
      else if (parsed.pathname === '/api/accounting/declarations/schemas') data = { schemas: [] }
      else if (parsed.pathname === '/api/accounting/fiscal/month-check') data = { checks: [], ready: false }
      else if (parsed.pathname === '/api/accounting/fiscal/calendar') data = { obligations: [] }
      else if (parsed.pathname === '/api/accounting/d112/mapping') data = { rows: [], company_errors: [], ready: false }
      else if (parsed.pathname === '/api/accounting/audit/end-to-end') data = { checks: [], ready: false }
      else if (/^\/api\/accounting\/periods\/\d+\/\d+\/check$/.test(parsed.pathname)) data = { status: 'deschisa', checks: { can_close: false, balance_ok: true, journal_structure_ok: true, bank_reconciliation_ok: true }, blockers: [], counts: {}, balance: { balanced: true }, vat: {}, drafts: [], unbalanced: [], history: [], submission: { ready: false } }
      else if (parsed.pathname === '/api/accounting/cost-centers') data = { costCenters: [] }
      else if (parsed.pathname === '/api/accounting/journal-templates') data = { templates: [] }
      else if (parsed.pathname === '/api/accounting/treasury') data = { treasury: [{ id: 1, uuid: 'TR-TEST-0001', data: '2026-10-08', tip: 'banca', tip_operatie: 'plata', nr_document: 'OP-TEST-1', tert_id: 1, cont_trezorerie: '5121', cont_corespondent: '401', suma: 1190, status: 'draft', explicatie: 'Operație test UI' }], summary: { advances: {} } }
      else if (parsed.pathname === '/api/accounting/operations/status') data = { fixed_assets: [], bank_imports: [], depreciation_runs: [], annual_closings: [] }
      else if (parsed.pathname === '/api/accounting/stock-sync/status') data = { pending: [], errors: [], posted: 0, skipped: 0 }
      else if (/^\/api\/accounting\/annual-close\/\d+\/check$/.test(parsed.pathname)) data = { blockers: [] }
      else if (/^\/api\/accounting\/annual-close\/\d+\/carryforward-check$/.test(parsed.pathname)) data = { blockers: [], entries: [] }
      else if (parsed.pathname === '/api/accounting/bank-reconciliation') data = { operations: [], summary: {} }
      else if (parsed.pathname === '/api/accounting/stock-valuation') data = { rows: [], errors: [], totals: {} }
      else if (parsed.pathname === '/api/accounting/inventory-invoice-reconciliation') data = { rows: [], summary: {} }
      else if (parsed.pathname === '/api/accounting/integrity-audit') data = { checks: [], issues: [], status: 'ok' }
      else if (parsed.pathname === '/api/accounting/fixed-assets/categories') data = { categories: [] }
      else if (parsed.pathname === '/api/contracts') data = { contracts: [] }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
    })

    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    const screenshot = name => page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true })
    const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, 'page has no horizontal overflow')

    await page.goto(`${url}/contabilitate`)
    await page.getByText('Asistent contabil', { exact: true }).waitFor()
    await noOverflow()
    await screenshot('accounting-dashboard-light')

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${url}/contabilitate/furnizori`)
    await page.getByText('Furnizor test UI', { exact: true }).waitFor()
    await noOverflow()
    assert.ok(await page.locator('.accounting-table').first().locator('..').evaluate(element => element.scrollWidth > element.clientWidth), 'accounting table scrolls locally on mobile')
    await screenshot('accounting-suppliers-mobile')
    await page.locator('header').getByRole('button', { name: 'Actiuni', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Adauga furnizor', exact: true }).click()
    await page.getByLabel('Denumire', { exact: true }).fill('Preview fără salvare')
    await noOverflow()
    await screenshot('accounting-supplier-form-mobile')
    await page.getByRole('button', { name: 'Închide', exact: true }).click()

    await page.goto(`${url}/contabilitate/facturi-intrare`)
    await page.getByText('FI-TEST-0001', { exact: true }).waitFor()
    await noOverflow()
    await screenshot('accounting-invoices-mobile')
    await page.locator('header').getByRole('button', { name: 'Actiuni', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Factura intrare noua', exact: true }).click()
    await page.getByLabel('Document', { exact: true }).fill('Preview fără salvare')
    await noOverflow()
    await screenshot('accounting-invoice-form-mobile')
    await page.getByRole('button', { name: 'Închide', exact: true }).click()

    await page.goto(`${url}/contabilitate/trezorerie`)
    await page.getByText('OP-TEST-1', { exact: true }).waitFor()
    await noOverflow()
    await screenshot('accounting-treasury-mobile')
    await page.locator('header').getByRole('button', { name: 'Actiuni', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Operatie noua', exact: true }).click()
    await page.getByLabel('Nr. document', { exact: true }).fill('Preview fără salvare')
    await noOverflow()
    await screenshot('accounting-treasury-form-mobile')
    await page.getByRole('button', { name: 'Închide', exact: true }).click()

    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(`${url}/contabilitate/operatiuni`)
    await page.getByText('Operațiuni contabile', { exact: true }).first().waitFor()
    await page.evaluate(() => { localStorage.setItem('infraflow_theme', 'dark'); window.dispatchEvent(new Event('infraflow:appearance')) })
    await page.waitForTimeout(150)
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark', 'dark theme is active')
    await noOverflow()
    await screenshot('accounting-operations-dark')

    await page.setViewportSize({ width: 390, height: 844 })
    await page.evaluate(() => { localStorage.setItem('infraflow_theme', 'light'); window.dispatchEvent(new Event('infraflow:appearance')) })
    await page.goto(`${url}/contabilitate/plan-conturi`)
    await page.getByText('Plan de conturi', { exact: true }).first().waitFor()
    await noOverflow()
    await screenshot('accounting-chart-mobile')

    await page.goto(`${url}/contabilitate/registru-jurnal`)
    await page.getByText('Registru jurnal', { exact: true }).first().waitFor()
    await noOverflow()
    assert.ok(await page.locator('.accounting-table').first().locator('..').evaluate(element => element.scrollWidth > element.clientWidth), 'advanced accounting table scrolls locally on mobile')
    await screenshot('accounting-journal-mobile')

    await page.goto(`${url}/contabilitate/tva-d300`)
    await page.getByText('Centru fiscal', { exact: true }).first().waitFor()
    await noOverflow()
    await screenshot('accounting-fiscal-mobile')

    await page.goto(`${url}/contabilitate/inchidere-luna`)
    await page.getByText('Inchidere luna', { exact: true }).first().waitFor()
    await noOverflow()
    await screenshot('accounting-close-mobile')

    const mutations = requests.filter(request => request.path.startsWith('/api/accounting/') && request.method !== 'GET')
    assert.deepEqual(mutations, [], `accounting visual smoke must not change data: ${JSON.stringify(mutations)}`)
    assert.deepEqual(errors, [], `browser errors: ${JSON.stringify(errors)}`)
    console.log(JSON.stringify({ ok: true, screenshots: output }))
  } finally {
    await browser.close()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
