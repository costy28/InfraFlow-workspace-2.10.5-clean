import Input from '../../../components/forms/Input'
import Select from '../../../components/forms/Select'
import Button from '../../../components/ui/Button'
import Card from '../../../components/ui/Card'

function inboxFilters(summary = {}) {
  return [
    { value: 'toate', label: `Toate (${summary.total || 0})` },
    { value: 'critice', label: `Critice (${summary.critical || 0})` },
    { value: 'avertizari', label: `Avertizări (${summary.warning || 0})` },
    { value: 'concedii', label: `Concedii (${summary.by_category?.concedii || 0})` },
    { value: 'medical', label: `Medicale (${summary.by_category?.medical || 0})` },
    { value: 'onboarding', label: `Onboarding (${summary.by_category?.onboarding || 0})` },
    { value: 'offboarding', label: `Offboarding (${summary.by_category?.offboarding || 0})` },
    { value: 'dosar', label: `Dosar (${summary.by_category?.dosar || 0})` },
    { value: 'kiosk', label: `Kiosk (${summary.by_category?.kiosk || 0})` },
    { value: 'scadente', label: `Scadențe (${summary.by_category?.scadente || 0})` },
  ]
}

function InboxSummaryCard({ hrInbox, activeFilter, onFilterChange, onReload }) {
  const summary = hrInbox.summary || {}

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-800">📥 Inbox HR — sarcini care cer acțiune</div>
          <div className="text-xs text-slate-500">Concedii, medicale, fluxuri, dosare incomplete, confirmări Kiosk și scadențe într-un singur panou.</div>
        </div>
        <Button size="sm" variant="secondary" onClick={onReload}>Reîncarcă inbox</Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        <div className="rounded border border-slate-200 p-2 text-sm"><div className="text-xs text-slate-500">Total sarcini</div><strong>{summary.total || 0}</strong></div>
        <div className="rounded border border-rose-200 bg-rose-50 p-2 text-sm"><div className="text-xs text-rose-700">Critice</div><strong>{summary.critical || 0}</strong></div>
        <div className="rounded border border-amber-200 bg-amber-50 p-2 text-sm"><div className="text-xs text-amber-700">Avertizări</div><strong>{summary.warning || 0}</strong></div>
        <div className="rounded border border-blue-200 bg-blue-50 p-2 text-sm"><div className="text-xs text-blue-700">Informative</div><strong>{summary.info || 0}</strong></div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {inboxFilters(summary).map(filter => (
          <button
            key={filter.value}
            type="button"
            onClick={() => onFilterChange(filter.value)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${activeFilter === filter.value ? 'bg-primary-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {filter.label}
          </button>
        ))}
      </div>
    </Card>
  )
}

function InboxTaskRow({ item, onOpenTask }) {
  const severityClass = item.severity === 'critical'
    ? 'border-rose-200 bg-rose-50'
    : item.severity === 'warning'
      ? 'border-amber-200 bg-amber-50'
      : 'border-blue-200 bg-blue-50'
  const severityLabel = item.severity === 'critical' ? 'critic' : item.severity === 'warning' ? 'atenție' : 'info'

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${severityClass}`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.severity === 'critical' ? 'bg-rose-100 text-rose-700' : item.severity === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{severityLabel}</span>
          <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold uppercase text-slate-500">{item.category}</span>
          <span className="font-semibold text-slate-800">{item.title}</span>
        </div>
        <div className="mt-1 text-slate-700">{item.employee_name || '—'}{item.marca ? ` · marca ${item.marca}` : ''}{item.department_name ? ` · ${item.department_name}` : ''}</div>
        {item.detail ? <div className="text-xs text-slate-500">{item.detail}</div> : null}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {item.due_date ? <div className="text-right text-xs text-slate-500"><div>Termen/sursă</div><strong>{String(item.due_date).slice(0, 10)}</strong></div> : null}
        {['dosar', 'scadente'].includes(item.category) && item.employee_id ? (
          <Button size="sm" variant="secondary" onClick={() => onOpenTask({ ...item, action: 'guided_upload', action_label: 'Încarcă document' })}>Încarcă document</Button>
        ) : null}
        <Button size="sm" onClick={() => onOpenTask(item)}>{item.action_label || 'Deschide'}</Button>
      </div>
    </div>
  )
}

function InboxTasksCard({ rows, dossierReminderResult, onOpenTask }) {
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-700">{rows.length} sarcini afișate</div>
        {dossierReminderResult ? <div className="text-xs text-emerald-700">Ultimul reminder Kiosk: {dossierReminderResult.pending || 0} documente · {String(dossierReminderResult.sent_at || '').slice(0, 16).replace('T', ' ')}</div> : null}
      </div>
      <div className="grid gap-2">
        {rows.slice(0, 80).map(item => (
          <InboxTaskRow key={item.id} item={item} onOpenTask={onOpenTask} />
        ))}
        {!rows.length ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-6 text-center text-sm text-emerald-700">
            Inbox HR curat. Nu sunt sarcini pentru filtrul selectat.
          </div>
        ) : null}
      </div>
    </Card>
  )
}

function HRActivityCard({
  hrActivity,
  activityFilter,
  onActivityFilterChange,
  activityCategories,
  employeeOptions,
  onReload,
  onDownload,
}) {
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-800">🧾 Istoric rezolvări / jurnal operațional HR</div>
          <div className="text-xs text-slate-500">Evenimente HR normalizate pentru audit: documente, Kiosk, concedii, fluxuri, pontaj, contracte și echipamente.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={onReload}>Reîncarcă jurnal</Button>
          <Button size="sm" onClick={onDownload}>📊 Export Excel</Button>
        </div>
      </div>
      <div className="mb-3 grid gap-2 md:grid-cols-4">
        <Select label="Categorie" value={activityFilter.category} onChange={event => onActivityFilterChange(current => ({ ...current, category: event.target.value }))} options={[{ value: '', label: 'Toate categoriile' }, ...activityCategories]} />
        <Select label="Angajat" value={activityFilter.employee_id} onChange={event => onActivityFilterChange(current => ({ ...current, employee_id: event.target.value }))} options={[{ value: '', label: 'Toți angajații' }, ...employeeOptions]} />
        <Input label="De la" type="date" value={activityFilter.from} onChange={event => onActivityFilterChange(current => ({ ...current, from: event.target.value }))} />
        <Input label="Până la" type="date" value={activityFilter.to} onChange={event => onActivityFilterChange(current => ({ ...current, to: event.target.value }))} />
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-slate-500">Total filtrat: <strong>{hrActivity.summary?.total || 0}</strong></div>
        <Button size="sm" variant="secondary" onClick={onReload}>Aplică filtre</Button>
      </div>
      <div className="grid gap-2">
        {(hrActivity.rows || []).slice(0, 40).map(item => (
          <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{item.category_label || item.category}</span>
                <span className="font-semibold text-slate-800">{item.label}</span>
              </div>
              <div className="text-xs text-slate-500">{item.employee_name || '—'}{item.marca ? ` · marca ${item.marca}` : ''}{item.details ? ` · ${item.details}` : ''}</div>
            </div>
            <div className="text-right text-xs text-slate-500">
              <div>{item.user_name || 'Sistem'}</div>
              <strong>{String(item.at || '').slice(0, 16).replace('T', ' ')}</strong>
            </div>
          </div>
        ))}
        {!(hrActivity.rows || []).length ? <div className="rounded border border-slate-200 px-3 py-6 text-center text-sm text-slate-400">Nu există evenimente HR pentru filtrele selectate.</div> : null}
      </div>
    </Card>
  )
}

export default function HRInboxPanel({
  hrInbox,
  hrInboxFilter,
  onInboxFilterChange,
  onLoadHrInbox,
  hrInboxRows,
  dossierReminderResult,
  onOpenHrInboxTask,
  hrActivity,
  hrActivityFilter,
  onHrActivityFilterChange,
  hrActivityCategories,
  employeeOptions,
  onLoadHrActivity,
  onDownloadHrActivity,
}) {
  return (
    <div className="grid gap-4">
      <InboxSummaryCard
        hrInbox={hrInbox}
        activeFilter={hrInboxFilter}
        onFilterChange={onInboxFilterChange}
        onReload={onLoadHrInbox}
      />
      <InboxTasksCard
        rows={hrInboxRows}
        dossierReminderResult={dossierReminderResult}
        onOpenTask={onOpenHrInboxTask}
      />
      <HRActivityCard
        hrActivity={hrActivity}
        activityFilter={hrActivityFilter}
        onActivityFilterChange={onHrActivityFilterChange}
        activityCategories={hrActivityCategories}
        employeeOptions={employeeOptions}
        onReload={onLoadHrActivity}
        onDownload={onDownloadHrActivity}
      />
    </div>
  )
}
