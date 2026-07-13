import Input from '../../../components/forms/Input'
import Select from '../../../components/forms/Select'
import Button from '../../../components/ui/Button'
import Modal from '../../../components/ui/Modal'

const LEAVE_TYPE_OPTIONS = [
  { value: 'CO', label: 'Concediu de odihna' },
  { value: 'CM', label: 'Concediu medical' },
  { value: 'delegatie', label: 'Delegatie' },
  { value: 'nemotivat', label: 'Absenta nemotivata' },
  { value: 'alt', label: 'Alt tip / fara plata' },
]

export default function HRLeaveRequestModal({
  open,
  form,
  employees,
  getEmployeeName,
  onClose,
  onSubmit,
  onChange,
}) {
  const leaveForm = form || {}
  const activeEmployees = (employees || []).filter(item => item.activ !== false)
  const employeeOptions = [
    { value: '', label: 'Alege angajat' },
    ...activeEmployees.map(item => ({ value: String(item.id), label: getEmployeeName(item) })),
  ]
  const patchForm = patch => onChange({ ...leaveForm, ...patch })

  return (
    <Modal open={open} title="Cerere de concediu" onClose={onClose} size="md">
      <form className="grid gap-3" onSubmit={onSubmit}>
        <Select
          label="Angajat"
          value={leaveForm.employee_id}
          onChange={event => patchForm({ employee_id: event.target.value })}
          options={employeeOptions}
          required
        />
        <Select
          label="Tip"
          value={leaveForm.tip}
          onChange={event => patchForm({ tip: event.target.value })}
          options={LEAVE_TYPE_OPTIONS}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Data inceput"
            type="date"
            value={leaveForm.data_start}
            onChange={event => patchForm({ data_start: event.target.value })}
            required
          />
          <Input
            label="Data sfarsit"
            type="date"
            value={leaveForm.data_sfarsit}
            onChange={event => patchForm({ data_sfarsit: event.target.value })}
            required
          />
        </div>
        <Input
          label="Motiv / observatii"
          value={leaveForm.motiv}
          onChange={event => patchForm({ motiv: event.target.value })}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Renunta</Button>
          <Button type="submit" disabled={!leaveForm.employee_id || !leaveForm.data_start || !leaveForm.data_sfarsit}>Salveaza cererea</Button>
        </div>
      </form>
    </Modal>
  )
}
