import { useEffect, useMemo, useState } from 'react'
import api from '../../api/client'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Modal from '../../components/ui/Modal'
import Badge from '../../components/ui/Badge'
import IntersoftPage from './IntersoftPage'

const tabs = ['Lucrări', 'Comenzi de lucru', 'Vânzări asfalt', 'Clienți', 'Rapoarte', 'Intersoft']
const pageSize = 10

function today() {
  return new Date().toISOString().slice(0, 10)
}

function monthStart() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
}

function arrayFrom(data, keys) {
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key]
  }
  return []
}

function money(value) {
  return Number(value || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

export default function TehnicPage() {
  const [activeTab, setActiveTab] = useState('Lucrări')
  const [workLogs, setWorkLogs] = useState([])
  const [sales, setSales] = useState([])
  const [clients, setClients] = useState([])
  const [assets, setAssets] = useState([])
  const [costCenters, setCostCenters] = useState([])
  const [recipes, setRecipes] = useState([])
  const [workOrders, setWorkOrders] = useState([])
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState('')
  const [period, setPeriod] = useState({ from: monthStart(), to: today() })
  const [workForm, setWorkForm] = useState({ date: today(), assetId: '', costCenterId: '', jobName: '', hours: '', operatorName: '' })
  const [saleForm, setSaleForm] = useState({ date: today(), clientId: '', client: '', recipeId: '', amount: '', documentNo: '', vehicleNo: '' })
  const [clientForm, setClientForm] = useState({ name: '', cif: '', address: '', contact: '', phone: '', email: '' })
  const [orderForm, setOrderForm] = useState({ titlu: '', descriere: '', tip: 'lucrare', data_termen: '', departamente: 'mecanizare, asfalt' })

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [workRes, salesRes, clientsRes, assetsRes, costsRes, recipesRes, ordersRes] = await Promise.all([
        api.get('/technical/work-logs', { params: period }),
        api.get('/technical/asphalt-sales', { params: period }),
        api.get('/technical/clients'),
        api.get('/fleet-assets').catch(() => ({ data: { assets: [] } })),
        api.get('/cost-centers').catch(() => ({ data: { costCenters: [] } })),
        api.get('/recipes').catch(() => ({ data: { recipes: [] } })),
        api.get('/work/orders').catch(() => ({ data: { orders: [] } })),
      ])
      const nextAssets = arrayFrom(assetsRes.data, ['assets'])
      const nextCosts = arrayFrom(costsRes.data, ['costCenters', 'centers'])
      const nextClients = arrayFrom(clientsRes.data, ['clients'])
      const nextRecipes = arrayFrom(recipesRes.data, ['recipes'])
      setWorkLogs(arrayFrom(workRes.data, ['workLogs']))
      setSales(arrayFrom(salesRes.data, ['sales']))
      setClients(nextClients)
      setAssets(nextAssets)
      setCostCenters(nextCosts)
      setRecipes(nextRecipes)
      setWorkOrders(arrayFrom(ordersRes.data, ['orders']))
      setWorkForm(current => ({ ...current, assetId: current.assetId || nextAssets[0]?.id || '', costCenterId: current.costCenterId || nextCosts[0]?.id || '' }))
      setSaleForm(current => ({ ...current, clientId: current.clientId || nextClients[0]?.id || '', recipeId: current.recipeId || nextRecipes[0]?.id || '' }))
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut incarca datele tehnice.')
    } finally {
      setLoading(false)
    }
  }

  async function loadReport() {
    setError('')
    try {
      const response = await api.get('/technical/report', { params: period })
      setReport(response.data.report || response.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Raportul tehnic nu a putut fi incarcat.')
    }
  }

  useEffect(() => {
    Promise.resolve().then(() => load())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    Promise.resolve().then(() => setPage(1))
  }, [activeTab])

  const pagedWorkLogs = workLogs.slice((page - 1) * pageSize, page * pageSize)
  const pagedWorkOrders = workOrders.slice((page - 1) * pageSize, page * pageSize)
  const pagedSales = sales.slice((page - 1) * pageSize, page * pageSize)
  const pagedClients = clients.slice((page - 1) * pageSize, page * pageSize)

  const reportTotals = useMemo(() => {
    if (!report) return { hours: 0, salesAmount: 0, salesValue: 0 }
    return {
      hours: report.metrics?.workHours || report.totalHours || workLogs.reduce((sum, item) => sum + Number(item.hours || 0), 0),
      salesAmount: report.metrics?.salesAmount || sales.reduce((sum, item) => sum + Number(item.amount || 0), 0),
      salesValue: report.metrics?.salesValue || sales.reduce((sum, item) => sum + Number(item.value || item.valoare || 0), 0),
    }
  }, [report, sales, workLogs])

  async function submitWork(event) {
    event.preventDefault()
    setError('')
    try {
      await api.post('/technical/work-logs', workForm)
      setModal('')
      setWorkForm(current => ({ ...current, jobName: '', hours: '', operatorName: '' }))
      setMessage('Lucrarea a fost salvată.')
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Lucrarea nu a putut fi salvată.')
    }
  }

  async function submitSale(event) {
    event.preventDefault()
    setError('')
    try {
      await api.post('/technical/asphalt-sales', saleForm)
      setModal('')
      setSaleForm(current => ({ ...current, amount: '', documentNo: '', vehicleNo: '' }))
      setMessage('Vânzarea a fost salvată.')
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Vânzarea nu a putut fi salvată.')
    }
  }

  async function submitClient(event) {
    event.preventDefault()
    setError('')
    try {
      await api.post('/technical/clients', clientForm)
      setModal('')
      setClientForm({ name: '', cif: '', address: '', contact: '', phone: '', email: '' })
      setMessage('Clientul a fost salvat.')
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Clientul nu a putut fi salvat.')
    }
  }

  async function submitOrder(event) {
    event.preventDefault()
    setError('')
    try {
      await api.post('/work/orders', { ...orderForm, departamente: orderForm.departamente.split(',').map(item => item.trim()).filter(Boolean) })
      setModal('')
      setOrderForm({ titlu: '', descriere: '', tip: 'lucrare', data_termen: '', departamente: 'mecanizare, asfalt' })
      setMessage('Comanda de lucru a fost creată.')
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Comanda de lucru nu a putut fi creată.')
    }
  }

  async function updateDepartmentStatus(order, department, status) {
    await api.patch(`/work/orders/${order.uuid}/department-status`, { department_cod: department.department_cod, status })
    await load()
  }

  async function lookupAnaf() {
    if (!clientForm.cif) return
    setError('')
    try {
      const response = await api.get('/technical/clients/lookup-cif', { params: { cif: clientForm.cif } })
      const data = response.data.client || response.data
      setClientForm(current => ({
        ...current,
        name: data.name || data.denumire || current.name,
        address: data.address || data.adresa || current.address,
      }))
    } catch (err) {
      setError(err.response?.data?.error || 'Căutarea ANAF nu a returnat date.')
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Tehnic</h2>
          <p className="text-sm text-slate-500">Lucrări, vânzări asfalt, clienți și rapoarte.</p>
        </div>
        {!['Rapoarte', 'Intersoft'].includes(activeTab) && <Button onClick={() => setModal(activeTab)}>{activeTab === 'Lucrări' ? 'Lucrare nouă' : activeTab === 'Comenzi de lucru' ? 'Comandă nouă' : activeTab === 'Vânzări asfalt' ? 'Vânzare nouă' : 'Client nou'}</Button>}
      </div>

      {message && <div className="rounded-md bg-primary-50 px-3 py-2 text-sm text-primary-700">{message}</div>}
      {error && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      <Card>
        <div className="flex flex-wrap gap-2">
          {tabs.map(tab => <Button key={tab} variant={activeTab === tab ? 'primary' : 'secondary'} onClick={() => setActiveTab(tab)}>{tab}</Button>)}
        </div>
      </Card>

      {activeTab === 'Lucrări' && (
        <Card>
          <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-slate-900">Lucrări</h3><Button onClick={() => setModal('Lucrări')}>Lucrare nouă</Button></div>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Dată</th><th className="px-3 py-2">Șantier</th><th className="px-3 py-2">Descriere</th><th className="px-3 py-2">Ore</th><th className="px-3 py-2">Operator</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {pagedWorkLogs.length ? pagedWorkLogs.map(item => <tr key={item.id}><td className="px-3 py-2">{item.date}</td><td className="px-3 py-2">{item.jobName || '-'}</td><td className="px-3 py-2">{item.note || item.assetName || '-'}</td><td className="px-3 py-2">{item.hours || 0}</td><td className="px-3 py-2">{item.operatorName || item.createdByName || '-'}</td></tr>) : <EmptyRow colSpan={5} loading={loading} />}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={workLogs.length} onPage={setPage} />
        </Card>
      )}

      {activeTab === 'Vânzări asfalt' && (
        <Card>
          <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-slate-900">Vânzări asfalt</h3><Button onClick={() => setModal('Vânzări asfalt')}>Vânzare nouă</Button></div>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Dată</th><th className="px-3 py-2">Client</th><th className="px-3 py-2">Rețetă</th><th className="px-3 py-2">Cantitate</th><th className="px-3 py-2">Valoare</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {pagedSales.length ? pagedSales.map(item => <tr key={item.id}><td className="px-3 py-2">{item.date}</td><td className="px-3 py-2">{item.client || '-'}</td><td className="px-3 py-2">{item.recipeName || '-'}</td><td className="px-3 py-2">{item.amount || 0} t</td><td className="px-3 py-2">{money(item.value || item.valoare)} RON</td></tr>) : <EmptyRow colSpan={5} loading={loading} />}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={sales.length} onPage={setPage} />
        </Card>
      )}

      {activeTab === 'Comenzi de lucru' && (
        <Card>
          <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-slate-900">Comenzi de lucru</h3><Button onClick={() => setModal('Comenzi de lucru')}>Comandă nouă</Button></div>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Titlu</th><th className="px-3 py-2">Termen</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Departamente</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {pagedWorkOrders.length ? pagedWorkOrders.map(order => <tr key={order.uuid}><td className="px-3 py-2 font-medium">{order.titlu}</td><td className="px-3 py-2">{order.data_termen || '-'}</td><td className="px-3 py-2"><Badge tone={order.status === 'finalizat' ? 'success' : 'warning'}>{order.status}</Badge></td><td className="px-3 py-2"><div className="grid gap-2">{(order.departamente || []).map(dept => <div key={dept.id} className="flex flex-wrap items-center gap-2"><span>{dept.department_cod}</span><Badge tone={dept.status === 'finalizat' ? 'success' : 'neutral'}>{dept.status}</Badge><Button size="sm" variant="secondary" onClick={() => updateDepartmentStatus(order, dept, 'finalizat')}>Finalizez</Button></div>)}</div></td></tr>) : <EmptyRow colSpan={4} loading={loading} />}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={workOrders.length} onPage={setPage} />
        </Card>
      )}

      {activeTab === 'Clienți' && (
        <Card>
          <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-slate-900">Clienți</h3><Button onClick={() => setModal('Clienți')}>Client nou</Button></div>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Denumire</th><th className="px-3 py-2">CUI</th><th className="px-3 py-2">Adresă</th><th className="px-3 py-2">Contact</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {pagedClients.length ? pagedClients.map(item => <tr key={item.id}><td className="px-3 py-2">{item.name}</td><td className="px-3 py-2">{item.cif || '-'}</td><td className="px-3 py-2">{item.address || '-'}</td><td className="px-3 py-2">{item.contact || item.phone || item.email || '-'}</td></tr>) : <EmptyRow colSpan={4} loading={loading} />}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={clients.length} onPage={setPage} />
        </Card>
      )}

      {activeTab === 'Rapoarte' && (
        <Card title="Raport tehnic">
          <div className="grid gap-3 md:grid-cols-4">
            <Input label="De la" type="date" value={period.from} onChange={event => setPeriod({ ...period, from: event.target.value })} />
            <Input label="Până la" type="date" value={period.to} onChange={event => setPeriod({ ...period, to: event.target.value })} />
            <div className="flex items-end"><Button onClick={loadReport}>Generează raport</Button></div>
            <div className="flex items-end"><Button variant="secondary" onClick={() => window.open(`/api/exports/technical-report.xlsx?from=${period.from}&to=${period.to}`, '_blank')}>Export Excel</Button></div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-4"><div className="text-sm text-slate-500">Ore lucrate</div><div className="text-2xl font-semibold">{reportTotals.hours}</div></div>
            <div className="rounded-lg bg-slate-50 p-4"><div className="text-sm text-slate-500">Asfalt vândut</div><div className="text-2xl font-semibold">{reportTotals.salesAmount} t</div></div>
            <div className="rounded-lg bg-slate-50 p-4"><div className="text-sm text-slate-500">Valoare</div><div className="text-2xl font-semibold">{money(reportTotals.salesValue)} RON</div></div>
          </div>
        </Card>
      )}

      {activeTab === 'Intersoft' && <IntersoftPage />}

      <Modal open={modal === 'Lucrări'} title="Lucrare nouă" onClose={() => setModal('')}>
        <form className="grid gap-3" onSubmit={submitWork}>
          <Input label="Dată" type="date" value={workForm.date} onChange={event => setWorkForm({ ...workForm, date: event.target.value })} />
          <Select label="Utilaj" value={workForm.assetId} onChange={event => setWorkForm({ ...workForm, assetId: event.target.value })} options={assets.map(asset => ({ value: asset.id, label: asset.registration || asset.name }))} />
          <Select label="Centru cost" value={workForm.costCenterId} onChange={event => setWorkForm({ ...workForm, costCenterId: event.target.value })} options={costCenters.map(center => ({ value: center.id, label: center.name || center.denumire || center.code }))} />
          <Input label="Șantier" value={workForm.jobName} onChange={event => setWorkForm({ ...workForm, jobName: event.target.value })} required />
          <Input label="Ore" type="number" min="0" step="0.25" value={workForm.hours} onChange={event => setWorkForm({ ...workForm, hours: event.target.value })} required />
          <Input label="Operator" value={workForm.operatorName} onChange={event => setWorkForm({ ...workForm, operatorName: event.target.value })} />
          <Button type="submit">Salvează lucrare</Button>
        </form>
      </Modal>

      <Modal open={modal === 'Vânzări asfalt'} title="Vânzare nouă" onClose={() => setModal('')}>
        <form className="grid gap-3" onSubmit={submitSale}>
          <Input label="Dată" type="date" value={saleForm.date} onChange={event => setSaleForm({ ...saleForm, date: event.target.value })} />
          <Select label="Client" value={saleForm.clientId} onChange={event => setSaleForm({ ...saleForm, clientId: event.target.value })} options={[{ value: '', label: 'Client liber' }, ...clients.map(client => ({ value: client.id, label: client.name }))]} />
          <Input label="Client liber" value={saleForm.client} onChange={event => setSaleForm({ ...saleForm, client: event.target.value })} />
          <Select label="Rețetă" value={saleForm.recipeId} onChange={event => setSaleForm({ ...saleForm, recipeId: event.target.value })} options={recipes.map(recipe => ({ value: recipe.id, label: recipe.name }))} />
          <Input label="Cantitate tone" type="number" min="0" step="0.01" value={saleForm.amount} onChange={event => setSaleForm({ ...saleForm, amount: event.target.value })} required />
          <Input label="Document" value={saleForm.documentNo} onChange={event => setSaleForm({ ...saleForm, documentNo: event.target.value })} />
          <Input label="Auto" value={saleForm.vehicleNo} onChange={event => setSaleForm({ ...saleForm, vehicleNo: event.target.value })} />
          <Button type="submit">Salvează vânzare</Button>
        </form>
      </Modal>

      <Modal open={modal === 'Comenzi de lucru'} title="Comandă de lucru nouă" onClose={() => setModal('')}>
        <form className="grid gap-3" onSubmit={submitOrder}>
          <Input label="Titlu" value={orderForm.titlu} onChange={event => setOrderForm({ ...orderForm, titlu: event.target.value })} required />
          <Input label="Descriere" value={orderForm.descriere} onChange={event => setOrderForm({ ...orderForm, descriere: event.target.value })} />
          <Input label="Tip" value={orderForm.tip} onChange={event => setOrderForm({ ...orderForm, tip: event.target.value })} />
          <Input label="Termen" type="date" value={orderForm.data_termen} onChange={event => setOrderForm({ ...orderForm, data_termen: event.target.value })} />
          <Input label="Departamente implicate (separate prin virgulă)" value={orderForm.departamente} onChange={event => setOrderForm({ ...orderForm, departamente: event.target.value })} />
          <Button type="submit">Creează comandă</Button>
        </form>
      </Modal>

      <Modal open={modal === 'Clienți'} title="Client nou" onClose={() => setModal('')}>
        <form className="grid gap-3" onSubmit={submitClient}>
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <Input label="CUI" value={clientForm.cif} onChange={event => setClientForm({ ...clientForm, cif: event.target.value })} />
            <div className="flex items-end"><Button type="button" variant="secondary" onClick={lookupAnaf}>🔍 Caută ANAF</Button></div>
          </div>
          <Input label="Denumire" value={clientForm.name} onChange={event => setClientForm({ ...clientForm, name: event.target.value })} required />
          <Input label="Adresă" value={clientForm.address} onChange={event => setClientForm({ ...clientForm, address: event.target.value })} />
          <Input label="Contact" value={clientForm.contact} onChange={event => setClientForm({ ...clientForm, contact: event.target.value })} />
          <Input label="Telefon" value={clientForm.phone} onChange={event => setClientForm({ ...clientForm, phone: event.target.value })} />
          <Input label="Email" value={clientForm.email} onChange={event => setClientForm({ ...clientForm, email: event.target.value })} />
          <Button type="submit">Salvează client</Button>
        </form>
      </Modal>
    </div>
  )
}
