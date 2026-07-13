import Select from '../../../components/forms/Select'
import Button from '../../../components/ui/Button'

const INVENTORY_GROUPS = [
  ['Echipamente protecție', 'echipamente_protectie'],
  ['Scule și unelte', 'scule_unelte'],
  ['Alte obiecte inventar', 'alte_obiecte'],
]

export default function HREmployeeEquipmentSection({
  employeeEquipment,
  canManageEquipment,
  onOpenDotare,
  onSaveEmployeeSizes,
  onSetReturnedEquipment,
}) {
  return (
    <div className="rounded-lg border border-primary-100 bg-primary-50/40 p-3">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase text-primary-700">🦺 Echipamente și inventar în răspundere</div>
        {canManageEquipment ? <Button size="sm" onClick={onOpenDotare}>+ Înregistrează dotare nouă</Button> : null}
      </div>

      {employeeEquipment ? (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            {employeeEquipment.marimi.filter(tip => tip.are_marime).map(tip => (
              <Select
                key={tip.id}
                label={tip.denumire}
                value={tip.marime || ''}
                onChange={event => onSaveEmployeeSizes(tip.id, event.target.value)}
                options={[{ value: '', label: 'Alege mărimea' }, ...tip.marimi_disponibile.map(marime => ({ value: marime, label: marime }))]}
              />
            ))}
          </div>

          {INVENTORY_GROUPS.map(([title, key]) => {
            const rows = employeeEquipment.inventar?.[key]
            return (
              <div key={title} className="mt-4">
                <div className="mb-1 text-xs font-semibold uppercase text-slate-600">{title}</div>
                <div className="overflow-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="py-1">Obiect</th>
                        <th>Mărime</th>
                        <th>Nr. serie</th>
                        <th>Data dotare</th>
                        <th>Expiră</th>
                        <th>Cant.</th>
                        <th>Stare</th>
                        <th className="text-right">Valoare</th>
                        <th>Predat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(rows || []).map(row => (
                        <tr key={row.id} className="border-t">
                          <td className="py-1">{row.tip_denumire}</td>
                          <td>{row.marime || '-'}</td>
                          <td>{row.numar_serie || '-'}</td>
                          <td>{row.data_dotare}</td>
                          <td>{row.data_expirare || '-'}</td>
                          <td>{row.cantitate}</td>
                          <td>{row.stare}</td>
                          <td className="text-right">{Number(row.valoare_inventar || 0).toFixed(2)} lei</td>
                          <td>
                            {canManageEquipment ? (
                              <input
                                type="checkbox"
                                checked={!!row.predat_la_lichidare}
                                onChange={event => onSetReturnedEquipment(row, event.target.checked)}
                              />
                            ) : row.predat_la_lichidare ? 'Da' : 'Nu'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!(rows || []).length ? <div className="py-2 text-xs text-slate-400">Nu există obiecte active.</div> : null}
                </div>
              </div>
            )
          })}

          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
            Total valoare în răspundere: {Number(employeeEquipment.inventar?.total_valoare || 0).toFixed(2)} lei
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-500">Se încarcă echipamentele...</p>
      )}
    </div>
  )
}
