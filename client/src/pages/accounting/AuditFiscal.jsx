import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api/client'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/forms/Input'
import { AccountingShell, DropdownMenu, Info, Table, currentMonth } from './accounting-shared'

export default function AuditFiscal() {
  const [month, setMonth] = useState(currentMonth())
  const [acceptance, setAcceptance] = useState({ checks: [], summary: {} })
  const [saft, setSaft] = useState({ summary: {}, issues: [], issue_details: [], readiness: {} })
  const [validator, setValidator] = useState({ configured: false, execution_enabled: false })
  const [requirements, setRequirements] = useState({ steps: [] })
  const [runs, setRuns] = useState([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [receipt, setReceipt] = useState({ run_id: '', number: '', status: 'acceptata', message: '', file: null })

  useEffect(() => { load() }, [month])

  async function load() {
    try {
      const [acceptanceResponse, saftResponse, runsResponse, validatorResponse, requirementsResponse] = await Promise.all([
        api.get('/accounting/fiscal/acceptance', { params: { perioada: month } }),
        api.get('/accounting/saft/source', { params: { perioada: month } }),
        api.get('/accounting/saft/runs', { params: { perioada: month } }),
        api.get('/accounting/declarations/validators/D406'),
        api.get('/accounting/declarations/validators/D406/requirements')
      ])
      setAcceptance(acceptanceResponse.data || { checks: [], summary: {} })
      setSaft(saftResponse.data || { summary: {}, issues: [], readiness: {} })
      setRuns(runsResponse.data?.runs || [])
      setValidator(validatorResponse.data || { configured: false, execution_enabled: false })
      setRequirements(requirementsResponse.data || { steps: [] })
      setError('')
    } catch (err) { setError(err.response?.data?.error || 'Controlul fiscal nu a putut fi incarcat.') }
  }

  async function runAcceptance() {
    setBusy(true)
    try { const response = await api.post('/accounting/fiscal/acceptance/run', { perioada: month }); setAcceptance(response.data?.run?.report || acceptance); setMessage('Controlul de acceptanta a fost salvat.'); setError('') }
    catch (err) { setError(err.response?.data?.error || 'Controlul nu a putut fi salvat.') }
    finally { setBusy(false) }
  }

  async function generateSaft() {
    setBusy(true)
    try { const response = await api.post('/accounting/saft/generate', { perioada: month }); setMessage(`D406: ${response.data?.run?.status || 'generat'}.`); setError(''); await load() }
    catch (err) { setError(err.response?.data?.error || 'Candidatul D406 nu a putut fi generat.') }
    finally { setBusy(false) }
  }

  async function configureDuk() {
    setBusy(true)
    try {
      const response = await api.post('/accounting/declarations/validators/D406/auto-configure', {})
      setValidator(response.data?.diagnostic || {})
      setMessage(response.data?.test?.ok ? 'Validatorul DUK a fost detectat, configurat si testat.' : 'DUK a fost configurat, dar Java necesita verificare.')
      setError('')
    } catch (err) { setError(err.response?.data?.error || 'Validatorul DUK nu a putut fi configurat automat.') }
    finally { setBusy(false) }
  }

  async function recheck(run) {
    setBusy(true)
    try { const response = await api.post(`/accounting/saft/runs/${run.id}/recheck`); setMessage(`Reverificare D406: ${response.data?.run?.status || 'finalizata'}.`); setError(''); await load() }
    catch (err) { setError(err.response?.data?.error || 'Rularea SAF-T nu a putut fi reverificata.') }
    finally { setBusy(false) }
  }

  async function uploadReceipt(event) {
    event.preventDefault()
    if (!receipt.run_id || !receipt.number.trim() || !receipt.file) { setError('Selecteaza rularea D406, completeaza recipisa si ataseaza fisierul.'); return }
    setBusy(true)
    try {
      const body = new FormData(); body.append('recipisa', receipt.number.trim()); body.append('status', receipt.status); body.append('message', receipt.message); body.append('file', receipt.file)
      await api.post(`/accounting/saft/runs/${receipt.run_id}/receipt`, body)
      setReceipt({ run_id: '', number: '', status: 'acceptata', message: '', file: null }); setMessage('Recipisa D406 a fost arhivata.'); setError(''); await load()
    } catch (err) { setError(err.response?.data?.error || 'Recipisa D406 nu a putut fi arhivata.') }
    finally { setBusy(false) }
  }

  async function download(endpoint, filename) {
    try { const response = await api.get(endpoint, { params: { perioada: month }, responseType: 'blob' }); const url = URL.createObjectURL(response.data); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url) }
    catch (err) { setError(err.response?.data?.error || 'Fisierul nu a putut fi descarcat.') }
  }

  const firstBlocked = useMemo(() => (acceptance.checks || []).find(item => !item.ok && item.severity === 'error'), [acceptance])
  const auditSummary = buildAuditFiscalSummary({ acceptance, saft, validator, requirements, runs })
  const auditFlow = buildAuditFiscalFlow({
    month,
    summary: auditSummary,
    runAcceptance,
    generateSaft,
    configureDuk,
    exportAcceptance: () => download('/accounting/fiscal/acceptance/export', `Acceptanta_${month}.xlsx`),
    exportDossier: () => download('/accounting/fiscal/dossier', `Dosar_fiscal_${month}.zip`)
  })
  return (
    <AccountingShell active="audit-fiscal" title="Audit fiscal" subtitle="Acceptanta lunara, declaratii si SAF-T intr-un singur circuit." actions={<DropdownMenu label="Actiuni" align="right" items={[
      { label: busy ? 'Se proceseaza...' : 'Ruleaza acceptanta', onClick: runAcceptance, disabled: busy },
      { label: 'Export acceptanta Excel', onClick: () => download('/accounting/fiscal/acceptance/export', `Acceptanta_${month}.xlsx`) },
      { type: 'separator' },
      { label: 'Genereaza candidat D406', onClick: generateSaft, disabled: busy },
      { label: 'Diagnostic mapare SAF-T', onClick: () => download('/accounting/saft/export-mapping', `Diagnostic_SAFT_${month}.xlsx`) }
      ,{ label: 'Descarca dosarul fiscal', onClick: () => download('/accounting/fiscal/dossier', `Dosar_fiscal_${month}.zip`) }
    ]} />}>
      <Card><div className="grid gap-3 md:grid-cols-[220px_1fr]"><Input label="Perioada" type="month" value={month} onChange={event => setMonth(event.target.value)} /><div className={`rounded-md border px-3 py-2 text-sm ${acceptance.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}><strong>{acceptance.ready ? 'Perioada trece controlul intern.' : 'Perioada necesita interventie.'}</strong><div>{firstBlocked ? `${firstBlocked.label}: ${firstBlocked.next_action}` : 'Nu exista blocaje contabile critice.'}</div></div></div></Card>
      {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge tone={auditFlow.tone}>{auditFlow.badge}</Badge>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Audit fiscal simplificat</span>
            </div>
            <h3 className="text-lg font-semibold text-slate-900">{auditFlow.title}</h3>
            <p className="mt-1 max-w-4xl text-sm text-slate-500">{auditFlow.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={auditFlow.primaryAction} disabled={busy}>{busy ? 'Se procesează...' : auditFlow.primaryLabel}</Button>
            <Button variant="secondary" onClick={load} disabled={busy}>Reîncarcă</Button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {auditFlow.steps.map((step, index) => (
            <button
              key={step.key}
              type="button"
              onClick={step.onClick}
              disabled={busy}
              className={`rounded-lg border px-4 py-3 text-left transition hover:shadow-sm disabled:opacity-60 ${step.tone === 'danger' ? 'border-red-200 bg-red-50' : step.tone === 'warning' ? 'border-amber-200 bg-amber-50' : step.tone === 'success' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">{index + 1}</span>
                <Badge tone={step.tone}>{step.status}</Badge>
              </div>
              <div className="mt-3 font-semibold text-slate-900">{step.title}</div>
              <p className="mt-1 text-sm text-slate-500">{step.detail}</p>
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Info label="Blocaje" value={auditSummary.blockers} />
          <Info label="Avertizări" value={auditSummary.warnings} />
          <Info label="Rulări D406" value={auditSummary.runsCount} />
          <Info label="Recipise lipsă" value={auditSummary.missingReceipts} />
        </div>
      </Card>
      <div className="grid gap-3 sm:grid-cols-4"><Info label="Controale" value={acceptance.summary?.total || 0} /><Info label="Corecte" value={acceptance.summary?.ok || 0} /><Info label="Erori" value={acceptance.summary?.errors || 0} /><Info label="Avertizari" value={acceptance.summary?.warnings || 0} /></div>
      <Table headers={['Zona', 'Status', 'Mesaj', 'Pas urmator', 'Actiuni']}>
        {(acceptance.checks || []).map((item, index) => <tr key={`${item.key}-${index}`}><td className="px-3 py-2 font-semibold">{item.label}</td><td className="px-3 py-2"><Badge tone={item.ok ? 'success' : item.severity === 'error' ? 'danger' : 'warning'}>{item.ok ? 'OK' : item.severity}</Badge></td><td className="px-3 py-2">{item.message}</td><td className="px-3 py-2 text-slate-600">{item.next_action}</td><td className="px-3 py-2">{item.to ? <DropdownMenu label="Actiuni" items={[{ label: 'Deschide zona', to: item.to }]} /> : '-'}</td></tr>)}
      </Table>
      <Card><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">D406 / SAF-T</h3><p className="text-sm text-slate-500">Fisierul poate fi descarcat fiscal numai dupa acceptarea validatorului configurat.</p></div><div className="flex items-center gap-2"><Badge tone={validator.execution_enabled ? 'success' : 'warning'}>{validator.execution_enabled ? 'DUK configurat' : 'DUK neconfigurat'}</Badge><Badge tone={saft.integrity?.ready ? 'success' : 'warning'}>{saft.integrity?.ready ? 'Corelari complete' : `${saft.integrity?.issues?.length || 0} corelari lipsa`}</Badge><Badge tone={saft.readiness?.ready ? 'success' : 'warning'}>{saft.readiness?.coverage || 0}% mapat</Badge>{!validator.execution_enabled ? <button type="button" onClick={configureDuk} disabled={busy} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">Configureaza DUK</button> : null}</div></div>{!requirements.ready ? <div className="mt-3 grid gap-2 sm:grid-cols-3">{(requirements.steps || []).map(step => <div key={step.key} className={`rounded-md border px-3 py-2 text-sm ${step.ok ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}><strong>{step.ok ? 'OK' : 'Necesita actiune'}: {step.label}</strong>{!step.ok ? <div className="mt-1 text-xs text-slate-600">{step.action}</div> : null}</div>)}</div> : null}<div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(saft.summary || {}).map(([key, value]) => <Info key={key} label={key.replaceAll('_', ' ')} value={value} />)}</div>{saft.issue_details?.length ? <div className="mt-3 grid gap-2">{saft.issue_details.slice(0, 12).map((item, index) => <div key={`${item.message}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"><div><strong>{item.area}:</strong> {item.message}<div className="text-xs">{item.action}</div></div><Link className="font-semibold underline" to={item.to}>Repara</Link></div>)}</div> : null}</Card>
      <Table headers={['Generat', 'Schema', 'Status', 'Conturi', 'Note', 'Facturi', 'Plati', 'Actiuni']}>
        {runs.map(run => <tr key={run.id} title={[...(run.xsd_validation?.errors || []), ...(run.validation?.issues || [])].slice(0, 5).join('\n')}><td className="px-3 py-2">{run.created_at?.slice(0, 16).replace('T', ' ')}</td><td className="px-3 py-2">{run.schema_profile?.schema_version || '-'}</td><td className="px-3 py-2"><Badge tone={run.status === 'acceptat_validator' ? 'success' : run.status === 'respins_validator' || run.status === 'respins_xsd' ? 'danger' : 'warning'}>{run.status}</Badge>{run.xsd_validation ? <div className="mt-1 text-xs text-slate-500">XSD: {run.xsd_validation.accepted ? 'valid' : `${run.xsd_validation.error_count || 0} erori`}</div> : null}{(run.guidance || []).slice(0, 2).map((issue, index) => <div key={index} className="mt-1 max-w-sm text-xs text-red-700">{issue.message} <Link className="font-semibold underline" to={issue.to}>Repara</Link></div>)}</td><td className="px-3 py-2 text-right">{run.source_summary?.accounts || 0}</td><td className="px-3 py-2 text-right">{run.source_summary?.journals || 0}</td><td className="px-3 py-2 text-right">{(run.source_summary?.sales || 0) + (run.source_summary?.purchases || 0)}</td><td className="px-3 py-2 text-right">{run.source_summary?.payments || 0}</td><td className="px-3 py-2"><DropdownMenu label="Actiuni" items={[{ label: 'Reverifica dupa corectii', onClick: () => recheck(run), disabled: busy }, { label: 'Descarca XML acceptat', onClick: () => download(`/accounting/saft/runs/${run.id}/download`, `D406_${month}.xml`), disabled: run.status !== 'acceptat_validator' }]} /></td></tr>)}
      </Table>
      <Card><h3 className="font-semibold">Recipisa ANAF D406</h3><p className="mt-1 text-sm text-slate-500">Asociaza recipisa numai rulării acceptate de validatorul DUK.</p><form onSubmit={uploadReceipt} className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5"><label className="text-sm font-medium text-slate-700">Rulare D406<select className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" value={receipt.run_id} onChange={event => setReceipt({ ...receipt, run_id: event.target.value })}><option value="">Selecteaza</option>{runs.filter(run => run.status === 'acceptat_validator').map(run => <option key={run.id} value={run.id}>#{run.id} · {run.created_at?.slice(0, 16).replace('T', ' ')}</option>)}</select></label><Input label="Numar recipisa" value={receipt.number} onChange={event => setReceipt({ ...receipt, number: event.target.value })} /><label className="text-sm font-medium text-slate-700">Status<select className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" value={receipt.status} onChange={event => setReceipt({ ...receipt, status: event.target.value })}><option value="acceptata">Acceptata</option><option value="respinsa">Respinsa</option><option value="in_procesare">In procesare</option></select></label><label className="text-sm font-medium text-slate-700">Fisier recipisa<input className="mt-1 block w-full text-sm" type="file" accept=".pdf,.xml,.zip,.txt" onChange={event => setReceipt({ ...receipt, file: event.target.files?.[0] || null })} /></label><button type="submit" disabled={busy} className="self-end rounded-md bg-emerald-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Arhiveaza recipisa</button></form></Card>
    </AccountingShell>
  )
}

function buildAuditFiscalSummary({ acceptance, saft, validator, requirements, runs }) {
  const checks = acceptance?.checks || []
  const blockers = Number(acceptance?.summary?.errors || checks.filter(item => !item.ok && item.severity === 'error').length || 0)
  const warnings = Number(acceptance?.summary?.warnings || checks.filter(item => !item.ok && item.severity !== 'error').length || 0)
  const saftIssueCount = (saft?.issues || []).length + (saft?.issue_details || []).length + (saft?.integrity?.issues || []).length
  const requirementsMissing = (requirements?.steps || []).filter(step => !step.ok).length
  const runsCount = runs?.length || 0
  const acceptedRuns = (runs || []).filter(run => run.status === 'acceptat_validator').length
  const rejectedRuns = (runs || []).filter(run => ['respins_validator', 'respins_xsd'].includes(run.status)).length
  const missingReceipts = (runs || []).filter(run => run.status === 'acceptat_validator' && !run.receipt_status && !run.recipisa_status).length
  const validatorReady = Boolean(validator?.execution_enabled)
  const saftReady = Boolean(saft?.readiness?.ready || saft?.integrity?.ready)

  return {
    blockers,
    warnings,
    saftIssueCount,
    requirementsMissing,
    runsCount,
    acceptedRuns,
    rejectedRuns,
    missingReceipts,
    validatorReady,
    saftReady,
    acceptanceReady: Boolean(acceptance?.ready),
    mappingCoverage: Number(saft?.readiness?.coverage || 0)
  }
}

function buildAuditFiscalFlow({ month, summary, runAcceptance, generateSaft, configureDuk, exportAcceptance, exportDossier }) {
  const steps = [
    {
      key: 'acceptance',
      title: 'Acceptanță lunară',
      detail: summary.blockers
        ? `${summary.blockers} blocaje trebuie reparate înainte de dosarul fiscal.`
        : summary.warnings
          ? `${summary.warnings} avertizări merită verificate înainte de export.`
          : 'Controalele lunare nu semnalează blocaje critice.',
      status: summary.blockers ? 'blocaj' : summary.warnings ? 'atenție' : 'ok',
      tone: summary.blockers ? 'danger' : summary.warnings ? 'warning' : 'success',
      onClick: runAcceptance
    },
    {
      key: 'validator',
      title: 'Validator D406',
      detail: summary.validatorReady
        ? 'Validatorul local este configurat pentru verificarea candidatului SAF-T.'
        : `${summary.requirementsMissing || 1} cerințe lipsesc pentru DUK/validator.`,
      status: summary.validatorReady ? 'configurat' : 'de configurat',
      tone: summary.validatorReady ? 'success' : 'warning',
      onClick: summary.validatorReady ? generateSaft : configureDuk
    },
    {
      key: 'saft',
      title: 'SAF-T / D406',
      detail: summary.saftIssueCount
        ? `${summary.saftIssueCount} mapări sau corelări cer atenție.`
        : `${summary.mappingCoverage}% mapare · ${summary.runsCount} rulări generate.`,
      status: summary.saftIssueCount ? 'de reparat' : summary.acceptedRuns ? 'acceptat' : 'pregătire',
      tone: summary.saftIssueCount ? 'warning' : summary.acceptedRuns ? 'success' : 'gray',
      onClick: generateSaft
    },
    {
      key: 'dossier',
      title: 'Dosar fiscal',
      detail: summary.missingReceipts
        ? `${summary.missingReceipts} recipise lipsesc de la rulările acceptate.`
        : summary.acceptedRuns
          ? 'Rulările acceptate pot fi incluse în dosarul fiscal al lunii.'
          : 'Generează și acceptă D406 înainte de arhivarea finală.',
      status: summary.missingReceipts ? 'recipise' : summary.acceptedRuns ? 'gata' : 'în lucru',
      tone: summary.missingReceipts ? 'warning' : summary.acceptedRuns ? 'success' : 'gray',
      onClick: exportDossier
    }
  ]

  if (summary.blockers) {
    return {
      badge: 'Blocaje',
      tone: 'danger',
      title: `Auditul fiscal ${month} are blocaje de rezolvat`,
      description: 'Rezolvă mai întâi erorile de acceptanță. Ele sunt riscul real: pot strica TVA, declarațiile sau dosarul fiscal.',
      primaryLabel: 'Rulează acceptanța',
      primaryAction: runAcceptance,
      steps
    }
  }
  if (!summary.validatorReady) {
    return {
      badge: 'Validator',
      tone: 'warning',
      title: 'Configurează validatorul D406 înainte de SAF-T',
      description: 'SAF-T poate fi generat ca fișier de lucru, dar nu îl tratăm ca acceptat fiscal fără validatorul local configurat.',
      primaryLabel: 'Configurează DUK',
      primaryAction: configureDuk,
      steps
    }
  }
  if (summary.saftIssueCount || summary.rejectedRuns) {
    return {
      badge: 'SAF-T',
      tone: 'warning',
      title: 'Repară mapările și corelările SAF-T',
      description: 'Există probleme pe sursa D406 sau rulări respinse. Verifică diagnosticul înainte de dosarul final.',
      primaryLabel: 'Generează / reverifică D406',
      primaryAction: generateSaft,
      steps
    }
  }
  if (summary.warnings) {
    return {
      badge: 'Avertizări',
      tone: 'warning',
      title: 'Auditul trece, dar are avertizări de control',
      description: 'Nu sunt blocaje critice, însă merită exportat raportul de acceptanță pentru revizie internă.',
      primaryLabel: 'Export acceptanță',
      primaryAction: exportAcceptance,
      steps
    }
  }
  if (summary.missingReceipts) {
    return {
      badge: 'Recipise',
      tone: 'warning',
      title: 'Atașează recipisele pentru rulările acceptate',
      description: 'D406 are rulări acceptate, dar dosarul fiscal nu este complet fără recipisele arhivate.',
      primaryLabel: 'Descarcă dosarul fiscal',
      primaryAction: exportDossier,
      steps
    }
  }
  return {
    badge: 'Curat',
    tone: 'success',
    title: `Auditul fiscal ${month} este pregătit`,
    description: 'Acceptanța, validatorul și SAF-T nu semnalează blocaje majore. Poți arhiva sau descărca dosarul fiscal.',
    primaryLabel: 'Descarcă dosarul fiscal',
    primaryAction: exportDossier,
    steps
  }
}
