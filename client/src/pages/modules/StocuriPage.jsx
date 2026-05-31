import { useEffect, useMemo, useState } from 'react'
import api from '../../api/client'
import { useAuth } from '../../hooks/useAuth'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'

const tabs = ['Stoc curent', 'Mișcări', 'Livrări', 'Transferuri', 'Consum pe lucrări']
const pageSize = 10

function today() {
  return new Date().toISOString().slice(0, 10)
}

function arrayFrom(data, keys) {
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key]
  }
  return []
}

function materialName(material) {
  return material?.name || material?.denumire || material?.materialName || 'Material'
}

function materialStock(material) {
  return Number(material?.stock ?? material?.stoc_curent ?? material?.currentStock ?? 0)
}

function materialMin(material) {
  return Number(material?.alert ?? material?.stoc_minim ?? material?.stockMin ?? 0)
}

function stockStatus(material) {
  const stock = materialStock(material)
  const min = materialMin(material)
  if (min > 0 && stock < min) return { tone: 'danger', label: 'Critic' }
  if (min > 0 && stock < min * 1.5) return { tone: 'warning', label: 'Atenție' }
  return { tone: 'success', label: 'OK' }
}

function movementTypeLabel(type, amount) {
  if (Number(amount || 0) < 0) return 'Ieșire'
  if (['manual_out', 'consumption', 'cancel_delivery'].includes(String(type))) return 'Ieșire'
  return 'Intrare'
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
        {loading ? 'Se incarca...' : 'Nu exista date pentru filtrele selectate.'}
      </td>
    </tr>
  )
}

export default function StocuriPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('Stoc curent')
  const [materials, setMaterials] = useState([])
  const [myStock, setMyStock] = useState({ department: '', stocks: [] })
  const [transfers, setTransfers] = useState([])
  const [movements, setMovements] = useState([])
  const [deliveries, setDeliveries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [filters, setFilters] = useState({
    date: '',
    type: '',
    status: '',
    materialId: '',
    from: '',
    to: '',
  })
  const [deliveryForm, setDeliveryForm] = useState({
    date: today(),
    materialId: '',
    amount: '',
    supplier: '',
    document: '',
  })
  const [transferForm, setTransferForm] = useState({ material_id: '', cantitate: '', to_department: '', motiv: '' })
  const [consumptionForm, setConsumptionForm] = useState({ material_id: '', cantitate: '', lucrare_id: '', motiv: '' })

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [materialsResponse, movementsResponse, deliveriesResponse, myStockResponse, transfersResponse] = await Promise.all([
        api.get('/materials'),
        api.get('/stock-operations'),
        api.get('/deliveries'),
        api.get('/inventory/my-stock').catch(() => ({ data: { department: '', stocks: [] } })),
        api.get('/inventory/transfers').catch(() => ({ data: { transfers: [] } })),
      ])
      const nextMaterials = arrayFrom(materialsResponse.data, ['materials'])
      setMaterials(nextMaterials)
      setMovements(arrayFrom(movementsResponse.data, ['movements', 'operations']))
      setDeliveries(arrayFrom(deliveriesResponse.data, ['deliveries']))
      setMyStock({ department: myStockResponse.data.department || '', stocks: arrayFrom(myStockResponse.data, ['stocks']) })
      setTransfers(arrayFrom(transfersResponse.data, ['transfers']))
      setDeliveryForm(current => ({ ...current, materialId: current.materialId || nextMaterials[0]?.id || '' }))
      setTransferForm(current => ({ ...current, material_id: current.material_id || nextMaterials[0]?.id || '' }))
      setConsumptionForm(current => ({ ...current, material_id: current.material_id || nextMaterials[0]?.id || '' }))
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut incarca datele de stoc.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    Promise.resolve().then(() => load())
  }, [])

  useEffect(() => {
    Promise.resolve().then(() => setPage(1))
  }, [activeTab, filters])

  const stockRows = useMemo(() => {
    const own = myStock.stocks || []
    if (!own.length) return materials.map(material => ({ ...material, materialName: materialName(material), stoc_curent: materialStock(material), stoc_minim: materialMin(material), unit: material.unit || material.um }))
    return own
  }, [materials, myStock.stocks])

  const filteredMaterials = useMemo(() => {
    return stockRows.filter(material => {
      if (!filters.status) return true
      return stockStatus(material).label === filters.status
    })
  }, [stockRows, filters.status])

  const filteredMovements = useMemo(() => {
    return movements.filter(item => {
      const date = item.date || item.data || ''
      if (filters.date && date !== filters.date) return false
      if (filters.from && date < filters.from) return false
      if (filters.to && date > filters.to) return false
      if (filters.materialId && item.materialId !== filters.materialId) return false
      if (filters.type && movementTypeLabel(item.type, item.amount) !== filters.type) return false
      return true
    })
  }, [movements, filters])

  const filteredDeliveries = useMemo(() => {
    return deliveries.filter(item => {
      const date = item.date || item.data || ''
      if (filters.date && date !== filters.date) return false
      if (filters.from && date < filters.from) return false
      if (filters.to && date > filters.to) return false
      if (filters.materialId && item.materialId !== filters.materialId) return false
      return true
    })
  }, [deliveries, filters])

  const pagedMaterials = filteredMaterials.slice((page - 1) * pageSize, page * pageSize)
  const pagedMovements = filteredMovements.slice((page - 1) * pageSize, page * pageSize)
  const pagedDeliveries = filteredDeliveries.slice((page - 1) * pageSize, page * pageSize)
  const pagedTransfers = transfers.slice((page - 1) * pageSize, page * pageSize)
  const canManageStock = ['superadmin', 'admin', 'inventory'].includes(user?.role)

  async function submitDelivery(event) {
    event.preventDefault()
    setError('')
    try {
      await api.post('/deliveries', {
        date: deliveryForm.date,
        materialId: deliveryForm.materialId,
        amount: Number(deliveryForm.amount),
        supplier: deliveryForm.supplier,
        document: deliveryForm.document,
      })
      setModalOpen(false)
      setDeliveryForm({ date: today(), materialId: materials[0]?.id || '', amount: '', supplier: '', document: '' })
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Livrarea nu a putut fi inregistrata.')
    }
  }

  async function submitTransfer(event) {
    event.preventDefault()
    setError('')
    try {
      await api.post('/inventory/transfers', { ...transferForm, cantitate: Number(transferForm.cantitate || 0) })
      setTransferForm({ material_id: materials[0]?.id || '', cantitate: '', to_department: '', motiv: '' })
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Transferul nu a putut fi salvat.')
    }
  }

  async function submitConsumption(event) {
    event.preventDefault()
    setError('')
    try {
      await api.post('/inventory/department-consumption', { ...consumptionForm, cantitate: Number(consumptionForm.cantitate || 0) })
      setConsumptionForm({ material_id: materials[0]?.id || '', cantitate: '', lucrare_id: '', motiv: '' })
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Consumul nu a putut fi înregistrat.')
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Stocuri</h2>
          <p className="text-sm text-slate-500">Stoc central, stocuri pe departamente, mișcări și livrări.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>Adaugă nou</Button>
      </div>

      {error ? <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      <Card>
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          {tabs.map(tab => (
            <Button
              key={tab}
              variant={activeTab === tab ? 'primary' : 'secondary'}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </Button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <Input label="Dată" type="date" value={filters.date} onChange={event => setFilters({ ...filters, date: event.target.value })} />
          <Input label="De la" type="date" value={filters.from} onChange={event => setFilters({ ...filters, from: event.target.value })} />
          <Input label="Până la" type="date" value={filters.to} onChange={event => setFilters({ ...filters, to: event.target.value })} />
          <Select
            label="Material"
            value={filters.materialId}
            onChange={event => setFilters({ ...filters, materialId: event.target.value })}
            options={[{ value: '', label: 'Toate materialele' }, ...materials.map(material => ({ value: material.id, label: materialName(material) }))]}
          />
          {activeTab === 'Stoc curent' ? (
            <Select
              label="Status"
              value={filters.status}
              onChange={event => setFilters({ ...filters, status: event.target.value })}
              options={[
                { value: '', label: 'Toate statusurile' },
                { value: 'OK', label: 'Verde - OK' },
                { value: 'Atenție', label: 'Galben - Atenție' },
                { value: 'Critic', label: 'Roșu - Critic' },
              ]}
            />
          ) : (
            <Select
              label="Tip"
              value={filters.type}
              onChange={event => setFilters({ ...filters, type: event.target.value })}
              options={[
                { value: '', label: 'Toate tipurile' },
                { value: 'Intrare', label: 'Intrare' },
                { value: 'Ieșire', label: 'Ieșire' },
              ]}
            />
          )}
        </div>
      </Card>

      {activeTab === 'Stoc curent' ? (
        <Card>
          <h3 className="mb-3 text-base font-semibold text-slate-900">Stoc curent</h3>
          <div className="mb-3"><Badge tone={myStock.department === 'central' ? 'success' : 'neutral'}>Departament: {myStock.department || 'central'}</Badge></div>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Material</th>
                  <th className="px-3 py-2">UM</th>
                  <th className="px-3 py-2">Stoc curent</th>
                  <th className="px-3 py-2">Stoc minim</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedMaterials.length ? pagedMaterials.map(material => {
                  const status = stockStatus(material)
                  return (
                    <tr key={material.id || `${material.department_cod}-${material.material_id}`}>
                      <td className="px-3 py-2 font-medium text-slate-900">{material.materialName || materialName(material)}</td>
                      <td className="px-3 py-2">{material.unit || material.um || '-'}</td>
                      <td className="px-3 py-2">{materialStock(material).toLocaleString('ro-RO')}</td>
                      <td className="px-3 py-2">{materialMin(material).toLocaleString('ro-RO')}</td>
                      <td className="px-3 py-2"><Badge tone={status.tone}>{status.label}</Badge></td>
                    </tr>
                  )
                }) : <EmptyRow colSpan={5} loading={loading} />}
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            <Pager page={page} total={filteredMaterials.length} onPage={setPage} />
          </div>
        </Card>
      ) : null}

      {activeTab === 'Transferuri' ? (
        <Card>
          <h3 className="mb-3 text-base font-semibold text-slate-900">Transferuri stoc</h3>
          {canManageStock ? (
            <form className="mb-4 grid gap-3 md:grid-cols-5" onSubmit={submitTransfer}>
              <Select label="Material" value={transferForm.material_id} onChange={event => setTransferForm({ ...transferForm, material_id: event.target.value })} options={materials.map(material => ({ value: material.id, label: materialName(material) }))} />
              <Input label="Cantitate" type="number" step="0.001" value={transferForm.cantitate} onChange={event => setTransferForm({ ...transferForm, cantitate: event.target.value })} />
              <Input label="Departament destinatar" value={transferForm.to_department} onChange={event => setTransferForm({ ...transferForm, to_department: event.target.value })} />
              <Input label="Motiv" value={transferForm.motiv} onChange={event => setTransferForm({ ...transferForm, motiv: event.target.value })} />
              <Button className="self-end" type="submit">Transferă</Button>
            </form>
          ) : null}
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Dată</th><th className="px-3 py-2">Material</th><th className="px-3 py-2">Cantitate</th><th className="px-3 py-2">De la</th><th className="px-3 py-2">Către</th><th className="px-3 py-2">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {pagedTransfers.length ? pagedTransfers.map(item => <tr key={item.uuid || item.id}><td className="px-3 py-2">{String(item.created_at || '').slice(0, 10)}</td><td className="px-3 py-2">{item.materialName || item.material_id}</td><td className="px-3 py-2">{item.cantitate} {item.unit}</td><td className="px-3 py-2">{item.from_department || 'central'}</td><td className="px-3 py-2">{item.to_department}</td><td className="px-3 py-2"><Badge tone={item.status === 'aprobat' ? 'success' : 'warning'}>{item.status}</Badge></td></tr>) : <EmptyRow colSpan={6} loading={loading} />}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={transfers.length} onPage={setPage} />
        </Card>
      ) : null}

      {activeTab === 'Consum pe lucrări' ? (
        <Card>
          <h3 className="mb-3 text-base font-semibold text-slate-900">Consum materiale din stoc propriu</h3>
          <form className="grid gap-3 md:grid-cols-5" onSubmit={submitConsumption}>
            <Select label="Material" value={consumptionForm.material_id} onChange={event => setConsumptionForm({ ...consumptionForm, material_id: event.target.value })} options={materials.map(material => ({ value: material.id, label: materialName(material) }))} />
            <Input label="Cantitate" type="number" step="0.001" value={consumptionForm.cantitate} onChange={event => setConsumptionForm({ ...consumptionForm, cantitate: event.target.value })} />
            <Input label="Lucrare" value={consumptionForm.lucrare_id} onChange={event => setConsumptionForm({ ...consumptionForm, lucrare_id: event.target.value })} />
            <Input label="Motiv" value={consumptionForm.motiv} onChange={event => setConsumptionForm({ ...consumptionForm, motiv: event.target.value })} />
            <Button className="self-end" type="submit">Înregistrează consum</Button>
          </form>
        </Card>
      ) : null}

      {activeTab === 'Mișcări' ? (
        <Card>
          <h3 className="mb-3 text-base font-semibold text-slate-900">Mișcări stoc</h3>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Dată</th>
                  <th className="px-3 py-2">Material</th>
                  <th className="px-3 py-2">Tip</th>
                  <th className="px-3 py-2">Cantitate</th>
                  <th className="px-3 py-2">Motiv</th>
                  <th className="px-3 py-2">Operator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedMovements.length ? pagedMovements.map(item => (
                  <tr key={item.id}>
                    <td className="px-3 py-2">{item.date || item.data}</td>
                    <td className="px-3 py-2">{item.materialName || item.material || '-'}</td>
                    <td className="px-3 py-2">{movementTypeLabel(item.type, item.amount)}</td>
                    <td className="px-3 py-2">{Number(item.amount || item.cantitate || 0).toLocaleString('ro-RO')} {item.unit || item.um || ''}</td>
                    <td className="px-3 py-2">{item.note || item.reason || item.motiv || '-'}</td>
                    <td className="px-3 py-2">{item.createdByName || item.operatorName || item.operator || '-'}</td>
                  </tr>
                )) : <EmptyRow colSpan={6} loading={loading} />}
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            <Pager page={page} total={filteredMovements.length} onPage={setPage} />
          </div>
        </Card>
      ) : null}

      {activeTab === 'Livrări' ? (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Livrări</h3>
            <Button onClick={() => setModalOpen(true)}>Înregistrează livrare nouă</Button>
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Dată</th>
                  <th className="px-3 py-2">Furnizor</th>
                  <th className="px-3 py-2">Materiale</th>
                  <th className="px-3 py-2">Cantitate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedDeliveries.length ? pagedDeliveries.map(item => (
                  <tr key={item.id}>
                    <td className="px-3 py-2">{item.date || item.data}</td>
                    <td className="px-3 py-2">{item.supplier || item.furnizor || '-'}</td>
                    <td className="px-3 py-2">{item.materialName || item.material || '-'}</td>
                    <td className="px-3 py-2">{Number(item.amount || item.cantitate || 0).toLocaleString('ro-RO')} {item.unit || item.um || ''}</td>
                  </tr>
                )) : <EmptyRow colSpan={4} loading={loading} />}
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            <Pager page={page} total={filteredDeliveries.length} onPage={setPage} />
          </div>
        </Card>
      ) : null}

      <Modal open={modalOpen} title="Înregistrează livrare nouă" onClose={() => setModalOpen(false)}>
        <form className="grid gap-4" onSubmit={submitDelivery}>
          <Input label="Dată" type="date" value={deliveryForm.date} onChange={event => setDeliveryForm({ ...deliveryForm, date: event.target.value })} required />
          <Select
            label="Material"
            value={deliveryForm.materialId}
            onChange={event => setDeliveryForm({ ...deliveryForm, materialId: event.target.value })}
            options={materials.map(material => ({ value: material.id, label: materialName(material) }))}
            required
          />
          <Input label="Cantitate" type="number" min="0" step="0.001" value={deliveryForm.amount} onChange={event => setDeliveryForm({ ...deliveryForm, amount: event.target.value })} required />
          <Input label="Furnizor" value={deliveryForm.supplier} onChange={event => setDeliveryForm({ ...deliveryForm, supplier: event.target.value })} />
          <Input label="Document" value={deliveryForm.document} onChange={event => setDeliveryForm({ ...deliveryForm, document: event.target.value })} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Renunță</Button>
            <Button type="submit">Salvează</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
