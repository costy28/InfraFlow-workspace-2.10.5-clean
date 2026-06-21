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
    primary: 'bg-primary-700 text-white shadow-sm shadow-primary-900/10 hover:bg-primary-800 active:bg-primary-900',
    secondary: 'bg-white text-slate-700 ring-1 ring-slate-200 shadow-sm hover:bg-slate-50 active:bg-slate-100',
    danger: 'bg-rose-600 text-white shadow-sm shadow-rose-900/10 hover:bg-rose-700 active:bg-rose-800',
    ghost: 'text-slate-700 hover:bg-slate-100 active:bg-slate-200',
    outline: 'bg-transparent text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 active:bg-slate-100',
  }

  const sizes = {
    sm: 'h-7 rounded-[var(--radius-control)] px-2.5 text-xs',
    md: 'h-[var(--control-height)] rounded-[var(--radius-control)] px-[var(--control-px)] text-sm',
    lg: 'h-10 rounded-[var(--radius-control)] px-4 text-sm',
    icon: 'h-[var(--control-height)] w-[var(--control-height)] rounded-[var(--radius-control)] p-0 text-sm',
  }

  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-semibold tracking-normal transition duration-150 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-55 ${sizes[size] || sizes.md} ${variants[variant] || variants.primary} ${className}`}
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
