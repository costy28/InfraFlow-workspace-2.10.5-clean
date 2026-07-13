import Input from '../../../components/forms/Input'
import Select from '../../../components/forms/Select'
import Button from '../../../components/ui/Button'
import Modal from '../../../components/ui/Modal'

const CATEGORY_OPTIONS = [
  { value: 'protectie', label: 'Echipamente protecție' },
  { value: 'scule', label: 'Scule' },
  { value: 'unelte', label: 'Unelte' },
  { value: 'inventar', label: 'Inventar' },
  { value: 'SSM', label: 'SSM' },
  { value: 'altele', label: 'Altele' },
]

export default function HREquipmentCatalogModal({
  open,
  editing,
  catalogForm,
  suppliers,
  onCatalogFormChange,
  onSubmit,
  onClose,
}) {
  return (
    <Modal open={open} title={editing ? 'Editează obiect catalog' : 'Adaugă obiect în catalog'} onClose={onClose}>
      <form className="grid gap-3" onSubmit={onSubmit}>
        <Input
          label="Denumire*"
          value={catalogForm.denumire}
          onChange={event => onCatalogFormChange({ ...catalogForm, denumire: event.target.value })}
          required
        />
        <Select
          label="Categorie*"
          value={catalogForm.categorie}
          onChange={event => onCatalogFormChange({ ...catalogForm, categorie: event.target.value })}
          options={CATEGORY_OPTIONS}
        />
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={catalogForm.are_marime} onChange={event => onCatalogFormChange({ ...catalogForm, are_marime: event.target.checked })} /> Are mărime?
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={catalogForm.are_serie} onChange={event => onCatalogFormChange({ ...catalogForm, are_serie: event.target.checked })} /> Are nr. serie?
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={catalogForm.are_expirare} onChange={event => onCatalogFormChange({ ...catalogForm, are_expirare: event.target.checked })} /> Are expirare?
          </label>
        </div>
        {catalogForm.are_marime ? (
          <Input
            label="Mărimi disponibile (separate prin virgulă)"
            value={catalogForm.marimi}
            onChange={event => onCatalogFormChange({ ...catalogForm, marimi: event.target.value })}
            placeholder="S, M, L, XL"
          />
        ) : null}
        {catalogForm.are_expirare ? (
          <Input
            label="Durată (luni)"
            type="number"
            min="0"
            value={catalogForm.durata_luni}
            onChange={event => onCatalogFormChange({ ...catalogForm, durata_luni: event.target.value })}
          />
        ) : null}
        <Input
          label="Valoare inventar"
          type="number"
          min="0"
          step="0.01"
          value={catalogForm.valoare_inventar}
          onChange={event => onCatalogFormChange({ ...catalogForm, valoare_inventar: event.target.value })}
        />
        <Input
          label="Cod articol (opțional)"
          value={catalogForm.cod_articol}
          onChange={event => onCatalogFormChange({ ...catalogForm, cod_articol: event.target.value })}
        />
        <Select
          label="Furnizor"
          value={catalogForm.furnizor_id || ''}
          onChange={event => onCatalogFormChange({ ...catalogForm, furnizor_id: event.target.value })}
          options={[{ value: '', label: '- selectează -' }, ...(suppliers || []).map(item => ({ value: item.id, label: item.denumire }))]}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={catalogForm.activ} onChange={event => onCatalogFormChange({ ...catalogForm, activ: event.target.checked })} /> Activ
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Anulează</Button>
          <Button type="submit">💾 Salvează</Button>
        </div>
      </form>
    </Modal>
  )
}
