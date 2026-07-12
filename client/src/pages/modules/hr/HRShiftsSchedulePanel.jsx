import Input from '../../../components/forms/Input'
import Select from '../../../components/forms/Select'
import Button from '../../../components/ui/Button'
import Card from '../../../components/ui/Card'

function fullName(item) {
  return [item?.nume, item?.prenume].filter(Boolean).join(' ') || item?.name || 'Angajat'
}

function daysInMonth(month) {
  const [year, value] = month.split('-').map(Number)
  return Array.from({ length: new Date(year, value, 0).getDate() }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`)
}

function shiftInitials(tura) {
  if (!tura) return ''
  if (tura.nume === 'Normal') return 'N'
  return (tura.nume || '').replace(/[^0-9IVX]/gi, '').slice(0, 2) || 'T'
}

export default function HRShiftsSchedulePanel({
  tures,
  scheduleEmployees,
  scheduleData,
  scheduleMonth,
  scheduleDept,
  departments,
  onNewShift,
  onEditShift,
  onDeactivateShift,
  onScheduleMonthChange,
  onScheduleDeptChange,
  onRefreshSchedule,
  onSetScheduleShift,
}) {
  const monthDays = daysInMonth(scheduleMonth)

  return (
    <div className="grid gap-4">
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-700">Ture definite</div>
          <Button size="sm" onClick={onNewShift}>+ Tură nouă</Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {(tures || []).map(tura => (
            <div key={tura.id} className="rounded-lg border border-slate-200 p-3" style={{ borderLeft: `5px solid ${tura.culoare || '#3B82F6'}` }}>
              <div className="font-semibold text-slate-900">{tura.nume}</div>
              <div className="text-sm text-slate-500">{tura.ora_start}–{tura.ora_sfarsit}</div>
              <div className="text-xs text-slate-400">{tura.ore_normale || 8} ore normale</div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => onEditShift(tura)}>Editeaza</Button>
                <Button size="sm" variant="secondary" onClick={() => onDeactivateShift(tura)}>Dezactiveaza</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="mb-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <Input label="Luna" type="month" value={scheduleMonth} onChange={e => onScheduleMonthChange(e.target.value)} />
          <Select label="Departament" value={scheduleDept} onChange={e => onScheduleDeptChange(e.target.value)} options={[{ value: '', label: 'Toate departamentele' }, ...(departments || [])]} />
          <div className="flex items-end"><Button variant="secondary" onClick={onRefreshSchedule}>↺ Actualizează</Button></div>
        </div>
        <div className="overflow-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-left uppercase text-slate-500">
              <tr>
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2">Angajat</th>
                {monthDays.map(day => <th key={day} className="px-2 py-2 text-center">{day.slice(-2)}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(scheduleEmployees || []).length ? scheduleEmployees.map(emp => (
                <tr key={emp.id}>
                  <td className="sticky left-0 z-10 min-w-48 bg-white px-3 py-2">
                    <div className="flex items-center gap-2">
                      {emp.photo_url
                        ? <img src={emp.photo_url} alt="" className="h-7 w-7 rounded-full object-cover" onError={e => { e.target.style.display='none' }} />
                        : <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs">👤</div>
                      }
                      <div>
                        <div className="font-medium text-slate-800">{fullName(emp)}</div>
                        <div className="text-[10px] text-slate-400">{emp.functia || ''}</div>
                      </div>
                    </div>
                  </td>
                  {monthDays.map(day => {
                    const key = `${emp.id}:${day}`
                    const tura = (tures || []).find(item => String(item.id) === String(scheduleData?.[key]))
                    return (
                      <td key={day} className="p-1 text-center">
                        <select
                          value={scheduleData?.[key] || ''}
                          onChange={e => onSetScheduleShift(emp.id, day, e.target.value)}
                          className="h-7 w-12 rounded border border-slate-200 text-[10px] outline-none"
                          style={tura ? { backgroundColor: tura.culoare, color: '#fff' } : undefined}
                          title={tura ? `${tura.nume} ${tura.ora_start}-${tura.ora_sfarsit}` : 'Alege tură'}
                        >
                          <option value="">—</option>
                          {(tures || []).map(item => <option key={item.id} value={item.id}>{item.nume === 'Normal' ? 'N' : item.nume}</option>)}
                        </select>
                        {tura ? <div className="mt-0.5 text-[9px] font-semibold" style={{ color: tura.culoare }}>{shiftInitials(tura)}</div> : null}
                      </td>
                    )
                  })}
                </tr>
              )) : <tr><td colSpan={monthDays.length + 1} className="px-3 py-8 text-center text-sm text-slate-500">Nu există angajați pentru filtrul ales.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
