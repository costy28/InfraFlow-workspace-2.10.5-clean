import Input from '../../../components/forms/Input'
import Select from '../../../components/forms/Select'
import Button from '../../../components/ui/Button'
import Modal from '../../../components/ui/Modal'

const COMPENSATION_TYPE_OPTIONS = [
  { value: 'timp_liber', label: 'Timp liber' },
  { value: 'plata', label: 'Plată' },
  { value: 'sold_initial', label: 'Sold initial - ore lucrate anterior' },
  { value: 'avans_timp_liber', label: 'Timp liber acordat in avans' },
]

export default function HROvertimeCompensationModal({
  open,
  form,
  onChange,
  onClose,
  onSubmit,
}) {
  const compensateForm = form || {}
  const patchForm = patch => onChange({ ...compensateForm, ...patch })

  return (
    <Modal open={open} title="Compensare bancă de ore" onClose={onClose} size="md">
      <form className="grid gap-3" onSubmit={onSubmit}>
        <Select
          label="Tip compensare"
          value={compensateForm.tip}
          onChange={event => patchForm({ tip: event.target.value })}
          options={COMPENSATION_TYPE_OPTIONS}
        />
        <Input
          label="Ore de compensat"
          type="number"
          value={compensateForm.ore}
          onChange={event => patchForm({ ore: event.target.value })}
          required
        />
        {compensateForm.tip === 'plata' ? (
          <Input
            label="Spor plata (%) - minimum legal 75%"
            type="number"
            min="75"
            value={compensateForm.spor_procent}
            onChange={event => patchForm({ spor_procent: event.target.value })}
            required
          />
        ) : null}
        <Input
          label="Data"
          type="date"
          value={compensateForm.data}
          onChange={event => patchForm({ data: event.target.value })}
          required
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Renunță</Button>
          <Button type="submit">Confirmă</Button>
        </div>
      </form>
    </Modal>
  )
}
