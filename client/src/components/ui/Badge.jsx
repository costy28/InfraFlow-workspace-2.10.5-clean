const variants = {
  gray: 'border-slate-200 bg-slate-100 text-slate-700',
  green: 'border-primary-100 bg-primary-50 text-primary-700',
  yellow: 'border-amber-200 bg-amber-100 text-amber-800',
  red: 'border-rose-200 bg-rose-100 text-rose-800',
  blue: 'border-blue-200 bg-blue-100 text-blue-800',
  neutral: 'border-slate-200 bg-slate-100 text-slate-700',
  success: 'border-primary-100 bg-primary-50 text-primary-700',
  warning: 'border-amber-200 bg-amber-100 text-amber-800',
  danger: 'border-rose-200 bg-rose-100 text-rose-800',
  info: 'border-blue-200 bg-blue-100 text-blue-800',
}

const sizes = {
  sm: 'px-1.5 py-0.5 text-[11px]',
  md: 'px-2 py-1 text-xs',
}

export default function Badge({ variant, tone, size = 'md', className = '', ...props }) {
  const color = variant || tone || 'gray'

  return (
    <span
      className={`inline-flex items-center rounded-[calc(var(--radius-control)-0.05rem)] border font-semibold leading-none ${sizes[size] || sizes.md} ${variants[color] || variants.gray} ${className}`}
      {...props}
    />
  )
}
