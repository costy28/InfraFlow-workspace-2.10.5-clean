import Button from './Button'

export default function Modal({ open, title, children, onClose, size = 'md' }) {
  if (!open) return null

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-950/40 p-3 md:items-center md:p-4">
      <div className={`flex max-h-[calc(100dvh-1.5rem)] w-full animate-[slideUp_.18s_ease-out] flex-col overflow-hidden rounded-lg bg-white shadow-xl md:max-h-[calc(100vh-2rem)] ${sizes[size] || sizes.md}`}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <Button variant="ghost" onClick={onClose}>Inchide</Button>
        </div>
        <div className="min-h-0 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  )
}
