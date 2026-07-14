import Input from '../../../components/forms/Input'
import Select from '../../../components/forms/Select'
import Button from '../../../components/ui/Button'
import Modal from '../../../components/ui/Modal'

const EVALUATION_TYPE_OPTIONS = [
  { value: 'periodica', label: 'Periodică' },
  { value: 'proba', label: 'Perioadă probă' },
  { value: 'anuala', label: 'Anuală' },
  { value: 'speciala', label: 'Specială' },
]

const QUALIFICATION_OPTIONS = [
  { value: 'FB', label: 'Foarte Bine (FB)' },
  { value: 'B', label: 'Bine (B)' },
  { value: 'S', label: 'Satisfăcător (S)' },
  { value: 'NS', label: 'Nesatisfăcător (NS)' },
]

function TextAreaField({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">{label}</label>
      <textarea
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        rows={2}
        value={value || ''}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}

export default function HREvaluationModal({
  open,
  editing,
  form,
  employees,
  getEmployeeName,
  onChange,
  onClose,
  onSubmit,
}) {
  const evalForm = form || {}
  const employeeOptions = [
    { value: '', label: 'Alege angajat…' },
    ...(employees || []).map(emp => ({ value: String(emp.id), label: getEmployeeName(emp) })),
  ]
  const patchForm = patch => onChange({ ...evalForm, ...patch })

  return (
    <Modal open={open} title={editing ? 'Editează evaluare' : 'Evaluare nouă'} onClose={onClose} size="lg">
      <form className="grid gap-3" onSubmit={onSubmit}>
        <Select
          label="Angajat"
          value={evalForm.employee_id}
          onChange={event => patchForm({ employee_id: event.target.value })}
          options={employeeOptions}
          required
        />
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            label="Data evaluare"
            type="date"
            value={evalForm.data_evaluare}
            onChange={event => patchForm({ data_evaluare: event.target.value })}
            required
          />
          <Select
            label="Tip evaluare"
            value={evalForm.tip}
            onChange={event => patchForm({ tip: event.target.value })}
            options={EVALUATION_TYPE_OPTIONS}
          />
          <Select
            label="Calificativ"
            value={evalForm.calificativ}
            onChange={event => patchForm({ calificativ: event.target.value })}
            options={QUALIFICATION_OPTIONS}
          />
          <Input
            label="Punctaj (0-100)"
            type="number"
            min="0"
            max="100"
            value={evalForm.punctaj}
            onChange={event => patchForm({ punctaj: event.target.value })}
          />
        </div>
        <TextAreaField
          label="Observații"
          value={evalForm.observatii}
          onChange={value => patchForm({ observatii: value })}
          placeholder="Observații generale…"
        />
        <TextAreaField
          label="Obiective stabilite"
          value={evalForm.obiective}
          onChange={value => patchForm({ obiective: value })}
          placeholder="Obiective pentru perioada următoare…"
        />
        <TextAreaField
          label="Recomandări"
          value={evalForm.recomandari}
          onChange={value => patchForm({ recomandari: value })}
          placeholder="Recomandări de îmbunătățire…"
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Renunță</Button>
          <Button type="submit">{editing ? 'Actualizează' : 'Salvează evaluare'}</Button>
        </div>
      </form>
    </Modal>
  )
}
