import Input from '../../../components/forms/Input'
import Button from '../../../components/ui/Button'
import Card from '../../../components/ui/Card'

function daysUntil(dateStr) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
}

function alertTone(days) {
  if (days === null) return null
  if (days < 0) return 'danger'
  if (days <= 30) return 'warning'
  return null
}

function formatDateTime(value) {
  if (!value) return '-'
  return String(value).slice(0, 16).replace('T', ' ')
}

function laborRegistryExportLabel(type) {
  if (type === 'work_register') return 'Registru intern XLSX'
  if (type === 'contract') return 'Contract / modificare'
  if (type === 'incetare') return 'Încetare'
  if (type === 'suspendare') return 'Suspendare'
  return type || 'Export registru'
}

function DashboardAlertRow({ label, date, icon }) {
  const days = daysUntil(date)
  const tone = alertTone(days)
  if (!tone) return null
  return (
    <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${tone === 'danger' ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'}`}>
      <span className="text-xl">{icon}</span>
      <div className="flex-1 text-sm">
        <div className={`font-semibold ${tone === 'danger' ? 'text-rose-800' : 'text-amber-800'}`}>{label}</div>
        <div className={tone === 'danger' ? 'text-rose-600' : 'text-amber-600'}>
          {days < 0 ? `Expirat de ${Math.abs(days)} zile` : `Expiră în ${days} zile (${date})`}
        </div>
      </div>
    </div>
  )
}

function HRKpiCards({ stats }) {
  if (!stats) return null

  const kpis = [
    { label: 'Total angajați activi', value: stats.total_angajati ?? '-', icon: '👥' },
    { label: 'Prezenți azi', value: stats.prezenti_azi ?? '-', icon: '✅' },
    { label: 'În concediu', value: stats.in_concediu ?? '-', icon: '🏖️' },
    { label: 'Autorizații expiră 30 zile', value: stats.autorizatii_expira_30_zile ?? '-', icon: '⚠️' },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map(kpi => (
        <Card key={kpi.label}>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{kpi.icon}</span>
            <div>
              <div className="text-2xl font-bold text-slate-900">{kpi.value}</div>
              <div className="text-xs text-slate-500">{kpi.label}</div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}

function HRLaborReportingCard({
  countryRules,
  laborRegistryHistory,
  laborRegistryDiagnostic,
  canExportLaborRegistry,
  onExportLaborRegistry,
  onReloadLaborRegistryDiagnostic,
  onOpenLaborRegistryIssue,
}) {
  const current = countryRules?.current || {}
  const profile = current.profile || {}
  const registry = current.rules?.modules?.hr?.employee_registry || {}
  const history = Array.isArray(laborRegistryHistory) ? laborRegistryHistory.slice(0, 4) : []
  const diagnosticRows = Array.isArray(laborRegistryDiagnostic?.rows)
    ? laborRegistryDiagnostic.rows.filter(row => row.severity !== 'ready').slice(0, 4)
    : []
  const diagnosticSummary = laborRegistryDiagnostic?.summary || {}
  const isEnabled = Boolean(registry.enabled)
  const isInternalWorkFile = registry.current_export_status === 'internal_work_file'
  const isRoadmapApi = registry.status === 'roadmap_api'

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-800">🧾 Raportări oficiale muncă</div>
          <div className="text-xs text-slate-500">
            Regula vine din profilul de țară al organizației. Astfel nu amestecăm REGES România cu alte jurisdicții.
          </div>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${isEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
          {isEnabled ? 'profil local activ' : 'profil generic'}
        </span>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="text-xs text-slate-500">Țară / jurisdicție</div>
          <strong>{profile.label || current.country || 'Profil organizație'}</strong>
        </div>
        <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="text-xs text-slate-500">Registru salariați</div>
          <strong>{registry.label || 'Registru local configurabil'}</strong>
        </div>
        <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="text-xs text-slate-500">Status transmitere</div>
          <strong>{isInternalWorkFile ? 'Fișier intern de lucru' : isRoadmapApi ? 'API planificat' : 'De configurat pe țară'}</strong>
        </div>
      </div>

      <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        {isInternalWorkFile
          ? 'Exportul actual este pentru lucru intern și verificare. Transmiterea oficială se implementează separat, cu autentificare, recipisă și audit.'
          : 'Pentru fiecare țară se activează adaptorul local doar după validarea legislației și a integrării oficiale.'}
      </div>

      {canExportLaborRegistry ? (
        <div className="mt-3 rounded border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
            <div>
              <div className="text-xs font-semibold uppercase text-slate-500">Pregătire export intern</div>
              <div className="text-xs text-slate-500">{laborRegistryDiagnostic?.message || 'Verificare date pentru registrul intern de lucru.'}</div>
            </div>
            <Button size="sm" variant="secondary" onClick={onReloadLaborRegistryDiagnostic}>Reverifică</Button>
          </div>
          <div className="grid gap-2 p-3 sm:grid-cols-4">
            <div className="rounded border border-slate-200 p-2 text-sm"><div className="text-xs text-slate-500">Angajați</div><strong>{diagnosticSummary.total ?? '-'}</strong></div>
            <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm"><div className="text-xs text-emerald-700">Pregătiți</div><strong>{diagnosticSummary.ready ?? 0}</strong></div>
            <div className="rounded border border-amber-200 bg-amber-50 p-2 text-sm"><div className="text-xs text-amber-700">Atenționări</div><strong>{diagnosticSummary.warning ?? 0}</strong></div>
            <div className="rounded border border-rose-200 bg-rose-50 p-2 text-sm"><div className="text-xs text-rose-700">Blocaje</div><strong>{diagnosticSummary.blocker ?? 0}</strong></div>
          </div>
          {diagnosticRows.length ? (
            <div className="divide-y divide-slate-100 border-t border-slate-100">
              {diagnosticRows.map(row => (
                <div key={row.employee_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium text-slate-800">{row.employee_name} {row.marca ? `· marca ${row.marca}` : ''}</div>
                    {row.missing?.length ? <div className="text-xs text-rose-700">Lipsesc: {row.missing.join(', ')}</div> : null}
                    {row.warnings?.length ? <div className="text-xs text-amber-700">De verificat: {row.warnings.join(', ')}</div> : null}
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => onOpenLaborRegistryIssue?.(row)}>
                    Rezolvă
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="border-t border-slate-100 px-3 py-2 text-sm text-emerald-700">Nu sunt lipsuri principale în datele verificate.</div>
          )}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canExportLaborRegistry && isEnabled ? (
          <Button size="sm" onClick={onExportLaborRegistry}>
            📊 Descarcă registru intern
          </Button>
        ) : null}
        {registry.source_url ? (
          <a
            className="inline-flex rounded border border-slate-200 px-3 py-2 text-xs font-semibold text-primary-700 hover:border-primary-200 hover:text-primary-900"
            href={registry.source_url}
            target="_blank"
            rel="noreferrer"
          >
            Documentație adaptor oficial
          </a>
        ) : null}
      </div>

      {canExportLaborRegistry ? (
        <div className="mt-3 rounded border border-slate-200">
          <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase text-slate-500">
            Ultimele exporturi interne
          </div>
          {history.length ? (
            <div className="divide-y divide-slate-100">
              {history.map(item => (
                <div key={item.uuid || item.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium text-slate-800">{laborRegistryExportLabel(item.tip)}</div>
                    <div className="text-xs text-slate-500">{item.mesaj || 'Export generat pentru lucru intern.'}</div>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <div>{formatDateTime(item.created_at)}</div>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">{item.status || 'generat'}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-3 py-3 text-sm text-slate-400">Nu există exporturi interne înregistrate încă.</div>
          )}
        </div>
      ) : null}
    </Card>
  )
}

function HRManagementReportCard({
  period,
  onPeriodChange,
  onReload,
  onDownload,
  onGenerateNotifications,
  notificationResult,
  report,
}) {
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-800">📈 Raport management HR</div>
          <div className="text-xs text-slate-500">Sinteză pentru conducere: activitate, dosare, scadențe, concedii și sarcini deschise.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input type="date" value={period.from} onChange={event => onPeriodChange(current => ({ ...current, from: event.target.value }))} />
          <Input type="date" value={period.to} onChange={event => onPeriodChange(current => ({ ...current, to: event.target.value }))} />
          <Button size="sm" variant="secondary" onClick={onReload}>Recalculează</Button>
          <Button size="sm" onClick={onDownload}>📊 Export Excel</Button>
          <Button size="sm" onClick={onGenerateNotifications}>🔔 Generează notificări HR</Button>
        </div>
      </div>
      {notificationResult ? (
        <div className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          Notificări HR create: <strong>{notificationResult.created || 0}</strong>
          {' '}· deja existente: <strong>{notificationResult.skipped || 0}</strong>
          {' '}· sarcini acoperite: <strong>{notificationResult.tasks || 0}</strong>
          {' '}· destinatari: <strong>{notificationResult.targets || 0}</strong>
        </div>
      ) : null}
      {report ? (
        <div className="grid gap-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            {[
              ['Sarcini Inbox', report.kpi?.inbox_total || 0, 'slate'],
              ['Critice', report.kpi?.inbox_critical || 0, 'rose'],
              ['Dosare complete', report.kpi?.dossier_complete || 0, 'emerald'],
              ['Lipsuri dosar', report.kpi?.dossier_missing_required || 0, 'amber'],
              ['Scadențe ≤30 zile', report.kpi?.expiring_30 || 0, 'red'],
              ['Activități HR', report.kpi?.activity_total || 0, 'blue'],
            ].map(([label, value, tone]) => (
              <div key={label} className={`rounded border p-2 text-sm ${tone === 'rose' ? 'border-rose-200 bg-rose-50' : tone === 'emerald' ? 'border-emerald-200 bg-emerald-50' : tone === 'amber' ? 'border-amber-200 bg-amber-50' : tone === 'red' ? 'border-red-200 bg-red-50' : tone === 'blue' ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}>
                <div className="text-xs text-slate-500">{label}</div>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded border border-slate-200 p-3">
              <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Activitate pe categorii</div>
              {Object.entries(report.activity_by_category || {}).slice(0, 8).map(([label, count]) => (
                <div key={label} className="flex justify-between border-b border-slate-100 py-1 text-sm"><span>{label}</span><strong>{count}</strong></div>
              ))}
              {!Object.keys(report.activity_by_category || {}).length ? <div className="text-sm text-slate-400">Fără activitate în perioadă.</div> : null}
            </div>
            <div className="rounded border border-slate-200 p-3">
              <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Top lipsuri dosar</div>
              {(report.top_missing || []).slice(0, 8).map(item => (
                <div key={item.label} className="flex justify-between border-b border-slate-100 py-1 text-sm"><span>{item.label}</span><strong>{item.count}</strong></div>
              ))}
              {!(report.top_missing || []).length ? <div className="text-sm text-emerald-600">Nu sunt lipsuri obligatorii.</div> : null}
            </div>
            <div className="rounded border border-slate-200 p-3">
              <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Activitate pe utilizator HR</div>
              {(report.activity_by_user || []).slice(0, 8).map(item => (
                <div key={item.user_name} className="flex justify-between border-b border-slate-100 py-1 text-sm"><span>{item.user_name || 'Sistem'}</span><strong>{item.count}</strong></div>
              ))}
              {!(report.activity_by_user || []).length ? <div className="text-sm text-slate-400">Fără activitate în perioadă.</div> : null}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-5">
            <div className="rounded border border-slate-200 p-2 text-sm"><div className="text-xs text-slate-500">Concedii create</div><strong>{report.kpi?.leaves_created || 0}</strong></div>
            <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm"><div className="text-xs text-emerald-700">Concedii aprobate</div><strong>{report.kpi?.leaves_approved || 0}</strong></div>
            <div className="rounded border border-rose-200 bg-rose-50 p-2 text-sm"><div className="text-xs text-rose-700">Concedii respinse</div><strong>{report.kpi?.leaves_rejected || 0}</strong></div>
            <div className="rounded border border-blue-200 bg-blue-50 p-2 text-sm"><div className="text-xs text-blue-700">CM depuse</div><strong>{report.kpi?.medical_submitted || 0}</strong></div>
            <div className="rounded border border-primary-200 bg-primary-50 p-2 text-sm"><div className="text-xs text-primary-700">CM verificate</div><strong>{report.kpi?.medical_verified || 0}</strong></div>
          </div>
        </div>
      ) : <div className="text-sm text-slate-400">Raportul de management HR nu este încărcat.</div>}
    </Card>
  )
}

function PendingLeavesCard({ pendingLeaves, onApprove, onReject }) {
  if (!pendingLeaves.length) return null

  return (
    <Card>
      <div className="mb-3 text-sm font-semibold text-slate-700">⏳ Cereri de concediu în așteptare ({pendingLeaves.length})</div>
      <div className="grid gap-2">
        {pendingLeaves.map(item => (
          <div key={item.uuid || item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <div className="text-sm">
              <span className="font-medium text-slate-800">{item.tip}</span>
              <span className="ml-2 text-slate-600">{item.data_start} → {item.data_sfarsit}</span>
              {item.zile ? <span className="ml-2 text-slate-500">({item.zile} zile lucr.)</span> : null}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => onApprove(item.uuid || item.id)}>✅ Aprobă</Button>
              <Button size="sm" variant="secondary" onClick={() => onReject(item.uuid || item.id)}>❌ Respinge</Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function HRExpirationsCard({
  advancedExpirations,
  dashboardAlerts,
  onReload,
  onNotify,
  notificationResult,
  onOpenEmployee,
}) {
  const rows = advancedExpirations.rows || []

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-700">🔔 Scadențe HR avansate ({rows.length || dashboardAlerts.length})</div>
          <div className="text-xs text-slate-500">CI, apt medical, autorizații, contracte determinate, suspendări și documente din dosar.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={onReload}>Reîncarcă scadențe</Button>
          <Button size="sm" onClick={onNotify}>🔔 Notifică HR critic</Button>
        </div>
      </div>
      {notificationResult ? (
        <div className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          Notificări generate: <strong>{notificationResult.created || 0}</strong>
          {' '}· deja existente: <strong>{notificationResult.skipped || 0}</strong>
          {' '}· scadențe critice: <strong>{notificationResult.rows || 0}</strong>
          {' '}· destinatari: <strong>{notificationResult.targets || 0}</strong>
        </div>
      ) : null}
      <div className="mb-3 grid gap-2 sm:grid-cols-4">
        <div className="rounded border border-rose-200 bg-rose-50 p-2 text-sm"><div className="text-xs text-rose-700">Expirate</div><strong>{advancedExpirations.summary?.expired || 0}</strong></div>
        <div className="rounded border border-red-200 bg-red-50 p-2 text-sm"><div className="text-xs text-red-700">≤ 30 zile</div><strong>{advancedExpirations.summary?.critical || 0}</strong></div>
        <div className="rounded border border-amber-200 bg-amber-50 p-2 text-sm"><div className="text-xs text-amber-700">31–60 zile</div><strong>{advancedExpirations.summary?.warning || 0}</strong></div>
        <div className="rounded border border-blue-200 bg-blue-50 p-2 text-sm"><div className="text-xs text-blue-700">61–90 zile</div><strong>{advancedExpirations.summary?.info || 0}</strong></div>
      </div>
      {rows.length === 0 && dashboardAlerts.length === 0 ? (
        <p className="text-sm text-slate-400">Nu există expirări iminente. Toate documentele sunt la zi.</p>
      ) : (
        <div className="grid gap-2">
          {rows.length ? rows.slice(0, 20).map(item => (
            <div key={item.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${item.severity === 'expired' ? 'border-rose-200 bg-rose-50' : item.severity === 'critical' ? 'border-red-200 bg-red-50' : item.severity === 'warning' ? 'border-amber-200 bg-amber-50' : 'border-blue-200 bg-blue-50'}`}>
              <div>
                <div className="font-medium text-slate-800">{item.icon} {item.employee_name} — {item.label}</div>
                <div className="text-xs text-slate-500">{item.source} · {item.functia || '-'} · marca {item.marca || '-'}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold">{item.date}</div>
                <div className={`text-xs ${item.days < 0 ? 'text-rose-700' : item.days <= 30 ? 'text-red-700' : item.days <= 60 ? 'text-amber-700' : 'text-blue-700'}`}>{item.days < 0 ? `expirat de ${Math.abs(item.days)} zile` : `${item.days} zile rămase`}</div>
                <Button size="sm" variant="secondary" className="mt-1" onClick={() => onOpenEmployee(item)}>Deschide fișa</Button>
              </div>
            </div>
          )) : dashboardAlerts.map(alert => (
            <DashboardAlertRow key={alert.key} label={alert.label} date={alert.date} icon={alert.icon} />
          ))}
        </div>
      )}
    </Card>
  )
}

function HRExpirationNotificationsCard({
  notifications,
  onReload,
  onOpenEmployee,
  onResolve,
}) {
  const rows = notifications.notifications || []

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-700">📬 Istoric notificări scadențe HR</div>
          <div className="text-xs text-slate-500">Notificări generate pentru scadențele expirate sau critice, cu status de rezolvare.</div>
        </div>
        <Button size="sm" variant="secondary" onClick={onReload}>Reîncarcă istoric</Button>
      </div>
      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded border border-slate-200 p-2 text-sm"><div className="text-xs text-slate-500">Total notificări</div><strong>{notifications.summary?.total || 0}</strong></div>
        <div className="rounded border border-red-200 bg-red-50 p-2 text-sm"><div className="text-xs text-red-700">Deschise</div><strong>{notifications.summary?.open || 0}</strong></div>
        <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm"><div className="text-xs text-emerald-700">Rezolvate</div><strong>{notifications.summary?.resolved || 0}</strong></div>
      </div>
      {rows.length ? (
        <div className="grid gap-2">
          {rows.slice(0, 12).map(item => (
            <div key={item.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${item.status === 'rezolvată' ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
              <div>
                <div className="font-medium text-slate-800">{item.title} · {item.user_name || 'HR'}</div>
                <div className="text-xs text-slate-600">{item.message}</div>
                {item.detail ? <div className="text-xs text-slate-400">{item.detail}</div> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-right">
                <span className={`rounded-full px-2 py-1 text-xs ${item.status === 'rezolvată' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{item.status}</span>
                {item.created_at ? <span className="text-xs text-slate-400">{String(item.created_at).slice(0, 16).replace('T', ' ')}</span> : null}
                {item.employee_id ? <Button size="sm" variant="secondary" onClick={() => onOpenEmployee(item)}>Deschide fișa</Button> : null}
                {item.status !== 'rezolvată' ? <Button size="sm" onClick={() => onResolve(item.id)}>Marchează rezolvat</Button> : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400">Nu există notificări HR generate pentru scadențe.</p>
      )}
    </Card>
  )
}

export default function HRDashboardPanel({
  stats,
  hrManagementPeriod,
  onHrManagementPeriodChange,
  onLoadHrManagementReport,
  onDownloadHrManagementReport,
  onGenerateHrNotifications,
  hrNotificationResult,
  hrManagementReport,
  countryRules,
  laborRegistryHistory,
  laborRegistryDiagnostic,
  canExportLaborRegistry,
  onExportLaborRegistry,
  onReloadLaborRegistryDiagnostic,
  onOpenLaborRegistryIssue,
  pendingLeaves,
  onApproveLeave,
  onRejectLeave,
  advancedExpirations,
  dashboardAlerts,
  onLoadAdvancedExpirations,
  onNotifyAdvancedExpirations,
  expirationNoticeResult,
  onOpenExpirationEmployee,
  expirationNotifications,
  onLoadExpirationNotifications,
  onResolveExpirationNotification,
}) {
  return (
    <div className="grid gap-4">
      <HRKpiCards stats={stats} />
      <HRLaborReportingCard
        countryRules={countryRules}
        laborRegistryHistory={laborRegistryHistory}
        laborRegistryDiagnostic={laborRegistryDiagnostic}
        canExportLaborRegistry={canExportLaborRegistry}
        onExportLaborRegistry={onExportLaborRegistry}
        onReloadLaborRegistryDiagnostic={onReloadLaborRegistryDiagnostic}
        onOpenLaborRegistryIssue={onOpenLaborRegistryIssue}
      />
      <HRManagementReportCard
        period={hrManagementPeriod}
        onPeriodChange={onHrManagementPeriodChange}
        onReload={onLoadHrManagementReport}
        onDownload={onDownloadHrManagementReport}
        onGenerateNotifications={onGenerateHrNotifications}
        notificationResult={hrNotificationResult}
        report={hrManagementReport}
      />
      <PendingLeavesCard
        pendingLeaves={pendingLeaves}
        onApprove={onApproveLeave}
        onReject={onRejectLeave}
      />
      <HRExpirationsCard
        advancedExpirations={advancedExpirations}
        dashboardAlerts={dashboardAlerts}
        onReload={onLoadAdvancedExpirations}
        onNotify={onNotifyAdvancedExpirations}
        notificationResult={expirationNoticeResult}
        onOpenEmployee={onOpenExpirationEmployee}
      />
      <HRExpirationNotificationsCard
        notifications={expirationNotifications}
        onReload={onLoadExpirationNotifications}
        onOpenEmployee={onOpenExpirationEmployee}
        onResolve={onResolveExpirationNotification}
      />
    </div>
  )
}
