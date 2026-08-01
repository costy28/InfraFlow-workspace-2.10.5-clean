import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../../api/client'
import Card from '../../components/ui/Card'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import { formatMoney } from '../../utils/format'
import { AccountingShell, DropdownMenu, Info, Table, currentMonth, money } from './accounting-shared'
export function Balanta() {
  const [searchParams] = useSearchParams()
  const [month, setMonth] = useState(searchParams.get('luna') || currentMonth())
  const [tip, setTip] = useState('sintetica')
  const [clasa, setClasa] = useState('')
  const [q, setQ] = useState('')
  const [onlyWithValues, setOnlyWithValues] = useState(true)
  const [data, setData] = useState({ rows: [], totals: {}, balanced: true })
  const [an, luna] = month.split('-')
  const monthStart = `${month}-01`
  const monthEnd = `${month}-31`
  const rows = useMemo(() => data.rows.filter(row =>
    (!clasa || String(row.cont || '').startsWith(clasa)) &&
    (!q || `${row.cont || ''} ${row.denumire || ''}`.toLowerCase().includes(q.toLowerCase())) &&
    (!onlyWithValues || ['sume_precedente_D', 'sume_precedente_C', 'rulaje_D', 'rulaje_C', 'sold_D', 'sold_C'].some(key => Math.abs(money(row[key])) > 0.009))
  ), [data.rows, clasa, q, onlyWithValues])
  const filteredTotals = useMemo(() => rows.reduce((acc, row) => {
    ['sume_precedente_D', 'sume_precedente_C', 'rulaje_D', 'rulaje_C', 'sume_totale_D', 'sume_totale_C', 'sold_D', 'sold_C'].forEach(key => { acc[key] = money((acc[key] || 0) + row[key]) })
    return acc
  }, {}), [rows])
  const totalDifference = Math.abs(money(data.totals.sume_totale_D) - money(data.totals.sume_totale_C))
  const filteredDifference = Math.abs(money(filteredTotals.sume_totale_D) - money(filteredTotals.sume_totale_C))
  const activeFilterLabels = [
    tip === 'analitica' ? 'analitică' : 'sintetică',
    clasa ? `clasa ${clasa}` : '',
    q ? `căutare: ${q}` : '',
    onlyWithValues ? 'doar conturi cu valori' : 'toate conturile'
  ].filter(Boolean)
  const balanceFlow = buildBalanceFlow({
    balanced: data.balanced,
    totalDifference,
    filteredDifference,
    rowsCount: rows.length,
    totalRows: data.rows.length,
    month,
    monthStart,
    monthEnd,
    activeFilterLabels,
    load,
    exportExcel
  })

  useEffect(() => { load() }, [month, tip])

  function load() {
    api.get('/accounting/balance-sheet', { params: { an, luna, tip } })
      .then(res => setData(res.data))
      .catch(() => setData({ rows: [], totals: {}, balanced: false }))
  }

  async function exportExcel() {
    const res = await api.get('/accounting/balance-sheet/export', { params: { an, luna, tip }, responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const link = document.createElement('a')
    link.href = url
    link.download = `Balanta_${tip}_${an}_${luna}.xlsx`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <AccountingShell
      active="balanta"
      title="Balanta"
      subtitle="Verificare rulaje, solduri si egalitate debit-credit."
      actions={<DropdownMenu align="right" label="Actiuni" items={[
        { label: 'Reincarca balanta', onClick: load },
        { label: 'Export Excel', onClick: exportExcel },
        { type: 'separator' },
        { label: 'Registru jurnal', to: `/contabilitate/registru-jurnal?luna=${month}` },
        { label: 'Cartea Mare', to: `/contabilitate/cartea-mare?de_la=${monthStart}&pana_la=${monthEnd}` }
      ]} />}
    >
      <Card>
        <div className="grid gap-3 md:grid-cols-[180px_180px_180px_minmax(200px,1fr)]">
          <Input label="Luna" type="month" value={month} onChange={event => setMonth(event.target.value)} />
          <Select label="Tip balanta" value={tip} onChange={event => setTip(event.target.value)} options={[{ value: 'sintetica', label: 'Sintetica' }, { value: 'analitica', label: 'Analitica' }]} />
          <Select label="Clasa cont" value={clasa} onChange={event => setClasa(event.target.value)} options={[{ value: '', label: 'Toate clasele' }, ...[1,2,3,4,5,6,7,8,9].map(value => ({ value: String(value), label: `Clasa ${value}` }))]} />
          <Input label="Cauta cont" value={q} onChange={event => setQ(event.target.value)} placeholder="401, TVA, cheltuieli..." />
        </div>
        <div className="mt-3">
          <label className="flex items-end gap-2 pb-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={onlyWithValues} onChange={event => setOnlyWithValues(event.target.checked)} />
            Doar conturi cu rulaj sau sold
          </label>
        </div>
      </Card>
      <Card>
        <div className={`rounded-xl border px-4 py-4 ${balanceFlow.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-75">Flux simplu balanță</div>
              <h3 className="mt-1 text-lg font-bold">{balanceFlow.title}</h3>
              <p className="mt-1 text-sm opacity-90">{balanceFlow.detail}</p>
              <div className="mt-4 grid gap-2 md:grid-cols-4">
                {balanceFlow.steps.map(step => (
                  <div key={step.label} className={`rounded-md border px-3 py-3 text-sm ${step.ok ? 'border-emerald-200 bg-white/70' : 'border-amber-200 bg-amber-50'}`}>
                    <strong className="block">{step.label}</strong>
                    <span className="mt-1 block text-xs opacity-80">{step.detail}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:min-w-56">
              {balanceFlow.primary.to ? (
                <Link to={balanceFlow.primary.to} className="rounded-md bg-slate-900 px-4 py-2 text-center text-sm font-semibold text-white shadow-sm hover:bg-slate-800">{balanceFlow.primary.label}</Link>
              ) : (
                <button type="button" onClick={balanceFlow.primary.onClick} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800">{balanceFlow.primary.label}</button>
              )}
              <span className="text-xs opacity-75">{activeFilterLabels.join(' · ')}</span>
            </div>
          </div>
        </div>
      </Card>
      <div className={`rounded-md px-3 py-2 text-sm ${data.balanced ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
        {data.balanced ? 'Balanta este echilibrata.' : `Balanta nu este echilibrata: diferenta ${formatMoney(Math.abs(money(data.totals.sume_totale_D) - money(data.totals.sume_totale_C)))}`}
      </div>
      <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Info label="Sold init. debit" value={formatMoney(filteredTotals.sume_precedente_D || 0)} />
        <Info label="Sold init. credit" value={formatMoney(filteredTotals.sume_precedente_C || 0)} />
        <Info label="Rulaj debit" value={formatMoney(filteredTotals.rulaje_D || 0)} />
        <Info label="Rulaj credit" value={formatMoney(filteredTotals.rulaje_C || 0)} />
        <Info label="Sold debit" value={formatMoney(filteredTotals.sold_D || 0)} />
        <Info label="Sold credit" value={formatMoney(filteredTotals.sold_C || 0)} />
        <Info label="Diferență filtrată" value={formatMoney(filteredDifference || 0)} />
        <Info label="Conturi afișate" value={`${rows.length}/${data.rows.length}`} />
      </div>
      <Table headers={['Cont', 'Denumire', 'Init D', 'Init C', 'Rulaj D', 'Rulaj C', 'Sume D', 'Sume C', 'Sold D', 'Sold C', 'Actiuni']}>
        {rows.map(row => (
          <tr key={row.cont} className="hover:bg-slate-50">
            <td className="px-3 py-2">
              <Link className="font-mono font-semibold text-primary-700 hover:underline" to={`/contabilitate/fisa-cont/${row.cont}?de_la=${monthStart}&pana_la=${monthEnd}`}>{row.cont}</Link>
            </td>
            <td className="px-3 py-2">{row.denumire}</td>
            <td className="px-3 py-2 text-right">{formatMoney(row.sume_precedente_D)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(row.sume_precedente_C)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(row.rulaje_D)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(row.rulaje_C)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(row.sume_totale_D)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(row.sume_totale_C)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(row.sold_D)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(row.sold_C)}</td>
            <td className="px-3 py-2">
              <DropdownMenu align="right" label="Actiuni" items={[
                { label: 'Fisa cont', to: `/contabilitate/fisa-cont/${row.cont}?de_la=${monthStart}&pana_la=${monthEnd}` },
                { label: 'Cartea Mare', to: `/contabilitate/cartea-mare?de_la=${monthStart}&pana_la=${monthEnd}&q=${encodeURIComponent(row.cont)}` },
                { label: 'Registru jurnal', to: `/contabilitate/registru-jurnal?luna=${month}` }
              ]} />
            </td>
          </tr>
        ))}
        {rows.length ? (
          <tr className="bg-slate-50 font-semibold">
            <td className="px-3 py-2">TOTAL</td>
            <td className="px-3 py-2">{rows.length} conturi</td>
            <td className="px-3 py-2 text-right">{formatMoney(filteredTotals.sume_precedente_D || 0)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(filteredTotals.sume_precedente_C || 0)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(filteredTotals.rulaje_D || 0)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(filteredTotals.rulaje_C || 0)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(filteredTotals.sume_totale_D || 0)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(filteredTotals.sume_totale_C || 0)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(filteredTotals.sold_D || 0)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(filteredTotals.sold_C || 0)}</td>
            <td className="px-3 py-2">-</td>
          </tr>
        ) : null}
      </Table>
    </AccountingShell>
  )
}

export default Balanta

function buildBalanceFlow({ balanced, totalDifference, filteredDifference, rowsCount, totalRows, month, monthStart, monthEnd, activeFilterLabels, load, exportExcel }) {
  const hasRows = rowsCount > 0
  const hasFilters = activeFilterLabels.length > 1
  const steps = [
    { label: 'Perioadă', ok: Boolean(month), detail: month || 'Alege luna' },
    { label: 'Conturi', ok: hasRows, detail: hasRows ? `${rowsCount} din ${totalRows} afișate` : 'Nu sunt conturi în filtrul curent' },
    { label: 'Egalitate', ok: balanced, detail: balanced ? 'Debit = Credit pe total' : `Diferență ${formatMoney(totalDifference)}` },
    { label: 'Filtru', ok: true, detail: hasFilters ? activeFilterLabels.join(' · ') : 'fără filtre speciale' }
  ]
  if (!hasRows) {
    return {
      tone: 'warning',
      title: 'Balanța nu are rânduri în filtrul curent.',
      detail: 'Lărgește filtrul sau reincarcă balanța pentru luna selectată.',
      steps,
      primary: { label: 'Reîncarcă balanța', onClick: load }
    }
  }
  if (!balanced) {
    return {
      tone: 'danger',
      title: 'Balanța nu este echilibrată.',
      detail: `Diferența totală este ${formatMoney(totalDifference)}. Diferența pe filtrul curent este ${formatMoney(filteredDifference)}.`,
      steps,
      primary: { label: 'Deschide Registru jurnal', to: `/contabilitate/registru-jurnal?luna=${month}` }
    }
  }
  return {
    tone: 'success',
    title: 'Balanța este echilibrată.',
    detail: 'Poți exporta balanța sau continua verificarea pe Cartea Mare / Închidere lună.',
    steps,
    primary: { label: 'Export Excel', onClick: exportExcel },
    secondary: { label: 'Cartea Mare', to: `/contabilitate/cartea-mare?de_la=${monthStart}&pana_la=${monthEnd}` }
  }
}
