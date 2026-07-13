import Badge from '../../../components/ui/Badge'

function leaveTone(status) {
  if (['aprobat','aprobata'].includes(status)) return 'success'
  if (status === 'respins') return 'danger'
  return 'warning'
}

export default function HREmployeeAttendanceTab({ coBalance, employee, leaves }) {
  const leaveRows = Array.isArray(leaves) ? leaves : []

  return (
    <div className="grid gap-4">
      <div className="grid gap-2 sm:grid-cols-4">
        <div className="rounded border border-slate-200 p-3 text-sm">
          <div className="text-xs text-slate-500">Zile pontate</div>
          <strong>{employee.statistici_pontaj?.zile_pontate ?? 0}</strong>
        </div>
        <div className="rounded border border-slate-200 p-3 text-sm">
          <div className="text-xs text-slate-500">Ore total</div>
          <strong>{employee.statistici_pontaj?.ore_total ?? 0}</strong>
        </div>
        <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm">
          <div className="text-xs text-emerald-700">CO rămas</div>
          <strong>{coBalance?.zile_ramase ?? '-'}</strong>
        </div>
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm">
          <div className="text-xs text-amber-700">Cereri concediu</div>
          <strong>{leaveRows.length}</strong>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Istoric concedii</div>
        <div className="grid gap-2">
          {leaveRows.slice(0, 12).map(item => (
            <div key={item.uuid || item.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-slate-50 px-3 py-2 text-sm">
              <span><strong>{item.tip}</strong> · {item.data_start} — {item.data_sfarsit} · {item.zile || '-'} zile</span>
              <Badge tone={leaveTone(item.status)}>{item.status || 'cerut'}</Badge>
            </div>
          ))}
          {!leaveRows.length ? <div className="text-sm text-slate-400">Nu există cereri de concediu înregistrate.</div> : null}
        </div>
      </div>
    </div>
  )
}
