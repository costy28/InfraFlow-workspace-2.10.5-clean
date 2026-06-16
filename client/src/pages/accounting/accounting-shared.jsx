import { Link } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'

const nav = [
  ['dashboard', '/contabilitate', 'Dashboard'],
  ['plan', '/contabilitate/plan-conturi', 'Plan de conturi'],
  ['furnizori', '/contabilitate/furnizori', 'Furnizori'],
  ['clienti', '/contabilitate/clienti', 'Clienti'],
  ['intrare', '/contabilitate/facturi-intrare', 'Facturi intrare'],
  ['iesire', '/contabilitate/facturi-iesire', 'Facturi iesire'],
  ['trezorerie', '/contabilitate/trezorerie', 'Trezorerie'],
  ['jurnal', '/contabilitate/registru-jurnal', 'Registru jurnal'],
  ['tva', '/contabilitate/tva-d300', 'TVA / D300'],
  ['balanta', '/contabilitate/balanta', 'Balanta'],
  ['inchidere', '/contabilitate/inchidere-luna', 'Inchidere luna'],
  ['alerte', '/contabilitate/alerte', 'Alerte'],
]

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
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
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

export function AccountSelect({ label, value, onChange, accounts, recommendedClasses = [], required = false }) {
  const preferred = recommendedClasses.length
    ? accounts.filter(account => recommendedClasses.includes(Number(account.clasa)))
    : accounts
  const rest = recommendedClasses.length
    ? accounts.filter(account => !recommendedClasses.includes(Number(account.clasa)))
    : []
  const options = [...preferred, ...rest]
  const selected = accounts.find(account => account.simbol === value)
  return (
    <div className="grid gap-1">
      <Select
        label={label}
        value={value || ''}
        onChange={onChange}
        required={required}
        options={[{ value: '', label: 'Selecteaza cont' }, ...options.map(account => ({ value: account.simbol, label: `${account.simbol} - ${account.denumire}` }))]}
      />
      {selected ? <div className="text-xs text-slate-500">{selected.tip_cont || 'general'} · clasa {selected.clasa}</div> : null}
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
      <Card>
        <div className="flex flex-wrap gap-2">
          {nav.map(([key, to, label]) => (
            <Link key={key} to={to} className={`rounded-md border px-3 py-2 text-sm font-medium ${active === key ? 'border-primary-700 bg-primary-700 text-white' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
              {label}
            </Link>
          ))}
        </div>
      </Card>
      {children}
    </div>
  )
}

export function Table({ headers, children }) {
  return (
    <Card>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>{headers.map(header => <th key={header} className="px-3 py-2">{header}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {children?.length ? children : <tr><td colSpan={headers.length} className="px-3 py-8 text-center text-sm text-slate-500">Nu exista date.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
