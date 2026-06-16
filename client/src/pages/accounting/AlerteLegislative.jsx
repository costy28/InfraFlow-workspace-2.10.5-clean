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
export function AlerteLegislative() {
  const [rows, setRows] = useState([])
  useEffect(() => { api.get('/accounting/alerts').then(res => setRows(res.data.alerts || [])).catch(() => setRows([])) }, [])
  return (
    <AccountingShell active="alerte" title="Alerte legislative" subtitle="Urmarire schimbari relevante pentru contabilitate.">
      <Table headers={['Titlu', 'Tip', 'Data', 'Status']}>
        {rows.map(row => <tr key={row.id}><td className="px-3 py-2">{row.titlu}</td><td className="px-3 py-2">{row.tip}</td><td className="px-3 py-2">{row.data_publicare}</td><td className="px-3 py-2"><Badge tone={statusTone(row.status)}>{row.status}</Badge></td></tr>)}
      </Table>
    </AccountingShell>
  )
}

export default AlerteLegislative
