import Input from '../../../components/forms/Input'
import Select from '../../../components/forms/Select'
import Button from '../../../components/ui/Button'
import Card from '../../../components/ui/Card'

export default function HRMealTicketsPanel({
  mealConfig,
  mealMonth,
  mealDept,
  mealRows,
  departments,
  onMealConfigChange,
  onSaveMealConfig,
  onMealMonthChange,
  onMealDeptChange,
  onExportCsv,
}) {
  const totalTickets = (mealRows || []).reduce((sum, row) => sum + Number(row.tichete || 0), 0)
  const totalValue = (mealRows || []).reduce((sum, row) => sum + Number(row.valoare || 0), 0)

  return (
    <div className="grid gap-4">
      <Card>
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <Input
            label="💰 Valoare tichet (lei)"
            type="number"
            value={mealConfig.valoare_tichet || 40}
            onChange={e => onMealConfigChange({ ...mealConfig, valoare_tichet: Number(e.target.value) })}
          />
          <Button onClick={onSaveMealConfig}>Salvează</Button>
        </div>
      </Card>
      <Card>
        <div className="mb-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <Input label="Luna" type="month" value={mealMonth} onChange={e => onMealMonthChange(e.target.value)} />
          <Select label="Departament" value={mealDept} onChange={e => onMealDeptChange(e.target.value)} options={[{ value: '', label: 'Toate departamentele' }, ...(departments || [])]} />
          <div className="flex items-end"><Button variant="secondary" onClick={onExportCsv}>📥 Export CSV furnizor</Button></div>
        </div>
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr><th className="px-3 py-2">Angajat</th><th className="px-3 py-2 text-right">Zile lucrate</th><th className="px-3 py-2 text-right">Zile CO</th><th className="px-3 py-2 text-right">Zile CM</th><th className="px-3 py-2 text-right">Tichete</th><th className="px-3 py-2 text-right">Valoare</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(mealRows || []).length ? mealRows.map(row => (
                <tr key={row.employee_id}>
                  <td className="px-3 py-2 font-medium">{row.angajat || `${row.nume || ''} ${row.prenume || ''}`}</td>
                  <td className="px-3 py-2 text-right">{row.zile_lucrate || 0}</td>
                  <td className="px-3 py-2 text-right">{row.zile_co || 0}</td>
                  <td className="px-3 py-2 text-right">{row.zile_cm || 0}</td>
                  <td className="px-3 py-2 text-right font-semibold">{row.tichete || 0}</td>
                  <td className="px-3 py-2 text-right">{Number(row.valoare || 0).toLocaleString('ro-RO')} lei</td>
                </tr>
              )) : <tr><td colSpan="6" className="px-3 py-8 text-center text-sm text-slate-500">Nu există date pentru luna selectată.</td></tr>}
              <tr className="bg-slate-50 font-semibold">
                <td className="px-3 py-2 text-right" colSpan="4">Total:</td>
                <td className="px-3 py-2 text-right">{totalTickets} buc</td>
                <td className="px-3 py-2 text-right">{totalValue.toLocaleString('ro-RO')} lei</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
