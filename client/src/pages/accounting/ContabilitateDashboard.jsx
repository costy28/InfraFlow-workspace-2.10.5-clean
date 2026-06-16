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
  const [month, setMonth] = useState(currentMonth())
  const [error, setError] = useState('')
  useEffect(() => {
    api.get('/accounting/summary', { params: { luna: month } })
      .then(res => setSummary(res.data))
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
    </AccountingShell>
  )
}

export default ContabilitateDashboard
