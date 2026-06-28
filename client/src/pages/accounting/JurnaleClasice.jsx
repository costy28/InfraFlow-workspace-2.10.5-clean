import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../../api/client'
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
      actions={<DropdownMenu align="right" label="Actiuni" items={[
        { label: 'Reincarca jurnale', onClick: load },
        { label: 'Export Excel', onClick: exportExcel },
        { type: 'separator' },
        { label: 'Facturi intrare', to: `/contabilitate/facturi-intrare?luna=${month}` },
        { label: 'Facturi iesire', to: `/contabilitate/facturi-iesire?luna=${month}` },
        { label: 'Trezorerie', to: `/contabilitate/trezorerie?luna=${month}` }
      ]} />}
    >
      {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Card>
        <div className="grid gap-3 md:grid-cols-[220px_180px_180px]">
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
        </div>
      </Card>
      <div className="grid gap-3 md:grid-cols-4">
        <Info label="Cumparari" value={`${formatMoney(totals.cumparari.total || 0)} / TVA ${formatMoney(totals.cumparari.tva || 0)}`} />
        <Info label="Vanzari" value={`${formatMoney(totals.vanzari.total || 0)} / TVA ${formatMoney(totals.vanzari.tva || 0)}`} />
        <Info label="Casa" value={`Final ${formatMoney(totals.casa.sold_final || totals.casa.sold || 0)}`} />
        <Info label="Banca" value={`Final ${formatMoney(totals.banca.sold_final || totals.banca.sold || 0)}`} />
      </div>
      {(data.warnings || []).length ? <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{data.warnings.join(' ')}</div> : null}
      <div className="grid gap-4 xl:grid-cols-2">
        <JournalInvoiceTable title="Jurnal cumparari" rows={data.jurnal_cumparari?.rows || []} partyLabel="Furnizor" totals={data.jurnal_cumparari?.totals || {}} />
        <JournalInvoiceTable title="Jurnal vanzari" rows={data.jurnal_vanzari?.rows || []} partyLabel="Client" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <TreasuryTable title="Registru casa" rows={data.registru_casa?.rows || []} totals={data.registru_casa?.totals || {}} accounts={data.registru_casa?.accounts || []} />
        <TreasuryTable title="Jurnal banca" rows={data.jurnal_banca?.rows || []} totals={data.jurnal_banca?.totals || {}} accounts={data.jurnal_banca?.accounts || []} />
      </div>
    </AccountingShell>
  )
}

function JournalInvoiceTable({ title, rows, partyLabel, totals = {} }) {
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {totals.credit_notes ? <Badge tone="info">{totals.credit_notes} note de credit · {formatMoney(totals.credit_total)}</Badge> : null}
      </div>
      <Table headers={['Data', 'Tip', 'Document', partyLabel, 'Baza', 'TVA', 'Total', 'Status']}>
        {rows.map(row => (
          <tr key={row.uuid || row.id}>
            <td className="px-3 py-2">{row.data}</td>
            <td className="px-3 py-2"><Badge tone={row.document_type === 'nota_credit' ? 'info' : 'neutral'}>{row.document_type === 'nota_credit' ? 'Notă credit' : 'Factură'}</Badge></td>
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

function TreasuryTable({ title, rows, totals, accounts }) {
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <div className="flex flex-wrap gap-2 text-xs text-slate-600">
          <span className="rounded-md bg-slate-100 px-2 py-1">Initial {formatMoney(totals.sold_initial || 0)}</span>
          <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">Incasari {formatMoney(totals.incasari || 0)}</span>
          <span className="rounded-md bg-rose-50 px-2 py-1 text-rose-700">Plati {formatMoney(totals.plati || 0)}</span>
          <span className="rounded-md bg-primary-50 px-2 py-1 text-primary-800">Final {formatMoney(totals.sold_final || totals.sold || 0)}</span>
        </div>
      </div>
      {accounts?.length > 1 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {accounts.map(account => (
            <div key={account.cont_trezorerie} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
              <span className="font-semibold text-slate-900">{account.cont_trezorerie}</span>
              {' '}initial {formatMoney(account.sold_initial || 0)} · incasari {formatMoney(account.incasari || 0)} · plati {formatMoney(account.plati || 0)} · final {formatMoney(account.sold_final || 0)}
            </div>
          ))}
        </div>
      ) : null}
      <Table headers={['Data', 'Document', 'Operatie', 'Tert', 'Incasari', 'Plati', 'Sold', 'Nota', 'Status']}>
        {rows.map(row => (
          <tr key={row.uuid || row.id}>
            <td className="px-3 py-2">{row.data}</td>
            <td className="px-3 py-2">{row.nr_document || '-'}</td>
            <td className="px-3 py-2">{row.tip_operatie || '-'}</td>
            <td className="px-3 py-2">{row.tert_denumire || '-'}</td>
            <td className="px-3 py-2 text-right">{row.incasari ? formatMoney(row.incasari) : '-'}</td>
            <td className="px-3 py-2 text-right">{row.plati ? formatMoney(row.plati) : '-'}</td>
            <td className="px-3 py-2 text-right font-semibold">{formatMoney(row.sold_curent || 0)}</td>
            <td className="px-3 py-2">{row.journal_id ? `NC ${row.journal_id}` : '-'}</td>
            <td className="px-3 py-2"><Badge tone={statusTone(row.status)}>{row.status}</Badge></td>
          </tr>
        ))}
      </Table>
    </div>
  )
}

export default JurnaleClasice
