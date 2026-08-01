import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api/client'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Input from '../../components/forms/Input'
import { formatMoney } from '../../utils/format'
import { AccountingShell, DropdownMenu, currentMonth } from './accounting-shared'
export function ContabilitateDashboard() {
  const [summary, setSummary] = useState(null)
  const [health, setHealth] = useState(null)
  const [reconciliation, setReconciliation] = useState(null)
  const [month, setMonth] = useState(currentMonth())
  const [error, setError] = useState('')
  useEffect(() => {
    Promise.all([
      api.get('/accounting/summary', { params: { luna: month } }),
      api.get('/accounting/health', { params: { luna: month } }),
      api.get('/accounting/reconciliation', { params: { luna: month } })
    ])
      .then(([summaryRes, healthRes, reconciliationRes]) => {
        setSummary(summaryRes.data)
        setHealth(healthRes.data)
        setReconciliation(reconciliationRes.data)
      })
      .catch(err => setError(err.response?.data?.error || 'Nu am putut incarca dashboard-ul contabil.'))
  }, [month])
  const actionableIssues = useMemo(() => {
    const issues = reconciliation?.issues || {}
    return [
      ...(issues.draft_invoices || []).map(row => ({ ...row, kind: 'draft_invoice', group: 'Facturi draft', action: 'Validează sau anulează factura.' })),
      ...(issues.draft_treasury || []).map(row => ({ ...row, kind: 'draft_treasury', group: 'Trezorerie draft', action: 'Validează operația sau anuleaz-o.' })),
      ...(issues.open_suppliers || []).map(row => ({ ...row, kind: 'open_supplier', group: 'Furnizori de plată', action: 'Plătește factura sau verifică scadența.' })),
      ...(issues.open_clients || []).map(row => ({ ...row, kind: 'open_client', group: 'Clienți de încasat', action: 'Încasează factura sau verifică scadența.' })),
      ...(issues.unlinked_treasury || []).map(row => ({ ...row, kind: 'unlinked_treasury', group: 'Trezorerie necorelată', action: 'Leagă operația de factură sau marcheaz-o ca avans/corecție.' })),
      ...(issues.invoice_missing_journal || []).map(row => ({ ...row, kind: 'invoice_missing_journal', group: 'Facturi fără notă', action: 'Devalidează și validează din nou documentul.' })),
      ...(issues.unbalanced_journals || []).map(row => ({ ...row, kind: 'unbalanced_journal', group: 'Note dezechilibrate', action: 'Corectează debitul și creditul notei.' }))
    ].slice(0, 12)
  }, [reconciliation])

  const accountingAssistant = useMemo(() => {
    const failedChecks = (health?.checks || []).filter(check => !check.ok)
    const urgentIssue = actionableIssues[0]
    const issueGroups = actionableIssues.reduce((acc, issue) => {
      acc[issue.group] = (acc[issue.group] || 0) + 1
      return acc
    }, {})
    const groupSummary = Object.entries(issueGroups)
      .map(([group, count]) => `${group}: ${count}`)
      .slice(0, 4)

    let primary = {
      tone: 'success',
      title: 'Luna arată curat pentru controlul de bază.',
      text: 'Poți verifica balanța și apoi pregăti închiderea perioadei.',
      to: `/contabilitate/balanta?luna=${month}`,
      label: 'Verifică balanța'
    }

    if (!summary && !health && !reconciliation) {
      primary = {
        tone: 'info',
        title: 'Încarc verificările contabile ale lunii.',
        text: 'Asistentul va afișa primul blocaj după ce se termină încărcarea.',
        to: '/contabilitate',
        label: 'Dashboard'
      }
    } else if (failedChecks.length) {
      const first = failedChecks[0]
      primary = {
        tone: 'warning',
        title: first.label || 'Date de bază de verificat',
        text: first.message || 'Există nomenclatoare sau configurări care trebuie curățate înainte de documente.',
        to: first.link || '/contabilitate/plan-conturi',
        label: 'Rezolvă verificarea'
      }
    } else if (urgentIssue) {
      primary = {
        tone: urgentIssue.kind === 'unbalanced_journal' ? 'danger' : 'warning',
        title: urgentIssue.group,
        text: urgentIssue.action,
        to: urgentIssue.link || `/contabilitate/inchidere-luna?luna=${month}`,
        label: 'Deschide problema'
      }
    } else if (summary?.alertsNew) {
      primary = {
        tone: 'warning',
        title: `${summary.alertsNew} alerte legislative noi`,
        text: 'Verifică alertele înainte de validări fiscale sau închiderea lunii.',
        to: '/contabilitate/alerte',
        label: 'Vezi alertele'
      }
    }

    return {
      primary,
      counts: [
        { label: 'Verificări de bază', value: failedChecks.length ? `${failedChecks.length} de rezolvat` : 'OK', tone: failedChecks.length ? 'warning' : 'success' },
        { label: 'Probleme lunare', value: actionableIssues.length || '0', tone: actionableIssues.length ? 'warning' : 'success' },
        { label: 'Status reconciliere', value: reconciliation?.status || 'în lucru', tone: reconciliation?.status === 'ok' ? 'success' : reconciliation?.status === 'danger' ? 'danger' : 'warning' },
        { label: 'Alerte legislative', value: summary?.alertsNew || 0, tone: summary?.alertsNew ? 'warning' : 'success' }
      ],
      steps: [
        {
          label: '1. Curăță baza',
          text: failedChecks.length ? failedChecks[0]?.message || 'Rezolvă verificările de bază.' : 'Planul de conturi, partenerii și setările lunii sunt în regulă.',
          to: failedChecks[0]?.link || '/contabilitate/plan-conturi',
          done: !failedChecks.length
        },
        {
          label: '2. Rezolvă documentele',
          text: actionableIssues.length ? groupSummary.join(' · ') : 'Nu sunt facturi, trezorerii sau note cu blocaje evidente.',
          to: urgentIssue?.link || `/contabilitate/registru-jurnal?luna=${month}`,
          done: !actionableIssues.length
        },
        {
          label: '3. Închide luna',
          text: !failedChecks.length && !actionableIssues.length ? 'Poți merge la controlul final al perioadei.' : 'Închiderea devine disponibilă logic după pașii de mai sus.',
          to: `/contabilitate/inchidere-luna?luna=${month}`,
          done: !failedChecks.length && !actionableIssues.length
        }
      ]
    }
  }, [actionableIssues, health, month, reconciliation, summary])

  function issueActionMenu(issue) {
    const treasuryBase = `/contabilitate/trezorerie?luna=${month}`
    if (issue.kind === 'open_supplier') {
      return [
        { label: 'Inregistreaza plata', to: `${treasuryBase}&invoice_in_id=${issue.id}&new=1` },
        { label: 'Deschide factura', to: issue.link || '/contabilitate/facturi-intrare' },
        { label: 'Vezi trezoreria lunii', to: treasuryBase }
      ]
    }
    if (issue.kind === 'open_client') {
      return [
        { label: 'Inregistreaza incasarea', to: `${treasuryBase}&invoice_out_id=${issue.id}&new=1` },
        { label: 'Deschide factura', to: issue.link || '/contabilitate/facturi-iesire' },
        { label: 'Vezi trezoreria lunii', to: treasuryBase }
      ]
    }
    if (issue.kind === 'draft_treasury' || issue.kind === 'unlinked_treasury') {
      return [
        { label: 'Deschide in trezorerie', to: issue.link || treasuryBase },
        { label: 'Registru jurnal', to: `/contabilitate/registru-jurnal?luna=${month}` }
      ]
    }
    if (issue.kind === 'unbalanced_journal') {
      return [
        { label: 'Deschide nota', to: issue.link || `/contabilitate/registru-jurnal?luna=${month}` },
        { label: 'Verifica balanta', to: `/contabilitate/balanta?luna=${month}` }
      ]
    }
    return [
      { label: 'Deschide documentul', to: issue.link || '/contabilitate' },
      { label: 'Inchidere luna', to: `/contabilitate/inchidere-luna?luna=${month}` }
    ]
  }
  async function exportReconciliation() {
    setError('')
    try {
      const res = await api.get('/accounting/reconciliation/export', { params: { luna: month }, responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const link = document.createElement('a')
      link.href = url
      link.download = `Reconciliere_contabila_${month}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.response?.data?.error || 'Exportul reconcilierii nu a putut fi generat.')
    }
  }
  return (
    <AccountingShell active="dashboard" title="Contabilitate" subtitle="Registru, facturi, TVA, balanta si inchidere perioada.">
      {error ? <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      <Card>
        <Input label="Luna" type="month" value={month} onChange={event => setMonth(event.target.value)} />
      </Card>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-primary-700">Asistent contabil</div>
            <h3 className="mt-1 text-base font-semibold text-slate-900">{accountingAssistant.primary.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{accountingAssistant.primary.text}</p>
          </div>
          <Link
            className="inline-flex h-[var(--control-height)] items-center rounded-[var(--radius-control)] bg-primary-700 px-[var(--control-px)] text-sm font-semibold text-white shadow-sm transition hover:bg-primary-800"
            to={accountingAssistant.primary.to}
          >
            {accountingAssistant.primary.label}
          </Link>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {accountingAssistant.counts.map(item => (
            <div key={item.label} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-xs text-slate-500">{item.label}</div>
              <div className="mt-1"><Badge tone={item.tone}>{item.value}</Badge></div>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {accountingAssistant.steps.map(step => (
            <Link
              key={step.label}
              to={step.to}
              className={`rounded-md border p-3 transition hover:-translate-y-0.5 hover:shadow-sm ${step.done ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-slate-900">{step.label}</div>
                <Badge tone={step.done ? 'success' : 'warning'}>{step.done ? 'OK' : 'De lucru'}</Badge>
              </div>
              <div className="mt-2 text-xs text-slate-600">{step.text}</div>
            </Link>
          ))}
        </div>
      </Card>
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          ['Perioada', summary?.period?.status || 'deschisa'],
          ['Facturi intrare', `${summary?.invoicesIn?.count || 0} / ${formatMoney(summary?.invoicesIn?.total || 0)}`],
          ['Facturi iesire', `${summary?.invoicesOut?.count || 0} / ${formatMoney(summary?.invoicesOut?.total || 0)}`],
          ['TVA diferenta', formatMoney(summary?.vat?.diferenta || 0)],
          ['Furnizori depasiti', summary?.overdueSuppliers || 0],
          ['Clienti restanti', summary?.overdueClients || 0],
        ].map(([label, value]) => (
          <Card key={label}>
            <div className="text-xs text-slate-500">{label}</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">{value}</div>
          </Card>
        ))}
      </div>
      {summary?.alertsNew ? <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Exista {summary.alertsNew} alerte legislative noi.</div> : null}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Reconciliere lunară</h3>
            <p className="text-sm text-slate-500">Probleme concrete de rezolvat înainte de închiderea perioadei.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={reconciliation?.status === 'ok' ? 'success' : reconciliation?.status === 'danger' ? 'danger' : 'warning'}>
              {reconciliation?.status === 'ok' ? 'Totul arată bine' : 'Verifică'}
            </Badge>
            <DropdownMenu
              align="right"
              label="Actiuni"
              items={[
                { label: 'Export reconciliere Excel', onClick: exportReconciliation },
                { label: 'Facturi intrare', to: '/contabilitate/facturi-intrare' },
                { label: 'Facturi iesire', to: '/contabilitate/facturi-iesire' },
                { label: 'Trezorerie', to: '/contabilitate/trezorerie' },
                { label: 'Inchidere luna', to: `/contabilitate/inchidere-luna?luna=${month}` },
              ]}
            />
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(reconciliation?.checks || []).map(check => (
            <Link
              key={check.key}
              to={check.link || '/contabilitate'}
              className={`rounded-md border p-3 transition hover:-translate-y-0.5 hover:shadow-sm ${check.severity === 'ok' ? 'border-emerald-200 bg-emerald-50' : check.severity === 'danger' ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-slate-900">{check.label}</div>
                <Badge tone={check.severity === 'ok' ? 'success' : check.severity === 'danger' ? 'danger' : 'warning'}>{check.value}</Badge>
              </div>
              <div className="mt-2 text-xs text-slate-600">{check.message}</div>
            </Link>
          ))}
        </div>
        <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">De lucrat acum</div>
          {actionableIssues.length ? (
            <div className="divide-y divide-slate-100">
              {actionableIssues.map((issue, index) => (
                <div key={`${issue.group}-${issue.uuid || issue.id}-${index}`} className="grid gap-2 px-3 py-2 text-sm hover:bg-slate-50 md:grid-cols-[170px_minmax(160px,1fr)_140px_minmax(200px,1.5fr)_120px] md:items-center">
                  <div className="font-semibold text-slate-700">{issue.group}</div>
                  <div className="text-slate-900">{issue.document || issue.id} <span className="text-slate-500">{issue.data || ''}</span></div>
                  <div className="font-semibold text-slate-900">{issue.rest !== null && issue.rest !== undefined ? formatMoney(issue.rest) : issue.suma !== undefined ? formatMoney(issue.suma) : issue.difference !== undefined ? formatMoney(issue.difference) : ''}</div>
                  <div className="text-slate-600">{issue.action}</div>
                  <div className="flex md:justify-end">
                    <DropdownMenu align="right" label="Actiuni" items={issueActionMenu(issue)} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-3 py-5 text-sm text-slate-500">Nu sunt probleme contabile evidente pentru luna selectată.</div>
          )}
        </div>
      </Card>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Verificare rapidă</h3>
            <p className="text-sm text-slate-500">Prerechizite pentru facturi, trezorerie, registru jurnal și balanță.</p>
          </div>
          <Badge tone={health?.status === 'ok' ? 'success' : 'warning'}>{health?.status === 'ok' ? 'OK' : 'Necesită atenție'}</Badge>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {(health?.checks || []).map(check => (
            <div key={check.key} className={`rounded-md border p-3 ${check.ok ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-slate-900">{check.label}</div>
                <Badge tone={check.ok ? 'success' : 'warning'}>{check.ok ? 'OK' : 'Verifică'}</Badge>
              </div>
              <div className="mt-1 text-sm font-medium text-slate-700">{check.value}</div>
              <div className="mt-2 text-xs text-slate-600">{check.message}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" to="/contabilitate/plan-conturi">Plan de conturi</Link>
          <Link className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" to="/contabilitate/furnizori">Furnizori</Link>
          <Link className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" to="/contabilitate/clienti">Clienți</Link>
          <Link className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" to={`/contabilitate/balanta?luna=${month}`}>Balanță</Link>
        </div>
      </Card>
    </AccountingShell>
  )
}

export default ContabilitateDashboard
