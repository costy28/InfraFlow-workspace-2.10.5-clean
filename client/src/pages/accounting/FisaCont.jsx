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
      <div className="grid gap-3 md:grid-cols-4">
        <Info label="Sold initial" value={formatMoney(data.sold_initial || 0)} />
        <Info label="Rulaj debit" value={formatMoney(data.total_debit || 0)} />
        <Info label="Rulaj credit" value={formatMoney(data.total_credit || 0)} />
        <Info label="Sold final" value={formatMoney(data.sold_final || 0)} />
      </div>
      <Table headers={['Data', 'Document', 'Tip', 'Explicatie', 'Debit', 'Credit', 'Sold']}>
        {data.movements.map(row => (
          <tr key={row.id} className="hover:bg-slate-50">
            <td className="px-3 py-2">{row.data}</td>
            <td className="px-3 py-2"><Link className="font-semibold text-primary-700 hover:underline" to={`/contabilitate/registru-jurnal?luna=${String(row.data || reportMonth).slice(0, 7)}`}>{row.nr_document || '-'}</Link></td>
            <td className="px-3 py-2">{row.tip_document}</td>
            <td className="px-3 py-2">{row.explicatie}</td>
            <td className="px-3 py-2 text-right">{row.debit ? formatMoney(row.debit) : '-'}</td>
            <td className="px-3 py-2 text-right">{row.credit ? formatMoney(row.credit) : '-'}</td>
            <td className="px-3 py-2 text-right font-semibold">{formatMoney(row.sold)}</td>
          </tr>
        ))}
        {data.movements.length ? (
          <tr className="bg-slate-50 font-semibold">
            <td className="px-3 py-2">TOTAL</td>
            <td className="px-3 py-2" colSpan={3}>{data.movements.length} miscari</td>
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
