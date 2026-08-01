import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../../api/client'
import Card from '../../components/ui/Card'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import { formatMoney } from '../../utils/format'
import { AccountingShell, DropdownMenu, Info, Table, currentMonth, money, today } from './accounting-shared'

function monthStart() {
  return `${currentMonth()}-01`
}

export function CarteaMare() {
  const [searchParams] = useSearchParams()
  const [from, setFrom] = useState(searchParams.get('de_la') || monthStart())
  const [to, setTo] = useState(searchParams.get('pana_la') || today())
  const [clasa, setClasa] = useState(searchParams.get('clasa') || '')
  const [q, setQ] = useState(searchParams.get('q') || '')
  const [onlyWithValues, setOnlyWithValues] = useState(true)
  const [data, setData] = useState({ accounts: [], totals: {}, perioada: {} })
  const [error, setError] = useState('')

  useEffect(() => { load() }, [from, to, clasa, onlyWithValues])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return data.accounts || []
    return (data.accounts || []).filter(row => `${row.simbol} ${row.denumire}`.toLowerCase().includes(needle))
  }, [data.accounts, q])

  const filteredTotals = useMemo(() => rows.reduce((acc, row) => {
    acc.sold_initial = money(acc.sold_initial + row.sold_initial)
    acc.total_debit = money(acc.total_debit + row.total_debit)
    acc.total_credit = money(acc.total_credit + row.total_credit)
    acc.sold_final = money(acc.sold_final + row.sold_final)
    acc.movements_count += Number(row.movements_count || 0)
    return acc
  }, { sold_initial: 0, total_debit: 0, total_credit: 0, sold_final: 0, movements_count: 0 }), [rows])
  const reportMonth = String(from || currentMonth()).slice(0, 7)
  const activeFilterLabels = [
    `${from || 'start'} → ${to || 'final'}`,
    clasa ? `clasa ${clasa}` : '',
    q ? `căutare: ${q}` : '',
    onlyWithValues ? 'doar conturi cu valori' : 'toate conturile'
  ].filter(Boolean)
  const ledgerFlow = buildLedgerFlow({
    balanced: data.totals?.balanced,
    rowsCount: rows.length,
    totalRows: data.accounts?.length || 0,
    movementsCount: filteredTotals.movements_count || 0,
    reportMonth,
    activeFilterLabels,
    load,
    exportExcel
  })

  function params() {
    return {
      de_la: from || undefined,
      pana_la: to || undefined,
      clasa: clasa || undefined,
      q: q || undefined,
      only_with_values: onlyWithValues
    }
  }

  function load() {
    setError('')
    api.get('/accounting/general-ledger', { params: params() })
      .then(res => setData(res.data || { accounts: [], totals: {}, perioada: {} }))
      .catch(err => {
        setData({ accounts: [], totals: {}, perioada: {} })
        setError(err.response?.data?.error || 'Nu am putut incarca Cartea Mare.')
      })
  }

  async function exportExcel() {
    const res = await api.get('/accounting/general-ledger/export', { params: params(), responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const link = document.createElement('a')
    link.href = url
    link.download = `Cartea_Mare_${from || 'start'}_${to || 'final'}.xlsx`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <AccountingShell
      active="cartea-mare"
      title="Cartea Mare"
      subtitle="Solduri si miscari pe toate conturile, cu legatura spre fisa fiecarui cont."
      actions={<DropdownMenu align="right" label="Actiuni" items={[
        { label: 'Reincarca raport', onClick: load },
        { label: 'Export Excel', onClick: exportExcel },
        { type: 'separator' },
        { label: 'Balanta', to: `/contabilitate/balanta?luna=${String(from || currentMonth()).slice(0, 7)}` },
        { label: 'Registru jurnal', to: `/contabilitate/registru-jurnal?luna=${String(from || currentMonth()).slice(0, 7)}` }
      ]} />}
    >
      {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Card>
        <div className="grid gap-3 lg:grid-cols-[160px_160px_150px_minmax(180px,1fr)]">
          <Input label="De la" type="date" value={from} onChange={event => setFrom(event.target.value)} />
          <Input label="Pana la" type="date" value={to} onChange={event => setTo(event.target.value)} />
          <Select label="Clasa" value={clasa} onChange={event => setClasa(event.target.value)} options={[{ value: '', label: 'Toate clasele' }, ...[1,2,3,4,5,6,7,8,9].map(value => ({ value: String(value), label: `Clasa ${value}` }))]} />
          <Input label="Cauta cont" value={q} onChange={event => setQ(event.target.value)} placeholder="401, TVA, banca..." />
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm font-medium text-slate-700">
          <input type="checkbox" checked={onlyWithValues} onChange={event => setOnlyWithValues(event.target.checked)} />
          Afiseaza doar conturi cu sold sau miscari
        </label>
      </Card>
      <Card>
        <div className={`rounded-xl border px-4 py-4 ${ledgerFlow.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : ledgerFlow.tone === 'danger' ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-75">Flux simplu Cartea Mare</div>
              <h3 className="mt-1 text-lg font-bold">{ledgerFlow.title}</h3>
              <p className="mt-1 text-sm opacity-90">{ledgerFlow.detail}</p>
              <div className="mt-4 grid gap-2 md:grid-cols-4">
                {ledgerFlow.steps.map(step => (
                  <div key={step.label} className={`rounded-md border px-3 py-3 text-sm ${step.ok ? 'border-emerald-200 bg-white/70' : 'border-amber-200 bg-amber-50'}`}>
                    <strong className="block">{step.label}</strong>
                    <span className="mt-1 block text-xs opacity-80">{step.detail}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:min-w-56">
              {ledgerFlow.primary.to ? (
                <Link to={ledgerFlow.primary.to} className="rounded-md bg-slate-900 px-4 py-2 text-center text-sm font-semibold text-white shadow-sm hover:bg-slate-800">{ledgerFlow.primary.label}</Link>
              ) : (
                <button type="button" onClick={ledgerFlow.primary.onClick} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800">{ledgerFlow.primary.label}</button>
              )}
              <span className="text-xs opacity-75">{activeFilterLabels.join(' · ')}</span>
            </div>
          </div>
        </div>
      </Card>
      <div className={`rounded-md px-3 py-2 text-sm ${data.totals?.balanced ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
        {data.totals?.balanced ? 'Cartea Mare este coerenta pe intervalul selectat.' : 'Exista diferente intre sold initial + rulaje si sold final.'}
      </div>
      <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Info label="Conturi" value={rows.length} />
        <Info label="Sold initial" value={formatMoney(filteredTotals.sold_initial || 0)} />
        <Info label="Rulaj debit" value={formatMoney(filteredTotals.total_debit || 0)} />
        <Info label="Rulaj credit" value={formatMoney(filteredTotals.total_credit || 0)} />
        <Info label="Sold final" value={formatMoney(filteredTotals.sold_final || 0)} />
        <Info label="Miscari" value={filteredTotals.movements_count || 0} />
        <Info label="Conturi total" value={data.accounts?.length || 0} />
        <Info label="Filtru" value={onlyWithValues ? 'cu valori' : 'toate'} />
      </div>
      <Table headers={['Cont', 'Denumire', 'Tip', 'Sold initial', 'Debit', 'Credit', 'Sold final', 'Natura', 'Miscari', 'Actiuni']}>
        {rows.map(row => (
          <tr key={row.simbol} className="hover:bg-slate-50">
            <td className="px-3 py-2">
              <Link className="font-mono font-semibold text-primary-700 hover:underline" to={`/contabilitate/fisa-cont/${row.simbol}?de_la=${from}&pana_la=${to}`}>{row.simbol}</Link>
            </td>
            <td className="px-3 py-2">{row.denumire}</td>
            <td className="px-3 py-2">{row.tip || '-'}</td>
            <td className="px-3 py-2 text-right">{formatMoney(row.sold_initial || 0)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(row.total_debit || 0)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(row.total_credit || 0)}</td>
            <td className="px-3 py-2 text-right font-semibold">{formatMoney(row.sold_final || 0)}</td>
            <td className="px-3 py-2 text-center font-semibold">{money(row.sold_final) > 0 ? 'D' : money(row.sold_final) < 0 ? 'C' : '-'}</td>
            <td className="px-3 py-2 text-right">{row.movements_count || 0}</td>
            <td className="px-3 py-2">
              <DropdownMenu align="right" label="Actiuni" items={[
                { label: 'Fisa cont', to: `/contabilitate/fisa-cont/${row.simbol}?de_la=${from}&pana_la=${to}` },
                { label: 'Registru jurnal', to: `/contabilitate/registru-jurnal?luna=${String(from || currentMonth()).slice(0, 7)}` }
              ]} />
            </td>
          </tr>
        ))}
        {rows.length ? (
          <tr className="bg-slate-50 font-semibold">
            <td className="px-3 py-2">TOTAL</td>
            <td className="px-3 py-2" colSpan={2}>{rows.length} conturi</td>
            <td className="px-3 py-2 text-right">{formatMoney(filteredTotals.sold_initial || 0)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(filteredTotals.total_debit || 0)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(filteredTotals.total_credit || 0)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(filteredTotals.sold_final || 0)}</td>
            <td className="px-3 py-2 text-center">-</td>
            <td className="px-3 py-2 text-right">{filteredTotals.movements_count || 0}</td>
            <td className="px-3 py-2">-</td>
          </tr>
        ) : null}
      </Table>
    </AccountingShell>
  )
}

export default CarteaMare

function buildLedgerFlow({ balanced, rowsCount, totalRows, movementsCount, reportMonth, activeFilterLabels, load, exportExcel }) {
  const hasRows = rowsCount > 0
  const hasMovements = movementsCount > 0
  const steps = [
    { label: 'Interval', ok: true, detail: activeFilterLabels[0] || reportMonth },
    { label: 'Conturi', ok: hasRows, detail: hasRows ? `${rowsCount} din ${totalRows} afișate` : 'Nu sunt conturi în filtrul curent' },
    { label: 'Mișcări', ok: hasMovements, detail: hasMovements ? `${movementsCount} mișcări` : 'Fără mișcări pe interval' },
    { label: 'Coerență', ok: balanced !== false, detail: balanced === false ? 'Soldurile nu se închid pe unele conturi' : 'Soldurile se închid corect' }
  ]
  if (!hasRows) {
    return {
      tone: 'warning',
      title: 'Cartea Mare nu are conturi în filtrul curent.',
      detail: 'Lărgește filtrul sau reîncarcă raportul pentru intervalul selectat.',
      steps,
      primary: { label: 'Reîncarcă raportul', onClick: load }
    }
  }
  if (balanced === false) {
    return {
      tone: 'danger',
      title: 'Cartea Mare are diferențe de coerență.',
      detail: 'Verifică balanța și registrul jurnal pentru luna filtrată înainte de închidere.',
      steps,
      primary: { label: 'Deschide Balanța', to: `/contabilitate/balanta?luna=${reportMonth}` }
    }
  }
  return {
    tone: 'success',
    title: 'Cartea Mare este coerentă pe intervalul selectat.',
    detail: hasMovements ? 'Poți exporta raportul sau deschide fișa unui cont pentru detalii.' : 'Nu sunt mișcări în filtrul curent, dar soldurile se închid corect.',
    steps,
    primary: { label: 'Export Excel', onClick: exportExcel }
  }
}
