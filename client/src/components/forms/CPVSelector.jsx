import { useEffect, useState } from 'react'
import api from '../../api/client'
import Button from '../ui/Button'
import Input from './Input'
import Modal from '../ui/Modal'

export default function CPVSelector({ label = 'Cod CPV', value = '', onChange, required = false }) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ cod: '', denumire_ro: '', denumire_en: '' })
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.resolve().then(() => setQuery(value || ''))
  }, [value])

  useEffect(() => {
    if (query.trim().length < 2) {
      Promise.resolve().then(() => setResults([]))
      return
    }
    const timer = setTimeout(() => {
      api.get('/cpv/search', { params: { q: query, lang: 'ro' } })
        .then(response => setResults(response.data.results || []))
        .catch(() => setResults([]))
    }, 180)
    return () => clearTimeout(timer)
  }, [query])

  function select(cpv) {
    onChange?.(cpv.cod, cpv)
    setQuery(cpv.cod)
    setOpen(false)
  }

  async function addCode(event) {
    event.preventDefault()
    setError('')
    try {
      const response = await api.post('/cpv', form)
      select(response.data.cpv)
      setAddOpen(false)
      setForm({ cod: '', denumire_ro: '', denumire_en: '' })
    } catch (err) {
      setError(err.response?.data?.error || 'Codul CPV nu a putut fi adăugat.')
    }
  }

  return (
    <div className="relative">
      <Input
        label={label}
        value={query}
        required={required}
        placeholder="Caută după cod sau denumire"
        onFocus={() => setOpen(true)}
        onChange={event => {
          setQuery(event.target.value)
          setOpen(true)
          onChange?.(event.target.value, null)
        }}
      />
      {open && query.trim().length >= 2 ? (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white p-1 shadow-lg">
          {results.map(cpv => (
            <button key={cpv.cod} type="button" className="block w-full rounded px-2 py-2 text-left text-xs hover:bg-primary-50" onClick={() => select(cpv)}>
              <strong>[{cpv.cod}]</strong> {cpv.denumire_ro}
            </button>
          ))}
          {!results.length ? <button type="button" className="block w-full rounded px-2 py-2 text-left text-xs font-medium text-primary-700 hover:bg-primary-50" onClick={() => { setForm(current => ({ ...current, cod: /^\d{8}-\d$/.test(query) ? query : '' })); setAddOpen(true); setOpen(false) }}>+ Adaugă cod nou</button> : null}
        </div>
      ) : null}
      <Modal open={addOpen} title="Cod CPV nou" onClose={() => setAddOpen(false)}>
        <form className="grid gap-3" onSubmit={addCode}>
          <Input label="Cod CPV" value={form.cod} onChange={event => setForm({ ...form, cod: event.target.value })} placeholder="12345678-9" required />
          <Input label="Denumire RO" value={form.denumire_ro} onChange={event => setForm({ ...form, denumire_ro: event.target.value })} required />
          <Input label="Denumire EN" value={form.denumire_en} onChange={event => setForm({ ...form, denumire_en: event.target.value })} />
          {error ? <div className="rounded bg-rose-50 p-2 text-sm text-rose-700">{error}</div> : null}
          <Button type="submit">Adaugă codul</Button>
        </form>
      </Modal>
    </div>
  )
}
