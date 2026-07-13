import Button from '../../../components/ui/Button'

export default function HREmployeeWorkflowTab({
  workflow,
  busy,
  guidedStep,
  onReload,
  onStartWorkflow,
  onToggleStep,
  onCloseWorkflow,
  getStepActions,
}) {
  const steps = Array.isArray(workflow?.steps) ? workflow.steps : []
  const progress = workflow?.progress || {}

  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-slate-200 p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-semibold text-slate-800">🚦 Onboarding / Offboarding HR</div>
            <div className="text-xs text-slate-500">Checklist ghidat pentru angajare sau plecare, legat de dosar, contracte, Kiosk și echipamente.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={onReload}>Reîncarcă</Button>
            <Button size="sm" loading={busy} onClick={() => onStartWorkflow('onboarding')}>Pornește onboarding</Button>
            <Button size="sm" variant="secondary" loading={busy} onClick={() => onStartWorkflow('offboarding')}>Pornește offboarding</Button>
          </div>
        </div>

        {workflow ? (
          <>
            <div className="mb-3 grid gap-2 sm:grid-cols-4">
              <div className="rounded border border-slate-200 p-2 text-sm"><div className="text-xs text-slate-500">Tip flux</div><strong>{workflow.type === 'offboarding' ? 'Offboarding' : 'Onboarding'}</strong></div>
              <div className="rounded border border-violet-200 bg-violet-50 p-2 text-sm"><div className="text-xs text-violet-700">Status</div><strong>{workflow.status}</strong></div>
              <div className="rounded border border-primary-200 bg-primary-50 p-2 text-sm"><div className="text-xs text-primary-700">Progres total</div><strong>{progress.steps_done || 0}/{progress.steps_total || 0}</strong></div>
              <div className="rounded border border-amber-200 bg-amber-50 p-2 text-sm"><div className="text-xs text-amber-700">Obligatorii</div><strong>{progress.required_done || 0}/{progress.required_total || 0}</strong></div>
            </div>

            <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-2 rounded-full bg-violet-600" style={{ width: `${progress.percent || 0}%` }} />
            </div>

            <div className="grid gap-2">
              {steps.map(step => {
                const actions = getStepActions(step)
                return (
                  <div key={step.key} className={`flex flex-wrap items-center justify-between gap-3 rounded border px-3 py-2 text-sm ${guidedStep && guidedStep === step.key ? 'ring-2 ring-primary-300' : ''} ${step.done ? 'border-emerald-200 bg-emerald-50' : step.required ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                    <label className="flex min-w-0 flex-1 items-start gap-2">
                      <input type="checkbox" className="mt-1" checked={Boolean(step.done)} onChange={event => onToggleStep(step, event.target.checked)} />
                      <span>
                        <span className="font-semibold text-slate-800">{step.done ? '✅' : step.required ? '⬜' : '▫️'} {step.label}</span>
                        {step.required ? <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">obligatoriu</span> : <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">opțional</span>}
                        {step.auto_checked ? <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">detectat automat</span> : null}
                        <div className="text-xs text-slate-500">{step.description}</div>
                        {step.completed_at ? <div className="text-xs text-emerald-700">bifat la {String(step.completed_at).slice(0, 16).replace('T', ' ')}</div> : null}
                        {guidedStep && guidedStep === step.key ? <div className="mt-1 text-xs font-semibold text-primary-700">Pas sugerat din Inbox HR — continuă de aici.</div> : null}
                        {actions.length ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {actions.map(action => (
                              <button
                                key={action.label}
                                type="button"
                                className="rounded bg-white px-2 py-1 text-xs font-semibold text-primary-700 ring-1 ring-primary-100 hover:bg-primary-50"
                                onClick={(event) => { event.preventDefault(); action.run() }}
                              >
                                {action.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </span>
                    </label>
                  </div>
                )
              })}
            </div>

            <div className="mt-3 flex flex-wrap justify-end gap-2">
              {workflow.status !== 'completed' ? <Button size="sm" onClick={() => onCloseWorkflow(false)}>Închide ca finalizat</Button> : null}
              {!['completed','cancelled'].includes(workflow.status) ? <Button size="sm" variant="secondary" onClick={() => onCloseWorkflow(true)}>Anulează flux</Button> : null}
            </div>
          </>
        ) : (
          <div className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            Nu există flux activ pentru acest angajat. Pornește onboarding pentru angajare sau offboarding pentru plecare.
          </div>
        )}
      </div>
    </div>
  )
}
