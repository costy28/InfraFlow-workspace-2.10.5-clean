import Badge from './Badge'
import Button from './Button'

const toneClasses = {
  info: {
    shell: 'border-blue-100 bg-blue-50/70',
    icon: 'bg-blue-100 text-blue-700',
    title: 'text-blue-950',
    text: 'text-blue-800',
    muted: 'text-blue-700/80',
  },
  success: {
    shell: 'border-primary-100 bg-primary-50/70',
    icon: 'bg-primary-100 text-primary-700',
    title: 'text-primary-950',
    text: 'text-primary-800',
    muted: 'text-primary-700/80',
  },
  warning: {
    shell: 'border-amber-100 bg-amber-50/80',
    icon: 'bg-amber-100 text-amber-800',
    title: 'text-amber-950',
    text: 'text-amber-900',
    muted: 'text-amber-800/80',
  },
}

export default function ContextHelp({
  eyebrow = 'Ghid rapid',
  title,
  description,
  icon = '💡',
  tone = 'info',
  steps = [],
  tips = [],
  nextAction,
  compact = false,
  className = '',
}) {
  const classes = toneClasses[tone] || toneClasses.info
  const visibleSteps = Array.isArray(steps) ? steps.filter(Boolean) : []
  const visibleTips = Array.isArray(tips) ? tips.filter(Boolean) : []
  const doneSteps = visibleSteps.filter(step => step.done).length
  const percent = visibleSteps.length ? Math.round((doneSteps / visibleSteps.length) * 100) : null

  return (
    <section className={`rounded-[var(--radius-panel)] border ${classes.shell} p-4 ${className}`}>
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="flex min-w-0 gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${classes.icon}`}>
            {icon}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={tone === 'warning' ? 'warning' : tone === 'success' ? 'success' : 'info'} size="sm">{eyebrow}</Badge>
              {percent !== null ? <span className={`text-xs font-semibold ${classes.muted}`}>{percent}% complet</span> : null}
            </div>
            {title ? <h3 className={`mt-2 text-base font-semibold ${classes.title}`}>{title}</h3> : null}
            {description ? <p className={`mt-1 text-sm leading-6 ${classes.text}`}>{description}</p> : null}
          </div>
        </div>

        {nextAction ? (
          <div className="flex lg:justify-end">
            <Button
              size="sm"
              variant={nextAction.variant || 'secondary'}
              onClick={nextAction.onClick}
              disabled={nextAction.disabled}
            >
              {nextAction.label || 'Continuă'}
            </Button>
          </div>
        ) : null}
      </div>

      {visibleSteps.length || visibleTips.length ? (
        <div className={`mt-4 grid gap-3 ${compact ? 'lg:grid-cols-2' : 'xl:grid-cols-2'}`}>
          {visibleSteps.length ? (
            <div className="grid gap-2">
              {visibleSteps.map(step => (
                <button
                  key={step.key || step.label}
                  type="button"
                  onClick={step.onClick}
                  disabled={!step.onClick}
                  className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${step.done ? 'border-primary-100 bg-white/80 text-primary-800' : 'border-white/70 bg-white/70 text-slate-700'} ${step.onClick ? 'hover:border-primary-200 hover:bg-white' : 'cursor-default'}`}
                >
                  <span className="mt-0.5">{step.done ? '✓' : '○'}</span>
                  <span>
                    <span className="block font-medium">{step.label}</span>
                    {step.hint ? <span className="block text-xs text-slate-500">{step.hint}</span> : null}
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {visibleTips.length ? (
            <div className="rounded-lg border border-white/70 bg-white/70 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">De reținut</div>
              <ul className="grid gap-2 text-sm text-slate-700">
                {visibleTips.map(tip => (
                  <li key={tip} className="flex gap-2">
                    <span className="text-primary-700">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
