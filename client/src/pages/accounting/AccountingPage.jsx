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

const nav = [
  ['dashboard', '/contabilitate', 'Dashboard'],
  ['plan', '/contabilitate/plan-conturi', 'Plan de conturi'],
  ['furnizori', '/contabilitate/furnizori', 'Furnizori'],
  ['clienti', '/contabilitate/clienti', 'Clienti'],
  ['intrare', '/contabilitate/facturi-intrare', 'Facturi intrare'],
  ['iesire', '/contabilitate/facturi-iesire', 'Facturi iesire'],
  ['trezorerie', '/contabilitate/trezorerie', 'Trezorerie'],
  ['jurnal', '/contabilitate/registru-jurnal', 'Registru jurnal'],
  ['balanta', '/contabilitate/balanta', 'Balanta'],
  ['inchidere', '/contabilitate/inchidere-luna', 'Inchidere luna'],
  ['alerte', '/contabilitate/alerte', 'Alerte'],
]

function today() {
  return new Date().toISOString().slice(0, 10)
}

function currentMonth() {
  return today().slice(0, 7)
}

function money(value) {
  return Number(value || 0)
}

function statusTone(status) {
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

function Info({ label, value }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 break-words font-semibold text-slate-900">{value}</div>
    </div>
  )
}

function AccountInput({ label, value, onChange, accounts, id, recommendedClasses = [] }) {
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

function AccountingShell({ active, title, subtitle, children, actions }) {
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

export function ContabilitateDashboard() {
  const [summary, setSummary] = useState(null)
  const [month, setMonth] = useState(currentMonth())
  const [error, setError] = useState('')
  useEffect(() => {
    api.get('/accounting/summary', { params: { luna: month } })
      .then(res => setSummary(res.data))
      .catch(err => setError(err.response?.data?.error || 'Nu am putut incarca dashboard-ul contabil.'))
  }, [month])
  return (
    <AccountingShell active="dashboard" title="Contabilitate" subtitle="Registru, facturi, TVA, balanta si inchidere perioada.">
      {error ? <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      <Card>
        <Input label="Luna" type="month" value={month} onChange={event => setMonth(event.target.value)} />
      </Card>
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          ['Perioada', summary?.period?.status || 'deschisa'],
          ['Facturi intrare', `${summary?.invoicesIn?.count || 0} / ${formatMoney(summary?.invoicesIn?.total || 0)}`],
          ['Facturi iesire', `${summary?.invoicesOut?.count || 0} / ${formatMoney(summary?.invoicesOut?.total || 0)}`],
          ['TVA diferenta', formatMoney(summary?.vat?.diferenta || 0)],
          ['Furnizori depasiti', summary?.overdueSuppliers || 0],
          ['Clienti restanti', summary?.overdueClients || 0],
        ].map(([label, value]) => (
          <Card key={label}>
            <div className="text-xs text-slate-500">{label}</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">{value}</div>
          </Card>
        ))}
      </div>
      {summary?.alertsNew ? <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Exista {summary.alertsNew} alerte legislative noi.</div> : null}
    </AccountingShell>
  )
}

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

export function FacturiContab({ direction = 'in' }) {
  const isIn = direction === 'in'
  const [rows, setRows] = useState([])
  const [thirdParties, setThirdParties] = useState([])
  const [accounts, setAccounts] = useState([])
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [journalModal, setJournalModal] = useState(false)
  const [journalData, setJournalData] = useState(null)
  const [devalidateModal, setDevalidateModal] = useState(false)
  const [devalidateRow, setDevalidateRow] = useState(null)
  const [devalidateReason, setDevalidateReason] = useState('')
  const [error, setError] = useState('')
  const emptyLine = () => ({ denumire: '', cont: isIn ? '628' : '704', valoare: '', tva_procent: 21 })
  const [form, setForm] = useState({ data: today(), valoare: '', tva_procent: 21, cont_cheltuiala: '628', cont_venit: '704', lines: [emptyLine()] })
  const endpoint = isIn ? '/accounting/invoices-in' : '/accounting/invoices-out'
  async function load() {
    const [a, t, c] = await Promise.all([
      api.get(endpoint),
      api.get('/accounting/third-parties', { params: { tip: isIn ? 'furnizor' : 'client' } }),
      api.get('/accounting/chart')
    ])
    setRows(a.data.invoices || [])
    setThirdParties(t.data.thirdParties || [])
    setAccounts(c.data.accounts || [])
  }
  useEffect(() => { load().catch(() => {}) }, [direction])
  const invoiceLines = Array.isArray(form.lines) ? form.lines : []
  const valoareLines = invoiceLines.reduce((sum, line) => sum + money(line.valoare), 0)
  const tvaLines = invoiceLines.reduce((sum, line) => sum + money(line.valoare) * money(line.tva_procent) / 100, 0)
  const baseValue = invoiceLines.length ? valoareLines : money(form.valoare)
  const total = invoiceLines.length ? baseValue + tvaLines : money(form.valoare) + money(form.valoare) * money(form.tva_procent) / 100
  function openNew() {
    setEditing(null)
    setError('')
    setForm({ data: today(), valoare: '', tva_procent: 21, cont_cheltuiala: '628', cont_venit: '704', lines: [emptyLine()] })
    setModal(true)
  }
  function openEdit(row) {
    setEditing(row)
    setError('')
    setForm({
      tert_id: row.furnizor_id || row.client_id || '',
      nr_document: row.nr_document || row.numar || '',
      numar: row.numar || row.nr_document || '',
      data: row.data || today(),
      data_scadenta: row.data_scadenta || '',
      valoare: row.valoare || '',
      tva_procent: row.tva_procent ?? 21,
      cont_cheltuiala: row.cont_cheltuiala || '628',
      cont_venit: row.cont_venit || '704',
      lines: Array.isArray(row.lines) && row.lines.length ? row.lines.map(line => ({
        denumire: line.denumire || '',
        cont: line.cont || (isIn ? row.cont_cheltuiala || '628' : row.cont_venit || '704'),
        valoare: line.valoare || '',
        tva_procent: line.tva_procent ?? row.tva_procent ?? 21
      })) : [{ denumire: row.explicatie || '', cont: isIn ? row.cont_cheltuiala || '628' : row.cont_venit || '704', valoare: row.valoare || '', tva_procent: row.tva_procent ?? 21 }],
      explicatie: row.explicatie || ''
    })
    setModal(true)
  }
  function updateLine(index, patch) {
    const lines = [...invoiceLines]
    lines[index] = { ...lines[index], ...patch }
    setForm({ ...form, lines })
  }
  function addLine() {
    setForm({ ...form, lines: [...invoiceLines, emptyLine()] })
  }
  function removeLine(index) {
    const lines = invoiceLines.filter((_, lineIndex) => lineIndex !== index)
    setForm({ ...form, lines: lines.length ? lines : [emptyLine()] })
  }
  async function submit(event) {
    event.preventDefault()
    try {
      setError('')
      const partyId = form.tert_id || thirdParties[0]?.id
      const payload = {
        ...form,
        furnizor_id: isIn ? partyId : undefined,
        client_id: isIn ? undefined : partyId,
        nr_document: form.nr_document || form.numar || 'DOC-1',
        numar: form.numar || undefined,
        valoare: money(baseValue),
        tva_procent: money(form.tva_procent),
        lines: invoiceLines
          .map((line, index) => ({
            nr_crt: index + 1,
            denumire: line.denumire || '',
            cont: line.cont || (isIn ? form.cont_cheltuiala || '628' : form.cont_venit || '704'),
            valoare: money(line.valoare),
            tva_procent: money(line.tva_procent)
          }))
          .filter(line => line.valoare > 0)
          .map(line => ({ ...line, denumire: line.denumire || `Linia ${line.nr_crt}` }))
      }
      if (editing?.uuid) await api.patch(`${endpoint}/${editing.uuid}`, payload)
      else await api.post(endpoint, payload)
      setModal(false)
      setEditing(null)
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Factura nu a putut fi salvata.')
    }
  }
  async function validate(row) {
    try {
      setError('')
      await api.post(`${endpoint}/${row.uuid}/validate`)
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Factura nu a putut fi validata.')
    }
  }
  async function storno(row) {
    if (!window.confirm('Stornezi documentul selectat?')) return
    try {
      setError('')
      await api.post(`${endpoint}/${row.uuid}/storno`)
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Factura nu a putut fi stornata.')
    }
  }
  async function devalidate(row) {
    setDevalidateRow(row)
    setDevalidateReason('')
    setDevalidateModal(true)
  }
  async function submitDevalidate(event) {
    event.preventDefault()
    if (!devalidateRow) return
    try {
      setError('')
      await api.post(`${endpoint}/${devalidateRow.uuid}/devalidate`, { motiv: devalidateReason })
      setDevalidateModal(false)
      setDevalidateRow(null)
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Factura nu a putut fi devalidata.')
    }
  }
  async function showJournal(row) {
    if (!row.journal_id) {
      setError('Factura nu are nota contabila atasata.')
      return
    }
    try {
      setError('')
      const res = await api.get(`/accounting/journals/${row.journal_id}`)
      setJournalData(res.data.journal)
      setJournalModal(true)
    } catch (err) {
      setError(err.response?.data?.error || 'Nota contabila nu a putut fi incarcata.')
    }
  }
  async function cancelDraft(row) {
    if (!window.confirm('Anulezi documentul draft selectat?')) return
    try {
      setError('')
      await api.delete(`${endpoint}/${row.uuid}`, { data: { motiv: 'Anulare document draft' } })
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Factura nu a putut fi anulata.')
    }
  }
  return (
    <AccountingShell active={isIn ? 'intrare' : 'iesire'} title={isIn ? 'Facturi intrare' : 'Facturi iesire'} subtitle="Validarea genereaza automat nota contabila echilibrata." actions={<Button onClick={openNew}>+ Factura</Button>}>
      {error ? <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Table headers={['Data', 'Document', 'Tert', 'Valoare', 'TVA', 'Total', 'Status', 'Actiuni']}>
        {rows.map(row => (
          <tr key={row.uuid}>
            <td className="px-3 py-2">{row.data}</td>
            <td className="px-3 py-2">{row.nr_document || `${row.serie || ''} ${row.numar || ''}`}</td>
            <td className="px-3 py-2">{thirdParties.find(t => String(t.id) === String(row.furnizor_id || row.client_id))?.denumire || row.furnizor_id || row.client_id}</td>
            <td className="px-3 py-2">{formatMoney(row.valoare)}</td>
            <td className="px-3 py-2">{formatMoney(row.tva)}</td>
            <td className="px-3 py-2 font-semibold">{formatMoney(row.total)}</td>
            <td className="px-3 py-2"><Badge tone={statusTone(row.status)}>{row.status}</Badge></td>
            <td className="px-3 py-2">
              <div className="flex flex-wrap gap-2">
                {row.status === 'draft' ? <Button size="sm" variant="secondary" onClick={() => openEdit(row)}>Edit</Button> : null}
                {row.status === 'draft' ? <Button size="sm" onClick={() => validate(row)}>Valideaza</Button> : null}
                {row.status === 'draft' ? <Button size="sm" variant="secondary" onClick={() => cancelDraft(row)}>Anuleaza</Button> : null}
                {row.journal_id ? <Button size="sm" variant="secondary" onClick={() => showJournal(row)}>Nota</Button> : null}
                {row.status === 'validat' ? <Button size="sm" variant="secondary" onClick={() => devalidate(row)}>Devalideaza</Button> : null}
                {row.status !== 'draft' && row.status !== 'stornat' && row.status !== 'anulat' ? <Button size="sm" variant="secondary" onClick={() => storno(row)}>Storno</Button> : null}
              </div>
            </td>
          </tr>
        ))}
      </Table>
      <Modal open={modal} title={editing ? 'Editare factura draft' : 'Factura noua'} onClose={() => setModal(false)}>
        <form className="grid gap-3" onSubmit={submit}>
          {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          <Select label={isIn ? 'Furnizor' : 'Client'} value={form.tert_id || ''} onChange={event => setForm({ ...form, tert_id: event.target.value })} options={thirdParties.map(t => ({ value: t.id, label: `${t.cod} - ${t.denumire}` }))} required />
          <Input label="Document" value={form.nr_document || form.numar || ''} onChange={event => setForm({ ...form, nr_document: event.target.value, numar: event.target.value })} required />
          <Input label="Data" type="date" value={form.data} onChange={event => setForm({ ...form, data: event.target.value })} required />
          <Input label="Scadenta" type="date" value={form.data_scadenta || ''} onChange={event => setForm({ ...form, data_scadenta: event.target.value })} />
          <AccountInput id="factura-cont-principal" label={isIn ? 'Cont cheltuiala' : 'Cont venit'} value={isIn ? form.cont_cheltuiala : form.cont_venit} accounts={accounts} recommendedClasses={isIn ? [6, 3, 2] : [7]} onChange={event => setForm({ ...form, [isIn ? 'cont_cheltuiala' : 'cont_venit']: event.target.value })} />
          <div className="rounded-md border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-sm font-semibold text-slate-800">Linii factura</div>
              <Button type="button" size="sm" variant="secondary" onClick={addLine}>+ Linie</Button>
            </div>
            <div className="grid gap-2 p-3">
              {invoiceLines.map((line, index) => (
                <div key={index} className="grid gap-2 rounded-md border border-slate-200 bg-white p-3">
                  <Input label={`Denumire linia ${index + 1}`} value={line.denumire || ''} onChange={event => updateLine(index, { denumire: event.target.value })} />
                  <div className="grid gap-2 sm:grid-cols-[minmax(92px,1fr)_minmax(120px,1.2fr)_minmax(96px,1fr)_44px]">
                    <AccountInput id={`factura-linie-cont-${index}`} label="Cont" value={line.cont || ''} accounts={accounts} recommendedClasses={isIn ? [6, 3, 2] : [7]} onChange={event => updateLine(index, { cont: event.target.value })} />
                    <Input label="Valoare" type="number" step="0.01" value={line.valoare || ''} onChange={event => updateLine(index, { valoare: event.target.value })} />
                    <Select label="TVA" value={line.tva_procent ?? 21} onChange={event => updateLine(index, { tva_procent: event.target.value })} options={[0,5,9,19,21].map(v => ({ value: v, label: `${v}%` }))} />
                    <div className="flex items-end"><Button type="button" size="sm" variant="secondary" onClick={() => removeLine(index)}>x</Button></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <Input label="Explicatie" value={form.explicatie || ''} onChange={event => setForm({ ...form, explicatie: event.target.value })} />
          <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">Preview nota: {isIn ? `linii debit + 4426 = 401.x` : `4111.x = linii venit + 4427`} · Baza {formatMoney(baseValue)} · TVA {formatMoney(tvaLines)} · Total {formatMoney(total)}</div>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setModal(false)}>Renunta</Button><Button type="submit">{editing ? 'Salveaza modificari' : 'Salveaza draft'}</Button></div>
        </form>
      </Modal>
      <Modal open={journalModal} title="Nota contabila generata" onClose={() => setJournalModal(false)}>
        <div className="grid gap-3">
          {journalData ? (
            <>
              <div className="grid gap-2 md:grid-cols-4">
                <Info label="Document" value={journalData.nr_document || journalData.id} />
                <Info label="Data" value={journalData.data || '-'} />
                <Info label="Debit" value={formatMoney(journalData.total_debit || 0)} />
                <Info label="Credit" value={formatMoney(journalData.total_credit || 0)} />
              </div>
              <Table headers={['Cont', 'Denumire', 'Debit', 'Credit', 'Explicatie']}>
                {(journalData.lines || []).map(line => (
                  <tr key={line.id || `${line.cont_simbol}-${line.linie_nr}`}>
                    <td className="px-3 py-2 font-semibold">{line.cont_simbol}</td>
                    <td className="px-3 py-2">{line.denumire_cont || '-'}</td>
                    <td className="px-3 py-2 text-right">{line.debit ? formatMoney(line.debit) : '-'}</td>
                    <td className="px-3 py-2 text-right">{line.credit ? formatMoney(line.credit) : '-'}</td>
                    <td className="px-3 py-2">{line.explicatie || '-'}</td>
                  </tr>
                ))}
              </Table>
            </>
          ) : null}
          <div className="flex justify-end"><Button variant="secondary" onClick={() => setJournalModal(false)}>Inchide</Button></div>
        </div>
      </Modal>
      <Modal open={devalidateModal} title="Devalidare factura" onClose={() => setDevalidateModal(false)}>
        <form className="grid gap-3" onSubmit={submitDevalidate}>
          <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Factura revine in draft, iar nota contabila generata este marcata devalidata. Operatia este permisa doar daca luna nu este inchisa.
          </div>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Motiv devalidare
            <textarea
              className="min-h-24 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              value={devalidateReason}
              onChange={event => setDevalidateReason(event.target.value)}
              required
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setDevalidateModal(false)}>Renunta</Button>
            <Button type="submit" disabled={!devalidateReason.trim()}>Devalideaza</Button>
          </div>
        </form>
      </Modal>
    </AccountingShell>
  )
}

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

export function RegistruJurnal() {
  const [rows, setRows] = useState([])
  const [month, setMonth] = useState(currentMonth())
  const [status, setStatus] = useState('')
  const [selectedUuid, setSelectedUuid] = useState('')
  const [error, setError] = useState('')
  const [importModal, setImportModal] = useState(false)
  const [importFile, setImportFile] = useState(null)
  const [importPreview, setImportPreview] = useState(null)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef(null)
  const selected = rows.find(row => row.uuid === selectedUuid) || rows[0] || null
  const difference = selected ? Math.abs(money(selected.total_debit) - money(selected.total_credit)) : 0

  useEffect(() => { load() }, [month, status])
  useEffect(() => {
    if (rows.length && !rows.some(row => row.uuid === selectedUuid)) setSelectedUuid(rows[0].uuid)
    if (!rows.length) setSelectedUuid('')
  }, [rows, selectedUuid])

  function load() {
    const [an, luna] = month.split('-')
    api.get('/accounting/journals', { params: { an, luna: Number(luna), status: status || undefined } })
      .then(res => setRows(res.data.journals || []))
      .catch(err => {
        setRows([])
        setError(err.response?.data?.error || 'Nu am putut incarca registrul jurnal.')
      })
  }

  async function storno(row) {
    if (!window.confirm('Creezi nota storno pentru nota selectata?')) return
    try {
      setError('')
      await api.post(`/accounting/journals/${row.uuid}/storno`)
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Nota storno nu a putut fi creata.')
    }
  }

  function importFormData(file) {
    const data = new FormData()
    data.append('file', file)
    return data
  }

  async function chooseImportFile(file) {
    setError('')
    setImportPreview(null)
    setImportFile(file || null)
    if (!file) return
    if (!file.name.toLowerCase().match(/\.xlsx?$/)) {
      setError('Selecteaza un fisier .xls sau .xlsx.')
      return
    }
    try {
      const res = await api.post('/accounting/journals/import-xls/preview', importFormData(file), {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setImportPreview(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut citi fisierul XLS.')
    }
  }

  async function importJournals() {
    if (!importFile || !importPreview) return
    setImporting(true)
    setError('')
    try {
      const res = await api.post('/accounting/journals/import-xls', importFormData(importFile), {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setImportModal(false)
      setImportFile(null)
      setImportPreview(null)
      await load()
      setError('')
    } catch (err) {
      setError(err.response?.data?.error || 'Importul nu a putut fi finalizat.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <AccountingShell active="jurnal" title="Registru jurnal" subtitle="Note contabile active si storno, cu linii debit/credit." actions={<Button variant="secondary" onClick={() => setImportModal(true)}>Import note XLS</Button>}>
      {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Card>
        <div className="grid gap-3 md:grid-cols-[220px_220px_auto]">
          <Input label="Luna" type="month" value={month} onChange={event => setMonth(event.target.value)} />
          <Select label="Status" value={status} onChange={event => setStatus(event.target.value)} options={[
            { value: '', label: 'Toate fara anulate' },
            { value: 'activ', label: 'Active' },
            { value: 'stornat', label: 'Stornate' },
            { value: 'devalidat', label: 'Devalidate' }
          ]} />
          <div className="flex items-end justify-end"><Button variant="secondary" onClick={load}>Reincarca</Button></div>
        </div>
      </Card>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Table headers={['Data', 'Document', 'Tip', 'Explicatie', 'Debit', 'Credit', 'Status']}>
          {rows.map(row => (
            <tr key={row.uuid} className={`cursor-pointer hover:bg-primary-50 ${selected?.uuid === row.uuid ? 'bg-primary-50' : ''}`} onClick={() => setSelectedUuid(row.uuid)}>
              <td className="px-3 py-2">{row.data}</td>
              <td className="px-3 py-2">{row.nr_document || '-'}</td>
              <td className="px-3 py-2">{row.tip_document}</td>
              <td className="px-3 py-2">{row.explicatie}</td>
              <td className="px-3 py-2">{formatMoney(row.total_debit)}</td>
              <td className="px-3 py-2">{formatMoney(row.total_credit)}</td>
              <td className="px-3 py-2"><Badge tone={statusTone(row.status)}>{row.status}</Badge></td>
            </tr>
          ))}
        </Table>
        <Card>
          {selected ? (
            <div className="grid gap-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase text-slate-500">Nota contabila</div>
                  <div className="mt-1 text-xl font-semibold text-slate-950">{selected.nr_document || `NC ${selected.id}`}</div>
                  <div className="text-sm text-slate-500">{selected.data} · {selected.tip_document}</div>
                </div>
                <Badge tone={statusTone(selected.status)}>{selected.status}</Badge>
              </div>
              <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">{selected.explicatie || 'Fara explicatie.'}</div>
              <div className="grid grid-cols-3 gap-2">
                <Info label="Debit" value={formatMoney(selected.total_debit)} />
                <Info label="Credit" value={formatMoney(selected.total_credit)} />
                <Info label="Diferenta" value={formatMoney(difference)} />
              </div>
              <div className="overflow-hidden rounded-md border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Cont</th>
                      <th className="px-3 py-2">Explicatie</th>
                      <th className="px-3 py-2 text-right">Debit</th>
                      <th className="px-3 py-2 text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(selected.lines || []).map(line => (
                      <tr key={line.id}>
                        <td className="px-3 py-2">
                          <Link className="font-mono font-semibold text-primary-700 hover:underline" to={`/contabilitate/fisa-cont/${line.cont_simbol}`}>{line.cont_simbol}</Link>
                          <div className="text-xs text-slate-500">{line.denumire_cont}</div>
                        </td>
                        <td className="px-3 py-2">{line.explicatie || '-'}</td>
                        <td className="px-3 py-2 text-right">{line.debit ? formatMoney(line.debit) : '-'}</td>
                        <td className="px-3 py-2 text-right">{line.credit ? formatMoney(line.credit) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selected.status === 'activ' ? <div className="flex justify-end"><Button variant="secondary" onClick={() => storno(selected)}>Storno nota</Button></div> : null}
            </div>
          ) : (
            <div className="py-10 text-center text-sm text-slate-500">Nu exista note contabile pentru filtrele selectate.</div>
          )}
        </Card>
      </div>
      <Modal open={importModal} title="Import note contabile XLS" onClose={() => setImportModal(false)}>
        <div className="grid gap-4">
          <input
            ref={importInputRef}
            type="file"
            accept=".xls,.xlsx"
            className="hidden"
            onChange={event => chooseImportFile(event.target.files?.[0])}
          />
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-900">{importFile?.name || 'Niciun fisier selectat'}</div>
            <div className="mt-1 text-sm text-slate-500">Fisierul trebuie sa contina coloane de tip: data, document, cont debit, cont credit, suma, explicatie.</div>
            <div className="mt-3"><Button type="button" variant="secondary" onClick={() => importInputRef.current?.click()}>Alege fisier</Button></div>
          </div>
          {importPreview ? (
            <div className="grid gap-3">
              <div className="grid gap-2 md:grid-cols-4">
                <Info label="Note" value={importPreview.total_notes || 0} />
                <Info label="Linii" value={importPreview.total_lines || 0} />
                <Info label="Debit" value={formatMoney(importPreview.total_debit || 0)} />
                <Info label="Credit" value={formatMoney(importPreview.total_credit || 0)} />
              </div>
              <div className={`rounded-md px-3 py-2 text-sm ${importPreview.balanced && !importPreview.errors?.length ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                {importPreview.balanced ? 'Fisier echilibrat debit-credit.' : 'Fisierul nu este echilibrat.'}
                {importPreview.duplicate_notes ? ` ${importPreview.duplicate_notes} note par deja importate si vor fi sarite.` : ''}
              </div>
              {importPreview.missing_accounts?.length ? <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Conturi lipsa in plan: {importPreview.missing_accounts.slice(0, 8).join(', ')}{importPreview.missing_accounts.length > 8 ? '...' : ''}</div> : null}
              {importPreview.errors?.length ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{importPreview.errors.slice(0, 3).join(' ')}</div> : null}
              <Table headers={['Data', 'Document', 'Tip', 'Explicatie', 'Debit', 'Credit', 'Status']}>
                {(importPreview.notes || []).slice(0, 8).map(note => (
                  <tr key={note.import_key}>
                    <td className="px-3 py-2">{note.data}</td>
                    <td className="px-3 py-2">{note.nr_document || '-'}</td>
                    <td className="px-3 py-2">{note.tip_document}</td>
                    <td className="px-3 py-2">{note.explicatie}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(note.total_debit)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(note.total_credit)}</td>
                    <td className="px-3 py-2"><Badge tone={note.duplicate ? 'warning' : note.balanced ? 'success' : 'danger'}>{note.duplicate ? 'duplicat' : note.balanced ? 'ok' : 'eroare'}</Badge></td>
                  </tr>
                ))}
              </Table>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setImportModal(false)}>Renunta</Button>
            <Button type="button" disabled={!importPreview || importPreview.errors?.length || importPreview.unbalanced_notes || importPreview.missing_accounts?.length || importing} onClick={importJournals}>{importing ? 'Import...' : 'Importa note'}</Button>
          </div>
        </div>
      </Modal>
    </AccountingShell>
  )
}

export function Balanta() {
  const [month, setMonth] = useState(currentMonth())
  const [tip, setTip] = useState('sintetica')
  const [clasa, setClasa] = useState('')
  const [onlyWithValues, setOnlyWithValues] = useState(true)
  const [data, setData] = useState({ rows: [], totals: {}, balanced: true })
  const rows = useMemo(() => data.rows.filter(row =>
    (!clasa || String(row.cont || '').startsWith(clasa)) &&
    (!onlyWithValues || ['rulaje_D', 'rulaje_C', 'sold_D', 'sold_C'].some(key => Math.abs(money(row[key])) > 0.009))
  ), [data.rows, clasa, onlyWithValues])
  const filteredTotals = useMemo(() => rows.reduce((acc, row) => {
    ['rulaje_D', 'rulaje_C', 'sume_totale_D', 'sume_totale_C', 'sold_D', 'sold_C'].forEach(key => { acc[key] = money((acc[key] || 0) + row[key]) })
    return acc
  }, {}), [rows])

  useEffect(() => {
    const [an, luna] = month.split('-')
    api.get('/accounting/balance-sheet', { params: { an, luna, tip } })
      .then(res => setData(res.data))
      .catch(() => setData({ rows: [], totals: {}, balanced: false }))
  }, [month, tip])

  async function exportExcel() {
    const [an, luna] = month.split('-')
    const res = await api.get('/accounting/balance-sheet/export', { params: { an, luna, tip }, responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const link = document.createElement('a')
    link.href = url
    link.download = `Balanta_${tip}_${an}_${luna}.xlsx`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <AccountingShell active="balanta" title="Balanta" subtitle="Verificare rulaje, solduri si egalitate debit-credit." actions={<Button variant="secondary" onClick={exportExcel}>Export Excel</Button>}>
      <Card>
        <div className="grid gap-3 md:grid-cols-[180px_180px_180px_1fr]">
          <Input label="Luna" type="month" value={month} onChange={event => setMonth(event.target.value)} />
          <Select label="Tip balanta" value={tip} onChange={event => setTip(event.target.value)} options={[{ value: 'sintetica', label: 'Sintetica' }, { value: 'analitica', label: 'Analitica' }]} />
          <Select label="Clasa cont" value={clasa} onChange={event => setClasa(event.target.value)} options={[{ value: '', label: 'Toate clasele' }, ...[1,2,3,4,5,6,7,8,9].map(value => ({ value: String(value), label: `Clasa ${value}` }))]} />
          <label className="flex items-end gap-2 pb-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={onlyWithValues} onChange={event => setOnlyWithValues(event.target.checked)} />
            Doar conturi cu rulaj sau sold
          </label>
        </div>
      </Card>
      <div className={`rounded-md px-3 py-2 text-sm ${data.balanced ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
        {data.balanced ? 'Balanta este echilibrata.' : `Balanta nu este echilibrata: diferenta ${formatMoney(Math.abs(money(data.totals.rulaje_D) - money(data.totals.rulaje_C)))}`}
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <Info label="Rulaj debit" value={formatMoney(filteredTotals.rulaje_D || 0)} />
        <Info label="Rulaj credit" value={formatMoney(filteredTotals.rulaje_C || 0)} />
        <Info label="Sold debit" value={formatMoney(filteredTotals.sold_D || 0)} />
        <Info label="Sold credit" value={formatMoney(filteredTotals.sold_C || 0)} />
      </div>
      <Table headers={['Cont', 'Denumire', 'Rulaj D', 'Rulaj C', 'Sume D', 'Sume C', 'Sold D', 'Sold C']}>
        {rows.map(row => (
          <tr key={row.cont} className="hover:bg-slate-50">
            <td className="px-3 py-2">
              <Link className="font-mono font-semibold text-primary-700 hover:underline" to={`/contabilitate/fisa-cont/${row.cont}`}>{row.cont}</Link>
            </td>
            <td className="px-3 py-2">{row.denumire}</td>
            <td className="px-3 py-2 text-right">{formatMoney(row.rulaje_D)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(row.rulaje_C)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(row.sume_totale_D)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(row.sume_totale_C)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(row.sold_D)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(row.sold_C)}</td>
          </tr>
        ))}
        {rows.length ? (
          <tr className="bg-slate-50 font-semibold">
            <td className="px-3 py-2">TOTAL</td>
            <td className="px-3 py-2">{rows.length} conturi</td>
            <td className="px-3 py-2 text-right">{formatMoney(filteredTotals.rulaje_D || 0)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(filteredTotals.rulaje_C || 0)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(filteredTotals.sume_totale_D || 0)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(filteredTotals.sume_totale_C || 0)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(filteredTotals.sold_D || 0)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(filteredTotals.sold_C || 0)}</td>
          </tr>
        ) : null}
      </Table>
    </AccountingShell>
  )
}

export function FisaCont() {
  const { simbol } = useParams()
  const [from, setFrom] = useState(`${currentMonth()}-01`)
  const [to, setTo] = useState(today())
  const [data, setData] = useState({ movements: [], sold_initial: 0, total_debit: 0, total_credit: 0, sold_final: 0 })
  const [error, setError] = useState('')
  useEffect(() => { load() }, [simbol, from, to])

  function load() {
    api.get(`/accounting/ledger/${simbol}`, { params: { de_la: from, pana_la: to } })
      .then(res => { setData(res.data); setError('') })
      .catch(err => {
        setData({ movements: [], sold_initial: 0, total_debit: 0, total_credit: 0, sold_final: 0 })
        setError(err.response?.data?.error || 'Nu am putut incarca fisa contului.')
      })
  }

  async function exportExcel() {
    const res = await api.get(`/accounting/ledger/${simbol}/export`, { params: { de_la: from, pana_la: to }, responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const link = document.createElement('a')
    link.href = url
    link.download = `Fisa_cont_${simbol}.xlsx`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <AccountingShell active="plan" title={`Fisa cont ${simbol}`} subtitle={data.denumire || 'Carte mare pe cont, cu sold progresiv.'} actions={<Button variant="secondary" onClick={exportExcel}>Export Excel</Button>}>
      {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Card>
        <div className="grid gap-3 md:grid-cols-[180px_180px_auto]">
          <Input label="De la" type="date" value={from} onChange={event => setFrom(event.target.value)} />
          <Input label="Pana la" type="date" value={to} onChange={event => setTo(event.target.value)} />
          <div className="flex items-end justify-end"><Button variant="secondary" onClick={load}>Reincarca</Button></div>
        </div>
      </Card>
      <div className="grid gap-3 md:grid-cols-4">
        <Info label="Sold initial" value={formatMoney(data.sold_initial || 0)} />
        <Info label="Rulaj debit" value={formatMoney(data.total_debit || 0)} />
        <Info label="Rulaj credit" value={formatMoney(data.total_credit || 0)} />
        <Info label="Sold final" value={formatMoney(data.sold_final || 0)} />
      </div>
      <Table headers={['Data', 'Document', 'Tip', 'Explicatie', 'Debit', 'Credit', 'Sold']}>
        {data.movements.map(row => (
          <tr key={row.id} className="hover:bg-slate-50">
            <td className="px-3 py-2">{row.data}</td>
            <td className="px-3 py-2">{row.nr_document || '-'}</td>
            <td className="px-3 py-2">{row.tip_document}</td>
            <td className="px-3 py-2">{row.explicatie}</td>
            <td className="px-3 py-2 text-right">{row.debit ? formatMoney(row.debit) : '-'}</td>
            <td className="px-3 py-2 text-right">{row.credit ? formatMoney(row.credit) : '-'}</td>
            <td className="px-3 py-2 text-right font-semibold">{formatMoney(row.sold)}</td>
          </tr>
        ))}
        {data.movements.length ? (
          <tr className="bg-slate-50 font-semibold">
            <td className="px-3 py-2">TOTAL</td>
            <td className="px-3 py-2" colSpan={3}>{data.movements.length} miscari</td>
            <td className="px-3 py-2 text-right">{formatMoney(data.total_debit || 0)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(data.total_credit || 0)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(data.sold_final || 0)}</td>
          </tr>
        ) : null}
      </Table>
    </AccountingShell>
  )
}

export function InchidereLuna() {
  const [month, setMonth] = useState(currentMonth())
  const [data, setData] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { load() }, [month])

  function load() {
    const [an, luna] = month.split('-')
    setError('')
    api.get(`/accounting/periods/${an}/${Number(luna)}/check`)
      .then(res => setData(res.data))
      .catch(err => {
        setData(null)
        setError(err.response?.data?.error || 'Nu am putut verifica luna selectata.')
      })
  }

  async function closeMonth() {
    const [an, luna] = month.split('-')
    try {
      setError('')
      await api.post(`/accounting/periods/${an}/${Number(luna)}/close`)
      setMessage('Luna a fost inchisa.')
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Luna nu a putut fi inchisa.')
    }
  }

  async function reopenMonth() {
    const [an, luna] = month.split('-')
    try {
      setError('')
      await api.post(`/accounting/periods/${an}/${Number(luna)}/reopen`)
      setMessage('Luna a fost redeschisa.')
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Luna nu a putut fi redeschisa.')
    }
  }

  async function markSubmitted() {
    const [an, luna] = month.split('-')
    try {
      setError('')
      await api.post(`/accounting/periods/${an}/${Number(luna)}/mark-submitted`, { depunere_ref: 'Declaratii depuse' })
      setMessage('Declaratiile au fost marcate ca depuse.')
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Declaratiile nu au putut fi marcate ca depuse.')
    }
  }

  const checks = data?.checks || {}
  const status = data?.period?.status || 'deschisa'
  const blockers = [
    checks.draft_count ? `${checks.draft_count} documente draft` : '',
    checks.unbalanced_journals ? `${checks.unbalanced_journals} note dezechilibrate` : '',
    checks.balance_ok === false ? 'balanta dezechilibrata' : ''
  ].filter(Boolean)

  return (
    <AccountingShell active="inchidere" title="Inchidere luna" subtitle="Verificari contabile, blocare luna si marcarea declaratiilor depuse.">
      <Card>
        <div className="grid gap-3 md:grid-cols-[240px_auto_auto_auto]">
          <Input label="Luna" type="month" value={month} onChange={event => setMonth(event.target.value)} />
          <div className="flex items-end"><Button variant="secondary" onClick={load}>Verifica luna</Button></div>
          <div className="flex items-end"><Button disabled={!checks.can_close} onClick={closeMonth}>Inchide luna</Button></div>
          <div className="flex items-end gap-2">
            <Button variant="secondary" disabled={!checks.can_reopen} onClick={reopenMonth}>Redeschide</Button>
            <Button variant="secondary" disabled={!checks.can_mark_submitted} onClick={markSubmitted}>Declaratii depuse</Button>
          </div>
        </div>
      </Card>
      {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
      {data ? (
        <>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase text-slate-500">Status luna</div>
                <div className="mt-1 flex items-center gap-2">
                  <Badge tone={statusTone(status)}>{status}</Badge>
                  <span className="text-sm text-slate-600">{checks.can_close ? 'Luna poate fi inchisa.' : blockers.length ? `Blocaje: ${blockers.join(', ')}.` : 'Luna nu este in starea necesara pentru inchidere.'}</span>
                </div>
              </div>
              <div className="text-sm text-slate-500">
                Note: {data.counts?.journals || 0} · Intrari: {data.counts?.invoices_in || 0} · Iesiri: {data.counts?.invoices_out || 0} · Trezorerie: {data.counts?.treasury || 0}
              </div>
            </div>
          </Card>
          <div className="grid gap-3 md:grid-cols-4">
            <Info label="Documente draft" value={checks.draft_count || 0} />
            <Info label="Note dezechilibrate" value={checks.unbalanced_journals || 0} />
            <Info label="Balanta" value={data.balance?.balanced ? 'Echilibrata' : formatMoney(data.balance?.difference || 0)} />
            <Info label="TVA de plata/recuperat" value={formatMoney(data.vat?.diferenta || 0)} />
          </div>
          <Table headers={['Data', 'Tip', 'Document', 'Status']}>
            {(data.drafts || []).map(row => (
              <tr key={`${row.categorie}-${row.uuid || row.id}`}>
                <td className="px-3 py-2">{row.data || '-'}</td>
                <td className="px-3 py-2">{row.categorie}</td>
                <td className="px-3 py-2">{row.document || '-'}</td>
                <td className="px-3 py-2"><Badge tone={statusTone(row.status)}>{row.status}</Badge></td>
              </tr>
            ))}
          </Table>
          <Table headers={['Data', 'Document', 'Tip', 'Debit', 'Credit', 'Diferenta']}>
            {(data.unbalanced || []).map(row => (
              <tr key={row.uuid || row.id}>
                <td className="px-3 py-2">{row.data || '-'}</td>
                <td className="px-3 py-2">{row.nr_document || row.id}</td>
                <td className="px-3 py-2">{row.tip_document || '-'}</td>
                <td className="px-3 py-2 text-right">{formatMoney(row.total_debit)}</td>
                <td className="px-3 py-2 text-right">{formatMoney(row.total_credit)}</td>
                <td className="px-3 py-2 text-right font-semibold text-red-700">{formatMoney(row.diferenta)}</td>
              </tr>
            ))}
          </Table>
        </>
      ) : null}
    </AccountingShell>
  )
}

export function AlerteLegislative() {
  const [rows, setRows] = useState([])
  useEffect(() => { api.get('/accounting/alerts').then(res => setRows(res.data.alerts || [])).catch(() => setRows([])) }, [])
  return (
    <AccountingShell active="alerte" title="Alerte legislative" subtitle="Urmarire schimbari relevante pentru contabilitate.">
      <Table headers={['Titlu', 'Tip', 'Data', 'Status']}>
        {rows.map(row => <tr key={row.id}><td className="px-3 py-2">{row.titlu}</td><td className="px-3 py-2">{row.tip}</td><td className="px-3 py-2">{row.data_publicare}</td><td className="px-3 py-2"><Badge tone={statusTone(row.status)}>{row.status}</Badge></td></tr>)}
      </Table>
    </AccountingShell>
  )
}

function Table({ headers, children }) {
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
