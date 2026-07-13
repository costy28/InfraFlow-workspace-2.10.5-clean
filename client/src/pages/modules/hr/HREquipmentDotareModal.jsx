import Input from '../../../components/forms/Input'
import Select from '../../../components/forms/Select'
import Button from '../../../components/ui/Button'
import Modal from '../../../components/ui/Modal'

export default function HREquipmentDotareModal({
  open,
  dotareForm,
  employeeEquipment,
  onDotareFormChange,
  onSubmit,
  onClose,
}) {
  const selectedType = employeeEquipment?.marimi?.find(item => String(item.id) === String(dotareForm.tip_id))

  return (
    <Modal open={open} title="Înregistrează dotare echipament / inventar" onClose={onClose}>
      <form className="grid gap-3" onSubmit={onSubmit}>
        <Select
          label="Obiect"
          value={dotareForm.tip_id}
          onChange={event => {
            const tip_id = event.target.value
            const tip = employeeEquipment?.marimi?.find(item => String(item.id) === String(tip_id))
            onDotareFormChange({ ...dotareForm, tip_id, marime: tip?.marime || '', numar_serie: '', valoare_inventar: tip?.valoare_inventar || '' })
          }}
          options={(employeeEquipment?.marimi || []).map(item => ({ value: item.id, label: `${item.denumire} (${item.categorie})` }))}
        />
        {selectedType?.are_marime ? (
          <Input
            label="Mărime"
            value={dotareForm.marime}
            onChange={event => onDotareFormChange({ ...dotareForm, marime: event.target.value })}
          />
        ) : null}
        {selectedType?.are_serie ? (
          <Input
            label="Număr serie*"
            value={dotareForm.numar_serie}
            onChange={event => onDotareFormChange({ ...dotareForm, numar_serie: event.target.value })}
            required
          />
        ) : null}
        <Input
          label="Valoare inventar (lei)"
          type="number"
          min="0"
          step="0.01"
          value={dotareForm.valoare_inventar}
          onChange={event => onDotareFormChange({ ...dotareForm, valoare_inventar: event.target.value })}
        />
        <Input
          label="Data dotării"
          type="date"
          value={dotareForm.data_dotare}
          onChange={event => onDotareFormChange({ ...dotareForm, data_dotare: event.target.value })}
          required
        />
        <Input
          label="Cantitate"
          type="number"
          min="1"
          step="1"
          value={dotareForm.cantitate}
          onChange={event => onDotareFormChange({ ...dotareForm, cantitate: Number(event.target.value) })}
        />
        <Input
          label="Observații"
          value={dotareForm.observatii}
          onChange={event => onDotareFormChange({ ...dotareForm, observatii: event.target.value })}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Renunță</Button>
          <Button type="submit">Salvează dotarea</Button>
        </div>
      </form>
    </Modal>
  )
}
