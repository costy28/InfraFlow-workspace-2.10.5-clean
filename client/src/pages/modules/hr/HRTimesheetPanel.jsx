import Button from '../../../components/ui/Button'
import Card from '../../../components/ui/Card'
import { exportExcel } from '../../../utils/export'

function fullName(item) {
  return [item?.nume, item?.prenume].filter(Boolean).join(' ') || item?.name || 'Angajat'
}

function timesheetTone(value) {
  const raw = typeof value === 'object' ? value?.tip : value
  const text = String(raw || '').toLowerCase()
  if (['co', 'concediu', 'concediu_odihna'].includes(text)) return 'bg-amber-100 text-amber-900'
  if (['nemotivat', 'absent'].includes(text)) return 'bg-rose-100 text-rose-900'
  if (Number(raw) > 0 || ['lucru', 'prezent'].includes(text)) return 'bg-primary-50 text-primary-700'
  return 'bg-slate-100 text-slate-400'
}

function timesheetLabel(value) {
  if (typeof value === 'object') return value?.tip || value?.ore_lucrate || '-'
  return Number(value) > 0 ? Number(value) : '-'
}

function exportTimesheet(rows, monthDays, filters) {
  const exportRows = rows.map(row => {
    const obj = { Angajat: fullName(row), Departament: row.department_name || '' }
    monthDays.forEach(day => {
      const val = row.zile?.[day]
      obj[`Zi ${day.slice(-2)}`] = typeof val === 'object'
        ? (val?.tip && val.tip !== 'lucru' ? val.tip : val?.ore_lucrate ?? '')
        : (val ?? '')
    })
    const values = monthDays
      .map(day => row.zile?.[day])
      .map(value => typeof value === 'object' ? Number(value.ore_lucrate || 0) : Number(value || 0))
    obj['Total ore'] = values.reduce((sum, value) => sum + value, 0)
    obj['Zile lucrate'] = values.filter(value => value > 0).length
    return obj
  })
  exportExcel(exportRows, `Pontaj_${filters.luna}${filters.dept_id ? '_' + filters.dept_id : ''}`, `Pontaj ${filters.luna}`)
}

export default function HRTimesheetPanel({
  filters,
  deadlineDate,
  timesheetLock,
  rows,
  monthDays,
  loading,
  onFillWorkingDays,
  onSubmitDepartmentTimesheet,
  onValidateMonth,
  onInvalidateMonth,
  onOpenTimesheetCell,
  onOpenNexusExport,
}) {
  return (
    <Card>
      <div className="mb-3 rounded-lg border border-primary-100 bg-primary-50 p-3 text-sm text-primary-800">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="font-semibold">Pontaj {filters.luna} {filters.dept_id ? `— ${filters.dept_id}` : ''}</div>
            <div>Termen limită: {deadlineDate || 'nesetat'}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={timesheetLock?.locked} onClick={onFillWorkingDays}>Completeaza zilele lucratoare</Button>
            <Button size="sm" onClick={onSubmitDepartmentTimesheet}>✅ Marchează ca Finalizat</Button>
            <Button size="sm" variant="secondary" onClick={onValidateMonth}>Validează luna</Button>
            <Button size="sm" variant="secondary" onClick={onInvalidateMonth}>Devalideaza</Button>
            <Button size="sm" variant="secondary" onClick={() => exportTimesheet(rows, monthDays, filters)}>📊 Excel</Button>
            <Button size="sm" variant="secondary" onClick={onOpenNexusExport}>📥 Export Nexus</Button>
          </div>
        </div>
      </div>
      <div className="overflow-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50 text-left uppercase text-slate-500">
            <tr><th className="sticky left-0 bg-slate-50 px-3 py-2">Angajat</th>{monthDays.map(day => <th key={day} className="px-2 py-2 text-center">{day.slice(-2)}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length ? rows.map(row => (
              <tr key={row.employee_id || row.id}>
                <td className="sticky left-0 bg-white px-3 py-2 font-medium">{fullName(row)}</td>
                {monthDays.map(day => (
                  <td key={day} className="p-1 text-center">
                    <button
                      type="button"
                      title={`Editeaza ${fullName(row)} - ${day}`}
                      disabled={timesheetLock?.locked}
                      onClick={() => onOpenTimesheetCell(row, day)}
                      className={`inline-flex min-w-8 justify-center rounded px-1 py-1 transition hover:ring-2 hover:ring-primary-300 disabled:cursor-not-allowed disabled:opacity-60 ${timesheetTone(row.zile?.[day])}`}
                    >
                      {timesheetLabel(row.zile?.[day])}
                    </button>
                  </td>
                ))}
              </tr>
            )) : <tr><td className="px-3 py-8 text-sm text-slate-500" colSpan={monthDays.length + 1}>{loading ? 'Se incarca...' : 'Nu exista angajati activi in departamentul selectat. Verifica fisa HR si asocierea utilizatorului cu angajatul.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
