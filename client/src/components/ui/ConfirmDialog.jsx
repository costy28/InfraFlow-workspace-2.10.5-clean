import Button from './Button'
import Modal from './Modal'

export default function ConfirmDialog({
  open,
  title = 'Confirmare',
  message,
  details,
  confirmLabel = 'Confirmă',
  cancelLabel = 'Renunță',
  tone = 'warning',
  loading = false,
  onConfirm,
  onCancel,
}) {
  const isDanger = tone === 'danger'
  const isSuccess = tone === 'success'
  const icon = isDanger ? '⚠️' : isSuccess ? '✅' : '🟡'
  const toneClass = isDanger
    ? 'border-rose-200 bg-rose-50 text-rose-800'
    : isSuccess
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : 'border-amber-200 bg-amber-50 text-amber-900'

  function handleCancel() {
    if (!loading) onCancel?.()
  }

  return (
    <Modal open={open} title={title} onClose={handleCancel} size="sm" resizable={false}>
      <div className="space-y-4">
        <div className={`rounded-lg border p-3 text-sm ${toneClass}`}>
          <div className="flex items-start gap-2 font-semibold">
            <span aria-hidden="true">{icon}</span>
            <span>{message}</span>
          </div>
          {details ? <p className="mt-2 text-xs leading-relaxed opacity-80">{details}</p> : null}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" disabled={loading} onClick={handleCancel}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={isDanger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
