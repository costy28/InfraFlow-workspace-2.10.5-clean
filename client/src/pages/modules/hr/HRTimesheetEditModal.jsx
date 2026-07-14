import Input from '../../../components/forms/Input'
import Select from '../../../components/forms/Select'
import Button from '../../../components/ui/Button'
import Modal from '../../../components/ui/Modal'

const TIMESHEET_DAY_TYPE_OPTIONS = [
  { value: 'lucru', label: 'Lucru' },
  { value: 'co', label: 'Concediu de odihna' },
  { value: 'cm', label: 'Concediu medical' },
  { value: 'delegatie', label: 'Delegatie' },
  { value: 'liber', label: 'Zi libera' },
  { value: 'nemotivat', label: 'Absent nemotivat' },
]

export default function HRTimesheetEditModal({
  edit,
  onChange,
  onClose,
  onSubmit,
}) {
  const title = edit ? `Pontaj - ${edit.employee_name}` : 'Pontaj'
  const canEditHours = edit?.tip === 'lucru' || edit?.tip === 'delegatie'

  function updateField(field, value) {
    onChange({ ...edit, [field]: value })
  }

  function handleTypeChange(event) {
    const tip = event.target.value
    onChange({
      ...edit,
      tip,
      ore_lucrate: tip === 'lucru' ? (edit.ore_lucrate || 8) : 0,
    })
  }

  return (
    <Modal open={Boolean(edit)} title={title} onClose={onClose}>
      {edit ? (
        <form className="grid gap-3" onSubmit={onSubmit}>
          <Input label="Data" type="date" value={edit.data} disabled />
          <Select
            label="Tip zi"
            value={edit.tip}
            onChange={handleTypeChange}
            options={TIMESHEET_DAY_TYPE_OPTIONS}
          />
          <Input
            label="Ore lucrate"
            type="number"
            min="0"
            max="24"
            step="0.5"
            value={edit.ore_lucrate}
            onChange={event => updateField('ore_lucrate', event.target.value)}
            disabled={!canEditHours}
          />
          <Input
            label="Observatii"
            value={edit.observatii}
            onChange={event => updateField('observatii', event.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Renunta</Button>
            <Button type="submit">Salveaza pontaj</Button>
          </div>
        </form>
      ) : null}
    </Modal>
  )
}
