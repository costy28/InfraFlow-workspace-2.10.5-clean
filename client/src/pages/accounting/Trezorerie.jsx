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
  const [accounts, setAccounts] = useState([])
  const [month, setMonth] = useState(currentMonth())
  const [status, setStatus] = useState('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [validatedJournal, setValidatedJournal] = useState(null)
  const [actionLoading, setActionLoading] = useState('')
  const tertById = useMemo(() => new Map(thirdParties.map(tert => [String(tert.id), tert])), [thirdParties])

  useEffect(() => { load() }, [month, status])

  function load() {
    const [an, luna] = month.split('-')
    Promise.all([
      api.get('/accounting/treasury', { params: { an, luna: Number(luna), status: status || undefined } }),
      api.get('/accounting/third-parties'),
      api.get('/accounting/chart')
    ]).then(([treasuryRes, tertRes, chartRes]) => {
      setRows(treasuryRes.data.treasury || [])
      setThirdParties(tertRes.data.thirdParties || [])
      setAccounts(chartRes.data.accounts || [])
    }).catch(() => {
      setRows([])
      setThirdParties([])
      setAccounts([])
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
    setMessage('')
    setValidatedJournal(null)
    setForm(defaultForm())
    setModal(true)
  }

  function openEdit(row) {
    setEditing(row)
    setError('')
    setMessage('')
    setValidatedJournal(null)
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
    setMessage('')
    setValidatedJournal(null)
    const hint = treasuryValidationHint({ ...form, status: 'draft' })
    if (hint) {
      setError(hint)
      return
    }
    try {
      const payload = { ...form, tert_id: form.tert_id || null }
      if (editing) await api.patch(`/accounting/treasury/${editing.uuid}`, payload)
      else await api.post('/accounting/treasury', payload)
      setModal(false)
      setMessage(editing ? 'Operația de trezorerie a fost salvată.' : 'Operația de trezorerie a fost creată ca draft. Următorul pas: validează operația.')
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Operatia nu a putut fi salvata.')
    }
  }

  function treasuryValidationHint(row) {
    if (row.status !== 'draft') return 'Operația trebuie să fie în status draft pentru validare.'
    if (!row.data) return 'Completează data operației înainte de validare.'
    if (!money(row.suma) || money(row.suma) <= 0) return 'Completează o sumă pozitivă înainte de validare.'
    if (!row.cont_trezorerie) return 'Completează contul de trezorerie, de exemplu 5121 pentru bancă sau 5311 pentru casă.'
    if (accounts.length && !accountExists(row.cont_trezorerie)) return `Contul de trezorerie ${row.cont_trezorerie} nu există în planul de conturi. Alege contul din listă sau adaugă-l în Plan de conturi.`
    if (!row.cont_corespondent) return 'Completează contul corespondent înainte de validare.'
    if (accounts.length && !accountExists(row.cont_corespondent)) return `Contul corespondent ${row.cont_corespondent} nu există în planul de conturi. Alege contul din listă sau adaugă-l în Plan de conturi.`
    return ''
  }

  function accountExists(symbol) {
    return accounts.some(account => account.simbol === String(symbol || '').trim() && account.activ !== false)
  }

  function errorText(err, fallback) {
    return err.response?.data?.error || err.response?.data?.message || fallback
  }

  async function validate(row) {
    const hint = treasuryValidationHint(row)
    if (hint) {
      setError(hint)
      setMessage('')
      return
    }
    setActionLoading(`validate-${row.uuid}`)
    setError('')
    setMessage('')
    setValidatedJournal(null)
    try {
      const res = await api.post(`/accounting/treasury/${row.uuid}/validate`)
      const journal = res.data?.journal
      setValidatedJournal(journal ? {
        id: journal.id,
        uuid: journal.uuid,
        month: row.balance_month || row.data?.slice(0, 7) || month,
        totalDebit: journal.total_debit,
        totalCredit: journal.total_credit
      } : null)
      setMessage('Operația a fost validată și nota contabilă a fost generată.')
      load()
    } catch (err) {
      setError(errorText(err, 'Operația nu a putut fi validată. Verifică perioada, conturile și soldurile.'))
    } finally {
      setActionLoading('')
    }
  }

  async function devalidate(row) {
    setActionLoading(`devalidate-${row.uuid}`)
    setError('')
    setMessage('')
    setValidatedJournal(null)
    try {
      await api.post(`/accounting/treasury/${row.uuid}/devalidate`, { motiv: 'Corectie document trezorerie' })
      setMessage('Operația a fost devalidată și revine în draft.')
      load()
    } catch (err) {
      setError(errorText(err, 'Operația nu a putut fi devalidată. Verifică dacă luna este deschisă și nota contabilă există.'))
    } finally {
      setActionLoading('')
    }
  }

  async function cancelDraft(row) {
    setActionLoading(`cancel-${row.uuid}`)
    setError('')
    setMessage('')
    setValidatedJournal(null)
    try {
      await api.delete(`/accounting/treasury/${row.uuid}`)
      setMessage('Operația draft a fost anulată.')
      load()
    } catch (err) {
      setError(errorText(err, 'Operația nu a putut fi anulată. Doar documentele draft se pot anula direct.'))
    } finally {
      setActionLoading('')
    }
  }

  return (
    <AccountingShell active="trezorerie" title="Trezorerie" subtitle="Registru de casa, jurnal de banca si deconturi cu note contabile generate." actions={<Button onClick={openNew}>+ Operatie</Button>}>
      {error ? <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      {message ? (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
          {validatedJournal ? (
            <span className="ml-2">
              <Link className="font-semibold underline" to={`/contabilitate/registru-jurnal?luna=${validatedJournal.month}`}>Vezi registru jurnal</Link>
              <span> · </span>
              <Link className="font-semibold underline" to={`/contabilitate/balanta?luna=${validatedJournal.month}`}>Verifică balanța</Link>
            </span>
          ) : null}
        </div>
      ) : null}
      <Card>
        <div className="grid gap-3 md:grid-cols-[220px_220px_auto]">
          <Input label="Luna" type="month" value={month} onChange={event => setMonth(event.target.value)} />
          <Select label="Status" value={status} onChange={event => setStatus(event.target.value)} options={[
            { value: '', label: 'Toate fara anulate' },
            { value: 'draft', label: 'Draft' },
            { value: 'validat', label: 'Validate' },
            { value: 'anulat', label: 'Anulate' }
          ]} />
          <div className="flex items-end justify-end"><Button variant="secondary" onClick={load}>Reincarca</Button></div>
        </div>
      </Card>
      <Table headers={['Data', 'Tip', 'Operatie', 'Document', 'Tert', 'Cont', 'Corespondent', 'Suma', 'Status', 'Nota', 'Actiuni']}>
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
              {row.journal_uuid ? (
                <Link className="font-semibold text-primary-700 hover:underline" to={`/contabilitate/registru-jurnal?luna=${row.balance_month || row.data?.slice(0, 7)}`}>NC {row.journal_id}</Link>
              ) : '-'}
            </td>
            <td className="px-3 py-2">
              <div className="flex flex-wrap gap-2">
                {row.status === 'draft' ? <Button size="sm" variant="secondary" onClick={() => openEdit(row)}>Edit</Button> : null}
                {row.status === 'draft' ? <Button size="sm" loading={actionLoading === `validate-${row.uuid}`} onClick={() => validate(row)}>Valideaza</Button> : null}
                {row.status === 'draft' ? <Button size="sm" variant="secondary" loading={actionLoading === `cancel-${row.uuid}`} onClick={() => cancelDraft(row)}>Anuleaza</Button> : null}
                {row.status === 'validat' ? <Button size="sm" variant="secondary" loading={actionLoading === `devalidate-${row.uuid}`} onClick={() => devalidate(row)}>Devalideaza</Button> : null}
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
            <AccountSelect label="Cont trezorerie" value={form.cont_trezorerie || ''} accounts={accounts} recommendedClasses={[5]} onChange={event => updateForm({ cont_trezorerie: event.target.value })} required />
            <AccountSelect label="Cont corespondent" value={form.cont_corespondent || ''} accounts={accounts} recommendedClasses={[4, 5, 6, 7]} onChange={event => updateForm({ cont_corespondent: event.target.value })} required />
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
