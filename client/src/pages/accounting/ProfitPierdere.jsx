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

      <div className={`rounded-md px-3 py-2 text-sm font-semibold ${resultTone}`}>
        {Number(totals.rezultat || 0) >= 0
          ? `Profit estimat: ${formatMoney(totals.rezultat || 0)}`
          : `Pierdere estimata: ${formatMoney(Math.abs(totals.rezultat || 0))}`}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Info label="Venituri" value={formatMoney(totals.venituri || 0)} />
        <Info label="Cheltuieli" value={formatMoney(totals.cheltuieli || 0)} />
        <Info label="Rezultat" value={formatMoney(totals.rezultat || 0)} />
        <Info label="Perioada" value={`${data.perioada?.de_la || '-'} - ${data.perioada?.pana_la || '-'}`} />
      </div>

      <Card title="Venituri">
        <Table headers={['Cont', 'Denumire', 'Credit', 'Debit', 'Valoare']}>
          {(data.venituri || []).map(row => (
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
          {(data.venituri || []).length ? (
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
          {(data.cheltuieli || []).map(row => (
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
          {(data.cheltuieli || []).length ? (
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
