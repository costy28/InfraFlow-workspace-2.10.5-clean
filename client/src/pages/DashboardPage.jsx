import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import api from '../api/client'
import Badge from '../components/ui/Badge'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import { useAuth } from '../hooks/useAuth'

const emptyState = {
  daily: null,
  production7: [],
  stockOperations: [],
  fleetAssets: [],
  inboxDocuments: [],
  tickets: [],
  projects: [],
  audit: [],
  weather: null,
  commandCenter: null,
  contractsDashboard: null,
  contractsTasks: [],
  hrStats: null,
  leaveRequests: [],
  accountingSummary: null,
}

const routes = {
  stock: '/stocuri',
  production: '/productie',
  fleet: '/flota',
  referate: '/referate',
  mecanizare: '/mecanizare',
  hr: '/hr',
  controlling: '/controlling',
  documents: '/documente',
  tickets: '/sesizari',
  projects: '/teren',
  audit: '/setari',
  snow: '/deszapezire',
  contracts: '/contracte',
  accounting: '/contabilitate',
}

function localDate(date) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

function lastDays(count) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date()
    date.setDate(date.getDate() - (count - 1 - index))
    return localDate(date)
  })
}

function isSnowSeason(date = new Date()) {
  const month = date.getMonth() + 1
  const day = date.getDate()
  return (month === 11 && day >= 15) ||
    month === 12 ||
    month === 1 ||
    month === 2 ||
    month === 3 ||
    (month === 4 && day <= 15)
}

function arrayFrom(data, keys) {
  if (Array.isArray(data)) return data
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key]
  }
  return []
}

function numberFrom(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function percent(value) {
  return Math.max(0, Math.min(100, numberFrom(value)))
}

function statusText(status) {
  return String(status || 'necunoscut').replaceAll('_', ' ')
}

function displayText(value, fallback = '') {
  if (value == null || value === '') return fallback
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return value.map(item => displayText(item)).filter(Boolean).join(', ')
  }
  if (typeof value === 'object') {
    return displayText(
      value.message || value.title || value.titlu || value.name || value.Entity || value.entity || value.details || value.detalii,
      JSON.stringify(value)
    )
  }
  return fallback
}

function priorityTone(priority) {
  if (['critica', 'urgent', 'urgenta'].includes(String(priority))) return 'danger'
  if (['ridicata', 'mare'].includes(String(priority))) return 'warning'
  return 'neutral'
}

function assetIsActive(asset) {
  const status = String(asset.status || asset.stare || '').toLowerCase()
  return ['activ', 'active', 'in_lucru', 'ocupat', 'disponibil', 'available'].includes(status)
}

function projectName(project) {
  return project.denumire || project.name || project.titlu || project.cod || `Proiect #${project.id}`
}

function compactIdentity(user) {
  return [
    user?.role,
    user?.role_name,
    user?.rol,
    user?.department,
    user?.department_name,
    user?.departament,
    user?.username,
  ].filter(Boolean).join(' ').toLowerCase()
}

function dashboardProfile(user) {
  const identity = compactIdentity(user)
  if (['superadmin', 'admin', 'director', 'manager'].some(token => identity.includes(token))) {
    return {
      key: 'executive',
      label: 'Profil executiv',
      domains: ['contracts', 'documents', 'tickets', 'stocks', 'projects', 'hr', 'accounting'],
      hint: 'Vezi blocajele care pot opri operațiunea sau decizia.',
    }
  }
  if (identity.includes('hr') || identity.includes('resurse') || identity.includes('uman')) {
    return {
      key: 'hr',
      label: 'Profil HR',
      domains: ['hr', 'documents', 'contracts'],
      hint: 'Prioritate pe oameni, cereri, documente și dosare.',
    }
  }
  if (identity.includes('contab') || identity.includes('financ') || identity.includes('economic')) {
    return {
      key: 'accounting',
      label: 'Profil financiar extins',
      domains: ['accounting', 'documents', 'contracts', 'hr', 'stocks'],
      hint: 'Contabilitatea vede semnalele financiare și datele operaționale care ajung în contabilitate.',
    }
  }
  if (identity.includes('achiz') || identity.includes('procurement') || identity.includes('jurid')) {
    return {
      key: 'procurement',
      label: 'Profil achiziții',
      domains: ['contracts', 'documents', 'stocks'],
      hint: 'Prioritate pe contracte, documente și aprovizionare.',
    }
  }
  if (identity.includes('mecan') || identity.includes('flot') || identity.includes('teren') || identity.includes('operat')) {
    return {
      key: 'operations',
      label: 'Profil operațional',
      domains: ['tickets', 'stocks', 'projects'],
      hint: 'Prioritate pe teren, sesizări și resurse operaționale.',
    }
  }
  return {
    key: 'general',
    label: 'Profil general',
    domains: ['documents', 'tickets', 'contracts', 'stocks', 'projects'],
    hint: 'Priorități generale din modulele disponibile.',
  }
}

function projectProgress(project) {
  return percent(
    project.progress?.progres_fizic_procent ??
    project.progres_fizic_procent ??
    project.progressPercent ??
    project.progress ??
    0
  )
}

function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-md bg-slate-200 ${className}`} />
}

function SectionError({ error }) {
  if (!error) return null
  return (
    <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
      Nu am putut incarca datele. Verifica API-ul sau permisiunile.
    </div>
  )
}

function KpiCard({ icon, label, value, loading, error, onClick }) {
  return (
    <button className="min-w-0 text-left" onClick={onClick}>
      <Card className="h-full border-slate-200/90 transition hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-md">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
            {loading ? <Skeleton className="mt-3 h-8 w-16" /> : (
              <div className="mt-1 text-2xl font-bold text-slate-950">{value}</div>
            )}
          </div>
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-panel)] border border-primary-100 bg-primary-50 text-lg">
            {icon}
          </div>
        </div>
        {error ? <p className="mt-3 text-xs text-rose-600">Date indisponibile.</p> : null}
      </Card>
    </button>
  )
}

function DirectorDemoPanel({ user, onNavigate, onResetDemo, resettingDemo }) {
  const canResetDemo = user?.username === 'demo' || user?.role === 'superadmin'
  const steps = [
    { label: 'Referat la director', value: 'Motorina utilaje', route: routes.referate, action: 'Aprobă' },
    { label: 'Mecanizare', value: 'Alocări și alerte', route: routes.mecanizare, action: 'Vezi parc' },
    { label: 'HR', value: 'Pontaj, CO, scadențe', route: routes.hr, action: 'Vezi HR' },
    { label: 'Controlling', value: 'Bugete și costuri', route: routes.controlling, action: 'Vezi costuri' },
  ]
  const checklist = [
    'Director: aprobă referatul RA/122',
    'Șef mecanizare: trimite foaia FP-2026-KIOSK-001',
    'Șofer: completează verso din Kiosk mobil',
    'Mecanizare: vede foaia completată și o închide'
  ]

  return (
    <Card className="border-primary-200 bg-gradient-to-br from-primary-50 via-white to-slate-50">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-primary-700">Demo director</div>
          <h3 className="mt-1 text-lg font-bold text-slate-900">Flux rapid pentru prezentare</h3>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Contul director vede exact zona de decizie: aprobări, alerte operaționale, oameni și costuri.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => onNavigate(routes.referate)}>Deschide referatele</Button>
          {canResetDemo ? (
            <Button variant="secondary" disabled={resettingDemo} onClick={onResetDemo}>
              {resettingDemo ? 'Se resetează...' : 'Resetează demo'}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {steps.map(step => (
          <button
            key={step.label}
            className="rounded-[var(--radius-panel)] border border-slate-100 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-md"
            onClick={() => onNavigate(step.route)}
          >
            <div className="text-xs font-semibold uppercase text-slate-500">{step.label}</div>
            <div className="mt-1 min-h-10 text-sm font-semibold text-slate-900">{step.value}</div>
            <div className="mt-3 text-xs font-semibold text-primary-700">{step.action}</div>
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-2 rounded-[var(--radius-panel)] border border-primary-100 bg-white/75 p-3 text-sm text-slate-700 md:grid-cols-4">
        {checklist.map((item, index) => (
          <div key={item} className="flex items-start gap-2">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary-600 text-[11px] font-bold text-white">{index + 1}</span>
            <span>{item}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function hoursLabel(h) {
  if (h == null) return '—'
  if (h < 1) return '<1h'
  if (h < 24) return `${Math.round(h)}h`
  return `${Math.floor(h / 24)}z ${Math.round(h % 24)}h`
}

function CommandCenterPanel({ data, loading, error, onNavigate }) {
  const cc = data?.commandCenter
  const blocked = cc?.documentsBlocked || []
  const unassigned = cc?.ticketsUnassigned || []
  const critical = cc?.ticketsCritical || []
  const unread = cc?.counts?.unreadMessages ?? cc?.unreadMessages ?? 0

  const hasAlerts = blocked.length > 0 || unassigned.length > 0 || critical.length > 0

  if (!loading && !hasAlerts && !error) return null

  return (
    <div className="rounded-[var(--radius-panel)] border border-rose-300 bg-rose-50/70 p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🚨</span>
          <div>
            <h3 className="text-base font-bold uppercase tracking-wide text-rose-800">Centru de Comandă</h3>
            <p className="text-xs text-rose-600">Situații care necesită atenție imediată</p>
          </div>
        </div>
        {!loading && (
          <div className="flex gap-2">
            {blocked.length > 0 && (
              <span className="rounded-full bg-rose-200 px-3 py-0.5 text-xs font-semibold text-rose-800">
                {blocked.length} doc. blocate
              </span>
            )}
            {unassigned.length > 0 && (
              <span className="rounded-full bg-amber-200 px-3 py-0.5 text-xs font-semibold text-amber-800">
                {unassigned.length} sesiz. neasignate
              </span>
            )}
            {unread > 0 && (
              <span className="rounded-full bg-sky-200 px-3 py-0.5 text-xs font-semibold text-sky-800">
                {unread} mesaje necitite
              </span>
            )}
          </div>
        )}
      </div>

      <SectionError error={error} />

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Documente blocate */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-semibold text-rose-700">📄 Documente blocate (&gt;48h fără acțiune)</span>
            </div>
            {blocked.length === 0 ? (
              <p className="rounded-md border border-dashed border-rose-200 py-4 text-center text-xs text-rose-400">
                Niciun document blocat ✓
              </p>
            ) : (
              <div className="grid gap-1.5">
                {blocked.slice(0, 5).map(doc => (
                  <button
                    key={doc.id || doc.uuid}
                    onClick={() => onNavigate('/documente')}
                    className="flex items-center justify-between gap-2 rounded-md border border-rose-200 bg-white px-3 py-2 text-left transition hover:border-rose-400 hover:shadow-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium text-slate-800">
                        {doc.nr_document || doc.titlu || `Doc #${doc.id}`}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {doc.tip_document || doc.type || 'document'} · {doc.departament || ''}
                      </div>
                    </div>
                    <span className="shrink-0 rounded bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                      {hoursLabel(doc.hoursBlocked)}
                    </span>
                  </button>
                ))}
                {blocked.length > 5 && (
                  <button
                    onClick={() => onNavigate('/documente')}
                    className="text-xs text-rose-600 hover:underline"
                  >
                    + {blocked.length - 5} mai multe →
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Tickets fără responsabil */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-semibold text-amber-700">🎫 Sesizări fără responsabil (&gt;4h)</span>
            </div>
            {unassigned.length === 0 && critical.length === 0 ? (
              <p className="rounded-md border border-dashed border-amber-200 py-4 text-center text-xs text-amber-400">
                Toate sesizările au responsabil ✓
              </p>
            ) : (
              <div className="grid gap-1.5">
                {critical.slice(0, 3).map(ticket => (
                  <button
                    key={ticket.uuid || ticket.id}
                    onClick={() => onNavigate('/sesizari')}
                    className="flex items-center justify-between gap-2 rounded-md border border-rose-200 bg-white px-3 py-2 text-left transition hover:border-rose-400 hover:shadow-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium text-slate-800">
                        {ticket.titlu || ticket.title || `Sesizare #${ticket.id}`}
                      </div>
                      <div className="text-[11px] text-rose-600 font-semibold">
                        ⚠ {ticket.prioritate || ticket.priority || 'critica'}
                      </div>
                    </div>
                    <span className="shrink-0 rounded bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                      {hoursLabel(ticket.hoursOpen)}
                    </span>
                  </button>
                ))}
                {unassigned.slice(0, 4).map(ticket => (
                  <button
                    key={ticket.uuid || ticket.id}
                    onClick={() => onNavigate('/sesizari')}
                    className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-white px-3 py-2 text-left transition hover:border-amber-400 hover:shadow-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium text-slate-800">
                        {ticket.titlu || ticket.title || `Sesizare #${ticket.id}`}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Fără responsabil · {ticket.departament || ''}
                      </div>
                    </div>
                    <span className="shrink-0 rounded bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                      {hoursLabel(ticket.hoursOpen)}
                    </span>
                  </button>
                ))}
                {(unassigned.length + critical.length) > 7 && (
                  <button
                    onClick={() => onNavigate('/sesizari')}
                    className="text-xs text-amber-600 hover:underline"
                  >
                    + {unassigned.length + critical.length - 7} mai multe →
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MiniTable({ columns, rows, empty }) {
  if (!rows.length) return <p className="py-6 text-sm text-slate-500">{empty}</p>
  return (
    <div className="overflow-hidden rounded-md border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
          <tr>
            {columns.map(column => <th key={column.key} className="px-3 py-2">{column.label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr key={row.id || row.uuid || index}>
              {columns.map(column => (
                <td key={column.key} className="px-3 py-2 text-slate-700">
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function buildTodayActions(view, profile = dashboardProfile(null)) {
  const actions = []
  const contractRiskTotal = numberFrom(view.contractsDashboard?.risk_summary?.total)
  const contractAlerts = arrayFrom(view.contractsDashboard, ['alerts'])
  const contractTasksOpen = view.contractsTasks.filter(task => !['done', 'rezolvat', 'closed', 'inchis'].includes(String(task.status || '').toLowerCase()))
  const contractTasksOverdue = contractTasksOpen.filter(task => {
    const due = task.due_date || task.scadenta || task.deadline
    return due && new Date(due) < new Date()
  })
  const leaveRequestsPending = view.leaveRequests.filter(request => ['cerut', 'pending', 'in_asteptare', 'solicitat'].includes(String(request.status || '').toLowerCase()))

  if (view.inboxDocuments.length) {
    actions.push({
      key: 'documents',
      domain: 'documents',
      icon: '📋',
      tone: 'warning',
      weight: 90,
      title: `${view.inboxDocuments.length} documente de aprobat`,
      description: 'Ai documente în inbox care pot bloca fluxuri interne dacă rămân acolo.',
      route: routes.documents,
      cta: 'Deschide inbox',
    })
  }

  if (contractRiskTotal || contractTasksOverdue.length || contractAlerts.length) {
    const details = [
      contractRiskTotal ? `${contractRiskTotal} contracte cu risc` : null,
      contractTasksOverdue.length ? `${contractTasksOverdue.length} task-uri întârziate` : null,
      contractAlerts.length ? `${contractAlerts.length} alerte` : null,
    ].filter(Boolean).join(' · ')
    actions.push({
      key: 'contracts',
      domain: 'contracts',
      icon: '📑',
      tone: contractTasksOverdue.length || contractRiskTotal ? 'danger' : 'warning',
      weight: contractTasksOverdue.length || contractRiskTotal ? 100 : 80,
      title: 'Contracte care cer atenție',
      description: details || 'Există semnale operaționale pe portofoliul de contracte.',
      route: routes.contracts,
      cta: 'Vezi contracte',
    })
  } else if (contractTasksOpen.length) {
    actions.push({
      key: 'contract_tasks',
      domain: 'contracts',
      icon: '🧭',
      tone: 'info',
      weight: 55,
      title: `${contractTasksOpen.length} task-uri contractuale deschise`,
      description: 'Sunt lucruri de închis în dosarele de contract, chiar dacă nu sunt urgente.',
      route: routes.contracts,
      cta: 'Vezi task-uri',
    })
  }

  if (view.tickets.length) {
    const urgentTickets = view.tickets.filter(ticket => ['critica', 'critic', 'urgent', 'urgenta'].includes(String(ticket.prioritate || ticket.priority || '').toLowerCase()))
    actions.push({
      key: 'tickets',
      domain: 'tickets',
      icon: '🎫',
      tone: urgentTickets.length ? 'danger' : 'warning',
      weight: urgentTickets.length ? 95 : 70,
      title: urgentTickets.length ? `${urgentTickets.length} sesizări urgente` : `${view.tickets.length} sesizări deschise`,
      description: urgentTickets.length ? 'Prioritățile critice trebuie repartizate sau închise rapid.' : 'Există sesizări active care merită verificate azi.',
      route: routes.tickets,
      cta: 'Deschide sesizări',
    })
  }

  if (view.criticalStocks.length) {
    actions.push({
      key: 'stocks',
      domain: 'stocks',
      icon: '📦',
      tone: 'warning',
      weight: 65,
      title: `${view.criticalStocks.length} materiale sub minim`,
      description: 'Stocurile critice pot genera întârzieri în operațiuni, producție sau servicii.',
      route: routes.stock,
      cta: 'Vezi stocuri',
    })
  }

  if (leaveRequestsPending.length) {
    actions.push({
      key: 'hr_leave',
      domain: 'hr',
      icon: '🌴',
      tone: 'warning',
      weight: 78,
      title: `${leaveRequestsPending.length} cereri HR în așteptare`,
      description: 'Cereri de concediu sau absență care au nevoie de verificare/aprobare.',
      route: routes.hr,
      cta: 'Deschide HR',
    })
  }

  if (view.accountingSummary?.status && String(view.accountingSummary.status).toLowerCase() !== 'ok') {
    actions.push({
      key: 'accounting_status',
      domain: 'accounting',
      icon: '💰',
      tone: 'warning',
      weight: 72,
      title: 'Contabilitate necesită verificare',
      description: displayText(view.accountingSummary.message || view.accountingSummary.status, 'Există semnale financiare care merită verificate.'),
      route: routes.accounting,
      cta: 'Vezi contabilitate',
    })
  }

  if (profile.key === 'accounting') {
    const upstreamSignals = [
      leaveRequestsPending.length ? `${leaveRequestsPending.length} cereri HR` : null,
      view.criticalStocks.length ? `${view.criticalStocks.length} stocuri critice` : null,
      contractRiskTotal ? `${contractRiskTotal} contracte cu risc` : null,
      contractTasksOpen.length ? `${contractTasksOpen.length} task-uri contracte` : null,
    ].filter(Boolean)
    if (upstreamSignals.length) {
      actions.push({
        key: 'accounting_upstream',
        domain: 'accounting',
        icon: '🧾',
        tone: 'info',
        weight: 74,
        title: 'Date operaționale pentru contabilitate',
        description: `Semnale din modulele care alimentează contabilitatea: ${upstreamSignals.join(' · ')}.`,
        route: routes.accounting,
        cta: 'Vezi sinteză',
      })
    }
  }

  if (!view.projects.length) {
    actions.push({
      key: 'projects_empty',
      domain: 'projects',
      icon: '🗺️',
      tone: 'info',
      weight: 20,
      title: 'Nu există proiecte active afișate',
      description: 'Poți porni sau importa proiecte pentru urmărire de teren, costuri și execuție.',
      route: routes.projects,
      cta: 'Vezi teren',
    })
  }

  return actions
    .map(action => {
      const focused = profile.domains?.includes(action.domain)
      const isCritical = action.tone === 'danger'
      return {
        ...action,
        focused,
        weight: action.weight + (focused ? 25 : isCritical ? 10 : -20),
      }
    })
    .filter(action => profile.key === 'executive' || profile.key === 'general' || action.focused || action.tone === 'danger')
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 6)
}

function TodayActionsPanel({ actions, profile, loading, error, onNavigate }) {
  return (
    <Card className="border-primary-100 bg-gradient-to-br from-white via-primary-50/40 to-slate-50">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-primary-700">Priorități</div>
          <h3 className="mt-1 text-lg font-bold text-slate-900">Ce ai de făcut azi</h3>
          <p className="mt-1 text-sm text-slate-600">
            {profile?.hint || 'Semnale agregate din modulele active, ca să nu cauți manual prin aplicație.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {profile?.label ? <Badge tone="info">{profile.label}</Badge> : null}
          {!loading && actions.length ? <Badge tone={actions[0].tone}>{actions.length} recomandări</Badge> : null}
        </div>
      </div>

      <SectionError error={error} />

      {loading ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map(item => <Skeleton key={item} className="h-28" />)}
        </div>
      ) : actions.length ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {actions.map(action => (
            <button
              key={action.key}
              className="rounded-[var(--radius-panel)] border border-slate-100 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-md"
              onClick={() => onNavigate(action.route)}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-xl">{action.icon}</span>
                <Badge tone={action.tone} size="sm">{action.tone === 'danger' ? 'urgent' : action.tone === 'warning' ? 'atenție' : 'info'}</Badge>
              </div>
              <div className="mt-3 text-sm font-semibold text-slate-900">{action.title}</div>
              <p className="mt-1 min-h-10 text-xs text-slate-500">{action.description}</p>
              <div className="mt-3 text-xs font-semibold text-primary-700">{action.cta} →</div>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-[var(--radius-panel)] border border-primary-100 bg-white px-4 py-5 text-sm text-primary-800">
          ✅ Nu apar blocaje evidente azi. Portofoliul arată curat; poți continua cu lucru planificat sau verificări de rutină.
        </div>
      )}
    </Card>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [data, setData] = useState(emptyState)
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState({})
  const [resettingDemo, setResettingDemo] = useState(false)
  const [demoMessage, setDemoMessage] = useState('')
  const snowSeason = isSnowSeason()

  async function resetDemo() {
    if (!window.confirm('Resetezi datele demo la starea initiala pentru prezentare?')) return
    setResettingDemo(true)
    setDemoMessage('')
    try {
      await api.post('/demo-reset')
      setDemoMessage('Demo resetat. Reîncarc pagina cu date curate...')
      window.setTimeout(() => window.location.reload(), 700)
    } catch (err) {
      setDemoMessage(err.response?.data?.error || 'Resetul demo nu a reușit.')
      setResettingDemo(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function loadDashboard() {
      setLoading(true)
      const dates = lastDays(7)
      const requests = {
        daily: api.get('/daily-report'),
        stockOperations: api.get('/stock-operations'),
        fleetAssets: api.get('/fleet-assets'),
        inboxDocuments: api.get('/documents/inbox'),
        tickets: api.get('/tickets/my-open'),
        projects: api.get('/field/projects'),
        audit: api.get('/audit'),
        production7: Promise.allSettled(dates.map(date => api.get(`/daily-report?date=${date}`))),
        weather: snowSeason ? api.get('/snow-removal/weather') : Promise.resolve({ data: null }),
        commandCenter: api.get('/dashboard/command-center'),
        contractsDashboard: api.get('/contracts/dashboard'),
        contractsTasks: api.get('/contracts/tasks'),
        hrStats: api.get('/hr/stats'),
        leaveRequests: api.get('/hr/leave-requests'),
        accountingSummary: api.get('/accounting/summary'),
      }

      const entries = await Promise.all(
        Object.entries(requests).map(async ([key, promise]) => {
          try {
            const response = await promise
            return [key, response.data, null]
          } catch (error) {
            return [key, null, error]
          }
        })
      )

      if (cancelled) return

      const nextData = { ...emptyState }
      const nextErrors = {}
      for (const [key, value, error] of entries) {
        if (error) nextErrors[key] = error
        nextData[key] = value
      }

      nextData.production7 = dates.map((date, index) => {
        const settled = nextData.production7?.[index]
        const report = settled?.status === 'fulfilled' ? settled.value.data?.report : null
        if (settled?.status === 'rejected') nextErrors.production7 = settled.reason
        return {
          date: date.slice(5),
          tone: numberFrom(report?.metrics?.asphaltTotal ?? report?.asphaltTotal),
        }
      })

      setData(nextData)
      setErrors(nextErrors)
      setLoading(false)
    }

    loadDashboard()
    return () => {
      cancelled = true
    }
  }, [snowSeason])

  const view = useMemo(() => {
    const report = data.daily?.report || {}
    const criticalStocks = report.criticalStocks || []
    const fleetAssets = arrayFrom(data.fleetAssets, ['assets', 'fleetAssets'])
    const inboxDocuments = arrayFrom(data.inboxDocuments, ['documents', 'items'])
    const tickets = arrayFrom(data.tickets, ['tickets', 'items'])
    const projects = arrayFrom(data.projects, ['projects', 'items'])
    const audit = arrayFrom(data.audit, ['audit', 'items'])
    const stockOperations = arrayFrom(data.stockOperations, ['movements', 'operations', 'items'])
    const contractsTasks = arrayFrom(data.contractsTasks, ['tasks', 'items'])
    const leaveRequests = arrayFrom(data.leaveRequests, ['requests', 'leaveRequests', 'items'])
    const profile = dashboardProfile(user)

    const nextView = {
      criticalStocks,
      operationalOutputToday: numberFrom(report.metrics?.asphaltTotal ?? report.asphaltTotal),
      activeAssets: fleetAssets.filter(assetIsActive).length,
      inboxDocuments,
      tickets,
      projects,
      audit,
      stockOperations,
      contractsDashboard: data.contractsDashboard || {},
      contractsTasks,
      hrStats: data.hrStats || {},
      leaveRequests,
      accountingSummary: data.accountingSummary || {},
    }
    return {
      ...nextView,
      profile,
      todayActions: buildTodayActions(nextView, profile),
    }
  }, [data, user])

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Dashboard operational</h2>
          <p className="text-sm text-slate-500">Indicatori rapizi din operațiuni, stocuri, echipe, flotă și documente.</p>
        </div>
        <Badge tone="success">Live API</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon="📦"
          label="Stoc materiale critice"
          value={view.criticalStocks.length}
          loading={loading}
          error={errors.daily || errors.stockOperations}
          onClick={() => navigate(routes.stock)}
        />
        <KpiCard
          icon="🏭"
          label="Output operațional azi"
          value={view.operationalOutputToday.toLocaleString('ro-RO')}
          loading={loading}
          error={errors.daily}
          onClick={() => navigate(routes.production)}
        />
        <KpiCard
          icon="🚗"
          label="Utilaje active azi"
          value={view.activeAssets}
          loading={loading}
          error={errors.fleetAssets}
          onClick={() => navigate(routes.fleet)}
        />
        <KpiCard
          icon="📋"
          label="Documente de aprobat"
          value={view.inboxDocuments.length}
          loading={loading}
          error={errors.inboxDocuments}
          onClick={() => navigate(routes.documents)}
        />
      </div>

      {demoMessage ? <div className="rounded-md border border-primary-100 bg-primary-50 px-3 py-2 text-sm text-primary-700">{demoMessage}</div> : null}

      <TodayActionsPanel
        actions={view.todayActions}
        profile={view.profile}
        loading={loading}
        onNavigate={navigate}
      />

      {user?.username === 'director' || user?.username === 'demo' || ['manager', 'superadmin'].includes(user?.role) ? (
        <DirectorDemoPanel user={user} onNavigate={navigate} onResetDemo={resetDemo} resettingDemo={resettingDemo} />
      ) : null}

      <CommandCenterPanel
        data={data}
        loading={loading}
        error={errors.commandCenter}
        onNavigate={navigate}
      />

      <Card className="cursor-pointer" onClick={() => navigate(routes.projects)}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Proiecte / lucrări active</h3>
          <Badge>{view.projects.length} active</Badge>
        </div>
        <SectionError error={errors.projects} />
        {loading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map(item => <Skeleton key={item} className="h-24" />)}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {view.projects.length ? view.projects.slice(0, 6).map(project => {
              const progress = projectProgress(project)
              return (
                <div key={project.id || project.uuid || project.cod} className="rounded-md border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">{projectName(project)}</div>
                      <div className="text-xs text-slate-500">{project.status || 'activ'}</div>
                    </div>
                    <span className="text-sm font-semibold text-primary-700">{progress}%</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-primary-600" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )
            }) : <p className="text-sm text-slate-500">Nu există proiecte sau lucrări active de afișat.</p>}
          </div>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="cursor-pointer" onClick={() => navigate(routes.production)}>
          <h3 className="mb-4 text-base font-semibold text-slate-900">Grafic output operațional ultimele 7 zile</h3>
          <SectionError error={errors.production7} />
          {loading ? <Skeleton className="h-72" /> : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.production7}>
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="tone" stroke="#0F6E56" strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="cursor-pointer" onClick={() => navigate(routes.tickets)}>
          <h3 className="mb-4 text-base font-semibold text-slate-900">Sesizări recente</h3>
          <SectionError error={errors.tickets} />
          {loading ? (
            <div className="grid gap-2">{[1, 2, 3, 4].map(item => <Skeleton key={item} className="h-12" />)}</div>
          ) : (
            <div className="grid gap-2">
              {view.tickets.length ? view.tickets.slice(0, 6).map(ticket => (
                <div key={ticket.uuid || ticket.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-900">{ticket.titlu || ticket.title}</div>
                    <div className="text-xs text-slate-500">{statusText(ticket.status)}</div>
                  </div>
                  <Badge tone={priorityTone(ticket.prioritate)}>{ticket.prioritate || 'normal'}</Badge>
                </div>
              )) : <p className="text-sm text-slate-500">Nu ai sesizări deschise.</p>}
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="cursor-pointer" onClick={() => navigate(routes.stock)}>
          <h3 className="mb-4 text-base font-semibold text-slate-900">Stocuri critice</h3>
          <MiniTable
            rows={loading ? [] : view.criticalStocks.slice(0, 8)}
            empty={loading ? 'Se incarca...' : 'Nu exista materiale sub minim.'}
            columns={[
              { key: 'materialName', label: 'Material' },
              { key: 'stock', label: 'Stoc', render: row => `${row.stock} ${row.unit || ''}` },
              { key: 'alert', label: 'Minim' },
            ]}
          />
        </Card>

        <Card className="cursor-pointer" onClick={() => navigate(routes.documents)}>
          <h3 className="mb-4 text-base font-semibold text-slate-900">Documente în așteptare</h3>
          <div className="grid gap-2">
            {loading ? [1, 2, 3].map(item => <Skeleton key={item} className="h-11" />) : (
              view.inboxDocuments.length ? view.inboxDocuments.slice(0, 8).map(document => (
                <div key={document.uuid || document.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2">
                  <span className="truncate text-sm font-medium text-slate-900">{document.nr_document || document.titlu}</span>
                  <Badge tone="warning">{statusText(document.status)}</Badge>
                </div>
              )) : <p className="text-sm text-slate-500">Nu sunt documente de aprobat.</p>
            )}
          </div>
        </Card>

        <Card className="cursor-pointer" onClick={() => navigate(routes.audit)}>
          <h3 className="mb-4 text-base font-semibold text-slate-900">Activitate recentă</h3>
          <SectionError error={errors.audit} />
          <div className="grid gap-2">
            {loading ? [1, 2, 3, 4].map(item => <Skeleton key={item} className="h-10" />) : (
              view.audit.length ? view.audit.slice(0, 10).map((item, index) => (
                <div key={item.id || index} className="min-w-0 overflow-hidden rounded-md border border-slate-200 px-3 py-2">
                  <div className="truncate text-sm font-medium text-slate-900">{displayText(item.action || item.actiune, 'actiune')}</div>
                  <div className="truncate break-all text-xs text-slate-500">{displayText(item.details || item.detalii || item.userName || item.user)}</div>
                </div>
              )) : <p className="text-sm text-slate-500">Nu exista activitate recenta.</p>
            )}
          </div>
        </Card>
      </div>

      {snowSeason ? (
        <Card className="cursor-pointer border-sky-200 bg-sky-50/50" onClick={() => navigate(routes.snow)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">❄️ Deszăpezire</h3>
              <p className="text-sm text-slate-600">Meteo curent și recomandare intervenție</p>
            </div>
            {loading ? <Skeleton className="h-8 w-32" /> : (
              <Badge tone={data.weather?.recomandare?.culoare === 'rosu' ? 'danger' : 'success'}>
                {data.weather?.recomandare?.tip || 'indisponibil'}
              </Badge>
            )}
          </div>
          <SectionError error={errors.weather} />
          {!loading && data.weather ? (
            <div className="mt-4 grid gap-3 text-sm text-slate-700 md:grid-cols-4">
              <div><span className="text-slate-500">Temperatura</span><br />{data.weather.current?.temperature_2m ?? data.weather.temperature_2m ?? '-'}°C</div>
              <div><span className="text-slate-500">Precipitații</span><br />{data.weather.current?.precipitation ?? data.weather.precipitation ?? 0} mm</div>
              <div><span className="text-slate-500">Ninsoare</span><br />{data.weather.current?.snowfall ?? data.weather.snowfall ?? 0} mm</div>
              <div><span className="text-slate-500">Motiv</span><br />{data.weather.recomandare?.motiv || 'Nu exista recomandare.'}</div>
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  )
}
