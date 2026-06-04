import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import api from '../api/client'
import Badge from '../components/ui/Badge'
import Card from '../components/ui/Card'

const emptyState = {
  daily: null,
  production7: [],
  stockOperations: [],
  fleetAssets: [],
  inboxDocuments: [],
  tickets: [],
  projects: [],
  audit: [],
  weather: null,
  commandCenter: null,
}

const routes = {
  stock: '/stocuri',
  production: '/productie',
  fleet: '/flota',
  documents: '/documente',
  tickets: '/sesizari',
  projects: '/teren',
  audit: '/setari',
  snow: '/deszapezire',
}

function localDate(date) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

function lastDays(count) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date()
    date.setDate(date.getDate() - (count - 1 - index))
    return localDate(date)
  })
}

function isSnowSeason(date = new Date()) {
  const month = date.getMonth() + 1
  const day = date.getDate()
  return (month === 11 && day >= 15) ||
    month === 12 ||
    month === 1 ||
    month === 2 ||
    month === 3 ||
    (month === 4 && day <= 15)
}

function arrayFrom(data, keys) {
  if (Array.isArray(data)) return data
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key]
  }
  return []
}

function numberFrom(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function percent(value) {
  return Math.max(0, Math.min(100, numberFrom(value)))
}

function statusText(status) {
  return String(status || 'necunoscut').replaceAll('_', ' ')
}

function displayText(value, fallback = '') {
  if (value == null || value === '') return fallback
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return value.map(item => displayText(item)).filter(Boolean).join(', ')
  }
  if (typeof value === 'object') {
    return displayText(
      value.message || value.title || value.titlu || value.name || value.Entity || value.entity || value.details || value.detalii,
      JSON.stringify(value)
    )
  }
  return fallback
}

function priorityTone(priority) {
  if (['critica', 'urgent', 'urgenta'].includes(String(priority))) return 'danger'
  if (['ridicata', 'mare'].includes(String(priority))) return 'warning'
  return 'neutral'
}

function assetIsActive(asset) {
  const status = String(asset.status || asset.stare || '').toLowerCase()
  return ['activ', 'active', 'in_lucru', 'ocupat', 'disponibil', 'available'].includes(status)
}

function projectName(project) {
  return project.denumire || project.name || project.titlu || project.cod || `Proiect #${project.id}`
}

function projectProgress(project) {
  return percent(
    project.progress?.progres_fizic_procent ??
    project.progres_fizic_procent ??
    project.progressPercent ??
    project.progress ??
    0
  )
}

function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-md bg-slate-200 ${className}`} />
}

function SectionError({ error }) {
  if (!error) return null
  return (
    <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
      Nu am putut incarca datele. Verifica API-ul sau permisiunile.
    </div>
  )
}

function KpiCard({ icon, label, value, loading, error, onClick }) {
  return (
    <button className="text-left" onClick={onClick}>
      <Card className="h-full transition hover:border-primary-100 hover:shadow-md">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm text-slate-500">{label}</div>
            {loading ? <Skeleton className="mt-3 h-8 w-16" /> : (
              <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
            )}
          </div>
          <div className="grid h-11 w-11 place-items-center rounded-md bg-primary-50 text-xl">
            {icon}
          </div>
        </div>
        {error ? <p className="mt-3 text-xs text-rose-600">Date indisponibile.</p> : null}
      </Card>
    </button>
  )
}

function hoursLabel(h) {
  if (h == null) return '—'
  if (h < 1) return '<1h'
  if (h < 24) return `${Math.round(h)}h`
  return `${Math.floor(h / 24)}z ${Math.round(h % 24)}h`
}

function CommandCenterPanel({ data, loading, error, onNavigate }) {
  const cc = data?.commandCenter
  const blocked = cc?.documentsBlocked || []
  const unassigned = cc?.ticketsUnassigned || []
  const critical = cc?.ticketsCritical || []
  const unread = cc?.counts?.unreadMessages ?? cc?.unreadMessages ?? 0

  const hasAlerts = blocked.length > 0 || unassigned.length > 0 || critical.length > 0

  if (!loading && !hasAlerts && !error) return null

  return (
    <div className="rounded-xl border-2 border-rose-300 bg-rose-50/60 p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🚨</span>
          <div>
            <h3 className="text-base font-bold uppercase tracking-wide text-rose-800">Centru de Comandă</h3>
            <p className="text-xs text-rose-600">Situații care necesită atenție imediată</p>
          </div>
        </div>
        {!loading && (
          <div className="flex gap-2">
            {blocked.length > 0 && (
              <span className="rounded-full bg-rose-200 px-3 py-0.5 text-xs font-semibold text-rose-800">
                {blocked.length} doc. blocate
              </span>
            )}
            {unassigned.length > 0 && (
              <span className="rounded-full bg-amber-200 px-3 py-0.5 text-xs font-semibold text-amber-800">
                {unassigned.length} sesiz. neasignate
              </span>
            )}
            {unread > 0 && (
              <span className="rounded-full bg-sky-200 px-3 py-0.5 text-xs font-semibold text-sky-800">
                {unread} mesaje necitite
              </span>
            )}
          </div>
        )}
      </div>

      <SectionError error={error} />

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Documente blocate */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-semibold text-rose-700">📄 Documente blocate (&gt;48h fără acțiune)</span>
            </div>
            {blocked.length === 0 ? (
              <p className="rounded-md border border-dashed border-rose-200 py-4 text-center text-xs text-rose-400">
                Niciun document blocat ✓
              </p>
            ) : (
              <div className="grid gap-1.5">
                {blocked.slice(0, 5).map(doc => (
                  <button
                    key={doc.id || doc.uuid}
                    onClick={() => onNavigate('/documente')}
                    className="flex items-center justify-between gap-2 rounded-md border border-rose-200 bg-white px-3 py-2 text-left transition hover:border-rose-400 hover:shadow-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium text-slate-800">
                        {doc.nr_document || doc.titlu || `Doc #${doc.id}`}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {doc.tip_document || doc.type || 'document'} · {doc.departament || ''}
                      </div>
                    </div>
                    <span className="shrink-0 rounded bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                      {hoursLabel(doc.hoursBlocked)}
                    </span>
                  </button>
                ))}
                {blocked.length > 5 && (
                  <button
                    onClick={() => onNavigate('/documente')}
                    className="text-xs text-rose-600 hover:underline"
                  >
                    + {blocked.length - 5} mai multe →
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Tickets fără responsabil */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-semibold text-amber-700">🎫 Sesizări fără responsabil (&gt;4h)</span>
            </div>
            {unassigned.length === 0 && critical.length === 0 ? (
              <p className="rounded-md border border-dashed border-amber-200 py-4 text-center text-xs text-amber-400">
                Toate sesizările au responsabil ✓
              </p>
            ) : (
              <div className="grid gap-1.5">
                {critical.slice(0, 3).map(ticket => (
                  <button
                    key={ticket.uuid || ticket.id}
                    onClick={() => onNavigate('/sesizari')}
                    className="flex items-center justify-between gap-2 rounded-md border border-rose-200 bg-white px-3 py-2 text-left transition hover:border-rose-400 hover:shadow-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium text-slate-800">
                        {ticket.titlu || ticket.title || `Sesizare #${ticket.id}`}
                      </div>
                      <div className="text-[11px] text-rose-600 font-semibold">
                        ⚠ {ticket.prioritate || ticket.priority || 'critica'}
                      </div>
                    </div>
                    <span className="shrink-0 rounded bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                      {hoursLabel(ticket.hoursOpen)}
                    </span>
                  </button>
                ))}
                {unassigned.slice(0, 4).map(ticket => (
                  <button
                    key={ticket.uuid || ticket.id}
                    onClick={() => onNavigate('/sesizari')}
                    className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-white px-3 py-2 text-left transition hover:border-amber-400 hover:shadow-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium text-slate-800">
                        {ticket.titlu || ticket.title || `Sesizare #${ticket.id}`}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Fără responsabil · {ticket.departament || ''}
                      </div>
                    </div>
                    <span className="shrink-0 rounded bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                      {hoursLabel(ticket.hoursOpen)}
                    </span>
                  </button>
                ))}
                {(unassigned.length + critical.length) > 7 && (
                  <button
                    onClick={() => onNavigate('/sesizari')}
                    className="text-xs text-amber-600 hover:underline"
                  >
                    + {unassigned.length + critical.length - 7} mai multe →
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MiniTable({ columns, rows, empty }) {
  if (!rows.length) return <p className="py-6 text-sm text-slate-500">{empty}</p>
  return (
    <div className="overflow-hidden rounded-md border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
          <tr>
            {columns.map(column => <th key={column.key} className="px-3 py-2">{column.label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr key={row.id || row.uuid || index}>
              {columns.map(column => (
                <td key={column.key} className="px-3 py-2 text-slate-700">
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [data, setData] = useState(emptyState)
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState({})
  const snowSeason = isSnowSeason()

  useEffect(() => {
    let cancelled = false

    async function loadDashboard() {
      setLoading(true)
      const dates = lastDays(7)
      const requests = {
        daily: api.get('/daily-report'),
        stockOperations: api.get('/stock-operations'),
        fleetAssets: api.get('/fleet-assets'),
        inboxDocuments: api.get('/documents/inbox'),
        tickets: api.get('/tickets/my-open'),
        projects: api.get('/field/projects'),
        audit: api.get('/audit'),
        production7: Promise.allSettled(dates.map(date => api.get(`/daily-report?date=${date}`))),
        weather: snowSeason ? api.get('/snow-removal/weather') : Promise.resolve({ data: null }),
        commandCenter: api.get('/dashboard/command-center'),
      }

      const entries = await Promise.all(
        Object.entries(requests).map(async ([key, promise]) => {
          try {
            const response = await promise
            return [key, response.data, null]
          } catch (error) {
            return [key, null, error]
          }
        })
      )

      if (cancelled) return

      const nextData = { ...emptyState }
      const nextErrors = {}
      for (const [key, value, error] of entries) {
        if (error) nextErrors[key] = error
        nextData[key] = value
      }

      nextData.production7 = dates.map((date, index) => {
        const settled = nextData.production7?.[index]
        const report = settled?.status === 'fulfilled' ? settled.value.data?.report : null
        if (settled?.status === 'rejected') nextErrors.production7 = settled.reason
        return {
          date: date.slice(5),
          tone: numberFrom(report?.metrics?.asphaltTotal ?? report?.asphaltTotal),
        }
      })

      setData(nextData)
      setErrors(nextErrors)
      setLoading(false)
    }

    loadDashboard()
    return () => {
      cancelled = true
    }
  }, [snowSeason])

  const view = useMemo(() => {
    const report = data.daily?.report || {}
    const criticalStocks = report.criticalStocks || []
    const fleetAssets = arrayFrom(data.fleetAssets, ['assets', 'fleetAssets'])
    const inboxDocuments = arrayFrom(data.inboxDocuments, ['documents', 'items'])
    const tickets = arrayFrom(data.tickets, ['tickets', 'items'])
    const projects = arrayFrom(data.projects, ['projects', 'items'])
    const audit = arrayFrom(data.audit, ['audit', 'items'])
    const stockOperations = arrayFrom(data.stockOperations, ['movements', 'operations', 'items'])

    return {
      criticalStocks,
      asphaltToday: numberFrom(report.metrics?.asphaltTotal ?? report.asphaltTotal),
      activeAssets: fleetAssets.filter(assetIsActive).length,
      inboxDocuments,
      tickets,
      projects,
      audit,
      stockOperations,
    }
  }, [data])

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Dashboard operational</h2>
          <p className="text-sm text-slate-500">Indicatori rapizi din productiei, teren, flota si documente.</p>
        </div>
        <Badge tone="success">Live API</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon="📦"
          label="Stoc materiale critice"
          value={view.criticalStocks.length}
          loading={loading}
          error={errors.daily || errors.stockOperations}
          onClick={() => navigate(routes.stock)}
        />
        <KpiCard
          icon="🏭"
          label="Tone asfalt azi"
          value={view.asphaltToday.toLocaleString('ro-RO')}
          loading={loading}
          error={errors.daily}
          onClick={() => navigate(routes.production)}
        />
        <KpiCard
          icon="🚗"
          label="Utilaje active azi"
          value={view.activeAssets}
          loading={loading}
          error={errors.fleetAssets}
          onClick={() => navigate(routes.fleet)}
        />
        <KpiCard
          icon="📋"
          label="Documente de aprobat"
          value={view.inboxDocuments.length}
          loading={loading}
          error={errors.inboxDocuments}
          onClick={() => navigate(routes.documents)}
        />
      </div>

      <CommandCenterPanel
        data={data}
        loading={loading}
        error={errors.commandCenter}
        onNavigate={navigate}
      />

      <Card className="cursor-pointer" onClick={() => navigate(routes.projects)}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Status șantiere</h3>
          <Badge>{view.projects.length} active</Badge>
        </div>
        <SectionError error={errors.projects} />
        {loading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map(item => <Skeleton key={item} className="h-24" />)}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {view.projects.length ? view.projects.slice(0, 6).map(project => {
              const progress = projectProgress(project)
              return (
                <div key={project.id || project.uuid || project.cod} className="rounded-md border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">{projectName(project)}</div>
                      <div className="text-xs text-slate-500">{project.status || 'activ'}</div>
                    </div>
                    <span className="text-sm font-semibold text-primary-700">{progress}%</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-primary-600" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )
            }) : <p className="text-sm text-slate-500">Nu exista proiecte active de afisat.</p>}
          </div>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="cursor-pointer" onClick={() => navigate(routes.production)}>
          <h3 className="mb-4 text-base font-semibold text-slate-900">Grafic producție ultimele 7 zile</h3>
          <SectionError error={errors.production7} />
          {loading ? <Skeleton className="h-72" /> : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.production7}>
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="tone" stroke="#0F6E56" strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="cursor-pointer" onClick={() => navigate(routes.tickets)}>
          <h3 className="mb-4 text-base font-semibold text-slate-900">Sesizări recente</h3>
          <SectionError error={errors.tickets} />
          {loading ? (
            <div className="grid gap-2">{[1, 2, 3, 4].map(item => <Skeleton key={item} className="h-12" />)}</div>
          ) : (
            <div className="grid gap-2">
              {view.tickets.length ? view.tickets.slice(0, 6).map(ticket => (
                <div key={ticket.uuid || ticket.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-900">{ticket.titlu || ticket.title}</div>
                    <div className="text-xs text-slate-500">{statusText(ticket.status)}</div>
                  </div>
                  <Badge tone={priorityTone(ticket.prioritate)}>{ticket.prioritate || 'normal'}</Badge>
                </div>
              )) : <p className="text-sm text-slate-500">Nu ai sesizări deschise.</p>}
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="cursor-pointer" onClick={() => navigate(routes.stock)}>
          <h3 className="mb-4 text-base font-semibold text-slate-900">Stocuri critice</h3>
          <MiniTable
            rows={loading ? [] : view.criticalStocks.slice(0, 8)}
            empty={loading ? 'Se incarca...' : 'Nu exista materiale sub minim.'}
            columns={[
              { key: 'materialName', label: 'Material' },
              { key: 'stock', label: 'Stoc', render: row => `${row.stock} ${row.unit || ''}` },
              { key: 'alert', label: 'Minim' },
            ]}
          />
        </Card>

        <Card className="cursor-pointer" onClick={() => navigate(routes.documents)}>
          <h3 className="mb-4 text-base font-semibold text-slate-900">Documente în așteptare</h3>
          <div className="grid gap-2">
            {loading ? [1, 2, 3].map(item => <Skeleton key={item} className="h-11" />) : (
              view.inboxDocuments.length ? view.inboxDocuments.slice(0, 8).map(document => (
                <div key={document.uuid || document.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2">
                  <span className="truncate text-sm font-medium text-slate-900">{document.nr_document || document.titlu}</span>
                  <Badge tone="warning">{statusText(document.status)}</Badge>
                </div>
              )) : <p className="text-sm text-slate-500">Nu sunt documente de aprobat.</p>
            )}
          </div>
        </Card>

        <Card className="cursor-pointer" onClick={() => navigate(routes.audit)}>
          <h3 className="mb-4 text-base font-semibold text-slate-900">Activitate recentă</h3>
          <SectionError error={errors.audit} />
          <div className="grid gap-2">
            {loading ? [1, 2, 3, 4].map(item => <Skeleton key={item} className="h-10" />) : (
              view.audit.length ? view.audit.slice(0, 10).map((item, index) => (
                <div key={item.id || index} className="rounded-md border border-slate-200 px-3 py-2">
                  <div className="truncate text-sm font-medium text-slate-900">{displayText(item.action || item.actiune, 'actiune')}</div>
                  <div className="truncate text-xs text-slate-500">{displayText(item.details || item.detalii || item.userName || item.user)}</div>
                </div>
              )) : <p className="text-sm text-slate-500">Nu exista activitate recenta.</p>
            )}
          </div>
        </Card>
      </div>

      {snowSeason ? (
        <Card className="cursor-pointer border-sky-200 bg-sky-50/50" onClick={() => navigate(routes.snow)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">❄️ Deszăpezire</h3>
              <p className="text-sm text-slate-600">Meteo curent și recomandare intervenție</p>
            </div>
            {loading ? <Skeleton className="h-8 w-32" /> : (
              <Badge tone={data.weather?.recomandare?.culoare === 'rosu' ? 'danger' : 'success'}>
                {data.weather?.recomandare?.tip || 'indisponibil'}
              </Badge>
            )}
          </div>
          <SectionError error={errors.weather} />
          {!loading && data.weather ? (
            <div className="mt-4 grid gap-3 text-sm text-slate-700 md:grid-cols-4">
              <div><span className="text-slate-500">Temperatura</span><br />{data.weather.current?.temperature_2m ?? data.weather.temperature_2m ?? '-'}°C</div>
              <div><span className="text-slate-500">Precipitații</span><br />{data.weather.current?.precipitation ?? data.weather.precipitation ?? 0} mm</div>
              <div><span className="text-slate-500">Ninsoare</span><br />{data.weather.current?.snowfall ?? data.weather.snowfall ?? 0} mm</div>
              <div><span className="text-slate-500">Motiv</span><br />{data.weather.recomandare?.motiv || 'Nu exista recomandare.'}</div>
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  )
}
