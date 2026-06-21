import { useEffect, useState } from 'react'
import api from '../../api/client'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import { AccountingShell, Table } from './accounting-shared'

const blankThirdParty = (tip) => ({
  tip,
  denumire: '',
  cui: '',
  nr_reg_com: '',
  tara: 'RO',
  judet: '',
  localitate: '',
  adresa: '',
  iban: '',
  banca: '',
  telefon: '',
  email: '',
  tva_platitor: false,
  zile_scadenta: 30,
  activ: true
})

export function TertiContab({ type = 'furnizor' }) {
  const [rows, setRows] = useState([])
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(blankThirdParty(type))
  const title = type === 'client' ? 'Clienti' : 'Furnizori'

  async function load() {
    const res = await api.get('/accounting/third-parties', { params: { tip: type } })
    setRows(res.data.thirdParties || [])
  }

  useEffect(() => { load().catch(() => setRows([])) }, [type])

  function openNew() {
    setEditing(null)
    setError('')
    setMessage('')
    setForm(blankThirdParty(type))
    setModal(true)
  }

  function openEdit(row) {
    setEditing(row)
    setError('')
    setMessage('')
    setForm({
      tip: row.tip || type,
      denumire: row.denumire || '',
      cui: row.cui || '',
      email: row.email || '',
      nr_reg_com: row.nr_reg_com || '',
      tara: row.tara || 'RO',
      judet: row.judet || '',
      localitate: row.localitate || '',
      adresa: row.adresa || '',
      iban: row.iban || '',
      banca: row.banca || '',
      telefon: row.telefon || '',
      tva_platitor: Boolean(row.tva_platitor),
      zile_scadenta: row.zile_scadenta || 30,
      activ: row.activ !== false
    })
    setModal(true)
  }

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (editing?.id) {
        await api.patch(`/accounting/third-parties/${editing.id}`, form)
        setMessage('Tertul a fost actualizat.')
      } else {
        await api.post('/accounting/third-parties', { ...form, tip: type })
        setMessage('Tertul a fost creat si analiticele au fost generate.')
      }
      setModal(false)
      setEditing(null)
      setForm(blankThirdParty(type))
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Tertul nu a putut fi salvat.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(row) {
    setError('')
    setMessage('')
    try {
      await api.patch(`/accounting/third-parties/${row.id}`, { activ: row.activ === false })
      setMessage(row.activ === false ? 'Tertul a fost reactivat.' : 'Tertul a fost dezactivat pentru documente noi.')
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Statusul tertului nu a putut fi schimbat.')
    }
  }

  return (
    <AccountingShell active={type === 'client' ? 'clienti' : 'furnizori'} title={title} subtitle="Terți contabili cu analitice generate automat." actions={<Button onClick={openNew}>+ {type === 'client' ? 'Client' : 'Furnizor'}</Button>}>
      {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
      <Table headers={['Cod', 'Denumire', 'CUI', 'Cont furnizor', 'Cont client', 'Contact', 'Status', 'Actiuni']}>
        {rows.map(row => (
          <tr key={row.id}>
            <td className="px-3 py-2 font-semibold">{row.cod}</td>
            <td className="px-3 py-2">
              <div className="font-medium">{row.denumire}</div>
              <div className="text-xs text-slate-500">{row.localitate || row.judet || '-'}</div>
            </td>
            <td className="px-3 py-2">{row.cui || '-'}</td>
            <td className="px-3 py-2">{row.cont_analitic_furnizor || '-'}</td>
            <td className="px-3 py-2">{row.cont_analitic_client || '-'}</td>
            <td className="px-3 py-2">
              <div>{row.email || '-'}</div>
              <div className="text-xs text-slate-500">{row.telefon || ''}</div>
            </td>
            <td className="px-3 py-2"><Badge tone={row.activ === false ? 'neutral' : 'success'}>{row.activ === false ? 'inactiv' : 'activ'}</Badge></td>
            <td className="px-3 py-2">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => openEdit(row)}>Editeaza</Button>
                <Button size="sm" variant={row.activ === false ? 'secondary' : 'outline'} onClick={() => toggleActive(row)}>{row.activ === false ? 'Reactiveaza' : 'Dezactiveaza'}</Button>
              </div>
            </td>
          </tr>
        ))}
      </Table>
      <Modal open={modal} title={`${editing ? 'Editeaza' : 'Adauga'} ${type === 'client' ? 'client' : 'furnizor'}`} onClose={() => setModal(false)}>
        <form className="grid gap-3" onSubmit={submit}>
          {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Denumire" value={form.denumire} onChange={event => setForm({ ...form, denumire: event.target.value })} required />
            <Input label="CUI / CIF" value={form.cui} onChange={event => setForm({ ...form, cui: event.target.value })} />
            <Input label="Nr. reg. com." value={form.nr_reg_com || ''} onChange={event => setForm({ ...form, nr_reg_com: event.target.value })} />
            <Input label="Email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} />
            <Input label="Telefon" value={form.telefon || ''} onChange={event => setForm({ ...form, telefon: event.target.value })} />
            <Input label="Tara" value={form.tara || 'RO'} onChange={event => setForm({ ...form, tara: event.target.value })} maxLength={2} />
            <Input label="Judet" value={form.judet || ''} onChange={event => setForm({ ...form, judet: event.target.value })} />
            <Input label="Localitate" value={form.localitate || ''} onChange={event => setForm({ ...form, localitate: event.target.value })} />
            <Input label="IBAN" value={form.iban || ''} onChange={event => setForm({ ...form, iban: event.target.value })} />
            <Input label="Banca" value={form.banca || ''} onChange={event => setForm({ ...form, banca: event.target.value })} />
            <Input label="Zile scadenta" type="number" min="0" value={form.zile_scadenta || 0} onChange={event => setForm({ ...form, zile_scadenta: Number(event.target.value || 0) })} />
            <Select label="Tip tert" value={form.tip || type} onChange={event => setForm({ ...form, tip: event.target.value })} options={[
              { value: 'furnizor', label: 'Furnizor' },
              { value: 'client', label: 'Client' },
              { value: 'ambele', label: 'Furnizor si client' }
            ]} />
          </div>
          <Input label="Adresa" value={form.adresa || ''} onChange={event => setForm({ ...form, adresa: event.target.value })} />
          <div className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 md:grid-cols-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={Boolean(form.tva_platitor)} onChange={event => setForm({ ...form, tva_platitor: event.target.checked })} />
              Platitor TVA
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.activ !== false} onChange={event => setForm({ ...form, activ: event.target.checked })} />
              Activ pentru documente noi
            </label>
          </div>
          {editing ? (
            <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Analitice: furnizor {editing.cont_analitic_furnizor || '-'} / client {editing.cont_analitic_client || '-'}.
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal(false)}>Renunta</Button>
            <Button type="submit" loading={saving}>Salveaza</Button>
          </div>
        </form>
      </Modal>
    </AccountingShell>
  )
}

export default TertiContab

