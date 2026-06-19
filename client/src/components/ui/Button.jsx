export default function Button({
  className = '',
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  children,
  ...props
}) {
  const variants = {
    primary: 'bg-primary-600 text-white shadow-sm shadow-primary-900/10 hover:bg-primary-700',
    secondary: 'bg-white text-slate-700 ring-1 ring-slate-200 shadow-sm hover:bg-slate-50',
    danger: 'bg-rose-600 text-white shadow-sm shadow-rose-900/10 hover:bg-rose-700',
    ghost: 'text-slate-700 hover:bg-slate-100',
  }

  const sizes = {
    sm: 'h-7 rounded-[var(--radius-control)] px-2.5 text-xs',
    md: 'h-[var(--control-height)] rounded-[var(--radius-control)] px-[var(--control-px)] text-sm',
    lg: 'h-10 rounded-[var(--radius-control)] px-4 text-sm',
  }

  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-semibold tracking-normal transition focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:opacity-60 ${sizes[size] || sizes.md} ${variants[variant] || variants.primary} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : icon}
      {children}
    </button>
  )
}
