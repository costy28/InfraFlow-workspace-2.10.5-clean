import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/forms/Input'
import DropdownMenu from '../../components/ui/DropdownMenu'

export { default as DropdownMenu } from '../../components/ui/DropdownMenu'

const nav = [
  ['dashboard', '/contabilitate', 'Dashboard'],
  ['plan', '/contabilitate/plan-conturi', 'Plan de conturi'],
  ['solduri', '/contabilitate/solduri-initiale', 'Solduri initiale'],
  ['furnizori', '/contabilitate/furnizori', 'Furnizori'],
  ['clienti', '/contabilitate/clienti', 'Clienti'],
  ['intrare', '/contabilitate/facturi-intrare', 'Facturi intrare'],
  ['iesire', '/contabilitate/facturi-iesire', 'Facturi iesire'],
  ['trezorerie', '/contabilitate/trezorerie', 'Trezorerie'],
  ['operatiuni', '/contabilitate/operatiuni', 'Operațiuni contabile'],
  ['jurnale', '/contabilitate/jurnale', 'Jurnale'],
  ['jurnal', '/contabilitate/registru-jurnal', 'Registru jurnal'],
  ['cartea-mare', '/contabilitate/cartea-mare', 'Cartea Mare'],
  ['tva', '/contabilitate/tva-d300', 'Centru fiscal'],
  ['salarizare', '/contabilitate/salarizare', 'Salarizare'],
  ['balanta', '/contabilitate/balanta', 'Balanta'],
  ['profit-pierdere', '/contabilitate/profit-pierdere', 'Profit/Pierdere'],
  ['situatii-financiare', '/contabilitate/situatii-financiare', 'Situatii financiare'],
  ['anaf', '/contabilitate/anaf', 'ANAF / e-Factura'],
  ['controlling', '/contabilitate/controlling', 'Controlling'],
  ['inchidere', '/contabilitate/inchidere-luna', 'Inchidere luna'],
  ['sabloane', '/contabilitate/sabloane-note', 'Sabloane note'],
  ['alerte', '/contabilitate/alerte', 'Alerte'],
]

const navGroups = [
  {
    label: 'Nomenclatoare',
    keys: ['plan', 'solduri', 'furnizori', 'clienti'],
  },
  {
    label: 'Operațiuni',
    keys: ['intrare', 'iesire', 'trezorerie', 'operatiuni'],
  },
  {
    label: 'Rapoarte',
    keys: ['jurnale', 'jurnal', 'cartea-mare', 'tva', 'balanta', 'profit-pierdere', 'situatii-financiare', 'controlling'],
  },
  {
    label: 'Administrare',
    keys: ['salarizare', 'anaf', 'inchidere', 'sabloane', 'alerte'],
  },
]

const navByKey = Object.fromEntries(nav.map(([key, to, label]) => [key, { key, to, label }]))

export function today() {
  return new Date().toISOString().slice(0, 10)
}

export function currentMonth() {
  return today().slice(0, 7)
}

export function money(value) {
  return Number(value || 0)
}

export function statusTone(status) {
  return {
    draft: 'gray',
    validat: 'info',
    achitat: 'success',
    incasat: 'success',
    partial: 'warning',
    stornat: 'danger',
    devalidat: 'warning',
    anulat: 'danger',
    activ: 'success',
    inchisa: 'danger',
    depusa: 'info',
    deschisa: 'success',
    nou: 'warning',
    implementat: 'success',
  }[status] || 'gray'
}

export function Info({ label, value }) {
  return (
    <div className="rounded-[var(--radius-control)] border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 break-words font-semibold text-slate-900">{value}</div>
    </div>
  )
}

export function AccountInput({ label, value, onChange, accounts, id, recommendedClasses = [] }) {
  const inputId = id || `${label || 'cont'}-${Math.random().toString(36).slice(2)}`
  const listId = `${inputId}-list`
  const selected = accounts.find(account => account.simbol === value)
  const preferred = recommendedClasses.length
    ? accounts.filter(account => recommendedClasses.includes(Number(account.clasa)))
    : accounts
  const rest = recommendedClasses.length
    ? accounts.filter(account => !recommendedClasses.includes(Number(account.clasa)))
    : []
  const options = [...preferred, ...rest]
  return (
    <div className="grid gap-1">
      <Input
        id={inputId}
        label={label}
        value={value || ''}
        list={listId}
        onChange={onChange}
        helperText={selected ? selected.denumire : 'Scrie codul sau cauta dupa denumire.'}
      />
      <datalist id={listId}>
        {options.map(account => (
          <option key={account.simbol} value={account.simbol}>{`${account.simbol} - ${account.denumire}`}</option>
        ))}
      </datalist>
    </div>
  )
}

export function AccountSelect({ label, value, onChange, accounts = [], recommendedClasses = [], required = false, disabled = false }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputId = useRef(`account-${Math.random().toString(36).slice(2)}`)
  const selected = accounts.find(account => account.simbol === value)
  const orderedAccounts = useMemo(() => {
    const preferred = recommendedClasses.length
      ? accounts.filter(account => recommendedClasses.includes(Number(account.clasa)))
      : accounts
    const rest = recommendedClasses.length
      ? accounts.filter(account => !recommendedClasses.includes(Number(account.clasa)))
      : []
    return [...preferred, ...rest]
  }, [accounts, recommendedClasses])
  const filteredAccounts = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return orderedAccounts.slice(0, 80)
    return orderedAccounts
      .filter(account => `${account.simbol} ${account.denumire} ${account.tip_cont || ''}`.toLowerCase().includes(needle))
      .slice(0, 80)
  }, [orderedAccounts, query])
  function chooseAccount(account) {
    onChange({ target: { value: account?.simbol || '' } })
    setQuery('')
    setOpen(false)
  }
  function acceptExactCode() {
    const text = query.trim()
    if (!text) return
    const exact = accounts.find(account => account.simbol.toLowerCase() === text.toLowerCase())
    if (exact) chooseAccount(exact)
  }
  return (
    <div className="relative grid gap-1">
      <label htmlFor={inputId.current} className="text-sm font-medium text-slate-700">
        {label}{required ? <span className="text-red-600"> *</span> : null}
      </label>
      <input
        id={inputId.current}
        className="h-[var(--control-height)] w-full rounded-[var(--radius-control)] border border-slate-300 bg-white px-[var(--control-px)] text-sm outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 disabled:bg-slate-100 disabled:text-slate-500"
        value={open ? query : selected ? `${selected.simbol} - ${selected.denumire}` : value || ''}
        onFocus={() => {
          setQuery('')
          setOpen(true)
        }}
        onChange={event => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onKeyDown={event => {
          if (event.key === 'Enter' && open) {
            event.preventDefault()
            acceptExactCode()
          }
          if (event.key === 'Escape') setOpen(false)
        }}
        onBlur={() => {
          acceptExactCode()
          window.setTimeout(() => setOpen(false), 120)
        }}
        placeholder="Cauta dupa cont sau denumire"
        required={required}
        disabled={disabled}
      />
      {value && !selected ? <div className="text-xs text-rose-600">Contul {value} nu exista in planul de conturi.</div> : null}
      {selected ? <div className="text-xs text-slate-500">{selected.tip_cont || 'general'} · clasa {selected.clasa}</div> : null}
      {open && !disabled ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-auto rounded-[var(--radius-panel)] border border-slate-200 bg-white shadow-lg">
          <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50" onMouseDown={() => chooseAccount(null)}>
            <span>Fara cont selectat</span>
          </button>
          {filteredAccounts.map(account => (
            <button
              type="button"
              key={account.simbol}
              className={`grid w-full gap-0.5 px-3 py-2 text-left text-sm hover:bg-primary-50 ${account.simbol === value ? 'bg-primary-50 text-primary-800' : 'text-slate-800'}`}
              onMouseDown={() => chooseAccount(account)}
            >
              <span className="font-semibold">{account.simbol} - {account.denumire}</span>
              <span className="text-xs text-slate-500">{account.tip_cont || 'general'} · clasa {account.clasa}</span>
            </button>
          ))}
          {!filteredAccounts.length ? <div className="px-3 py-3 text-sm text-slate-500">Nu exista cont pentru cautarea curenta.</div> : null}
          {orderedAccounts.length > filteredAccounts.length ? <div className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">Sunt afisate primele {filteredAccounts.length} rezultate. Scrie mai multe caractere pentru filtrare.</div> : null}
        </div>
      ) : null}
    </div>
  )
}

export function AccountingShell({ active, title, subtitle, children, actions }) {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">{actions}</div>
      </div>
      <Card density="compact">
        <div className="flex flex-wrap gap-2">
          <Link to="/contabilitate" className={`inline-flex h-[var(--control-height)] items-center rounded-[var(--radius-control)] border px-[var(--control-px)] text-sm font-semibold transition ${active === 'dashboard' ? 'border-primary-700 bg-primary-700 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50'}`}>
            Dashboard
          </Link>
          {navGroups.map(group => {
            const items = group.keys
              .map(key => navByKey[key])
              .filter(Boolean)
              .map(item => ({ ...item, active: active === item.key }))
            const activeItem = items.find(item => item.active)
            return (
              <DropdownMenu
                key={group.label}
                label={activeItem ? `${group.label}: ${activeItem.label}` : group.label}
                active={items.some(item => item.active)}
                items={items}
              />
            )
          })}
        </div>
      </Card>
      {children}
    </div>
  )
}

export function Table({ headers, children }) {
  return (
    <Card>
      <div className="overflow-x-auto rounded-[var(--radius-panel)] border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <tr>{headers.map(header => <th key={header} className="px-3 py-2 font-semibold">{header}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {children?.length ? children : <tr><td colSpan={headers.length} className="px-3 py-8 text-center text-sm text-slate-500">Nu exista date.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
