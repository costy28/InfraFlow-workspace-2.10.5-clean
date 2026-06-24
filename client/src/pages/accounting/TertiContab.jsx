import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api/client'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import { formatMoney } from '../../utils/format'
import { AccountingShell, DropdownMenu, Table } from './accounting-shared'

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
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [q, setQ] = useState('')
  const [activeFilter, setActiveFilter] = useState('active')
  const [form, setForm] = useState(blankThirdParty(type))
  const title = type === 'client' ? 'Clienti' : 'Furnizori'
  const statusEndpoint = type === 'client' ? '/accounting/clients-status' : '/accounting/suppliers-status'
  const invoicePath = type === 'client' ? '/contabilitate/facturi-iesire' : '/contabilitate/facturi-intrare'
  const accountKey = type === 'client' ? 'cont_analitic_client' : 'cont_analitic_furnizor'
  const tertParam = type === 'client' ? 'client' : 'furnizor'

  async function load() {
    try {
      const res = await api.get(statusEndpoint)
      setRows(res.data.rows || [])
    } catch {
      const res = await api.get('/accounting/third-parties', { params: { tip: type } })
      setRows(res.data.thirdParties || [])
    }
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

  async function openDetails(row) {
    setError('')
    setDetailLoading(true)
    setDetail({ tert: row, invoices: [], openInvoices: [], treasury: [], totals: {} })
    try {
      const res = await api.get(`${statusEndpoint}/${row.id}`)
      setDetail(res.data || { tert: row, invoices: [], openInvoices: [], treasury: [], totals: {} })
    } catch (err) {
      setDetail(null)
      setError(err.response?.data?.error || 'Detaliile tertului nu au putut fi incarcate.')
    } finally {
      setDetailLoading(false)
    }
  }

  const filteredRows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter(row => {
      const haystack = `${row.cod || ''} ${row.denumire || ''} ${row.cui || ''} ${row.email || ''} ${row.telefon || ''} ${row[accountKey] || ''}`.toLowerCase()
      const activeOk = activeFilter === 'all' || (activeFilter === 'active' ? row.activ !== false : row.activ === false)
      return activeOk && (!needle || haystack.includes(needle))
    })
  }, [rows, q, activeFilter, accountKey])

  const totals = useMemo(() => ({
    count: filteredRows.length,
    active: filteredRows.filter(row => row.activ !== false).length,
    sold: filteredRows.reduce((sum, row) => sum + Number(row.sold || 0), 0),
    overdue: filteredRows.reduce((sum, row) => sum + Number(row.scadente_depasite || 0), 0),
    overdueAmount: filteredRows.reduce((sum, row) => sum + Number(row.aging?.d1_30 || 0) + Number(row.aging?.d31_60 || 0) + Number(row.aging?.d61_90 || 0) + Number(row.aging?.d90_plus || 0), 0)
  }), [filteredRows])

  async function exportExcel() {
    setError('')
    try {
      const res = await api.get(`${statusEndpoint}/export`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const link = document.createElement('a')
      link.href = url
      link.download = `Scadentar_${type === 'client' ? 'clienti' : 'furnizori'}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.response?.data?.error || 'Exportul scadentar nu a putut fi generat.')
    }
  }

  async function exportDetail() {
    if (!detail?.tert?.id) return
    setError('')
    try {
      const res = await api.get(`${statusEndpoint}/${detail.tert.id}/export`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const link = document.createElement('a')
      link.href = url
      const safeName = String(detail.tert.denumire || detail.tert.cod || 'tert').replace(/[^\w.-]+/g, '_')
      link.download = `Fisa_tert_${type}_${safeName}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.response?.data?.error || 'Fisa tertului nu a putut fi exportata.')
    }
  }

  async function exportConfirmation() {
    if (!detail?.tert?.id) return
    setError('')
    try {
      const res = await api.get(`${statusEndpoint}/${detail.tert.id}/confirmation`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const link = document.createElement('a')
      link.href = url
      const safeName = String(detail.tert.denumire || detail.tert.cod || 'tert').replace(/[^\w.-]+/g, '_')
      link.download = `Confirmare_sold_${type}_${safeName}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.response?.data?.error || 'Confirmarea de sold nu a putut fi exportata.')
    }
  }

  return (
    <AccountingShell
      active={type === 'client' ? 'clienti' : 'furnizori'}
      title={title}
      subtitle="Terți contabili cu analitice generate automat."
      actions={<><Button onClick={openNew}>+ {type === 'client' ? 'Client' : 'Furnizor'}</Button><DropdownMenu align="right" label="Export" items={[{ label: 'Export scadentar', onClick: exportExcel }]} /></>}
    >
      {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
      <Card>
        <div className="grid gap-3 xl:grid-cols-[minmax(220px,1fr)_170px_110px_150px_150px_150px]">
          <Input label="Cauta tert" value={q} onChange={event => setQ(event.target.value)} placeholder="Denumire, CUI, cont..." />
          <Select label="Status" value={activeFilter} onChange={event => setActiveFilter(event.target.value)} options={[
            { value: 'active', label: 'Activi' },
            { value: 'inactive', label: 'Inactivi' },
            { value: 'all', label: 'Toti' }
          ]} />
          <div className="rounded-md bg-slate-50 px-3 py-2">
            <div className="text-xs text-slate-500">Terți</div>
            <div className="font-semibold">{totals.count}</div>
          </div>
          <div className="rounded-md bg-slate-50 px-3 py-2">
            <div className="text-xs text-slate-500">Sold deschis</div>
            <div className="font-semibold">{formatMoney(totals.sold)}</div>
          </div>
          <div className="rounded-md bg-slate-50 px-3 py-2">
            <div className="text-xs text-slate-500">Scadente depasite</div>
            <div className="font-semibold">{totals.overdue}</div>
          </div>
          <div className="rounded-md bg-slate-50 px-3 py-2">
            <div className="text-xs text-slate-500">Valoare depasita</div>
            <div className="font-semibold">{formatMoney(totals.overdueAmount)}</div>
          </div>
        </div>
      </Card>
      <Table headers={['Cod', 'Denumire', 'CUI', 'Analitic', 'Sold', 'Nescadent', '1-30', '31-60', '61-90', '>90', 'Facturi', 'Contact', 'Status', 'Actiuni']}>
        {filteredRows.map(row => (
          <tr key={row.id}>
            <td className="px-3 py-2 font-semibold">{row.cod}</td>
            <td className="px-3 py-2">
              <div className="font-medium">{row.denumire}</div>
              <div className="text-xs text-slate-500">{row.localitate || row.judet || '-'}</div>
            </td>
            <td className="px-3 py-2">{row.cui || '-'}</td>
            <td className="px-3 py-2">
              {row[accountKey] ? <Link className="font-semibold text-primary-700 hover:underline" to={`/contabilitate/fisa-cont/${row[accountKey]}`}>{row[accountKey]}</Link> : '-'}
            </td>
            <td className="px-3 py-2 font-semibold">{formatMoney(row.sold || 0)}</td>
            <td className="px-3 py-2">{formatMoney(row.aging?.current || 0)}</td>
            <td className={`px-3 py-2 ${Number(row.aging?.d1_30 || 0) ? 'font-semibold text-amber-700' : ''}`}>{formatMoney(row.aging?.d1_30 || 0)}</td>
            <td className={`px-3 py-2 ${Number(row.aging?.d31_60 || 0) ? 'font-semibold text-orange-700' : ''}`}>{formatMoney(row.aging?.d31_60 || 0)}</td>
            <td className={`px-3 py-2 ${Number(row.aging?.d61_90 || 0) ? 'font-semibold text-rose-700' : ''}`}>{formatMoney(row.aging?.d61_90 || 0)}</td>
            <td className={`px-3 py-2 ${Number(row.aging?.d90_plus || 0) ? 'font-semibold text-red-700' : ''}`}>{formatMoney(row.aging?.d90_plus || 0)}</td>
            <td className="px-3 py-2">
              <Link className="font-semibold text-primary-700 hover:underline" to={`${invoicePath}?${tertParam}=${row.id}`}>{row.facturi || 0}</Link>
              {row.scadente_depasite ? <div className="text-xs text-rose-600">{row.scadente_depasite} depasite</div> : null}
            </td>
            <td className="px-3 py-2">
              <div>{row.email || '-'}</div>
              <div className="text-xs text-slate-500">{row.telefon || ''}</div>
            </td>
            <td className="px-3 py-2"><Badge tone={row.activ === false ? 'neutral' : 'success'}>{row.activ === false ? 'inactiv' : 'activ'}</Badge></td>
            <td className="px-3 py-2">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => openDetails(row)}>Detalii</Button>
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
      <Modal open={Boolean(detail)} title={`Scadentar ${detail?.tert?.denumire || ''}`} onClose={() => setDetail(null)}>
        {detailLoading ? (
          <div className="py-8 text-center text-sm text-slate-500">Se incarca detaliile...</div>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <div className="text-xs text-slate-500">Sold deschis</div>
                <div className="font-semibold">{formatMoney(detail?.totals?.rest || 0)}</div>
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <div className="text-xs text-slate-500">Depasit</div>
                <div className="font-semibold text-rose-700">{formatMoney(detail?.totals?.overdue || 0)}</div>
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <div className="text-xs text-slate-500">Facturi deschise</div>
                <div className="font-semibold">{detail?.totals?.open || 0}</div>
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <div className="text-xs text-slate-500">Analitic</div>
                <div className="font-semibold">{detail?.account || '-'}</div>
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <div className="text-xs text-slate-500">{type === 'client' ? 'Incasari' : 'Plati'}</div>
                <div className="font-semibold">{formatMoney(type === 'client' ? detail?.totals?.treasury_in || 0 : detail?.totals?.treasury_out || 0)}</div>
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <div className="text-xs text-slate-500">Operatii trezorerie</div>
                <div className="font-semibold">{detail?.totals?.treasury_count || 0}</div>
              </div>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {detail?.tert?.cui ? <span>CUI {detail.tert.cui}</span> : <span>CUI necompletat</span>}
              {detail?.tert?.email ? <span> · {detail.tert.email}</span> : null}
              {detail?.tert?.telefon ? <span> · {detail.tert.telefon}</span> : null}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={exportConfirmation}>Confirmare sold</Button>
              <Button variant="secondary" onClick={exportDetail}>Exporta fisa tert</Button>
            </div>
            <Table headers={['Data', 'Document', 'Scadenta', 'Total', type === 'client' ? 'Incasat' : 'Achitat', 'Rest', 'Intarziere', 'Actiuni']}>
              {(detail?.openInvoices || []).map(invoice => (
                <tr key={`${invoice.id}-${invoice.nr_document}`} className="hover:bg-slate-50">
                  <td className="px-3 py-2">{invoice.data || '-'}</td>
                  <td className="px-3 py-2">
                    <div className="font-semibold">{invoice.nr_document || '-'}</div>
                    <div className="text-xs text-slate-500">{invoice.explicatie || '-'}</div>
                  </td>
                  <td className="px-3 py-2">{invoice.data_scadenta || '-'}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(invoice.total || 0)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(invoice.paid || 0)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatMoney(invoice.rest || 0)}</td>
                  <td className={`px-3 py-2 ${invoice.overdue ? 'font-semibold text-rose-700' : 'text-slate-500'}`}>
                    {invoice.overdue ? `${invoice.days_overdue} zile` : 'nescadent'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <Link className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" to={invoice.invoice_url}>Factura</Link>
                      <Link className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" to={invoice.treasury_url}>{type === 'client' ? 'Incaseaza' : 'Plateste'}</Link>
                    </div>
                  </td>
                </tr>
              ))}
              {(detail?.openInvoices || []).length ? null : (
                <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={8}>Nu exista facturi deschise pentru acest tert.</td></tr>
              )}
            </Table>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Istoric facturi</h3>
              <Table headers={['Data', 'Document', 'Scadenta', 'Status', 'Total', type === 'client' ? 'Incasat' : 'Achitat', 'Rest', 'Actiuni']}>
                {(detail?.invoices || []).slice().sort((a, b) => String(b.data || '').localeCompare(String(a.data || ''))).slice(0, 30).map(invoice => (
                  <tr key={`history-${invoice.id}-${invoice.nr_document}`} className="hover:bg-slate-50">
                    <td className="px-3 py-2">{invoice.data || '-'}</td>
                    <td className="px-3 py-2">
                      <div className="font-semibold">{invoice.nr_document || '-'}</div>
                      <div className="text-xs text-slate-500">{invoice.explicatie || '-'}</div>
                    </td>
                    <td className="px-3 py-2">{invoice.data_scadenta || '-'}</td>
                    <td className="px-3 py-2"><Badge tone={invoice.rest > 0 ? 'warning' : 'success'}>{invoice.status || '-'}</Badge></td>
                    <td className="px-3 py-2 text-right">{formatMoney(invoice.total || 0)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(invoice.paid || 0)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatMoney(invoice.rest || 0)}</td>
                    <td className="px-3 py-2">
                      <Link className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" to={invoice.invoice_url}>Factura</Link>
                    </td>
                  </tr>
                ))}
                {(detail?.invoices || []).length ? null : (
                  <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={8}>Nu exista facturi in istoricul acestui tert.</td></tr>
                )}
              </Table>
              {(detail?.invoices || []).length > 30 ? (
                <div className="mt-2 text-xs text-slate-500">Sunt afisate ultimele 30 facturi.</div>
              ) : null}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Miscari trezorerie</h3>
              <Table headers={['Data', 'Document', 'Operatie', 'Cont', 'Suma', 'Status', 'Factura', 'Actiuni']}>
                {(detail?.treasury || []).slice(0, 30).map(row => (
                  <tr key={`${row.uuid || row.id}-${row.nr_document}`} className="hover:bg-slate-50">
                    <td className="px-3 py-2">{row.data || '-'}</td>
                    <td className="px-3 py-2">
                      <div className="font-semibold">{row.nr_document || '-'}</div>
                      <div className="text-xs text-slate-500">{row.explicatie || '-'}</div>
                    </td>
                    <td className="px-3 py-2">{row.tip_operatie || '-'}</td>
                    <td className="px-3 py-2">
                      <div>{row.cont_trezorerie || '-'}</div>
                      <div className="text-xs text-slate-500">{row.cont_corespondent || '-'}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">{formatMoney(row.suma || 0)}</td>
                    <td className="px-3 py-2"><Badge tone={row.status === 'validat' ? 'success' : 'neutral'}>{row.status || '-'}</Badge></td>
                    <td className="px-3 py-2">{row.linked_invoice?.document || '-'}</td>
                    <td className="px-3 py-2">
                      <Link className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" to={row.treasury_url}>Trezorerie</Link>
                    </td>
                  </tr>
                ))}
                {(detail?.treasury || []).length ? null : (
                  <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={8}>Nu exista miscari de trezorerie pentru acest tert.</td></tr>
                )}
              </Table>
              {(detail?.treasury || []).length > 30 ? (
                <div className="mt-2 text-xs text-slate-500">Sunt afisate ultimele 30 operatii.</div>
              ) : null}
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setDetail(null)}>Inchide</Button>
            </div>
          </div>
        )}
      </Modal>
    </AccountingShell>
  )
}

export default TertiContab

