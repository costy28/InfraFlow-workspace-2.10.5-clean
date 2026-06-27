import { useEffect, useState } from 'react'
import api from '../../api/client'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/forms/Input'
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
  const [asset, setAsset] = useState(defaultAsset())
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { load() }, [month, year])

  function load() {
    setError('')
    Promise.all([
      api.get('/accounting/operations/status'),
      api.get('/accounting/stock-sync/status', { params: { perioada: month } }),
      api.get(`/accounting/annual-close/${year}/check`),
      api.get('/accounting/bank-reconciliation', { params: { perioada: month } }),
      api.get('/accounting/stock-valuation', { params: { perioada: month } }),
      api.get(`/accounting/annual-close/${year}/carryforward-check`)
    ]).then(([statusRes, stockRes, annualRes, reconciliationRes, valuationRes, carryforwardRes]) => {
      setStatus(statusRes.data || {})
      setStock(stockRes.data || { pending: [], errors: [] })
      setAnnual(annualRes.data || { blockers: [] })
      setReconciliation(reconciliationRes.data || { operations: [], summary: {} })
      setValuation(valuationRes.data || { rows: [], errors: [], totals: {} })
      setCarryforward(carryforwardRes.data || { blockers: [], entries: [] })
    }).catch(err => setError(err.response?.data?.error || 'Operațiunile contabile nu au putut fi încărcate.'))
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

  async function finalizeBankImport(batch) {
    setBusy(`batch-${batch.id}`); setError(''); setMessage('')
    try {
      await api.post(`/accounting/bank-imports/${batch.id}/finalize`)
      setMessage(`Extrasul ${batch.file_name} a fost marcat procesat.`)
      load()
    } catch (err) { setError(err.response?.data?.error || 'Extrasul nu poate fi finalizat încă.') } finally { setBusy('') }
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
        { label: 'Registru jurnal', to: `/contabilitate/registru-jurnal?luna=${month}` }
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
          <Badge tone={reconciliation.summary?.pending ? 'warning' : 'success'}>{reconciliation.summary?.reconciled || 0}/{reconciliation.summary?.total || 0} reconciliate</Badge>
        </div>
        <div className="mt-4 space-y-2">
          {(reconciliation.operations || []).filter(row => row.corelare_tip === 'neclasificat').slice(0, 10).map(row => (
            <div key={row.uuid || row.id} className="grid gap-2 border-t border-slate-100 py-2 text-sm md:grid-cols-[120px_1fr_150px_1fr_auto] md:items-center">
              <span>{row.data}</span><span className="min-w-0 truncate">{row.explicatie || row.nr_document}</span><strong className="text-right">{formatMoney(row.suma)}</strong>
              <span>{row.best_suggestion ? `${row.best_suggestion.document} · ${row.best_suggestion.tert} · ${row.best_suggestion.score}%` : 'Fără sugestie sigură'}</span>
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
              { type: 'separator' },
              { label: 'Casează', onClick: () => assetAction(row, 'casare'), danger: true },
              { label: 'Scoate din evidență fără notă', onClick: () => cancelAsset(row), danger: true }
            ]} /></td>
          </tr>
        ))}
      </Table>
      <div className="flex justify-end"><Button onClick={runDepreciation} disabled={busy === 'depreciation'}>{busy === 'depreciation' ? 'Se calculează...' : `Calculează amortizarea ${month}`}</Button></div>

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
    </AccountingShell>
  )
}

export default OperatiuniContabile
