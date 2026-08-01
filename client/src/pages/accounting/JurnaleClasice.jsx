import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
  const navigate = useNavigate()

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
  const journalsSummary = buildJournalsSummary({ data, totals, status, cota })
  const journalsFlow = buildJournalsFlow({
    month,
    summary: journalsSummary,
    load,
    exportExcel,
    openIncoming: () => navigate(`/contabilitate/facturi-intrare?luna=${month}`),
    openOutgoing: () => navigate(`/contabilitate/facturi-iesire?luna=${month}`),
    openTreasury: () => navigate(`/contabilitate/trezorerie?luna=${month}`)
  })

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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge tone={journalsFlow.tone}>{journalsFlow.badge}</Badge>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Jurnale contabile simplificate</span>
            </div>
            <h3 className="text-lg font-semibold text-slate-900">{journalsFlow.title}</h3>
            <p className="mt-1 max-w-4xl text-sm text-slate-500">{journalsFlow.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={journalsFlow.primaryAction}>{journalsFlow.primaryLabel}</Button>
            <Button variant="secondary" onClick={load}>Reîncarcă</Button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {journalsFlow.steps.map((step, index) => (
            <button
              key={step.key}
              type="button"
              onClick={step.onClick}
              className={`rounded-lg border px-4 py-3 text-left transition hover:shadow-sm ${step.active ? 'border-emerald-300 bg-emerald-50' : step.tone === 'warning' ? 'border-amber-200 bg-amber-50' : step.tone === 'danger' ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">{index + 1}</span>
                <Badge tone={step.tone}>{step.status}</Badge>
              </div>
              <div className="mt-3 font-semibold text-slate-900">{step.title}</div>
              <p className="mt-1 text-sm text-slate-500">{step.detail}</p>
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Info label="Documente" value={journalsSummary.invoiceRows} />
          <Info label="Operațiuni casă/bancă" value={journalsSummary.treasuryRows} />
          <Info label="Total documente" value={formatMoney(journalsSummary.documentsTotal)} />
          <Info label="Avertizări" value={journalsSummary.warningsCount} />
        </div>
      </Card>
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
        <TreasuryTable title="Registru casa" rows={data.registru_casa?.rows || []} totals={data.registru_casa?.totals || {}} accounts={data.registru_casa?.accounts || []} daily={data.registru_casa?.daily || []} />
        <TreasuryTable title="Jurnal banca" rows={data.jurnal_banca?.rows || []} totals={data.jurnal_banca?.totals || {}} accounts={data.jurnal_banca?.accounts || []} daily={data.jurnal_banca?.daily || []} />
      </div>
    </AccountingShell>
  )
}

function buildJournalsSummary({ data, totals, status, cota }) {
  const purchaseRows = data.jurnal_cumparari?.rows?.length || 0
  const saleRows = data.jurnal_vanzari?.rows?.length || 0
  const cashRows = data.registru_casa?.rows?.length || 0
  const bankRows = data.jurnal_banca?.rows?.length || 0
  const warningsCount = data.warnings?.length || 0
  const documentsTotal = Number(totals.cumparari.total || 0) + Number(totals.vanzari.total || 0)

  return {
    purchaseRows,
    saleRows,
    cashRows,
    bankRows,
    invoiceRows: purchaseRows + saleRows,
    treasuryRows: cashRows + bankRows,
    warningsCount,
    documentsTotal,
    hasData: purchaseRows + saleRows + cashRows + bankRows > 0,
    hasFilters: Boolean(status || cota),
    filterLabel: [
      status ? `status ${status}` : null,
      cota ? `TVA ${cota}%` : null
    ].filter(Boolean).join(' · ') || 'fără filtre suplimentare',
  }
}

function buildJournalsFlow({ month, summary, load, exportExcel, openIncoming, openOutgoing, openTreasury }) {
  const steps = [
    {
      key: 'period',
      title: 'Alege luna de lucru',
      detail: `Jurnalele sunt calculate pentru ${month}. Filtru curent: ${summary.filterLabel}.`,
      status: summary.hasFilters ? 'filtrat' : 'standard',
      tone: summary.hasFilters ? 'info' : 'neutral',
      active: true,
      onClick: load,
    },
    {
      key: 'invoices',
      title: 'Verifică facturile',
      detail: `${summary.purchaseRows} cumpărări și ${summary.saleRows} vânzări intră în jurnale.`,
      status: summary.invoiceRows ? 'date' : 'gol',
      tone: summary.invoiceRows ? 'success' : 'warning',
      active: summary.invoiceRows > 0,
      onClick: summary.saleRows > summary.purchaseRows ? openOutgoing : openIncoming,
    },
    {
      key: 'treasury',
      title: 'Verifică casa și banca',
      detail: `${summary.cashRows} operațiuni în casă și ${summary.bankRows} operațiuni în bancă.`,
      status: summary.treasuryRows ? 'date' : 'gol',
      tone: summary.treasuryRows ? 'success' : 'warning',
      active: summary.treasuryRows > 0,
      onClick: openTreasury,
    },
    {
      key: 'export',
      title: 'Exportă dosarul lunar',
      detail: summary.hasData
        ? 'Exportul Excel poate fi folosit pentru verificare, arhivă sau predare contabilă.'
        : 'Exportul devine util după ce există documente sau operațiuni în lună.',
      status: summary.hasData ? 'pregătit' : 'după date',
      tone: summary.hasData ? 'success' : 'neutral',
      active: summary.hasData,
      onClick: exportExcel,
    },
  ]

  if (summary.warningsCount) {
    return {
      badge: 'Atenție',
      tone: 'warning',
      title: `${summary.warningsCount} avertizări în jurnalele lunii`,
      description: 'Rezolvă avertizările înainte de export sau predare. De obicei indică documente incomplete, statusuri sau corelări care trebuie verificate.',
      primaryLabel: 'Reîncarcă jurnale',
      primaryAction: load,
      steps,
    }
  }

  if (!summary.hasData) {
    return {
      badge: 'Fără date',
      tone: 'warning',
      title: `Nu sunt documente în jurnalele pentru ${month}`,
      description: 'Adaugă sau validează facturi și operațiuni de trezorerie, apoi revino aici pentru registrul de cumpărări, vânzări, casă și bancă.',
      primaryLabel: 'Deschide facturi intrare',
      primaryAction: openIncoming,
      steps,
    }
  }

  if (!summary.invoiceRows && summary.treasuryRows) {
    return {
      badge: 'Trezorerie',
      tone: 'info',
      title: 'Luna are casă/bancă, dar nu are facturi în jurnale',
      description: 'Verifică dacă facturile sunt validate sau dacă filtrul curent ascunde documentele. Jurnalele clasice trebuie să arate imaginea completă a lunii.',
      primaryLabel: 'Deschide facturi',
      primaryAction: openIncoming,
      steps,
    }
  }

  return {
    badge: 'Pregătit',
    tone: 'success',
    title: `Jurnalele pentru ${month} sunt pregătite`,
    description: 'Ai date în registrele lunii. Verifică rapid totalurile, apoi exportă Excel pentru control, arhivă sau predare mai departe.',
    primaryLabel: 'Export Excel',
    primaryAction: exportExcel,
    steps,
  }
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

function TreasuryTable({ title, rows, totals, accounts, daily }) {
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
      {daily?.length ? (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Solduri zilnice</div>
          <Table headers={['Data', 'Inițial', 'Încasări', 'Plăți', 'Final', 'Operațiuni']}>
            {daily.map(day => (
              <tr key={day.data}>
                <td className="px-3 py-2">{day.data}</td>
                <td className="px-3 py-2 text-right">{formatMoney(day.sold_initial)}</td>
                <td className="px-3 py-2 text-right text-emerald-700">{formatMoney(day.incasari)}</td>
                <td className="px-3 py-2 text-right text-rose-700">{formatMoney(day.plati)}</td>
                <td className="px-3 py-2 text-right font-semibold">{formatMoney(day.sold_final)}</td>
                <td className="px-3 py-2 text-right">{day.operatiuni}</td>
              </tr>
            ))}
          </Table>
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
