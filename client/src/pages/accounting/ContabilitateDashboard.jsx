import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api from '../../api/client'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import { formatMoney } from '../../utils/format'
import { AccountSelect, AccountingShell, Info, Table, currentMonth, money, statusTone, today } from './accounting-shared'
export function ContabilitateDashboard() {
  const [summary, setSummary] = useState(null)
  const [health, setHealth] = useState(null)
  const [month, setMonth] = useState(currentMonth())
  const [error, setError] = useState('')
  useEffect(() => {
    Promise.all([
      api.get('/accounting/summary', { params: { luna: month } }),
      api.get('/accounting/health', { params: { luna: month } })
    ])
      .then(([summaryRes, healthRes]) => {
        setSummary(summaryRes.data)
        setHealth(healthRes.data)
      })
      .catch(err => setError(err.response?.data?.error || 'Nu am putut incarca dashboard-ul contabil.'))
  }, [month])
  return (
    <AccountingShell active="dashboard" title="Contabilitate" subtitle="Registru, facturi, TVA, balanta si inchidere perioada.">
      {error ? <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      <Card>
        <Input label="Luna" type="month" value={month} onChange={event => setMonth(event.target.value)} />
      </Card>
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          ['Perioada', summary?.period?.status || 'deschisa'],
          ['Facturi intrare', `${summary?.invoicesIn?.count || 0} / ${formatMoney(summary?.invoicesIn?.total || 0)}`],
          ['Facturi iesire', `${summary?.invoicesOut?.count || 0} / ${formatMoney(summary?.invoicesOut?.total || 0)}`],
          ['TVA diferenta', formatMoney(summary?.vat?.diferenta || 0)],
          ['Furnizori depasiti', summary?.overdueSuppliers || 0],
          ['Clienti restanti', summary?.overdueClients || 0],
        ].map(([label, value]) => (
          <Card key={label}>
            <div className="text-xs text-slate-500">{label}</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">{value}</div>
          </Card>
        ))}
      </div>
      {summary?.alertsNew ? <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Exista {summary.alertsNew} alerte legislative noi.</div> : null}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Verificare rapidă</h3>
            <p className="text-sm text-slate-500">Prerechizite pentru facturi, trezorerie, registru jurnal și balanță.</p>
          </div>
          <Badge tone={health?.status === 'ok' ? 'success' : 'warning'}>{health?.status === 'ok' ? 'OK' : 'Necesită atenție'}</Badge>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {(health?.checks || []).map(check => (
            <div key={check.key} className={`rounded-md border p-3 ${check.ok ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-slate-900">{check.label}</div>
                <Badge tone={check.ok ? 'success' : 'warning'}>{check.ok ? 'OK' : 'Verifică'}</Badge>
              </div>
              <div className="mt-1 text-sm font-medium text-slate-700">{check.value}</div>
              <div className="mt-2 text-xs text-slate-600">{check.message}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" to="/contabilitate/plan-conturi">Plan de conturi</Link>
          <Link className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" to="/contabilitate/furnizori">Furnizori</Link>
          <Link className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" to="/contabilitate/clienti">Clienți</Link>
          <Link className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" to={`/contabilitate/balanta?luna=${month}`}>Balanță</Link>
        </div>
      </Card>
    </AccountingShell>
  )
}

export default ContabilitateDashboard
