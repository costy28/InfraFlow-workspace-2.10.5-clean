import Button from './Button'

export default function Modal({ open, title, children, onClose, size = 'md' }) {
  if (!open) return null

  const sizes = {
    sm: '28rem',
    md: '42rem',
    lg: '56rem',
    xl: '72rem',
  }
  const initialWidth = sizes[size] || sizes.md

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-950/40 p-3 md:items-center md:p-4">
      <div
        className="flex max-h-[calc(100dvh-1.5rem)] min-h-[18rem] w-full min-w-[min(22rem,calc(100vw-1.5rem))] animate-[slideUp_.18s_ease-out] resize flex-col overflow-auto rounded-lg bg-white shadow-xl md:max-h-[calc(100vh-2rem)]"
        style={{
          width: `min(${initialWidth}, calc(100vw - 2rem))`,
          maxWidth: 'calc(100vw - 2rem)',
          minWidth: 'min(22rem, calc(100vw - 1.5rem))'
        }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <Button variant="ghost" onClick={onClose}>Inchide</Button>
        </div>
        <div className="min-h-0 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  )
}
