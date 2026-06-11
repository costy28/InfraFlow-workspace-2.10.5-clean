import { NavLink } from 'react-router-dom'
import { Fragment, useEffect, useState } from 'react'
import api from '../../api/client'
import { useAuth } from '../../hooks/useAuth'
import { useSettings } from '../../hooks/useSettings'
import Badge from '../ui/Badge'

const groups = [
  {
    label: 'PRINCIPAL',
    items: [
      { to: '/dashboard', icon: '📊', label: 'Dashboard' },
      { to: '/kiosk', icon: '🏠', label: 'Kiosk Angajat' },
      { to: '/my-vehicle', icon: '🚗', label: 'Vehiculul meu', myVehicleOnly: true },
    ],
  },
  {
    label: 'SERVICII',
    items: [
      { to: '/hr', icon: '👥', label: 'Resurse Umane', moduleKey: 'hr' },
      { to: '/gestiune', icon: '📦', label: 'Gestiune / Depozit', moduleKey: 'inventory' },
      { to: '/productie', icon: '🏭', label: 'Producție', moduleKey: 'production' },
      { to: '/mecanizare', icon: '⚙️', label: 'Mecanizare', moduleKey: 'mechanization' },
      { to: '/faz-utilaje', icon: '🧾', label: 'FAZ Utilaje', moduleKey: 'mechanization', permissions: ['fleet:faz_view', 'fleet:fc_view'] },
      { to: '/asternere', icon: '🛣️', label: 'Asternere', moduleKey: 'asternere' },
      { to: '/achizitii', icon: '🛒', label: 'Achiziții', moduleKey: 'procurement' },
      { to: '/referate', icon: '📄', label: 'Referate', moduleKey: 'referate' },
      { to: '/teren', icon: '📍', label: 'Teren', moduleKey: 'field' },
      { to: '/salubrizare', icon: '🧹', label: 'Salubrizare', moduleKey: 'sanitation' },
      { to: '/siguranta-circ', icon: '🚦', label: 'Siguranța Circ.', moduleKey: 'traffic_safety' },
      { to: '/deszapezire', icon: '❄️', label: 'Deszăpezire', moduleKey: 'snow_removal' },
      { to: '/mediu', icon: '🌿', label: 'Mediu', moduleKey: 'environment' },
      { to: '/controlling', icon: '💰', label: 'Controlling', moduleKey: 'controlling' },
      { to: '/anaf', icon: '🧾', label: 'ANAF / e-Factură', moduleKey: 'anaf' },
      { to: '/documente', icon: '🗂️', label: 'Documente', moduleKey: 'documents' },
      { to: '/mesaje', icon: '💬', label: 'Mesaje', moduleKey: 'messaging' },
      { to: '/sesizari', icon: '🎫', label: 'Sesizări', moduleKey: 'tickets' },
      { to: '/juridic', icon: '⚖️', label: 'Juridic', moduleKey: 'legal' },
      { to: '/arhiva', icon: '🗄️', label: 'Arhivă', moduleKey: 'archive' },
      { to: '/secretariat', icon: '📬', label: 'Secretariat', moduleKey: 'secretariat' },
    ],
  },
  {
    label: 'SISTEM',
    items: [
      { to: '/setari', icon: '⚙️', label: 'Setări', adminOnly: true },
      { to: '/import-date-vechi', icon: '📥', label: 'Import date vechi', adminOnly: true },
      { to: '/ai-assistant', icon: '🤖', label: 'AI Assistant', moduleKey: 'ai', adminOnly: true, ai: true, badge: aiEnabled => aiEnabled ? 'BETA' : 'INACTIV' },
      { to: '/ajutor', icon: '❓', label: 'Ajutor', adminOnly: true },
    ],
  },
]

const modulePermissionPrefixes = {
  hr: ['hr', 'echipamente'],
  inventory: ['inventory', 'gestiune', 'materials', 'stock_operations', 'ledger', 'deliveries'],
  production: ['production', 'consumptions', 'recipes', 'planning', 'daily_report'],
  procurement: ['procurement', 'procurement_orders'],
  referate: ['referate'],
  mechanization: ['mechanization', 'fleet', 'technical'],
  asternere: ['technical', 'field'],
  anaf: ['anaf', 'integration'],
}

const moduleActiveAliases = {
  mechanization: ['mechanization', 'fleet'],
  inventory: ['inventory', 'reports'],
  ai: ['ai', 'ai_assistant'],
  referate: ['referate', 'procurement'],
}

function normalizedRoles(user) {
  const roles = Array.isArray(user?.roles) ? user.roles : []
  return Array.from(new Set([...roles, user?.role].filter(Boolean).map(String)))
}

function permissionMatches(permission, prefix) {
  return permission === prefix || permission.startsWith(`${prefix}:`) || permission.startsWith(`${prefix}_`)
}

export default function Sidebar({ open, onClose, aiEnabled = false }) {
  const { modules } = useSettings()
  const { user } = useAuth()
  const [departments, setDepartments] = useState([])
  const [hasMyVehicle, setHasMyVehicle] = useState(false)
  const userPermissions = Array.isArray(user?.permissions) ? user.permissions : []
  const userRoles = normalizedRoles(user)
  const isAdmin = userRoles.some(role => ['superadmin', 'admin'].includes(role))
  const isSefDepartament = userRoles.some(role => ['sef_departament', 'sef-departament'].includes(role)) ||
    userPermissions.includes('department:manage') ||
    userPermissions.includes('hr:timesheet_dept')
  const hasItemPermission = item => !item.permissions || isAdmin || item.permissions.some(permission => userPermissions.includes(permission))
  const moduleIsActive = item => {
    if (!item.moduleKey || !Array.isArray(modules) || modules.length === 0) return true
    const aliases = moduleActiveAliases[item.moduleKey] || [item.moduleKey]
    return aliases.some(key => modules.includes(key))
  }
  const canSeeModule = moduleKey => {
    if (!moduleKey || isAdmin) return true
    const prefixes = modulePermissionPrefixes[moduleKey] || [moduleKey]
    return userPermissions.some(permission => prefixes.some(prefix => permissionMatches(permission, prefix)))
  }
  const isVisible = item =>
    (!item.adminOnly || isAdmin) &&
    (!item.myVehicleOnly || hasMyVehicle) &&
    hasItemPermission(item) &&
    moduleIsActive(item) &&
    canSeeModule(item.moduleKey)

  useEffect(() => {
    api.get('/departments')
      .then(response => setDepartments(response.data.departments || []))
      .catch(() => {})
    api.get('/fleet/my-vehicle')
      .then(() => setHasMyVehicle(true))
      .catch(() => setHasMyVehicle(false))
  }, [])

  function renderGroup(label, items) {
    const visibleItems = items.filter(isVisible)
    if (!visibleItems.length) return null
    return (
      <div key={label} className="mb-5">
        <div className="mb-2 px-3 text-[11px] font-semibold uppercase text-slate-400">
          {label}
        </div>
        <div className="grid gap-1">
          {visibleItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition ${
                  isActive ? 'bg-primary-50 text-primary-700' : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              <span className="w-5 text-center" aria-hidden="true">{item.icon}</span>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.ai ? <Badge tone={aiEnabled ? 'warning' : 'gray'}>{item.badge?.(aiEnabled) || 'INACTIV'}</Badge> : null}
            </NavLink>
          ))}
        </div>
      </div>
    )
  }

  function userDepartmentKeys() {
    return new Set([
      user?.departmentId,
      user?.department_id,
      user?.dept_id,
      user?.department,
      user?.departament,
    ].filter(Boolean).map(value => String(value).toLowerCase()))
  }

  function visibleDepartments() {
    const clean = departments.filter(dept => dept.id != null && String(dept.id) !== 'null' && String(dept.id) !== 'undefined' && String(dept.id) !== '')
    if (isAdmin || isSefDepartament) return clean
    const keys = userDepartmentKeys()
    if (!keys.size) return []
    return clean.filter(dept => {
      const deptKeys = [dept.id, dept.name, dept.nume, dept.denumire, dept.cod].filter(Boolean).map(value => String(value).toLowerCase())
      return deptKeys.some(key => keys.has(key))
    })
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-slate-950/40 transition md:hidden ${open ? 'block' : 'hidden'}`}
        onClick={onClose}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform md:static md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="text-lg font-semibold text-primary-700">InfraFlow</div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Statie asfalt</div>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          {groups.map(group => (
            <Fragment key={group.label}>
              {renderGroup(group.label, group.items)}
              {group.label === 'PRINCIPAL' && visibleDepartments().length > 0
                ? renderGroup('DEPARTAMENTE', visibleDepartments()
                    .map(dept => ({
                      to: `/departament/${dept.id}`,
                      icon: dept.icon || '👥',
                      label: dept.name || dept.nume || dept.denumire || 'Departament',
                    })))
                : null}
            </Fragment>
          ))}
        </nav>
      </aside>
    </>
  )
}
