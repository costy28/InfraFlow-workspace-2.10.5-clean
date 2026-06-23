export default function PageHeader({ title, subtitle, actions = [], breadcrumb = [] }) {
  return (
    <header className="flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        {breadcrumb.length > 0 && (
          <nav className="mb-1 flex flex-wrap gap-1 text-xs text-slate-500">
            {breadcrumb.map((item, index) => (
              <span key={`${item}-${index}`}>
                {index > 0 && <span className="mx-1">/</span>}
                {item}
              </span>
            ))}
          </nav>
        )}
        <h1 className="truncate text-2xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {actions.length > 0 && <div className="module-toolbar shrink-0 md:justify-end">{actions}</div>}
    </header>
  )
}
