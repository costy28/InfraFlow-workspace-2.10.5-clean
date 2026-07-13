import Button from '../../../components/ui/Button'
import Card from '../../../components/ui/Card'

const EQUIPMENT_TABS = ['Necesar per Departament', 'Expirări', 'Comandă Furnizor', '📚 Catalog']

export default function HREquipmentPanel({
  equipmentTab,
  equipmentRows,
  equipmentOrder,
  equipmentExpiry,
  equipmentCatalog,
  canManageEquipment,
  onEquipmentTabChange,
  onExportEquipmentOrder,
  onCreateEquipmentReferat,
  onOpenCatalogModal,
}) {
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {EQUIPMENT_TABS.map(tab => (
            <Button
              key={tab}
              size="sm"
              variant={equipmentTab === tab ? 'primary' : 'secondary'}
              onClick={() => onEquipmentTabChange(tab)}
            >
              {tab}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={onExportEquipmentOrder}>📥 Export Excel</Button>
          <Button size="sm" onClick={onCreateEquipmentReferat}>🛒 Creează Referat Aprovizionare</Button>
        </div>
      </div>

      {equipmentTab === 'Necesar per Departament' ? (
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Departament</th>
                <th className="px-3 py-2">Echipament</th>
                <th className="px-3 py-2">Mărime</th>
                <th className="px-3 py-2">Culoare</th>
                <th className="px-3 py-2">Cod articol</th>
                <th className="px-3 py-2 text-right">Cant.</th>
              </tr>
            </thead>
            <tbody>
              {equipmentRows.map((row, index) => (
                <tr key={`${row.departament}-${row.tip}-${row.marime}-${index}`} className="border-t">
                  <td className="px-3 py-2">{row.departament}</td>
                  <td className="px-3 py-2">{row.tip}</td>
                  <td className="px-3 py-2">{row.marime}</td>
                  <td className="px-3 py-2">{row.culoare || '-'}</td>
                  <td className="px-3 py-2">{row.cod_articol || '-'}</td>
                  <td className="px-3 py-2 text-right">{row.cantitate}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {equipmentRows.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">Completează mărimile în fișele angajaților pentru a genera necesarul.</p>
          ) : null}
        </div>
      ) : null}

      {equipmentTab === 'Expirări' ? (
        <div className="grid gap-2">
          {equipmentExpiry.map(row => (
            <div
              key={row.id}
              className={`rounded-md border px-3 py-2 text-sm ${row.zile_ramase < 0 ? 'border-rose-300 bg-rose-50' : row.zile_ramase <= 30 ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`}
            >
              <strong>{row.angajat}</strong> · {row.tip_denumire} · expiră {row.data_expirare} ({row.zile_ramase} zile)
            </div>
          ))}
          {equipmentExpiry.length === 0 ? <p className="text-sm text-slate-500">Nu există expirări în următoarele 90 zile.</p> : null}
        </div>
      ) : null}

      {equipmentTab === 'Comandă Furnizor' ? (
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Cod articol</th>
                <th className="px-3 py-2">Echipament</th>
                <th className="px-3 py-2">Mărime</th>
                <th className="px-3 py-2">Culoare</th>
                <th className="px-3 py-2">CPV</th>
                <th className="px-3 py-2 text-right">Cant.</th>
              </tr>
            </thead>
            <tbody>
              {equipmentOrder.map((row, index) => (
                <tr key={`${row.cod_articol}-${row.tip}-${row.marime}-${index}`} className="border-t">
                  <td className="px-3 py-2">{row.cod_articol}</td>
                  <td className="px-3 py-2">{row.tip}</td>
                  <td className="px-3 py-2">{row.marime}</td>
                  <td className="px-3 py-2">{row.culoare}</td>
                  <td className="px-3 py-2">{row.cpv_cod}</td>
                  <td className="px-3 py-2 text-right">{row.cantitate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {equipmentTab === '📚 Catalog' ? (
        <div>
          <div className="mb-3 flex justify-end">
            {canManageEquipment ? <Button size="sm" onClick={() => onOpenCatalogModal()}>+ Obiect nou</Button> : null}
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Denumire</th>
                  <th className="px-3 py-2">Categorie</th>
                  <th className="px-3 py-2">Mărime</th>
                  <th className="px-3 py-2">Serie</th>
                  <th className="px-3 py-2">Expirare</th>
                  <th className="px-3 py-2 text-right">Val. inventar</th>
                  <th className="px-3 py-2">Cod articol</th>
                  <th className="px-3 py-2">Activ</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {equipmentCatalog.map(item => (
                  <tr key={item.id} className="border-t">
                    <td className="px-3 py-2 font-medium">{item.denumire}</td>
                    <td className="px-3 py-2">{item.categorie}</td>
                    <td className="px-3 py-2">{item.are_marime ? (item.marimi || []).join(', ') || 'Da' : 'Nu'}</td>
                    <td className="px-3 py-2">{item.are_serie ? 'Da' : 'Nu'}</td>
                    <td className="px-3 py-2">{item.are_expirare ? `${item.durata_luni || 0} luni` : 'Nu'}</td>
                    <td className="px-3 py-2 text-right">{Number(item.valoare_inventar || 0).toFixed(2)} lei</td>
                    <td className="px-3 py-2">{item.cod_articol || '-'}</td>
                    <td className="px-3 py-2">{item.activ ? 'Da' : 'Nu'}</td>
                    <td className="px-3 py-2">
                      {canManageEquipment ? (
                        <Button size="sm" variant="secondary" onClick={() => onOpenCatalogModal(item)}>Editează</Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </Card>
  )
}
