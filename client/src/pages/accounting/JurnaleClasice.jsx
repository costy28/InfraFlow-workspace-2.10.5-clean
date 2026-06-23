import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../../api/client'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import { formatMoney } from '../../utils/format'
import { AccountingShell, DropdownMenu, Info, Table, currentMonth, statusTone } from './accounting-shared'

function emptyData() {
  return {
    jurnal_cumparari: { rows: [], totals: {} },
    jurnal_vanzari: { rows: [], totals: {} },
    registru_casa: { rows: [], totals: {} },
    jurnal_banca: { rows: [], totals: {} },
    warnings: []
  }
}

export function JurnaleClasice() {
  const [searchParams] = useSearchParams()
  const [month, setMonth] = useState(searchParams.get('luna') || currentMonth())
  const [status, setStatus] = useState('')
  const [cota, setCota] = useState('')
  const [data, setData] = useState(emptyData())
  const [error, setError] = useState('')

  useEffect(() => { load() }, [month, status, cota])

  function params() {
    return { perioada: month, status: status || undefined, cota: cota || undefined }
  }

  function load() {
    setError('')
    api.get('/accounting/classic-journals', { params: params() })
      .then(res => setData(res.data || emptyData()))
      .catch(err => {
        setData(emptyData())
        setError(err.response?.data?.error || 'Nu am putut incarca jurnalele contabile.')
      })
  }

  async function exportExcel() {
    const fileMonth = month.replace('-', '_')
    const res = await api.get('/accounting/classic-journals/export', { params: params(), responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const link = document.createElement('a')
    link.href = url
    link.download = `Jurnale_contabile_${fileMonth}.xlsx`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const totals = useMemo(() => ({
    cumparari: data.jurnal_cumparari?.totals || {},
    vanzari: data.jurnal_vanzari?.totals || {},
    casa: data.registru_casa?.totals || {},
    banca: data.jurnal_banca?.totals || {}
  }), [data])

  return (
    <AccountingShell
      active="jurnale"
      title="Jurnale contabile"
      subtitle="Jurnal cumparari, vanzari, casa si banca din documentele validate."
      actions={<DropdownMenu align="right" label="Export" items={[{ label: 'Export Excel', onClick: exportExcel }]} />}
    >
      {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Card>
        <div className="grid gap-3 md:grid-cols-[220px_180px_180px_auto]">
          <Input label="Luna" type="month" value={month} onChange={event => setMonth(event.target.value)} />
          <Select label="Status documente" value={status} onChange={event => setStatus(event.target.value)} options={[
            { value: '', label: 'Validate si active' },
            { value: 'draft', label: 'Draft' },
            { value: 'validat', label: 'Validate' },
            { value: 'achitat', label: 'Achitate' },
            { value: 'incasat', label: 'Incasate' },
            { value: 'partial', label: 'Partial' }
          ]} />
          <Select label="Cota TVA" value={cota} onChange={event => setCota(event.target.value)} options={[
            { value: '', label: 'Toate cotele' },
            ...[21, 19, 9, 5, 0].map(value => ({ value, label: `${value}%` }))
          ]} />
          <div className="flex items-end justify-end"><Button variant="secondary" onClick={load}>Reincarca</Button></div>
        </div>
      </Card>
      <div className="grid gap-3 md:grid-cols-4">
        <Info label="Cumparari" value={`${formatMoney(totals.cumparari.total || 0)} / TVA ${formatMoney(totals.cumparari.tva || 0)}`} />
        <Info label="Vanzari" value={`${formatMoney(totals.vanzari.total || 0)} / TVA ${formatMoney(totals.vanzari.tva || 0)}`} />
        <Info label="Casa" value={`Sold ${formatMoney(totals.casa.sold || 0)}`} />
        <Info label="Banca" value={`Sold ${formatMoney(totals.banca.sold || 0)}`} />
      </div>
      {(data.warnings || []).length ? <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{data.warnings.join(' ')}</div> : null}
      <div className="grid gap-4 xl:grid-cols-2">
        <JournalInvoiceTable title="Jurnal cumparari" rows={data.jurnal_cumparari?.rows || []} partyLabel="Furnizor" />
        <JournalInvoiceTable title="Jurnal vanzari" rows={data.jurnal_vanzari?.rows || []} partyLabel="Client" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <TreasuryTable title="Registru casa" rows={data.registru_casa?.rows || []} />
        <TreasuryTable title="Jurnal banca" rows={data.jurnal_banca?.rows || []} />
      </div>
    </AccountingShell>
  )
}

function JournalInvoiceTable({ title, rows, partyLabel }) {
  return (
    <div className="grid gap-2">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <Table headers={['Data', 'Document', partyLabel, 'Baza', 'TVA', 'Total', 'Status']}>
        {rows.map(row => (
          <tr key={row.uuid || row.id}>
            <td className="px-3 py-2">{row.data}</td>
            <td className="px-3 py-2">{row.nr_document || row.numar || '-'}</td>
            <td className="px-3 py-2">{row.tert || '-'}</td>
            <td className="px-3 py-2 text-right">{formatMoney(row.valoare || 0)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(row.tva || 0)}</td>
            <td className="px-3 py-2 text-right font-semibold">{formatMoney(row.total || 0)}</td>
            <td className="px-3 py-2"><Badge tone={statusTone(row.status)}>{row.status}</Badge></td>
          </tr>
        ))}
      </Table>
    </div>
  )
}

function TreasuryTable({ title, rows }) {
  return (
    <div className="grid gap-2">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <Table headers={['Data', 'Document', 'Operatie', 'Tert', 'Incasari', 'Plati', 'Nota', 'Status']}>
        {rows.map(row => (
          <tr key={row.uuid || row.id}>
            <td className="px-3 py-2">{row.data}</td>
            <td className="px-3 py-2">{row.nr_document || '-'}</td>
            <td className="px-3 py-2">{row.tip_operatie || '-'}</td>
            <td className="px-3 py-2">{row.tert_denumire || '-'}</td>
            <td className="px-3 py-2 text-right">{row.tip_operatie === 'incasare' ? formatMoney(row.suma || 0) : '-'}</td>
            <td className="px-3 py-2 text-right">{row.tip_operatie === 'plata' ? formatMoney(row.suma || 0) : '-'}</td>
            <td className="px-3 py-2">{row.journal_id ? `NC ${row.journal_id}` : '-'}</td>
            <td className="px-3 py-2"><Badge tone={statusTone(row.status)}>{row.status}</Badge></td>
          </tr>
        ))}
      </Table>
    </div>
  )
}

export default JurnaleClasice
