import Button from '../../../components/ui/Button'

function expirationClass(item) {
  if (item.severity === 'expired') return 'bg-rose-50 text-rose-800'
  if (item.severity === 'critical') return 'bg-red-50 text-red-800'
  if (item.severity === 'warning') return 'bg-amber-50 text-amber-800'
  return 'bg-blue-50 text-blue-800'
}

export default function HREmployeeKioskTab({ dossierSummary, expirations, onSendReminder }) {
  const expirationRows = Array.isArray(expirations) ? expirations : []
  const missingRequired = dossierSummary?.missing_required || []

  return (
    <div className="grid gap-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded border border-slate-200 p-3 text-sm">
          <div className="text-xs text-slate-500">Documente Kiosk</div>
          <strong>{dossierSummary?.kiosk_documents ?? 0}</strong>
        </div>
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm">
          <div className="text-xs text-amber-700">Neconfirmate</div>
          <strong>{dossierSummary?.pending_ack ?? 0}</strong>
        </div>
        <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm">
          <div className="text-xs text-blue-700">Scadențe ≤90 zile</div>
          <strong>{expirationRows.length}</strong>
        </div>
      </div>

      {dossierSummary?.pending_ack ? <Button size="sm" onClick={onSendReminder}>Trimite reminder Kiosk</Button> : null}

      <div className="rounded-lg border border-slate-200 p-3">
        <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Lipsuri obligatorii & scadențe</div>
        {missingRequired.length ? (
          <div className="mb-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Lipsesc: {missingRequired.join(', ')}
          </div>
        ) : (
          <div className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Documentele obligatorii sunt complete.
          </div>
        )}
        <div className="grid gap-2">
          {expirationRows.map(item => (
            <div key={item.id} className={`flex flex-wrap items-center justify-between gap-2 rounded px-3 py-2 text-sm ${expirationClass(item)}`}>
              <span>{item.icon} {item.label}</span>
              <span>{item.date} · {item.days < 0 ? `expirat de ${Math.abs(item.days)} zile` : `${item.days} zile rămase`}</span>
            </div>
          ))}
          {!expirationRows.length ? <div className="text-sm text-slate-400">Nu există scadențe apropiate.</div> : null}
        </div>
      </div>
    </div>
  )
}
