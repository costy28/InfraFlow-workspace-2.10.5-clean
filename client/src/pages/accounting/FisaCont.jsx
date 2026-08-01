import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import api from '../../api/client'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import { formatMoney } from '../../utils/format'
import { AccountSelect, AccountingShell, DropdownMenu, Info, Table, currentMonth, money, statusTone, today } from './accounting-shared'
export function FisaCont() {
  const { simbol } = useParams()
  const [searchParams] = useSearchParams()
  const [from, setFrom] = useState(searchParams.get('de_la') || `${currentMonth()}-01`)
  const [to, setTo] = useState(searchParams.get('pana_la') || today())
  const [data, setData] = useState({ movements: [], sold_initial: 0, total_debit: 0, total_credit: 0, sold_final: 0 })
  const [error, setError] = useState('')
  const reportMonth = (from || currentMonth()).slice(0, 7)
  const movementsCount = data.movements?.length || 0
  const finalBalance = money(data.sold_final || 0)
  const balanceNature = finalBalance > 0 ? 'debitor' : finalBalance < 0 ? 'creditor' : 'zero'
  const accountFlow = buildAccountLedgerFlow({
    simbol,
    from,
    to,
    reportMonth,
    movementsCount,
    monthlyCount: data.monthly_summary?.length || 0,
    soldInitial: data.sold_initial || 0,
    debit: data.total_debit || 0,
    credit: data.total_credit || 0,
    soldFinal: finalBalance,
    balanceNature,
    load,
    exportExcel
  })
  useEffect(() => { load() }, [simbol, from, to])

  function load() {
    api.get(`/accounting/ledger/${simbol}`, { params: { de_la: from, pana_la: to } })
      .then(res => { setData(res.data); setError('') })
      .catch(err => {
        setData({ movements: [], sold_initial: 0, total_debit: 0, total_credit: 0, sold_final: 0 })
        setError(err.response?.data?.error || 'Nu am putut incarca fisa contului.')
      })
  }

  async function exportExcel() {
    const res = await api.get(`/accounting/ledger/${simbol}/export`, { params: { de_la: from, pana_la: to }, responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const link = document.createElement('a')
    link.href = url
    link.download = `Fisa_cont_${simbol}.xlsx`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <AccountingShell active="plan" title={`Fisa cont ${simbol}`} subtitle={data.denumire || 'Carte mare pe cont, cu sold progresiv.'} actions={<DropdownMenu align="right" label="Actiuni" items={[
      { label: 'Reincarca fisa', onClick: load },
      { label: 'Export Excel', onClick: exportExcel },
      { type: 'separator' },
      { label: 'Balanta', to: `/contabilitate/balanta?luna=${reportMonth}` },
      { label: 'Registru jurnal', to: `/contabilitate/registru-jurnal?luna=${reportMonth}` },
      { label: 'Cartea Mare', to: `/contabilitate/cartea-mare?de_la=${from}&pana_la=${to}` }
    ]} />}>
      {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Card>
        <div className="grid gap-3 md:grid-cols-[180px_180px]">
          <Input label="De la" type="date" value={from} onChange={event => setFrom(event.target.value)} />
          <Input label="Pana la" type="date" value={to} onChange={event => setTo(event.target.value)} />
        </div>
      </Card>
      <Card>
        <div className={`rounded-xl border px-4 py-4 ${accountFlow.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : accountFlow.tone === 'info' ? 'border-sky-200 bg-sky-50 text-sky-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-75">Flux simplu fișă cont</div>
              <h3 className="mt-1 text-lg font-bold">{accountFlow.title}</h3>
              <p className="mt-1 text-sm opacity-90">{accountFlow.detail}</p>
              <div className="mt-4 grid gap-2 md:grid-cols-4">
                {accountFlow.steps.map(step => (
                  <div key={step.label} className={`rounded-md border px-3 py-3 text-sm ${step.ok ? 'border-emerald-200 bg-white/70' : 'border-amber-200 bg-amber-50'}`}>
                    <strong className="block">{step.label}</strong>
                    <span className="mt-1 block text-xs opacity-80">{step.detail}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:min-w-56">
              {accountFlow.primary.to ? (
                <Link to={accountFlow.primary.to} className="rounded-md bg-slate-900 px-4 py-2 text-center text-sm font-semibold text-white shadow-sm hover:bg-slate-800">{accountFlow.primary.label}</Link>
              ) : (
                <button type="button" onClick={accountFlow.primary.onClick} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800">{accountFlow.primary.label}</button>
              )}
              <span className="text-xs opacity-75">{from || 'start'} → {to || 'final'} · sold {balanceNature}</span>
            </div>
          </div>
        </div>
      </Card>
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Info label="Sold initial" value={formatMoney(data.sold_initial || 0)} />
        <Info label="Rulaj debit" value={formatMoney(data.total_debit || 0)} />
        <Info label="Rulaj credit" value={formatMoney(data.total_credit || 0)} />
        <Info label="Sold final" value={formatMoney(data.sold_final || 0)} />
        <Info label="Mișcări" value={movementsCount} />
        <Info label="Natura sold" value={balanceNature} />
      </div>
      {(data.monthly_summary || []).length ? (
        <Table headers={['Luna', 'Sold initial', 'Rulaj debit', 'Rulaj credit', 'Sold final', 'Miscari']}>
          {(data.monthly_summary || []).map(row => (
            <tr key={row.luna}>
              <td className="px-3 py-2 font-semibold">{row.luna}</td>
              <td className="px-3 py-2 text-right">{formatMoney(row.sold_initial)}</td>
              <td className="px-3 py-2 text-right">{formatMoney(row.debit)}</td>
              <td className="px-3 py-2 text-right">{formatMoney(row.credit)}</td>
              <td className="px-3 py-2 text-right font-semibold">{formatMoney(row.sold_final)}</td>
              <td className="px-3 py-2 text-right">{row.miscari}</td>
            </tr>
          ))}
        </Table>
      ) : null}
      <Table headers={['Data', 'Document', 'Tip', 'Corespondent', 'Explicatie', 'Debit', 'Credit', 'Sold']}>
        {data.movements.map(row => (
          <tr key={row.id} className="hover:bg-slate-50">
            <td className="px-3 py-2">{row.data}</td>
            <td className="px-3 py-2"><Link className="font-semibold text-primary-700 hover:underline" to={`/contabilitate/registru-jurnal?luna=${String(row.data || reportMonth).slice(0, 7)}`}>{row.nr_document || '-'}</Link></td>
            <td className="px-3 py-2">{row.tip_document}</td>
            <td className="px-3 py-2 font-mono text-xs">{(row.conturi_corespondente || []).join(', ') || '-'}</td>
            <td className="px-3 py-2">{row.explicatie}</td>
            <td className="px-3 py-2 text-right">{row.debit ? formatMoney(row.debit) : '-'}</td>
            <td className="px-3 py-2 text-right">{row.credit ? formatMoney(row.credit) : '-'}</td>
            <td className="px-3 py-2 text-right font-semibold">{formatMoney(row.sold)}</td>
          </tr>
        ))}
        {data.movements.length ? (
          <tr className="bg-slate-50 font-semibold">
            <td className="px-3 py-2">TOTAL</td>
            <td className="px-3 py-2" colSpan={4}>{data.movements.length} miscari</td>
            <td className="px-3 py-2 text-right">{formatMoney(data.total_debit || 0)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(data.total_credit || 0)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(data.sold_final || 0)}</td>
          </tr>
        ) : null}
      </Table>
    </AccountingShell>
  )
}

export default FisaCont

function buildAccountLedgerFlow({ simbol, from, to, reportMonth, movementsCount, monthlyCount, soldInitial, debit, credit, soldFinal, balanceNature, load, exportExcel }) {
  const hasMovements = movementsCount > 0
  const hasMonthly = monthlyCount > 0
  const computedFinal = money(soldInitial + debit - credit)
  const consistent = Math.abs(money(computedFinal - soldFinal)) < 0.01
  const steps = [
    { label: 'Interval', ok: true, detail: `${from || 'start'} → ${to || 'final'}` },
    { label: 'Mișcări', ok: hasMovements, detail: hasMovements ? `${movementsCount} mișcări` : 'Nu există mișcări în interval' },
    { label: 'Lunar', ok: hasMonthly || !hasMovements, detail: hasMonthly ? `${monthlyCount} luni cu sumar` : 'Sumar lunar indisponibil' },
    { label: 'Sold', ok: consistent, detail: consistent ? `Sold ${balanceNature}: ${formatMoney(soldFinal)}` : 'Soldul final nu se potrivește cu rulajele' }
  ]
  if (!hasMovements) {
    return {
      tone: 'info',
      title: `Contul ${simbol} nu are mișcări în intervalul selectat.`,
      detail: `Soldul final este ${formatMoney(soldFinal)}. Poți lărgi intervalul sau verifica Balanta lunii.`,
      steps,
      primary: { label: 'Deschide Balanța', to: `/contabilitate/balanta?luna=${reportMonth}` }
    }
  }
  if (!consistent) {
    return {
      tone: 'warning',
      title: `Fișa contului ${simbol} are o diferență de sold.`,
      detail: 'Verifică Registrul jurnal pentru documentele din interval înainte de închidere.',
      steps,
      primary: { label: 'Deschide Registru jurnal', to: `/contabilitate/registru-jurnal?luna=${reportMonth}` }
    }
  }
  return {
    tone: 'success',
    title: `Fișa contului ${simbol} este coerentă.`,
    detail: `Sold inițial + rulaje = sold final ${balanceNature}. Poți exporta fișa sau verifica documentul din tabel.`,
    steps,
    primary: { label: 'Export Excel', onClick: exportExcel },
    secondary: { label: 'Reîncarcă fișa', onClick: load }
  }
}
