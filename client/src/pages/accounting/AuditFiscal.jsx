import { useEffect, useMemo, useState } from 'react'
import api from '../../api/client'
import Badge from '../../components/ui/Badge'
import Card from '../../components/ui/Card'
import Input from '../../components/forms/Input'
import { AccountingShell, DropdownMenu, Info, Table, currentMonth } from './accounting-shared'

export default function AuditFiscal() {
  const [month, setMonth] = useState(currentMonth())
  const [acceptance, setAcceptance] = useState({ checks: [], summary: {} })
  const [saft, setSaft] = useState({ summary: {}, issues: [], readiness: {} })
  const [runs, setRuns] = useState([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { load() }, [month])

  async function load() {
    try {
      const [acceptanceResponse, saftResponse, runsResponse] = await Promise.all([
        api.get('/accounting/fiscal/acceptance', { params: { perioada: month } }),
        api.get('/accounting/saft/source', { params: { perioada: month } }),
        api.get('/accounting/saft/runs', { params: { perioada: month } })
      ])
      setAcceptance(acceptanceResponse.data || { checks: [], summary: {} })
      setSaft(saftResponse.data || { summary: {}, issues: [], readiness: {} })
      setRuns(runsResponse.data?.runs || [])
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

  async function download(endpoint, filename) {
    try { const response = await api.get(endpoint, { params: { perioada: month }, responseType: 'blob' }); const url = URL.createObjectURL(response.data); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url) }
    catch (err) { setError(err.response?.data?.error || 'Fisierul nu a putut fi descarcat.') }
  }

  const firstBlocked = useMemo(() => (acceptance.checks || []).find(item => !item.ok && item.severity === 'error'), [acceptance])
  return (
    <AccountingShell active="audit-fiscal" title="Audit fiscal" subtitle="Acceptanta lunara, declaratii si SAF-T intr-un singur circuit." actions={<DropdownMenu label="Actiuni" align="right" items={[
      { label: busy ? 'Se proceseaza...' : 'Ruleaza acceptanta', onClick: runAcceptance, disabled: busy },
      { label: 'Export acceptanta Excel', onClick: () => download('/accounting/fiscal/acceptance/export', `Acceptanta_${month}.xlsx`) },
      { type: 'separator' },
      { label: 'Genereaza candidat D406', onClick: generateSaft, disabled: busy },
      { label: 'Diagnostic mapare SAF-T', onClick: () => download('/accounting/saft/export-mapping', `Diagnostic_SAFT_${month}.xlsx`) }
    ]} />}>
      <Card><div className="grid gap-3 md:grid-cols-[220px_1fr]"><Input label="Perioada" type="month" value={month} onChange={event => setMonth(event.target.value)} /><div className={`rounded-md border px-3 py-2 text-sm ${acceptance.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}><strong>{acceptance.ready ? 'Perioada trece controlul intern.' : 'Perioada necesita interventie.'}</strong><div>{firstBlocked ? `${firstBlocked.label}: ${firstBlocked.next_action}` : 'Nu exista blocaje contabile critice.'}</div></div></div></Card>
      {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
      <div className="grid gap-3 sm:grid-cols-4"><Info label="Controale" value={acceptance.summary?.total || 0} /><Info label="Corecte" value={acceptance.summary?.ok || 0} /><Info label="Erori" value={acceptance.summary?.errors || 0} /><Info label="Avertizari" value={acceptance.summary?.warnings || 0} /></div>
      <Table headers={['Zona', 'Status', 'Mesaj', 'Pas urmator', 'Actiuni']}>
        {(acceptance.checks || []).map((item, index) => <tr key={`${item.key}-${index}`}><td className="px-3 py-2 font-semibold">{item.label}</td><td className="px-3 py-2"><Badge tone={item.ok ? 'success' : item.severity === 'error' ? 'danger' : 'warning'}>{item.ok ? 'OK' : item.severity}</Badge></td><td className="px-3 py-2">{item.message}</td><td className="px-3 py-2 text-slate-600">{item.next_action}</td><td className="px-3 py-2">{item.to ? <DropdownMenu label="Actiuni" items={[{ label: 'Deschide zona', to: item.to }]} /> : '-'}</td></tr>)}
      </Table>
      <Card><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">D406 / SAF-T</h3><p className="text-sm text-slate-500">Fișierul poate fi descărcat fiscal numai după acceptarea validatorului configurat.</p></div><Badge tone={saft.readiness?.ready ? 'success' : 'warning'}>{saft.readiness?.coverage || 0}% mapat</Badge></div><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(saft.summary || {}).map(([key, value]) => <Info key={key} label={key.replaceAll('_', ' ')} value={value} />)}</div>{saft.issues?.length ? <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{saft.issues.slice(0, 10).map((item, index) => <div key={index}>{item}</div>)}</div> : null}</Card>
      <Table headers={['Generat', 'Schema', 'Status', 'Conturi', 'Note', 'Facturi', 'Plati', 'Actiuni']}>
        {runs.map(run => <tr key={run.id} title={run.xsd_validation?.errors?.slice(0, 3).join('\n') || ''}><td className="px-3 py-2">{run.created_at?.slice(0, 16).replace('T', ' ')}</td><td className="px-3 py-2">{run.schema_profile?.schema_version || '-'}</td><td className="px-3 py-2"><Badge tone={run.status === 'acceptat_validator' ? 'success' : run.status === 'respins_validator' || run.status === 'respins_xsd' ? 'danger' : 'warning'}>{run.status}</Badge>{run.xsd_validation ? <div className="mt-1 text-xs text-slate-500">XSD: {run.xsd_validation.accepted ? 'valid' : `${run.xsd_validation.error_count || 0} erori`}</div> : null}</td><td className="px-3 py-2 text-right">{run.source_summary?.accounts || 0}</td><td className="px-3 py-2 text-right">{run.source_summary?.journals || 0}</td><td className="px-3 py-2 text-right">{(run.source_summary?.sales || 0) + (run.source_summary?.purchases || 0)}</td><td className="px-3 py-2 text-right">{run.source_summary?.payments || 0}</td><td className="px-3 py-2"><DropdownMenu label="Actiuni" items={[{ label: 'Descarca XML acceptat', onClick: () => download(`/accounting/saft/runs/${run.id}/download`, `D406_${month}.xml`), disabled: run.status !== 'acceptat_validator' }]} /></td></tr>)}
      </Table>
    </AccountingShell>
  )
}
