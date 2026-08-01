import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../../api/client'
import Card from '../../components/ui/Card'
import Select from '../../components/forms/Select'
import { formatMoney } from '../../utils/format'
import { AccountingShell, DropdownMenu, Info, Table, currentMonth } from './accounting-shared'

function splitMonth(value) {
  const [an, luna] = String(value || currentMonth()).split('-')
  return { an, luna }
}

export function ProfitPierdere() {
  const [searchParams] = useSearchParams()
  const [month, setMonth] = useState(searchParams.get('luna') || currentMonth())
  const [tip, setTip] = useState(searchParams.get('tip') || 'analitica')
  const [data, setData] = useState({ venituri: [], cheltuieli: [], totals: {}, perioada: {} })
  const [error, setError] = useState('')

  useEffect(() => { load() }, [month, tip])

  function params() {
    const parts = splitMonth(month)
    return { an: parts.an, luna: parts.luna, tip }
  }

  function load() {
    setError('')
    api.get('/accounting/profit-loss', { params: params() })
      .then(res => setData(res.data || { venituri: [], cheltuieli: [], totals: {}, perioada: {} }))
      .catch(err => {
        setData({ venituri: [], cheltuieli: [], totals: {}, perioada: {} })
        setError(err.response?.data?.error || 'Nu am putut incarca raportul Profit si Pierdere.')
      })
  }

  async function exportExcel() {
    const res = await api.get('/accounting/profit-loss/export', { params: params(), responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const link = document.createElement('a')
    link.href = url
    link.download = `Profit_si_pierdere_${month}.xlsx`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const totals = data.totals || {}
  const venituriRows = data.venituri || []
  const cheltuieliRows = data.cheltuieli || []
  const margin = Number(totals.venituri || 0)
    ? (Number(totals.rezultat || 0) / Number(totals.venituri || 0)) * 100
    : null
  const profitFlow = buildProfitLossFlow({
    month,
    tip,
    totals,
    venituriCount: venituriRows.length,
    cheltuieliCount: cheltuieliRows.length,
    perioada: data.perioada || {},
    load,
    exportExcel,
  })
  const resultTone = Number(totals.rezultat || 0) >= 0
    ? 'bg-emerald-50 text-emerald-700'
    : 'bg-red-50 text-red-700'

  return (
    <AccountingShell
      active="profit-pierdere"
      title="Profit si pierdere"
      subtitle="Venituri, cheltuieli si rezultat pe perioada selectata, pe baza conturilor din clasele 6 si 7."
      actions={<DropdownMenu align="right" label="Actiuni" items={[
        { label: 'Reincarca raport', onClick: load },
        { label: 'Export Excel', onClick: exportExcel },
        { type: 'separator' },
        { label: 'Balanta', to: `/contabilitate/balanta?luna=${month}` },
        { label: 'Cartea Mare', to: `/contabilitate/cartea-mare?de_la=${data.perioada?.de_la || `${month}-01`}&pana_la=${data.perioada?.pana_la || `${month}-31`}` },
      ]} />}
    >
      {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <Card>
        <div className="grid gap-3 md:grid-cols-[180px_180px]">
          <div className="grid gap-1">
            <label className="text-sm font-semibold text-slate-700">Luna</label>
            <input
              className="rounded-[var(--radius-control)] border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              type="month"
              value={month}
              onChange={event => setMonth(event.target.value)}
            />
          </div>
          <Select
            label="Tip raport"
            value={tip}
            onChange={event => setTip(event.target.value)}
            options={[
              { value: 'analitica', label: 'Analitic' },
              { value: 'sintetica', label: 'Sintetic' },
            ]}
          />
        </div>
      </Card>

      <Card>
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${profitFlow.badgeClass}`}>
                {profitFlow.badge}
              </span>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Flux simplu profit si pierdere
              </span>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{profitFlow.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{profitFlow.detail}</p>
            </div>
            <div className="grid gap-2 md:grid-cols-4">
              {profitFlow.steps.map(step => (
                <div key={step.label} className={`rounded-xl border px-3 py-2 ${step.className}`}>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{step.label}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">{step.value}</div>
                  <div className="mt-1 text-xs text-slate-500">{step.hint}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2 lg:min-w-[220px]">
            {profitFlow.to ? (
              <Link
                className="rounded-[var(--radius-control)] bg-primary-700 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-primary-800"
                to={profitFlow.to}
              >
                {profitFlow.actionLabel}
              </Link>
            ) : (
              <button
                className="rounded-[var(--radius-control)] bg-primary-700 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-800"
                type="button"
                onClick={profitFlow.onClick}
              >
                {profitFlow.actionLabel}
              </button>
            )}
            <Link
              className="rounded-[var(--radius-control)] border border-slate-300 px-4 py-2 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
              to={`/contabilitate/balanta?luna=${month}`}
            >
              Verifica balanta
            </Link>
          </div>
        </div>
      </Card>

      <div className={`rounded-md px-3 py-2 text-sm font-semibold ${resultTone}`}>
        {Number(totals.rezultat || 0) >= 0
          ? `Profit estimat: ${formatMoney(totals.rezultat || 0)}`
          : `Pierdere estimata: ${formatMoney(Math.abs(totals.rezultat || 0))}`}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Info label="Venituri" value={formatMoney(totals.venituri || 0)} />
        <Info label="Cheltuieli" value={formatMoney(totals.cheltuieli || 0)} />
        <Info label="Rezultat" value={formatMoney(totals.rezultat || 0)} />
        <Info label="Marja rezultat" value={formatPercent(margin)} />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Info label="Perioada" value={`${data.perioada?.de_la || '-'} - ${data.perioada?.pana_la || '-'}`} />
        <Info label="Conturi venituri" value={`${venituriRows.length}`} />
        <Info label="Conturi cheltuieli" value={`${cheltuieliRows.length}`} />
      </div>

      <Card title="Venituri">
        <Table headers={['Cont', 'Denumire', 'Credit', 'Debit', 'Valoare']}>
          {venituriRows.map(row => (
            <tr key={row.cont} className="hover:bg-slate-50">
              <td className="px-3 py-2">
                <Link className="font-mono font-semibold text-primary-700 hover:underline" to={`/contabilitate/fisa-cont/${row.cont}?de_la=${data.perioada?.de_la}&pana_la=${data.perioada?.pana_la}`}>{row.cont}</Link>
              </td>
              <td className="px-3 py-2">{row.denumire || '-'}</td>
              <td className="px-3 py-2 text-right">{formatMoney(row.credit || 0)}</td>
              <td className="px-3 py-2 text-right">{formatMoney(row.debit || 0)}</td>
              <td className="px-3 py-2 text-right font-semibold">{formatMoney(row.valoare || 0)}</td>
            </tr>
          ))}
          {venituriRows.length ? (
            <tr className="bg-slate-50 font-semibold">
              <td className="px-3 py-2" colSpan={4}>TOTAL VENITURI</td>
              <td className="px-3 py-2 text-right">{formatMoney(totals.venituri || 0)}</td>
            </tr>
          ) : (
            <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={5}>Nu exista venituri pe perioada selectata.</td></tr>
          )}
        </Table>
      </Card>

      <Card title="Cheltuieli">
        <Table headers={['Cont', 'Denumire', 'Debit', 'Credit', 'Valoare']}>
          {cheltuieliRows.map(row => (
            <tr key={row.cont} className="hover:bg-slate-50">
              <td className="px-3 py-2">
                <Link className="font-mono font-semibold text-primary-700 hover:underline" to={`/contabilitate/fisa-cont/${row.cont}?de_la=${data.perioada?.de_la}&pana_la=${data.perioada?.pana_la}`}>{row.cont}</Link>
              </td>
              <td className="px-3 py-2">{row.denumire || '-'}</td>
              <td className="px-3 py-2 text-right">{formatMoney(row.debit || 0)}</td>
              <td className="px-3 py-2 text-right">{formatMoney(row.credit || 0)}</td>
              <td className="px-3 py-2 text-right font-semibold">{formatMoney(row.valoare || 0)}</td>
            </tr>
          ))}
          {cheltuieliRows.length ? (
            <tr className="bg-slate-50 font-semibold">
              <td className="px-3 py-2" colSpan={4}>TOTAL CHELTUIELI</td>
              <td className="px-3 py-2 text-right">{formatMoney(totals.cheltuieli || 0)}</td>
            </tr>
          ) : (
            <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={5}>Nu exista cheltuieli pe perioada selectata.</td></tr>
          )}
        </Table>
      </Card>
    </AccountingShell>
  )
}

export default ProfitPierdere

function buildProfitLossFlow({ month, tip, totals, venituriCount, cheltuieliCount, perioada, load, exportExcel }) {
  const venituri = Number(totals.venituri || 0)
  const cheltuieli = Number(totals.cheltuieli || 0)
  const rezultat = Number(totals.rezultat || 0)
  const hasActivity = venituriCount > 0 || cheltuieliCount > 0 || Math.abs(venituri) > 0.009 || Math.abs(cheltuieli) > 0.009
  const margin = venituri ? (rezultat / venituri) * 100 : null
  const start = perioada?.de_la || `${month}-01`
  const end = perioada?.pana_la || `${month}-31`
  const steps = [
    {
      label: 'Perioada',
      value: `${start} - ${end}`,
      hint: tip === 'sintetica' ? 'raport sintetic' : 'raport analitic',
      className: 'border-slate-200 bg-slate-50',
    },
    {
      label: 'Venituri',
      value: formatMoney(venituri),
      hint: `${venituriCount} conturi incluse`,
      className: venituriCount ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50',
    },
    {
      label: 'Cheltuieli',
      value: formatMoney(cheltuieli),
      hint: `${cheltuieliCount} conturi incluse`,
      className: cheltuieliCount ? 'border-blue-200 bg-blue-50' : 'border-amber-200 bg-amber-50',
    },
    {
      label: 'Rezultat',
      value: formatMoney(rezultat),
      hint: `marja ${formatPercent(margin)}`,
      className: rezultat >= 0 ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50',
    },
  ]

  if (!hasActivity) {
    return {
      badge: 'fara miscari',
      badgeClass: 'bg-amber-100 text-amber-700',
      title: 'Nu exista activitate pentru luna selectata',
      detail: 'Raportul nu are venituri sau cheltuieli. Reincarca raportul dupa ce exista note contabile, facturi sau operatiuni importate.',
      steps,
      actionLabel: 'Reincarca raport',
      onClick: load,
    }
  }

  if (rezultat < 0) {
    return {
      badge: 'pierdere',
      badgeClass: 'bg-red-100 text-red-700',
      title: 'Luna este pe pierdere estimata',
      detail: 'Verifica balanta si conturile cu valori mari inainte de export sau raportare. Ecranul arata cauza pe venituri si cheltuieli.',
      steps,
      actionLabel: 'Deschide Cartea Mare',
      to: `/contabilitate/cartea-mare?de_la=${start}&pana_la=${end}`,
    }
  }

  return {
    badge: rezultat === 0 ? 'echilibru' : 'profit',
    badgeClass: rezultat === 0 ? 'bg-slate-100 text-slate-700' : 'bg-emerald-100 text-emerald-700',
    title: rezultat === 0 ? 'Rezultat pe zero' : 'Luna este pe profit estimat',
    detail: 'Datele sunt grupate pe clasele de venituri si cheltuieli. Daca balanta este coerenta, poti exporta raportul pentru dosarul lunar.',
    steps,
    actionLabel: 'Export Excel',
    onClick: exportExcel,
  }
}

function formatPercent(value) {
  return value == null || Number.isNaN(Number(value)) ? '-' : `${Number(value).toFixed(1)}%`
}
