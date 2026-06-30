import { useEffect, useState } from 'react'
import api from '../../api/client'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import Modal from '../../components/ui/Modal'
import { formatMoney } from '../../utils/format'
import { AccountingShell, DropdownMenu, Info, Table } from './accounting-shared'

const emptyMapping = { statement_type: 'BILANT', code: '', label: '', calculation: 'asset', prefixes: '', order: 10, active: true }

export default function SituatiiFinanciare() {
  const now = new Date()
  const [an, setAn] = useState(now.getFullYear())
  const [luna, setLuna] = useState(12)
  const [tip, setTip] = useState('BILANT')
  const [data, setData] = useState({ rows: [], control: {} })
  const [mappings, setMappings] = useState([])
  const [mappingOpen, setMappingOpen] = useState(false)
  const [mapping, setMapping] = useState(emptyMapping)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => { load() }, [an, luna, tip])

  async function load() {
    try {
      const [report, mapResponse] = await Promise.all([
        api.get('/accounting/financial-statements', { params: { an, luna, tip } }),
        api.get('/accounting/financial-statements/mappings')
      ])
      setData(report.data || { rows: [], control: {} })
      setMappings(mapResponse.data?.mappings || [])
      setError('')
    } catch (err) { setError(err.response?.data?.error || 'Situatia financiara nu a putut fi calculata.') }
  }

  async function saveMapping(event) {
    event.preventDefault()
    try {
      await api.post('/accounting/financial-statements/mappings', { ...mapping, prefixes: String(mapping.prefixes || '').split(/[,;\s]+/).filter(Boolean), order: Number(mapping.order) })
      setMappingOpen(false); setMapping(emptyMapping); setMessage('Maparea a fost salvata.'); load()
    } catch (err) { setError(err.response?.data?.error || 'Maparea nu a putut fi salvata.') }
  }

  async function removeMapping(item) {
    if (!window.confirm(`Anulezi maparea ${item.code}?`)) return
    try { await api.delete(`/accounting/financial-statements/mappings/${item.id}`, { data: { motiv: 'Anulare din situatii financiare' } }); setMessage('Maparea a fost anulata.'); load() }
    catch (err) { setError(err.response?.data?.error || 'Maparea nu a putut fi anulata.') }
  }

  function editMapping(item = null) {
    setMapping(item ? { ...item, prefixes: (item.prefixes || []).join(', ') } : { ...emptyMapping, statement_type: tip })
    setMappingOpen(true)
  }

  async function download(endpoint, filename, open = false) {
    try {
      const response = await api.get(endpoint, { params: { an, luna, tip }, responseType: 'blob' })
      const url = URL.createObjectURL(response.data)
      if (open) { window.open(url, '_blank', 'noopener,noreferrer'); window.setTimeout(() => URL.revokeObjectURL(url), 60000); return }
      const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url)
    } catch (err) { setError(err.response?.data?.error || 'Documentul nu a putut fi generat.') }
  }

  const activeMappings = mappings.filter(item => item.statement_type === tip)
  return (
    <AccountingShell
      active="situatii-financiare"
      title="Situatii financiare"
      subtitle="Pozitie financiara si profit/pierdere, comparativ cu anul precedent."
      actions={<DropdownMenu label="Actiuni" align="right" items={[
        { label: 'Recalculeaza', onClick: load },
        { label: 'Export Excel', onClick: () => download('/accounting/financial-statements/export', `Situatie_${tip}_${an}_${luna}.xlsx`) },
        { label: 'Tipareste / PDF', onClick: () => download('/accounting/financial-statements/print', '', true) },
        { type: 'separator' },
        { label: 'Adauga mapare', onClick: () => editMapping() }
      ]} />}
    >
      <Card><div className="grid gap-3 sm:grid-cols-3"><Input label="An" type="number" min="2000" max="2100" value={an} onChange={event => setAn(Number(event.target.value))} /><Select label="Luna de raportare" value={luna} onChange={event => setLuna(Number(event.target.value))} options={Array.from({ length: 12 }, (_, index) => ({ value: index + 1, label: String(index + 1).padStart(2, '0') }))} /><Select label="Situatie" value={tip} onChange={event => setTip(event.target.value)} options={[{ value: 'BILANT', label: 'Pozitie financiara' }, { value: 'CPP', label: 'Profit si pierdere' }]} /></div></Card>
      {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
      <div className="grid gap-3 sm:grid-cols-3"><Info label="Perioada" value={data.period_end || '-'} /><Info label="Comparativ" value={data.previous_period_end || '-'} /><Info label="Control" value={<Badge tone={data.control?.ok ? 'success' : 'warning'}>{data.control?.message || '-'}</Badge>} /></div>
      <Table headers={['Cod', 'Indicator', 'Conturi', 'An curent', 'An precedent', 'Diferenta', 'Variatie', 'Actiuni']}>
        {(data.rows || []).map(row => <tr key={row.code}><td className="px-3 py-2 font-mono font-semibold">{row.code}</td><td className="px-3 py-2">{row.label}</td><td className="px-3 py-2 text-xs text-slate-500">{(row.prefixes || []).join(', ')}</td><td className="px-3 py-2 text-right font-semibold">{formatMoney(row.current)}</td><td className="px-3 py-2 text-right">{formatMoney(row.previous)}</td><td className="px-3 py-2 text-right">{formatMoney(row.difference)}</td><td className="px-3 py-2 text-right">{row.variation_percent == null ? '-' : `${row.variation_percent}%`}</td><td className="px-3 py-2"><DropdownMenu label="Actiuni" items={[{ label: 'Editeaza maparea', onClick: () => editMapping(row) }, { label: 'Anuleaza maparea', onClick: () => removeMapping(row) }]} /></td></tr>)}
      </Table>
      <Card><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Mapari active</h3><p className="text-sm text-slate-500">{activeMappings.length} randuri configurate pentru {tip}.</p></div><Button size="sm" onClick={() => editMapping()}>Adauga</Button></div><p className="mt-3 text-xs text-slate-500">Raport managerial configurabil. Formularul oficial depus ramane conditionat de programul de asistenta aplicabil entitatii si exercitiului.</p></Card>

      <Modal open={mappingOpen} title={mapping.id ? 'Editeaza maparea' : 'Mapare noua'} onClose={() => setMappingOpen(false)} size="md">
        <form className="grid gap-3" onSubmit={saveMapping}>
          <div className="grid gap-3 sm:grid-cols-2"><Select label="Situatie" value={mapping.statement_type} onChange={event => setMapping(current => ({ ...current, statement_type: event.target.value }))} options={[{ value: 'BILANT', label: 'Pozitie financiara' }, { value: 'CPP', label: 'Profit si pierdere' }]} /><Input label="Cod rand" value={mapping.code} onChange={event => setMapping(current => ({ ...current, code: event.target.value }))} required /></div>
          <Input label="Denumire indicator" value={mapping.label} onChange={event => setMapping(current => ({ ...current, label: event.target.value }))} required />
          <Input label="Prefixe conturi" value={mapping.prefixes} onChange={event => setMapping(current => ({ ...current, prefixes: event.target.value }))} placeholder="20, 21, 28" required />
          <div className="grid gap-3 sm:grid-cols-2"><Select label="Calcul" value={mapping.calculation} onChange={event => setMapping(current => ({ ...current, calculation: event.target.value }))} options={[{ value: 'asset', label: 'Sold debitor - creditor' }, { value: 'liability', label: 'Sold creditor - debitor' }, { value: 'revenue', label: 'Rulaj credit - debit' }, { value: 'expense', label: 'Rulaj debit - credit' }]} /><Input label="Ordine" type="number" value={mapping.order} onChange={event => setMapping(current => ({ ...current, order: event.target.value }))} /></div>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setMappingOpen(false)}>Renunta</Button><Button type="submit">Salveaza</Button></div>
        </form>
      </Modal>
    </AccountingShell>
  )
}
