import { useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useGlobalNotifications } from '../../hooks/useGlobalNotifications'
import { SettingsProvider } from '../../hooks/useSettings'
import Navbar from './Navbar'
import Sidebar from './Sidebar'

const titles = {
  '/dashboard': 'Dashboard',
  '/departament': 'Departament',
  '/productie': 'Producție',
  '/stocuri': 'Stocuri',
  '/achizitii': 'Achiziții',
  '/flota': 'Flotă utilaje',
  '/hr': 'HR',
  '/controlling': 'Controlling',
  '/documente': 'Documente',
  '/mesaje': 'Mesaje',
  '/sesizari': 'Sesizări',
  '/teren': 'Teren',
  '/salubrizare': 'Salubrizare',
  '/siguranta-circulatiei': 'Siguranța circulației',
  '/deszapezire': 'Deszăpezire',
  '/mediu': 'Mediu',
  '/juridic': 'Juridic',
  '/arhiva': 'Arhivă',
  '/secretariat': 'Secretariat',
  '/setari': 'Setări',
  '/ai': 'AI Assistant',
}

export default function Layout({ children }) {
  const { user, loading, logout } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
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
      root.dataset.theme = theme
      root.dataset.density = density
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
    const match = Object.keys(titles)
      .sort((a, b) => b.length - a.length)
      .find(path => location.pathname.startsWith(path))
    return titles[match] || 'InfraFlow'
  }, [location.pathname])

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  function stopPresentationMode() {
    localStorage.removeItem('infraflow_presentation_mode')
    setPresentationMode(false)
  }

  if (loading) {
    return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Se incarca...</div>
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return (
    <SettingsProvider>
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        aiEnabled={Boolean(user?.modules?.ai?.enabled)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar
          title={title}
          user={user}
          onLogout={handleLogout}
          onToggleSidebar={() => setSidebarOpen(open => !open)}
        />
        {presentationMode ? (
          <div className="border-b border-primary-100 bg-primary-50 px-4 py-2 text-sm text-primary-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold">Mod prezentare</span>
                <span>1. Dashboard</span>
                <span>2. Referate</span>
                <span>3. Mecanizare</span>
                <span>4. Kiosk</span>
                <span>5. Reset demo</span>
              </div>
              <button className="font-semibold text-primary-700 hover:underline" onClick={stopPresentationMode}>Opreste turul</button>
            </div>
          </div>
        ) : null}
        <main className="flex-1 p-4">
          {children}
        </main>
      </div>
    </div>
    </SettingsProvider>
  )
}
