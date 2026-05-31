import LoadingSkeleton from './LoadingSkeleton'

export default function Card({
  title,
  subtitle,
  actions,
  loading = false,
  className = '',
  children,
  ...props
}) {
  return (
    <section
      className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${className}`}
      {...props}
    >
      {(title || subtitle || actions) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-base font-semibold text-slate-900">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {loading ? <LoadingSkeleton rows={4} /> : children}
    </section>
  )
}
