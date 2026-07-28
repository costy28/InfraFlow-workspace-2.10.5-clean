import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Download, FileUp, Plus, Printer, RefreshCw } from 'lucide-react'
import api from '../api/client'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'
import PageHeader from '../components/ui/PageHeader'
import Select from '../components/ui/Select'
import Table from '../components/ui/Table'

const tabs = ['Date generale', 'Documente', 'Soferi / Operatori', 'Foi / FAZ', 'Reparatii', 'Combustibil']

function today() {
  return new Date().toISOString().slice(0, 10)
}

function numberValue(value) {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function fmt(value, decimals = 2) {
  return numberValue(value).toLocaleString('ro-RO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function statusTone(status) {
  if (status === 'valid' || status === 'aprobat') return 'success'
  if (status === 'expira_curand' || status === 'semnat' || status === 'completat') return 'warning'
  if (status === 'expirat') return 'danger'
  return 'gray'
}

function assetIsVehicle(asset) {
  return asset?.asset_kind === 'autovehicul' || asset?.tip_asset === 'autovehicul' || asset?.category === 'vehicle'
}

function labelValue(label, value) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value || '-'}</div>
    </div>
  )
}

export default function FisaVehicul() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [employees, setEmployees] = useState([])
  const [activeTab, setActiveTab] = useState(tabs[0])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [driverModal, setDriverModal] = useState(false)
  const [fileModal, setFileModal] = useState(false)
  const [driverForm, setDriverForm] = useState({ employee_id: '', tip: 'sofer', data_start: today() })
  const [fileForm, setFileForm] = useState({ tip: 'asigurare', denumire: '', file: null })

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [fullRes, empRes] = await Promise.allSettled([
        api.get(`/fleet/assets/${id}/full`),
        api.get('/hr/employees?activ=1')
      ])
      if (fullRes.status === 'fulfilled') setData(fullRes.value.data)
      else throw fullRes.reason
      if (empRes.status === 'fulfilled') setEmployees(empRes.value.data?.employees || [])
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut incarca fisa vehiculului.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    Promise.resolve().then(load)
  }, [id])

  useEffect(() => {
    if (!data?.asset?.gps_device_id) return undefined
    const timer = window.setInterval(async () => {
      try {
        const response = await api.get(`/fleet/assets/${id}/gps-live`)
        setData(current => current ? { ...current, gps: response.data.gps } : current)
      } catch {
        // GPS live este opțional; păstrăm ultima poziție cunoscută dacă furnizorul nu răspunde.
      }
    }, 30000)
    return () => window.clearInterval(timer)
  }, [id, data?.asset?.gps_device_id])

  const asset = data?.asset || {}
  const isVehicle = assetIsVehicle(asset)
  const gps = data?.gps
  const gpsReady = gps?.lat && gps?.lng
  const activeDriver = data?.active_drivers?.[0] || data?.asset?.principal_driver
  const fuelYtd = useMemo(() => {
    const year = String(new Date().getFullYear())
    return (data?.fuel || []).filter(row => String(row.data || '').startsWith(year)).reduce((sum, row) => sum + numberValue(row.valoare_totala), 0)
  }, [data])

  async function saveDriver(event) {
    event.preventDefault()
    try {
      await api.post(`/fleet/assets/${id}/drivers`, driverForm)
      setMessage('Alocarea a fost salvata.')
      setDriverModal(false)
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Alocarea nu a putut fi salvata.')
    }
  }

  async function removeDriver(driverId) {
    try {
      await api.delete(`/fleet/assets/${id}/drivers/${driverId}`)
      setMessage('Alocarea a fost inchisa.')
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Alocarea nu a putut fi inchisa.')
    }
  }

  async function uploadFile(event) {
    event.preventDefault()
    if (!fileForm.file) return setError('Alege un fisier PDF/JPG/PNG.')
    try {
      const formData = new FormData()
      formData.append('tip', fileForm.tip)
      formData.append('denumire', fileForm.denumire)
      formData.append('file', fileForm.file)
      await api.post(`/fleet/assets/${id}/files`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      setMessage('Fisier incarcat.')
      setFileModal(false)
      setFileForm({ tip: 'asigurare', denumire: '', file: null })
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Fisierul nu a putut fi incarcat.')
    }
  }

  async function deleteFile(fileId) {
    try {
      await api.delete(`/fleet/assets/${id}/files/${fileId}`)
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Fisierul nu a putut fi eliminat.')
    }
  }

  const documentRows = [
    ...(data?.documents || []),
    ...(data?.files || []).map(file => ({ ...file, label: file.denumire || file.file_name, status: 'atasat', data_expirare: '', source: 'fisier' }))
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title={asset.asset_label || 'Fisa vehicul/utilaj'}
        subtitle={`${isVehicle ? 'Autovehicul' : 'Utilaj'} · ${asset.active === false ? 'Inactiv' : 'Activ'}`}
        actions={[
          <Button key="refresh" variant="secondary" icon={<RefreshCw className="h-4 w-4" />} onClick={load}>Refresh</Button>,
          <Button key="print" variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Printeaza fisa</Button>,
          <Button key="edit" onClick={() => navigate('/mecanizare')}>Editeaza</Button>
        ]}
      />

      {error ? <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}

      {gps && asset.gps_device_id ? (
        <Card title="GPS Live" subtitle={`Dispozitiv: ${asset.gps_device_id}`}>
          <div className="grid gap-4 lg:grid-cols-[1.4fr_.8fr]">
            <div className="h-64 overflow-hidden rounded-lg border border-slate-200">
              {gpsReady ? (
                <MapContainer center={[Number(gps.lat), Number(gps.lng)]} zoom={15} className="h-full w-full">
                  <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <Marker position={[Number(gps.lat), Number(gps.lng)]}><Popup>{asset.asset_label}</Popup></Marker>
                </MapContainer>
              ) : (
                <div className="grid h-full place-items-center bg-slate-50 text-sm text-slate-500">GPS configurat, fara coordonate disponibile.</div>
              )}
            </div>
            <div className="grid gap-2">
              {labelValue('Status', gps.status)}
              {labelValue('Viteza', gps.viteza ? `${gps.viteza} km/h` : '-')}
              {labelValue('Ultima actualizare', gps.ultima_actualizare)}
            </div>
          </div>
        </Card>
      ) : null}

      <div className="flex gap-2 overflow-x-auto border-b border-slate-200">
        {tabs.map(tab => (
          <button key={tab} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${activeTab === tab ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500'}`} onClick={() => setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Date generale' ? (
        <Card loading={loading}>
          <div className="grid gap-3 md:grid-cols-3">
            {labelValue('Marca / model', [asset.marca || asset.brand, asset.model].filter(Boolean).join(' '))}
            {labelValue('Nr. inmatriculare / cod', asset.nr_inmatriculare || asset.registration || asset.cod || asset.assetCode)}
            {labelValue('An fabricatie', asset.year)}
            {labelValue('Serie sasiu / VIN', asset.vin || asset.serialNo)}
            {labelValue('Combustibil', asset.tip_combustibil || asset.fuelType)}
            {labelValue(isVehicle ? 'Consum normat l/100km' : 'Consum normat l/h', isVehicle ? asset.consum_normat_km || asset.standardConsumption : asset.consum_orar_normat)}
            {labelValue(isVehicle ? 'Km actuali' : 'Ore motor actuale', asset.currentMeter)}
            {labelValue('Departament', asset.departament || asset.department)}
            {labelValue('Locatie baza', asset.location)}
            {labelValue('Data intrarii', asset.data_intrare || asset.createdAt)}
            {labelValue('Valoare achizitie', asset.valoare_achizitie ? `${fmt(asset.valoare_achizitie)} RON` : '')}
            {labelValue('Sofer/operator principal', activeDriver?.employee_name)}
          </div>
          <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">{asset.notes || asset.observatii || 'Fara observatii.'}</div>
        </Card>
      ) : null}

      {activeTab === 'Documente' ? (
        <Card title="Documente si asigurari" actions={<Button icon={<FileUp className="h-4 w-4" />} onClick={() => setFileModal(true)}>Incarca fisier</Button>}>
          <Table
            columns={[
              { key: 'label', label: 'Document', render: row => row.label || row.denumire || row.file_name },
              { key: 'status', label: 'Status', render: row => <Badge tone={statusTone(row.status)}>{row.status || 'atasat'}</Badge> },
              { key: 'data_expirare', label: 'Expira la' },
              { key: 'actions', label: 'Actiuni', render: row => (
                <div className="flex flex-wrap gap-2">
                  {row.detail_url ? <Link className="text-sm font-medium text-primary-700" to={row.detail_url}>Vezi detalii</Link> : null}
                  {row.file_path ? <a className="text-sm font-medium text-primary-700" href={row.file_path} target="_blank" rel="noreferrer">Descarca</a> : null}
                  {row.file_path ? <button className="text-sm font-medium text-rose-600" onClick={() => deleteFile(row.id)}>Sterge</button> : null}
                </div>
              ) }
            ]}
            data={documentRows}
          />
        </Card>
      ) : null}

      {activeTab === 'Soferi / Operatori' ? (
        <Card title="Soferi / operatori alocati" actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setDriverModal(true)}>Aloca</Button>}>
          <Table
            columns={[
              { key: 'employee_name', label: 'Nume' },
              { key: 'tip', label: 'Tip' },
              { key: 'data_start', label: 'Data start' },
              { key: 'data_sfarsit', label: 'Data sfarsit', render: row => row.data_sfarsit || 'activ' },
              { key: 'actions', label: 'Actiuni', render: row => !row.data_sfarsit && row.activ !== false ? <Button size="sm" variant="secondary" onClick={() => removeDriver(row.id)}>Dezaloca</Button> : null }
            ]}
            data={data?.drivers || []}
          />
        </Card>
      ) : null}

      {activeTab === 'Foi / FAZ' ? (
        <Card title={isVehicle ? 'Ultimele foi de parcurs' : 'Ultimele FAZ-uri'} actions={<Button onClick={() => navigate(isVehicle ? '/foi-parcurs' : `/faz-utilaje`)}>+ Adauga</Button>}>
          <Table
            columns={isVehicle ? [
              { key: 'data', label: 'Data' },
              { key: 'sofer_nume', label: 'Sofer', render: row => row.sofer_nume || row.driver_name || row.soferName || '-' },
              { key: 'km', label: 'Km', render: row => fmt(row.km_parcursi || row.km_total || 0) },
              { key: 'combustibil', label: 'Combustibil', render: row => `${fmt(row.combustibil_consumat || row.consum_efectiv || 0)} l` },
              { key: 'status', label: 'Status', render: row => <Badge tone={statusTone(row.status)}>{row.status}</Badge> }
            ] : [
              { key: 'data', label: 'Data' },
              { key: 'operator_name', label: 'Operator' },
              { key: 'ore_lucrate', label: 'Ore', render: row => fmt(row.ore_lucrate) },
              { key: 'consum_efectiv', label: 'Combustibil', render: row => `${fmt(row.consum_efectiv)} l` },
              { key: 'status', label: 'Status', render: row => <Badge tone={statusTone(row.status)}>{row.status}</Badge> }
            ]}
            data={isVehicle ? data?.trip_logs || [] : data?.faz_logs || []}
          />
        </Card>
      ) : null}

      {activeTab === 'Reparatii' ? (
        <Card title="Reparatii si revizii" actions={<Button onClick={() => navigate('/mecanizare')}>+ Adauga</Button>}>
          <Table
            columns={[
              { key: 'data_intrare', label: 'Data', render: row => row.data_intrare || row.data },
              { key: 'tip', label: 'Tip' },
              { key: 'descriere', label: 'Descriere' },
              { key: 'cost_total', label: 'Cost', render: row => `${fmt(row.cost_total || row.cost)} RON` },
              { key: 'executant', label: 'Executant', render: row => row.executant || row.furnizor },
              { key: 'status', label: 'Status' }
            ]}
            data={data?.maintenances || []}
          />
        </Card>
      ) : null}

      {activeTab === 'Combustibil' ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            {labelValue('Consum mediu luna', `${fmt((data?.fuel || []).slice(0, 30).reduce((s, r) => s + numberValue(r.cantitate_litri), 0) / Math.max(1, (data?.fuel || []).slice(0, 30).length))} l`)}
            {labelValue('Cheltuieli combustibil YTD', `${fmt(fuelYtd)} RON`)}
            {labelValue('Total alimentari', (data?.fuel || []).length)}
          </div>
          <Card title="Consum real vs normat">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.fuel_chart || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="luna" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="normat" fill="#0f766e" name="Normat" />
                  <Bar dataKey="real" fill="#2563eb" name="Real" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card title="Alimentari" actions={<Button onClick={() => navigate('/mecanizare')}>+ Alimentare</Button>}>
            <Table
              columns={[
                { key: 'data', label: 'Data' },
                { key: 'cantitate_litri', label: 'Litri', render: row => fmt(row.cantitate_litri) },
                { key: 'pret_litru', label: 'Pret/l', render: row => fmt(row.pret_litru) },
                { key: 'valoare_totala', label: 'Total', render: row => `${fmt(row.valoare_totala)} RON` },
                { key: 'furnizor', label: 'Statie' }
              ]}
              data={data?.fuel || []}
            />
          </Card>
        </div>
      ) : null}

      <Modal open={driverModal} title="Aloca sofer/operator" onClose={() => setDriverModal(false)}>
        <form className="grid gap-3" onSubmit={saveDriver}>
          <Select label="Angajat" value={driverForm.employee_id} onChange={e => setDriverForm({ ...driverForm, employee_id: e.target.value })} required>
            <option value="">Alege angajat</option>
            {employees.map(employee => <option key={employee.id} value={employee.id}>{[employee.nume, employee.prenume].filter(Boolean).join(' ') || employee.name}</option>)}
          </Select>
          <Select label="Tip" value={driverForm.tip} onChange={e => setDriverForm({ ...driverForm, tip: e.target.value })}>
            <option value="sofer">Sofer</option>
            <option value="operator">Operator</option>
            <option value="rezerva">Rezerva</option>
          </Select>
          <Input label="Data start" type="date" value={driverForm.data_start} onChange={e => setDriverForm({ ...driverForm, data_start: e.target.value })} />
          <div className="flex justify-end"><Button type="submit">Salveaza</Button></div>
        </form>
      </Modal>

      <Modal open={fileModal} title="Incarca document" onClose={() => setFileModal(false)}>
        <form className="grid gap-3" onSubmit={uploadFile}>
          <Select label="Tip document" value={fileForm.tip} onChange={e => setFileForm({ ...fileForm, tip: e.target.value })}>
            <option value="asigurare">Asigurare</option>
            <option value="itp">ITP</option>
            <option value="iscir">ISCIR</option>
            <option value="altul">Altul</option>
          </Select>
          <Input label="Denumire" value={fileForm.denumire} onChange={e => setFileForm({ ...fileForm, denumire: e.target.value })} />
          <Input label="Fisier PDF/JPG/PNG" type="file" accept="application/pdf,image/jpeg,image/png" onChange={e => setFileForm({ ...fileForm, file: e.target.files?.[0] || null })} />
          <div className="flex justify-end"><Button type="submit" icon={<Download className="h-4 w-4" />}>Incarca</Button></div>
        </form>
      </Modal>
    </div>
  )
}
