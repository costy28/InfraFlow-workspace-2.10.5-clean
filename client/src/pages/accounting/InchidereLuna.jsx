import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../../api/client'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import { formatMoney } from '../../utils/format'
import { AccountSelect, AccountingShell, Info, Table, currentMonth, money, statusTone, today } from './accounting-shared'
export function InchidereLuna() {
  const [searchParams] = useSearchParams()
  const [month, setMonth] = useState(searchParams.get('luna') || currentMonth())
  const [data, setData] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { load() }, [month])

  function load() {
    const [an, luna] = month.split('-')
    setError('')
    api.get(`/accounting/periods/${an}/${Number(luna)}/check`)
      .then(res => setData(res.data))
      .catch(err => {
        setData(null)
        setError(err.response?.data?.error || 'Nu am putut verifica luna selectata.')
      })
  }

  async function closeMonth() {
    const [an, luna] = month.split('-')
    try {
      setError('')
      await api.post(`/accounting/periods/${an}/${Number(luna)}/close`)
      setMessage('Luna a fost inchisa.')
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Luna nu a putut fi inchisa.')
    }
  }

  async function reopenMonth() {
    const [an, luna] = month.split('-')
    try {
      setError('')
      await api.post(`/accounting/periods/${an}/${Number(luna)}/reopen`)
      setMessage('Luna a fost redeschisa.')
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Luna nu a putut fi redeschisa.')
    }
  }

  async function markSubmitted() {
    const [an, luna] = month.split('-')
    try {
      setError('')
      await api.post(`/accounting/periods/${an}/${Number(luna)}/mark-submitted`, { depunere_ref: 'Declaratii depuse' })
      setMessage('Declaratiile au fost marcate ca depuse.')
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Declaratiile nu au putut fi marcate ca depuse.')
    }
  }

  const checks = data?.checks || {}
  const status = data?.period?.status || 'deschisa'
  const blockers = [
    checks.draft_count ? `${checks.draft_count} documente draft` : '',
    checks.unbalanced_journals ? `${checks.unbalanced_journals} note dezechilibrate` : '',
    checks.balance_ok === false ? 'balanta dezechilibrata' : '',
    checks.tva_checked === false ? 'TVA neverificat' : ''
  ].filter(Boolean)
  const resolveTarget = (row) => row.resolve_url || '/contabilitate'

  return (
    <AccountingShell active="inchidere" title="Inchidere luna" subtitle="Verificari contabile, blocare luna si marcarea declaratiilor depuse.">
      <Card>
        <div className="grid gap-3 md:grid-cols-[240px_auto_auto_auto]">
          <Input label="Luna" type="month" value={month} onChange={event => setMonth(event.target.value)} />
          <div className="flex items-end"><Button variant="secondary" onClick={load}>Verifica luna</Button></div>
          <div className="flex items-end"><Button disabled={!checks.can_close} onClick={closeMonth}>Inchide luna</Button></div>
          <div className="flex items-end gap-2">
            <Button variant="secondary" disabled={!checks.can_reopen} onClick={reopenMonth}>Redeschide</Button>
            <Button variant="secondary" disabled={!checks.can_mark_submitted} onClick={markSubmitted}>Declaratii depuse</Button>
          </div>
        </div>
      </Card>
      {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
      {data ? (
        <>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase text-slate-500">Status luna</div>
                <div className="mt-1 flex items-center gap-2">
                  <Badge tone={statusTone(status)}>{status}</Badge>
                  <span className="text-sm text-slate-600">{checks.can_close ? 'Luna poate fi inchisa.' : blockers.length ? `Blocaje: ${blockers.join(', ')}.` : 'Luna nu este in starea necesara pentru inchidere.'}</span>
                </div>
              </div>
              <div className="text-sm text-slate-500">
                Note: {data.counts?.journals || 0} · Intrari: {data.counts?.invoices_in || 0} · Iesiri: {data.counts?.invoices_out || 0} · Trezorerie: {data.counts?.treasury || 0}
              </div>
            </div>
          </Card>
          <div className="grid gap-3 md:grid-cols-4">
            <Info label="Documente draft" value={checks.draft_count || 0} />
            <Info label="Note dezechilibrate" value={checks.unbalanced_journals || 0} />
            <Info label="Balanta" value={data.balance?.balanced ? 'Echilibrata' : formatMoney(data.balance?.difference || 0)} />
            <Info label="TVA" value={`${checks.tva_checked ? 'Verificat' : 'Neverificat'} · ${formatMoney(data.vat?.diferenta || 0)}`} />
          </div>
          {checks.tva_checked === false ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              TVA-ul lunii trebuie verificat inainte de inchidere. <Link className="font-semibold underline" to={`/contabilitate/tva-d300?luna=${month}`}>Mergi la TVA / D300</Link>
            </div>
          ) : null}
          {checks.balance_ok === false ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Balanta are diferenta {formatMoney(data.balance?.difference || 0)}. <Link className="font-semibold underline" to={`/contabilitate/balanta?luna=${month}`}>Verifica balanta</Link>
            </div>
          ) : null}
          <Table headers={['Data', 'Tip', 'Document', 'Status', 'Rezolvare']}>
            {(data.drafts || []).map(row => (
              <tr key={`${row.categorie}-${row.uuid || row.id}`}>
                <td className="px-3 py-2">{row.data || '-'}</td>
                <td className="px-3 py-2">{row.categorie}</td>
                <td className="px-3 py-2">{row.document || '-'}</td>
                <td className="px-3 py-2"><Badge tone={statusTone(row.status)}>{row.status}</Badge></td>
                <td className="px-3 py-2"><Link className="font-semibold text-primary-700 hover:underline" to={resolveTarget(row)}>Deschide</Link></td>
              </tr>
            ))}
          </Table>
          <Table headers={['Data', 'Document', 'Tip', 'Debit', 'Credit', 'Diferenta', 'Rezolvare']}>
            {(data.unbalanced || []).map(row => (
              <tr key={row.uuid || row.id}>
                <td className="px-3 py-2">{row.data || '-'}</td>
                <td className="px-3 py-2">{row.nr_document || row.id}</td>
                <td className="px-3 py-2">{row.tip_document || '-'}</td>
                <td className="px-3 py-2 text-right">{formatMoney(row.total_debit)}</td>
                <td className="px-3 py-2 text-right">{formatMoney(row.total_credit)}</td>
                <td className="px-3 py-2 text-right font-semibold text-red-700">{formatMoney(row.diferenta)}</td>
                <td className="px-3 py-2"><Link className="font-semibold text-primary-700 hover:underline" to={`/contabilitate/registru-jurnal?luna=${month}`}>Registru</Link></td>
              </tr>
            ))}
          </Table>
        </>
      ) : null}
    </AccountingShell>
  )
}

export default InchidereLuna
