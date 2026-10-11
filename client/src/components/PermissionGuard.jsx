/**
 * PermissionGuard — guard la nivel de pagină
 * Blochează accesul dacă utilizatorul nu are permisiunea cerută.
 * Superadmin și admin au mereu acces.
 */
import { useAuth } from '../hooks/useAuth'
import { canAccess } from '../lib/permission-access'

export function PermissionGuard({ permission, children }) {
  const { user } = useAuth()
  const required = Array.isArray(permission) ? permission : [permission]
  const hasAccess = canAccess(user, permission)
  const label = typeof permission === 'object'
    ? [...(permission.anyOf || []), ...(permission.anyPrefix || []).map(prefix => `${prefix}:*`)].join(' sau ')
    : required.join(' sau ')

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-500">
        <div className="mb-4 text-5xl">🔒</div>
        <h2 className="text-lg font-semibold text-slate-700">Acces restricționat</h2>
        <p className="mt-1 text-sm">Nu ai permisiunea necesară pentru acest modul.</p>
        <p className="mt-3 text-xs text-slate-400">
          Permisiune necesară: <code className="rounded bg-slate-100 px-1.5 py-0.5">{label}</code>
        </p>
      </div>
    )
  }

  return children
}

export default PermissionGuard
