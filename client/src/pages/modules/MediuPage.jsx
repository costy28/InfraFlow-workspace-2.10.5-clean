import { useEffect, useMemo, useState } from 'react'
import api from '../../api/client'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'

const tabs = ['Autorizatii', 'Deseuri', 'Inventar Emisii', 'Monitorizare', 'Incidente', 'Alerte']
const currentYear = new Date().getFullYear()

const emptyAuth = { tip: 'Autorizatie de mediu', numar: '', data_emitere: '', data_expirare: '', emitent: '', conditii: '', notificare_zile: 60 }
const emptyEmission = { an: currentYear, sursa: '', poluant: '', cantitate: '', um: 'kg', metoda_calcul: '', observatii: '' }
const emptyMonitoring = { data: new Date().toISOString().slice(0, 10), punct: '', indicator: '', valoare: '', limita: '', um: '', masuri: '' }
const emptyIncident = { locatie: '', tip: '', gravitate: 'medie', descriere: '', masuri: '', status: 'deschis' }

function number(value) {
  const parsed = Number(String(value ?? 0).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function statusBadge(status) {
  const tone = status === 'expirata' ? 'danger' : status === 'notificare' ? 'warning' : 'success'
  return <Badge tone={tone}>{status || 'valida'}</Badge>
}

function Field({ label, value, onChange, type = 'text', ...props }) {
  return <Input label={label} value={value ?? ''} type={type} onChange={e => onChange(e.target.value)} {...props} />
}

export default function MediuPage() {
  const [activeTab, setActiveTab] = useState('Autorizatii')
  const [year, setYear] = useState(currentYear)
  const [wasteType, setWasteType] = useState('proddes')
  const [loading, setLoading] = useState(false)
  const [autorizatii, setAutorizatii] = useState([])
  const [deseuri, setDeseuri] = useState({ rows: [], coduri: [] })
  const [emisii, setEmisii] = useState([])
  const [monitorizare, setMonitorizare] = useState([])
  const [incidente, setIncidente] = useState([])
  const [alerts, setAlerts] = useState({ urgent: [], atentie: [], raportari: [] })
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({})

  const wasteRows = deseuri.rows || []
  const wasteCodes = deseuri.coduri || []

  async function loadAll() {
    setLoading(true)
    try {
      const [authRes, wasteRes, emisiiRes, monitoringRes, incidentsRes, alertsRes] = await Promise.all([
        api.get('/environment/autorizatii'),
        api.get('/environment/deseuri', { params: { an: year, tip: wasteType } }),
        api.get('/environment/emisii', { params: { an: year } }),
        api.get('/environment/monitorizare'),
        api.get('/environment/incidente'),
        api.get('/environment/alerts')
      ])
      setAutorizatii(authRes.data || [])
      setDeseuri(wasteRes.data || { rows: [], coduri: [] })
      setEmisii(emisiiRes.data || [])
      setMonitorizare(monitoringRes.data || [])
      setIncidente(incidentsRes.data || [])
      setAlerts(alertsRes.data || { urgent: [], atentie: [], raportari: [] })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [year, wasteType])

  const totals = useMemo(() => {
    return {
      gen: wasteRows.reduce((sum, row) => sum + number(row.cantitate_gen || row.cantitate_colectata), 0),
      val: wasteRows.reduce((sum, row) => sum + number(row.cantitate_valorificata || row.cantitate_reciclata), 0),
      elim: wasteRows.reduce((sum, row) => sum + number(row.cantitate_eliminata || row.cantitate_depozitata), 0)
    }
  }, [wasteRows])

  function openModal(type, initial) {
    const defaults = { auth: emptyAuth, emisii: emptyEmission, monitorizare: emptyMonitoring, incident: emptyIncident }[type] || {}
    setForm({ ...defaults, ...initial })
    setModal(type)
  }

  async function saveModal() {
    if (modal === 'auth') await api.post('/environment/autorizatii', form)
    if (modal === 'emisii') await api.post('/environment/emisii', { ...form, an: year })
    if (modal === 'monitorizare') await api.post('/environment/monitorizare', form)
    if (modal === 'incident') await api.post('/environment/incidente', form)
    setModal(null)
    setForm({})
    await loadAll()
  }

  async function updateWasteRow(row, patch) {
    const next = wasteRows.map(item => item.id === row.id ? { ...item, ...patch } : item)
    setDeseuri(prev => ({ ...prev, rows: next }))
  }

  async function saveWasteRow(row) {
    if (String(row.id).startsWith('pre-') || !row.created_at) {
      const payload = { ...row, tip: wasteType, an: year }
      delete payload.id
      await api.post('/environment/deseuri', payload)
    } else {
      await api.post(`/environment/deseuri/${row.id}?tip=${wasteType}`, { ...row, tip: wasteType })
    }
    await loadAll()
  }

  async function addWasteRow(code) {
    const base = wasteType === 'mun'
      ? { an: year, cod_deseu: code.cod, denumire: code.denumire, luna: '', cantitate_colectata: 0, cantitate_reciclata: 0, cantitate_depozitata: 0, localitate: '', operator: '' }
      : { an: year, cod_deseu: code.cod, denumire: code.denumire, cantitate_gen: 0, cantitate_valorificata: 0, cantitate_eliminata: 0, stoc_final: 0, operator_valorificare: '', operator_eliminare: '', sursa_auto: 'manual' }
    await api.post('/environment/deseuri', { ...base, tip: wasteType })
    await loadAll()
  }

  async function precompleteWaste() {
    const res = await api.get('/environment/deseuri/precompl', { params: { an: year } })
    setDeseuri(prev => ({ ...prev, rows: res.data?.rows || [] }))
  }

  async function exportWaste() {
    const endpoint = wasteType === 'mun' ? '/environment/export-sim-mun' : '/environment/export-sim-proddes'
    const filename = wasteType === 'mun' ? `GD-MUN-${year}.xls` : `GD-PRODDES-${year}.xls`
    const res = await api.get(endpoint, { params: { an: year }, responseType: 'blob' })
    downloadBlob(res.data, filename)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mediu</h1>
          <p className="text-sm text-slate-500">Autorizatii, deseuri, emisii, monitorizare, incidente si alerte.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input label="An" type="number" value={year} onChange={e => setYear(Number(e.target.value || currentYear))} className="w-28" />
          <Button variant="secondary" onClick={loadAll} loading={loading}>Reincarca</Button>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap gap-2">
          {tabs.map(tab => (
            <Button key={tab} variant={activeTab === tab ? 'primary' : 'secondary'} onClick={() => setActiveTab(tab)}>
              {tab}
            </Button>
          ))}
        </div>
      </Card>

      {activeTab === 'Autorizatii' && (
        <Card
          title="Autorizatii de mediu"
          actions={<Button onClick={() => openModal('auth')}>+ Autorizatie</Button>}
          loading={loading}
        >
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead><tr className="border-b text-left text-slate-500"><th className="py-2">Tip</th><th>Numar</th><th>Emitent</th><th>Expira</th><th>Status</th><th>Conditii</th></tr></thead>
              <tbody>
                {autorizatii.map(item => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{item.tip}</td>
                    <td>{item.numar}</td>
                    <td>{item.emitent}</td>
                    <td>{item.data_expirare || 'Fara termen'}</td>
                    <td>{statusBadge(item.status)}</td>
                    <td className="max-w-md truncate">{item.conditii}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'Deseuri' && (
        <Card
          title="Raportari deseuri"
          subtitle="PRODDES si deseuri municipale, pregatite pentru export SIM."
          actions={
            <>
              <Button variant={wasteType === 'proddes' ? 'primary' : 'secondary'} onClick={() => setWasteType('proddes')}>PRODDES</Button>
              <Button variant={wasteType === 'mun' ? 'primary' : 'secondary'} onClick={() => setWasteType('mun')}>MUN</Button>
              {wasteType === 'proddes' && <Button variant="secondary" onClick={precompleteWaste}>Precompleteaza</Button>}
              <Button onClick={exportWaste}>Export SIM</Button>
            </>
          }
        >
          <div className="mb-3 grid gap-2 rounded-md bg-slate-50 p-3 text-sm md:grid-cols-3">
            <div>Total generat/colectat: <b>{totals.gen.toFixed(3)} t</b></div>
            <div>Total valorificat/reciclat: <b>{totals.val.toFixed(3)} t</b></div>
            <div>Total eliminat/depozitat: <b>{totals.elim.toFixed(3)} t</b></div>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {wasteCodes.map(code => (
              <Button key={code.cod} size="sm" variant="secondary" onClick={() => addWasteRow(code)}>
                + {code.cod} {code.periculos ? '*' : ''}
              </Button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="py-2">Cod</th><th>Denumire</th>
                  {wasteType === 'mun' ? <><th>Luna</th><th>Colectat</th><th>Reciclat</th><th>Depozitat</th><th>Localitate</th><th>Operator</th></> : <><th>Generat</th><th>Valorificat</th><th>Eliminat</th><th>Stoc</th><th>Op. valorificare</th><th>Op. eliminare</th><th>Sursa</th></>}
                  <th>Actiuni</th>
                </tr>
              </thead>
              <tbody>
                {wasteRows.map(row => (
                  <tr key={row.id} className="border-b align-top last:border-0">
                    <td className="py-2 font-mono">{row.cod_deseu}</td>
                    <td className="min-w-64">{row.denumire}</td>
                    {wasteType === 'mun' ? (
                      <>
                        <td><input className="w-16 rounded border px-2 py-1" value={row.luna || ''} onChange={e => updateWasteRow(row, { luna: e.target.value })} /></td>
                        <td><input className="w-24 rounded border px-2 py-1" value={row.cantitate_colectata || 0} onChange={e => updateWasteRow(row, { cantitate_colectata: e.target.value })} /></td>
                        <td><input className="w-24 rounded border px-2 py-1" value={row.cantitate_reciclata || 0} onChange={e => updateWasteRow(row, { cantitate_reciclata: e.target.value })} /></td>
                        <td><input className="w-24 rounded border px-2 py-1" value={row.cantitate_depozitata || 0} onChange={e => updateWasteRow(row, { cantitate_depozitata: e.target.value })} /></td>
                        <td><input className="w-36 rounded border px-2 py-1" value={row.localitate || ''} onChange={e => updateWasteRow(row, { localitate: e.target.value })} /></td>
                        <td><input className="w-44 rounded border px-2 py-1" value={row.operator || ''} onChange={e => updateWasteRow(row, { operator: e.target.value })} /></td>
                      </>
                    ) : (
                      <>
                        <td><input className="w-24 rounded border px-2 py-1" value={row.cantitate_gen || 0} onChange={e => updateWasteRow(row, { cantitate_gen: e.target.value })} /></td>
                        <td><input className="w-24 rounded border px-2 py-1" value={row.cantitate_valorificata || 0} onChange={e => updateWasteRow(row, { cantitate_valorificata: e.target.value })} /></td>
                        <td><input className="w-24 rounded border px-2 py-1" value={row.cantitate_eliminata || 0} onChange={e => updateWasteRow(row, { cantitate_eliminata: e.target.value })} /></td>
                        <td><input className="w-24 rounded border px-2 py-1" value={row.stoc_final || 0} onChange={e => updateWasteRow(row, { stoc_final: e.target.value })} /></td>
                        <td><input className="w-44 rounded border px-2 py-1" value={row.operator_valorificare || ''} onChange={e => updateWasteRow(row, { operator_valorificare: e.target.value })} /></td>
                        <td><input className="w-44 rounded border px-2 py-1" value={row.operator_eliminare || ''} onChange={e => updateWasteRow(row, { operator_eliminare: e.target.value })} /></td>
                        <td>{row.sursa_auto || 'manual'}</td>
                      </>
                    )}
                    <td><Button size="sm" onClick={() => saveWasteRow(row)}>Salveaza</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'Inventar Emisii' && (
        <Card title="Inventar emisii" actions={<Button onClick={() => openModal('emisii')}>+ Emisie</Button>}>
          <div className="grid gap-3 md:grid-cols-3">
            {emisii.map(item => (
              <div key={item.id} className="rounded-md border p-3 text-sm">
                <div className="font-semibold">{item.sursa}</div>
                <div>{item.poluant}: <b>{item.cantitate} {item.um}</b></div>
                <div className="text-slate-500">{item.metoda_calcul}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {activeTab === 'Monitorizare' && (
        <Card title="Monitorizare indicatori" actions={<Button onClick={() => openModal('monitorizare')}>+ Masuratoare</Button>}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead><tr className="border-b text-left text-slate-500"><th className="py-2">Data</th><th>Punct</th><th>Indicator</th><th>Valoare</th><th>Limita</th><th>Status</th><th>Masuri</th></tr></thead>
              <tbody>{monitorizare.map(item => <tr key={item.id} className="border-b last:border-0"><td className="py-2">{item.data}</td><td>{item.punct}</td><td>{item.indicator}</td><td>{item.valoare} {item.um}</td><td>{item.limita ?? '-'}</td><td><Badge tone={item.depasit ? 'danger' : 'success'}>{item.depasit ? 'Depasit' : 'OK'}</Badge></td><td>{item.masuri}</td></tr>)}</tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'Incidente' && (
        <Card title="Incidente de mediu" actions={<Button onClick={() => openModal('incident')}>+ Incident</Button>}>
          <div className="grid gap-3 md:grid-cols-2">
            {incidente.map(item => (
              <div key={item.uuid} className="rounded-md border p-3">
                <div className="flex justify-between gap-3"><b>{item.tip}</b><Badge tone={item.status === 'deschis' ? 'warning' : 'success'}>{item.status}</Badge></div>
                <div className="text-sm text-slate-500">{item.locatie} - {String(item.data || '').slice(0, 10)}</div>
                <p className="mt-2 text-sm">{item.descriere}</p>
                <div className="mt-2 text-sm"><b>Masuri:</b> {item.masuri || '-'}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {activeTab === 'Alerte' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <AlertCard title="Urgente" tone="danger" items={alerts.urgent} />
          <AlertCard title="Atentie" tone="warning" items={alerts.atentie} />
          <AlertCard title="Raportari" tone="blue" items={alerts.raportari} />
        </div>
      )}

      <Modal open={!!modal} title={modalTitle(modal)} onClose={() => setModal(null)} size="lg">
        <div className="grid gap-3 md:grid-cols-2">
          {modal === 'auth' && (
            <>
              <Field label="Tip" value={form.tip} onChange={v => setForm({ ...form, tip: v })} />
              <Field label="Numar" value={form.numar} onChange={v => setForm({ ...form, numar: v })} />
              <Field label="Data emitere" type="date" value={form.data_emitere} onChange={v => setForm({ ...form, data_emitere: v })} />
              <Field label="Data expirare" type="date" value={form.data_expirare} onChange={v => setForm({ ...form, data_expirare: v })} />
              <Field label="Emitent" value={form.emitent} onChange={v => setForm({ ...form, emitent: v })} />
              <Field label="Notificare zile" type="number" value={form.notificare_zile} onChange={v => setForm({ ...form, notificare_zile: v })} />
              <label className="md:col-span-2 grid gap-1 text-sm font-medium text-slate-700">Conditii<textarea className="min-h-24 rounded border px-3 py-2" value={form.conditii || ''} onChange={e => setForm({ ...form, conditii: e.target.value })} /></label>
            </>
          )}
          {modal === 'emisii' && (
            <>
              <Field label="Sursa" value={form.sursa} onChange={v => setForm({ ...form, sursa: v })} />
              <Field label="Poluant" value={form.poluant} onChange={v => setForm({ ...form, poluant: v })} />
              <Field label="Cantitate" value={form.cantitate} onChange={v => setForm({ ...form, cantitate: v })} />
              <Field label="UM" value={form.um} onChange={v => setForm({ ...form, um: v })} />
              <Field label="Metoda calcul" value={form.metoda_calcul} onChange={v => setForm({ ...form, metoda_calcul: v })} />
              <Field label="Observatii" value={form.observatii} onChange={v => setForm({ ...form, observatii: v })} />
            </>
          )}
          {modal === 'monitorizare' && (
            <>
              <Field label="Data" type="date" value={form.data} onChange={v => setForm({ ...form, data: v })} />
              <Field label="Punct" value={form.punct} onChange={v => setForm({ ...form, punct: v })} />
              <Field label="Indicator" value={form.indicator} onChange={v => setForm({ ...form, indicator: v })} />
              <Field label="Valoare" value={form.valoare} onChange={v => setForm({ ...form, valoare: v })} />
              <Field label="Limita" value={form.limita} onChange={v => setForm({ ...form, limita: v })} />
              <Field label="UM" value={form.um} onChange={v => setForm({ ...form, um: v })} />
              <label className="md:col-span-2 grid gap-1 text-sm font-medium text-slate-700">Masuri<textarea className="min-h-20 rounded border px-3 py-2" value={form.masuri || ''} onChange={e => setForm({ ...form, masuri: e.target.value })} /></label>
            </>
          )}
          {modal === 'incident' && (
            <>
              <Field label="Locatie" value={form.locatie} onChange={v => setForm({ ...form, locatie: v })} />
              <Field label="Tip" value={form.tip} onChange={v => setForm({ ...form, tip: v })} />
              <label className="grid gap-1 text-sm font-medium text-slate-700">Gravitate<select className="h-10 rounded border px-3" value={form.gravitate} onChange={e => setForm({ ...form, gravitate: e.target.value })}><option>mica</option><option>medie</option><option>mare</option><option>critica</option></select></label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">Status<select className="h-10 rounded border px-3" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option>deschis</option><option>in_lucru</option><option>inchis</option></select></label>
              <label className="md:col-span-2 grid gap-1 text-sm font-medium text-slate-700">Descriere<textarea className="min-h-20 rounded border px-3 py-2" value={form.descriere || ''} onChange={e => setForm({ ...form, descriere: e.target.value })} /></label>
              <label className="md:col-span-2 grid gap-1 text-sm font-medium text-slate-700">Masuri<textarea className="min-h-20 rounded border px-3 py-2" value={form.masuri || ''} onChange={e => setForm({ ...form, masuri: e.target.value })} /></label>
            </>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setModal(null)}>Anuleaza</Button>
          <Button onClick={saveModal}>Salveaza</Button>
        </div>
      </Modal>
    </div>
  )
}

function modalTitle(modal) {
  return {
    auth: 'Autorizatie noua',
    emisii: 'Inregistrare emisie',
    monitorizare: 'Masuratoare monitorizare',
    incident: 'Incident de mediu'
  }[modal] || 'Mediu'
}

function AlertCard({ title, items = [], tone }) {
  return (
    <Card title={title} actions={<Badge tone={tone}>{items.length}</Badge>}>
      <div className="space-y-2">
        {items.length === 0 && <p className="text-sm text-slate-500">Nu exista alerte.</p>}
        {items.map((item, index) => (
          <div key={index} className="rounded-md border p-3 text-sm">
            <div className="font-medium">{item.mesaj}</div>
            <div className="text-xs text-slate-500">{item.tip}</div>
          </div>
        ))}
      </div>
    </Card>
  )
}
