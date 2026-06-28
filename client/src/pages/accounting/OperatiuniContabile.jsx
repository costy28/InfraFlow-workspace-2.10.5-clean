import { useEffect, useMemo, useState } from 'react'
import api from '../../api/client'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/forms/Input'
import Modal from '../../components/ui/Modal'
import { formatMoney } from '../../utils/format'
import { AccountingShell, DropdownMenu, Table, currentMonth, today } from './accounting-shared'

function defaultAsset() {
  return {
    inventory_no: '',
    name: '',
    acquisition_date: today(),
    depreciation_start: today(),
    acquisition_value: '',
    residual_value: '0',
    useful_life_months: '60'
    ,category_code: '2.1'
    ,location: ''
    ,custodian: ''
  }
}

export function OperatiuniContabile() {
  const [month, setMonth] = useState(currentMonth())
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [status, setStatus] = useState({ fixed_assets: [], bank_imports: [], depreciation_runs: [], annual_closings: [] })
  const [stock, setStock] = useState({ pending: [], errors: [], posted: 0, skipped: 0 })
  const [annual, setAnnual] = useState({ blockers: [] })
  const [reconciliation, setReconciliation] = useState({ operations: [], summary: {} })
  const [valuation, setValuation] = useState({ rows: [], errors: [], totals: {} })
  const [carryforward, setCarryforward] = useState({ blockers: [], entries: [] })
  const [inventoryReconciliation, setInventoryReconciliation] = useState({ rows: [], summary: {} })
  const [integrity, setIntegrity] = useState({ checks: [], issues: [], status: 'ok' })
  const [assetCategories, setAssetCategories] = useState([])
  const [asset, setAsset] = useState(defaultAsset())
  const [file, setFile] = useState(null)
  const [efacturaFile, setEfacturaFile] = useState(null)
  const [selectedReceipts, setSelectedReceipts] = useState([])
  const [batchModal, setBatchModal] = useState(false)
  const [batchForm, setBatchForm] = useState({ nr_document: '', data: today(), data_scadenta: today(), total_factura: '', distribute_difference: true })
  const [creditModal, setCreditModal] = useState(false)
  const [creditTarget, setCreditTarget] = useState(null)
  const [creditForm, setCreditForm] = useState({ nr_document: '', data: today(), observatii: '' })
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const selectedReceiptRows = useMemo(() => (inventoryReconciliation.rows || []).filter(row => selectedReceipts.includes(row.id)), [inventoryReconciliation.rows, selectedReceipts])
  const selectedReceiptTotal = useMemo(() => selectedReceiptRows.reduce((sum, row) => sum + Number(row.total || 0), 0), [selectedReceiptRows])

  useEffect(() => { load() }, [month, year])

  function load() {
    setError('')
    Promise.all([
      api.get('/accounting/operations/status'),
      api.get('/accounting/stock-sync/status', { params: { perioada: month } }),
      api.get(`/accounting/annual-close/${year}/check`),
      api.get('/accounting/bank-reconciliation', { params: { perioada: month } }),
      api.get('/accounting/stock-valuation', { params: { perioada: month } }),
      api.get(`/accounting/annual-close/${year}/carryforward-check`),
      api.get('/accounting/inventory-invoice-reconciliation', { params: { perioada: month } }),
      api.get('/accounting/integrity-audit', { params: { perioada: month } }),
      api.get('/accounting/fixed-assets/categories')
    ]).then(([statusRes, stockRes, annualRes, reconciliationRes, valuationRes, carryforwardRes, inventoryRes, integrityRes, categoriesRes]) => {
      setStatus(statusRes.data || {})
      setStock(stockRes.data || { pending: [], errors: [] })
      setAnnual(annualRes.data || { blockers: [] })
      setReconciliation(reconciliationRes.data || { operations: [], summary: {} })
      setValuation(valuationRes.data || { rows: [], errors: [], totals: {} })
      setCarryforward(carryforwardRes.data || { blockers: [], entries: [] })
      setInventoryReconciliation(inventoryRes.data || { rows: [], summary: {} })
      setIntegrity(integrityRes.data || { checks: [], issues: [], status: 'ok' })
      setAssetCategories(categoriesRes.data?.categories || [])
    }).catch(err => setError(err.response?.data?.error || 'Operațiunile contabile nu au putut fi încărcate.'))
  }

  async function download(endpoint, filename, openInNewTab = false) {
    try {
      const res = await api.get(endpoint, { params: { perioada: month }, responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const link = document.createElement('a')
      link.href = url
      link.download = openInNewTab ? '' : filename
      if (openInNewTab) link.target = '_blank'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 30000)
    } catch (err) { setError(err.response?.data?.error || 'Fișierul nu a putut fi generat.') }
  }

  async function confirmSuggestion(operation) {
    const suggestion = operation.best_suggestion
    if (!suggestion) return
    setBusy(`reconcile-${operation.uuid}`); setError(''); setMessage('')
    try {
      await api.post(`/accounting/bank-reconciliation/${operation.uuid}/confirm`, {
        [suggestion.tip === 'intrare' ? 'invoice_in_id' : 'invoice_out_id']: suggestion.invoice_id,
        score: suggestion.score
      })
      setMessage(`Operația ${operation.nr_document || operation.id} a fost legată de factura ${suggestion.document}. Valideaz-o apoi în Trezorerie.`)
      load()
    } catch (err) { setError(err.response?.data?.error || 'Potrivirea nu a putut fi confirmată.') } finally { setBusy('') }
  }

  async function autoConfirmBank() {
    setBusy('reconcile-auto'); setError(''); setMessage('')
    try {
      const res = await api.post('/accounting/bank-reconciliation/auto-confirm', { perioada: month, min_score: 85 })
      const result = res.data || {}
      setMessage(`${result.confirmed || 0} operații au fost potrivite automat. ${result.ambiguous || 0} au rămas pentru verificare manuală.`)
      load()
    } catch (err) { setError(err.response?.data?.error || 'Reconcilierea automată nu a putut fi executată.') } finally { setBusy('') }
  }

  async function finalizeBankImport(batch) {
    setBusy(`batch-${batch.id}`); setError(''); setMessage('')
    try {
      await api.post(`/accounting/bank-imports/${batch.id}/finalize`)
      setMessage(`Extrasul ${batch.file_name} a fost marcat procesat.`)
      load()
    } catch (err) { setError(err.response?.data?.error || 'Extrasul nu poate fi finalizat încă.') } finally { setBusy('') }
  }

  async function confirmReceiptInvoice(row) {
    const suggestion = row.best_suggestion
    if (!suggestion) return
    setBusy(`receipt-${row.id}`); setError(''); setMessage('')
    try {
      await api.post(`/accounting/inventory-invoice-reconciliation/${row.id}/confirm`, { invoice_id: suggestion.invoice_id })
      setMessage(`Recepția ${row.document || row.orderNo} a fost legată de factura ${suggestion.document}.`)
      load()
    } catch (err) { setError(err.response?.data?.error || 'Legătura recepție–factură nu a putut fi salvată.') } finally { setBusy('') }
  }

  async function createInvoiceFromReceipt(row) {
    setBusy(`receipt-create-${row.id}`); setError(''); setMessage('')
    try {
      const res = await api.post(`/accounting/inventory-invoice-reconciliation/${row.id}/create-invoice`)
      setMessage(`Factura ${res.data?.invoice?.nr_document || ''} a fost creată ca draft din NIR și poate fi verificată în Facturi intrare.`)
      load()
    } catch (err) { setError(err.response?.data?.error || 'Factura nu a putut fi creată din recepție.') } finally { setBusy('') }
  }

  function openBatchInvoice() {
    if (!selectedReceipts.length) { setError('Selectează NIR-urile care aparțin aceleiași facturi.'); return }
    const suppliers = new Set(selectedReceiptRows.map(row => String(row.supplier || '').trim().toLowerCase()))
    if (suppliers.size > 1) { setError('NIR-urile selectate trebuie să aparțină aceluiași furnizor.'); return }
    setBatchForm({ nr_document: '', data: today(), data_scadenta: today(), total_factura: String(selectedReceiptTotal || ''), distribute_difference: true })
    setBatchModal(true)
  }

  async function createBatchInvoice(event) {
    event.preventDefault()
    setBusy('receipt-batch'); setError(''); setMessage('')
    try {
      const res = await api.post('/accounting/inventory-invoice-reconciliation/create-invoice-batch', {
        receipt_ids: selectedReceipts,
        ...batchForm,
        total_factura: batchForm.total_factura || undefined
      })
      const difference = Number(res.data?.variance || 0)
      setMessage(`Factura ${batchForm.nr_document} a fost creată din ${selectedReceipts.length} NIR-uri.${Math.abs(difference) > 0.01 ? ` Diferență față de recepții: ${formatMoney(difference)}.` : ''}`)
      setSelectedReceipts([])
      setBatchModal(false)
      load()
    } catch (err) { setError(err.response?.data?.error || 'Factura multiplă nu a putut fi creată.') } finally { setBusy('') }
  }

  function toggleReceipt(id) {
    setSelectedReceipts(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  }

  async function resolveFullReturn(returnRecord) {
    if (!window.confirm('Factura și nota contabilă legată vor fi stornate. Continui?')) return
    setBusy(`return-${returnRecord.id}`); setError(''); setMessage('')
    try {
      const res = await api.post(`/accounting/inventory-returns/${returnRecord.id}/storno-linked-invoice`)
      setMessage(`Returul a fost rezolvat contabil. Factura este ${res.data?.invoice?.status || 'stornată'}.`)
      load()
    } catch (err) { setError(err.response?.data?.error || 'Returul nu a putut fi rezolvat contabil.') } finally { setBusy('') }
  }

  function openCreditNote(row) {
    setCreditTarget(row)
    setCreditForm({ nr_document: row.credit_note?.nr_document || '', data: row.credit_note?.data || today(), observatii: row.credit_note?.observatii || row.pending_return?.reason || '' })
    setCreditModal(true)
  }

  async function saveCreditNote(event) {
    event.preventDefault()
    if (!creditTarget?.pending_return) return
    setBusy('credit-note'); setError(''); setMessage('')
    try {
      if (creditTarget.credit_note) await api.patch(`/accounting/credit-notes/${creditTarget.credit_note.uuid}`, creditForm)
      else await api.post(`/accounting/inventory-returns/${creditTarget.pending_return.id}/credit-note`, creditForm)
      setMessage('Nota de credit a fost salvată ca draft. Verific-o, apoi valideaz-o pentru actualizarea soldului furnizorului.')
      setCreditModal(false)
      load()
    } catch (err) { setError(err.response?.data?.error || 'Nota de credit nu a putut fi salvată.') } finally { setBusy('') }
  }

  async function validateCreditNote(note) {
    setBusy(`credit-${note.id}`); setError(''); setMessage('')
    try {
      await api.post(`/accounting/credit-notes/${note.uuid}/validate`)
      setMessage(`Nota de credit ${note.nr_document} a fost validată și soldul facturii a fost recalculat.`)
      load()
    } catch (err) { setError(err.response?.data?.error || 'Nota de credit nu a putut fi validată.') } finally { setBusy('') }
  }

  async function importEfactura() {
    if (!efacturaFile) { setError('Selectează fișierul XML e-Factura primit.'); return }
    setBusy('efactura'); setError(''); setMessage('')
    try {
      const body = new FormData()
      body.append('file', efacturaFile)
      const res = await api.post('/accounting/efactura/import', body)
      setMessage(`e-Factura ${res.data?.invoice?.nr_document || ''} a fost importată ca draft.`)
      setEfacturaFile(null)
      load()
    } catch (err) { setError(err.response?.data?.error || 'Fișierul e-Factura nu a putut fi importat.') } finally { setBusy('') }
  }

  async function inventoryAssets() {
    setBusy('asset-inventory'); setError(''); setMessage('')
    try {
      const res = await api.post('/accounting/fixed-assets/inventory', { date: today() })
      setMessage(`Inventarierea a fost înregistrată pentru ${res.data?.inventory?.items?.length || 0} mijloace fixe.`)
    } catch (err) { setError(err.response?.data?.error || 'Inventarierea nu a putut fi înregistrată.') } finally { setBusy('') }
  }

  async function importBank() {
    if (!file) { setError('Selectează fișierul extrasului bancar.'); return }
    setBusy('bank'); setError(''); setMessage('')
    try {
      const body = new FormData()
      body.append('file', file)
      body.append('cont_trezorerie', '5121')
      const res = await api.post('/accounting/bank-statements/import', body)
      const result = res.data?.result || {}
      setMessage(`Extras importat: ${result.importate || 0} operații, ${result.potrivite || 0} potrivite, ${result.duplicate || 0} duplicate.`)
      setFile(null)
      load()
    } catch (err) { setError(err.response?.data?.error || 'Extrasul nu a putut fi importat.') } finally { setBusy('') }
  }

  async function syncStock() {
    setBusy('stock'); setError(''); setMessage('')
    try {
      const res = await api.post('/accounting/stock-sync', { perioada: month })
      setMessage(`Au fost generate ${res.data?.result?.create || 0} note contabile din mișcările de stoc.`)
      load()
    } catch (err) { setError(err.response?.data?.error || 'Mișcările de stoc nu au putut fi contabilizate.') } finally { setBusy('') }
  }

  async function createAsset(event) {
    event.preventDefault()
    setBusy('asset'); setError(''); setMessage('')
    try {
      await api.post('/accounting/fixed-assets', asset)
      setAsset(defaultAsset())
      setMessage('Imobilizarea a fost adăugată.')
      load()
    } catch (err) { setError(err.response?.data?.error || 'Imobilizarea nu a putut fi adăugată.') } finally { setBusy('') }
  }

  async function cancelAsset(row) {
    setBusy(`asset-${row.uuid}`); setError('')
    try {
      await api.delete(`/accounting/fixed-assets/${row.uuid}`, { data: { motiv: 'Scoatere din evidenta' } })
      setMessage('Imobilizarea a fost scoasă din evidență.')
      load()
    } catch (err) { setError(err.response?.data?.error || 'Imobilizarea nu a putut fi scoasă din evidență.') } finally { setBusy('') }
  }

  async function assetAction(row, action) {
    const payload = { action, data: today() }
    if (action === 'transfer') payload.location = window.prompt('Noua locație a imobilizării:', row.location || '') || ''
    if (action === 'reevaluare') payload.new_value = window.prompt('Noua valoare contabilă:', row.acquisition_value || '') || ''
    if (action === 'casare') payload.motiv = window.prompt('Motivul casării:', '') || ''
    if ((action === 'transfer' && !payload.location) || (action === 'reevaluare' && !payload.new_value) || (action === 'casare' && !payload.motiv)) return
    setBusy(`asset-${row.uuid}`); setError(''); setMessage('')
    try {
      await api.post(`/accounting/fixed-assets/${row.uuid}/action`, payload)
      setMessage(`Acțiunea ${action.replaceAll('_', ' ')} a fost înregistrată pentru ${row.inventory_no}.`)
      load()
    } catch (err) { setError(err.response?.data?.error || 'Acțiunea nu a putut fi înregistrată.') } finally { setBusy('') }
  }

  async function runDepreciation() {
    setBusy('depreciation'); setError(''); setMessage('')
    try {
      const res = await api.post('/accounting/depreciation/run', { perioada: month })
      setMessage(`Amortizare calculată: ${formatMoney(res.data?.run?.total || 0)}.`)
      load()
    } catch (err) { setError(err.response?.data?.error || 'Amortizarea nu a putut fi calculată.') } finally { setBusy('') }
  }

  async function closeYear() {
    setBusy('annual'); setError(''); setMessage('')
    try {
      const res = await api.post(`/accounting/annual-close/${year}`)
      setMessage(`Nota de închidere anuală a fost generată. Rezultat: ${formatMoney(res.data?.closing?.result || 0)}.`)
      load()
    } catch (err) { setError(err.response?.data?.error || 'Închiderea anuală nu a putut fi generată.') } finally { setBusy('') }
  }

  async function carryforwardBalances() {
    setBusy('carryforward'); setError(''); setMessage('')
    try {
      const res = await api.post(`/accounting/annual-close/${year}/carryforward`)
      setMessage(`${res.data?.run?.entries || 0} solduri au fost reportate în ${Number(year) + 1}.`)
      load()
    } catch (err) { setError(err.response?.data?.error || 'Soldurile nu au putut fi reportate.') } finally { setBusy('') }
  }

  return (
    <AccountingShell
      active="operatiuni"
      title="Operațiuni contabile"
      subtitle="Extrase bancare, stocuri, imobilizări și închidere anuală."
      actions={<DropdownMenu align="right" label="Acțiuni" items={[
        { label: 'Reîncarcă', onClick: load },
        { label: 'Trezorerie', to: `/contabilitate/trezorerie?luna=${month}` },
        { label: 'Registru jurnal', to: `/contabilitate/registru-jurnal?luna=${month}` },
        { type: 'separator' },
        { label: 'Exportă registrul MF', onClick: () => download('/accounting/fixed-assets/export', 'Registru_mijloace_fixe.xlsx') },
        { label: 'Exportă auditul contabil', onClick: () => download('/accounting/integrity-audit/export', `Audit_contabil_${month}.xlsx`) }
      ]} />}
    >
      {error ? <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      {message ? <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
      <Card>
        <div className="grid gap-3 md:grid-cols-2">
          <Input label="Luna de lucru" type="month" value={month} onChange={event => setMonth(event.target.value)} />
          <Input label="An închidere" type="number" value={year} onChange={event => setYear(event.target.value)} />
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="text-base font-semibold">Recepții și facturi furnizor</h3><p className="mt-1 text-sm text-slate-500">Selectează mai multe NIR-uri ale aceluiași furnizor când sunt cuprinse într-o singură factură.</p></div>
          <div className="flex flex-wrap items-center gap-2"><Badge tone={inventoryReconciliation.summary?.discrepancies ? 'warning' : 'success'}>{inventoryReconciliation.summary?.discrepancies || 0} diferențe</Badge><Badge tone={inventoryReconciliation.summary?.pending ? 'warning' : 'success'}>{inventoryReconciliation.summary?.linked || 0}/{inventoryReconciliation.summary?.total || 0} legate</Badge><Button variant="secondary" onClick={openBatchInvoice} disabled={!selectedReceipts.length || busy === 'receipt-batch'}>Factură din selecție ({selectedReceipts.length})</Button></div>
        </div>
        <div className="mt-3 space-y-2">
          {(inventoryReconciliation.rows || []).filter(row => !row.linked_invoice).slice(0, 10).map(row => (
            <div key={row.id} className="grid gap-2 border-t border-slate-100 py-2 text-sm md:grid-cols-[28px_110px_1fr_1fr_auto] md:items-center">
              <input aria-label={`Selectează ${row.nr_nir || row.document || row.id}`} type="checkbox" checked={selectedReceipts.includes(row.id)} onChange={() => toggleReceipt(row.id)} />
              <span>{row.date}</span><span>{row.nr_nir || row.document || row.orderNo} · {row.supplier || '-'}</span>
              <span>{row.best_suggestion ? `${row.best_suggestion.document} · ${row.best_suggestion.furnizor} · ${row.best_suggestion.score}%` : 'Fără sugestie suficientă'}</span>
              {row.best_suggestion
                ? <Button variant="secondary" onClick={() => confirmReceiptInvoice(row)} disabled={busy === `receipt-${row.id}`}>Confirmă</Button>
                : <Button variant="secondary" onClick={() => createInvoiceFromReceipt(row)} disabled={busy === `receipt-create-${row.id}`}>Creează factură</Button>}
            </div>
          ))}
          {!(inventoryReconciliation.rows || []).some(row => !row.linked_invoice) ? <div className="text-sm text-slate-500">Toate recepțiile lunii sunt legate de facturi.</div> : null}
        </div>
        {(inventoryReconciliation.rows || []).some(row => row.linked_invoice && row.variance?.primary && !row.variance.ok) ? <div className="mt-4 border-t border-amber-200 pt-3"><div className="text-sm font-semibold text-amber-900">Diferențe factură–NIR</div>{(inventoryReconciliation.rows || []).filter(row => row.linked_invoice && row.variance?.primary && !row.variance.ok).map(row => <div key={`variance-${row.id}`} className="mt-2 text-sm text-amber-800">{row.linked_invoice.document}: factură {formatMoney(row.variance.invoice_total)}, NIR-uri {formatMoney(row.variance.receipt_total)}, diferență {formatMoney(row.variance.difference)}.</div>)}</div> : null}
        {(inventoryReconciliation.rows || []).some(row => row.pending_return) ? <div className="mt-4 border-t border-rose-200 pt-3">
          <div className="text-sm font-semibold text-rose-900">Retururi care cer corecție contabilă</div>
          {(inventoryReconciliation.rows || []).filter(row => row.pending_return).map(row => <div key={`return-${row.pending_return.id}`} className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">
            <span>{row.nr_nir || row.document}: retur {formatMoney(row.pending_return.total)}. {row.pending_return.full_return ? 'Factura poate fi stornată automat.' : row.credit_note ? `Nota ${row.credit_note.nr_document} este ${row.credit_note.status}.` : 'Retur parțial: înregistrează nota de credit primită de la furnizor.'}</span>
            <div className="flex flex-wrap gap-2">
              {row.pending_return.full_return ? <Button variant="secondary" onClick={() => resolveFullReturn(row.pending_return)} disabled={busy === `return-${row.pending_return.id}`}>Stornează factura</Button> : null}
              {!row.pending_return.full_return && !row.credit_note ? <Button variant="secondary" onClick={() => openCreditNote(row)}>Creează nota de credit</Button> : null}
              {!row.pending_return.full_return && row.credit_note && ["draft", "devalidat"].includes(row.credit_note.status) ? <><Button variant="secondary" onClick={() => openCreditNote(row)}>Editează</Button><Button onClick={() => validateCreditNote(row.credit_note)} disabled={busy === `credit-${row.credit_note.id}`}>Validează</Button></> : null}
            </div>
          </div>)}
        </div> : null}
      </Card>

      <Card>
        <h3 className="text-base font-semibold">Import e-Factura primită</h3>
        <p className="mt-1 text-sm text-slate-500">Citește XML UBL, identifică furnizorul și creează factura ca draft pentru verificare.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input className="min-w-0 flex-1 text-sm" type="file" accept=".xml,text/xml,application/xml" onChange={event => setEfacturaFile(event.target.files?.[0] || null)} />
          <Button onClick={importEfactura} disabled={busy === 'efactura'}>{busy === 'efactura' ? 'Se importă...' : 'Importă XML'}</Button>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-base font-semibold">Audit integritate contabilă</h3><p className="mt-1 text-sm text-slate-500">Documente, note, duplicate, stocuri și declarații.</p></div><Badge tone={integrity.status === 'ok' ? 'success' : 'warning'}>{integrity.issues?.length || 0} probleme</Badge></div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{(integrity.checks || []).map(check => <div key={check.key} className={`border-t py-2 text-sm ${check.value ? 'border-amber-300 text-amber-800' : 'border-emerald-200 text-emerald-800'}`}><strong>{check.label}</strong><div className="text-xs">{check.message}</div></div>)}</div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <h3 className="text-base font-semibold">Import extras bancar</h3>
          <p className="mt-1 text-sm text-slate-500">CSV sau Excel. Operațiile sunt create ca draft, iar duplicatele sunt ignorate.</p>
          <input className="mt-4 block w-full text-sm" type="file" accept=".csv,.xls,.xlsx" onChange={event => setFile(event.target.files?.[0] || null)} />
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-sm text-slate-500">{file?.name || 'Niciun fișier selectat'}</span>
            <Button onClick={importBank} disabled={busy === 'bank'}>{busy === 'bank' ? 'Se importă...' : 'Importă extras'}</Button>
          </div>
          <div className="mt-4 text-sm text-slate-600">Importuri recente: {status.bank_imports?.length || 0}</div>
          {(status.bank_imports || []).slice(0, 3).map(batch => (
            <div key={batch.id} className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-sm">
              <span className="min-w-0 truncate">{batch.file_name} · {batch.profile || 'format generic'} · {batch.status || 'în lucru'}</span>
              {batch.status !== 'procesat' ? <Button variant="secondary" onClick={() => finalizeBankImport(batch)} disabled={busy === `batch-${batch.id}`}>Finalizează</Button> : null}
            </div>
          ))}
        </Card>

        <Card>
          <h3 className="text-base font-semibold">Contabilizare stocuri</h3>
          <p className="mt-1 text-sm text-slate-500">Generează note pentru intrări și consumuri cu valoare cunoscută.</p>
          <div className="mt-4 grid grid-cols-3 gap-3 border-y border-slate-100 py-3 text-sm">
            <div><div className="text-xs text-slate-500">În așteptare</div><strong>{stock.pending?.length || 0}</strong></div>
            <div><div className="text-xs text-slate-500">Contabilizate</div><strong>{stock.posted || 0}</strong></div>
            <div><div className="text-xs text-slate-500">Erori</div><strong>{stock.errors?.length || 0}</strong></div>
          </div>
          {stock.errors?.length ? <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{stock.errors.slice(0, 5).join(' ')}</div> : null}
          <div className="mt-4 flex justify-end"><Button onClick={syncStock} disabled={busy === 'stock' || !stock.pending?.length}>{busy === 'stock' ? 'Se generează...' : 'Generează note'}</Button></div>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="text-base font-semibold">Reconciliere bancară asistată</h3><p className="mt-1 text-sm text-slate-500">Confirmă sugestiile aici, apoi validează operațiile în Trezorerie.</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={reconciliation.summary?.pending ? 'warning' : 'success'}>{reconciliation.summary?.reconciled || 0}/{reconciliation.summary?.total || 0} reconciliate</Badge>
            <Badge tone={reconciliation.summary?.ambiguous ? 'warning' : 'neutral'}>{reconciliation.summary?.ambiguous || 0} ambigue</Badge>
            <Button variant="secondary" onClick={autoConfirmBank} disabled={busy === 'reconcile-auto' || !reconciliation.summary?.auto_eligible}>{busy === 'reconcile-auto' ? 'Se potrivește...' : `Potrivește sigur (${reconciliation.summary?.auto_eligible || 0})`}</Button>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {(reconciliation.operations || []).filter(row => row.corelare_tip === 'neclasificat').slice(0, 10).map(row => (
            <div key={row.uuid || row.id} className="grid gap-2 border-t border-slate-100 py-2 text-sm md:grid-cols-[120px_1fr_150px_1fr_auto] md:items-center">
              <span>{row.data}</span><span className="min-w-0 truncate">{row.explicatie || row.nr_document}</span><strong className="text-right">{formatMoney(row.suma)}</strong>
              <span>{row.best_suggestion ? `${row.best_suggestion.document} · ${row.best_suggestion.tert} · ${row.best_suggestion.score}%${row.auto_eligible ? ' · sigură' : ' · verifică'}` : 'Fără sugestie sigură'}</span>
              {row.best_suggestion ? <Button variant="secondary" onClick={() => confirmSuggestion(row)} disabled={busy === `reconcile-${row.uuid}`}>Confirmă</Button> : null}
            </div>
          ))}
          {!(reconciliation.operations || []).some(row => row.corelare_tip === 'neclasificat') ? <div className="text-sm text-slate-500">Nu există operații bancare neclasificate în această lună.</div> : null}
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="text-base font-semibold">Evaluare stoc CMP</h3><p className="mt-1 text-sm text-slate-500">Cost mediu ponderat calculat cronologic până la finalul lunii.</p></div>
          <strong>{formatMoney(valuation.totals?.value || 0)}</strong>
        </div>
        {valuation.errors?.length ? <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{valuation.errors.slice(0, 5).join(' ')}</div> : null}
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {(valuation.rows || []).slice(0, 12).map(row => <div key={row.material_id} className="border-t border-slate-100 py-2 text-sm"><strong>{row.cod || row.denumire}</strong><div className="text-slate-500">{row.quantity} × {formatMoney(row.average_cost)} = {formatMoney(row.value)}</div></div>)}
        </div>
      </Card>

      <Card>
        <h3 className="text-base font-semibold">Imobilizări</h3>
        <form className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4" onSubmit={createAsset}>
          <Input label="Nr. inventar" value={asset.inventory_no} onChange={event => setAsset({ ...asset, inventory_no: event.target.value })} placeholder="MF-0001" />
          <Input label="Denumire" value={asset.name} onChange={event => setAsset({ ...asset, name: event.target.value })} required />
          <Input label="Data achiziției" type="date" value={asset.acquisition_date} onChange={event => setAsset({ ...asset, acquisition_date: event.target.value })} />
          <Input label="Început amortizare" type="date" value={asset.depreciation_start} onChange={event => setAsset({ ...asset, depreciation_start: event.target.value })} />
          <Input label="Valoare" type="number" step="0.01" value={asset.acquisition_value} onChange={event => setAsset({ ...asset, acquisition_value: event.target.value })} required />
          <Input label="Valoare reziduală" type="number" step="0.01" value={asset.residual_value} onChange={event => setAsset({ ...asset, residual_value: event.target.value })} />
          <Input label="Durată (luni)" type="number" value={asset.useful_life_months} onChange={event => setAsset({ ...asset, useful_life_months: event.target.value })} required />
          <label className="grid gap-1 text-sm"><span className="font-medium text-slate-700">Categorie</span><select className="h-10 rounded-md border border-slate-300 bg-white px-3" value={asset.category_code} onChange={event => { const category = assetCategories.find(item => item.code === event.target.value); setAsset({ ...asset, category_code: event.target.value, useful_life_months: category?.default_life_months || asset.useful_life_months }) }}>{assetCategories.map(item => <option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}</select></label>
          <Input label="Locație" value={asset.location} onChange={event => setAsset({ ...asset, location: event.target.value })} />
          <Input label="Responsabil" value={asset.custodian} onChange={event => setAsset({ ...asset, custodian: event.target.value })} />
          <div className="flex items-end"><Button type="submit" disabled={busy === 'asset'}>{busy === 'asset' ? 'Se salvează...' : 'Adaugă imobilizare'}</Button></div>
        </form>
      </Card>
      <Table headers={['Inventar', 'Denumire', 'Valoare', 'Amortizat', 'Valoare netă', 'Durată', 'Acțiuni']}>
        {(status.fixed_assets || []).map(row => (
          <tr key={row.uuid}>
            <td className="px-3 py-2 font-mono">{row.inventory_no}</td>
            <td className="px-3 py-2">{row.name}</td>
            <td className="px-3 py-2 text-right">{formatMoney(row.acquisition_value)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(row.accumulated_depreciation)}</td>
            <td className="px-3 py-2 text-right font-semibold">{formatMoney(row.net_value)}</td>
            <td className="px-3 py-2 text-right">{row.useful_life_months} luni</td>
            <td className="px-3 py-2"><DropdownMenu align="right" label="Acțiuni" items={[
              { label: 'Pune în funcțiune', onClick: () => assetAction(row, 'punere_in_functiune') },
              { label: 'Transferă', onClick: () => assetAction(row, 'transfer') },
              { label: 'Reevaluează', onClick: () => assetAction(row, 'reevaluare') },
              { label: 'Tipărește fișa', onClick: () => download(`/accounting/fixed-assets/${row.uuid}/print`, '', true) },
              { label: 'Proces-verbal scoatere', onClick: () => download(`/accounting/fixed-assets/${row.uuid}/disposal-report`, '', true) },
              { type: 'separator' },
              { label: 'Casează', onClick: () => assetAction(row, 'casare'), danger: true },
              { label: 'Scoate din evidență fără notă', onClick: () => cancelAsset(row), danger: true }
            ]} /></td>
          </tr>
        ))}
      </Table>
      <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={inventoryAssets} disabled={busy === 'asset-inventory'}>Inventariază registrul</Button><Button onClick={runDepreciation} disabled={busy === 'depreciation'}>{busy === 'depreciation' ? 'Se calculează...' : `Calculează amortizarea ${month}`}</Button></div>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Închidere anuală {year}</h3>
            <p className="mt-1 text-sm text-slate-500">Închide conturile 6 și 7 prin contul 121 înainte de închiderea lunii decembrie.</p>
          </div>
          <Badge tone={annual.can_close ? 'success' : 'warning'}>{annual.can_close ? 'pregătit' : 'blocat'}</Badge>
        </div>
        <div className="mt-4 grid gap-3 border-y border-slate-100 py-3 text-sm md:grid-cols-3">
          <div><div className="text-xs text-slate-500">Venituri</div><strong>{formatMoney(annual.revenues || 0)}</strong></div>
          <div><div className="text-xs text-slate-500">Cheltuieli</div><strong>{formatMoney(annual.expenses || 0)}</strong></div>
          <div><div className="text-xs text-slate-500">Rezultat</div><strong>{formatMoney(annual.result || 0)}</strong></div>
        </div>
        {annual.blockers?.length ? <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{annual.blockers.join(' ')}</div> : null}
        <div className="mt-4 flex justify-end"><Button onClick={closeYear} disabled={busy === 'annual' || !annual.can_close}>{busy === 'annual' ? 'Se generează...' : 'Generează nota anuală'}</Button></div>
        <div className="mt-3 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-600">Report în {Number(year) + 1}: {carryforward.entries?.length || 0} solduri. {carryforward.blockers?.join(' ')}</div>
            <Button variant="secondary" onClick={carryforwardBalances} disabled={busy === 'carryforward' || !carryforward.can_carryforward}>{busy === 'carryforward' ? 'Se reportează...' : 'Reportează soldurile'}</Button>
          </div>
        </div>
      </Card>

      <Modal open={batchModal} title="Factură furnizor din NIR-uri" onClose={() => setBatchModal(false)} size="lg">
        <form className="grid gap-4" onSubmit={createBatchInvoice}>
          <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">{selectedReceiptRows.length} NIR-uri · {selectedReceiptRows[0]?.supplier || 'Furnizor'} · total recepții <strong>{formatMoney(selectedReceiptTotal)}</strong></div>
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Număr factură" value={batchForm.nr_document} onChange={event => setBatchForm({ ...batchForm, nr_document: event.target.value })} required />
            <Input label="Total factură" type="number" min="0.01" step="0.01" value={batchForm.total_factura} onChange={event => setBatchForm({ ...batchForm, total_factura: event.target.value })} required />
            <Input label="Data facturii" type="date" value={batchForm.data} onChange={event => setBatchForm({ ...batchForm, data: event.target.value })} required />
            <Input label="Scadență" type="date" value={batchForm.data_scadenta} onChange={event => setBatchForm({ ...batchForm, data_scadenta: event.target.value })} required />
          </div>
          <label className="flex items-start gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"><input className="mt-1" type="checkbox" checked={batchForm.distribute_difference} onChange={event => setBatchForm({ ...batchForm, distribute_difference: event.target.checked })} /><span><strong>Distribuie diferența pe liniile facturii</strong><br />Păstrează cotele TVA și ajustează proporțional valorile liniilor pentru ca totalul să corespundă facturii.</span></label>
          <div className="max-h-48 overflow-auto rounded-md border border-slate-200">{selectedReceiptRows.map(row => <div key={row.id} className="flex justify-between gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-0"><span>{row.nr_nir || row.document} · {row.date}</span><strong>{formatMoney(row.total)}</strong></div>)}</div>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setBatchModal(false)}>Renunță</Button><Button type="submit" disabled={busy === 'receipt-batch'}>Creează factura draft</Button></div>
        </form>
      </Modal>

      <Modal open={creditModal} title="Notă de credit furnizor" onClose={() => setCreditModal(false)}>
        <form className="grid gap-4" onSubmit={saveCreditNote}>
          <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Retur {formatMoney(creditTarget?.pending_return?.total || 0)} · factura {creditTarget?.linked_invoice?.document || '-'}. Validarea notei va reduce soldul furnizorului și va genera nota contabilă.</div>
          <Input label="Număr notă de credit" value={creditForm.nr_document} onChange={event => setCreditForm({ ...creditForm, nr_document: event.target.value })} required />
          <Input label="Data notei" type="date" value={creditForm.data} onChange={event => setCreditForm({ ...creditForm, data: event.target.value })} required />
          <Input label="Observații" value={creditForm.observatii} onChange={event => setCreditForm({ ...creditForm, observatii: event.target.value })} />
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setCreditModal(false)}>Renunță</Button><Button type="submit" disabled={busy === 'credit-note'}>Salvează draft</Button></div>
        </form>
      </Modal>
    </AccountingShell>
  )
}

export default OperatiuniContabile
