import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import api from '../api/client'
import Card from '../components/ui/Card'
import PageHeader from '../components/ui/PageHeader'

const MODULE_MAP = [
  { prefix: 'dashboard',          label: 'Dashboard',            icon: '📊', route: '/dashboard' },
  { prefix: 'consumptions',       label: 'Producție',            icon: '🏭', route: '/productie' },
  { prefix: 'daily_report',       label: 'Raport zilnic',        icon: '📈', route: '/productie' },
  { prefix: 'period_report',      label: 'Raport perioadă',      icon: '📅', route: '/productie' },
  { prefix: 'accounting_report',  label: 'Raport contabil',      icon: '💹', route: '/productie' },
  { prefix: 'recipes',            label: 'Rețete',               icon: '📋', route: '/productie' },
  { prefix: 'planning',           label: 'Planificare',          icon: '🗓️', route: '/productie' },
  { prefix: 'materials',          label: 'Materiale',            icon: '🧱', route: '/stocuri' },
  { prefix: 'stock_operations',   label: 'Mișcări stoc',         icon: '📦', route: '/stocuri' },
  { prefix: 'inventory',          label: 'Gestiune stoc',        icon: '🏪', route: '/stocuri' },
  { prefix: 'ledger',             label: 'Fișă stoc',            icon: '🗂️', route: '/stocuri' },
  { prefix: 'department_requests',label: 'Solicitări dept.',     icon: '📝', route: '/stocuri' },
  { prefix: 'deliveries',         label: 'Aprovizionări',        icon: '🚚', route: '/achizitii' },
  { prefix: 'procurement_orders', label: 'Comenzi achiziții',    icon: '🛒', route: '/achizitii' },
  { prefix: 'procurement',        label: 'Achiziții',            icon: '💼', route: '/achizitii' },
  { prefix: 'fleet',              label: 'Foi parcurs / FAZ',    icon: '🚗', route: '/flota' },
  { prefix: 'mechanization',      label: 'Mecanizare',           icon: '🔧', route: '/flota' },
  { prefix: 'technical',          label: 'Tehnic',               icon: '⚙️', route: '/tehnic' },
  { prefix: 'hr',                 label: 'Resurse Umane',        icon: '👥', route: '/hr' },
  { prefix: 'cost_accounting',    label: 'Contabilitate costuri',icon: '💰', route: '/controlling' },
  { prefix: 'controlling',        label: 'Controlling',          icon: '📉', route: '/controlling' },
  { prefix: 'field',              label: 'Teren',                icon: '📍', route: '/teren' },
  { prefix: 'sanitation',         label: 'Salubrizare',          icon: '🧹', route: '/salubrizare' },
  { prefix: 'traffic_safety',     label: 'Siguranța circulației',icon: '🚦', route: '/siguranta-circ' },
  { prefix: 'snow_removal',       label: 'Deszăpezire',          icon: '❄️', route: '/deszapezire' },
  { prefix: 'environment',        label: 'Mediu',                icon: '🌿', route: '/mediu' },
  { prefix: 'legal',              label: 'Juridic',              icon: '⚖️', route: '/juridic' },
  { prefix: 'archive',            label: 'Arhivă',               icon: '🗄️', route: '/arhiva' },
  { prefix: 'secretariat',        label: 'Secretariat',          icon: '📬', route: '/secretariat' },
  { prefix: 'documents',          label: 'Documente',            icon: '🗃️', route: '/documente' },
  { prefix: 'messaging',          label: 'Mesaje',               icon: '💬', route: '/mesaje' },
  { prefix: 'tickets',            label: 'Sesizări',             icon: '🎫', route: '/sesizari' },
  { prefix: 'integration',        label: 'Integrare Intersoft',  icon: '🔗', route: '/intersoft' },
  { prefix: 'ai',                 label: 'AI Assistant',         icon: '🤖', route: '/ai' },
  { prefix: 'users',              label: 'Utilizatori',          icon: '👤', route: '/setari' },
  { prefix: 'settings',           label: 'Setări sistem',        icon: '⚙️', route: '/setari' },
  { prefix: 'audit',              label: 'Audit',                icon: '🔍', route: '/setari' },
  { prefix: 'system',             label: 'Sistem',               icon: '🖥️', route: '/setari' },
]

const ACTION_LABELS = {
  view: 'Vizualizare', create: 'Creare', manage: 'Gestionare', edit: 'Editare',
  cancel: 'Anulare', export: 'Export', print: 'Printare', approve: 'Aprobare',
  receive: 'Recepție', close: 'Închidere', request: 'Solicitare', sign: 'Semnare',
  import: 'Import', assign: 'Alocare', resolve: 'Rezolvare', admin: 'Admin',
  send: 'Trimitere', files: 'Fișiere', archive: 'Arhivare', share: 'Partajare',
  templates: 'Șabloane', validate: 'Validare', report: 'Raport', config: 'Configurare',
  worklog: 'Jurnal lucru', sales: 'Vânzări', collect: 'Colectare', contracts: 'Contracte',
  inspect: 'Inspecție', work_order: 'Ordin lucru', manage_all: 'Gestiune totală',
  permits: 'Autorizații', incidents: 'Incidente', litigation: 'Litigii', opinions: 'Opinii',
  entries: 'Intrări', exits: 'Ieșiri', transfers: 'Transferuri', reports: 'Rapoarte',
  employees_manage: 'Angajați', timesheet: 'Pontaj', timesheets_view: 'Vezi pontaje',
  timesheets_manage: 'Gestiune pontaje', timesheet_approve: 'Aprobă pontaj',
  timesheets_validate: 'Validare pontaje', leave_manage: 'Concedii',
  authorizations_manage: 'Autorizații', contracts_manage: 'Contracte', salary_view: 'Salarii',
  training: 'Training', reges_export: 'Export REGES', nexus_export: 'Export Nexus',
  cost_centers: 'Centre cost', budget_manage: 'Buget', view_all: 'Vedere totală',
  view_own: 'Vedere proprii', view_dept: 'Vedere departament', entry_create: 'Înregistrare',
  entry_validate: 'Validare', journal_create: 'Jurnal', journal_submit: 'Trimite jurnal',
  journal_approve: 'Aprobă jurnal', photo_upload: 'Fotografii', issue_report: 'Raportare problemă',
  issue_resolve: 'Rezolvare problemă', progress_view: 'Progres lucrări', sign_request: 'Cerere semnătură',
  duty_log: 'Registru serviciu', route_sheet: 'Foaie traseu', gps_import: 'Import GPS',
  trip_log_view: 'Vezi foi parcurs', trip_log_create: 'Creare foi parcurs',
  trip_log_close: 'Închidere foi parcurs', trip_log_edit: 'Editare foi parcurs',
  fc_view: 'Vezi FC', fc_create: 'Creare FC', fc_edit: 'Editare FC',
  fc_complete: 'Completare FC', faz_generate: 'Generare FAZ',
  intersoft_view: 'Vizualizare Intersoft', intersoft_import: 'Import Intersoft',
  intersoft_export: 'Export Intersoft', data_query: 'Interogare date', help: 'Ajutor',
  use: 'Utilizare', update: 'Update', appointments: 'Programări', registry: 'Registratură',
}

function groupPermissions(permissions) {
  const groups = {}
  for (const perm of permissions) {
    const [prefix, action] = perm.split(':')
    if (!groups[prefix]) groups[prefix] = []
    groups[prefix].push(action)
  }
  return groups
}

function ModuleCard({ mod, actions, onClick }) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-primary-500 hover:shadow-md active:scale-95"
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">{mod.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-slate-800 group-hover:text-primary-700">
            {mod.label}
          </div>
          <div className="text-xs text-slate-400">{actions.length} acțiuni active</div>
        </div>
        <span className="text-slate-300 transition group-hover:text-primary-500">→</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {actions.map(action => (
          <span
            key={action}
            className="rounded bg-primary-50 px-1.5 py-0.5 text-[11px] font-medium text-primary-700"
          >
            {ACTION_LABELS[action] || action}
          </span>
        ))}
      </div>
    </button>
  )
}

export default function DepartamentPage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [dept, setDept] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id || id === 'null' || id === 'undefined') {
      setDept(null)
      setLoading(false)
      return
    }
    setLoading(true)
    api.get('/departments')
      .then(response => {
        const found = (response.data.departments || []).find(item =>
          item.id != null && String(item.id) === String(id)
        )
        setDept(found || null)
      })
      .catch(() => setDept(null))
      .finally(() => setLoading(false))
  }, [id, location.pathname])

  const permissions = useMemo(() => dept?.permissions || [], [dept])
  const title = dept?.name || dept?.nume || dept?.denumire || 'Departament'

  const moduleCards = useMemo(() => {
    const groups = groupPermissions(permissions)
    return MODULE_MAP
      .filter(mod => groups[mod.prefix]?.length > 0)
      .map(mod => ({ mod, actions: groups[mod.prefix] }))
  }, [permissions])

  return (
    <div className="grid gap-4">
      <PageHeader
        title={`${dept?.icon || '👥'} ${title}`}
        subtitle="Dashboard departament"
      />

      <Card loading={loading}>
        {!loading && !dept ? (
          <div className="py-12 text-center text-slate-500">
            <div className="mb-2 text-4xl">🏢</div>
            <div className="font-medium">Departamentul nu a fost găsit.</div>
            <div className="mt-1 text-sm">Reîncarcă pagina sau accesează departamentul din bara laterală.</div>
          </div>
        ) : dept ? (
          <div className="grid gap-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="text-xs font-semibold uppercase text-slate-500">Tip</div>
                <div className="mt-1 font-medium text-slate-900">{dept.tip || 'departament'}</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="text-xs font-semibold uppercase text-slate-500">Module active</div>
                <div className="mt-1 font-medium text-slate-900">{moduleCards.length}</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="text-xs font-semibold uppercase text-slate-500">Permisiuni active</div>
                <div className="mt-1 font-medium text-slate-900">{permissions.length}</div>
              </div>
            </div>

            {moduleCards.length > 0 ? (
              <div>
                <div className="mb-3 text-xs font-semibold uppercase text-slate-500">
                  Module accesibile — click pentru a naviga
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {moduleCards.map(({ mod, actions }) => (
                    <ModuleCard
                      key={mod.prefix}
                      mod={mod}
                      actions={actions}
                      onClick={() => navigate(mod.route)}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
                Nicio permisiune configurată pentru acest departament.
                Adminul le poate configura din Setări → Departamente.
              </p>
            )}
          </div>
        ) : null}
      </Card>
    </div>
  )
}
