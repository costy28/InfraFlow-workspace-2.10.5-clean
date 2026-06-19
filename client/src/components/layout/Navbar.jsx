import { Bell, LogOut, Menu } from 'lucide-react'
import Button from '../ui/Button'
import Badge from '../ui/Badge'

export default function Navbar({ title = 'Dashboard', user, onLogout, onToggleSidebar }) {
  const role = user?.role || user?.rol || 'operator'
  const name = user?.name || user?.nume || user?.username || 'Utilizator'

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <Button variant="ghost" className="px-2 md:hidden" onClick={onToggleSidebar} aria-label="Deschide meniul">
          <Menu size={20} />
        </Button>
        <h1 className="truncate text-lg font-semibold text-slate-900">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
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
