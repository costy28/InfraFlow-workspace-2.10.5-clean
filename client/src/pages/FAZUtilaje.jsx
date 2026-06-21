import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CheckCircle, Download, FilePlus2, RefreshCw, UploadCloud } from 'lucide-react'
import api from '../api/client'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'
import PageHeader from '../components/ui/PageHeader'
import Select from '../components/ui/Select'
import Table from '../components/ui/Table'

function today() {
  return new Date().toISOString().slice(0, 10)
}

function currentMonth() {
  return today().slice(0, 7)
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

function fmt(value, decimals = 2) {
  return numberValue(value).toLocaleString('ro-RO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function assetLabel(asset) {
  return [
    asset.cod || asset.nr_inmatriculare || asset.registration || asset.nr_inventar,
    [asset.marca || asset.brand, asset.model].filter(Boolean).join(' ')
  ].filter(Boolean).join(' / ') || asset.name || `#${asset.id}`
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

function diffTone(row) {
  if (row.semafor === 'rosu') return 'danger'
  if (row.semafor === 'galben') return 'warning'
  return 'success'
}

function statusTone(status) {
  if (status === 'aprobat') return 'success'
  if (status === 'semnat') return 'blue'
  if (status === 'completat') return 'warning'
  return 'gray'
}

const emptyForm = {
  uuid: '',
  utilaj_id: '',
  data: today(),
  operator_name: '',
  locatie: '',
  tip_activitate_id: '',
  index_start: '',
  index_stop: '',
  ore_lucrate: '',
  carburant_primit: '',
  consum_orar_normat: '',
  consum_efectiv: '',
  observatii: '',
}

export default function FAZUtilaje() {
  const [rows, setRows] = useState([])
  const [assets, setAssets] = useState([])
  const [activities, setActivities] = useState([])
  const [filters, setFilters] = useState({ utilaj_id: '', luna: currentMonth(), status: '' })
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [importForm, setImportForm] = useState({ data_de: `${currentMonth()}-01`, data_pana: today(), connection_string: '' })

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [fazRes, assetsRes, activitiesRes] = await Promise.all([
        api.get('/fleet/faz', { params: { luna: filters.luna, utilaj_id: filters.utilaj_id || undefined, status: filters.status || undefined } }),
        api.get('/fleet-assets?tip=utilaj'),
        api.get('/fleet/faz/nomenclator')
      ])
      const nextRows = arrayFrom(fazRes.data, ['faz_logs', 'items', 'data'])
      const nextAssets = arrayFrom(assetsRes.data, ['assets', 'fleetAssets', 'items', 'data'])
      setRows(nextRows)
      setAssets(nextAssets)
      setActivities(arrayFrom(activitiesRes.data, ['activities', 'items', 'data']))
      if (!form.utilaj_id && nextAssets[0]?.id) setForm(current => ({ ...current, utilaj_id: nextAssets[0].id, consum_orar_normat: assetConsumption(nextAssets[0]) || '' }))
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut incarca FAZ utilaje.')
    } finally {
      setLoading(false)
    }
  }

  async function loadReport() {
    try {
      const response = await api.get('/fleet/faz/raport-lunar', { params: { luna: filters.luna, utilaj_id: filters.utilaj_id || undefined } })
      setReport(response.data)
    } catch {
      setReport(null)
    }
  }

  useEffect(() => {
    Promise.resolve().then(async () => {
      await load()
      await loadReport()
    })
  }, [filters.luna, filters.utilaj_id, filters.status])

  const selectedAsset = assets.find(asset => String(asset.id) === String(form.utilaj_id))
  const indexOre = form.index_start !== '' && form.index_stop !== '' ? numberValue(form.index_stop) - numberValue(form.index_start) : 0
  const consumNormat = numberValue(form.ore_lucrate) * numberValue(form.consum_orar_normat)
  const diferenta = numberValue(form.consum_efectiv) - consumNormat
  const procent = consumNormat > 0 ? (numberValue(form.consum_efectiv) / consumNormat) * 100 : 0
  const semafor = !consumNormat || Math.abs(diferenta) <= consumNormat * 0.1 ? 'verde' : Math.abs(diferenta) <= consumNormat * 0.25 ? 'galben' : 'rosu'

  const chartRows = useMemo(() => {
    const source = report?.rows || rows
    return source
      .slice()
      .sort((a, b) => String(a.data || '').localeCompare(String(b.data || '')))
      .map(row => ({
        data: String(row.data || '').slice(5),
        normat: numberValue(row.consum_normat),
        real: numberValue(row.consum_efectiv)
      }))
  }, [report, rows])

  function openNew() {
    const asset = assets[0]
    setForm({ ...emptyForm, utilaj_id: asset?.id || '', consum_orar_normat: assetConsumption(asset) || '' })
    setModalOpen(true)
  }

  function openEdit(row) {
    setForm({
      uuid: row.uuid,
      utilaj_id: row.utilaj_id || '',
      data: row.data || today(),
      operator_name: row.operator_name || '',
      locatie: row.locatie || '',
      tip_activitate_id: row.tip_activitate_id || '',
      index_start: row.index_start ?? '',
      index_stop: row.index_stop ?? '',
      ore_lucrate: row.ore_lucrate ?? '',
      carburant_primit: row.carburant_primit ?? '',
      consum_orar_normat: row.consum_orar_normat ?? '',
      consum_efectiv: row.consum_efectiv ?? '',
      observatii: row.observatii || '',
    })
    setModalOpen(true)
  }

  function setField(field, value) {
    setForm(current => {
      const next = { ...current, [field]: value }
      if (field === 'utilaj_id') {
        const asset = assets.find(item => String(item.id) === String(value))
        next.consum_orar_normat = assetConsumption(asset) || next.consum_orar_normat
      }
      return next
    })
  }

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      if (form.uuid) {
        const response = await api.patch(`/fleet/faz/${form.uuid}`, form)
        setRows(items => items.map(item => item.uuid === form.uuid ? response.data.faz_log : item))
        setMessage('FAZ a fost actualizat.')
      } else {
        const response = await api.post('/fleet/faz', form)
        setRows(items => [response.data.faz_log, ...items])
        setMessage('FAZ a fost creat.')
      }
      setModalOpen(false)
      await loadReport()
    } catch (err) {
      setError(err.response?.data?.error || 'FAZ nu a putut fi salvat.')
    } finally {
      setSaving(false)
    }
  }

  async function sign(row) {
    try {
      const response = await api.post(`/fleet/faz/${row.uuid}/sign`)
      setRows(items => items.map(item => item.uuid === row.uuid ? response.data.faz_log : item))
      setMessage('FAZ a fost semnat.')
    } catch (err) {
      setError(err.response?.data?.error || 'FAZ nu a putut fi semnat.')
    }
  }

  async function approve(row) {
    try {
      const response = await api.post(`/fleet/faz/${row.uuid}/approve`)
      setRows(items => items.map(item => item.uuid === row.uuid ? response.data.faz_log : item))
      setMessage('FAZ a fost aprobat.')
    } catch (err) {
      setError(err.response?.data?.error || 'FAZ nu a putut fi aprobat.')
    }
  }

  async function importAutominder(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const response = await api.post('/fleet/faz/import-autominder', importForm)
      setMessage(`Import Autominder finalizat: ${response.data.imported || 0} importate, ${response.data.skipped || 0} sarite.`)
      setImportOpen(false)
      await load()
      await loadReport()
    } catch (err) {
      setError(err.response?.data?.error || 'Importul Autominder nu a putut fi rulat.')
    } finally {
      setSaving(false)
    }
  }

  async function exportCsv() {
    try {
      const response = await api.get('/fleet/faz/export-csv', {
        params: { luna: filters.luna, utilaj_id: filters.utilaj_id || undefined, status: filters.status || undefined },
        responseType: 'blob'
      })
      const url = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = `FAZ_${filters.luna || currentMonth()}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.response?.data?.error || 'Exportul CSV nu a putut fi generat.')
    }
  }

  const columns = [
    { key: 'data', label: 'Data' },
    { key: 'utilaj', label: 'Utilaj', render: row => row.utilaj_label },
    { key: 'operator_name', label: 'Operator' },
    { key: 'locatie', label: 'Locatie' },
    { key: 'ore_lucrate', label: 'Ore', render: row => fmt(row.ore_lucrate) },
    { key: 'carburant_primit', label: 'Carburant', render: row => `${fmt(row.carburant_primit)} l` },
    { key: 'consum_normat', label: 'Normat', render: row => `${fmt(row.consum_normat)} l` },
    { key: 'consum_efectiv', label: 'Real', render: row => `${fmt(row.consum_efectiv)} l` },
    { key: 'diferenta_consum', label: 'Diferenta', render: row => <Badge tone={diffTone(row)}>{fmt(row.diferenta_consum)} l</Badge> },
    { key: 'status', label: 'Status', render: row => <Badge tone={statusTone(row.status)}>{row.status}</Badge> },
    {
      key: 'actions',
      label: 'Actiuni',
      render: row => (
        <div className="flex flex-wrap gap-1">
          {row.status === 'draft' ? <Button size="sm" variant="secondary" onClick={() => openEdit(row)}>Editare</Button> : null}
          {['draft', 'completat'].includes(row.status) ? <Button size="sm" variant="secondary" onClick={() => sign(row)}>Semnare</Button> : null}
          {['semnat', 'completat'].includes(row.status) ? <Button size="sm" variant="secondary" onClick={() => approve(row)}>Aprobare</Button> : null}
        </div>
      )
    }
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="FAZ Utilaje"
        subtitle="Foaie Activitate Zilnica pentru utilaje, consum normat si raport lunar."
        actions={[
          <Button key="refresh" variant="secondary" icon={<RefreshCw className="h-4 w-4" />} onClick={() => load()}>Refresh</Button>,
          <Button key="csv" variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportCsv}>CSV</Button>,
          <Button key="import" variant="secondary" icon={<UploadCloud className="h-4 w-4" />} onClick={() => setImportOpen(true)}>Import Autominder</Button>,
          <Button key="new" icon={<FilePlus2 className="h-4 w-4" />} onClick={openNew}>FAZ Nou</Button>,
        ]}
      />

      {error ? <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}

      <Card>
        <div className="grid gap-3 md:grid-cols-3">
          <Select label="Utilaj" value={filters.utilaj_id} onChange={event => setFilters(current => ({ ...current, utilaj_id: event.target.value }))}>
            <option value="">Toate utilajele</option>
            {assets.map(asset => <option key={asset.id} value={asset.id}>{assetLabel(asset)}</option>)}
          </Select>
          <Input label="Luna" type="month" value={filters.luna} onChange={event => setFilters(current => ({ ...current, luna: event.target.value }))} />
          <Select label="Status" value={filters.status} onChange={event => setFilters(current => ({ ...current, status: event.target.value }))}>
            <option value="">Toate</option>
            <option value="draft">Draft</option>
            <option value="completat">Completat</option>
            <option value="semnat">Semnat</option>
            <option value="aprobat">Aprobat</option>
          </Select>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-4">
        <Card title="Total ore"><div className="text-2xl font-semibold text-slate-900">{fmt(report?.total_ore || 0)}</div></Card>
        <Card title="Combustibil real"><div className="text-2xl font-semibold text-slate-900">{fmt(report?.total_combustibil || 0)} l</div></Card>
        <Card title="Zile lucrate"><div className="text-2xl font-semibold text-slate-900">{report?.zile_lucrate || 0}</div></Card>
        <Card title="Diferenta consum"><div className="text-2xl font-semibold text-slate-900">{fmt(report?.diferenta_consum || 0)} l</div></Card>
      </div>

      <Card title="FAZ luna curenta" loading={loading}>
        <Table columns={columns} data={rows} empty="Nu exista FAZ pentru filtrele selectate." />
      </Card>

      <Card title="Consum real vs normat per zi">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartRows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="data" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="normat" fill="#0f766e" name="Normat" />
              <Bar dataKey="real" fill="#2563eb" name="Real" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Modal open={modalOpen} title={form.uuid ? 'Editare FAZ' : 'FAZ Nou'} onClose={() => setModalOpen(false)} size="xl">
        <form onSubmit={save} className="grid gap-4">
          <p className="text-sm text-slate-500">{selectedAsset ? assetLabel(selectedAsset) : 'Selecteaza utilajul'}</p>

          <div className="grid gap-3 md:grid-cols-3">
              <Select label="Utilaj" value={form.utilaj_id} onChange={event => setField('utilaj_id', event.target.value)} required>
                <option value="">Selecteaza</option>
                {assets.map(asset => <option key={asset.id} value={asset.id}>{assetLabel(asset)}</option>)}
              </Select>
              <Input label="Data" type="date" value={form.data} onChange={event => setField('data', event.target.value)} required />
              <Input label="Operator" value={form.operator_name} onChange={event => setField('operator_name', event.target.value)} />
              <Input label="Locatie" value={form.locatie} onChange={event => setField('locatie', event.target.value)} required />
              <Select label="Tip activitate" value={form.tip_activitate_id} onChange={event => setField('tip_activitate_id', event.target.value)}>
                <option value="">Fara tip</option>
                {activities.map(item => <option key={item.id} value={item.id}>{item.cod} - {item.denumire}</option>)}
              </Select>
              <Input label="Carburant primit" type="number" step="0.01" value={form.carburant_primit} onChange={event => setField('carburant_primit', event.target.value)} />
              <Input label="Index start" type="number" step="0.01" value={form.index_start} onChange={event => setField('index_start', event.target.value)} />
              <Input label="Index stop" type="number" step="0.01" value={form.index_stop} onChange={event => setField('index_stop', event.target.value)} />
              <Input label="Ore zi calculate" value={indexOre ? fmt(indexOre) : ''} disabled />
              <Input label="Ore lucrate" type="number" step="0.01" value={form.ore_lucrate} onChange={event => setField('ore_lucrate', event.target.value)} />
              <Input label="Consum orar normat" type="number" step="0.01" value={form.consum_orar_normat} onChange={event => setField('consum_orar_normat', event.target.value)} />
              <Input label="Consum efectiv" type="number" step="0.01" value={form.consum_efectiv} onChange={event => setField('consum_efectiv', event.target.value)} />
          </div>

          <label className="block text-sm font-medium text-slate-700">
              Observatii
            <textarea className="mt-1 min-h-24 w-full rounded-[var(--radius-control)] border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition hover:border-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-100" value={form.observatii} onChange={event => setField('observatii', event.target.value)} />
          </label>

          <div className="grid gap-3 rounded-[var(--radius-panel)] border border-slate-200 bg-slate-50 p-3 md:grid-cols-4">
              <div><div className="text-xs text-slate-500">Consum normat</div><div className="font-semibold">{fmt(consumNormat)} l</div></div>
              <div><div className="text-xs text-slate-500">Diferenta</div><div className="font-semibold">{fmt(diferenta)} l</div></div>
              <div><div className="text-xs text-slate-500">Procent</div><div className="font-semibold">{fmt(procent, 1)}%</div></div>
              <div><div className="text-xs text-slate-500">Semafor</div><Badge tone={semafor === 'rosu' ? 'danger' : semafor === 'galben' ? 'warning' : 'success'}>{semafor}</Badge></div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Renunta</Button>
            <Button type="submit" loading={saving} icon={<CheckCircle className="h-4 w-4" />}>Salveaza</Button>
          </div>
        </form>
      </Modal>

      <Modal open={importOpen} title="Import Autominder" onClose={() => setImportOpen(false)} size="lg">
        <form onSubmit={importAutominder} className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
              <Input label="Data de la" type="date" value={importForm.data_de} onChange={event => setImportForm(current => ({ ...current, data_de: event.target.value }))} />
              <Input label="Data pana la" type="date" value={importForm.data_pana} onChange={event => setImportForm(current => ({ ...current, data_pana: event.target.value }))} />
          </div>
          <label className="block text-sm font-medium text-slate-700">
              Connection string Autominder
            <textarea className="mt-1 min-h-24 w-full rounded-[var(--radius-control)] border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition hover:border-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-100" value={importForm.connection_string} onChange={event => setImportForm(current => ({ ...current, connection_string: event.target.value }))} />
          </label>
          {saving ? <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-2/3 animate-pulse rounded-full bg-primary-600" /></div> : null}
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <Button type="button" variant="secondary" onClick={() => setImportOpen(false)}>Renunta</Button>
            <Button type="submit" loading={saving} icon={<UploadCloud className="h-4 w-4" />}>Importa</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
