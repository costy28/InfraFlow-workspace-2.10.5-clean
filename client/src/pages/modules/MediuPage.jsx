import { useEffect, useMemo, useState } from 'react'
import api from '../../api/client'
import Input from '../../components/forms/Input'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'

const tabs = ['Autorizații', 'Deșeuri', 'Monitoring', 'Incidente', 'Alerte']
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

function daysUntil(date) {
  const value = dateValue(date)
  if (!value) return null
  const end = new Date(value)
  if (Number.isNaN(end.getTime())) return null
  return Math.ceil((end - new Date(today())) / 86400000)
}

function numberRo(value, decimals = 0) {
  return Number(value || 0).toLocaleString('ro-RO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function permitBadge(permit) {
  const raw = String(permit.status || '').toLowerCase()
  const days = Number(permit.zile_pana_expirare ?? daysUntil(permit.data_expirare))
  if (raw.includes('expir') || days < 0) return { label: 'Expirată', variant: 'red' }
  if (days <= 30) return { label: 'Expiră în 30 zile', variant: 'yellow' }
  return { label: permit.status || 'Validă', variant: 'green' }
}

function statusBadge(status) {
  const raw = String(status || '').toLowerCase()
  if (['inchis', 'închis', 'rezolvat', 'finalizat', 'inregistrat'].includes(raw)) return { label: status || 'Înregistrat', variant: 'green' }
  if (['critic', 'urgenta', 'urgentă', 'deschis'].includes(raw)) return { label: status || 'Deschis', variant: 'yellow' }
  return { label: status || '-', variant: 'gray' }
}

function alertVariant(days) {
  if (Number(days) < 7) return 'red'
  if (Number(days) < 30) return 'yellow'
  return 'blue'
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

export default function MediuPage() {
  const [activeTab, setActiveTab] = useState('Autorizații')
  const [permits, setPermits] = useState([])
  const [waste, setWaste] = useState([])
  const [monitoring, setMonitoring] = useState([])
  const [incidents, setIncidents] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState('')
  const [renewPermit, setRenewPermit] = useState(null)
  const [permitForm, setPermitForm] = useState({ tip: '', numar_document: '', emitent: '', data_emitere: today(), data_expirare: '', status: 'valida' })
  const [renewForm, setRenewForm] = useState({ nr_document_nou: '', data_expirare_noua: '' })
  const [wasteForm, setWasteForm] = useState({ data: today(), tip_deseu: '', cod_deseu: '', cantitate_kg: '', transportator: '', destinatar: '' })
  const [monitorForm, setMonitorForm] = useState({ tip: '', locatie: '', data: today(), laborator: '', valoare: '', limita_legala: '', limite_depasit: false, observatii: '' })
  const [incidentForm, setIncidentForm] = useState({ tip: '', data: today(), locatie: '', severitate: '', status: 'deschis', descriere: '' })

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [permitsRes, wasteRes, monitoringRes, incidentsRes, alertsRes] = await Promise.all([
        api.get('/environment/permits'),
        api.get('/environment/waste-manifests'),
        api.get('/environment/monitoring'),
        api.get('/environment/incidents'),
        api.get('/environment/alerts'),
      ])
      setPermits(arrayFrom(permitsRes.data, ['permits', 'items', 'data']))
      setWaste(arrayFrom(wasteRes.data, ['wasteManifests', 'manifests', 'items', 'data']))
      setMonitoring(arrayFrom(monitoringRes.data, ['monitoring', 'items', 'data']))
      setIncidents(arrayFrom(incidentsRes.data, ['incidents', 'items', 'data']))
      setAlerts(arrayFrom(alertsRes.data, ['alerts', 'items', 'data']))
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut incarca datele de mediu.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [])

  const pagedPermits = useMemo(() => permits.slice((page - 1) * pageSize, page * pageSize), [permits, page])
  const pagedWaste = useMemo(() => waste.slice((page - 1) * pageSize, page * pageSize), [waste, page])
  const pagedMonitoring = useMemo(() => monitoring.slice((page - 1) * pageSize, page * pageSize), [monitoring, page])
  const pagedIncidents = useMemo(() => incidents.slice((page - 1) * pageSize, page * pageSize), [incidents, page])

  function selectTab(tab) {
    setActiveTab(tab)
    setPage(1)
  }

  async function save(endpoint, payload, reset, successMessage) {
    setError('')
    setMessage('')
    try {
      await api.post(endpoint, payload)
      setMessage(successMessage)
      setModal('')
      reset()
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Înregistrarea nu a putut fi salvată.')
    }
  }

  async function renew(event) {
    event.preventDefault()
    if (!renewPermit) return
    setError('')
    try {
      await api.post(`/environment/permits/${renewPermit.id}/renew`, renewForm)
      setMessage('Autorizația a fost reînnoită.')
      setRenewPermit(null)
      setRenewForm({ nr_document_nou: '', data_expirare_noua: '' })
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Autorizația nu a putut fi reînnoită.')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Mediu</h1>
          <p className="text-sm text-slate-500">Autorizații, deșeuri, monitorizări, incidente și alerte.</p>
        </div>
        <Button onClick={() => setModal('permit')}>Adaugă autorizație</Button>
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

      {activeTab === 'Autorizații' && (
        <Card title="Autorizații" subtitle="Autorizații de mediu și termene." loading={loading} actions={<Button size="sm" onClick={() => setModal('permit')}>Adaugă</Button>}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Tip</th>
                  <th className="px-3 py-2">Nr document</th>
                  <th className="px-3 py-2">Emitent</th>
                  <th className="px-3 py-2">Emis la</th>
                  <th className="px-3 py-2">Expiră la</th>
                  <th className="px-3 py-2">Zile</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedPermits.length === 0 ? <EmptyRow colSpan={8} loading={loading} /> : pagedPermits.map(permit => {
                  const badge = permitBadge(permit)
                  const days = permit.zile_pana_expirare ?? daysUntil(permit.data_expirare)
                  return (
                    <tr key={permit.id || permit.uuid} className="hover:bg-slate-50">
                      <td className="px-3 py-3 font-medium text-slate-800">{permit.tip || '-'}</td>
                      <td className="px-3 py-3">{permit.numar_document || permit.nr_document || '-'}</td>
                      <td className="px-3 py-3">{permit.emitent || '-'}</td>
                      <td className="px-3 py-3">{dateValue(permit.data_emitere) || '-'}</td>
                      <td className="px-3 py-3">{dateValue(permit.data_expirare) || '-'}</td>
                      <td className="px-3 py-3">{days ?? '-'}</td>
                      <td className="px-3 py-3"><Badge variant={badge.variant}>{badge.label}</Badge></td>
                      <td className="px-3 py-3 text-right">
                        <Button size="sm" variant="secondary" onClick={() => setRenewPermit(permit)}>Reînnoire</Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={permits.length} onPage={setPage} />
        </Card>
      )}

      {activeTab === 'Deșeuri' && (
        <Card title="Deșeuri" subtitle="Formulare și trasabilitate deșeuri." loading={loading} actions={<Button size="sm" onClick={() => setModal('waste')}>Formular nou</Button>}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Tip deșeu</th>
                  <th className="px-3 py-2">Cod</th>
                  <th className="px-3 py-2 text-right">Cantitate kg</th>
                  <th className="px-3 py-2">Transportator</th>
                  <th className="px-3 py-2">Data predare</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedWaste.length === 0 ? <EmptyRow colSpan={5} loading={loading} /> : pagedWaste.map(item => (
                  <tr key={item.id || item.uuid} className="hover:bg-slate-50">
                    <td className="px-3 py-3 font-medium text-slate-800">{item.tip_deseu || item.tip || '-'}</td>
                    <td className="px-3 py-3">{item.cod_deseu || item.cod || item.nr_formular || '-'}</td>
                    <td className="px-3 py-3 text-right">{numberRo(item.cantitate_kg, 2)}</td>
                    <td className="px-3 py-3">{item.transportator || '-'}</td>
                    <td className="px-3 py-3">{dateValue(item.data || item.data_predare) || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={waste.length} onPage={setPage} />
        </Card>
      )}

      {activeTab === 'Monitoring' && (
        <Card title="Monitoring" subtitle="Măsurători și depășiri limite." loading={loading} actions={<Button size="sm" onClick={() => setModal('monitoring')}>Înregistrare nouă</Button>}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Tip</th>
                  <th className="px-3 py-2">Punct monitorizare</th>
                  <th className="px-3 py-2">Dată</th>
                  <th className="px-3 py-2">Laborator</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedMonitoring.length === 0 ? <EmptyRow colSpan={5} loading={loading} /> : pagedMonitoring.map(item => {
                  const exceeded = item.limite_depasit === true || item.limite_depasit === 1
                  return (
                    <tr key={item.id || item.uuid} className="hover:bg-slate-50">
                      <td className="px-3 py-3 font-medium text-slate-800">{item.tip || '-'}</td>
                      <td className="px-3 py-3">{item.punct_monitorizare || item.locatie || '-'}</td>
                      <td className="px-3 py-3">{dateValue(item.data) || '-'}</td>
                      <td className="px-3 py-3">{item.laborator || '-'}</td>
                      <td className="px-3 py-3"><Badge variant={exceeded ? 'red' : 'green'}>{exceeded ? 'Limite depășite' : 'În limite'}</Badge></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={monitoring.length} onPage={setPage} />
        </Card>
      )}

      {activeTab === 'Incidente' && (
        <Card title="Incidente" subtitle="Incidente de mediu raportate." loading={loading} actions={<Button size="sm" onClick={() => setModal('incident')}>Incident nou</Button>}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Tip</th>
                  <th className="px-3 py-2">Dată</th>
                  <th className="px-3 py-2">Locație</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedIncidents.length === 0 ? <EmptyRow colSpan={4} loading={loading} /> : pagedIncidents.map(item => {
                  const badge = statusBadge(item.status)
                  return (
                    <tr key={item.id || item.uuid} className="hover:bg-slate-50">
                      <td className="px-3 py-3 font-medium text-slate-800">{item.tip || '-'}</td>
                      <td className="px-3 py-3">{dateValue(item.data) || '-'}</td>
                      <td className="px-3 py-3">{item.locatie || '-'}</td>
                      <td className="px-3 py-3"><Badge variant={badge.variant}>{badge.label}</Badge></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={incidents.length} onPage={setPage} />
        </Card>
      )}

      {activeTab === 'Alerte' && (
        <Card title="Alerte" subtitle="Autorizații care expiră în următoarele 60 de zile." loading={loading}>
          <div className="grid gap-3">
            {alerts.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Nu există autorizații cu scadență apropiată.</div>
            ) : alerts.map(item => {
              const days = item.zile_pana_expirare ?? daysUntil(item.data_expirare)
              return (
                <div key={item.id || item.uuid} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-semibold text-slate-900">{item.tip || 'Autorizație'} - {item.numar_document || item.nr_document || '-'}</div>
                    <div className="text-sm text-slate-500">Expiră la {dateValue(item.data_expirare)} • Emitent: {item.emitent || '-'}</div>
                  </div>
                  <Badge variant={alertVariant(days)}>{days} zile</Badge>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      <Modal open={modal === 'permit'} title="Autorizație nouă" onClose={() => setModal('')}>
        <form className="grid gap-4" onSubmit={event => {
          event.preventDefault()
          save('/environment/permits', permitForm, () => setPermitForm({ tip: '', numar_document: '', emitent: '', data_emitere: today(), data_expirare: '', status: 'valida' }), 'Autorizația a fost salvată.')
        }}>
          <Input label="Tip" value={permitForm.tip} onChange={event => setPermitForm({ ...permitForm, tip: event.target.value })} />
          <Input label="Nr document" value={permitForm.numar_document} onChange={event => setPermitForm({ ...permitForm, numar_document: event.target.value })} />
          <Input label="Emitent" value={permitForm.emitent} onChange={event => setPermitForm({ ...permitForm, emitent: event.target.value })} />
          <Input label="Emis la" type="date" value={permitForm.data_emitere} onChange={event => setPermitForm({ ...permitForm, data_emitere: event.target.value })} />
          <Input label="Expiră la" type="date" value={permitForm.data_expirare} onChange={event => setPermitForm({ ...permitForm, data_expirare: event.target.value })} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal('')}>Renunță</Button>
            <Button type="submit">Salvează</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!renewPermit} title="Reînnoire autorizație" onClose={() => setRenewPermit(null)}>
        <form className="grid gap-4" onSubmit={renew}>
          <Input label="Nr document nou" value={renewForm.nr_document_nou} onChange={event => setRenewForm({ ...renewForm, nr_document_nou: event.target.value })} />
          <Input label="Noua dată expirare" type="date" value={renewForm.data_expirare_noua} onChange={event => setRenewForm({ ...renewForm, data_expirare_noua: event.target.value })} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setRenewPermit(null)}>Renunță</Button>
            <Button type="submit">Reînnoiește</Button>
          </div>
        </form>
      </Modal>

      <Modal open={modal === 'waste'} title="Formular deșeuri nou" onClose={() => setModal('')}>
        <form className="grid gap-4" onSubmit={event => {
          event.preventDefault()
          save('/environment/waste-manifests', wasteForm, () => setWasteForm({ data: today(), tip_deseu: '', cod_deseu: '', cantitate_kg: '', transportator: '', destinatar: '' }), 'Formularul de deșeuri a fost salvat.')
        }}>
          <Input label="Data predare" type="date" value={wasteForm.data} onChange={event => setWasteForm({ ...wasteForm, data: event.target.value })} />
          <Input label="Tip deșeu" value={wasteForm.tip_deseu} onChange={event => setWasteForm({ ...wasteForm, tip_deseu: event.target.value })} />
          <Input label="Cod deșeu" value={wasteForm.cod_deseu} onChange={event => setWasteForm({ ...wasteForm, cod_deseu: event.target.value })} />
          <Input label="Cantitate kg" type="number" step="0.001" value={wasteForm.cantitate_kg} onChange={event => setWasteForm({ ...wasteForm, cantitate_kg: event.target.value })} />
          <Input label="Transportator" value={wasteForm.transportator} onChange={event => setWasteForm({ ...wasteForm, transportator: event.target.value })} />
          <Input label="Destinatar" value={wasteForm.destinatar} onChange={event => setWasteForm({ ...wasteForm, destinatar: event.target.value })} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal('')}>Renunță</Button>
            <Button type="submit">Salvează</Button>
          </div>
        </form>
      </Modal>

      <Modal open={modal === 'monitoring'} title="Monitoring nou" onClose={() => setModal('')}>
        <form className="grid gap-4" onSubmit={event => {
          event.preventDefault()
          save('/environment/monitoring', monitorForm, () => setMonitorForm({ tip: '', locatie: '', data: today(), laborator: '', valoare: '', limita_legala: '', limite_depasit: false, observatii: '' }), 'Monitorizarea a fost salvată.')
        }}>
          <Input label="Tip" value={monitorForm.tip} onChange={event => setMonitorForm({ ...monitorForm, tip: event.target.value })} />
          <Input label="Punct monitorizare" value={monitorForm.locatie} onChange={event => setMonitorForm({ ...monitorForm, locatie: event.target.value })} />
          <Input label="Dată" type="date" value={monitorForm.data} onChange={event => setMonitorForm({ ...monitorForm, data: event.target.value })} />
          <Input label="Laborator" value={monitorForm.laborator} onChange={event => setMonitorForm({ ...monitorForm, laborator: event.target.value })} />
          <Input label="Valoare" type="number" step="0.0001" value={monitorForm.valoare} onChange={event => setMonitorForm({ ...monitorForm, valoare: event.target.value })} />
          <Input label="Limită legală" type="number" step="0.0001" value={monitorForm.limita_legala} onChange={event => setMonitorForm({ ...monitorForm, limita_legala: event.target.value })} />
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={monitorForm.limite_depasit} onChange={event => setMonitorForm({ ...monitorForm, limite_depasit: event.target.checked })} />
            Limite depășite
          </label>
          <Input label="Observații" value={monitorForm.observatii} onChange={event => setMonitorForm({ ...monitorForm, observatii: event.target.value })} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal('')}>Renunță</Button>
            <Button type="submit">Salvează</Button>
          </div>
        </form>
      </Modal>

      <Modal open={modal === 'incident'} title="Incident nou" onClose={() => setModal('')}>
        <form className="grid gap-4" onSubmit={event => {
          event.preventDefault()
          save('/environment/incidents', incidentForm, () => setIncidentForm({ tip: '', data: today(), locatie: '', severitate: '', status: 'deschis', descriere: '' }), 'Incidentul a fost salvat.')
        }}>
          <Input label="Tip" value={incidentForm.tip} onChange={event => setIncidentForm({ ...incidentForm, tip: event.target.value })} />
          <Input label="Dată" type="date" value={incidentForm.data} onChange={event => setIncidentForm({ ...incidentForm, data: event.target.value })} />
          <Input label="Locație" value={incidentForm.locatie} onChange={event => setIncidentForm({ ...incidentForm, locatie: event.target.value })} />
          <Input label="Severitate" value={incidentForm.severitate} onChange={event => setIncidentForm({ ...incidentForm, severitate: event.target.value })} />
          <Input label="Descriere" value={incidentForm.descriere} onChange={event => setIncidentForm({ ...incidentForm, descriere: event.target.value })} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal('')}>Renunță</Button>
            <Button type="submit">Salvează</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
