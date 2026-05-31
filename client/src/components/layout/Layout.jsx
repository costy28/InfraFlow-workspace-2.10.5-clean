import { useMemo, useState } from 'react'
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
  useGlobalNotifications()
  const location = useLocation()
  const navigate = useNavigate()

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
        <main className="flex-1 p-4">
          {children}
        </main>
      </div>
    </div>
    </SettingsProvider>
  )
}
