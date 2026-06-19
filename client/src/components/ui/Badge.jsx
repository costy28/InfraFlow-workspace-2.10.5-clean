const variants = {
  gray: 'bg-slate-100 text-slate-700',
  green: 'bg-primary-50 text-primary-700',
  yellow: 'bg-amber-100 text-amber-800',
  red: 'bg-rose-100 text-rose-800',
  blue: 'bg-blue-100 text-blue-800',
  neutral: 'bg-slate-100 text-slate-700',
  success: 'bg-primary-50 text-primary-700',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-rose-100 text-rose-800',
}

const sizes = {
  sm: 'px-1.5 py-0.5 text-[11px]',
  md: 'px-2 py-1 text-xs',
}

export default function Badge({ variant, tone, size = 'md', className = '', ...props }) {
  const color = variant || tone || 'gray'

  return (
    <span
      className={`inline-flex items-center rounded-[var(--radius-control)] font-semibold ${sizes[size] || sizes.md} ${variants[color] || variants.gray} ${className}`}
      {...props}
    />
  )
}
