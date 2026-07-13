import Input from '../../../components/forms/Input'
import Button from '../../../components/ui/Button'
import Modal from '../../../components/ui/Modal'

function estimateMedicalAmount(item, dailyBase) {
  const paidDays = Number(item?.employer_days || 0) + Number(item?.fund_days || 0)
  return Number(dailyBase) * Number(item?.indemnity_percent || 0) / 100 * paidDays
}

export default function HRMedicalPayrollModal({
  item,
  dailyBase,
  onDailyBaseChange,
  onClose,
  onSubmit,
}) {
  const open = Boolean(item)
  const estimatedAmount = estimateMedicalAmount(item, dailyBase)

  return (
    <Modal open={open} title="Trimite concediul medical in salarizare" onClose={onClose} size="md">
      <form className="grid gap-3" onSubmit={onSubmit}>
        <div className="rounded-md bg-slate-50 p-3 text-sm">
          <strong>{item?.nume} {item?.prenume}</strong>
          <div>{item?.serie}/{item?.numar} · {item?.indemnity_percent}% · {item?.workdays} zile lucratoare</div>
        </div>
        <Input
          label="Baza de calcul zilnica (lei)"
          type="number"
          min="0.01"
          step="0.0001"
          value={dailyBase}
          onChange={event => onDailyBaseChange(event.target.value)}
          required
        />
        <p className="text-xs text-slate-500">
          Introdu media zilnica rezultata din veniturile brute ale ultimelor 6 luni. Aplicatia calculeaza indemnizatia si impartirea angajator/FNUASS.
        </p>
        {Number(dailyBase) > 0 ? (
          <div className="rounded-md bg-primary-50 p-3 text-sm text-primary-800">
            Estimare: <strong>{estimatedAmount.toFixed(2)} lei</strong>
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Renunta</Button>
          <Button type="submit" disabled={!(Number(dailyBase) > 0)}>Confirma si trimite</Button>
        </div>
      </form>
    </Modal>
  )
}
