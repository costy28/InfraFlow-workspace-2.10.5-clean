import Button from '../../../components/ui/Button'
import Card from '../../../components/ui/Card'
import Badge from '../../../components/ui/Badge'
import { exportExcel, exportPdf } from '../../../utils/export'

const SURSA_BADGE = {
  autominder: { label: 'AM', color: 'blue', title: 'Import Autominder' },
  import: { label: 'CSV', color: 'green', title: 'Import CSV/Excel' },
  manual: { label: 'HR', color: 'purple', title: 'Creat manual' },
  'autominder+hr': { label: 'AM+HR', color: 'teal', title: 'Autominder + completat HR' },
}

function fullName(item) {
  return [item?.nume, item?.prenume].filter(Boolean).join(' ') || item?.name || 'Angajat'
}

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

function SursaBadge({ sursa }) {
  const info = SURSA_BADGE[sursa]
  if (!info) return null
  const colors = {
    blue: 'bg-blue-100 text-blue-700',
    green: 'bg-green-100 text-green-700',
    purple: 'bg-purple-100 text-purple-700',
    teal: 'bg-teal-100 text-teal-700',
  }
  return (
    <span
      title={info.title}
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${colors[info.color] || 'bg-slate-100 text-slate-600'}`}
    >
      {info.label}
    </span>
  )
}

function employeeHasAlert(employee) {
  return alertTone(daysUntil(employee.data_expirare_contract)) ||
    alertTone(daysUntil(employee.permis_conducere_expira || employee.data_expirare_permis)) ||
    alertTone(daysUntil(employee.data_expirare_iscir)) ||
    alertTone(daysUntil(employee.apt_medical_expira || employee.adeverinta_medicala))
}

function employeeExportRows(employees) {
  return employees.map(emp => ({
    'Marcă': emp.marca || '',
    'Nume': fullName(emp),
    'Funcție': emp.functia || '',
    'Departament': emp.department_name || emp.department || '',
    'Tip contract': emp.tip_contract || emp.contract_type || '',
    'Data angajare': emp.data_angajare || '',
    'Email': emp.email || '',
    'Telefon': emp.telefon || '',
    'Activ': (emp.activ === false || emp.activ === 0) ? 'Nu' : 'Da',
  }))
}

function employeePdfRows(employees) {
  return employees.map(emp => ({
    'Marcă': emp.marca || '',
    'Nume': fullName(emp),
    'Funcție': emp.functia || '',
    'Departament': emp.department_name || emp.department || '',
    'Activ': (emp.activ === false || emp.activ === 0) ? 'Nu' : 'Da',
  }))
}

export default function HREmployeesPanel({ employees, loading, onOpenEmployee }) {
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-700">{employees.length} angajați</span>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => exportExcel(
            employeeExportRows(employees),
            `Angajati_${new Date().toISOString().slice(0, 10)}`
          )}>📊 Excel</Button>
          <Button variant="secondary" onClick={() => exportPdf({
            title: 'Lista Angajați',
            subtitle: `Total: ${employees.length} angajați`,
            columns: [
              { key: 'Marcă', label: 'Marcă' },
              { key: 'Nume', label: 'Nume' },
              { key: 'Funcție', label: 'Funcție' },
              { key: 'Departament', label: 'Departament' },
              { key: 'Activ', label: 'Activ' },
            ],
            rows: employeePdfRows(employees),
          })}>🖨️ PDF</Button>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Nume</th>
              <th className="px-3 py-2">Funcție</th>
              <th className="px-3 py-2">Departament</th>
              <th className="px-3 py-2">Tip contract</th>
              <th className="px-3 py-2">Sursă</th>
              <th className="px-3 py-2">Alerte</th>
              <th className="px-3 py-2">Activ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {employees.length ? employees.map(employee => {
              const hasAlert = employeeHasAlert(employee)
              return (
                <tr key={employee.id} className="cursor-pointer hover:bg-primary-50/50" onClick={() => onOpenEmployee(employee)}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {employee.photo_url
                        ? <img src={employee.photo_url} alt="" className="h-7 w-7 rounded-full object-cover" onError={event => { event.target.style.display = 'none' }} />
                        : <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-xs text-slate-500">👤</div>
                      }
                      <span className="font-medium text-slate-900">{fullName(employee)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">{employee.functia || '-'}</td>
                  <td className="px-3 py-2">{employee.department_name || employee.department || '-'}</td>
                  <td className="px-3 py-2">{employee.tip_contract || employee.contract_type || '-'}</td>
                  <td className="px-3 py-2"><SursaBadge sursa={employee.sursa || employee.source} /></td>
                  <td className="px-3 py-2">{hasAlert ? <span className="text-amber-500">⚠️</span> : <span className="text-slate-300">—</span>}</td>
                  <td className="px-3 py-2"><Badge tone={employee.activ === false || employee.activ === 0 ? 'neutral' : 'success'}>{employee.activ === false || employee.activ === 0 ? 'Nu' : 'Da'}</Badge></td>
                </tr>
              )
            }) : <tr><td colSpan="7" className="px-3 py-8 text-center text-sm text-slate-500">{loading ? 'Se incarca...' : 'Nu exista angajați.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
