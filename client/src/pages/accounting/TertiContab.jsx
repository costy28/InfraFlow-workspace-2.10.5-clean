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
export function TertiContab({ type = 'furnizor' }) {
  const [rows, setRows] = useState([])
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ tip: type, denumire: '', cui: '', email: '' })
  const title = type === 'client' ? 'Clienti' : 'Furnizori'
  async function load() {
    const res = await api.get('/accounting/third-parties', { params: { tip: type } })
    setRows(res.data.thirdParties || [])
  }
  useEffect(() => { load().catch(() => setRows([])) }, [type])
  function openNew() {
    setEditing(null)
    setError('')
    setForm({ tip: type, denumire: '', cui: '', email: '' })
    setModal(true)
  }
  function openEdit(row) {
    setEditing(row)
    setError('')
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
      zile_scadenta: row.zile_scadenta || 30
    })
    setModal(true)
  }
  async function submit(event) {
    event.preventDefault()
    try {
      if (editing?.id) {
        await api.patch(`/accounting/third-parties/${editing.id}`, form)
      } else {
        await api.post('/accounting/third-parties', { ...form, tip: type })
      }
      setModal(false)
      setEditing(null)
      setForm({ tip: type, denumire: '', cui: '', email: '' })
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Tertul nu a putut fi salvat.')
    }
  }
  return (
    <AccountingShell active={type === 'client' ? 'clienti' : 'furnizori'} title={title} subtitle="Terți contabili cu analitice generate automat." actions={<Button onClick={openNew}>+ {type === 'client' ? 'Client' : 'Furnizor'}</Button>}>
      <Table headers={['Cod', 'Denumire', 'CUI', 'Cont furnizor', 'Cont client', 'Email', 'Actiuni']}>
        {rows.map(row => (
          <tr key={row.id}>
            <td className="px-3 py-2 font-semibold">{row.cod}</td>
            <td className="px-3 py-2">{row.denumire}</td>
            <td className="px-3 py-2">{row.cui || '-'}</td>
            <td className="px-3 py-2">{row.cont_analitic_furnizor || '-'}</td>
            <td className="px-3 py-2">{row.cont_analitic_client || '-'}</td>
            <td className="px-3 py-2">{row.email || '-'}</td>
            <td className="px-3 py-2"><Button size="sm" variant="secondary" onClick={() => openEdit(row)}>Editeaza</Button></td>
          </tr>
        ))}
      </Table>
      <Modal open={modal} title={`${editing ? 'Editeaza' : 'Adauga'} ${type === 'client' ? 'client' : 'furnizor'}`} onClose={() => setModal(false)}>
        <form className="grid gap-3" onSubmit={submit}>
          {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          <Input label="Denumire" value={form.denumire} onChange={event => setForm({ ...form, denumire: event.target.value })} required />
          <Input label="CUI" value={form.cui} onChange={event => setForm({ ...form, cui: event.target.value })} />
          <Input label="Email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} />
          <Input label="Telefon" value={form.telefon || ''} onChange={event => setForm({ ...form, telefon: event.target.value })} />
          <Input label="Localitate" value={form.localitate || ''} onChange={event => setForm({ ...form, localitate: event.target.value })} />
          <Input label="Adresa" value={form.adresa || ''} onChange={event => setForm({ ...form, adresa: event.target.value })} />
          <Input label="IBAN" value={form.iban || ''} onChange={event => setForm({ ...form, iban: event.target.value })} />
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setModal(false)}>Renunta</Button><Button type="submit">Salveaza</Button></div>
        </form>
      </Modal>
    </AccountingShell>
  )
}

export default TertiContab

