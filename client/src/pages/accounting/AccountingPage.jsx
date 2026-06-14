import { useEffect, useMemo, useState } from 'react'
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
    inchisa: 'danger',
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
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  const emptyLine = () => ({ denumire: '', cont: isIn ? '628' : '704', valoare: '', tva_procent: 21 })
  const [form, setForm] = useState({ data: today(), valoare: '', tva_procent: 21, cont_cheltuiala: '628', cont_venit: '704', lines: [emptyLine()] })
  const endpoint = isIn ? '/accounting/invoices-in' : '/accounting/invoices-out'
  async function load() {
    const [a, t] = await Promise.all([
      api.get(endpoint),
      api.get('/accounting/third-parties', { params: { tip: isIn ? 'furnizor' : 'client' } })
    ])
    setRows(a.data.invoices || [])
    setThirdParties(t.data.thirdParties || [])
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
    if (!window.confirm('Devalidezi factura si o readuci in draft pentru editare?')) return
    try {
      setError('')
      await api.post(`${endpoint}/${row.uuid}/devalidate`, { motiv: 'Corectie document inainte de depunere' })
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Factura nu a putut fi devalidata.')
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
              <div className="flex gap-2">
                {row.status === 'draft' ? <Button size="sm" variant="secondary" onClick={() => openEdit(row)}>Edit</Button> : null}
                {row.status === 'draft' ? <Button size="sm" onClick={() => validate(row)}>Valideaza</Button> : null}
                {row.status === 'draft' ? <Button size="sm" variant="secondary" onClick={() => cancelDraft(row)}>Anuleaza</Button> : null}
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
          <Input label={isIn ? 'Cont cheltuiala' : 'Cont venit'} value={isIn ? form.cont_cheltuiala : form.cont_venit} onChange={event => setForm({ ...form, [isIn ? 'cont_cheltuiala' : 'cont_venit']: event.target.value })} />
          <div className="rounded-md border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-sm font-semibold text-slate-800">Linii factura</div>
              <Button type="button" size="sm" variant="secondary" onClick={addLine}>+ Linie</Button>
            </div>
            <div className="grid gap-2 p-3">
              {invoiceLines.map((line, index) => (
                <div key={index} className="grid gap-2 rounded-md border border-slate-200 p-2 md:grid-cols-[minmax(0,1fr)_110px_120px_96px_40px]">
                  <Input label="Denumire" value={line.denumire || ''} onChange={event => updateLine(index, { denumire: event.target.value })} />
                  <Input label="Cont" value={line.cont || ''} onChange={event => updateLine(index, { cont: event.target.value })} />
                  <Input label="Valoare" type="number" step="0.01" value={line.valoare || ''} onChange={event => updateLine(index, { valoare: event.target.value })} />
                  <Select label="TVA" value={line.tva_procent ?? 21} onChange={event => updateLine(index, { tva_procent: event.target.value })} options={[0,5,9,19,21].map(v => ({ value: v, label: `${v}%` }))} />
                  <div className="flex items-end"><Button type="button" size="sm" variant="secondary" onClick={() => removeLine(index)}>x</Button></div>
                </div>
              ))}
            </div>
          </div>
          <Input label="Explicatie" value={form.explicatie || ''} onChange={event => setForm({ ...form, explicatie: event.target.value })} />
          <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">Preview nota: {isIn ? `linii debit + 4426 = 401.x` : `4111.x = linii venit + 4427`} · Baza {formatMoney(baseValue)} · TVA {formatMoney(tvaLines)} · Total {formatMoney(total)}</div>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setModal(false)}>Renunta</Button><Button type="submit">{editing ? 'Salveaza modificari' : 'Salveaza draft'}</Button></div>
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
  useEffect(() => { api.get('/accounting/journals').then(res => setRows(res.data.journals || [])).catch(() => setRows([])) }, [])
  return (
    <AccountingShell active="jurnal" title="Registru jurnal" subtitle="Note contabile active si storno, cu linii debit/credit.">
      <Table headers={['Data', 'Document', 'Tip', 'Explicatie', 'Debit', 'Credit', 'Status']}>
        {rows.map(row => <tr key={row.uuid}><td className="px-3 py-2">{row.data}</td><td className="px-3 py-2">{row.nr_document}</td><td className="px-3 py-2">{row.tip_document}</td><td className="px-3 py-2">{row.explicatie}</td><td className="px-3 py-2">{formatMoney(row.total_debit)}</td><td className="px-3 py-2">{formatMoney(row.total_credit)}</td><td className="px-3 py-2"><Badge tone={statusTone(row.status)}>{row.status}</Badge></td></tr>)}
      </Table>
    </AccountingShell>
  )
}

export function Balanta() {
  const [month, setMonth] = useState(currentMonth())
  const [data, setData] = useState({ rows: [], totals: {}, balanced: true })
  useEffect(() => { const [an, luna] = month.split('-'); api.get('/accounting/balance-sheet', { params: { an, luna } }).then(res => setData(res.data)).catch(() => setData({ rows: [], totals: {}, balanced: false })) }, [month])
  return (
    <AccountingShell active="balanta" title="Balanta" subtitle="Verificare total debit egal total credit.">
      <Card><Input label="Luna" type="month" value={month} onChange={event => setMonth(event.target.value)} /></Card>
      <div className={`rounded-md px-3 py-2 text-sm ${data.balanced ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{data.balanced ? 'Balanta este echilibrata.' : 'Balanta nu este echilibrata.'}</div>
      <Table headers={['Cont', 'Denumire', 'Rulaj D', 'Rulaj C', 'Sold D', 'Sold C']}>
        {data.rows.map(row => <tr key={row.cont}><td className="px-3 py-2 font-semibold">{row.cont}</td><td className="px-3 py-2">{row.denumire}</td><td className="px-3 py-2">{formatMoney(row.rulaje_D)}</td><td className="px-3 py-2">{formatMoney(row.rulaje_C)}</td><td className="px-3 py-2">{formatMoney(row.sold_D)}</td><td className="px-3 py-2">{formatMoney(row.sold_C)}</td></tr>)}
      </Table>
    </AccountingShell>
  )
}

export function FisaCont() {
  const { simbol } = useParams()
  const [data, setData] = useState({ movements: [], sold_final: 0 })
  useEffect(() => { api.get(`/accounting/ledger/${simbol}`).then(res => setData(res.data)).catch(() => setData({ movements: [], sold_final: 0 })) }, [simbol])
  return (
    <AccountingShell active="plan" title={`Fisa cont ${simbol}`} subtitle="Carte mare pe cont, cu sold progresiv.">
      <Table headers={['Data', 'Document', 'Explicatie', 'Debit', 'Credit', 'Sold']}>
        {data.movements.map(row => <tr key={row.id}><td className="px-3 py-2">{row.data}</td><td className="px-3 py-2">{row.nr_document}</td><td className="px-3 py-2">{row.explicatie}</td><td className="px-3 py-2">{formatMoney(row.debit)}</td><td className="px-3 py-2">{formatMoney(row.credit)}</td><td className="px-3 py-2 font-semibold">{formatMoney(row.sold)}</td></tr>)}
      </Table>
      <Card><div className="font-semibold">Sold final: {formatMoney(data.sold_final)}</div></Card>
    </AccountingShell>
  )
}

export function InchidereLuna() {
  const [month, setMonth] = useState(currentMonth())
  const [message, setMessage] = useState('')
  async function closeMonth() {
    const [an, luna] = month.split('-')
    await api.post(`/accounting/periods/${an}/${Number(luna)}/close`)
    setMessage('Luna a fost inchisa.')
  }
  return (
    <AccountingShell active="inchidere" title="Inchidere luna" subtitle="Blocheaza documentele si notele dupa verificare.">
      <Card>
        <div className="grid gap-3 md:grid-cols-[240px_auto]">
          <Input label="Luna" type="month" value={month} onChange={event => setMonth(event.target.value)} />
          <div className="flex items-end"><Button onClick={closeMonth}>Inchide luna</Button></div>
        </div>
      </Card>
      {message ? <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
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
