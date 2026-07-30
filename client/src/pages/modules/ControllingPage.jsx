import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import api from '../../api/client'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { formatMoney } from '../../utils/format'

const tabs = ['Centre cost', 'Cheltuieli', 'Buget vs Real', 'Cost automat', 'Rapoarte']
const categories = ['manopera', 'materiale', 'combustibil', 'amortizare', 'reparatii', 'chirii', 'alte_cheltuieli']

function currentMonth() {
  return new Date().toISOString().slice(0, 7)
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function arrayFrom(data, keys) {
  if (Array.isArray(data)) return data
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key]
  }
  return []
}

function centerName(item) {
  return item?.denumire || item?.name || item?.cod || `Centru #${item?.id}`
}

function percentage(real, budget) {
  const value = Number(budget || 0) > 0 ? Number(real || 0) / Number(budget || 0) * 100 : 0
  return Number(value.toFixed(1))
}

function statusTone(value) {
  if (value > 100) return 'danger'
  if (value >= 85) return 'warning'
  return 'success'
}

function flattenCenters(items, level = 0) {
  return items.flatMap(item => [{ ...item, _level: level }, ...flattenCenters(item.subcentre || item.children || [], level + 1)])
}

function CenterNode({ center, expanded, onToggle, onEdit, onDisable, onAssign }) {
  const children = center.subcentre || center.children || []
  const objects = center.obiecte || []
  const budget = Number(center.buget_lunar || center.buget || 0)
  const real = Number(center.total_cheltuieli_luna || center.real || 0)
  const percent = center.procent_buget ?? percentage(real, budget)
  return (
    <div className="rounded-md border border-slate-200">
      <button className="flex w-full items-center gap-3 px-3 py-3 text-left" onClick={() => onToggle(center.id)}>
        <span className="h-4 w-4 rounded-full border border-slate-200" style={{ background: center.culoare || '#3B82F6' }} />
        <span className="w-5 text-slate-500">{children.length ? (expanded ? '−' : '+') : ''}</span>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-slate-900">{centerName(center)}</div>
          <div className="text-xs text-slate-500">{center.cod || center.tip || 'centru cost'} · {objects.length} obiecte</div>
        </div>
        <div className="hidden text-right text-sm md:block">
          <div>{formatMoney(budget)}</div>
          <div className="text-slate-500">{formatMoney(real)}</div>
        </div>
        <Badge tone={statusTone(percent)}>{percent}%</Badge>
      </button>
      <div className="flex flex-wrap gap-2 border-t border-slate-100 px-3 py-2">
        <Button size="sm" variant="secondary" onClick={() => onEdit(center)}>Editează</Button>
        <Button size="sm" variant="secondary" onClick={() => onAssign(center)}>Asociază obiect</Button>
        <Button size="sm" variant="ghost" onClick={() => onDisable(center)}>Dezactivează</Button>
        {objects.slice(0, 4).map(object => (
          <span key={object.id || `${object.object_type}-${object.object_id}`} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">
            {object.object_name || object.object_id}
          </span>
        ))}
      </div>
      {expanded && children.length ? (
        <div className="grid gap-2 border-t border-slate-100 p-2 pl-8">
          {children.map(child => <CenterNode key={child.id} center={child} expanded={expanded} onToggle={onToggle} onEdit={onEdit} onDisable={onDisable} onAssign={onAssign} />)}
        </div>
      ) : null}
    </div>
  )
}

export default function ControllingPage() {
  const [activeTab, setActiveTab] = useState('Centre cost')
  const [centers, setCenters] = useState([])
  const [report, setReport] = useState([])
  const [autoCosts, setAutoCosts] = useState(null)
  const [executionReport, setExecutionReport] = useState(null)
  const [entries, setEntries] = useState([])
  const [linkOptions, setLinkOptions] = useState({ departments: [], assets: [], projects: [] })
  const [expanded, setExpanded] = useState(new Set())
  const [modalOpen, setModalOpen] = useState(false)
  const [centerModal, setCenterModal] = useState(false)
  const [centerEditing, setCenterEditing] = useState(null)
  const [centerForm, setCenterForm] = useState({ cod: '', denumire: '', tip: 'general', parinte_id: '', culoare: '#3B82F6', buget_lunar: '' })
  const [assignModal, setAssignModal] = useState(false)
  const [assignCenter, setAssignCenter] = useState(null)
  const [assignForm, setAssignForm] = useState({ object_id: '', object_type: 'equipment' })
  const [confirmAction, setConfirmAction] = useState(null)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({ luna: currentMonth(), centru_id: '', categorie: '', from: '', to: '' })
  const [form, setForm] = useState({ data: today(), cost_center_id: '', categorie: 'materiale', valoare: '', descriere: '' })

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [centersRes, reportRes, entriesRes] = await Promise.all([
        api.get('/controlling/cost-centers'),
        api.get('/controlling/reports/buget-vs-real', { params: { luna: filters.luna, centru_id: filters.centru_id || undefined } }),
        api.get('/controlling/entries').catch(error => ({ data: { entries: [], _error: error } })),
      ])
      const nextCenters = arrayFrom(centersRes.data, ['centers', 'cost_centers', 'items'])
      setCenters(nextCenters)
      setReport(arrayFrom(reportRes.data, ['rows', 'items']))
      setEntries(arrayFrom(entriesRes.data, ['entries', 'items']))
      if (entriesRes.data?._error) setError('Endpoint-ul GET /api/controlling/entries nu este disponibil încă; cheltuielile pot fi adăugate, dar lista nu se poate încărca.')
      setForm(current => ({ ...current, cost_center_id: current.cost_center_id || flattenCenters(nextCenters)[0]?.id || '' }))
      api.get('/controlling/cost-centers/link-options')
        .then(r => {
          const nextOptions = {
            departments: arrayFrom(r.data?.departments, ['items']),
            assets: arrayFrom(r.data?.assets, ['items']),
            projects: arrayFrom(r.data?.projects, ['items']),
          }
          setLinkOptions(nextOptions)
        })
        .catch(() => {
          api.get('/fleet-assets', { params: { tip: '' } }).then(r => {
            const fallbackAssets = r.data?.assets || []
            setLinkOptions(current => ({ ...current, assets: fallbackAssets }))
          }).catch(() => setLinkOptions(current => ({ ...current, assets: [] })))
        })
      api.get('/controlling/reports/automatic-costs', { params: { luna: filters.luna } }).then(r => setAutoCosts(r.data)).catch(() => setAutoCosts(null))
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut incarca datele de controlling.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    Promise.resolve().then(() => load())
  }, [filters.luna, filters.centru_id])

  const flatCenters = useMemo(() => flattenCenters(centers), [centers])
  const filteredEntries = useMemo(() => entries.filter(entry => {
    const date = entry.data || entry.date || ''
    if (filters.centru_id && String(entry.cost_center_id) !== String(filters.centru_id)) return false
    if (filters.categorie && entry.categorie !== filters.categorie) return false
    if (filters.from && date < filters.from) return false
    if (filters.to && date > filters.to) return false
    return true
  }), [entries, filters])

  const chartData = useMemo(() => report.slice(0, 12).map(row => ({
    name: row.denumire || row.centru || row.centru_id,
    buget: Number(row.buget || 0),
    real: Number(row.real || 0),
  })), [report])

  const allAssignmentOptions = useMemo(() => [
    ...linkOptions.departments.map(item => ({ value: String(item.id), label: item.label || item.name || item.denumire || item.id, type: 'department' })),
    ...linkOptions.assets.map(item => ({ value: String(item.id), label: item.label || [item.name, item.registration].filter(Boolean).join(' / ') || item.cod || item.id, type: item.type || (item.category === 'vehicle' ? 'vehicle' : 'equipment') })),
    ...linkOptions.projects.map(item => ({ value: String(item.id), label: item.label || item.name || item.denumire || item.titlu || item.id, type: 'project' })),
  ], [linkOptions])

  function assignmentOptions(type) {
    if (type === 'department') return allAssignmentOptions.filter(item => item.type === 'department')
    if (type === 'project') return allAssignmentOptions.filter(item => item.type === 'project')
    if (type === 'vehicle') return allAssignmentOptions.filter(item => item.type === 'vehicle')
    return allAssignmentOptions.filter(item => item.type === 'equipment' || !['department', 'project', 'vehicle'].includes(item.type))
  }

  async function runConfirmAction(reason) {
    if (!confirmAction?.run) return
    try {
      setConfirmLoading(true)
      setError('')
      await confirmAction.run(reason)
      setConfirmAction(null)
    } catch (err) {
      setError(err.response?.data?.error || confirmAction.errorMessage || 'Acțiunea nu a putut fi executată.')
    } finally {
      setConfirmLoading(false)
    }
  }

  function toggle(id) {
    setExpanded(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submitEntry(event) {
    event.preventDefault()
    setError('')
    try {
      await api.post('/controlling/entries', {
        ...form,
        valoare: Number(form.valoare),
      })
      setModalOpen(false)
      setForm({ data: today(), cost_center_id: flatCenters[0]?.id || '', categorie: 'materiale', valoare: '', descriere: '' })
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Cheltuiala nu a putut fi salvata.')
    }
  }

  function openCenterModal(center = null, parent = null) {
    setCenterEditing(center)
    setCenterForm({
      cod: center?.cod || '',
      denumire: center?.denumire || center?.name || '',
      tip: center?.tip || 'general',
      parinte_id: center?.parinte_id || parent?.id || '',
      culoare: center?.culoare || '#3B82F6',
      buget_lunar: center?.buget_lunar || '',
    })
    setCenterModal(true)
  }

  async function submitCenter(event) {
    event.preventDefault()
    setError('')
    try {
      const payload = {
        ...centerForm,
        name: centerForm.denumire,
        buget_lunar: Number(centerForm.buget_lunar || 0),
      }
      if (centerEditing) await api.put(`/controlling/cost-centers/${centerEditing.id}`, payload)
      else await api.post('/controlling/cost-centers', payload)
      setCenterModal(false)
      setCenterEditing(null)
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Centrul de cost nu a putut fi salvat.')
    }
  }

  async function disableCenter(center) {
    setConfirmAction({
      title: 'Dezactivează centru de cost',
      message: `Dezactivezi centrul „${centerName(center)}”?`,
      details: 'Centrul nu va mai fi folosit pentru alocări noi, dar istoricul cheltuielilor și rapoartelor rămâne păstrat.',
      confirmLabel: 'Dezactivează',
      tone: 'danger',
      errorMessage: 'Centrul de cost nu a putut fi dezactivat.',
      run: () => disableCenterRequest(center)
    })
  }

  async function disableCenterRequest(center) {
    try {
      await api.delete(`/controlling/cost-centers/${center.id}`)
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Centrul de cost nu a putut fi dezactivat.')
    }
  }

  function openAssignModal(center) {
    setAssignCenter(center)
    const first = assignmentOptions('equipment')[0] || assignmentOptions('vehicle')[0] || assignmentOptions('department')[0] || assignmentOptions('project')[0]
    setAssignForm({ object_id: first?.value || '', object_type: first?.type || 'equipment' })
    setAssignModal(true)
  }

  async function submitAssign(event) {
    event.preventDefault()
    if (!assignCenter) return
    try {
      const selected = allAssignmentOptions.find(item => String(item.value) === String(assignForm.object_id) && item.type === assignForm.object_type)
      await api.post(`/controlling/cost-centers/${assignCenter.id}/assign-asset`, {
        ...assignForm,
        asset_id: assignForm.object_id,
        asset_type: assignForm.object_type,
        object_name: selected?.label || '',
      })
      setAssignModal(false)
      setAssignCenter(null)
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Obiectul nu a putut fi asociat.')
    }
  }

  function openCostCenterDocument(format = '') {
    const params = new URLSearchParams({ luna: filters.luna })
    if (format) params.set('format', format)
    window.open(`/api/controlling/document-centre-cost?${params.toString()}`, '_blank', 'noopener,noreferrer')
  }

  async function loadExecutionReport() {
    setError('')
    try {
      const center = flatCenters.find(item => String(item.id) === String(filters.centru_id))
      const params = { luna: filters.luna }
      if (center?.cod || filters.centru_id) params.centru = center?.cod || filters.centru_id
      const res = await api.get('/controlling/raport-centre-cost', { params })
      setExecutionReport(res.data)
    } catch (err) {
      setExecutionReport(null)
      setError(err.response?.data?.error || 'Raportul pe centre de cost nu a putut fi generat.')
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Controlling</h2>
          <p className="text-sm text-slate-500">Centre de cost, cheltuieli și buget vs real.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>Adaugă cheltuială manuală</Button>
      </div>

      {error ? <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</div> : null}

      <Card>
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          {tabs.map(tab => <Button key={tab} variant={activeTab === tab ? 'primary' : 'secondary'} onClick={() => setActiveTab(tab)}>{tab}</Button>)}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Input label="Luna" type="month" value={filters.luna} onChange={event => setFilters({ ...filters, luna: event.target.value })} />
          <Select label="Centru" value={filters.centru_id} onChange={event => setFilters({ ...filters, centru_id: event.target.value })} options={[{ value: '', label: 'Toate centrele' }, ...flatCenters.map(center => ({ value: center.id, label: `${'  '.repeat(center._level)}${centerName(center)}` }))]} />
          {activeTab === 'Cheltuieli' ? (
            <>
              <Select label="Categorie" value={filters.categorie} onChange={event => setFilters({ ...filters, categorie: event.target.value })} options={[{ value: '', label: 'Toate categoriile' }, ...categories.map(item => ({ value: item, label: item }))]} />
              <Input label="De la" type="date" value={filters.from} onChange={event => setFilters({ ...filters, from: event.target.value })} />
            </>
          ) : null}
        </div>
      </Card>

      {activeTab === 'Centre cost' ? (
        <Card>
          <div className="mb-3 flex justify-end"><Button onClick={() => openCenterModal()}>Adaugă centru / subcentru</Button></div>
          <div className="grid gap-2">
            {centers.length ? centers.map(center => (
              <CenterNode
                key={center.id}
                center={center}
                expanded={expanded.has(center.id)}
                onToggle={toggle}
                onEdit={openCenterModal}
                onDisable={disableCenter}
                onAssign={openAssignModal}
              />
            )) : <p className="text-sm text-slate-500">{loading ? 'Se incarca...' : 'Nu exista centre de cost.'}</p>}
          </div>
        </Card>
      ) : null}

      {activeTab === 'Buget vs Real' ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <h3 className="mb-3 text-base font-semibold text-slate-900">Comparativ</h3>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr><th className="px-3 py-2">Centru</th><th className="px-3 py-2">Categorie</th><th className="px-3 py-2">Buget</th><th className="px-3 py-2">Real</th><th className="px-3 py-2">Diferență</th><th className="px-3 py-2">%</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.length ? report.map((row, index) => (
                    <tr key={`${row.centru_id}-${row.categorie}-${index}`}>
                      <td className="px-3 py-2">{row.denumire}</td>
                      <td className="px-3 py-2">{row.categorie}</td>
                      <td className="px-3 py-2">{formatMoney(row.buget)}</td>
                      <td className="px-3 py-2">{formatMoney(row.real)}</td>
                      <td className="px-3 py-2">{formatMoney(row.diferenta)}</td>
                      <td className="px-3 py-2"><Badge tone={statusTone(Number(row.procent_realizat || 0))}>{row.procent_realizat || 0}%</Badge></td>
                    </tr>
                  )) : <tr><td colSpan="6" className="px-3 py-8 text-center text-sm text-slate-500">{loading ? 'Se incarca...' : 'Nu exista date.'}</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
          <Card>
            <h3 className="mb-3 text-base font-semibold text-slate-900">Buget vs Real per centru</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="buget" fill="#C3EBD8" />
                  <Bar dataKey="real" fill="#0F6E56" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      ) : null}

      {activeTab === 'Cheltuieli' ? (
        <Card>
          <div className="mb-3 flex justify-end"><Button onClick={() => setModalOpen(true)}>Adaugă cheltuială manuală</Button></div>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr><th className="px-3 py-2">Dată</th><th className="px-3 py-2">Centru cost</th><th className="px-3 py-2">Categorie</th><th className="px-3 py-2">Valoare</th><th className="px-3 py-2">Sursa</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEntries.length ? filteredEntries.map(entry => (
                  <tr key={entry.uuid || entry.id}>
                    <td className="px-3 py-2">{entry.data || entry.date}</td>
                    <td className="px-3 py-2">{centerName(flatCenters.find(center => String(center.id) === String(entry.cost_center_id)))}</td>
                    <td className="px-3 py-2">{entry.categorie}</td>
                    <td className="px-3 py-2">{formatMoney(entry.valoare)}</td>
                    <td className="px-3 py-2">{entry.sursa || 'manual'}</td>
                  </tr>
                )) : <tr><td colSpan="5" className="px-3 py-8 text-center text-sm text-slate-500">{loading ? 'Se incarca...' : 'Nu exista cheltuieli incarcate.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {activeTab === 'Cost automat' ? (
        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-4">
            {[
              { label: 'Cost total', value: formatMoney(autoCosts?.totals?.cost_total || 0) },
              { label: 'Carburant', value: formatMoney(autoCosts?.totals?.cost_carburant || 0) },
              { label: 'Reparații', value: formatMoney(autoCosts?.totals?.cost_reparatii || 0) },
              { label: 'Ore utilaje', value: `${Number(autoCosts?.totals?.ore_total || 0).toFixed(1)} h` },
            ].map(item => (
              <Card key={item.label}>
                <div className="text-xs text-slate-500">{item.label}</div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">{item.value}</div>
              </Card>
            ))}
          </div>
          <Card>
            <h3 className="mb-3 text-base font-semibold text-slate-900">Cost automat pe centre</h3>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr><th className="px-3 py-2">Centru</th><th className="px-3 py-2 text-right">Ore</th><th className="px-3 py-2 text-right">Carburant</th><th className="px-3 py-2 text-right">Reparații</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">Cost/oră</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(autoCosts?.summary || []).length ? autoCosts.summary.map(row => (
                    <tr key={row.cost_center_id || 'nealocat'}>
                      <td className="px-3 py-2 font-medium">{row.cost_center_name}</td>
                      <td className="px-3 py-2 text-right">{Number(row.ore_total || 0).toFixed(1)}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(row.cost_carburant)}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(row.cost_reparatii)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatMoney(row.cost_total)}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(row.cost_ora)}</td>
                    </tr>
                  )) : <tr><td colSpan="6" className="px-3 py-8 text-center text-sm text-slate-500">Nu există costuri automate pentru luna selectată.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
          <Card>
            <h3 className="mb-3 text-base font-semibold text-slate-900">Detaliu pe utilaj</h3>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr><th className="px-3 py-2">Utilaj / vehicul</th><th className="px-3 py-2">Centru</th><th className="px-3 py-2 text-right">Ore</th><th className="px-3 py-2 text-right">Consum +/-</th><th className="px-3 py-2 text-right">Total</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(autoCosts?.rows || []).map(row => (
                    <tr key={row.asset_id}>
                      <td className="px-3 py-2 font-medium">{row.asset_name}</td>
                      <td className="px-3 py-2">{row.cost_center_name}</td>
                      <td className="px-3 py-2 text-right">{Number(row.ore_total || 0).toFixed(1)}</td>
                      <td className={`px-3 py-2 text-right ${row.diferenta_consum > 0 ? 'text-rose-600 font-semibold' : 'text-slate-500'}`}>{Number(row.diferenta_consum || 0).toFixed(2)} L</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatMoney(row.cost_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}

      {activeTab === 'Rapoarte' ? (
        <div className="grid gap-4">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Document centre cost/profit</h3>
                <p className="mt-1 text-sm text-slate-500">Actualizare lunară cu centrele organizației și utilajele/vehiculele alocate.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => openCostCenterDocument()}>📄 Document Centre Cost</Button>
                <Button variant="secondary" onClick={() => openCostCenterDocument('xlsx')}>Export Excel</Button>
                <Button onClick={loadExecutionReport}>Raport execuție</Button>
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="mb-3 text-base font-semibold text-slate-900">Raport execuție cheltuieli</h3>
            {executionReport ? (
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">Centru</div>
                  <div className="mt-1 font-semibold text-slate-900">{executionReport.center?.denumire || 'Toate centrele'}</div>
                  <div className="text-xs text-slate-500">{executionReport.luna}</div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">Venituri alocate</div>
                  <div className="mt-1 text-xl font-semibold text-emerald-700">{formatMoney(executionReport.venituri)}</div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">Rezultat</div>
                  <div className={`mt-1 text-xl font-semibold ${Number(executionReport.rezultat || 0) < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{formatMoney(executionReport.rezultat)}</div>
                </div>
                {[
                  ['Salarii', executionReport.salarii],
                  ['Combustibil', executionReport.combustibil],
                  ['Materiale', executionReport.materiale],
                  ['Reparații', executionReport.reparatii],
                  ['Alte cheltuieli', executionReport.alte_cheltuieli],
                  ['Total cheltuieli', executionReport.total_cheltuieli],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-slate-200 p-3">
                    <div className="text-xs text-slate-500">{label}</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">{formatMoney(value)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Alege luna/centrul de cost de sus și apasă „Raport execuție”.</p>
            )}
          </Card>
        </div>
      ) : null}

      <Modal open={modalOpen} title="Adaugă cheltuială manuală" onClose={() => setModalOpen(false)}>
        <form className="grid gap-4" onSubmit={submitEntry}>
          <Input label="Dată" type="date" value={form.data} onChange={event => setForm({ ...form, data: event.target.value })} required />
          <Select label="Centru cost" value={form.cost_center_id} onChange={event => setForm({ ...form, cost_center_id: event.target.value })} options={flatCenters.map(center => ({ value: center.id, label: `${'  '.repeat(center._level)}${centerName(center)}` }))} required />
          <Select label="Categorie" value={form.categorie} onChange={event => setForm({ ...form, categorie: event.target.value })} options={categories.map(item => ({ value: item, label: item }))} required />
          <Input label="Valoare" type="number" step="0.01" value={form.valoare} onChange={event => setForm({ ...form, valoare: event.target.value })} required />
          <Input label="Descriere" value={form.descriere} onChange={event => setForm({ ...form, descriere: event.target.value })} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Renunță</Button>
            <Button type="submit">Salvează</Button>
          </div>
        </form>
      </Modal>

      <Modal open={centerModal} title={centerEditing ? 'Editează centru cost' : 'Centru / subcentru nou'} onClose={() => setCenterModal(false)}>
        <form className="grid gap-4" onSubmit={submitCenter}>
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Cod" value={centerForm.cod} onChange={event => setCenterForm({ ...centerForm, cod: event.target.value })} placeholder="ex: MEC-001" />
            <Input label="Denumire" value={centerForm.denumire} onChange={event => setCenterForm({ ...centerForm, denumire: event.target.value })} required />
            <Select label="Tip" value={centerForm.tip} onChange={event => setCenterForm({ ...centerForm, tip: event.target.value })} options={[
              { value: 'general', label: 'General' },
              { value: 'departament', label: 'Departament' },
              { value: 'utilaj', label: 'Utilaj' },
              { value: 'lucrare', label: 'Lucrare' },
              { value: 'administrativ', label: 'Administrativ' },
            ]} />
            <Select label="Centru părinte" value={centerForm.parinte_id} onChange={event => setCenterForm({ ...centerForm, parinte_id: event.target.value })} options={[{ value: '', label: 'Fără părinte' }, ...flatCenters.filter(center => String(center.id) !== String(centerEditing?.id)).map(center => ({ value: center.id, label: `${'  '.repeat(center._level)}${centerName(center)}` }))]} />
            <Input label="Buget lunar" type="number" step="0.01" value={centerForm.buget_lunar} onChange={event => setCenterForm({ ...centerForm, buget_lunar: event.target.value })} />
            <Input label="Culoare" type="color" value={centerForm.culoare} onChange={event => setCenterForm({ ...centerForm, culoare: event.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCenterModal(false)}>Renunță</Button>
            <Button type="submit">{centerEditing ? 'Actualizează' : 'Creează'}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={assignModal} title={`Asociază obiect la ${centerName(assignCenter)}`} onClose={() => setAssignModal(false)}>
        <form className="grid gap-4" onSubmit={submitAssign}>
          <Select label="Tip obiect" value={assignForm.object_type} onChange={event => {
            const nextType = event.target.value
            const first = assignmentOptions(nextType)[0]
            setAssignForm({ object_type: nextType, object_id: first?.value || '' })
          }} options={[
            { value: 'department', label: 'Departament' },
            { value: 'equipment', label: 'Utilaj' },
            { value: 'vehicle', label: 'Vehicul' },
            { value: 'project', label: 'Lucrare / proiect' },
          ]} />
          <Select
            label="Obiect asociat"
            value={assignForm.object_id}
            onChange={event => setAssignForm({ ...assignForm, object_id: event.target.value })}
            options={assignmentOptions(assignForm.object_type).map(item => ({ value: item.value, label: item.label }))}
            required
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAssignModal(false)}>Renunță</Button>
            <Button type="submit">Asociază</Button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.title}
        message={confirmAction?.message}
        details={confirmAction?.details}
        confirmLabel={confirmAction?.confirmLabel}
        tone={confirmAction?.tone}
        loading={confirmLoading}
        onCancel={() => setConfirmAction(null)}
        onConfirm={runConfirmAction}
      />
    </div>
  )
}
