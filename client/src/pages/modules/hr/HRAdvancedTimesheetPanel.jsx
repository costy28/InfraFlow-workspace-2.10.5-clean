import Input from '../../../components/forms/Input'
import Select from '../../../components/forms/Select'
import Badge from '../../../components/ui/Badge'
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

function exportMonthlyReport(raportLunar) {
  const rows = raportLunar.zile.map(z => ({
    'Data': z.date,
    'Tip': z.tip,
    'Ore lucru': z.ore_lucrate,
    'Ore sup. S1 (+75%)': z.ore_suplimentare_s1,
    'Ore sup. S2 (+100%)': z.ore_suplimentare_s2,
    'Ore noapte (+25%)': z.ore_noapte,
    'Observații': z.observatii || '',
  }))
  exportExcel(rows, `Pontaj_${raportLunar.employee?.nume}_${raportLunar.luna}`)
}

export default function HRAdvancedTimesheetPanel({
  filters,
  timesheetLock,
  pendingOvertime,
  weeklyControls,
  raportEmployee,
  employees,
  raportLunar,
  overtimeBank,
  canValidateTimesheet,
  canApproveOvertime,
  onCheckLock,
  onToggleLock,
  onDecideOvertime,
  onRaportEmployeeChange,
  onMonthChange,
  onGenerateReport,
  onOpenCompensate,
}) {
  const overtimeRequests = pendingOvertime || []
  const weeklyExceptions = (weeklyControls || []).filter(item => item.status !== 'ok')

  return (
    <div className="grid gap-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-semibold">Inchidere pontaj {filters.luna}</div>
            <div className="text-sm text-slate-500">
              {timesheetLock?.locked ? 'Luna este inchisa. Modificarile sunt blocate.' : 'Luna este deschisa pentru completare si validare.'}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onCheckLock}>Verifica stare</Button>
            {canValidateTimesheet ? (
              <Button variant={timesheetLock?.locked ? 'secondary' : 'primary'} onClick={onToggleLock}>
                {timesheetLock?.locked ? 'Deblocheaza luna' : 'Inchide luna'}
              </Button>
            ) : null}
          </div>
        </div>
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="font-semibold">Ore suplimentare in asteptare</div>
              <div className="text-sm text-slate-500">Intra in banca de ore numai dupa aprobare.</div>
            </div>
            <Badge tone={overtimeRequests.length ? 'warning' : 'success'}>{overtimeRequests.length}</Badge>
          </div>
          <div className="grid gap-2">
            {overtimeRequests.map(item => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 p-2 text-sm">
                <div>
                  <strong>{item.employee_name}</strong>
                  <div className="text-xs text-slate-500">{String(item.data).slice(0, 10)} · {Number(item.ore_suplimentare_s1 || 0) + Number(item.ore_suplimentare_s2 || 0)} ore</div>
                </div>
                {canApproveOvertime ? (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => onDecideOvertime(item, 'approve')}>Aproba</Button>
                    <Button size="sm" variant="secondary" onClick={() => onDecideOvertime(item, 'reject')}>Respinge</Button>
                  </div>
                ) : null}
              </div>
            ))}
            {!overtimeRequests.length ? <div className="text-sm text-slate-500">Nu exista propuneri in asteptare.</div> : null}
          </div>
        </Card>
        <Card>
          <div className="mb-3">
            <div className="font-semibold">Control timp de munca</div>
            <div className="text-sm text-slate-500">Verificare operationala saptamanala; exceptiile necesita analiza HR.</div>
          </div>
          <div className="grid gap-2">
            {weeklyExceptions.map(item => (
              <div key={`${item.employee_id}-${item.week_start}`} className="rounded border border-amber-200 bg-amber-50 p-2 text-sm">
                <strong>{item.employee_name}</strong> · saptamana {item.week_start}
                <div>{item.total_hours} ore · {(item.warnings || []).join('; ')}</div>
              </div>
            ))}
            {!weeklyExceptions.length ? <div className="text-sm text-slate-500">Nu sunt depasiri operationale pentru luna selectata.</div> : null}
          </div>
        </Card>
      </div>
      <Card>
        <div className="grid gap-3 md:grid-cols-3">
          <Select
            label="Angajat"
            value={raportEmployee}
            onChange={e => onRaportEmployeeChange(e.target.value)}
            options={[{ value: '', label: 'Alege angajat…' }, ...(employees || []).map(emp => ({ value: String(emp.id), label: fullName(emp) }))]}
          />
          <Input label="Luna" type="month" value={filters.luna} onChange={e => onMonthChange(e.target.value)} />
          <div className="flex items-end">
            <Button onClick={() => onGenerateReport(raportEmployee, filters.luna)} disabled={!raportEmployee}>📊 Generează raport</Button>
          </div>
        </div>
      </Card>

      {raportLunar ? (
        <Card>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-lg font-bold text-slate-900">{fullName(raportLunar.employee)} — {raportLunar.luna}</div>
              <div className="text-sm text-slate-500">{raportLunar.employee?.functia || ''} · {raportLunar.employee?.department_name || ''}</div>
            </div>
            <Button variant="secondary" onClick={() => exportMonthlyReport(raportLunar)}>📊 Export Excel</Button>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            {[
              { label: 'Ore lucru normale', value: raportLunar.totals.ore_lucru, icon: '⏱️' },
              { label: 'Ore suplimentare S1 (+75%)', value: raportLunar.totals.ore_suplimentare_s1, icon: '➕', spor: raportLunar.sporuri?.spor_s1, currency: true },
              { label: 'Ore suplimentare S2 (+100%)', value: raportLunar.totals.ore_suplimentare_s2, icon: '➕➕', spor: raportLunar.sporuri?.spor_s2, currency: true },
              { label: 'Ore de noapte (+25%)', value: raportLunar.totals.ore_noapte, icon: '🌙', spor: raportLunar.sporuri?.spor_noapte, currency: true },
              { label: 'Zile CO', value: raportLunar.totals.zile_co, icon: '🏖️' },
              { label: 'Zile CM', value: raportLunar.totals.zile_cm, icon: '🏥' },
            ].map(item => (
              <div key={item.label} className="rounded-lg border border-slate-200 p-3 text-center">
                <div className="text-xl">{item.icon}</div>
                <div className="text-2xl font-bold text-slate-900">{item.value}</div>
                {item.spor != null ? <div className="text-xs font-medium text-primary-700">+{item.spor} RON spor</div> : null}
                <div className="text-xs text-slate-500">{item.label}</div>
              </div>
            ))}
          </div>

          <div className="overflow-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-left uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Tip</th>
                  <th className="px-3 py-2 text-right">Ore lucru</th>
                  <th className="px-3 py-2 text-right">Ore S1</th>
                  <th className="px-3 py-2 text-right">Ore S2</th>
                  <th className="px-3 py-2 text-right">Ore noapte</th>
                  <th className="px-3 py-2">Obs.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {raportLunar.zile.map(z => (
                  <tr key={z.date} className={z.tip !== 'lucru' && z.tip !== '-' ? 'bg-slate-50' : ''}>
                    <td className="px-3 py-1 font-medium">{z.date.slice(-5)}</td>
                    <td className="px-3 py-1"><span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${timesheetTone(z.tip)}`}>{z.tip}</span></td>
                    <td className="px-3 py-1 text-right">{z.ore_lucrate || '-'}</td>
                    <td className="px-3 py-1 text-right">{z.ore_suplimentare_s1 || '-'}</td>
                    <td className="px-3 py-1 text-right">{z.ore_suplimentare_s2 || '-'}</td>
                    <td className="px-3 py-1 text-right">{z.ore_noapte || '-'}</td>
                    <td className="px-3 py-1 text-slate-400">{z.observatii || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-16 text-sm text-slate-400">
          ↑ Alege un angajat și o lună, apoi apasă Generează raport
        </div>
      )}

      {raportLunar && overtimeBank ? (
        <Card>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-700">🏦 Bancă de ore — {fullName(raportLunar.employee)}</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">{overtimeBank.sold_curent ?? 0} ore</div>
              <div className="text-xs text-slate-500">Acumulate: {overtimeBank.ore_acumulate_total ?? 0} · Compensate: {overtimeBank.ore_compensate_total ?? 0}</div>
              {Number(overtimeBank.ore_scadente_plata || 0) > 0 ? <div className="mt-2 text-sm font-semibold text-rose-700">{overtimeBank.ore_scadente_plata} ore au depasit termenul de 90 zile si trebuie analizate pentru plata (spor minim 75%).</div> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {Number(overtimeBank.sold_curent || 0) > 40 ? <Badge tone="warning">⚠️ Ore expiră în curând</Badge> : null}
              <Button size="sm" onClick={onOpenCompensate}>Compensare</Button>
            </div>
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr><th className="px-3 py-2">Luna</th><th className="px-3 py-2 text-right">Ore supl.</th><th className="px-3 py-2 text-right">Compensate</th><th className="px-3 py-2 text-right">Sold</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(overtimeBank.istoric || []).length ? overtimeBank.istoric.map(row => (
                  <tr key={row.luna}>
                    <td className="px-3 py-2 font-medium">{row.luna}</td>
                    <td className="px-3 py-2 text-right">{row.ore_suplimentare || 0}</td>
                    <td className="px-3 py-2 text-right">{row.ore_compensate || 0}</td>
                    <td className="px-3 py-2 text-right font-semibold">{row.sold_luna || 0}</td>
                  </tr>
                )) : <tr><td colSpan="4" className="px-3 py-6 text-center text-sm text-slate-400">Nu există ore suplimentare în bancă.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  )
}
