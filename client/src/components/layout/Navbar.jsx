import { Bell, CaseSensitive, LayoutGrid, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import Button from '../ui/Button'
import Badge from '../ui/Badge'

export default function Navbar({ title = 'Dashboard', user, onLogout, onToggleSidebar, onToggleSidebarCollapsed, sidebarCollapsed = false }) {
  const role = user?.role || user?.rol || 'operator'
  const name = user?.name || user?.nume || user?.username || 'Utilizator'
  const [theme, setTheme] = useState(() => localStorage.getItem('infraflow_theme') || 'light')
  const [density, setDensity] = useState(() => localStorage.getItem('infraflow_density') || 'normal')
  const [fontScale, setFontScale] = useState(() => Number(localStorage.getItem('infraflow_font_scale') || 1))

  useEffect(() => {
    localStorage.setItem('infraflow_theme', theme)
    localStorage.setItem('infraflow_density', density)
    localStorage.setItem('infraflow_font_scale', String(fontScale))
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.density = density
    document.documentElement.style.setProperty('--app-font-scale', String(fontScale))
    window.dispatchEvent(new Event('infraflow:appearance'))
  }, [theme, density, fontScale])

  function toggleDensity() {
    setDensity(current => current === 'compact' ? 'normal' : current === 'normal' ? 'comfortable' : 'compact')
  }

  function cycleFont() {
    setFontScale(current => current >= 1.08 ? 0.94 : Number((current + 0.04).toFixed(2)))
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur">
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
        <h1 className="truncate text-lg font-semibold text-slate-900">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
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
        <button className="relative grid h-9 w-9 place-items-center rounded-[var(--radius-control)] text-slate-600 hover:bg-slate-100" aria-label="Notificari">
          <Bell size={18} />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500" />
        </button>
        <div className="hidden text-right sm:block">
          <div className="text-sm font-medium text-slate-900">{name}</div>
          <Badge>{role}</Badge>
        </div>
        <Button variant="secondary" onClick={onLogout}>
          <LogOut size={16} />
          Ieșire
        </Button>
      </div>
    </header>
  )
}
