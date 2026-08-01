import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../api/client'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import { AccountingShell, Info, Table, statusTone } from './accounting-shared'

const alertTypeLabels = {
  fiscal: 'Fiscal',
  tva: 'TVA',
  declaratii: 'Declarații',
  salarizare: 'Salarizare',
  contabilitate: 'Contabilitate',
  achizitii: 'Achiziții',
  hr: 'HR',
  altul: 'Altul',
}

function alertTypeLabel(type) {
  return alertTypeLabels[String(type || '').toLowerCase()] || type || 'Altul'
}

function alertTone(row) {
  if (row.status === 'implementat') return 'success'
  if (row.status === 'citit') return 'info'
  if (String(row.tip || '').toLowerCase().includes('tva')) return 'warning'
  if (String(row.tip || '').toLowerCase().includes('declar')) return 'warning'
  return row.status === 'nou' ? 'warning' : statusTone(row.status)
}

function buildAlertsFlow({ summary, reload, showNew, showAll, openFiscalCenter, openDeclarations, openAudit }) {
  const steps = [
    {
      key: 'inbox',
      title: 'Preia alertele noi',
      detail: summary.newCount
        ? `${summary.newCount} alerte noi cer citire și decizie. Începe cu ele, nu cu lista completă.`
        : 'Nu ai alerte noi în lista curentă.',
      status: summary.newCount ? 'de citit' : 'ok',
      tone: summary.newCount ? 'warning' : 'success',
      active: summary.newCount === 0,
      onClick: summary.newCount ? showNew : reload,
    },
    {
      key: 'impact',
      title: 'Stabilește impactul',
      detail: summary.impactText,
      status: summary.impactCount ? 'verifică' : 'curat',
      tone: summary.impactCount ? 'warning' : 'success',
      active: summary.impactCount === 0,
      onClick: summary.impactCount ? openFiscalCenter : showAll,
    },
    {
      key: 'declarations',
      title: 'Leagă de declarații',
      detail: summary.declarationsCount
        ? `${summary.declarationsCount} alerte pot afecta D300, D112, D205, Intrastat sau dosarul fiscal.`
        : 'Nu există alerte declarative vizibile în acest moment.',
      status: summary.declarationsCount ? 'atenție' : 'ok',
      tone: summary.declarationsCount ? 'warning' : 'success',
      active: summary.declarationsCount === 0,
      onClick: summary.declarationsCount ? openDeclarations : openAudit,
    },
    {
      key: 'closure',
      title: 'Închide controlul',
      detail: summary.doneCount
        ? `${summary.doneCount} alerte sunt implementate; păstrează dovada în auditul fiscal/lunar.`
        : 'După ce operatorul aplică schimbarea, marchează alerta ca implementată.',
      status: summary.doneCount ? 'audit' : 'de finalizat',
      tone: summary.doneCount ? 'info' : 'warning',
      active: summary.openCount === 0 && summary.totalCount > 0,
      onClick: openAudit,
    },
  ]

  if (!summary.totalCount) {
    return {
      badge: 'Monitor curat',
      tone: 'success',
      title: 'Nu există alerte legislative încărcate',
      description: 'Când apar schimbări fiscale sau contabile, ele vor intra aici și vor ghida operatorul spre TVA, declarații, salarizare sau audit.',
      primaryLabel: 'Reîncarcă alertele',
      primaryAction: reload,
      steps,
    }
  }

  if (summary.newCount) {
    return {
      badge: 'Atenție',
      tone: 'warning',
      title: `${summary.newCount} alerte noi de verificat`,
      description: 'Citește alertele noi, stabilește ce modul afectează și marchează implementat doar după ce schimbarea a fost tratată.',
      primaryLabel: 'Vezi doar alertele noi',
      primaryAction: showNew,
      steps,
    }
  }

  if (summary.impactCount) {
    return {
      badge: 'Control',
      tone: 'info',
      title: 'Alertele sunt citite, urmează verificarea impactului',
      description: 'Următorul pas este să verifici dacă schimbarea afectează TVA, declarațiile, salarizarea sau închiderea lunii.',
      primaryLabel: 'Deschide centrul fiscal',
      primaryAction: openFiscalCenter,
      steps,
    }
  }

  return {
    badge: 'La zi',
    tone: 'success',
    title: 'Monitorul legislativ este la zi',
    description: 'Nu există alerte deschise în lista curentă. Poți continua cu auditul fiscal sau închiderea lunii.',
    primaryLabel: 'Deschide audit fiscal',
    primaryAction: openAudit,
    steps,
  }
}

export function AlerteLegislative() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [filter, setFilter] = useState('all')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/accounting/alerts')
      setRows(res.data.alerts || [])
    } catch (err) {
      setRows([])
      setError(err.response?.data?.error || 'Alertele legislative nu au putut fi încărcate.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function mark(row, action) {
    setSavingId(`${row.id}-${action}`)
    setError('')
    setMessage('')
    try {
      await api.patch(`/accounting/alerts/${row.id}/${action}`)
      setMessage(action === 'read' ? 'Alerta a fost marcată ca citită.' : 'Alerta a fost marcată ca implementată.')
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Statusul alertei nu a putut fi actualizat.')
    } finally {
      setSavingId('')
    }
  }

  const filteredRows = useMemo(() => {
    if (filter === 'all') return rows
    return rows.filter(row => row.status === filter)
  }, [rows, filter])

  const summary = useMemo(() => {
    const newCount = rows.filter(row => row.status === 'nou').length
    const readCount = rows.filter(row => row.status === 'citit').length
    const doneCount = rows.filter(row => row.status === 'implementat').length
    const openRows = rows.filter(row => row.status !== 'implementat')
    const fiscalRows = openRows.filter(row => {
      const text = `${row.tip || ''} ${row.afecteaza_modul || ''} ${row.titlu || ''}`.toLowerCase()
      return text.includes('tva') || text.includes('fiscal') || text.includes('declar') || text.includes('d112') || text.includes('d300')
    })
    const declarationsCount = fiscalRows.length
    const modules = [...new Set(openRows.map(row => row.afecteaza_modul || row.tip).filter(Boolean))].slice(0, 4)
    return {
      totalCount: rows.length,
      filteredCount: filteredRows.length,
      newCount,
      readCount,
      doneCount,
      openCount: openRows.length,
      impactCount: openRows.length,
      declarationsCount,
      impactText: openRows.length
        ? `Afectează ${modules.length ? modules.join(', ') : 'contabilitatea'}; verifică înainte de închiderea lunii.`
        : 'Nu există alerte deschise care să blocheze luna.',
    }
  }, [rows, filteredRows.length])

  const flow = buildAlertsFlow({
    summary,
    reload: load,
    showNew: () => setFilter('nou'),
    showAll: () => setFilter('all'),
    openFiscalCenter: () => navigate('/contabilitate/tva-d300'),
    openDeclarations: () => navigate('/contabilitate/declaratii-diverse'),
    openAudit: () => navigate('/contabilitate/audit-fiscal'),
  })

  return (
    <AccountingShell
      active="alerte"
      title="Alerte legislative"
      subtitle="Monitor de schimbări relevante pentru contabilitate, TVA, declarații și închiderea lunii."
      actions={<Button variant="secondary" onClick={load} loading={loading}>Reîncarcă</Button>}
    >
      {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge tone={flow.tone}>{flow.badge}</Badge>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Monitor legislativ simplificat</span>
            </div>
            <h3 className="text-lg font-semibold text-slate-900">{flow.title}</h3>
            <p className="mt-1 max-w-4xl text-sm text-slate-500">{flow.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => navigate('/contabilitate/inchidere-luna')}>Închidere lună</Button>
            <Button onClick={flow.primaryAction}>{flow.primaryLabel}</Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Info label="Alerte totale" value={summary.totalCount} />
          <Info label="Noi" value={summary.newCount} />
          <Info label="Citite / în lucru" value={summary.readCount} />
          <Info label="Implementate" value={summary.doneCount} />
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-4">
          {flow.steps.map((step, index) => (
            <button
              type="button"
              key={step.key}
              onClick={step.onClick}
              className={`rounded-[var(--radius-panel)] border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${
                step.active
                  ? 'border-emerald-200 bg-emerald-50'
                  : step.tone === 'warning'
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-slate-200 bg-white'
              }`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary-700 text-xs font-bold text-white">{index + 1}</span>
                <Badge tone={step.tone}>{step.status}</Badge>
              </div>
              <div className="font-semibold text-slate-900">{step.title}</div>
              <div className="mt-1 text-xs leading-5 text-slate-600">{step.detail}</div>
            </button>
          ))}
        </div>
      </Card>

      <Card density="compact">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Lista de lucru</h3>
            <p className="text-sm text-slate-500">
              {summary.filteredCount} afișate din {summary.totalCount}. Marchează „implementat” doar după ce ai verificat modulul afectat.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              ['all', `Toate (${rows.length})`],
              ['nou', `Noi (${summary.newCount})`],
              ['citit', `Citite (${summary.readCount})`],
              ['implementat', `Implementate (${summary.doneCount})`],
            ].map(([key, label]) => (
              <button
                type="button"
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                  filter === key ? 'bg-primary-700 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Table headers={['Alertă', 'Tip / modul', 'Data', 'Status', 'Acțiuni']}>
        {filteredRows.map(row => (
          <tr key={row.id} className="hover:bg-slate-50">
            <td className="px-3 py-2">
              <div className="font-semibold text-slate-900">{row.titlu}</div>
              <div className="text-xs text-slate-500">{row.descriere || 'Fără descriere suplimentară.'}</div>
              {row.sursa_url ? (
                <a className="mt-1 inline-flex text-xs font-semibold text-primary-700 hover:underline" href={row.sursa_url} target="_blank" rel="noreferrer">
                  Deschide sursa
                </a>
              ) : null}
            </td>
            <td className="px-3 py-2">
              <Badge tone={alertTone(row)}>{alertTypeLabel(row.tip)}</Badge>
              <div className="mt-1 text-xs text-slate-500">{row.afecteaza_modul || 'contabilitate'}</div>
            </td>
            <td className="px-3 py-2">{row.data_publicare || '-'}</td>
            <td className="px-3 py-2"><Badge tone={statusTone(row.status)}>{row.status || '-'}</Badge></td>
            <td className="px-3 py-2">
              <div className="flex flex-wrap gap-2">
                {row.status === 'nou' ? (
                  <Button size="sm" variant="secondary" loading={savingId === `${row.id}-read`} onClick={() => mark(row, 'read')}>Marchează citită</Button>
                ) : null}
                {row.status !== 'implementat' ? (
                  <Button size="sm" loading={savingId === `${row.id}-done`} onClick={() => mark(row, 'done')}>Implementată</Button>
                ) : null}
                <Link className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" to="/contabilitate/audit-fiscal">Audit</Link>
              </div>
            </td>
          </tr>
        ))}
      </Table>
    </AccountingShell>
  )
}

export default AlerteLegislative
