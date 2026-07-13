import Badge from '../../../components/ui/Badge'
import Button from '../../../components/ui/Button'
import Card from '../../../components/ui/Card'

function employeeName(item) {
  return [item?.nume, item?.prenume].filter(Boolean).join(' ') || item?.name || 'Angajat'
}

export default function HRTrainingPanel({
  scadentar,
  evaluations,
  employees,
  loading,
  onRefresh,
  onNewEvaluation,
  onEditEvaluation,
  onDeleteEvaluation,
}) {
  return (
    <div className="grid gap-4">
      {scadentar.length === 0 && !loading ? null : (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-700">⚠️ Scadențar cursuri obligatorii (SSM / PSI / ISCIR)</div>
            <Button size="sm" variant="secondary" onClick={onRefresh}>↺ Actualizează</Button>
          </div>
          {scadentar.length === 0 ? (
            <p className="text-sm text-slate-400">Toate cursurile sunt la zi.</p>
          ) : (
            <div className="grid gap-2">
              {scadentar.map((item, idx) => (
                <div
                  key={`${item.employee_id}-${item.tip_curs}-${idx}`}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${item.status === 'expirat' ? 'border-rose-200 bg-rose-50' : item.status === 'urgent' ? 'border-orange-200 bg-orange-50' : 'border-amber-200 bg-amber-50'}`}
                >
                  <div>
                    <span className="text-lg">{item.icon}</span>
                    <span className="ml-2 font-medium text-slate-800">{item.employee_name}</span>
                    <span className="ml-2 text-slate-500">— {item.tip_curs}</span>
                    <span className="ml-1 text-xs text-slate-400">{item.department}</span>
                  </div>
                  <Badge tone={item.status === 'expirat' ? 'danger' : item.status === 'urgent' ? 'warning' : 'neutral'}>
                    {item.days_until_expiry < 0 ? `Expirat ${Math.abs(item.days_until_expiry)}z` : `${item.days_until_expiry}z rămase`}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-700">📋 Evaluări angajați ({evaluations.length})</div>
          <Button size="sm" onClick={onNewEvaluation}>+ Evaluare nouă</Button>
        </div>
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Angajat</th>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Tip</th>
                <th className="px-3 py-2">Calificativ</th>
                <th className="px-3 py-2">Punctaj</th>
                <th className="px-3 py-2">Observații</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {evaluations.length ? evaluations.map(ev => {
                const emp = employees.find(e => String(e.id) === String(ev.employee_id))
                return (
                  <tr key={ev.id}>
                    <td className="px-3 py-2 font-medium">{emp ? employeeName(emp) : ev.employee_id}</td>
                    <td className="px-3 py-2">{ev.data_evaluare}</td>
                    <td className="px-3 py-2"><Badge tone="neutral">{ev.tip}</Badge></td>
                    <td className="px-3 py-2">
                      <Badge tone={ev.calificativ === 'FB' ? 'success' : ev.calificativ === 'B' ? 'primary' : ev.calificativ === 'S' ? 'warning' : 'danger'}>
                        {ev.calificativ || '—'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">{ev.punctaj ?? '—'}</td>
                    <td className="px-3 py-2 max-w-xs truncate text-slate-500">{ev.observatii || '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button className="text-xs text-primary-600 hover:underline" onClick={() => onEditEvaluation(ev)}>✏️</button>
                        <button className="text-xs text-rose-500 hover:underline" onClick={() => onDeleteEvaluation(ev.id)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                )
              }) : <tr><td colSpan="7" className="px-3 py-8 text-center text-sm text-slate-400">Nu există evaluări. Adaugă prima evaluare.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
