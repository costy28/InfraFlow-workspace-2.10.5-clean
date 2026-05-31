import { useEffect, useMemo, useState } from 'react'
import api from '../../api/client'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'

const tabs = ['Comenzi', 'Cerințe', 'Cântar', 'Plan anual']
const pageSize = 10

function today() {
  return new Date().toISOString().slice(0, 10)
}

function arrayFrom(data, keys) {
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key]
  }
  return Array.isArray(data) ? data : []
}

function dateValue(value) {
  return String(value || '').slice(0, 10)
}

function money(value) {
  return Number(value || 0).toLocaleString('ro-RO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function orderStatusInfo(status) {
  const raw = String(status || '').toLowerCase()
  if (['received', 'livrata', 'finalizata', 'ok', 'receptionata', 'closed'].includes(raw)) return { label: 'Recepționată', variant: 'green' }
  if (['ordered', 'trimisa', 'aprobata', 'emisa', 'open'].includes(raw)) return { label: 'Emisă', variant: 'blue' }
  if (raw === 'partial') return { label: 'Parțial recepționată', variant: 'yellow' }
  if (['draft', 'noua', 'new'].includes(raw)) return { label: 'Nouă', variant: 'gray' }
  if (['canceled', 'anulata', 'respinsa'].includes(raw)) return { label: 'Anulată', variant: 'red' }
  return { label: status || 'În lucru', variant: 'yellow' }
}

function urgentInfo(item) {
  const urgent = item.urgent === true || item.urgent === 1 || Number(item.shortage || item.deficit || 0) > 0
  return urgent ? { label: 'Urgent', variant: 'red' } : { label: 'Normal', variant: 'green' }
}

function ticketWeight(ticket) {
  return ticket.weight || ticket.netWeight || ticket.cantitate || ticket.quantity || ticket.greutate_neta || '-'
}

function numberValue(value) {
  if (value === null || value === undefined || value === '') return '-'
  return Number(value || 0).toLocaleString('ro-RO')
}

function materialName(material) {
  return material?.name || material?.denumire || material?.materialName || 'Material'
}

function Pager({ page, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
      <span className="text-slate-500">Pagina {page} din {pages}</span>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</Button>
        <Button variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Următor</Button>
      </div>
    </div>
  )
}

function EmptyRow({ colSpan, loading }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-8 text-center text-sm text-slate-500">
        {loading ? 'Se incarca...' : 'Nu exista date pentru tabul selectat.'}
      </td>
    </tr>
  )
}

export default function AchizitiiPage() {
  const [activeTab, setActiveTab] = useState('Comenzi')
  const [orders, setOrders] = useState([])
  const [requirements, setRequirements] = useState([])
  const [scaleStatus, setScaleStatus] = useState(null)
  const [tickets, setTickets] = useState([])
  const [productMap, setProductMap] = useState([])
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [receiveOrder, setReceiveOrder] = useState(null)
  const [materialModal, setMaterialModal] = useState(false)
  const [planYear, setPlanYear] = useState(new Date().getFullYear() + 1)
  const [planRows, setPlanRows] = useState([])
  const [receiveForm, setReceiveForm] = useState({ nr_aviz: '', data_receptie: today(), observatii: '', linii: [] })
  const [materialForm, setMaterialForm] = useState({ cod: '', denumire: '', um: 'kg', categorie: 'materie_prima', stoc_minim: '', pret_unitar: '', cod_cpv: '', furnizor_implicit: '' })
  const [form, setForm] = useState({
    date: today(),
    supplier: '',
    materialId: '',
    amount: '',
    orderNo: '',
    expectedDate: '',
    note: '',
  })

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [ordersRes, requirementsRes, scaleRes, ticketsRes, productMapRes, materialsRes] = await Promise.all([
        api.get('/procurement-orders'),
        api.get('/procurement-requirements'),
        api.get('/scale/status'),
        api.get('/scale/tickets').catch(() => ({ data: { tickets: [] } })),
        api.get('/scale/product-map').catch(() => ({ data: { productMap: {} } })),
        api.get('/materials').catch(() => ({ data: {} })),
      ])

      setOrders(arrayFrom(ordersRes.data, ['orders', 'items', 'data']))
      setRequirements(arrayFrom(requirementsRes.data, ['requirements', 'items', 'data']))
      setScaleStatus(scaleRes.data || null)
      setTickets(arrayFrom(ticketsRes.data, ['tickets', 'items', 'scaleTickets', 'data']))
      setProductMap(Object.entries(productMapRes.data?.productMap || {}).map(([product, materialId]) => ({ product, materialId })))
      setMaterials(arrayFrom(materialsRes.data, ['materials', 'items', 'data']))
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut incarca datele de achizitii.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [])

  function selectTab(tab) {
    setActiveTab(tab)
    setPage(1)
  }

  const pagedOrders = useMemo(() => orders.slice((page - 1) * pageSize, page * pageSize), [orders, page])
  const pagedRequirements = useMemo(() => requirements.slice((page - 1) * pageSize, page * pageSize), [requirements, page])
  const pagedTickets = useMemo(() => tickets.slice((page - 1) * pageSize, page * pageSize), [tickets, page])
  const productMapRows = useMemo(() => productMap.map(row => {
    const material = materials.find(item => String(item.id) === String(row.materialId))
    return { ...row, materialName: material?.name || material?.denumire || row.materialId }
  }), [productMap, materials])

  async function saveOrder(event) {
    event.preventDefault()
    setMessage('')
    setError('')
    try {
      await api.post('/procurement-orders', {
        date: form.date,
        furnizor: form.supplier,
        supplier: form.supplier,
        materiale: [{
          material_id: form.materialId,
          materialId: form.materialId,
          cantitate: Number(form.amount || 0),
          amount: Number(form.amount || 0),
          pret: 0
        }],
        materialId: form.materialId,
        amount: Number(form.amount || 0),
        orderNo: form.orderNo,
        nr_comanda: form.orderNo,
        expectedDate: form.expectedDate || null,
        data_livrare_estimata: form.expectedDate || null,
        note: form.note,
        observatii: form.note,
      })
      setMessage('Comanda a fost salvată.')
      setModalOpen(false)
      setForm({ date: today(), supplier: '', materialId: '', amount: '', orderNo: '', expectedDate: '', note: '' })
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Comanda nu a putut fi salvată.')
    }
  }

  async function createMaterial(event) {
    event.preventDefault()
    setError('')
    try {
      const response = await api.post('/materials', {
        code: materialForm.cod || `MAT-${Date.now().toString(36).toUpperCase()}`,
        name: materialForm.denumire,
        unit: materialForm.um,
        category: materialForm.categorie,
        alert: Number(materialForm.stoc_minim || 0),
        unitPrice: Number(materialForm.pret_unitar || 0),
        cod_cpv: materialForm.cod_cpv,
        defaultSupplier: materialForm.furnizor_implicit,
        recipeMaterial: false,
      })
      const material = response.data.material
      setMaterials(current => [...current, material])
      setForm(current => ({ ...current, materialId: material.id }))
      setMaterialModal(false)
      setMaterialForm({ cod: '', denumire: '', um: 'kg', categorie: 'materie_prima', stoc_minim: '', pret_unitar: '', cod_cpv: '', furnizor_implicit: '' })
    } catch (err) {
      setError(err.response?.data?.error || 'Materialul nu a putut fi creat.')
    }
  }

  function openReceive(order) {
    const lines = Array.isArray(order.lines) && order.lines.length ? order.lines : [{ material_id: order.materialId, materialName: order.materialName, cantitate: order.amount, cantitate_ramasa: order.remainingAmount || order.amount, unit: order.unit }]
    setReceiveOrder(order)
    setReceiveForm({
      nr_aviz: '',
      data_receptie: today(),
      observatii: '',
      linii: lines.map(line => ({
        material_id: line.material_id || line.materialId,
        materialName: line.materialName,
        cantitate: Number(line.cantitate || line.amount || 0),
        cantitate_ramasa: Number(line.cantitate_ramasa ?? line.remainingAmount ?? line.cantitate ?? line.amount ?? 0),
        cantitate_receptionata: Number(line.cantitate_ramasa ?? line.remainingAmount ?? line.cantitate ?? line.amount ?? 0),
        unit: line.unit,
      })),
    })
  }

  async function submitReceive(event) {
    event.preventDefault()
    if (!receiveOrder) return
    setError('')
    try {
      const response = await api.post(`/procurement-orders/${receiveOrder.uuid || receiveOrder.id}/receive`, receiveForm)
      const updated = response.data.stocuri_actualizate || []
      setMessage(`Stoc actualizat: ${updated.map(item => `+${item.cantitate} ${item.unit || ''} ${item.materialName}`).join(', ')}`)
      setReceiveOrder(null)
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Recepția nu a putut fi salvată.')
    }
  }

  async function generatePlan() {
    const response = await api.get('/procurement/plan/generate', { params: { an: planYear } })
    setPlanRows(arrayFrom(response.data, ['plan']))
  }

  async function savePlan() {
    await api.post('/procurement/plan', { an: planYear, linii: planRows })
    setMessage('Planul anual a fost salvat.')
  }

  const scaleConnected = !!(scaleStatus?.connected || scaleStatus?.ok || scaleStatus?.available || scaleStatus?.status === 'connected' || scaleStatus?.readable)

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Achiziții</h1>
          <p className="text-sm text-slate-500">Comenzi, cerințe de aprovizionare și tichete de cântar.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>Comandă nouă</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map(tab => (
          <Button
            key={tab}
            variant={activeTab === tab ? 'primary' : 'secondary'}
            onClick={() => selectTab(tab)}
          >
            {tab}
          </Button>
        ))}
      </div>

      {error ? <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {message ? <div className="rounded-md border border-primary-100 bg-primary-50 px-4 py-3 text-sm text-primary-700">{message}</div> : null}

      {activeTab === 'Comenzi' && (
        <Card
          title="Comenzi"
          subtitle="Lista comenzilor de aprovizionare."
          loading={loading}
          actions={<Button size="sm" onClick={() => setModalOpen(true)}>Comandă nouă</Button>}
        >
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Dată</th>
                  <th className="px-3 py-2">Furnizor</th>
                  <th className="px-3 py-2">Materiale</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Valoare</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedOrders.length === 0 ? <EmptyRow colSpan={6} loading={loading} /> : pagedOrders.map(order => {
                  const status = orderStatusInfo(order.status)
                  const value = order.value || order.valoare || order.total || Number(order.amount || 0) * Number(order.unitPrice || order.pret_unitar || 0)
                  return (
                    <tr key={order.id || order.uuid || `${order.date}-${order.supplier}`} className="hover:bg-slate-50">
                      <td className="px-3 py-3">{dateValue(order.date || order.data || order.createdAt)}</td>
                      <td className="px-3 py-3 font-medium text-slate-800">{order.supplier || order.supplierName || order.furnizor || '-'}</td>
                      <td className="px-3 py-3">{order.materialName || order.material || order.materiale || order.itemsSummary || '-'}</td>
                      <td className="px-3 py-3"><Badge variant={status.variant}>{status.label}</Badge></td>
                      <td className="px-3 py-3 text-right">{money(value)} RON</td>
                      <td className="px-3 py-3 text-right">{['emisa', 'partial', 'open'].includes(String(order.status)) ? <Button size="sm" variant="secondary" onClick={() => openReceive(order)}>📦 Recepționează</Button> : null}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={orders.length} onPage={setPage} />
        </Card>
      )}

      {activeTab === 'Cerințe' && (
        <Card title="Cerințe" subtitle="Materiale necesare pentru aprovizionare." loading={loading}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Material necesar</th>
                  <th className="px-3 py-2 text-right">Cantitate</th>
                  <th className="px-3 py-2">Urgent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedRequirements.length === 0 ? <EmptyRow colSpan={3} loading={loading} /> : pagedRequirements.map(item => {
                  const urgency = urgentInfo(item)
                  const quantity = item.required || item.needed || item.shortage || item.cantitate || item.quantity || 0
                  return (
                    <tr key={item.id || item.materialId || item.materialName} className="hover:bg-slate-50">
                      <td className="px-3 py-3 font-medium text-slate-800">{item.materialName || item.material || item.denumire || '-'}</td>
                      <td className="px-3 py-3 text-right">{Number(quantity || 0).toLocaleString('ro-RO')} {item.unit || item.um || ''}</td>
                      <td className="px-3 py-3"><Badge variant={urgency.variant}>{urgency.label}</Badge></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={requirements.length} onPage={setPage} />
        </Card>
      )}

      {activeTab === 'Cântar' && (
        <div className="grid gap-5">
          <Card title="Status cântar" subtitle="Conexiune și ultimul răspuns." loading={loading}>
            <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
              <div className="space-y-4">
              <Badge variant={scaleConnected ? 'green' : 'red'}>
                {scaleConnected ? 'Conectat' : 'Deconectat'}
              </Badge>
                <p className="text-sm text-slate-600">Cântarul se configurează din setările sistemului.</p>
              </div>
              <div className="grid gap-2 text-sm text-slate-600">
                <div className="flex justify-between gap-4">
                  <span>Cale configurată</span>
                  <span className="text-right font-medium text-slate-900">{scaleStatus?.configuredPath || scaleStatus?.path || '-'}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Bază găsită</span>
                  <span className="font-medium text-slate-900">{scaleStatus?.exists ? 'Da' : 'Nu'}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Tichete</span>
                  <span className="font-medium text-slate-900">{scaleStatus?.tickets ?? tickets.length}</span>
                </div>
              </div>
            </div>
          </Card>

          <Card title="Ultimele tichete cântar" loading={loading}>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Nr tichet</th>
                    <th className="px-3 py-2">Dată</th>
                    <th className="px-3 py-2">Produs</th>
                    <th className="px-3 py-2 text-right">Cantitate</th>
                    <th className="px-3 py-2 text-right">Brut</th>
                    <th className="px-3 py-2 text-right">Net</th>
                    <th className="px-3 py-2 text-right">Tară</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedTickets.length === 0 ? <EmptyRow colSpan={7} loading={loading} /> : pagedTickets.map(ticket => (
                    <tr key={ticket.id || ticket.ticketNo || ticket.nr_tichet} className="hover:bg-slate-50">
                      <td className="px-3 py-3 font-medium text-slate-800">{ticket.ticketNo || ticket.nr_tichet || ticket.number || '-'}</td>
                      <td className="px-3 py-3">{dateValue(ticket.date || ticket.data || ticket.createdAt)}</td>
                      <td className="px-3 py-3">{ticket.product || ticket.productName || ticket.material || '-'}</td>
                      <td className="px-3 py-3 text-right">{ticketWeight(ticket)}</td>
                      <td className="px-3 py-3 text-right">{numberValue(ticket.brut || ticket.grossWeight || ticket.greutate_bruta || ticket.firstWeight)}</td>
                      <td className="px-3 py-3 text-right">{numberValue(ticket.net || ticket.netWeight || ticket.greutate_neta)}</td>
                      <td className="px-3 py-3 text-right">{numberValue(ticket.tara || ticket.tare || ticket.tareWeight || ticket.secondWeight)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} total={tickets.length} onPage={setPage} />
          </Card>

          <Card title="Mapare produse" subtitle="Cod produs cântar → material InfraFlow" loading={loading}>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Cod produs cântar</th>
                    <th className="px-3 py-2">Material InfraFlow</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {productMapRows.length === 0 ? <EmptyRow colSpan={2} loading={loading} /> : productMapRows.map(row => (
                    <tr key={row.product} className="hover:bg-slate-50">
                      <td className="px-3 py-3 font-medium text-slate-800">{row.product}</td>
                      <td className="px-3 py-3">{row.materialName || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'Plan anual' && (
        <Card title="Plan anual achiziții" subtitle="Plan pe coduri CPV, generat din istoricul comenzilor.">
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <Input label="An" type="number" value={planYear} onChange={event => setPlanYear(Number(event.target.value))} />
            <Button type="button" onClick={generatePlan}>Generează plan din istoric</Button>
            <Button type="button" variant="secondary" onClick={savePlan}>Salvează plan</Button>
            <Button type="button" variant="secondary" onClick={() => window.open(`/api/procurement/plan/export?an=${planYear}`, '_blank')}>Exportă Excel</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500"><tr><th className="px-3 py-2">Cod CPV</th><th className="px-3 py-2">Material</th><th className="px-3 py-2">UM</th><th className="px-3 py-2">Cantitate</th><th className="px-3 py-2">Valoare</th><th className="px-3 py-2">Procedură</th><th className="px-3 py-2">Trimestru</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {planRows.length === 0 ? <EmptyRow colSpan={7} loading={false} /> : planRows.map((row, index) => (
                  <tr key={`${row.cod_cpv}-${row.material_id}`}>
                    <td className="px-3 py-2">{row.cod_cpv}</td>
                    <td className="px-3 py-2">{row.denumire_material}</td>
                    <td className="px-3 py-2">{row.um}</td>
                    <td className="px-3 py-2"><Input value={row.cantitate_planificata ?? row.cantitate_estimata} onChange={event => setPlanRows(rows => rows.map((item, i) => i === index ? { ...item, cantitate_planificata: Number(event.target.value) } : item))} /></td>
                    <td className="px-3 py-2"><Input value={row.valoare_planificata ?? row.valoare_estimata} onChange={event => setPlanRows(rows => rows.map((item, i) => i === index ? { ...item, valoare_planificata: Number(event.target.value) } : item))} /></td>
                    <td className="px-3 py-2"><Select value={row.procedura || 'cumparare_directa'} onChange={event => setPlanRows(rows => rows.map((item, i) => i === index ? { ...item, procedura: event.target.value } : item))} options={[{ value: 'cumparare_directa', label: 'Cumpărare directă' }, { value: 'cerere_oferta', label: 'Cerere ofertă' }, { value: 'licitatie', label: 'Licitație' }]} /></td>
                    <td className="px-3 py-2"><Select value={row.trimestru || 'T1'} onChange={event => setPlanRows(rows => rows.map((item, i) => i === index ? { ...item, trimestru: event.target.value } : item))} options={['T1', 'T2', 'T3', 'T4'].map(q => ({ value: q, label: q }))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={modalOpen} title="Comandă nouă" size="lg" onClose={() => setModalOpen(false)}>
        <form className="grid gap-4" onSubmit={saveOrder}>
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Dată" type="date" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} />
            <Input label="Număr comandă" value={form.orderNo} onChange={event => setForm({ ...form, orderNo: event.target.value })} />
            <Input label="Furnizor" value={form.supplier} onChange={event => setForm({ ...form, supplier: event.target.value })} />
            <div className="grid gap-2 md:grid-cols-[1fr_auto]">
              <Select label="Material" value={form.materialId} onChange={event => setForm({ ...form, materialId: event.target.value })}>
                <option value="">Alege material</option>
                {materials.map(material => (
                  <option key={material.id} value={material.id}>
                    {materialName(material)}
                  </option>
                ))}
              </Select>
              <div className="flex items-end"><Button type="button" variant="secondary" onClick={() => setMaterialModal(true)}>+ Material nou</Button></div>
            </div>
            <Input label="Cantitate" type="number" min="0" step="0.001" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} />
            <Input label="Dată estimată livrare" type="date" value={form.expectedDate} onChange={event => setForm({ ...form, expectedDate: event.target.value })} />
          </div>
          <Input label="Observații" value={form.note} onChange={event => setForm({ ...form, note: event.target.value })} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Renunță</Button>
            <Button type="submit">Salvează comanda</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!receiveOrder} title="Recepționează comandă" onClose={() => setReceiveOrder(null)}>
        <form className="grid gap-4" onSubmit={submitReceive}>
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Nr. aviz" value={receiveForm.nr_aviz} onChange={event => setReceiveForm({ ...receiveForm, nr_aviz: event.target.value })} />
            <Input label="Data recepției" type="date" value={receiveForm.data_receptie} onChange={event => setReceiveForm({ ...receiveForm, data_receptie: event.target.value })} />
          </div>
          <div className="grid gap-2">
            {receiveForm.linii.map((line, index) => (
              <div key={line.material_id} className="grid gap-2 rounded-md border border-slate-200 p-3 md:grid-cols-[1fr_150px] md:items-end">
                <div className="text-sm"><div className="font-medium">{line.materialName}</div><div className="text-slate-500">Comandat: {line.cantitate} {line.unit} / Rămas: {line.cantitate_ramasa} {line.unit}</div></div>
                <Input label="Primit" type="number" step="0.001" value={line.cantitate_receptionata} onChange={event => setReceiveForm(current => ({ ...current, linii: current.linii.map((item, i) => i === index ? { ...item, cantitate_receptionata: Number(event.target.value) } : item) }))} />
              </div>
            ))}
          </div>
          <Input label="Observații" value={receiveForm.observatii} onChange={event => setReceiveForm({ ...receiveForm, observatii: event.target.value })} />
          <Button type="submit">Confirmă recepția</Button>
        </form>
      </Modal>

      <Modal open={materialModal} title="Material nou" onClose={() => setMaterialModal(false)}>
        <form className="grid gap-3" onSubmit={createMaterial}>
          <Input label="Cod" value={materialForm.cod} onChange={event => setMaterialForm({ ...materialForm, cod: event.target.value })} placeholder="Auto dacă rămâne gol" />
          <Input label="Denumire" value={materialForm.denumire} onChange={event => setMaterialForm({ ...materialForm, denumire: event.target.value })} required />
          <Select label="Unitate de măsură" value={materialForm.um} onChange={event => setMaterialForm({ ...materialForm, um: event.target.value })} options={['kg', 'to', 'mc', 'buc', 'l', 'm', 'm²', 'm³'].map(value => ({ value, label: value }))} />
          <Select label="Categorie" value={materialForm.categorie} onChange={event => setMaterialForm({ ...materialForm, categorie: event.target.value })} options={['materie_prima', 'material', 'combustibil', 'marfa', 'obiect_inventar'].map(value => ({ value, label: value }))} />
          <Input label="Stoc minim" type="number" value={materialForm.stoc_minim} onChange={event => setMaterialForm({ ...materialForm, stoc_minim: event.target.value })} />
          <Input label="Preț unitar estimat" type="number" value={materialForm.pret_unitar} onChange={event => setMaterialForm({ ...materialForm, pret_unitar: event.target.value })} />
          <Input label="Cod CPV" value={materialForm.cod_cpv} onChange={event => setMaterialForm({ ...materialForm, cod_cpv: event.target.value })} />
          <Input label="Furnizor implicit" value={materialForm.furnizor_implicit} onChange={event => setMaterialForm({ ...materialForm, furnizor_implicit: event.target.value })} />
          <Button type="submit">Creează material</Button>
        </form>
      </Modal>
    </div>
  )
}
