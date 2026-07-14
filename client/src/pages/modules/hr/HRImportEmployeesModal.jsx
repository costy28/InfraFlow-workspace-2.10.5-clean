import Input from '../../../components/forms/Input'
import Button from '../../../components/ui/Button'
import Modal from '../../../components/ui/Modal'

export default function HRImportEmployeesModal({
  open,
  file,
  result,
  onFileChange,
  onDownloadTemplate,
  onClose,
  onSubmit,
}) {
  const errors = result?.erori || []

  return (
    <Modal open={open} title="Import angajați" onClose={onClose} size="lg">
      <form className="grid gap-4" onSubmit={onSubmit}>
        <Button type="button" variant="secondary" onClick={onDownloadTemplate}>Descarcă Template.xlsx</Button>
        <Input
          label="Fișier CSV/Excel"
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={event => onFileChange(event.target.files?.[0] || null)}
        />
        {file ? (
          <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
            Pregătit pentru import: {file.name}
          </div>
        ) : null}
        {result ? (
          <div className="rounded-md bg-primary-50 p-3 text-sm text-primary-800">
            Importați: {result.importati || 0}. Erori: {errors.length}
            {errors.slice(0, 5).map(err => (
              <div key={`${err.rand}-${err.motiv}`}>Rând {err.rand}: {err.motiv}</div>
            ))}
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Închide</Button>
          <Button type="submit" disabled={!file}>Importă angajați</Button>
        </div>
      </form>
    </Modal>
  )
}
