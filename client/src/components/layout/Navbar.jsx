import { Bell, CaseSensitive, LayoutGrid, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import api from '../../api/client'
import Button from '../ui/Button'
import Badge from '../ui/Badge'

const notificationRoutes = {
  planning: '/achizitii?tab=Cerin%C8%9Be',
  departmentRequests: '/achizitii?tab=Cerin%C8%9Be',
  stocks: '/stocuri',
  mechanization: '/mecanizare',
  hr: '/hr',
  kiosk: '/kiosk',
  documents: '/documente',
  tasks: '/taskuri',
  tickets: '/sesizari',
  messages: '/mesaje',
  crm: '/crm',
  contracts: '/contracte',
}

function notificationRoute(notification) {
  const targetView = String(notification?.targetView || notification?.target_view || '').trim()
  if (targetView.startsWith('/')) return targetView
  if (notificationRoutes[targetView]) return notificationRoutes[targetView]
  if (String(notification?.type || '').includes('task')) return '/taskuri'
  if (String(notification?.type || '').includes('ticket')) return '/sesizari'
  return '/dashboard'
}

function notificationTime(value) {
  if (!value) return 'Recent'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recent'
  return new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date)
}

export default function Navbar({ title = 'Dashboard', user, onLogout, onNavigate, onToggleSidebar, onToggleSidebarCollapsed, sidebarCollapsed = false }) {
  const role = user?.role || user?.rol || 'operator'
  const name = user?.name || user?.nume || user?.username || 'Utilizator'
  const [theme, setTheme] = useState(() => localStorage.getItem('infraflow_theme') || 'light')
  const [density, setDensity] = useState(() => localStorage.getItem('infraflow_density') || 'normal')
  const [fontScale, setFontScale] = useState(() => Number(localStorage.getItem('infraflow_font_scale') || 1))
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [notificationState, setNotificationState] = useState({ total: 0, notifications: [] })

  const loadNotifications = useCallback(async () => {
    try {
      const response = await api.get('/notifications')
      const notifications = Array.isArray(response.data?.notifications) ? response.data.notifications : []
      setNotificationState({
        total: Number(response.data?.summary?.total ?? notifications.length) || 0,
        notifications,
      })
    } catch {
      // Păstrăm ultima stare afișată: o problemă temporară de rețea nu ascunde alertele deja încărcate.
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('infraflow_theme', theme)
    localStorage.setItem('infraflow_density', density)
    localStorage.setItem('infraflow_font_scale', String(fontScale))
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.density = density
    document.documentElement.style.setProperty('--app-font-scale', String(fontScale))
    window.dispatchEvent(new Event('infraflow:appearance'))
  }, [theme, density, fontScale])

  useEffect(() => {
    if (!user) return undefined
    loadNotifications()
    const intervalId = window.setInterval(loadNotifications, 60_000)
    return () => window.clearInterval(intervalId)
  }, [user, loadNotifications])

  function toggleDensity() {
    setDensity(current => current === 'compact' ? 'normal' : current === 'normal' ? 'comfortable' : 'compact')
  }

  function cycleFont() {
    setFontScale(current => current >= 1.08 ? 0.94 : Number((current + 0.04).toFixed(2)))
  }

  function toggleNotifications() {
    setNotificationOpen(current => {
      const next = !current
      if (next) loadNotifications()
      return next
    })
  }

  function openNotification(notification) {
    setNotificationOpen(false)
    setNotificationState(current => {
      const notifications = current.notifications.filter(item => String(item.id) !== String(notification.id))
      return { total: Math.max(0, current.total - 1), notifications }
    })
    onNavigate?.(notificationRoute(notification))
    api.post(`/notifications/${encodeURIComponent(String(notification.id))}/read`).catch(() => loadNotifications())
  }

  return (
    <header className="flex h-14 min-w-0 items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-3 backdrop-blur md:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <Button variant="ghost" className="px-2 md:hidden" onClick={onToggleSidebar} aria-label="Deschide meniul">
          <Menu size={20} />
        </Button>
        <button
          type="button"
          className="hidden h-9 w-9 place-items-center rounded-[var(--radius-control)] text-slate-600 hover:bg-slate-100 md:grid"
          title={sidebarCollapsed ? 'Extinde meniul lateral' : 'Restrange meniul lateral'}
          onClick={onToggleSidebarCollapsed}
          aria-label={sidebarCollapsed ? 'Extinde meniul lateral' : 'Restrange meniul lateral'}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
        <h1 className="min-w-0 truncate text-base font-semibold text-slate-900 md:text-lg">{title}</h1>
      </div>

      <div className="flex min-w-0 shrink-0 items-center gap-1.5 md:gap-3">
        <div className="hidden items-center rounded-[var(--radius-control)] border border-slate-200 bg-white p-1 shadow-sm lg:flex">
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded-[calc(var(--radius-control)-0.1rem)] text-slate-600 hover:bg-slate-100"
            title={theme === 'dark' ? 'Tema luminoasa' : 'Tema intunecata'}
            onClick={() => setTheme(current => current === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded-[calc(var(--radius-control)-0.1rem)] text-slate-600 hover:bg-slate-100"
            title={`Densitate: ${density}`}
            onClick={toggleDensity}
          >
            <LayoutGrid size={16} />
          </button>
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded-[calc(var(--radius-control)-0.1rem)] text-slate-600 hover:bg-slate-100"
            title={`Font: ${Math.round(fontScale * 100)}%`}
            onClick={cycleFont}
          >
            <CaseSensitive size={17} />
          </button>
        </div>
        <div
          className="relative hidden sm:block"
          onMouseEnter={() => setNotificationOpen(true)}
          onMouseLeave={() => setNotificationOpen(false)}
        >
          <button
            type="button"
            className="relative grid h-9 w-9 place-items-center rounded-[var(--radius-control)] text-slate-600 hover:bg-slate-100"
            aria-label={notificationState.total ? `${notificationState.total} notificări` : 'Nu există notificări'}
            aria-expanded={notificationOpen}
            title={notificationState.total ? `${notificationState.total} notificări active` : 'Nu există notificări active'}
            onClick={toggleNotifications}
          >
            <Bell size={18} />
            {notificationState.total > 0 ? (
              <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white">
                {notificationState.total > 9 ? '9+' : notificationState.total}
              </span>
            ) : null}
          </button>
          {notificationOpen ? (
            <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                <span className="text-sm font-semibold text-slate-900">Notificări</span>
                <span className="text-xs text-slate-500">{notificationState.total ? `${notificationState.total} active` : 'La zi'}</span>
              </div>
              {notificationState.notifications.length ? (
                <div className="max-h-80 overflow-y-auto p-1">
                  {notificationState.notifications.slice(0, 8).map(notification => (
                    <button
                      key={notification.id}
                      type="button"
                      className="w-full rounded-md px-3 py-2.5 text-left transition hover:bg-slate-50 focus:bg-slate-50"
                      title={notification.detail || notification.title}
                      onClick={() => openNotification(notification)}
                    >
                      <div className="flex items-start gap-2">
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.severity === 'bad' ? 'bg-rose-500' : notification.severity === 'warn' ? 'bg-amber-400' : 'bg-primary-500'}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-slate-900">{notification.title || 'Notificare'}</span>
                          {notification.detail ? <span className="mt-0.5 block line-clamp-2 text-xs text-slate-600">{notification.detail}</span> : null}
                          <span className="mt-1 block text-xs text-primary-700">{notification.targetLabel || 'Deschide'} · {notificationTime(notification.createdAt)}</span>
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-3 py-6 text-center text-sm text-slate-500">Nu ai notificări active.</div>
              )}
            </div>
          ) : null}
        </div>
        <div className="hidden text-right sm:block">
          <div className="text-sm font-medium text-slate-900">{name}</div>
          <Badge>{role}</Badge>
        </div>
        <Button variant="secondary" className="px-2.5 md:px-[var(--control-px)]" onClick={onLogout}>
          <LogOut size={16} />
          <span className="hidden sm:inline">Ieșire</span>
        </Button>
      </div>
    </header>
  )
}
