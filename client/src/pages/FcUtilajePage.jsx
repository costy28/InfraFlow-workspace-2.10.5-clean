import { useEffect, useMemo, useState } from 'react'
import api from '../api/client'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Input from '../components/ui/Input'
import PageHeader from '../components/ui/PageHeader'
import Select from '../components/ui/Select'
import Table from '../components/ui/Table'
import { formatDate } from '../utils/format'

const tabs = ['Introducere date', 'Istoric', 'FAZ Lunar']

const hourFields = [
  'ore_lucru_efectiv',
  'ore_deplasare',
  'ore_asteptare',
  'ore_imobilizare',
  'ore_reparatii',
  'ore_standby',
  'ore_defect',
  'ore_ll',
  'ore_sll',
  'ore_lm',
  'ore_lc',
  'ore_ac'
]

function today() {
  return new Date().toISOString().slice(0, 10)
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7)
}

function arrayFrom(data, keys) {
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key]
  }
  return []
}

function numberValue(value) {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function assetLabel(asset) {
  return [
    asset.cod || asset.nr_inmatriculare || asset.registration || asset.nr_inventar,
    [asset.marca || asset.brand, asset.model].filter(Boolean).join(' ')
  ].filter(Boolean).join(' / ') || asset.name || `#${asset.id}`
}

function employeeLabel(employee) {
  return [employee.nume, employee.prenume].filter(Boolean).join(' ') || employee.name || employee.fullName || `#${employee.id}`
}

function assetConsumption(asset) {
  return numberValue(
    asset?.consum_orar_normat ??
    asset?.consumOrarNormat ??
    asset?.consum_orar ??
    asset?.consumUtilaj ??
    asset?.standardConsumptionHour
  )
}

function diffVariant(diff, norm) {
  const normat = numberValue(norm)
  const value = numberValue(diff)
  if (!normat || value <= normat * 0.1) return 'green'
  if (value <= normat * 0.25) return 'yellow'
  return 'red'
}

const initialForm = {
  asset_id: '',
  operator_id: '',
  operator_text: '',
  data: today(),
  locatie: '',
  tip_activitate_id: '',
  activitati_text: '',
  ore_program: '8',
  ore_lucru_efectiv: '',
  ore_deplasare: '',
  ore_asteptare: '',
  ore_imobilizare: '',
  ore_reparatii: '',
  ore_standby: '',
  ore_defect: '',
  ore_ll: '',
  ore_sll: '',
  ore_lm: '',
  ore_lc: '',
  ore_ac: '',
  motorina_l: '',
  benzina_l: '',
  ulei_motor_l: '',
  ulei_hidraulic_l: '',
  ulei_transmisie_l: '',
  vaselina_kg: ''
}

export default function FcUtilajePage() {
  const [activeTab, setActiveTab] = useState('Introducere date')
  const [logs, setLogs] = useState([])
  const [assets, setAssets] = useState([])
  const [employees, setEmployees] = useState([])
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [form, setForm] = useState(initialForm)
  const [filters, setFilters] = useState({ asset_id: '', luna: currentMonth(), status: '' })

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [logsRes, assetsRes, employeesRes, activitiesRes] = await Promise.allSettled([
        api.get('/fleet/fc-logs'),
        api.get('/fleet-assets?tip=utilaj'),
        api.get('/hr/employees?activ=1'),
        api.get('/fleet/faz-activities')
      ])
      if (logsRes.status === 'fulfilled') setLogs(arrayFrom(logsRes.value.data, ['fc_logs', 'items', 'data']))
      if (assetsRes.status === 'fulfilled') {
        const nextAssets = arrayFrom(assetsRes.value.data, ['assets', 'fleetAssets', 'items', 'data'])
        setAssets(nextAssets)
        setForm(current => ({ ...current, asset_id: current.asset_id || nextAssets[0]?.id || '' }))
      }
      if (employeesRes.status === 'fulfilled') setEmployees(arrayFrom(employeesRes.value.data, ['employees', 'items', 'data']))
      if (activitiesRes.status === 'fulfilled') setActivities(arrayFrom(activitiesRes.value.data, ['activities', 'items', 'data']))
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut încărca datele FC Utilaje.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    Promise.resolve().then(() => load())
  }, [])

  const selectedAsset = assets.find(asset => String(asset.id) === String(form.asset_id))
  const totalOre = useMemo(() => hourFields.reduce((sum, field) => sum + numberValue(form[field]), 0), [form])
  const consumOrar = assetConsumption(selectedAsset)
  const consumNormat = numberValue(form.ore_lucru_efectiv) * consumOrar
  const diferenta = numberValue(form.motorina_l) - consumNormat
  const oreDiff = Math.abs(totalOre - numberValue(form.ore_program))

  const visibleLogs = useMemo(() => {
    return logs.filter(row => {
      const matchAsset = !filters.asset_id || String(row.asset_id) === String(filters.asset_id)
      const matchLuna = !filters.luna || String(row.luna || row.data || '').startsWith(filters.luna)
      const matchStatus = !filters.status || row.status === filters.status
      return matchAsset && matchLuna && matchStatus
    })
  }, [logs, filters])

  const fazRows = useMemo(() => visibleLogs.filter(row => row.status === 'completat' || row.status === 'in_faz'), [visibleLogs])
  const fazTotals = useMemo(() => fazRows.reduce((sum, row) => ({
    ore_program: sum.ore_program + numberValue(row.ore_program),
    ore_lucru_efectiv: sum.ore_lucru_efectiv + numberValue(row.ore_lucru_efectiv),
    ore_imobilizare: sum.ore_imobilizare + numberValue(row.ore_imobilizare),
    ore_asteptare: sum.ore_asteptare + numberValue(row.ore_asteptare),
    ore_reparatii: sum.ore_reparatii + numberValue(row.ore_reparatii),
    ore_total: sum.ore_total + numberValue(row.ore_total),
    motorina_l: sum.motorina_l + numberValue(row.motorina_l),
    benzina_l: sum.benzina_l + numberValue(row.benzina_l),
    consum_normat: sum.consum_normat + numberValue(row.consum_normat),
    diferenta_motorina: sum.diferenta_motorina + numberValue(row.diferenta_motorina)
  }), {
    ore_program: 0,
    ore_lucru_efectiv: 0,
    ore_imobilizare: 0,
    ore_asteptare: 0,
    ore_reparatii: 0,
    ore_total: 0,
    motorina_l: 0,
    benzina_l: 0,
    consum_normat: 0,
    diferenta_motorina: 0
  }), [fazRows])

  function setField(field, value) {
    setForm(current => ({ ...current, [field]: value }))
  }

  async function saveFc(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const response = await api.post('/fleet/fc-logs', form)
      setLogs(rows => [response.data.fc_log, ...rows])
      setForm(current => ({ ...initialForm, asset_id: current.asset_id, data: today() }))
      setMessage('Fișa de consum a fost salvată.')
    } catch (err) {
      setError(err.response?.data?.error || 'Fișa de consum nu a putut fi salvată.')
    } finally {
      setSaving(false)
    }
  }

  async function completeFc(row) {
    try {
      const response = await api.patch(`/fleet/fc-logs/${row.uuid}/complete`)
      setLogs(items => items.map(item => item.uuid === row.uuid ? response.data.fc_log : item))
      setMessage('FC marcată ca finalizată.')
    } catch (err) {
      setError(err.response?.data?.error || 'FC nu a putut fi finalizată.')
    }
  }

  async function printFc(row) {
    try {
      const response = await api.get(`/fleet/fc-logs/${row.uuid}/pdf`, { responseType: 'text' })
      const win = window.open('', '_blank')
      win.document.write(response.data)
      win.document.close()
    } catch (err) {
      setError(err.response?.data?.error || 'Raportul nu a putut fi deschis.')
    }
  }

  async function generateFaz() {
    if (!window.confirm(`Generezi FAZ utilaje pentru ${filters.luna}? FC-urile completate vor fi marcate in_faz.`)) return
    try {
      const response = await api.post('/fleet/fc-logs/faz-generate', {
        luna: filters.luna,
        asset_id: filters.asset_id || undefined
      })
      setMessage(`FAZ generat: ${response.data.fc} fișe, ${response.data.total_ore} ore.`)
      await load()
      const win = window.open('', '_blank')
      win.document.write(response.data.html)
      win.document.close()
    } catch (err) {
      setError(err.response?.data?.error || 'FAZ-ul lunar nu a putut fi generat.')
    }
  }

  function exportCsv() {
    const header = ['Data', 'Utilaj', 'Operator', 'Ore total', 'Motorina', 'Consum normat', 'Diferenta']
    const rows = fazRows.map(row => [
      row.data,
      row.asset_label,
      row.operator_nume,
      row.ore_total,
      row.motorina_l,
      row.consum_normat,
      row.diferenta_motorina
    ])
    const csv = [header, ...rows].map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `faz-utilaje-${filters.luna}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const historyColumns = [
    { key: 'data', label: 'Data', render: row => formatDate(row.data) },
    { key: 'asset_label', label: 'Utilaj' },
    { key: 'operator_nume', label: 'Operator' },
    { key: 'ore_lucru_efectiv', label: 'Ore LE' },
    { key: 'motorina_l', label: 'Motorină' },
    { key: 'consum_normat', label: 'Consum normat', render: row => row.consum_normat == null ? '-' : Number(row.consum_normat).toFixed(2) },
    { key: 'diferenta_motorina', label: 'Diferență', render: row => <Badge variant={diffVariant(row.diferenta_motorina, row.consum_normat)}>{Number(row.diferenta_motorina || 0).toFixed(2)}</Badge> },
    { key: 'status', label: 'Status', render: row => <Badge variant={row.status === 'draft' ? 'gray' : row.status === 'completat' ? 'green' : 'blue'}>{row.status}</Badge> },
    { key: 'actions', label: '', render: row => (
      <div className="flex flex-wrap gap-2">
        {row.status === 'draft' ? <Button size="sm" variant="secondary" onClick={() => completeFc(row)}>Finalizează</Button> : null}
        <Button size="sm" variant="ghost" onClick={() => printFc(row)}>Print</Button>
      </div>
    ) }
  ]

  return (
    <div className="grid gap-4">
      <PageHeader
        title="FC Utilaje"
        subtitle="Fișe consum zilnice, consum normat și centralizare FAZ lunar pentru utilaje."
      />

      {error && <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {message && <div className="rounded-md border border-primary-100 bg-primary-50 px-4 py-3 text-sm text-primary-700">{message}</div>}

      <div className="flex flex-wrap gap-2">
        {tabs.map(tab => (
          <Button key={tab} variant={activeTab === tab ? 'primary' : 'secondary'} onClick={() => setActiveTab(tab)}>
            {tab}
          </Button>
        ))}
      </div>

      {activeTab === 'Introducere date' && (
        <form onSubmit={saveFc} className="grid gap-4">
          <Card title="FIȘĂ CONSUM UTILAJ" subtitle="Datele se introduc din raportul de hârtie al mecanicului deservent.">
            <div className="grid gap-4 lg:grid-cols-3">
              <Select label="Utilaj" value={form.asset_id} onChange={event => setField('asset_id', event.target.value)} required>
                {assets.map(asset => <option key={asset.id} value={asset.id}>{assetLabel(asset)}</option>)}
              </Select>
              <Select label="Operator" value={form.operator_id} onChange={event => setField('operator_id', event.target.value)}>
                <option value="">Text liber / fără angajat</option>
                {employees.map(employee => <option key={employee.id} value={employee.id}>{employeeLabel(employee)}</option>)}
              </Select>
              <Input label="Operator text" value={form.operator_text} onChange={event => setField('operator_text', event.target.value)} />
              <Input label="Data" type="date" value={form.data} onChange={event => setField('data', event.target.value)} required />
              <Input label="Locație/Lucrare" value={form.locatie} onChange={event => setField('locatie', event.target.value)} />
              <Select label="Activitate" value={form.tip_activitate_id} onChange={event => setField('tip_activitate_id', event.target.value)}>
                <option value="">Alege activitatea</option>
                {activities.map(activity => (
                  <option key={activity.id} value={activity.id}>
                    {[activity.denumire, activity.detalii].filter(Boolean).join(' - ')}
                  </option>
                ))}
              </Select>
            </div>

            <div className="mt-4 grid gap-2">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Observații / activități text liber
                <textarea
                  className="min-h-24 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                  value={form.activitati_text}
                  onChange={event => setField('activitati_text', event.target.value)}
                />
              </label>
            </div>
          </Card>

          <Card title="ORE" subtitle="Totalul calculat trebuie să fie aproape egal cu Ore program (toleranță ±0.5h).">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Input label="Ore program (OP)" type="number" step="0.25" value={form.ore_program} onChange={event => setField('ore_program', event.target.value)} />
              <Input label="Lucru efectiv (LE)" type="number" step="0.25" value={form.ore_lucru_efectiv} onChange={event => setField('ore_lucru_efectiv', event.target.value)} />
              <Input label="Deplasare" type="number" step="0.25" value={form.ore_deplasare} onChange={event => setField('ore_deplasare', event.target.value)} />
              <Input label="Așteptare (AT)" type="number" step="0.25" value={form.ore_asteptare} onChange={event => setField('ore_asteptare', event.target.value)} />
              <Input label="Imobilizat (IZ)" type="number" step="0.25" value={form.ore_imobilizare} onChange={event => setField('ore_imobilizare', event.target.value)} />
              <Input label="Reparații (RP)" type="number" step="0.25" value={form.ore_reparatii} onChange={event => setField('ore_reparatii', event.target.value)} />
              <Input label="Standby (SE)" type="number" step="0.25" value={form.ore_standby} onChange={event => setField('ore_standby', event.target.value)} />
              <Input label="Defect" type="number" step="0.25" value={form.ore_defect} onChange={event => setField('ore_defect', event.target.value)} />
              <Input label="LL" type="number" step="0.25" value={form.ore_ll} onChange={event => setField('ore_ll', event.target.value)} />
              <Input label="SLL" type="number" step="0.25" value={form.ore_sll} onChange={event => setField('ore_sll', event.target.value)} />
              <Input label="LM" type="number" step="0.25" value={form.ore_lm} onChange={event => setField('ore_lm', event.target.value)} />
              <Input label="LC" type="number" step="0.25" value={form.ore_lc} onChange={event => setField('ore_lc', event.target.value)} />
              <Input label="AC" type="number" step="0.25" value={form.ore_ac} onChange={event => setField('ore_ac', event.target.value)} />
            </div>
            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
              Total calculat: <strong>{totalOre.toFixed(2)} ore</strong>{' '}
              {oreDiff <= 0.5
                ? <Badge variant="green" className="ml-2">egal cu Ore program</Badge>
                : <Badge variant="yellow" className="ml-2">diferență {oreDiff.toFixed(2)} ore</Badge>}
            </div>
          </Card>

          <Card title="COMBUSTIBIL" subtitle="Consum normat = ore LE × consum orar normat din fișa utilajului.">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Input label="Motorină primită (l)" type="number" step="0.01" value={form.motorina_l} onChange={event => setField('motorina_l', event.target.value)} />
              <Input label="Benzină (l)" type="number" step="0.01" value={form.benzina_l} onChange={event => setField('benzina_l', event.target.value)} />
              <Input label="Ulei motor (l)" type="number" step="0.001" value={form.ulei_motor_l} onChange={event => setField('ulei_motor_l', event.target.value)} />
              <Input label="Ulei hidraulic (l)" type="number" step="0.001" value={form.ulei_hidraulic_l} onChange={event => setField('ulei_hidraulic_l', event.target.value)} />
              <Input label="Ulei transmisie (l)" type="number" step="0.001" value={form.ulei_transmisie_l} onChange={event => setField('ulei_transmisie_l', event.target.value)} />
              <Input label="Vaselină (kg)" type="number" step="0.001" value={form.vaselina_kg} onChange={event => setField('vaselina_kg', event.target.value)} />
            </div>
            <div className="mt-4 grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm md:grid-cols-3">
              <div>Consum normat: <strong>{consumNormat.toFixed(2)} l</strong> ({numberValue(form.ore_lucru_efectiv).toFixed(2)} ore × {consumOrar.toFixed(2)} l/h)</div>
              <div>Diferență: <Badge variant={diffVariant(diferenta, consumNormat)}>{diferenta.toFixed(2)} l</Badge></div>
              <div>Utilaj: <strong>{selectedAsset ? assetLabel(selectedAsset) : '-'}</strong></div>
            </div>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" loading={saving}>💾 Salvează FC</Button>
          </div>
        </form>
      )}

      {activeTab === 'Istoric' && (
        <Card title="Istoric FC" subtitle="Fișele draft pot fi finalizate, apoi intră în FAZ lunar.">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:flex-wrap">
            <Select className="w-full max-w-xs" label="Utilaj" value={filters.asset_id} onChange={event => setFilters(current => ({ ...current, asset_id: event.target.value }))}>
              <option value="">Toate</option>
              {assets.map(asset => <option key={asset.id} value={asset.id}>{assetLabel(asset)}</option>)}
            </Select>
            <Input className="w-full max-w-xs" label="Luna" type="month" value={filters.luna} onChange={event => setFilters(current => ({ ...current, luna: event.target.value }))} />
            <Select className="w-full max-w-xs" label="Status" value={filters.status} onChange={event => setFilters(current => ({ ...current, status: event.target.value }))}>
              <option value="">Toate</option>
              <option value="draft">Draft</option>
              <option value="completat">Completat</option>
              <option value="in_faz">În FAZ</option>
            </Select>
          </div>
          <Table columns={historyColumns} data={visibleLogs} loading={loading} />
        </Card>
      )}

      {activeTab === 'FAZ Lunar' && (
        <div className="grid gap-4">
          <Card title="FAZ Lunar" subtitle="Centralizare lunară per utilaj, din FC-uri completate.">
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:flex-wrap">
              <Input className="w-full max-w-xs" label="Luna" type="month" value={filters.luna} onChange={event => setFilters(current => ({ ...current, luna: event.target.value }))} />
              <Select className="w-full max-w-xs" label="Utilaj" value={filters.asset_id} onChange={event => setFilters(current => ({ ...current, asset_id: event.target.value }))}>
                <option value="">Toate utilajele</option>
                {assets.map(asset => <option key={asset.id} value={asset.id}>{assetLabel(asset)}</option>)}
              </Select>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-md border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Total ore OP</div>
                <div className="text-xl font-semibold">{fazTotals.ore_program.toFixed(2)}</div>
              </div>
              <div className="rounded-md border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Total ore LE</div>
                <div className="text-xl font-semibold">{fazTotals.ore_lucru_efectiv.toFixed(2)}</div>
              </div>
              <div className="rounded-md border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Motorină totală</div>
                <div className="text-xl font-semibold">{fazTotals.motorina_l.toFixed(2)} l</div>
              </div>
              <div className="rounded-md border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Diferență normat</div>
                <div className="text-xl font-semibold">{fazTotals.diferenta_motorina.toFixed(2)} l</div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 rounded-md bg-slate-50 p-3 text-sm md:grid-cols-3">
              <div>Ore IZ: <strong>{fazTotals.ore_imobilizare.toFixed(2)}</strong></div>
              <div>Ore AT: <strong>{fazTotals.ore_asteptare.toFixed(2)}</strong></div>
              <div>Ore RP: <strong>{fazTotals.ore_reparatii.toFixed(2)}</strong></div>
              <div>Ore total: <strong>{fazTotals.ore_total.toFixed(2)}</strong></div>
              <div>Benzină: <strong>{fazTotals.benzina_l.toFixed(2)} l</strong></div>
              <div>Consum normat: <strong>{fazTotals.consum_normat.toFixed(2)} l</strong></div>
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={exportCsv}>📥 Export Excel</Button>
              <Button onClick={generateFaz}>📊 Generează FAZ lunar</Button>
            </div>
          </Card>

          <Table columns={historyColumns.filter(column => column.key !== 'actions')} data={fazRows} loading={loading} />
        </div>
      )}
    </div>
  )
}
