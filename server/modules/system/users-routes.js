const { Router } = require('express')
const { requireAuth } = require('../../core/auth')
const { requirePermission } = require('../../core/permissions')
const { writeDb } = require('../../core/db')
const { addAudit } = require('../../core/audit')
const {
  DEFAULT_CUSTOM_ROLES,
  rolePermissionCatalog,
  rolesList,
  adminUser,
  updateRolePermissions: coreUpdateRolePermissions,
  sanitizeRolePermissions: coreSanitizeRolePermissions,
  ensureDefaultCustomRoles,
  normalizedUserRoles
} = require('../../core/permissions')

function createSystemUsersRouter(context) {
  const {
    readJsonBody,
    sendJson,
    roleExists,
    normalizeRequestedRoles,
    ensureCanManageUser,
    createUser,
    updateUser,
    resetUserPassword
  } = context

  const router = Router()

  router.get('/roles', (req, res) => {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'users:manage')) return
    if (!auth.db.settings || typeof auth.db.settings !== 'object') auth.db.settings = {}
    const changed = ensureDefaultCustomRoles(auth.db.settings)
    if (changed) writeDb(auth.db)
    const allRoles = rolesList(auth.db.settings).map(r => ({
      ...r,
      users_count: (auth.db.users || []).filter(u => normalizedUserRoles(u).includes(r.id)).length
    }))
    const catalog = rolePermissionCatalog()
    const availablePermissions = catalog.flatMap(group =>
      group.permissions.map(permission => ({ ...permission, group: group.label, group_id: group.id }))
    )
    sendJson(res, 200, { roles: allRoles, catalog, available_permissions: availablePermissions })
  })

  router.get('/roles/permissions-catalog', (req, res) => {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'users:manage')) return
    sendJson(res, 200, rolePermissionCatalog())
  })

  router.post('/roles', async (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requirePermission(auth, res, 'users:manage')) return
      const body = await readJsonBody(req)
      const name = String(body.name || '').trim()
      if (!name) { sendJson(res, 400, { error: 'Numele rolului este obligatoriu.' }); return }
      const baseId = name.toLowerCase()
        .replace(/[ăâ]/g, 'a').replace(/[îí]/g, 'i').replace(/[șş]/g, 's').replace(/[țţ]/g, 't').replace(/[éè]/g, 'e')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      if (!auth.db.settings) auth.db.settings = {}
      if (!Array.isArray(auth.db.settings.customRoles)) auth.db.settings.customRoles = []
      const allIds = new Set(rolesList(auth.db.settings).map(r => r.id))
      let finalId = baseId
      let idx = 2
      while (allIds.has(finalId)) { finalId = `${baseId}-${idx++}` }
      const newRole = {
        id: finalId,
        name,
        description: String(body.description || '').trim(),
        tip: 'custom',
        permissions: coreSanitizeRolePermissions(body.permissions)
      }
      auth.db.settings.customRoles.push(newRole)
      addAudit(auth.db, auth.user, 'rol_creat', `${name} (${finalId})`)
      writeDb(auth.db)
      sendJson(res, 201, {
        role: newRole,
        roles: rolesList(auth.db.settings).map(r => ({ ...r, users_count: (auth.db.users || []).filter(u => normalizedUserRoles(u).includes(r.id)).length }))
      })
    } catch (e) { next(e) }
  })

  router.put('/roles/:id', async (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requirePermission(auth, res, 'users:manage')) return
      const roleId = req.params.id
      if (['superadmin', 'admin'].includes(roleId)) {
        sendJson(res, 403, { error: 'Rolurile de sistem nu se pot modifica.' }); return
      }
      const body = await readJsonBody(req)
      if (!auth.db.settings) auth.db.settings = {}
      if (!Array.isArray(auth.db.settings.customRoles)) auth.db.settings.customRoles = []
      const customRole = auth.db.settings.customRoles.find(r => r.id === roleId)
      if (customRole) {
        if (body.name) customRole.name = String(body.name).trim()
        if (body.description !== undefined) customRole.description = String(body.description).trim()
        if (body.permissions) customRole.permissions = coreSanitizeRolePermissions(body.permissions)
      } else {
        coreUpdateRolePermissions(auth.db, auth.user, roleId, body)
      }
      addAudit(auth.db, auth.user, 'rol_modificat', roleId)
      writeDb(auth.db)
      sendJson(res, 200, {
        roles: rolesList(auth.db.settings).map(r => ({ ...r, users_count: (auth.db.users || []).filter(u => normalizedUserRoles(u).includes(r.id)).length }))
      })
    } catch (e) { next(e) }
  })

  router.delete('/roles/:id', (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requirePermission(auth, res, 'users:manage')) return
      const roleId = req.params.id
      if (['superadmin', 'admin'].includes(roleId)) {
        sendJson(res, 403, { error: 'Rolurile de sistem nu se pot șterge.' }); return
      }
      const usersWithRole = (auth.db.users || []).filter(u => normalizedUserRoles(u).includes(roleId))
      if (usersWithRole.length > 0) {
        sendJson(res, 409, {
          error: `Rolul este atribuit la ${usersWithRole.length} utilizator(i). Schimbă-le rolul înainte de ștergere.`,
          users: usersWithRole.map(u => ({ id: u.id, name: u.name, username: u.username }))
        }); return
      }
      if (!auth.db.settings) auth.db.settings = {}
      if (!Array.isArray(auth.db.settings.customRoles)) auth.db.settings.customRoles = []
      const idx = auth.db.settings.customRoles.findIndex(r => r.id === roleId)
      if (idx === -1) { sendJson(res, 404, { error: 'Rol inexistent.' }); return }
      auth.db.settings.customRoles.splice(idx, 1)
      if (auth.db.settings.rolePermissionOverrides) {
        delete auth.db.settings.rolePermissionOverrides[roleId]
      }
      addAudit(auth.db, auth.user, 'rol_sters', roleId)
      writeDb(auth.db)
      sendJson(res, 200, {
        roles: rolesList(auth.db.settings).map(r => ({ ...r, users_count: (auth.db.users || []).filter(u => normalizedUserRoles(u).includes(r.id)).length }))
      })
    } catch (e) { next(e) }
  })

  router.patch('/roles/:id/permissions', async (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requirePermission(auth, res, 'users:manage')) return
      const roleId = req.params.id
      if (['superadmin', 'admin'].includes(roleId)) {
        sendJson(res, 403, { error: 'Rolurile de sistem nu se pot modifica.' }); return
      }
      const body = await readJsonBody(req)
      if (!auth.db.settings) auth.db.settings = {}
      if (!Array.isArray(auth.db.settings.customRoles)) auth.db.settings.customRoles = []
      const customRole = auth.db.settings.customRoles.find(r => r.id === roleId)
      if (body.reset) {
        if (customRole) {
          const defaultDef = DEFAULT_CUSTOM_ROLES.find(r => r.id === roleId)
          if (defaultDef) customRole.permissions = [...defaultDef.permissions]
        } else if (auth.db.settings.rolePermissionOverrides) {
          delete auth.db.settings.rolePermissionOverrides[roleId]
        }
      } else if (body.permissions) {
        if (customRole) {
          customRole.permissions = coreSanitizeRolePermissions(body.permissions)
        } else {
          coreUpdateRolePermissions(auth.db, auth.user, roleId, body)
        }
      }
      addAudit(auth.db, auth.user, 'rol_permisiuni_salvate', roleId)
      writeDb(auth.db)
      sendJson(res, 200, {
        roles: rolesList(auth.db.settings).map(r => ({ ...r, users_count: (auth.db.users || []).filter(u => normalizedUserRoles(u).includes(r.id)).length })),
        catalog: rolePermissionCatalog()
      })
    } catch (e) { next(e) }
  })

  router.put('/users/:id/role', async (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requirePermission(auth, res, 'users:manage')) return
      const body = await readJsonBody(req)
      const newRole = String(body.role || '').trim()
      if (!newRole) { sendJson(res, 400, { error: 'Rolul este obligatoriu.' }); return }
      const user = (auth.db.users || []).find(u => String(u.id) === String(req.params.id))
      if (!user) { sendJson(res, 404, { error: 'Utilizatorul nu a fost găsit.' }); return }
      if (!roleExists(auth.db, newRole)) { sendJson(res, 400, { error: 'Rol invalid.' }); return }
      ensureCanManageUser(auth.user, user, newRole)
      user.role = newRole
      user.roles = [newRole]
      user.updatedAt = new Date().toISOString()
      addAudit(auth.db, auth.user, 'utilizator_rol_schimbat', `${user.username} → ${newRole}`)
      writeDb(auth.db)
      sendJson(res, 200, { user: adminUser(user) })
    } catch (e) { next(e) }
  })

  router.put('/users/:id/roles', async (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requirePermission(auth, res, 'users:manage')) return
      const body = await readJsonBody(req)
      const roles = normalizeRequestedRoles(auth.db, body.roles || body.role || [])
      if (!roles.length) { sendJson(res, 400, { error: 'Selectează cel puțin un rol.' }); return }
      const user = (auth.db.users || []).find(u => String(u.id) === String(req.params.id))
      if (!user) { sendJson(res, 404, { error: 'Utilizatorul nu a fost găsit.' }); return }
      roles.forEach(role => ensureCanManageUser(auth.user, user, role))
      user.roles = roles
      user.role = roles[0]
      user.updatedAt = new Date().toISOString()
      addAudit(auth.db, auth.user, 'utilizator_roluri_schimbate', `${user.username} → ${roles.join(', ')}`)
      writeDb(auth.db)
      sendJson(res, 200, { user: adminUser(user) })
    } catch (e) { next(e) }
  })

  router.get('/users', (req, res) => {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'users:manage')) return
    sendJson(res, 200, { users: auth.db.users.map(adminUser) })
  })

  router.post('/users', async (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requirePermission(auth, res, 'users:manage')) return
      const body = await readJsonBody(req)
      const user = createUser(auth.db, auth.user, body)
      addAudit(auth.db, auth.user, 'utilizator_adaugat', `${user.username} / ${user.role}`)
      writeDb(auth.db)
      sendJson(res, 201, { user: adminUser(user) })
    } catch (error) {
      next(error)
    }
  })

  router.patch('/users/:id', async (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requirePermission(auth, res, 'users:manage')) return
      const body = await readJsonBody(req)
      const user = updateUser(auth.db, auth.user, req.params.id, body)
      addAudit(auth.db, auth.user, 'utilizator_modificat', `${user.username} / ${user.role}`)
      writeDb(auth.db)
      sendJson(res, 200, { user: adminUser(user) })
    } catch (error) {
      next(error)
    }
  })

  router.patch('/users/:id/reset-password', async (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requirePermission(auth, res, 'users:manage')) return
      const body = await readJsonBody(req)
      const user = resetUserPassword(auth.db, auth.user, req.params.id, body)
      addAudit(auth.db, auth.user, 'parola_utilizator_resetata', user.username)
      writeDb(auth.db)
      sendJson(res, 200, { user: adminUser(user) })
    } catch (error) {
      next(error)
    }
  })

  return router
}

module.exports = { createSystemUsersRouter }
