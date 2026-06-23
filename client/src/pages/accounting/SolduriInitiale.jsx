import { useEffect, useMemo, useState } from 'react'
import api from '../../api/client'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/forms/Input'
import { formatMoney } from '../../utils/format'
import { AccountSelect, AccountingShell, Info, Table, money } from './accounting-shared'

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

  return (
    <AccountingShell
      active="solduri"
      title="Solduri initiale"
      subtitle="Punctul de pornire pentru balanta si fisa contului."
      actions={<Button onClick={save} loading={saving}>Salveaza solduri</Button>}
    >
      {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
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
      <Table headers={['Cont', 'Sold debit', 'Sold credit', 'Observatii', '']}>
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
              <Button variant="secondary" onClick={() => removeRow(index)} disabled={visibleRows.length === 1 && !row.cont_simbol}>Sterge</Button>
            </td>
          </tr>
        ))}
        <tr className="bg-slate-50 font-semibold">
          <td className="px-3 py-2">TOTAL</td>
          <td className="px-3 py-2 text-right">{formatMoney(localTotals.debit)}</td>
          <td className="px-3 py-2 text-right">{formatMoney(localTotals.credit)}</td>
          <td className="px-3 py-2">{status}</td>
          <td className="px-3 py-2 text-right"><Button variant="secondary" onClick={addRow}>+ Linie</Button></td>
        </tr>
      </Table>
    </AccountingShell>
  )
}

export default SolduriInitiale
