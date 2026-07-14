import Input from '../../../components/forms/Input'
import Select from '../../../components/forms/Select'
import Button from '../../../components/ui/Button'
import Modal from '../../../components/ui/Modal'

export default function HRNexusExportModal({
  open,
  form,
  departments,
  departmentDisabled,
  onChange,
  onClose,
  onSubmit,
}) {
  const exportForm = form || {}
  const patchForm = patch => onChange({ ...exportForm, ...patch })

  return (
    <Modal open={open} title="Export Pontaj Nexus" onClose={onClose}>
      <form className="grid gap-4" onSubmit={onSubmit}>
        <Input
          label="Luna"
          type="month"
          value={exportForm.luna}
          onChange={event => patchForm({ luna: event.target.value })}
          required
        />
        <Select
          label="Departament"
          value={exportForm.dept_id}
          onChange={event => patchForm({ dept_id: event.target.value })}
          disabled={departmentDisabled}
          options={[{ value: '', label: 'Toate departamentele' }, ...(departments || [])]}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Renunță</Button>
          <Button type="submit">📥 Exportă Nexus</Button>
        </div>
      </form>
    </Modal>
  )
}
