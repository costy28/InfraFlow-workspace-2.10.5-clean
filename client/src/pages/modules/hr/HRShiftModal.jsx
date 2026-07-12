import Input from '../../../components/forms/Input'
import Button from '../../../components/ui/Button'
import Modal from '../../../components/ui/Modal'

export default function HRShiftModal({
  open,
  editing,
  form,
  onChange,
  onSubmit,
  onClose,
}) {
  return (
    <Modal open={open} title={editing ? 'Editeaza tura' : 'Tura noua'} onClose={onClose} size="md">
      <form className="grid gap-3" onSubmit={onSubmit}>
        <Input label="Nume tură" value={form.nume} onChange={e => onChange({ ...form, nume: e.target.value })} required />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Ora start" type="time" value={form.ora_start} onChange={e => onChange({ ...form, ora_start: e.target.value })} />
          <Input label="Ora sfârșit" type="time" value={form.ora_sfarsit} onChange={e => onChange({ ...form, ora_sfarsit: e.target.value })} />
          <Input label="Ore normale" type="number" value={form.ore_normale} onChange={e => onChange({ ...form, ore_normale: Number(e.target.value) })} />
          <Input label="Culoare" type="color" value={form.culoare} onChange={e => onChange({ ...form, culoare: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Renunță</Button>
          <Button type="submit">Salvează</Button>
        </div>
      </form>
    </Modal>
  )
}
