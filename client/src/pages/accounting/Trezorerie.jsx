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
export function Trezorerie() {
  const [rows, setRows] = useState([])
  const [thirdParties, setThirdParties] = useState([])
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [error, setError] = useState('')
  const tertById = useMemo(() => new Map(thirdParties.map(tert => [String(tert.id), tert])), [thirdParties])

  useEffect(() => { load() }, [])

  function load() {
    Promise.all([
      api.get('/accounting/treasury'),
      api.get('/accounting/third-parties')
    ]).then(([treasuryRes, tertRes]) => {
      setRows(treasuryRes.data.treasury || [])
      setThirdParties(tertRes.data.thirdParties || [])
    }).catch(() => {
      setRows([])
      setThirdParties([])
    })
  }

  function defaultForm() {
    return {
      tip: 'banca',
      tip_operatie: 'plata',
      data: today(),
      nr_document: '',
      tert_id: '',
      cont_trezorerie: '5121',
      cont_corespondent: '401',
      suma: '',
      explicatie: ''
    }
  }

  function openNew() {
    setEditing(null)
    setError('')
    setForm(defaultForm())
    setModal(true)
  }

  function openEdit(row) {
    setEditing(row)
    setError('')
    setForm({ ...defaultForm(), ...row, tert_id: row.tert_id || '' })
    setModal(true)
  }

  function updateForm(patch) {
    const next = { ...form, ...patch }
    if (patch.tip === 'casa' && (!form.cont_trezorerie || form.cont_trezorerie === '5121')) next.cont_trezorerie = '5311'
    if (patch.tip === 'banca' && (!form.cont_trezorerie || form.cont_trezorerie === '5311')) next.cont_trezorerie = '5121'
    if (patch.tip_operatie === 'incasare' && (!form.cont_corespondent || form.cont_corespondent === '401')) next.cont_corespondent = '4111'
    if (patch.tip_operatie === 'plata' && (!form.cont_corespondent || form.cont_corespondent === '4111')) next.cont_corespondent = '401'
    setForm(next)
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    try {
      const payload = { ...form, tert_id: form.tert_id || null }
      if (editing) await api.patch(`/accounting/treasury/${editing.uuid}`, payload)
      else await api.post('/accounting/treasury', payload)
      setModal(false)
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Operatia nu a putut fi salvata.')
    }
  }

  async function validate(row) {
    await api.post(`/accounting/treasury/${row.uuid}/validate`)
    load()
  }

  async function devalidate(row) {
    await api.post(`/accounting/treasury/${row.uuid}/devalidate`, { motiv: 'Corectie document trezorerie' })
    load()
  }

  async function cancelDraft(row) {
    await api.delete(`/accounting/treasury/${row.uuid}`)
    load()
  }

  return (
    <AccountingShell active="trezorerie" title="Trezorerie" subtitle="Registru de casa, jurnal de banca si deconturi cu note contabile generate." actions={<Button onClick={openNew}>+ Operatie</Button>}>
      <Table headers={['Data', 'Tip', 'Operatie', 'Document', 'Tert', 'Cont', 'Corespondent', 'Suma', 'Status', 'Actiuni']}>
        {rows.map(row => (
          <tr key={row.uuid}>
            <td className="px-3 py-2">{row.data}</td>
            <td className="px-3 py-2 capitalize">{row.tip}</td>
            <td className="px-3 py-2 capitalize">{row.tip_operatie}</td>
            <td className="px-3 py-2">{row.nr_document || '-'}</td>
            <td className="px-3 py-2">{row.tert_id ? tertById.get(String(row.tert_id))?.denumire || row.tert_id : '-'}</td>
            <td className="px-3 py-2">{row.cont_trezorerie}</td>
            <td className="px-3 py-2">{row.cont_corespondent || '-'}</td>
            <td className="px-3 py-2">{formatMoney(row.suma)}</td>
            <td className="px-3 py-2"><Badge tone={statusTone(row.status)}>{row.status}</Badge></td>
            <td className="px-3 py-2">
              <div className="flex flex-wrap gap-2">
                {row.status === 'draft' ? <Button size="sm" variant="secondary" onClick={() => openEdit(row)}>Edit</Button> : null}
                {row.status === 'draft' ? <Button size="sm" onClick={() => validate(row)}>Valideaza</Button> : null}
                {row.status === 'draft' ? <Button size="sm" variant="secondary" onClick={() => cancelDraft(row)}>Anuleaza</Button> : null}
                {row.status === 'validat' ? <Button size="sm" variant="secondary" onClick={() => devalidate(row)}>Devalideaza</Button> : null}
              </div>
            </td>
          </tr>
        ))}
      </Table>
      <Modal open={modal} title={editing ? 'Editare operatie trezorerie' : 'Operatie trezorerie noua'} onClose={() => setModal(false)}>
        <form className="grid gap-3" onSubmit={submit}>
          {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          <div className="grid gap-3 md:grid-cols-2">
            <Select label="Registru" value={form.tip || 'banca'} onChange={event => updateForm({ tip: event.target.value })} options={[
              { value: 'banca', label: 'Jurnal banca' },
              { value: 'casa', label: 'Registru casa' },
              { value: 'decont', label: 'Decont' }
            ]} />
            <Select label="Operatie" value={form.tip_operatie || 'plata'} onChange={event => updateForm({ tip_operatie: event.target.value })} options={[
              { value: 'plata', label: 'Plata' },
              { value: 'incasare', label: 'Incasare' }
            ]} />
            <Input label="Data" type="date" value={form.data || today()} onChange={event => updateForm({ data: event.target.value })} required />
            <Input label="Nr. document" value={form.nr_document || ''} onChange={event => updateForm({ nr_document: event.target.value })} />
            <Select label="Tert optional" value={form.tert_id || ''} onChange={event => updateForm({ tert_id: event.target.value })} options={[{ value: '', label: 'Fara tert' }, ...thirdParties.map(tert => ({ value: tert.id, label: `${tert.cod} - ${tert.denumire}` }))]} />
            <Input label="Suma" type="number" step="0.01" value={form.suma || ''} onChange={event => updateForm({ suma: event.target.value })} required />
            <Input label="Cont trezorerie" value={form.cont_trezorerie || ''} onChange={event => updateForm({ cont_trezorerie: event.target.value })} required />
            <Input label="Cont corespondent" value={form.cont_corespondent || ''} onChange={event => updateForm({ cont_corespondent: event.target.value })} />
          </div>
          <Input label="Explicatie" value={form.explicatie || ''} onChange={event => updateForm({ explicatie: event.target.value })} />
          <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
            Preview nota: {form.tip_operatie === 'incasare'
              ? `${form.cont_trezorerie || '5121'} = ${form.cont_corespondent || '4111'}`
              : `${form.cont_corespondent || '401'} = ${form.cont_trezorerie || '5121'}`} · {formatMoney(form.suma || 0)}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal(false)}>Renunta</Button>
            <Button type="submit">{editing ? 'Salveaza modificari' : 'Salveaza draft'}</Button>
          </div>
        </form>
      </Modal>
    </AccountingShell>
  )
}

export default Trezorerie
