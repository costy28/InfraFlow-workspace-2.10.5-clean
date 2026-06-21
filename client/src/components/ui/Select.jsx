export default function Select({ label, error, options = [], className = '', id, children, ...props }) {
  const selectId = id || props.name || label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700" htmlFor={selectId}>
      {label}
      <select
        id={selectId}
        className={`h-[var(--control-height)] w-full rounded-[var(--radius-control)] border bg-white px-[var(--control-px)] text-sm outline-none transition hover:border-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 disabled:bg-slate-100 disabled:text-slate-500 ${
          error ? 'border-rose-400' : 'border-slate-300'
        } ${className}`}
        {...props}
      >
        {children || options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <span className="text-xs font-normal text-rose-600">{error}</span>}
    </label>
  )
}
