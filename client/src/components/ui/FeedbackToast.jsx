const toneClasses = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  error: 'border-rose-200 bg-rose-50 text-rose-950',
}

const toneIcons = {
  success: '✓',
  error: '!',
}

export default function FeedbackToast({ tone = 'success', children, onClose }) {
  const safeTone = toneClasses[tone] ? tone : 'success'
  const isError = safeTone === 'error'

  return (
    <div
      className={`fixed right-4 top-24 z-[90] w-[min(24rem,calc(100vw-2rem))] rounded-xl border p-4 shadow-xl ${toneClasses[safeTone]}`}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
    >
      <div className="flex items-start gap-3">
        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full font-bold ${isError ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'}`} aria-hidden="true">
          {toneIcons[safeTone]}
        </span>
        <p className="min-w-0 flex-1 whitespace-pre-line text-sm leading-6">{children}</p>
        <button
          type="button"
          className="-mr-1 -mt-1 rounded-md px-2 py-1 text-sm font-semibold opacity-70 hover:bg-black/5 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-current"
          onClick={onClose}
          aria-label="Închide mesajul"
          title="Închide"
        >
          ×
        </button>
      </div>
    </div>
  )
}
