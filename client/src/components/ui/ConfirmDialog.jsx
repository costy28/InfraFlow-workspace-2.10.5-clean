import { useEffect, useState } from 'react'
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
  reasonLabel,
  reasonDefault = '',
  reasonPlaceholder = '',
  reasonRequired = false,
  minReasonLength = 0,
  onConfirm,
  onCancel,
}) {
  const [reason, setReason] = useState(reasonDefault || '')
  const [reasonError, setReasonError] = useState('')
  const isDanger = tone === 'danger'
  const isSuccess = tone === 'success'
  const hasReason = Boolean(reasonLabel)
  const icon = isDanger ? '⚠️' : isSuccess ? '✅' : '🟡'
  const toneClass = isDanger
    ? 'border-rose-200 bg-rose-50 text-rose-800'
    : isSuccess
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : 'border-amber-200 bg-amber-50 text-amber-900'

  function handleCancel() {
    if (!loading) onCancel?.()
  }

  function handleConfirm() {
    const trimmedReason = reason.trim()
    if (hasReason && reasonRequired && trimmedReason.length < minReasonLength) {
      setReasonError(minReasonLength > 1
        ? `Completează motivul cu minimum ${minReasonLength} caractere.`
        : 'Completează motivul.')
      return
    }
    setReasonError('')
    onConfirm?.(hasReason ? trimmedReason : undefined)
  }

  useEffect(() => {
    if (open) {
      setReason(reasonDefault || '')
      setReasonError('')
    }
  }, [open, reasonDefault])

  return (
    <Modal open={open} title={title} onClose={handleCancel} size="sm" resizable={false}>
      <div className="space-y-4">
        <div className={`rounded-lg border p-3 text-sm ${toneClass}`}>
          <div className="flex items-start gap-2 font-semibold">
            <span aria-hidden="true">{icon}</span>
            <span>{message}</span>
          </div>
          {details ? <p className="mt-2 whitespace-pre-line text-xs leading-relaxed opacity-80">{details}</p> : null}
        </div>
        {hasReason ? (
          <div className="grid gap-1.5">
            <label className="text-sm font-semibold text-slate-700" htmlFor="confirm-dialog-reason">
              {reasonLabel}
            </label>
            <textarea
              id="confirm-dialog-reason"
              className="min-h-24 rounded-[var(--radius-control)] border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              value={reason}
              placeholder={reasonPlaceholder}
              disabled={loading}
              onChange={event => {
                setReason(event.target.value)
                if (reasonError) setReasonError('')
              }}
            />
            {reasonError ? <div className="text-xs font-medium text-rose-700">{reasonError}</div> : null}
          </div>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" disabled={loading} onClick={handleCancel}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={isDanger ? 'danger' : 'primary'} loading={loading} onClick={handleConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
