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
export function PlanConturi() {
  const [accounts, setAccounts] = useState([])
  const [filters, setFilters] = useState({ q: '', clasa: '', tip: '', nivel: '' })
  const [selected, setSelected] = useState(null)
  const [expandedClasses, setExpandedClasses] = useState(() => new Set(['1', '2', '3', '4', '5', '6', '7']))
  const navigate = useNavigate()
  useEffect(() => {
    api.get('/accounting/chart', { params: filters }).then(res => setAccounts(res.data.accounts || [])).catch(() => setAccounts([]))
  }, [filters.q, filters.clasa, filters.tip, filters.nivel])
  useEffect(() => {
    if (!selected && accounts.length) setSelected(accounts[0])
    if (selected && accounts.length && !accounts.some(account => account.simbol === selected.simbol)) setSelected(accounts[0])
  }, [accounts, selected])
  const byClass = useMemo(() => {
    const groups = new Map()
    accounts.forEach((account) => {
      const key = String(account.clasa || String(account.simbol || '0')[0] || '0')
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(account)
    })
    return [...groups.entries()].sort(([a], [b]) => Number(a) - Number(b))
  }, [accounts])
  function toggleClass(key) {
    const next = new Set(expandedClasses)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setExpandedClasses(next)
  }
  const classNames = {
    1: 'Capitaluri',
    2: 'Imobilizari',
    3: 'Stocuri si productie',
    4: 'Terti',
    5: 'Trezorerie',
    6: 'Cheltuieli',
    7: 'Venituri',
    8: 'Conturi speciale',
    9: 'Gestiune interna'
  }
  return (
    <AccountingShell active="plan" title="Plan de conturi" subtitle="Seed real extras din Saga C: clase 1-9, sintetice si analitice.">
      <Card>
        <div className="grid gap-3 md:grid-cols-4">
          <Input label="Cauta" value={filters.q} onChange={event => setFilters({ ...filters, q: event.target.value })} placeholder="401, TVA, capital..." />
          <Select label="Clasa" value={filters.clasa} onChange={event => setFilters({ ...filters, clasa: event.target.value })} options={[{ value: '', label: 'Toate' }, ...[1,2,3,4,5,6,7,8,9].map(v => ({ value: v, label: `Clasa ${v}` }))]} />
          <Select label="Tip" value={filters.tip} onChange={event => setFilters({ ...filters, tip: event.target.value })} options={[{ value: '', label: 'Toate' }, { value: 'A', label: 'Activ' }, { value: 'P', label: 'Pasiv' }, { value: 'B', label: 'Bifunctional' }]} />
          <Select label="Nivel" value={filters.nivel} onChange={event => setFilters({ ...filters, nivel: event.target.value })} options={[{ value: '', label: 'Toate' }, { value: 1, label: 'Sintetice' }, { value: 2, label: 'Subconturi' }, { value: 3, label: 'Analitice' }]} />
        </div>
      </Card>
      <div className="grid min-h-[560px] gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="p-0">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="text-sm font-semibold text-slate-900">Lista conturi</div>
            <div className="text-xs text-slate-500">{accounts.length} conturi gasite. Click pe un cont pentru detalii.</div>
          </div>
          <div className="max-h-[640px] overflow-auto">
            {byClass.map(([clasa, rows]) => (
              <div key={clasa} className="border-b border-slate-100">
                <button type="button" onClick={() => toggleClass(clasa)} className="flex w-full items-center justify-between bg-slate-50 px-4 py-3 text-left hover:bg-slate-100">
                  <span>
                    <span className="font-semibold text-slate-900">Clasa {clasa}</span>
                    <span className="ml-2 text-sm text-slate-500">{classNames[clasa] || 'Alte conturi'}</span>
                  </span>
                  <span className="text-xs font-semibold text-slate-500">{rows.length} conturi {expandedClasses.has(clasa) ? '^' : 'v'}</span>
                </button>
                {expandedClasses.has(clasa) ? (
                  <div className="divide-y divide-slate-100">
                    {rows.map(account => (
                      <button
                        type="button"
                        key={account.simbol}
                        onClick={() => setSelected(account)}
                        onDoubleClick={() => navigate(`/contabilitate/fisa-cont/${account.simbol}`)}
                        className={`grid w-full grid-cols-[96px_minmax(0,1fr)_72px_90px] items-center gap-3 px-4 py-2 text-left text-sm hover:bg-primary-50 ${selected?.simbol === account.simbol ? 'bg-primary-50 text-primary-900' : 'text-slate-700'}`}
                      >
                        <span className="font-mono font-semibold">{account.simbol}</span>
                        <span className="truncate">{account.denumire}</span>
                        <span><Badge>{account.tip}</Badge></span>
                        <span className="text-xs text-slate-500">{account.tip_cont || 'general'}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {!accounts.length ? <div className="px-4 py-10 text-center text-sm text-slate-500">Nu exista conturi pentru filtrele selectate.</div> : null}
          </div>
        </Card>
        <Card>
          {selected ? (
            <div className="grid gap-4">
              <div>
                <div className="text-xs uppercase text-slate-500">Cont selectat</div>
                <div className="mt-1 font-mono text-2xl font-semibold text-slate-950">{selected.simbol}</div>
                <div className="mt-1 text-sm font-medium text-slate-700">{selected.denumire}</div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Info label="Tip" value={selected.tip === 'A' ? 'Activ' : selected.tip === 'P' ? 'Pasiv' : 'Bifunctional'} />
                <Info label="Nivel" value={selected.nivel} />
                <Info label="Clasa" value={selected.clasa} />
                <Info label="Parinte" value={selected.parinte_simbol || '-'} />
                <Info label="Categorie" value={selected.tip_cont || 'general'} />
                <Info label="Stare" value={selected.activ === false ? 'Inactiv' : 'Activ'} />
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                {selected.tva_deductibil ? 'Cont folosit pentru TVA deductibila.' : selected.tva_colectat ? 'Cont folosit pentru TVA colectata.' : 'Cont disponibil pentru note contabile si documente.'}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => navigate(`/contabilitate/fisa-cont/${selected.simbol}`)}>Fisa cont</Button>
                <Button variant="secondary" onClick={() => setFilters({ ...filters, q: selected.parinte_simbol || selected.simbol.slice(0, 3) })}>Vezi familia</Button>
              </div>
            </div>
          ) : (
            <div className="py-10 text-center text-sm text-slate-500">Selecteaza un cont din lista.</div>
          )}
        </Card>
      </div>
    </AccountingShell>
  )
}

export default PlanConturi
