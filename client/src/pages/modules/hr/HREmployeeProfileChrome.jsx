import Button from '../../../components/ui/Button'

const PROFILE_TABS = [
  ['date', 'Date personale'],
  ['contracte', 'Contracte'],
  ['pontaj', 'Pontaj & concedii'],
  ['dosar', 'Dosar documente'],
  ['kiosk', 'Scadențe & Kiosk'],
  ['flux', 'Onboarding / Offboarding'],
  ['echipamente', 'Echipamente'],
]

export function HREmployeeProfileHeader({
  employee,
  displayName,
  editMode,
  photoInputRef,
  photoPreview,
  onCancelEdit,
  onPhotoSelected,
  onPrint,
  onSave,
  onStartEdit,
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="relative flex-shrink-0">
        {photoPreview || employee.photo_url
          ? <img src={photoPreview || employee.photo_url} alt="Fotografie" className="h-20 w-20 rounded-xl object-cover ring-2 ring-primary-200" onError={e => { e.target.style.display='none' }} />
          : <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-slate-100 text-4xl">👤</div>
        }
        {editMode ? (
          <button
            type="button"
            className="absolute -bottom-1 -right-1 rounded-full bg-primary-600 p-1 text-white shadow hover:bg-primary-700"
            onClick={() => photoInputRef.current?.click()}
            title="Schimbă fotografia"
          >📷</button>
        ) : null}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={event => {
            const file = event.target.files?.[0]
            if (file) onPhotoSelected(file)
          }}
        />
      </div>
      <div className="flex-1">
        <div className="text-lg font-bold text-slate-900">{displayName}</div>
        <div className="text-sm text-slate-500">{employee.functia || '-'} · {employee.department_name || '-'}</div>
        <div className="mt-1 text-xs text-slate-400">Marcă: {employee.marca || '-'} · Vechime: {employee.zile_vechime ?? '-'} zile</div>
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="secondary" onClick={onPrint}>🖨️ Fișă angajat</Button>
          {editMode
            ? <>
                <Button size="sm" onClick={onSave}>💾 Salvează</Button>
                <Button size="sm" variant="secondary" onClick={onCancelEdit}>Renunță</Button>
              </>
            : <Button size="sm" variant="secondary" onClick={onStartEdit}>✏️ Editează</Button>
          }
        </div>
      </div>
    </div>
  )
}

export function HREmployeeProfileStatusCards({
  coBalance,
  contracts,
  dossierSummary,
  employee,
  expirations,
  workflow,
}) {
  const nextExpiration = expirations[0]
  const workflowActive = workflow && !['completed','cancelled'].includes(workflow.status)

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      <div className="rounded-lg border border-slate-200 p-3 text-sm">
        <div className="text-xs text-slate-500">Status contract</div>
        <strong>{employee.tip_contract || contracts[0]?.tip || 'activ'}</strong>
        <div className="text-xs text-slate-400">{employee.data_angajare || contracts[0]?.data_start || '-'}</div>
      </div>
      <div className="rounded-lg border border-primary-200 bg-primary-50 p-3 text-sm">
        <div className="text-xs text-primary-700">Dosar HR</div>
        <strong>{dossierSummary?.percent ?? 0}%</strong>
        <div className="text-xs text-primary-600">{dossierSummary?.required_done ?? 0}/{dossierSummary?.required_total ?? 0} obligatorii</div>
      </div>
      <div className={`rounded-lg border p-3 text-sm ${dossierSummary?.pending_ack ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
        <div className="text-xs">Confirmări Kiosk</div>
        <strong>{dossierSummary?.pending_ack ?? 0}</strong>
        <div className="text-xs">neconfirmate</div>
      </div>
      <div className={`rounded-lg border p-3 text-sm ${nextExpiration?.severity === 'expired' ? 'border-rose-200 bg-rose-50' : nextExpiration ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
        <div className="text-xs">Următoarea scadență</div>
        <strong>{nextExpiration?.date || '—'}</strong>
        <div className="text-xs">{nextExpiration?.label || 'fără scadențe apropiate'}</div>
      </div>
      <div className={`rounded-lg border p-3 text-sm ${workflowActive ? 'border-violet-200 bg-violet-50' : 'border-slate-200'}`}>
        <div className="text-xs text-slate-500">Flux HR</div>
        <strong>{workflow ? `${workflow.progress?.percent || 0}%` : 'nepornit'}</strong>
        <div className="text-xs text-slate-400">{workflow?.type || `CO: ${coBalance ? `${coBalance.zile_ramase} zile` : `${employee.zile_co_drept ?? 21} / an`}`}</div>
      </div>
    </div>
  )
}

export function HREmployeeProfileActivity({ items, onReload }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-800">🕘 Activitate HR recentă</div>
          <div className="text-xs text-slate-500">Ultimele acțiuni operaționale legate de acest angajat.</div>
        </div>
        <Button size="sm" variant="secondary" onClick={onReload}>Reîncarcă</Button>
      </div>
      <div className="grid gap-2">
        {items.map(item => (
          <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-100 px-3 py-2 text-xs">
            <div>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">{item.category_label || item.category}</span>
              <span className="ml-2 font-semibold text-slate-800">{item.label}</span>
              {item.details ? <div className="mt-1 text-slate-500">{item.details}</div> : null}
            </div>
            <div className="text-right text-slate-500">
              <div>{item.user_name || 'Sistem'}</div>
              <strong>{String(item.at || '').slice(0, 16).replace('T', ' ')}</strong>
            </div>
          </div>
        ))}
        {!items.length ? <div className="text-sm text-slate-400">Nu există activitate HR recentă în jurnal pentru acest angajat.</div> : null}
      </div>
    </div>
  )
}

export function HREmployeeProfileTabs({ activeTab, onTabChange }) {
  return (
    <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
      {PROFILE_TABS.map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => onTabChange(value)}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold ${activeTab === value ? 'bg-primary-700 text-white shadow' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
