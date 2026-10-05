import { useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useGlobalNotifications } from '../../hooks/useGlobalNotifications'
import { SettingsProvider } from '../../hooks/useSettings'
import Navbar from './Navbar'
import Sidebar from './Sidebar'
import WorkspaceTabs from './WorkspaceTabs'

const titles = {
  '/dashboard': 'Dashboard',
  '/departament': 'Departament',
  '/productie': 'Producție & Operațiuni',
  '/gestiune': 'Stocuri & Depozite',
  '/stocuri': 'Stocuri & Depozite',
  '/achizitii': 'Aprovizionare & Achiziții',
  '/logistica': 'Logistică & Transport',
  '/flota': 'Flotă, Echipamente & Resurse',
  '/mecanizare': 'Flotă, Echipamente & Resurse',
  '/hr': 'HR',
  '/controlling': 'Controlling',
  '/documente': 'Documente',
  '/mesaje': 'Mesaje',
  '/sesizari': 'Solicitări & Incidente',
  '/teren': 'Proiecte & Activitate în teren',
  '/salubrizare': 'Rute & Operațiuni teren',
  '/siguranta-circ': 'Semnalizare & Intervenții',
  '/siguranta-circulatiei': 'Semnalizare & Intervenții',
  '/deszapezire': 'Operațiuni sezoniere',
  '/mediu': 'Mediu & Conformitate',
  '/juridic': 'Juridic',
  '/arhiva': 'Arhivă',
  '/secretariat': 'Registratură & Corespondență',
  '/setari': 'Setări',
  '/ofertare-interna': 'Ofertare internă',
  '/ai': 'AI Assistant',
  '/contabilitate': 'Contabilitate',
  '/contracte': 'Contracte',
  '/crm': 'CRM / Vânzări',
  '/taskuri': 'Task-uri',
  '/kiosk': 'Kiosk Angajat',
}

const workspaceTitles = {
  '/crm/oferte': 'Oferte CRM',
  '/crm/lead-uri': 'Lead-uri CRM',
  '/crm/prospecte': 'Prospecte și contacte',
  '/intersoft': 'Devize — integrare',
  '/contabilitate/facturi-intrare': 'Facturi intrare',
  '/contabilitate/facturi-iesire': 'Facturi ieșire',
  '/contabilitate/operatiuni': 'Operațiuni contabile',
  '/contabilitate/trezorerie': 'Trezorerie',
  '/contabilitate/registru-jurnal': 'Registru jurnal',
  '/contabilitate/plan-conturi': 'Plan de conturi',
  '/contracte/dosar': 'Dosar contractual',
  '/logistica': 'Documente transport',
}

function titleForPath(pathname, source) {
  const match = Object.keys(source)
    .sort((a, b) => b.length - a.length)
    .find(path => pathname.startsWith(path))
  return source[match] || 'InfraFlow'
}

export default function Layout({ children }) {
  const { user, loading, logout } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('infraflow_sidebar_collapsed') === 'true')
  const [presentationMode, setPresentationMode] = useState(() => localStorage.getItem('infraflow_presentation_mode') === 'true')
  useGlobalNotifications()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    function applyAppearance() {
      const root = document.documentElement
      const theme = localStorage.getItem('infraflow_theme') || 'light'
      const density = localStorage.getItem('infraflow_density') || 'normal'
      const fontScale = localStorage.getItem('infraflow_font_scale') || '1'
      const radius = localStorage.getItem('infraflow_radius') || 'standard'
      const contrast = localStorage.getItem('infraflow_contrast') || 'normal'
      root.dataset.theme = theme
      root.dataset.density = density
      root.dataset.radius = radius
      root.dataset.contrast = contrast
      root.style.setProperty('--app-font-scale', fontScale)
    }
    applyAppearance()
    window.addEventListener('storage', applyAppearance)
    window.addEventListener('infraflow:appearance', applyAppearance)
    return () => {
      window.removeEventListener('storage', applyAppearance)
      window.removeEventListener('infraflow:appearance', applyAppearance)
    }
  }, [])

  const title = useMemo(() => {
    return titleForPath(location.pathname, titles)
  }, [location.pathname])

  const workspaceTitle = useMemo(() => {
    const specificTitle = titleForPath(location.pathname, workspaceTitles)
    return specificTitle === 'InfraFlow' ? title : specificTitle
  }, [location.pathname, title])

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  function stopPresentationMode() {
    localStorage.removeItem('infraflow_presentation_mode')
    setPresentationMode(false)
  }

  function toggleSidebarCollapsed() {
    setSidebarCollapsed(current => {
      const next = !current
      localStorage.setItem('infraflow_sidebar_collapsed', String(next))
      return next
    })
  }

  if (loading) {
    return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Se incarca...</div>
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return (
    <SettingsProvider>
    <div className="app-shell flex min-h-screen w-full overflow-x-hidden bg-slate-50">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebarCollapsed}
        aiEnabled={Boolean(user?.modules?.ai?.enabled)}
      />
      <div className="app-content flex min-w-0 flex-1 flex-col overflow-x-hidden">
        <Navbar
          title={title}
          user={user}
          onLogout={handleLogout}
          onNavigate={navigate}
          onToggleSidebar={() => setSidebarOpen(open => !open)}
          onToggleSidebarCollapsed={toggleSidebarCollapsed}
          sidebarCollapsed={sidebarCollapsed}
        />
        <WorkspaceTabs location={location} label={workspaceTitle} onNavigate={navigate} />
        {presentationMode ? (
          <div className="border-b border-primary-100 bg-primary-50 px-4 py-2 text-sm text-primary-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold">Mod prezentare</span>
                <span>1. Dashboard</span>
                <span>2. Referate</span>
                <span>3. Flotă & Resurse</span>
                <span>4. Kiosk</span>
                <span>5. Reset demo</span>
              </div>
              <button className="font-semibold text-primary-700 hover:underline" onClick={stopPresentationMode}>Opreste turul</button>
            </div>
          </div>
        ) : null}
        <main className="app-main min-w-0 flex-1 overflow-x-hidden p-4">
          {children}
        </main>
      </div>
    </div>
    </SettingsProvider>
  )
}
