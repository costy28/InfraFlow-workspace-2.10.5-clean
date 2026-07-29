import { useEffect, useMemo, useState } from 'react'
import api from '../../api/client'
import { useAuth } from '../../hooks/useAuth'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/forms/Input'
import Modal from '../../components/ui/Modal'
import Select from '../../components/forms/Select'
import CPVSelector from '../../components/forms/CPVSelector'
import ContextHelp from '../../components/ui/ContextHelp'
import { openApiFile } from '../../utils/download'

const tabs = [
  { key: '', label: 'Toate' },
  { key: 'draft', label: 'Draft' },
  { key: 'in_aprobare', label: 'În aprobare' },
  { key: 'aprobat', label: 'Aprobate' },
  { key: 'respins', label: 'Respinse' },
]

const flowLabels = {
  draft: 'Draft',
  inregistrat: 'Înregistrat',
  la_achizitii: 'La Achiziții',
  la_gestionar: 'La Gestionar',
  cfp: 'CFP / Economist',
  contabil_sef: 'Contabil Șef',
  dir_adjunct: 'Director Adjunct',
  secretariat_2: 'Secretariat II',
  dir_general: 'Director General',
  secretariat_final: 'Secretariat final',
  achizitii_final: 'Achiziții final',
  aprobat: 'Aprobat',
  respins: 'Respins',
  receptie: 'Recepție',
  diferenta_factura: 'Diferență factură',
}

const statsKeys = {
  aprobat: 'aprobate',
  respins: 'respinse',
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function emptyLine() {
  return { material_id: '', denumire: '', caracteristici: '', um: '', cantitate: 1, pret_unitar: 0, valoare_tva: 0, cpv_cod: '' }
}

function money(value) {
  return Number(value || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function statusTone(status) {
  if (status === 'aprobat') return 'green'
  if (status === 'respins') return 'red'
  if (status === 'draft') return 'gray'
  return 'yellow'
}

function materialName(material) {
  return material?.name || material?.denumire || material?.materialName || ''
}

function contractLabel(contract) {
  return [contract.numar, contract.titlu].filter(Boolean).join(' — ') || contract.id
}

function statFor(stats, key) {
  if (!key) return stats.total ?? 0
  return stats[key] ?? stats[statsKeys[key]] ?? 0
}

export default function ReferatePage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('')
  const [referate, setReferate] = useState([])
  const [stats, setStats] = useState({})
  const [materials, setMaterials] = useState([])
  const [departments, setDepartments] = useState([])
  const [contracts, setContracts] = useState([])
  const [selected, setSelected] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({ tip: 'aprovizionare', data_intocmire: today(), departament_id: '', furnizor_manual: '', contract_id: '', observatii: '', items: [emptyLine()] })
  const [flowForm, setFlowForm] = useState({ observatii: '', nr_inregistrare: '' })
  const [receiptForm, setReceiptForm] = useState({ valoare_factura: '', observatii: '' })
  const permissions = Array.isArray(user?.permissions) ? user.permissions : []
  const canCreate = permissions.includes('referate:create') || ['admin', 'superadmin'].includes(user?.role)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [list, totals, materialRows, departmentRows, contractRows] = await Promise.all([
        api.get('/referate', { params: activeTab ? { status: activeTab } : {} }),
        api.get('/referate/stats'),
        api.get('/materials'),
        api.get('/departments'),
        api.get('/contracts').catch(() => ({ data: { contracts: [] } })),
      ])
      setReferate(list.data.referate || [])
      setStats(totals.data || {})
      setMaterials(materialRows.data.materials || [])
      setDepartments(departmentRows.data.departments || [])
      setContracts(contractRows.data.contracts || [])
    } catch (err) {
      setError(err.response?.data?.error || 'Referatele nu au putut fi încărcate.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    Promise.resolve().then(load)
    // load reads the selected tab and is intentionally refreshed only when that tab changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  const totalForm = useMemo(() => form.items.reduce((sum, item) => sum + Number(item.cantitate || 0) * Number(item.pret_unitar || 0) + Number(item.valoare_tva || 0), 0), [form.items])
  const contractOptions = useMemo(() => [
    { value: '', label: 'Fără contract urmărit' },
    ...contracts
      .filter(contract => !contract.cancelled_at && !contract.cancelledAt)
      .map(contract => ({ value: contract.id, label: contractLabel(contract) })),
  ], [contracts])
  const referateHelp = useMemo(() => {
    const total = statFor(stats, '')
    const draftCount = statFor(stats, 'draft')
    const approvalCount = statFor(stats, 'in_aprobare')
    const approvedCount = statFor(stats, 'aprobat')
    const rejectedCount = statFor(stats, 'respins')
    const steps = [
      {
        key: 'create',
        label: total ? `Referate înregistrate · ${total}` : 'Primul referat',
        hint: 'Creează referatul cu poziții, CPV și departament corect.',
        done: total > 0,
        onClick: canCreate ? () => setCreateOpen(true) : undefined,
      },
      {
        key: 'draft',
        label: `Drafturi · ${draftCount}`,
        hint: 'Drafturile trebuie trimise în flux ca să nu rămână blocate local.',
        done: draftCount === 0,
        onClick: () => setActiveTab('draft'),
      },
      {
        key: 'approval',
        label: `În aprobare · ${approvalCount}`,
        hint: 'Urmărește referatele aflate pe circuitul de avizare.',
        done: approvalCount === 0,
        onClick: () => setActiveTab('in_aprobare'),
      },
      {
        key: 'approved',
        label: `Aprobate · ${approvedCount}`,
        hint: 'După aprobare urmează comandă, recepție sau atașarea documentelor justificative.',
        done: approvedCount > 0,
        onClick: () => setActiveTab('aprobat'),
      },
      {
        key: 'rejected',
        label: `Respinse · ${rejectedCount}`,
        hint: 'Referatele respinse trebuie corectate sau închise ca istoric.',
        done: rejectedCount === 0,
        onClick: () => setActiveTab('respins'),
      },
    ]
    const nextStep = steps.find(step => !step.done && step.onClick)
    return {
      steps,
      nextAction: nextStep ? {
        label: nextStep.key === 'create' ? 'Creează referat' : 'Deschide filtrul',
        onClick: nextStep.onClick,
        variant: 'secondary',
      } : null,
      tone: draftCount || approvalCount || rejectedCount ? 'warning' : 'success',
    }
  }, [stats, canCreate])

  function patchLine(index, patch) {
    setForm(current => ({ ...current, items: current.items.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line) }))
  }

  function chooseMaterial(index, value) {
    const material = materials.find(item => materialName(item) === value)
    patchLine(index, material ? {
      material_id: material.id,
      denumire: materialName(material),
      um: material.unit || material.um || '',
      cpv_cod: material.cod_cpv || material.cpv || '',
    } : { material_id: '', denumire: value })
  }

  async function createReferat(event) {
    event.preventDefault()
    try {
      await api.post('/referate', form)
      setCreateOpen(false)
      setForm({ tip: 'aprovizionare', data_intocmire: today(), departament_id: '', furnizor_manual: '', contract_id: '', observatii: '', items: [emptyLine()] })
      setMessage('Referatul a fost creat.')
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Referatul nu a putut fi salvat.')
    }
  }

  async function openDetails(referat) {
    try {
      const response = await api.get(`/referate/${referat.uuid || referat.id}`)
      setSelected(response.data.referat)
      setFlowForm({ observatii: '', nr_inregistrare: response.data.referat.nr_inregistrare || '' })
    } catch (err) {
      setError(err.response?.data?.error || 'Detaliile referatului nu au putut fi încărcate.')
    }
  }

  async function advance(actiune = 'inainteaza') {
    try {
      const response = await api.post(`/referate/${selected.uuid || selected.id}/inainteaza`, { ...flowForm, actiune })
      setSelected(response.data.referat)
      setMessage(actiune === 'respinge' ? 'Referatul a fost respins.' : 'Referatul a fost transmis la pasul următor.')
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Fluxul nu a putut fi actualizat.')
    }
  }

  async function receive(event) {
    event.preventDefault()
    try {
      const response = await api.post(`/referate/${selected.uuid || selected.id}/receptie`, receiptForm)
      setSelected(response.data.referat)
      setReceiveOpen(false)
      setReceiptForm({ valoare_factura: '', observatii: '' })
      setMessage(response.data.necesita_reaprobare ? 'Factura depășește referatul cu peste 5%. Este necesară reaprobare.' : 'Recepția a fost înregistrată.')
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Recepția nu a putut fi înregistrată.')
    }
  }

  async function printSelectedReferat() {
    if (!selected?.id && !selected?.uuid) return
    setError('')
    try {
      await openApiFile(`/referate/${selected.uuid || selected.id}/pdf`, `referat-${selected.serie || 'REF'}-${selected.numar || selected.id}.html`)
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Referatul nu a putut fi deschis pentru tipărire.')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold text-slate-900">Referate</h1><p className="text-sm text-slate-500">Aprovizionare și servicii, cu flux complet de avizare.</p></div>
        {canCreate ? <Button onClick={() => setCreateOpen(true)}>+ Referat nou</Button> : null}
      </div>

      <ContextHelp
        eyebrow="Ghid referate"
        title="Referatul trebuie să iasă din draft și să ajungă controlat la recepție"
        description="Fluxul e sănătos când drafturile sunt puține, avizările nu stau blocate, iar referatele aprobate au documentele justificative completate."
        icon="📋"
        tone={referateHelp.tone}
        steps={referateHelp.steps}
        tips={[
          'CPV-ul corect ajută mai târziu în PAAP și raportări.',
          'Dacă factura depășește referatul, fluxul trebuie retrimis pentru control.',
          'Referatele aprobate sunt punctul de legătură dintre necesar, achiziție și documente.',
        ]}
        nextAction={referateHelp.nextAction}
        compact
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {tabs.map(tab => <button key={tab.key} className={`rounded-lg border p-3 text-left ${activeTab === tab.key ? 'border-primary-500 bg-primary-50' : 'border-slate-200 bg-white'}`} onClick={() => setActiveTab(tab.key)}><div className="text-xs uppercase text-slate-500">{tab.label}</div><div className="text-xl font-semibold">{statFor(stats, tab.key)}</div></button>)}
      </div>

      {error ? <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {message ? <div className="rounded-md border border-primary-100 bg-primary-50 px-4 py-3 text-sm text-primary-700">{message}</div> : null}

      <Card title="Lista referatelor" loading={loading}>
        <div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200 text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Nr.</th><th className="px-3 py-2">Data</th><th className="px-3 py-2">Tip</th><th className="px-3 py-2">Departament</th><th className="px-3 py-2">Contract</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Valoare</th><th /></tr></thead><tbody className="divide-y divide-slate-100">{referate.length ? referate.map(item => <tr key={item.id}><td className="px-3 py-3 font-medium">{item.serie}/{item.numar}</td><td className="px-3 py-3">{item.data_intocmire}</td><td className="px-3 py-3 capitalize">{item.tip}</td><td className="px-3 py-3">{item.departament || '-'}</td><td className="px-3 py-3 text-xs">{item.contract_numar ? <Badge tone="info">{item.contract_numar}</Badge> : '—'}</td><td className="px-3 py-3"><Badge variant={statusTone(item.status)}>{flowLabels[item.status] || item.status}</Badge></td><td className="px-3 py-3 text-right">{money(item.valoare_referat)} RON</td><td className="px-3 py-3 text-right"><Button size="sm" variant="secondary" onClick={() => openDetails(item)}>Detalii</Button></td></tr>) : <tr><td colSpan="8" className="px-3 py-8 text-center text-slate-500">Nu există referate pentru filtrul selectat.</td></tr>}</tbody></table></div>
      </Card>

      <Modal open={createOpen} title="Referat nou" size="xl" onClose={() => setCreateOpen(false)}>
        <form className="grid gap-4" onSubmit={createReferat}>
          <div className="grid gap-3 md:grid-cols-3"><Select label="Tip" value={form.tip} onChange={event => setForm({ ...form, tip: event.target.value })} options={[{ value: 'aprovizionare', label: 'Aprovizionare' }, { value: 'servicii', label: 'Servicii' }]} /><Input label="Data întocmirii" type="date" value={form.data_intocmire} onChange={event => setForm({ ...form, data_intocmire: event.target.value })} /><Select label="Departament" value={form.departament_id} onChange={event => setForm({ ...form, departament_id: event.target.value })}><option value="">Departamentul utilizatorului</option>{departments.map(item => <option key={item.id} value={item.id}>{item.name || item.denumire}</option>)}</Select></div>
          <Input label="Furnizor propus" value={form.furnizor_manual} onChange={event => setForm({ ...form, furnizor_manual: event.target.value })} />
          <Select label="Contract urmărit" value={form.contract_id || ''} onChange={event => setForm({ ...form, contract_id: event.target.value })} options={contractOptions} />
          <div className="overflow-x-auto"><table className="min-w-[1100px] divide-y divide-slate-200 text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-2 py-2">Material / serviciu</th><th>Caracteristici</th><th>UM</th><th>Cant.</th><th>Preț</th><th>TVA</th><th className="min-w-56">CPV</th><th /></tr></thead><tbody>{form.items.map((line, index) => <tr key={index} className="divide-x divide-slate-100"><td className="p-2"><input list="referate-materials" className="h-9 w-full rounded border border-slate-300 px-2" value={line.denumire} onChange={event => chooseMaterial(index, event.target.value)} required /></td><td className="p-2"><input className="h-9 w-full rounded border border-slate-300 px-2" value={line.caracteristici} onChange={event => patchLine(index, { caracteristici: event.target.value })} /></td><td className="p-2"><input className="h-9 w-16 rounded border border-slate-300 px-2" value={line.um} onChange={event => patchLine(index, { um: event.target.value })} /></td><td className="p-2"><input className="h-9 w-20 rounded border border-slate-300 px-2" type="number" min="0.001" step="0.001" value={line.cantitate} onChange={event => patchLine(index, { cantitate: event.target.value })} /></td><td className="p-2"><input className="h-9 w-24 rounded border border-slate-300 px-2" type="number" min="0" step="0.01" value={line.pret_unitar} onChange={event => patchLine(index, { pret_unitar: event.target.value })} /></td><td className="p-2"><input className="h-9 w-20 rounded border border-slate-300 px-2" type="number" min="0" step="0.01" value={line.valoare_tva} onChange={event => patchLine(index, { valoare_tva: event.target.value })} /></td><td className="p-2"><CPVSelector label="" value={line.cpv_cod} onChange={cpv_cod => patchLine(index, { cpv_cod })} /></td><td className="p-2"><Button type="button" size="sm" variant="danger" disabled={form.items.length === 1} onClick={() => setForm(current => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))}>Șterge</Button></td></tr>)}</tbody></table><datalist id="referate-materials">{materials.map(item => <option key={item.id} value={materialName(item)} />)}</datalist></div>
          <Button type="button" variant="secondary" onClick={() => setForm(current => ({ ...current, items: [...current.items, emptyLine()] }))}>+ Adaugă poziție</Button>
          <Input label="Observații" value={form.observatii} onChange={event => setForm({ ...form, observatii: event.target.value })} />
          <div className="flex items-center justify-between"><strong>Total: {money(totalForm)} RON</strong><Button type="submit">Salvează referatul</Button></div>
        </form>
      </Modal>

      <Modal open={!!selected} title={selected ? `Referat ${selected.serie}/${selected.numar}` : 'Referat'} size="xl" onClose={() => setSelected(null)}>
        {selected ? <div className="grid gap-4">
          {selected.necesita_reaprobare ? <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm font-medium text-rose-700">Factura depășește valoarea referatului cu {selected.diferenta_prc}%. Este necesară reaprobare.</div> : null}
          <div className="flex flex-wrap gap-2"><Badge variant={statusTone(selected.status)}>{flowLabels[selected.status] || selected.status}</Badge>{selected.contract_numar ? <Badge tone="info">Contract {selected.contract_numar}</Badge> : null}<span className="text-sm text-slate-600">{selected.tip} / {selected.departament || '-'}</span><strong className="ml-auto">{money(selected.valoare_referat)} RON</strong></div>
          <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-2">Poziție</th><th>UM</th><th>Cant.</th><th>Stoc magazie</th><th>CPV</th></tr></thead><tbody>{selected.items.map(item => <tr key={item.id} className="border-t"><td className="p-2">{item.denumire}</td><td>{item.um}</td><td>{item.cantitate}</td><td>{item.stoc_magazie}</td><td>{item.cpv_cod || '-'}</td></tr>)}</tbody></table></div>
          <div><h3 className="mb-2 font-semibold">Timeline flux</h3><div className="grid gap-2 border-l-2 border-primary-200 pl-4">{selected.flux.map(item => <div key={item.id} className="rounded border border-slate-200 p-2 text-sm"><strong>{flowLabels[item.pas] || item.pas}</strong> · {item.user_name || '-'}<div className="text-xs text-slate-500">{new Date(item.data_actiune).toLocaleString('ro-RO')} · {item.actiune}</div>{item.observatii ? <div>{item.observatii}</div> : null}</div>)}</div></div>
          {!['aprobat', 'respins'].includes(selected.status) ? <div className="grid gap-2"><Input label="Nr. înregistrare / observații flux" value={flowForm.nr_inregistrare} onChange={event => setFlowForm({ ...flowForm, nr_inregistrare: event.target.value })} /><Input label="Observații" value={flowForm.observatii} onChange={event => setFlowForm({ ...flowForm, observatii: event.target.value })} /><div className="flex gap-2"><Button onClick={() => advance()}>Înaintează</Button><Button variant="danger" onClick={() => advance('respinge')}>Respinge</Button></div></div> : null}
          <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={printSelectedReferat}>📄 Tipărește PDF</Button><Button variant="secondary" onClick={() => setReceiveOpen(true)}>Înregistrează recepție</Button></div>
        </div> : null}
      </Modal>

      <Modal open={receiveOpen} title="Recepție factură" onClose={() => setReceiveOpen(false)}><form className="grid gap-3" onSubmit={receive}><Input label="Valoare factură RON" type="number" min="0" step="0.01" value={receiptForm.valoare_factura} onChange={event => setReceiptForm({ ...receiptForm, valoare_factura: event.target.value })} required /><Input label="Observații" value={receiptForm.observatii} onChange={event => setReceiptForm({ ...receiptForm, observatii: event.target.value })} /><Button type="submit">Salvează recepția</Button></form></Modal>
    </div>
  )
}
