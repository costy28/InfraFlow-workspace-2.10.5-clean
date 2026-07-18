import { useEffect, useMemo, useState } from 'react'
import api from '../../api/client'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import CPVSelector from '../../components/forms/CPVSelector'
import ContextHelp from '../../components/ui/ContextHelp'

const tabs = ['Comenzi', 'Recepții', 'Cerințe', 'Cântar', 'Plan anual']
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

function contractLabel(contract) {
  return [contract.numar, contract.titlu].filter(Boolean).join(' — ') || contract.id
}

function procedureFor(value) {
  const amount = Number(value || 0)
  if (amount < 135060) return 'Achizitie directa'
  if (amount <= 668280) return 'Procedura simplificata'
  return 'Licitatie deschisa'
}

function progressClass(percent) {
  if (percent > 100) return 'bg-rose-700'
  if (percent > 90) return 'bg-rose-500'
  if (percent >= 50) return 'bg-amber-400'
  return 'bg-emerald-500'
}

function emptyPaap(year) {
  return {
    an: year, cpv_cod: '', material: '', um: '', cantitate: '', valoare_estimata: '', valoare_executata: 0,
    procedura: 'Achizitie directa', trimestru: 1, sursa: 'manual', responsabil_achizitie: '', curs_bnr_eur: 5,
    data_estimata_incepere: '', data_estimata_finalizare: '', modalitate_finantare: 'Alte fonduri',
    obiectiv_strategie_locala: '', modalitate_desfasurare: 'Online', unitate_responsabila: '',
  }
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
  const [receipts, setReceipts] = useState([])
  const [requirements, setRequirements] = useState([])
  const [scaleStatus, setScaleStatus] = useState(null)
  const [tickets, setTickets] = useState([])
  const [productMap, setProductMap] = useState([])
  const [materials, setMaterials] = useState([])
  const [contracts, setContracts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [receiveOrder, setReceiveOrder] = useState(null)
  const [returnReceipt, setReturnReceipt] = useState(null)
  const [materialModal, setMaterialModal] = useState(false)
  const [planYear, setPlanYear] = useState(new Date().getFullYear() + 1)
  const [planRows, setPlanRows] = useState([])
  const [paapModal, setPaapModal] = useState(false)
  const [paapEditing, setPaapEditing] = useState(null)
  const [paapForm, setPaapForm] = useState(emptyPaap(new Date().getFullYear() + 1))
  const [receiveForm, setReceiveForm] = useState({ nr_aviz: '', data_receptie: today(), contract_id: '', observatii: '', linii: [] })
  const [returnForm, setReturnForm] = useState({ data: today(), motiv: '', linii: [] })
  const [materialForm, setMaterialForm] = useState({ cod: '', denumire: '', um: 'kg', categorie: 'materie_prima', stoc_minim: '', pret_unitar: '', cod_cpv: '', furnizor_implicit: '' })
  const [form, setForm] = useState({
    date: today(),
    supplier: '',
    materialId: '',
    amount: '',
    unitPrice: '',
    cpv_cod: '',
    orderNo: '',
    expectedDate: '',
    contract_id: '',
    note: '',
  })

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [ordersRes, requirementsRes, scaleRes, ticketsRes, productMapRes, materialsRes, contractsRes] = await Promise.all([
        api.get('/procurement-orders'),
        api.get('/procurement-requirements'),
        api.get('/scale/status'),
        api.get('/scale/tickets').catch(() => ({ data: { tickets: [] } })),
        api.get('/scale/product-map').catch(() => ({ data: { productMap: {} } })),
        api.get('/materials').catch(() => ({ data: {} })),
        api.get('/contracts').catch(() => ({ data: { contracts: [] } })),
      ])

      setOrders(arrayFrom(ordersRes.data, ['orders', 'items', 'data']))
      setReceipts(arrayFrom(ordersRes.data, ['receipts']))
      setRequirements(arrayFrom(requirementsRes.data, ['requirements', 'items', 'data']))
      setScaleStatus(scaleRes.data || null)
      setTickets(arrayFrom(ticketsRes.data, ['tickets', 'items', 'scaleTickets', 'data']))
      setProductMap(Object.entries(productMapRes.data?.productMap || {}).map(([product, materialId]) => ({ product, materialId })))
      setMaterials(arrayFrom(materialsRes.data, ['materials', 'items', 'data']))
      setContracts(arrayFrom(contractsRes.data, ['contracts', 'items', 'data']))
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
  const pagedReceipts = useMemo(() => receipts.slice((page - 1) * pageSize, page * pageSize), [receipts, page])
  const pagedRequirements = useMemo(() => requirements.slice((page - 1) * pageSize, page * pageSize), [requirements, page])
  const pagedTickets = useMemo(() => tickets.slice((page - 1) * pageSize, page * pageSize), [tickets, page])
  const contractOptions = useMemo(() => [
    { value: '', label: 'Fără contract urmărit' },
    ...contracts
      .filter(contract => !contract.cancelled_at && !contract.cancelledAt)
      .map(contract => ({ value: contract.id, label: contractLabel(contract) })),
  ], [contracts])
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
          pret: Number(form.unitPrice || 0),
          cpv_cod: form.cpv_cod,
        }],
        materialId: form.materialId,
        amount: Number(form.amount || 0),
        orderNo: form.orderNo,
        nr_comanda: form.orderNo,
        expectedDate: form.expectedDate || null,
        data_livrare_estimata: form.expectedDate || null,
        contract_id: form.contract_id || null,
        note: form.note,
        observatii: form.note,
      })
      setMessage('Comanda a fost salvată.')
      setModalOpen(false)
      setForm({ date: today(), supplier: '', materialId: '', amount: '', unitPrice: '', cpv_cod: '', orderNo: '', expectedDate: '', contract_id: '', note: '' })
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
      contract_id: order.contract_id || order.contractId || '',
      observatii: '',
      linii: lines.map(line => ({
        material_id: line.material_id || line.materialId,
        materialName: line.materialName,
        cantitate: Number(line.cantitate || line.amount || 0),
        cantitate_ramasa: Number(line.cantitate_ramasa ?? line.remainingAmount ?? line.cantitate ?? line.amount ?? 0),
        cantitate_receptionata: Number(line.cantitate_ramasa ?? line.remainingAmount ?? line.cantitate ?? line.amount ?? 0),
        pret_unitar: Number(line.pret ?? line.unitPrice ?? 0),
        cota_tva: 21,
        unit: line.unit,
      })),
    })
  }

  function printOrder(order) {
    const token = encodeURIComponent(localStorage.getItem('infraflow_token') || '')
    window.open(`/api/procurement-orders/${order.uuid || order.id}/pdf?token=${token}`, '_blank', 'noopener,noreferrer')
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

  function openReturn(receipt) {
    const lines = (receipt.lines || []).map(line => {
      const received = Number(line.cantitate_receptionata || line.cantitate || 0)
      const returned = Number(line.cantitate_returnata || 0)
      return {
        material_id: line.material_id || line.materialId,
        materialName: line.materialName || line.denumire || 'Material',
        unit: line.unit || line.um || '',
        disponibil: Math.max(0, received - returned),
        cantitate: 0,
      }
    }).filter(line => line.disponibil > 0)
    setReturnReceipt(receipt)
    setReturnForm({ data: today(), motiv: '', linii: lines })
  }

  async function submitReturn(event) {
    event.preventDefault()
    if (!returnReceipt) return
    const lines = returnForm.linii.filter(line => Number(line.cantitate || 0) > 0)
    if (!lines.length) {
      setError('Completează cantitatea returnată pentru cel puțin un material.')
      return
    }
    setError('')
    setMessage('')
    try {
      const response = await api.post(`/procurement-receipts/${returnReceipt.id}/return`, {
        data: returnForm.data,
        motiv: returnForm.motiv,
        linii: lines.map(line => ({ material_id: line.material_id, cantitate: Number(line.cantitate) })),
      })
      const warning = response.data?.warning ? ` ${response.data.warning}` : ''
      setMessage(`Returul de ${money(response.data?.returnRecord?.total)} RON a fost înregistrat.${warning}`)
      setReturnReceipt(null)
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Returul nu a putut fi înregistrat.')
    }
  }

  async function loadPlan() {
    const response = await api.get('/paap', { params: { an: planYear } })
    setPlanRows(response.data.paap || [])
  }

  useEffect(() => {
    if (activeTab === 'Plan anual') Promise.resolve().then(loadPlan)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, planYear])

  async function generatePlan() {
    if (!window.confirm(`Generezi pozițiile PAAP ${planYear} din comenzile ${planYear - 1}, cu inflație 5%?`)) return
    const response = await api.post('/paap/genereaza-din-istoric', { an: planYear })
    setMessage(`Au fost generate ${response.data.paap?.length || 0} poziții PAAP.`)
    await loadPlan()
  }

  function openPaap(item = null) {
    setPaapEditing(item)
    setPaapForm(item ? { ...item } : emptyPaap(planYear))
    setPaapModal(true)
  }

  async function savePaap(event) {
    event.preventDefault()
    if (paapEditing) await api.put(`/paap/${paapEditing.id}`, paapForm)
    else await api.post('/paap', paapForm)
    setPaapModal(false)
    setMessage(paapEditing ? 'Poziția PAAP a fost actualizată.' : 'Poziția PAAP a fost adăugată.')
    await loadPlan()
  }

  async function removePaap(item) {
    if (!window.confirm(`Anulezi poziția ${item.cpv_cod} / ${item.material}?`)) return
    await api.delete(`/paap/${item.id}`, { data: { reason: 'Anulare din interfața Plan anual' } })
    setMessage('Poziția PAAP a fost anulată.')
    await loadPlan()
  }

  const scaleConnected = !!(scaleStatus?.connected || scaleStatus?.ok || scaleStatus?.available || scaleStatus?.status === 'connected' || scaleStatus?.readable)
  const procurementHelp = useMemo(() => {
    const closedOrderStatuses = ['received', 'livrata', 'finalizata', 'ok', 'receptionata', 'closed', 'canceled', 'anulata', 'respinsa']
    const closedRequirementStatuses = ['done', 'closed', 'finalizata', 'aprobata', 'respinsa', 'anulata']
    const openOrders = orders.filter(order => !closedOrderStatuses.includes(String(order.status || '').toLowerCase())).length
    const pendingRequirements = requirements.filter(item => !closedRequirementStatuses.includes(String(item.status || '').toLowerCase())).length
    const mappedProducts = productMap.filter(row => row.materialId).length
    const hasScaleTickets = tickets.length > 0
    const riskyPaapRows = planRows.filter(row => {
      const percent = Number(row.procent ?? row.percent ?? row.progress ?? 0)
      const planned = Number(row.valoare_estimata || row.estimatedValue || 0)
      const executed = Number(row.valoare_executata || row.executedValue || 0)
      return percent > 90 || (planned > 0 && executed > planned)
    }).length
    const steps = [
      {
        key: 'requirements',
        label: `Cerințe · ${pendingRequirements}`,
        hint: 'Pornește comenzile din necesarul intern și prioritizează ce e urgent.',
        done: pendingRequirements === 0,
        onClick: () => selectTab('Cerințe'),
      },
      {
        key: 'orders',
        label: `Comenzi deschise · ${openOrders}`,
        hint: 'Urmărește comenzile până la recepție sau anulare.',
        done: orders.length > 0 && openOrders === 0,
        onClick: () => selectTab('Comenzi'),
      },
      {
        key: 'receipts',
        label: `Recepții · ${receipts.length}`,
        hint: 'Recepția este pasul care actualizează stocul și documentele de achiziție.',
        done: receipts.length > 0,
        onClick: () => selectTab('Recepții'),
      },
      {
        key: 'scale',
        label: hasScaleTickets ? (scaleConnected ? `Cântar mapat · ${mappedProducts}` : 'Cântar neverificat') : 'Cântar opțional',
        hint: hasScaleTickets ? 'Mapează produsele de cântar pe materiale ca intrările să fie curate.' : 'Configurează cântarul doar dacă acest flux este folosit de client.',
        done: !hasScaleTickets || (scaleConnected && mappedProducts > 0),
        onClick: () => selectTab('Cântar'),
      },
      {
        key: 'paap',
        label: riskyPaapRows ? `PAAP atenție · ${riskyPaapRows}` : 'PAAP fără depășiri',
        hint: 'Verifică planul anual când execuția se apropie de plafon.',
        done: riskyPaapRows === 0,
        onClick: () => selectTab('Plan anual'),
      },
    ]
    const nextStep = steps.find(step => !step.done) || steps[0]
    return {
      steps,
      nextAction: nextStep ? {
        label: nextStep.key === 'orders' && !orders.length ? 'Creează comandă' : 'Deschide recomandarea',
        onClick: nextStep.key === 'orders' && !orders.length ? () => setModalOpen(true) : nextStep.onClick,
        variant: 'secondary',
      } : null,
      tone: pendingRequirements || openOrders || riskyPaapRows || (hasScaleTickets && !scaleConnected) ? 'warning' : 'success',
    }
  }, [orders, requirements, receipts.length, productMap, tickets.length, planRows, scaleConnected])

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Achiziții</h1>
          <p className="text-sm text-slate-500">Comenzi, cerințe de aprovizionare și tichete de cântar.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>Comandă nouă</Button>
      </div>

      <ContextHelp
        eyebrow="Ghid achiziții"
        title="Ține firul: necesar intern → comandă → recepție → PAAP"
        description="Pentru o evidență comercială curată, comenzile trebuie legate de cerințe, recepțiile trebuie confirmate la timp, iar planul anual trebuie verificat înainte de depășiri."
        icon="🛒"
        tone={procurementHelp.tone}
        steps={procurementHelp.steps}
        tips={[
          'Recepția este momentul în care stocul devine real în aplicație.',
          'Pozițiile PAAP peste 90% merită verificate înainte de o comandă nouă.',
          'Cântarul ajută doar dacă produsele lui sunt mapate corect pe materiale.',
        ]}
        nextAction={procurementHelp.nextAction}
        compact
      />

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
                  <th className="px-3 py-2">Contract</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Valoare</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedOrders.length === 0 ? <EmptyRow colSpan={7} loading={loading} /> : pagedOrders.map(order => {
                  const status = orderStatusInfo(order.status)
                  const value = order.value || order.valoare || order.total || Number(order.amount || 0) * Number(order.unitPrice || order.pret_unitar || 0)
                  return (
                    <tr key={order.id || order.uuid || `${order.date}-${order.supplier}`} className="hover:bg-slate-50">
                      <td className="px-3 py-3">{dateValue(order.date || order.data || order.createdAt)}</td>
                      <td className="px-3 py-3 font-medium text-slate-800">{order.supplier || order.supplierName || order.furnizor || '-'}</td>
                      <td className="px-3 py-3">{order.materialName || order.material || order.materiale || order.itemsSummary || '-'}</td>
                      <td className="px-3 py-3 text-xs">{order.contract_numar ? <Badge tone="info">{order.contract_numar}</Badge> : '—'}</td>
                      <td className="px-3 py-3"><Badge variant={status.variant}>{status.label}</Badge></td>
                      <td className="px-3 py-3 text-right">{money(value)} RON</td>
                      <td className="px-3 py-3 text-right"><div className="flex justify-end gap-1"><Button size="sm" variant="secondary" onClick={() => printOrder(order)}>🖨️ Tipărește</Button>{['emisa', 'partial', 'open'].includes(String(order.status)) ? <Button size="sm" variant="secondary" onClick={() => openReceive(order)}>📦 Recepționează</Button> : null}</div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={orders.length} onPage={setPage} />
        </Card>
      )}

      {activeTab === 'Recepții' && (
        <Card title="Recepții furnizori" subtitle="NIR-uri, legătura cu factura și retururile către furnizor." loading={loading}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr><th className="px-3 py-2">Data</th><th className="px-3 py-2">NIR / Aviz</th><th className="px-3 py-2">Furnizor</th><th className="px-3 py-2">Contract</th><th className="px-3 py-2 text-right">Valoare</th><th className="px-3 py-2">Contabilitate</th><th className="px-3 py-2">Retur</th><th className="px-3 py-2 text-right">Acțiuni</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedReceipts.length === 0 ? <EmptyRow colSpan={8} loading={loading} /> : pagedReceipts.map(receipt => {
                  const hasAvailable = (receipt.lines || []).some(line => Number(line.cantitate_receptionata || line.cantitate || 0) - Number(line.cantitate_returnata || 0) > 0)
                  return <tr key={receipt.id} className="hover:bg-slate-50">
                    <td className="px-3 py-3">{dateValue(receipt.date)}</td>
                    <td className="px-3 py-3 font-medium text-slate-800">{receipt.nr_nir || receipt.document || receipt.nr_aviz || receipt.id}</td>
                    <td className="px-3 py-3">{receipt.supplier || '-'}</td>
                    <td className="px-3 py-3 text-xs">{receipt.contract_numar ? <Badge tone="info">{receipt.contract_numar}</Badge> : '—'}</td>
                    <td className="px-3 py-3 text-right">{money(receipt.total)} RON</td>
                    <td className="px-3 py-3"><Badge variant={receipt.accounting_invoice_id ? 'green' : 'yellow'}>{receipt.accounting_invoice_id ? 'Factură legată' : 'Factură în așteptare'}</Badge></td>
                    <td className="px-3 py-3"><Badge variant={receipt.return_status ? 'yellow' : 'gray'}>{receipt.return_status === 'returnata_integral' ? 'Integral' : receipt.return_status === 'returnata_partial' ? 'Parțial' : 'Fără retur'}</Badge></td>
                    <td className="px-3 py-3 text-right">{hasAvailable ? <Button size="sm" variant="secondary" onClick={() => openReturn(receipt)}>Înregistrează retur</Button> : <span className="text-xs text-slate-500">Nimic disponibil</span>}</td>
                  </tr>
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={receipts.length} onPage={setPage} />
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
        <Card title="Plan anual achiziții" subtitle="Plan PAAP pe coduri CPV, cu execuție și praguri de alertare.">
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <Input label="An" type="number" value={planYear} onChange={event => setPlanYear(Number(event.target.value))} />
            <Button type="button" onClick={() => openPaap()}>+ Adaugă poziție</Button>
            <Button type="button" onClick={generatePlan}>Generează plan din istoric</Button>
            <Button type="button" variant="secondary" onClick={() => window.open(`/api/paap/raport?an=${planYear}&token=${localStorage.getItem('infraflow_token')}`, '_blank')}>Exportă Excel</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500"><tr><th className="px-3 py-2">CPV</th><th className="px-3 py-2">Material</th><th className="px-3 py-2">UM</th><th className="px-3 py-2 text-right">Cant.</th><th className="px-3 py-2 text-right">Val.Plan</th><th className="px-3 py-2 text-right">Executat</th><th className="px-3 py-2 text-right">Rămas</th><th className="px-3 py-2">%</th><th className="px-3 py-2">Procedură</th><th className="px-3 py-2">Trim.</th><th className="px-3 py-2">Acțiuni</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {planRows.length === 0 ? <EmptyRow colSpan={11} loading={false} /> : planRows.map(row => (
                  <tr key={row.id}>
                    <td className="px-3 py-2"><div className="font-medium">{row.cpv_cod}</div><div className="max-w-56 text-xs text-slate-500">{row.cpv_denumire}</div></td>
                    <td className="px-3 py-2">{row.material}</td>
                    <td className="px-3 py-2">{row.um}</td>
                    <td className="px-3 py-2 text-right">{numberValue(row.cantitate)}</td><td className="px-3 py-2 text-right">{money(row.valoare_estimata)}</td><td className="px-3 py-2 text-right">{money(row.valoare_executata)}</td><td className="px-3 py-2 text-right">{money(row.valoare_ramasa)}</td>
                    <td className="min-w-28 px-3 py-2"><div className="mb-1 text-xs font-medium">{row.procent}% {row.procent > 100 ? '⚠️' : ''}</div><div className="h-2 overflow-hidden rounded bg-slate-100"><div className={`h-full ${progressClass(row.procent)}`} style={{ width: `${Math.min(100, Number(row.procent || 0))}%` }} /></div></td>
                    <td className="px-3 py-2">{row.procedura}</td><td className="px-3 py-2">T{row.trimestru}</td><td className="px-3 py-2"><div className="flex gap-1"><Button size="sm" variant="secondary" onClick={() => openPaap(row)}>Editează</Button><Button size="sm" variant="danger" onClick={() => removePaap(row)}>Anulează</Button></div></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="border-t bg-slate-50 font-semibold"><td className="px-3 py-2" colSpan="4">Total</td><td className="px-3 py-2 text-right">{money(planRows.reduce((sum, item) => sum + Number(item.valoare_estimata || 0), 0))}</td><td className="px-3 py-2 text-right">{money(planRows.reduce((sum, item) => sum + Number(item.valoare_executata || 0), 0))}</td><td className="px-3 py-2 text-right">{money(planRows.reduce((sum, item) => sum + Number(item.valoare_ramasa || 0), 0))}</td><td colSpan="4" /></tr></tfoot>
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
              <Select label="Material" value={form.materialId} onChange={event => { const materialId = event.target.value; const material = materials.find(item => String(item.id) === String(materialId)); setForm({ ...form, materialId, cpv_cod: material?.cpv_cod || material?.cod_cpv || '' }) }}>
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
            <Input label="Preț unitar estimat (lei)" type="number" min="0" step="0.01" value={form.unitPrice} onChange={event => setForm({ ...form, unitPrice: event.target.value })} />
            <CPVSelector value={form.cpv_cod} onChange={cpv_cod => setForm({ ...form, cpv_cod })} />
            <Input label="Dată estimată livrare" type="date" value={form.expectedDate} onChange={event => setForm({ ...form, expectedDate: event.target.value })} />
            <Select label="Contract urmărit" value={form.contract_id || ''} onChange={event => setForm({ ...form, contract_id: event.target.value })} options={contractOptions} />
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
            <Select label="Contract urmărit" value={receiveForm.contract_id || ''} onChange={event => setReceiveForm({ ...receiveForm, contract_id: event.target.value })} options={contractOptions} />
          </div>
          <div className="grid gap-2">
            {receiveForm.linii.map((line, index) => (
              <div key={line.material_id} className="grid gap-2 rounded-md border border-slate-200 p-3 md:grid-cols-[1fr_130px_130px_110px] md:items-end">
                <div className="text-sm"><div className="font-medium">{line.materialName}</div><div className="text-slate-500">Comandat: {line.cantitate} {line.unit} / Rămas: {line.cantitate_ramasa} {line.unit}</div></div>
                <Input label="Primit" type="number" step="0.001" value={line.cantitate_receptionata} onChange={event => setReceiveForm(current => ({ ...current, linii: current.linii.map((item, i) => i === index ? { ...item, cantitate_receptionata: Number(event.target.value) } : item) }))} />
                <Input label="Preț unitar" type="number" min="0" step="0.01" value={line.pret_unitar} onChange={event => setReceiveForm(current => ({ ...current, linii: current.linii.map((item, i) => i === index ? { ...item, pret_unitar: Number(event.target.value) } : item) }))} />
                <Input label="TVA %" type="number" min="0" step="1" value={line.cota_tva} onChange={event => setReceiveForm(current => ({ ...current, linii: current.linii.map((item, i) => i === index ? { ...item, cota_tva: Number(event.target.value) } : item) }))} />
              </div>
            ))}
          </div>
          <Input label="Observații" value={receiveForm.observatii} onChange={event => setReceiveForm({ ...receiveForm, observatii: event.target.value })} />
          <Button type="submit">Confirmă recepția</Button>
        </form>
      </Modal>

      <Modal open={!!returnReceipt} title={`Retur ${returnReceipt?.nr_nir || returnReceipt?.document || ''}`} onClose={() => setReturnReceipt(null)} size="lg">
        <form className="grid gap-4" onSubmit={submitReturn}>
          <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Returul scade stocul și redeschide cantitatea din comandă. Dacă NIR-ul are factură legată, Contabilitatea va afișa pasul de corecție.</div>
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Data returului" type="date" value={returnForm.data} onChange={event => setReturnForm({ ...returnForm, data: event.target.value })} required />
            <Input label="Motiv" value={returnForm.motiv} onChange={event => setReturnForm({ ...returnForm, motiv: event.target.value })} required />
          </div>
          <div className="grid gap-2">
            {returnForm.linii.map((line, index) => <div key={line.material_id} className="grid gap-2 rounded-md border border-slate-200 p-3 md:grid-cols-[1fr_160px] md:items-end">
              <div className="text-sm"><div className="font-medium text-slate-800">{line.materialName}</div><div className="text-slate-500">Disponibil pentru retur: {numberValue(line.disponibil)} {line.unit}</div></div>
              <Input label="Cantitate retur" type="number" min="0" max={line.disponibil} step="0.001" value={line.cantitate} onChange={event => setReturnForm(current => ({ ...current, linii: current.linii.map((item, i) => i === index ? { ...item, cantitate: event.target.value } : item) }))} />
            </div>)}
          </div>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setReturnReceipt(null)}>Renunță</Button><Button type="submit">Confirmă returul</Button></div>
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
          <CPVSelector value={materialForm.cod_cpv} onChange={cod_cpv => setMaterialForm({ ...materialForm, cod_cpv })} />
          <Input label="Furnizor implicit" value={materialForm.furnizor_implicit} onChange={event => setMaterialForm({ ...materialForm, furnizor_implicit: event.target.value })} />
          <Button type="submit">Creează material</Button>
        </form>
      </Modal>

      <Modal open={paapModal} title={paapEditing ? 'Editează poziție PAAP' : 'Poziție PAAP nouă'} onClose={() => setPaapModal(false)} size="lg">
        <form className="grid gap-3" onSubmit={savePaap}>
          <CPVSelector value={paapForm.cpv_cod} onChange={(cpv_cod, cpv) => setPaapForm(current => ({ ...current, cpv_cod, cpv_denumire: cpv?.denumire_ro || current.cpv_denumire }))} required />
          <Input label="Material / obiect achiziție" value={paapForm.material} onChange={event => setPaapForm({ ...paapForm, material: event.target.value })} required />
          <div className="grid gap-3 md:grid-cols-2"><Input label="UM" value={paapForm.um} onChange={event => setPaapForm({ ...paapForm, um: event.target.value })} /><Input label="Cantitate" type="number" min="0" step="0.001" value={paapForm.cantitate} onChange={event => setPaapForm({ ...paapForm, cantitate: event.target.value })} /></div>
          <div className="grid gap-3 md:grid-cols-2"><Input label="Valoare estimată RON" type="number" min="0" step="0.01" value={paapForm.valoare_estimata} onChange={event => { const valoare_estimata = event.target.value; setPaapForm({ ...paapForm, valoare_estimata, procedura: procedureFor(valoare_estimata) }) }} required /><Input label="Valoare executată RON" type="number" min="0" step="0.01" value={paapForm.valoare_executata} onChange={event => setPaapForm({ ...paapForm, valoare_executata: event.target.value })} /></div>
          <Select label="Procedură" value={paapForm.procedura} onChange={event => setPaapForm({ ...paapForm, procedura: event.target.value })} options={['Achizitie directa', 'Procedura simplificata', 'Licitatie deschisa'].map(value => ({ value, label: value }))} />
          <div className="grid gap-3 md:grid-cols-2"><Select label="Trimestru" value={paapForm.trimestru} onChange={event => setPaapForm({ ...paapForm, trimestru: Number(event.target.value) })} options={[1, 2, 3, 4].map(value => ({ value, label: `T${value}` }))} /><Input label="Curs BNR EUR" type="number" min="0.0001" step="0.0001" value={paapForm.curs_bnr_eur} onChange={event => setPaapForm({ ...paapForm, curs_bnr_eur: event.target.value })} /></div>
          <div className="grid gap-3 md:grid-cols-2"><Input label="Responsabil achiziție" value={paapForm.responsabil_achizitie} onChange={event => setPaapForm({ ...paapForm, responsabil_achizitie: event.target.value })} /><Input label="Unitatea responsabilă" value={paapForm.unitate_responsabila} onChange={event => setPaapForm({ ...paapForm, unitate_responsabila: event.target.value })} /></div>
          <div className="grid gap-3 md:grid-cols-2"><Input label="Data estimată începere" type="date" value={paapForm.data_estimata_incepere} onChange={event => setPaapForm({ ...paapForm, data_estimata_incepere: event.target.value })} /><Input label="Data estimată finalizare" type="date" value={paapForm.data_estimata_finalizare} onChange={event => setPaapForm({ ...paapForm, data_estimata_finalizare: event.target.value })} /></div>
          <div className="grid gap-3 md:grid-cols-2"><Input label="Modalitatea de finanțare" value={paapForm.modalitate_finantare} onChange={event => setPaapForm({ ...paapForm, modalitate_finantare: event.target.value })} /><Select label="Modalitatea de desfășurare" value={paapForm.modalitate_desfasurare} onChange={event => setPaapForm({ ...paapForm, modalitate_desfasurare: event.target.value })} options={['Online', 'Offline'].map(value => ({ value, label: value }))} /></div>
          <Input label="Obiectivul din strategia locală" value={paapForm.obiectiv_strategie_locala} onChange={event => setPaapForm({ ...paapForm, obiectiv_strategie_locala: event.target.value })} />
          <Button type="submit">Salvează poziția</Button>
        </form>
      </Modal>
    </div>
  )
}
