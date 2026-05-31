import { useEffect, useMemo, useState } from 'react'
import api from '../../api/client'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'

const tabs = ['Indicatoare', 'Marcaje', 'Mobilier', 'Ordine lucru', 'Inspecții']
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

function numberRo(value, decimals = 0) {
  return Number(value || 0).toLocaleString('ro-RO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function stateInfo(value) {
  const raw = String(value || '').toLowerCase()
  if (['buna', 'bună', 'bun', 'ok'].includes(raw)) return { label: 'Bună', variant: 'green' }
  if (['lipsa', 'lipsă', 'missing'].includes(raw)) return { label: 'Lipsă', variant: 'red' }
  if (['necesita_interventie', 'rea', 'defect'].includes(raw)) return { label: 'Necesită intervenție', variant: 'red' }
  return { label: value || 'Deteriorată', variant: 'yellow' }
}

function priorityInfo(value) {
  const raw = String(value || '').toLowerCase()
  if (['critic', 'critica', 'critică'].includes(raw)) return { label: 'Critic', variant: 'red' }
  if (['urgent', 'urgenta', 'urgentă'].includes(raw)) return { label: 'Urgent', variant: 'yellow' }
  return { label: value || 'Normal', variant: 'gray' }
}

function statusInfo(value) {
  const raw = String(value || '').toLowerCase()
  if (['finalizat', 'done', 'completed'].includes(raw)) return { label: 'Finalizat', variant: 'green' }
  if (['in_lucru', 'in lucru', 'in_executie'].includes(raw)) return { label: 'În lucru', variant: 'blue' }
  if (['anulat', 'respins', 'canceled'].includes(raw)) return { label: 'Anulat', variant: 'red' }
  return { label: value || 'Planificat', variant: 'yellow' }
}

function entityLabel(type) {
  const map = { sign: 'Indicator', marking: 'Marcaj', furniture: 'Mobilier' }
  return map[type] || type || '-'
}

function entityOptions(signs, markings, furniture, type) {
  const rows = type === 'sign' ? signs : type === 'marking' ? markings : type === 'furniture' ? furniture : []
  return rows.map(item => ({
    value: item.id || item.uuid,
    label: item.cod || item.denumire || item.tip || item.tronson || item.locatie || item.id,
  }))
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

export default function SigurantaCircPage() {
  const [activeTab, setActiveTab] = useState('Indicatoare')
  const [signs, setSigns] = useState([])
  const [markings, setMarkings] = useState([])
  const [furniture, setFurniture] = useState([])
  const [workOrders, setWorkOrders] = useState([])
  const [inspections, setInspections] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState('')
  const [filters, setFilters] = useState({ stare: '', localitate: '' })
  const [signForm, setSignForm] = useState({ cod: '', tip: '', denumire: '', locatie: '', stare: 'buna', ultima_inspectie: '' })
  const [markingForm, setMarkingForm] = useState({ tronson: '', tip: '', material: '', suprafata_mp: '', stare: 'buna' })
  const [furnitureForm, setFurnitureForm] = useState({ tip: '', denumire: '', locatie: '', stare: 'buna' })
  const [orderForm, setOrderForm] = useState({ tip: '', obiect_tip: 'sign', obiect_id: '', titlu: '', prioritate: 'normal', termen_limita: '' })
  const [inspectionForm, setInspectionForm] = useState({ data: today(), obiect_tip: 'sign', obiect_id: '', stare_constatata: 'buna', constatari: '' })

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [signsRes, markingsRes, furnitureRes, ordersRes, inspectionsRes] = await Promise.all([
        api.get('/traffic-safety/signs', { params: filters }),
        api.get('/traffic-safety/markings'),
        api.get('/traffic-safety/furniture'),
        api.get('/traffic-safety/work-orders'),
        api.get('/traffic-safety/inspections'),
      ])
      setSigns(arrayFrom(signsRes.data, ['signs', 'items', 'data']))
      setMarkings(arrayFrom(markingsRes.data, ['markings', 'items', 'data']))
      setFurniture(arrayFrom(furnitureRes.data, ['furniture', 'items', 'data']))
      setWorkOrders(arrayFrom(ordersRes.data, ['workOrders', 'orders', 'items', 'data']))
      setInspections(arrayFrom(inspectionsRes.data, ['inspections', 'items', 'data']))
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut incarca datele de siguranța circulației.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  const pagedSigns = useMemo(() => signs.slice((page - 1) * pageSize, page * pageSize), [signs, page])
  const pagedMarkings = useMemo(() => markings.slice((page - 1) * pageSize, page * pageSize), [markings, page])
  const pagedFurniture = useMemo(() => furniture.slice((page - 1) * pageSize, page * pageSize), [furniture, page])
  const pagedOrders = useMemo(() => workOrders.slice((page - 1) * pageSize, page * pageSize), [workOrders, page])
  const pagedInspections = useMemo(() => inspections.slice((page - 1) * pageSize, page * pageSize), [inspections, page])

  function selectTab(tab) {
    setActiveTab(tab)
    setPage(1)
  }

  async function save(endpoint, payload, closeModal, successMessage) {
    setError('')
    setMessage('')
    try {
      await api.post(endpoint, payload)
      setMessage(successMessage)
      setModal('')
      closeModal()
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Înregistrarea nu a putut fi salvată.')
    }
  }

  const currentEntityOptions = entityOptions(signs, markings, furniture, orderForm.obiect_tip)
  const inspectionEntityOptions = entityOptions(signs, markings, furniture, inspectionForm.obiect_tip)

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Siguranța Circ.</h1>
          <p className="text-sm text-slate-500">Inventar indicatoare, marcaje, mobilier, ordine și inspecții.</p>
        </div>
        <Button onClick={() => setModal('order')}>Ordin nou</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map(tab => (
          <Button key={tab} variant={activeTab === tab ? 'primary' : 'secondary'} onClick={() => selectTab(tab)}>
            {tab}
          </Button>
        ))}
      </div>

      {error ? <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {message ? <div className="rounded-md border border-primary-100 bg-primary-50 px-4 py-3 text-sm text-primary-700">{message}</div> : null}

      {activeTab === 'Indicatoare' && (
        <Card title="Indicatoare" subtitle="Inventar indicatoare rutiere." loading={loading} actions={<Button size="sm" onClick={() => setModal('sign')}>Adaugă indicator</Button>}>
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <Select label="Stare" value={filters.stare} onChange={event => setFilters({ ...filters, stare: event.target.value })}>
              <option value="">Toate</option>
              <option value="buna">Bună</option>
              <option value="deteriorata">Deteriorată</option>
              <option value="lipsa">Lipsă</option>
            </Select>
            <Input label="Localitate" value={filters.localitate} onChange={event => setFilters({ ...filters, localitate: event.target.value })} />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Cod intern</th>
                  <th className="px-3 py-2">Tip</th>
                  <th className="px-3 py-2">Stradă</th>
                  <th className="px-3 py-2">Stare</th>
                  <th className="px-3 py-2">Ultima inspecție</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedSigns.length === 0 ? <EmptyRow colSpan={5} loading={loading} /> : pagedSigns.map(sign => {
                  const state = stateInfo(sign.stare)
                  return (
                    <tr key={sign.id || sign.uuid} className="hover:bg-slate-50">
                      <td className="px-3 py-3 font-medium text-slate-800">{sign.cod || sign.code || '-'}</td>
                      <td className="px-3 py-3">{sign.tip || sign.type || '-'}</td>
                      <td className="px-3 py-3">{sign.locatie || sign.strada || sign.street || '-'}</td>
                      <td className="px-3 py-3"><Badge variant={state.variant}>{state.label}</Badge></td>
                      <td className="px-3 py-3">{dateValue(sign.ultima_inspectie || sign.lastInspectionAt) || '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={signs.length} onPage={setPage} />
        </Card>
      )}

      {activeTab === 'Marcaje' && (
        <Card title="Marcaje" subtitle="Marcaje rutiere pe tronsoane." loading={loading} actions={<Button size="sm" onClick={() => setModal('marking')}>Adaugă marcaj</Button>}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Tip</th>
                  <th className="px-3 py-2">Material</th>
                  <th className="px-3 py-2">Stradă</th>
                  <th className="px-3 py-2 text-right">Suprafață m²</th>
                  <th className="px-3 py-2">Stare</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedMarkings.length === 0 ? <EmptyRow colSpan={5} loading={loading} /> : pagedMarkings.map(marking => {
                  const state = stateInfo(marking.stare)
                  return (
                    <tr key={marking.id || marking.uuid} className="hover:bg-slate-50">
                      <td className="px-3 py-3 font-medium text-slate-800">{marking.tip || '-'}</td>
                      <td className="px-3 py-3">{marking.material || '-'}</td>
                      <td className="px-3 py-3">{marking.tronson || marking.strada || '-'}</td>
                      <td className="px-3 py-3 text-right">{numberRo(marking.suprafata_mp, 2)}</td>
                      <td className="px-3 py-3"><Badge variant={state.variant}>{state.label}</Badge></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={markings.length} onPage={setPage} />
        </Card>
      )}

      {activeTab === 'Mobilier' && (
        <Card title="Mobilier stradal" subtitle="Bănci, garduri, mobilier și elemente urbane." loading={loading} actions={<Button size="sm" onClick={() => setModal('furniture')}>Adaugă mobilier</Button>}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Tip</th>
                  <th className="px-3 py-2">Denumire</th>
                  <th className="px-3 py-2">Locație</th>
                  <th className="px-3 py-2">Stare</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedFurniture.length === 0 ? <EmptyRow colSpan={4} loading={loading} /> : pagedFurniture.map(item => {
                  const state = stateInfo(item.stare)
                  return (
                    <tr key={item.id || item.uuid} className="hover:bg-slate-50">
                      <td className="px-3 py-3 font-medium text-slate-800">{item.tip || '-'}</td>
                      <td className="px-3 py-3">{item.denumire || item.name || '-'}</td>
                      <td className="px-3 py-3">{item.locatie || item.location || '-'}</td>
                      <td className="px-3 py-3"><Badge variant={state.variant}>{state.label}</Badge></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={furniture.length} onPage={setPage} />
        </Card>
      )}

      {activeTab === 'Ordine lucru' && (
        <Card title="Ordine de lucru" subtitle="Intervenții planificate." loading={loading} actions={<Button size="sm" onClick={() => setModal('order')}>Ordin nou</Button>}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Tip</th>
                  <th className="px-3 py-2">Entitate</th>
                  <th className="px-3 py-2">Prioritate</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Dată planificată</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedOrders.length === 0 ? <EmptyRow colSpan={5} loading={loading} /> : pagedOrders.map(order => {
                  const priority = priorityInfo(order.prioritate)
                  const status = statusInfo(order.status)
                  return (
                    <tr key={order.id || order.uuid} className="hover:bg-slate-50">
                      <td className="px-3 py-3 font-medium text-slate-800">{order.tip || '-'}</td>
                      <td className="px-3 py-3">{entityLabel(order.obiect_tip)} #{order.obiect_id || '-'}</td>
                      <td className="px-3 py-3"><Badge variant={priority.variant}>{priority.label}</Badge></td>
                      <td className="px-3 py-3"><Badge variant={status.variant}>{status.label}</Badge></td>
                      <td className="px-3 py-3">{dateValue(order.termen_limita || order.data_planificata) || '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={workOrders.length} onPage={setPage} />
        </Card>
      )}

      {activeTab === 'Inspecții' && (
        <Card title="Inspecții" subtitle="Inspecții periodice și constatări." loading={loading} actions={<Button size="sm" onClick={() => setModal('inspection')}>Inspecție nouă</Button>}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Dată</th>
                  <th className="px-3 py-2">Tip entitate</th>
                  <th className="px-3 py-2">Inspector</th>
                  <th className="px-3 py-2">Stare constatată</th>
                  <th className="px-3 py-2">Intervenție</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedInspections.length === 0 ? <EmptyRow colSpan={5} loading={loading} /> : pagedInspections.map(inspection => {
                  const state = stateInfo(inspection.stare_constatata || inspection.stare)
                  const intervention = inspection.necesita_interventie === true || inspection.necesita_interventie === 1 || inspection.stare === 'necesita_interventie'
                  return (
                    <tr key={inspection.id || inspection.uuid} className="hover:bg-slate-50">
                      <td className="px-3 py-3">{dateValue(inspection.data)}</td>
                      <td className="px-3 py-3 font-medium text-slate-800">{entityLabel(inspection.obiect_tip)}</td>
                      <td className="px-3 py-3">{inspection.inspector_nume || inspection.inspectorName || inspection.inspector_id || '-'}</td>
                      <td className="px-3 py-3"><Badge variant={state.variant}>{state.label}</Badge></td>
                      <td className="px-3 py-3">{intervention ? <Badge variant="red">Necesită intervenție</Badge> : <Badge variant="green">Nu</Badge>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={inspections.length} onPage={setPage} />
        </Card>
      )}

      <Modal open={modal === 'sign'} title="Adaugă indicator" onClose={() => setModal('')}>
        <form className="grid gap-4" onSubmit={event => {
          event.preventDefault()
          save('/traffic-safety/signs', signForm, () => setSignForm({ cod: '', tip: '', denumire: '', locatie: '', stare: 'buna', ultima_inspectie: '' }), 'Indicatorul a fost salvat.')
        }}>
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Cod intern" value={signForm.cod} onChange={event => setSignForm({ ...signForm, cod: event.target.value })} />
            <Input label="Tip" value={signForm.tip} onChange={event => setSignForm({ ...signForm, tip: event.target.value })} />
            <Input label="Denumire" value={signForm.denumire} onChange={event => setSignForm({ ...signForm, denumire: event.target.value })} />
            <Input label="Stradă / locație" value={signForm.locatie} onChange={event => setSignForm({ ...signForm, locatie: event.target.value })} />
            <Select label="Stare" value={signForm.stare} onChange={event => setSignForm({ ...signForm, stare: event.target.value })}>
              <option value="buna">Bună</option>
              <option value="deteriorata">Deteriorată</option>
              <option value="lipsa">Lipsă</option>
            </Select>
            <Input label="Ultima inspecție" type="date" value={signForm.ultima_inspectie} onChange={event => setSignForm({ ...signForm, ultima_inspectie: event.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal('')}>Renunță</Button>
            <Button type="submit">Salvează</Button>
          </div>
        </form>
      </Modal>

      <Modal open={modal === 'marking'} title="Adaugă marcaj" onClose={() => setModal('')}>
        <form className="grid gap-4" onSubmit={event => {
          event.preventDefault()
          save('/traffic-safety/markings', markingForm, () => setMarkingForm({ tronson: '', tip: '', material: '', suprafata_mp: '', stare: 'buna' }), 'Marcajul a fost salvat.')
        }}>
          <Input label="Tip" value={markingForm.tip} onChange={event => setMarkingForm({ ...markingForm, tip: event.target.value })} />
          <Input label="Material" value={markingForm.material} onChange={event => setMarkingForm({ ...markingForm, material: event.target.value })} />
          <Input label="Stradă / tronson" value={markingForm.tronson} onChange={event => setMarkingForm({ ...markingForm, tronson: event.target.value })} />
          <Input label="Suprafață m²" type="number" step="0.01" value={markingForm.suprafata_mp} onChange={event => setMarkingForm({ ...markingForm, suprafata_mp: event.target.value })} />
          <Select label="Stare" value={markingForm.stare} onChange={event => setMarkingForm({ ...markingForm, stare: event.target.value })}>
            <option value="buna">Bună</option>
            <option value="deteriorata">Deteriorată</option>
            <option value="lipsa">Lipsă</option>
          </Select>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal('')}>Renunță</Button>
            <Button type="submit">Salvează</Button>
          </div>
        </form>
      </Modal>

      <Modal open={modal === 'furniture'} title="Adaugă mobilier" onClose={() => setModal('')}>
        <form className="grid gap-4" onSubmit={event => {
          event.preventDefault()
          save('/traffic-safety/furniture', furnitureForm, () => setFurnitureForm({ tip: '', denumire: '', locatie: '', stare: 'buna' }), 'Mobilierul a fost salvat.')
        }}>
          <Input label="Tip" value={furnitureForm.tip} onChange={event => setFurnitureForm({ ...furnitureForm, tip: event.target.value })} />
          <Input label="Denumire" value={furnitureForm.denumire} onChange={event => setFurnitureForm({ ...furnitureForm, denumire: event.target.value })} />
          <Input label="Locație" value={furnitureForm.locatie} onChange={event => setFurnitureForm({ ...furnitureForm, locatie: event.target.value })} />
          <Select label="Stare" value={furnitureForm.stare} onChange={event => setFurnitureForm({ ...furnitureForm, stare: event.target.value })}>
            <option value="buna">Bună</option>
            <option value="deteriorata">Deteriorată</option>
            <option value="lipsa">Lipsă</option>
          </Select>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal('')}>Renunță</Button>
            <Button type="submit">Salvează</Button>
          </div>
        </form>
      </Modal>

      <Modal open={modal === 'order'} title="Ordin nou" onClose={() => setModal('')}>
        <form className="grid gap-4" onSubmit={event => {
          event.preventDefault()
          save('/traffic-safety/work-orders', orderForm, () => setOrderForm({ tip: '', obiect_tip: 'sign', obiect_id: '', titlu: '', prioritate: 'normal', termen_limita: '' }), 'Ordinul de lucru a fost salvat.')
        }}>
          <Input label="Tip ordin" value={orderForm.tip} onChange={event => setOrderForm({ ...orderForm, tip: event.target.value })} />
          <Select label="Tip entitate" value={orderForm.obiect_tip} onChange={event => setOrderForm({ ...orderForm, obiect_tip: event.target.value, obiect_id: '' })}>
            <option value="sign">Indicator</option>
            <option value="marking">Marcaj</option>
            <option value="furniture">Mobilier</option>
          </Select>
          <Select label="Entitate" value={orderForm.obiect_id} onChange={event => setOrderForm({ ...orderForm, obiect_id: event.target.value })}>
            <option value="">Alege entitatea</option>
            {currentEntityOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
          <Input label="Titlu" value={orderForm.titlu} onChange={event => setOrderForm({ ...orderForm, titlu: event.target.value })} />
          <Select label="Prioritate" value={orderForm.prioritate} onChange={event => setOrderForm({ ...orderForm, prioritate: event.target.value })}>
            <option value="normal">Normal</option>
            <option value="urgent">Urgent</option>
            <option value="critic">Critic</option>
          </Select>
          <Input label="Dată planificată" type="date" value={orderForm.termen_limita} onChange={event => setOrderForm({ ...orderForm, termen_limita: event.target.value })} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal('')}>Renunță</Button>
            <Button type="submit">Salvează</Button>
          </div>
        </form>
      </Modal>

      <Modal open={modal === 'inspection'} title="Inspecție nouă" onClose={() => setModal('')}>
        <form className="grid gap-4" onSubmit={event => {
          event.preventDefault()
          save('/traffic-safety/inspections', inspectionForm, () => setInspectionForm({ data: today(), obiect_tip: 'sign', obiect_id: '', stare_constatata: 'buna', constatari: '' }), 'Inspecția a fost salvată.')
        }}>
          <Input label="Dată" type="date" value={inspectionForm.data} onChange={event => setInspectionForm({ ...inspectionForm, data: event.target.value })} />
          <Select label="Tip entitate" value={inspectionForm.obiect_tip} onChange={event => setInspectionForm({ ...inspectionForm, obiect_tip: event.target.value, obiect_id: '' })}>
            <option value="sign">Indicator</option>
            <option value="marking">Marcaj</option>
            <option value="furniture">Mobilier</option>
          </Select>
          <Select label="Entitate" value={inspectionForm.obiect_id} onChange={event => setInspectionForm({ ...inspectionForm, obiect_id: event.target.value })}>
            <option value="">Alege entitatea</option>
            {inspectionEntityOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
          <Select label="Stare constatată" value={inspectionForm.stare_constatata} onChange={event => setInspectionForm({ ...inspectionForm, stare_constatata: event.target.value })}>
            <option value="buna">Bună</option>
            <option value="deteriorata">Deteriorată</option>
            <option value="lipsa">Lipsă</option>
          </Select>
          <Input label="Constatări" value={inspectionForm.constatari} onChange={event => setInspectionForm({ ...inspectionForm, constatari: event.target.value })} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal('')}>Renunță</Button>
            <Button type="submit">Salvează</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
