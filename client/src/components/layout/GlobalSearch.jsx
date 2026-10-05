import { Clock3, CornerDownLeft, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useSettings } from '../../hooks/useSettings'

const WORKSPACE_STORAGE_KEY = 'infraflow_workspace_tabs_v1'

const navigationItems = [
  { label: 'Dashboard', to: '/dashboard', icon: '📊', keywords: 'acasă principal indicatori' },
  { label: 'Task-uri', to: '/taskuri', icon: '✅', keywords: 'sarcini activități de făcut' },
  { label: 'Resurse Umane', to: '/hr', icon: '👥', moduleKey: 'hr', keywords: 'angajați concedii pontaj dosar' },
  { label: 'Stocuri & Depozite', to: '/gestiune', icon: '📦', moduleKey: 'inventory', keywords: 'gestiune materiale nir inventar' },
  { label: 'Producție & Operațiuni', to: '/productie', icon: '🏭', moduleKey: 'production', keywords: 'rețete plan consumuri' },
  { label: 'Flotă, Echipamente & Resurse', to: '/mecanizare', icon: '⚙️', moduleKey: 'mechanization', keywords: 'utilaje vehicule foi parcurs faz' },
  { label: 'Aprovizionare & Achiziții', to: '/achizitii', icon: '🛒', moduleKey: 'procurement', keywords: 'comenzi furnizori recepții paap' },
  { label: 'Logistică & Transport', to: '/logistica', icon: '🚚', moduleKey: 'logistics', keywords: 'aviz cmr bon transport dovadă livrare trasabilitate' },
  { label: 'Contracte', to: '/contracte', icon: '📑', moduleKey: 'contract_management', keywords: 'dosar contractual alerte consum' },
  { label: 'CRM / Vânzări', to: '/crm', icon: '🤝', moduleKey: 'crm', keywords: 'lead prospect contacte client vânzări' },
  { label: 'Lead-uri CRM', to: '/crm/leads', icon: '🎯', moduleKey: 'crm', keywords: 'solicitări oportunități calificare follow up' },
  { label: 'Prospecte și contacte', to: '/crm/clients', icon: '👤', moduleKey: 'crm', keywords: 'clienți persoane firme crm' },
  { label: 'Oferte CRM', to: '/crm/oferte', icon: '🧾', moduleKey: 'crm', keywords: 'ofertă ofertare comercială comandă proformă' },
  { label: 'Documente', to: '/documente', icon: '🗂️', moduleKey: 'documents', keywords: 'circuit inbox aprobări șabloane' },
  { label: 'Mesaje', to: '/mesaje', icon: '💬', moduleKey: 'messaging', keywords: 'chat email inbox comunicare' },
  { label: 'Solicitări & Incidente', to: '/sesizari', icon: '🎫', moduleKey: 'tickets', keywords: 'tichete suport p1 p2 p3 p4' },
  { label: 'Contabilitate', to: '/contabilitate', icon: '🏦', moduleKey: 'accounting', keywords: 'facturi fiscal balanță trezorerie' },
  { label: 'Referate & aprobări', to: '/referate', icon: '📄', moduleKey: 'referate', keywords: 'cereri interne avizare cfp' },
  { label: 'Proiecte & activitate în teren', to: '/teren', icon: '📍', moduleKey: 'field', keywords: 'șantier proiect lucrări' },
  { label: 'Setări', to: '/setari', icon: '⚙️', adminOnly: true, keywords: 'administrare utilizatori module integrare securitate' },
  { label: 'Ajutor', to: '/ajutor', icon: '❓', keywords: 'ghid suport documentație' },
]

const moduleAliases = {
  mechanization: ['mechanization', 'fleet'],
  inventory: ['inventory', 'reports'],
  accounting: ['accounting', 'contabilitate', 'anaf', 'controlling'],
  contract_management: ['contract_management', 'contracts', 'legal', 'procurement', 'accounting'],
  referate: ['referate', 'procurement'],
  crm: ['crm', 'sales', 'sales_automation'],
  logistics: ['logistics', 'procurement', 'contract_management'],
}

function normalizedText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function recentWorkspaceTabs() {
  try {
    const tabs = JSON.parse(sessionStorage.getItem(WORKSPACE_STORAGE_KEY) || '[]')
    return Array.isArray(tabs)
      ? tabs.filter(tab => tab && typeof tab.url === 'string' && typeof tab.label === 'string').slice(-6).reverse()
      : []
  } catch {
    return []
  }
}

function rankItem(item, query) {
  const label = normalizedText(item.label)
  const all = normalizedText(`${item.label} ${item.keywords || ''}`)
  if (!query) return item.recent ? 0 : 2
  if (label.startsWith(query)) return 0
  if (all.includes(query)) return 1
  return 9
}

export default function GlobalSearch({ onNavigate }) {
  const { user } = useAuth()
  const { modules } = useSettings()
  const inputRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const roles = Array.isArray(user?.roles) ? user.roles : []
  const isAdmin = ['superadmin', 'admin'].includes(user?.role) || roles.some(role => ['superadmin', 'admin'].includes(role))

  const results = useMemo(() => {
    const enabled = Array.isArray(modules) && modules.length ? new Set(modules) : null
    const visibleNavigation = navigationItems.filter(item => {
      if (item.adminOnly && !isAdmin) return false
      if (!item.moduleKey || !enabled) return true
      return (moduleAliases[item.moduleKey] || [item.moduleKey]).some(key => enabled.has(key))
    })
    const recent = recentWorkspaceTabs().map(tab => ({
      label: tab.label,
      to: tab.url,
      icon: '↗',
      keywords: 'recent filă deschisă',
      recent: true,
    }))
    const unique = [...recent, ...visibleNavigation].filter((item, index, list) => list.findIndex(candidate => candidate.to === item.to) === index)
    const normalizedQuery = normalizedText(query)
    return unique
      .map(item => ({ ...item, rank: rankItem(item, normalizedQuery) }))
      .filter(item => item.rank < 9)
      .sort((left, right) => left.rank - right.rank || left.label.localeCompare(right.label, 'ro'))
      .slice(0, 9)
  }, [isAdmin, modules, query])

  useEffect(() => {
    if (!open) return undefined
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => {
    function onKeyDown(event) {
      const shortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k'
      if (shortcut) {
        event.preventDefault()
        setOpen(current => !current)
      }
      if (!open) return
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex(current => Math.min(current + 1, Math.max(0, results.length - 1)))
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex(current => Math.max(current - 1, 0))
      }
      if (event.key === 'Enter' && results[activeIndex]) {
        event.preventDefault()
        onNavigate?.(results[activeIndex].to)
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeIndex, onNavigate, open, results])

  useEffect(() => setActiveIndex(0), [query, results.length])

  function choose(item) {
    onNavigate?.(item.to)
    setOpen(false)
  }

  return <>
    <button
      type="button"
      className="grid h-9 w-9 place-items-center rounded-[var(--radius-control)] text-slate-600 hover:bg-slate-100"
      title="Caută în InfraFlow (Ctrl+K)"
      aria-label="Caută în InfraFlow"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => setOpen(true)}
    >
      <Search size={18} />
    </button>
    {open ? <div className="fixed inset-0 z-[70] grid place-items-start bg-slate-950/35 px-3 pt-[12vh] sm:pt-[16vh]" role="presentation" onMouseDown={() => setOpen(false)}>
      <section className="w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="Caută în InfraFlow" onMouseDown={event => event.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
          <Search size={19} className="shrink-0 text-slate-400" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={event => setQuery(event.target.value)}
            className="min-w-0 flex-1 border-0 bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400"
            placeholder="Caută pagini, module sau file deschise…"
            aria-label="Căutare globală"
          />
          <button type="button" className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Închide căutarea" onClick={() => setOpen(false)}><X size={18} /></button>
        </div>
        <div className="max-h-[55vh] overflow-y-auto p-2">
          {!query ? <div className="px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Acces rapid și file recente</div> : null}
          {results.map((item, index) => (
            <button
              key={`${item.to}-${item.label}`}
              type="button"
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(item)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left ${index === activeIndex ? 'bg-primary-50 text-primary-950' : 'text-slate-700 hover:bg-slate-50'}`}
            >
              <span className="grid h-8 w-8 place-items-center rounded-md bg-white text-base shadow-sm ring-1 ring-slate-100" aria-hidden="true">{item.icon}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{item.label}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{item.recent ? 'Filă deschisă recent' : item.to}</span></span>
              {item.recent ? <Clock3 size={15} className="text-slate-400" aria-label="Recent" /> : <CornerDownLeft size={15} className="text-slate-400" aria-hidden="true" />}
            </button>
          ))}
          {!results.length ? <div className="px-3 py-8 text-center text-sm text-slate-500">Nu am găsit o pagină accesibilă pentru această căutare.</div> : null}
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-xs text-slate-500"><span>↑ ↓ navigare · Enter deschide</span><span>Esc închide · Ctrl+K redeschide</span></div>
      </section>
    </div> : null}
  </>
}
