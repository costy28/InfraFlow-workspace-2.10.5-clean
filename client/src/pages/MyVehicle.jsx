import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import PageHeader from '../components/ui/PageHeader'
import Table from '../components/ui/Table'

function tone(status) {
  if (status === 'valid' || status === 'aprobat') return 'success'
  if (status === 'expira_curand' || status === 'semnat' || status === 'completat') return 'warning'
  if (status === 'expirat') return 'danger'
  return 'gray'
}

export default function MyVehicle() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const response = await api.get('/fleet/my-vehicle')
      setData(response.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Nu exista vehicul alocat.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    Promise.resolve().then(load)
  }, [])

  const asset = data?.asset || {}
  const rows = asset.asset_kind === 'autovehicul' ? (data?.trip_logs || []).slice(0, 5) : (data?.faz_logs || []).slice(0, 5)

  return (
    <div className="space-y-4">
      <PageHeader title="Vehiculul meu" subtitle={asset.asset_label || 'Fisa rapida pentru mobil'} actions={[<Button key="refresh" variant="secondary" onClick={load}>Refresh</Button>]} />
      {error ? <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div> : null}
      <Card loading={loading}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-xs text-slate-500">Vehicul/utilaj</div>
            <div className="text-lg font-semibold text-slate-900">{asset.asset_label || '-'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Status</div>
            <Badge tone={asset.active === false ? 'danger' : 'success'}>{asset.active === false ? 'Inactiv' : 'Activ'}</Badge>
          </div>
          <div>
            <div className="text-xs text-slate-500">Combustibil</div>
            <div className="font-medium">{asset.tip_combustibil || asset.fuelType || '-'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Km/Ore curente</div>
            <div className="font-medium">{asset.currentMeter || '-'}</div>
          </div>
        </div>
      </Card>

      <Card title="Documente">
        <div className="grid gap-2">
          {(data?.documents || []).map(doc => (
            <div key={`${doc.source}-${doc.id}`} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
              <div>
                <div className="font-medium text-slate-900">{doc.label}</div>
                <div className="text-xs text-slate-500">{doc.data_expirare || 'Fara data'}</div>
              </div>
              <Badge tone={tone(doc.status)}>{doc.status}</Badge>
            </div>
          ))}
          {(data?.files || []).map(file => (
            <a key={file.uuid} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-primary-700" href={file.file_path} target="_blank" rel="noreferrer">
              <span>{file.denumire || file.file_name}</span>
              <span>Descarca</span>
            </a>
          ))}
        </div>
      </Card>

      <Card title={asset.asset_kind === 'autovehicul' ? 'Ultimele foi de parcurs' : 'Ultimele FAZ'}>
        <Table
          columns={[
            { key: 'data', label: 'Data' },
            { key: 'status', label: 'Status', render: row => <Badge tone={tone(row.status)}>{row.status}</Badge> },
          ]}
          data={rows}
          empty="Nu exista inregistrari recente."
        />
        {asset.id ? <Link className="mt-3 inline-block text-sm font-medium text-primary-700" to={`/fleet/asset/${asset.id}`}>Deschide fisa completa</Link> : null}
      </Card>
    </div>
  )
}
