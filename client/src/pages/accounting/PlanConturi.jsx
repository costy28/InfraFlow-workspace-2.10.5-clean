import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/client'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import { AccountingShell, DropdownMenu, Info } from './accounting-shared'
export function PlanConturi() {
  const [accounts, setAccounts] = useState([])
  const [filters, setFilters] = useState({ q: '', clasa: '', tip: '', nivel: '' })
  const [selected, setSelected] = useState(null)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [expandedClasses, setExpandedClasses] = useState(() => new Set(['1', '2', '3', '4', '5', '6', '7']))
  const navigate = useNavigate()
  useEffect(() => { load() }, [filters.q, filters.clasa, filters.tip, filters.nivel])
  useEffect(() => {
    if (!selected && accounts.length) setSelected(accounts[0])
    if (selected && accounts.length && !accounts.some(account => account.simbol === selected.simbol)) setSelected(accounts[0])
  }, [accounts, selected])
  function load() {
    return api.get('/accounting/chart', { params: filters }).then(res => setAccounts(res.data.accounts || [])).catch(() => setAccounts([]))
  }
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
  function nextAnalyticSymbol(parent) {
    const base = String(parent?.simbol || '').trim()
    if (!base) return ''
    const existing = accounts
      .map(account => String(account.simbol || ''))
      .filter(simbol => simbol.startsWith(`${base}.`))
      .map(simbol => Number(simbol.split('.').pop()))
      .filter(Number.isFinite)
    const next = Math.max(0, ...existing) + 1
    return `${base}.${String(next).padStart(5, '0')}`
  }
  function openAnalytic(parent = selected) {
    if (!parent) return
    setEditing(false)
    setError('')
    setMessage('')
    setForm({
      simbol: nextAnalyticSymbol(parent),
      denumire: '',
      clasa: parent.clasa || String(parent.simbol || '0')[0],
      tip: parent.tip || 'B',
      nivel: 3,
      parinte_simbol: parent.simbol,
      tip_cont: parent.tip_cont || 'general'
    })
    setModal(true)
  }

  function openEdit(account = selected) {
    if (!account) return
    setEditing(true)
    setError('')
    setMessage('')
    setForm({
      simbol: account.simbol,
      denumire: account.denumire || '',
      clasa: account.clasa || String(account.simbol || '0')[0],
      tip: account.tip || 'B',
      nivel: account.nivel || 2,
      parinte_simbol: account.parinte_simbol || '',
      tip_cont: account.tip_cont || 'general',
      tva_deductibil: Boolean(account.tva_deductibil),
      tva_colectat: Boolean(account.tva_colectat),
      activ: account.activ !== false
    })
    setModal(true)
  }

  async function submitAccount(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const res = editing
        ? await api.patch(`/accounting/chart/${form.simbol}`, form)
        : await api.post('/accounting/chart', form)
      setModal(false)
      setMessage(editing ? `Contul ${form.simbol} a fost actualizat.` : `Contul ${res.data.account?.simbol || form.simbol} a fost creat.`)
      setFilters({ ...filters, q: form.simbol })
      await load()
      setSelected(res.data.account || null)
    } catch (err) {
      setError(err.response?.data?.error || 'Contul nu a putut fi salvat.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleSelectedActive() {
    if (!selected) return
    setError('')
    setMessage('')
    try {
      const nextActive = selected.activ === false
      const res = await api.patch(`/accounting/chart/${selected.simbol}`, { activ: nextActive })
      setMessage(nextActive ? `Contul ${selected.simbol} a fost reactivat.` : `Contul ${selected.simbol} a fost dezactivat pentru documente noi.`)
      await load()
      setSelected(res.data.account || { ...selected, activ: nextActive })
    } catch (err) {
      setError(err.response?.data?.error || 'Statusul contului nu a putut fi schimbat.')
    }
  }
  function selectedActionMenu(account = selected) {
    if (!account) return []
    return [
      { label: 'Fisa cont', to: `/contabilitate/fisa-cont/${account.simbol}` },
      { label: 'Editeaza cont', onClick: () => openEdit(account) },
      { label: 'Vezi familia', onClick: () => setFilters({ ...filters, q: account.parinte_simbol || account.simbol.slice(0, 3) }) },
      { label: 'Adauga analitic', onClick: () => openAnalytic(account) },
      { type: 'separator' },
      {
        label: account.activ === false ? 'Reactiveaza cont' : 'Dezactiveaza cont',
        onClick: toggleSelectedActive,
        danger: account.activ !== false,
      },
    ]
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
    <AccountingShell
      active="plan"
      title="Plan de conturi"
      subtitle="Plan contabil romanesc: clase 1-9, sintetice si analitice."
      actions={<DropdownMenu align="right" label="Actiuni cont" items={selectedActionMenu(selected)} />}
    >
      {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
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
                        className={`grid w-full grid-cols-[96px_minmax(0,1fr)_72px_90px] items-center gap-3 px-4 py-2 text-left text-sm hover:bg-primary-50 ${account.activ === false ? 'opacity-60' : ''} ${selected?.simbol === account.simbol ? 'bg-primary-50 text-primary-900' : 'text-slate-700'}`}
                      >
                        <span className="font-mono font-semibold">{account.simbol}</span>
                        <span className="truncate">{account.denumire}{account.activ === false ? ' (inactiv)' : ''}</span>
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
                <DropdownMenu align="right" label="Actiuni cont" items={selectedActionMenu(selected)} />
              </div>
            </div>
          ) : (
            <div className="py-10 text-center text-sm text-slate-500">Selecteaza un cont din lista.</div>
          )}
        </Card>
      </div>
      <Modal open={modal} title={editing ? 'Editare cont' : 'Cont analitic nou'} onClose={() => setModal(false)}>
        <form className="grid gap-3" onSubmit={submitAccount}>
          {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Simbol cont" value={form.simbol || ''} onChange={event => setForm({ ...form, simbol: event.target.value })} required disabled={editing} />
            <Input label="Parinte" value={form.parinte_simbol || ''} onChange={event => setForm({ ...form, parinte_simbol: event.target.value })} required={!editing} />
            <Select label="Tip" value={form.tip || 'B'} onChange={event => setForm({ ...form, tip: event.target.value })} options={[
              { value: 'A', label: 'Activ' },
              { value: 'P', label: 'Pasiv' },
              { value: 'B', label: 'Bifunctional' }
            ]} />
            <Input label="Categorie" value={form.tip_cont || ''} onChange={event => setForm({ ...form, tip_cont: event.target.value })} />
          </div>
          <Input label="Denumire" value={form.denumire || ''} onChange={event => setForm({ ...form, denumire: event.target.value })} required />
          <div className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 md:grid-cols-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={Boolean(form.tva_deductibil)} onChange={event => setForm({ ...form, tva_deductibil: event.target.checked, tva_colectat: event.target.checked ? false : form.tva_colectat })} />
              TVA deductibila
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={Boolean(form.tva_colectat)} onChange={event => setForm({ ...form, tva_colectat: event.target.checked, tva_deductibil: event.target.checked ? false : form.tva_deductibil })} />
              TVA colectata
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.activ !== false} onChange={event => setForm({ ...form, activ: event.target.checked })} />
              Activ
            </label>
          </div>
          <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {editing ? 'Simbolul ramane neschimbat pentru a pastra legatura cu notele si facturile existente.' : 'Contul va fi disponibil imediat in facturi, trezorerie si note contabile.'}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal(false)}>Renunta</Button>
            <Button type="submit" loading={saving}>{editing ? 'Salveaza cont' : 'Creeaza cont'}</Button>
          </div>
        </form>
      </Modal>
    </AccountingShell>
  )
}

export default PlanConturi
