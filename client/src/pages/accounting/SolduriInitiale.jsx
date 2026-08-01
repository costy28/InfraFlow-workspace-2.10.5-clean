import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/client'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Input from '../../components/forms/Input'
import { formatMoney } from '../../utils/format'
import { AccountSelect, AccountingShell, DropdownMenu, Info, Table, money } from './accounting-shared'

function currentYear() {
  return String(new Date().getFullYear())
}

function emptyRow() {
  return { cont_simbol: '', debit: '', credit: '', observatii: '' }
}

export function SolduriInitiale() {
  const [year, setYear] = useState(currentYear())
  const [rows, setRows] = useState([])
  const [accounts, setAccounts] = useState([])
  const [totals, setTotals] = useState({ debit: 0, credit: 0, diferenta: 0, balanced: true })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/accounting/chart', { params: { nivel: '', q: '' } })
      .then(res => setAccounts(res.data.accounts || []))
      .catch(() => setAccounts([]))
  }, [])

  useEffect(() => { load() }, [year])

  const visibleRows = rows.length ? rows : [emptyRow()]
  const localTotals = useMemo(() => {
    const debit = rows.reduce((sum, row) => sum + money(row.debit), 0)
    const credit = rows.reduce((sum, row) => sum + money(row.credit), 0)
    return {
      debit,
      credit,
      diferenta: debit - credit,
      balanced: Math.abs(debit - credit) <= 0.01
    }
  }, [rows])

  async function load() {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const res = await api.get('/accounting/opening-balances', { params: { an: year } })
      setRows(res.data.rows?.length ? res.data.rows.map(row => ({
        cont_simbol: row.cont_simbol,
        debit: row.debit || '',
        credit: row.credit || '',
        observatii: row.observatii || ''
      })) : [])
      setTotals(res.data.totals || {})
    } catch (err) {
      setRows([])
      setTotals({})
      setError(err.response?.data?.error || 'Soldurile initiale nu au putut fi incarcate.')
    } finally {
      setLoading(false)
    }
  }

  function updateRow(index, patch) {
    const next = [...visibleRows]
    next[index] = { ...next[index], ...patch }
    setRows(next.filter(row => row.cont_simbol || row.debit || row.credit || row.observatii))
  }

  function addRow() {
    setRows([...visibleRows, emptyRow()])
  }

  function removeRow(index) {
    const next = visibleRows.filter((_, rowIndex) => rowIndex !== index)
    setRows(next.filter(row => row.cont_simbol || row.debit || row.credit || row.observatii))
  }

  async function save() {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const payload = { rows: visibleRows.filter(row => row.cont_simbol || row.debit || row.credit || row.observatii) }
      const res = await api.put(`/accounting/opening-balances/${year}`, payload)
      setRows(res.data.rows || [])
      setTotals(res.data.totals || {})
      setMessage(`Soldurile initiale pentru ${year} au fost salvate.`)
    } catch (err) {
      setError(err.response?.data?.error || 'Soldurile initiale nu au putut fi salvate.')
    } finally {
      setSaving(false)
    }
  }

  const status = localTotals.balanced ? 'Echilibrat' : `Diferenta ${formatMoney(Math.abs(localTotals.diferenta))}`
  const hasEditableRows = visibleRows.some(row => row.cont_simbol || row.debit || row.credit || row.observatii)
  const solduriSummary = buildSolduriInitialeSummary({ visibleRows, localTotals, totals })
  const solduriFlow = buildSolduriInitialeFlow({
    year,
    summary: solduriSummary,
    addRow,
    save,
    load,
    verifyInBalance: () => navigate(`/contabilitate/balanta?luna=${year}-01`)
  })

  return (
    <AccountingShell
      active="solduri"
      title="Solduri initiale"
      subtitle="Punctul de pornire pentru balanta si fisa contului."
      actions={<DropdownMenu align="right" label={saving ? 'Se salveaza...' : 'Actiuni'} items={[
        { label: 'Salveaza solduri', onClick: save, disabled: saving || !hasEditableRows },
        { label: 'Adauga linie', onClick: addRow },
        { label: 'Reincarca solduri', onClick: load },
        { type: 'separator' },
        { label: 'Verifica in balanta', to: `/contabilitate/balanta?luna=${year}-01` }
      ]} />}
    >
      {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge tone={solduriFlow.tone}>{solduriFlow.badge}</Badge>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Solduri inițiale simplificate</span>
            </div>
            <h3 className="text-lg font-semibold text-slate-900">{solduriFlow.title}</h3>
            <p className="mt-1 max-w-4xl text-sm text-slate-500">{solduriFlow.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={solduriFlow.primaryAction} loading={saving && solduriFlow.primaryType === 'save'} disabled={loading || saving}>
              {solduriFlow.primaryLabel}
            </Button>
            <Button variant="secondary" onClick={load} disabled={loading || saving}>Reîncarcă</Button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {solduriFlow.steps.map((step, index) => (
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
          <Info label="Linii completate" value={solduriSummary.completedRows} />
          <Info label="Conturi selectate" value={solduriSummary.accountRows} />
          <Info label="Linii cu sume" value={solduriSummary.amountRows} />
          <Info label="Diferență" value={formatMoney(Math.abs(solduriSummary.difference))} />
        </div>
      </Card>
      <Card>
        <div className="grid gap-3 md:grid-cols-[180px_1fr]">
          <Input label="An fiscal" type="number" value={year} onChange={event => setYear(event.target.value)} />
          <div className={`rounded-[var(--radius-panel)] border px-4 py-3 text-sm ${localTotals.balanced ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
            {loading ? 'Se incarca soldurile...' : `Status solduri: ${status}. Soldurile pot fi salvate si apoi verificate in Balanta.`}
          </div>
        </div>
      </Card>
      <div className="grid gap-3 md:grid-cols-4">
        <Info label="Conturi" value={visibleRows.filter(row => row.cont_simbol).length} />
        <Info label="Sold debit" value={formatMoney(localTotals.debit || totals.debit || 0)} />
        <Info label="Sold credit" value={formatMoney(localTotals.credit || totals.credit || 0)} />
        <Info label="Diferenta" value={formatMoney(Math.abs(localTotals.diferenta || totals.diferenta || 0))} />
      </div>
      <Table headers={['Cont', 'Sold debit', 'Sold credit', 'Observatii', 'Actiuni']}>
        {visibleRows.map((row, index) => (
          <tr key={`${row.cont_simbol || 'nou'}-${index}`} className="align-top hover:bg-slate-50">
            <td className="min-w-[320px] px-3 py-2">
              <AccountSelect
                label={`Cont ${index + 1}`}
                value={row.cont_simbol}
                accounts={accounts}
                onChange={event => updateRow(index, { cont_simbol: event.target.value })}
              />
            </td>
            <td className="min-w-[150px] px-3 py-2">
              <Input
                label="Debit"
                type="number"
                step="0.01"
                value={row.debit}
                onChange={event => updateRow(index, { debit: event.target.value, credit: event.target.value ? '' : row.credit })}
              />
            </td>
            <td className="min-w-[150px] px-3 py-2">
              <Input
                label="Credit"
                type="number"
                step="0.01"
                value={row.credit}
                onChange={event => updateRow(index, { credit: event.target.value, debit: event.target.value ? '' : row.debit })}
              />
            </td>
            <td className="min-w-[220px] px-3 py-2">
              <Input label="Observatii" value={row.observatii || ''} onChange={event => updateRow(index, { observatii: event.target.value })} />
            </td>
            <td className="px-3 py-8 text-right">
              <DropdownMenu align="right" label="Actiuni" items={[
                { label: 'Adauga linie sub aceasta', onClick: () => setRows([...visibleRows.slice(0, index + 1), emptyRow(), ...visibleRows.slice(index + 1)]) },
                { label: 'Sterge linia', onClick: () => removeRow(index), disabled: visibleRows.length === 1 && !row.cont_simbol, danger: true }
              ]} />
            </td>
          </tr>
        ))}
        <tr className="bg-slate-50 font-semibold">
          <td className="px-3 py-2">TOTAL</td>
          <td className="px-3 py-2 text-right">{formatMoney(localTotals.debit)}</td>
          <td className="px-3 py-2 text-right">{formatMoney(localTotals.credit)}</td>
          <td className="px-3 py-2">{status}</td>
          <td className="px-3 py-2 text-right">
            <DropdownMenu align="right" label="Actiuni" items={[
              { label: 'Adauga linie', onClick: addRow },
              { label: 'Salveaza solduri', onClick: save, disabled: saving || !hasEditableRows }
            ]} />
          </td>
        </tr>
      </Table>
    </AccountingShell>
  )
}

function buildSolduriInitialeSummary({ visibleRows, localTotals, totals }) {
  const completedRows = visibleRows.filter(row => row.cont_simbol || row.debit || row.credit || row.observatii)
  const accountRows = visibleRows.filter(row => row.cont_simbol).length
  const amountRows = visibleRows.filter(row => money(row.debit) || money(row.credit)).length
  const incompleteRows = completedRows.filter(row => !row.cont_simbol || (!money(row.debit) && !money(row.credit))).length
  const debit = Number(localTotals.debit || totals.debit || 0)
  const credit = Number(localTotals.credit || totals.credit || 0)
  const difference = debit - credit

  return {
    completedRows: completedRows.length,
    accountRows,
    amountRows,
    incompleteRows,
    debit,
    credit,
    difference,
    balanced: Math.abs(difference) <= 0.01,
    hasRows: completedRows.length > 0,
  }
}

function buildSolduriInitialeFlow({ year, summary, addRow, save, load, verifyInBalance }) {
  const steps = [
    {
      key: 'year',
      title: 'Alege anul fiscal',
      detail: `Lucrezi pe anul ${year}. Schimbă anul doar dacă pornești alt exercițiu.`,
      status: year ? 'setat' : 'necesar',
      tone: year ? 'success' : 'warning',
      active: Boolean(year),
      onClick: load,
    },
    {
      key: 'accounts',
      title: 'Completează conturile',
      detail: summary.completedRows
        ? `${summary.accountRows} conturi selectate din ${summary.completedRows} linii completate.`
        : 'Adaugă cel puțin o linie cu cont și sold debit sau credit.',
      status: summary.accountRows ? 'în lucru' : 'start',
      tone: summary.accountRows ? 'info' : 'warning',
      active: summary.accountRows > 0,
      onClick: addRow,
    },
    {
      key: 'balance',
      title: 'Echilibrează debit-credit',
      detail: summary.balanced
        ? `Debit ${formatMoney(summary.debit)} și credit ${formatMoney(summary.credit)} sunt echilibrate.`
        : `Mai ai de corectat ${formatMoney(Math.abs(summary.difference))}. Soldurile inițiale trebuie să bată.`
      ,
      status: summary.balanced ? 'ok' : 'atenție',
      tone: summary.balanced ? 'success' : 'warning',
      active: summary.balanced && summary.hasRows,
      onClick: summary.balanced ? save : addRow,
    },
    {
      key: 'verify',
      title: 'Salvează și verifică',
      detail: summary.balanced && summary.hasRows
        ? 'După salvare, verifică efectul în Balanță și Fișa cont.'
        : 'Verificarea în Balanță devine utilă după ce soldurile sunt completate și echilibrate.',
      status: summary.balanced && summary.hasRows ? 'gata' : 'după salvare',
      tone: summary.balanced && summary.hasRows ? 'success' : 'neutral',
      active: summary.balanced && summary.hasRows,
      onClick: verifyInBalance,
    },
  ]

  if (!summary.hasRows) {
    return {
      badge: 'Start',
      tone: 'warning',
      title: 'Adaugă primele solduri inițiale',
      description: 'Pornește cu conturile care au sold la început de an. Operatorul nu trebuie să ghicească: cont, debit sau credit, apoi echilibrare.',
      primaryLabel: 'Adaugă linie',
      primaryType: 'add',
      primaryAction: addRow,
      steps,
    }
  }

  if (summary.incompleteRows) {
    return {
      badge: 'De completat',
      tone: 'warning',
      title: `${summary.incompleteRows} linii trebuie completate`,
      description: 'Fiecare linie folosită are nevoie de cont și de o sumă pe debit sau credit. Liniile incomplete pot bloca salvarea corectă.',
      primaryLabel: 'Adaugă linie corectă',
      primaryType: 'add',
      primaryAction: addRow,
      steps,
    }
  }

  if (!summary.balanced) {
    return {
      badge: 'Dezechilibrat',
      tone: 'warning',
      title: `Echilibrează diferența de ${formatMoney(Math.abs(summary.difference))}`,
      description: 'Soldurile inițiale intră în balanță doar când total debit este egal cu total credit. Adaugă sau corectează linia lipsă înainte de salvare.',
      primaryLabel: 'Adaugă linie de corecție',
      primaryType: 'add',
      primaryAction: addRow,
      steps,
    }
  }

  return {
    badge: 'Echilibrat',
    tone: 'success',
    title: `Soldurile inițiale ${year} sunt pregătite`,
    description: 'Totul bate pe debit-credit. Salvează soldurile, apoi verifică în Balanță că anul pornește de la valorile corecte.',
    primaryLabel: 'Salvează soldurile',
    primaryType: 'save',
    primaryAction: save,
    steps,
  }
}

export default SolduriInitiale
