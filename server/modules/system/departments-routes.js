const { Router } = require('express')
const { requireAuth } = require('../../core/auth')
const { requireSuperadmin, adminDepartment } = require('../../core/permissions')
const { writeDb } = require('../../core/db')
const { addAudit } = require('../../core/audit')
const { createDepartmentChannel } = require('../messaging/routes')

function createSystemDepartmentsRouter(context) {
  const {
    readJsonBody,
    sendJson,
    throwHttp,
    id
  } = context

  const router = Router()

  router.get('/departments', (req, res) => {
    const auth = requireAuth(req, res)
    if (!auth) return
    sendJson(res, 200, { departments: (auth.db.departments || []).map(adminDepartment) })
  })

  router.post('/departments', async (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requireSuperadmin(auth, res)) return
      const body = await readJsonBody(req)
      const name = String(body.name || '').trim()
      if (!name) throwHttp(400, 'Numele departamentului este obligatoriu.')
      const color = String(body.culoare || body.color || '#3B82F6').trim() || '#3B82F6'
      const dept = {
        id: id('dept'),
        name,
        tip: String(body.tip || 'departament').trim() || 'departament',
        icon: String(body.icon || '👥').trim() || '👥',
        culoare: color,
        color,
        permissions: Array.isArray(body.permissions) ? body.permissions : [],
        createdBy: auth.user.id,
        createdAt: new Date().toISOString()
      }
      auth.db.departments.push(dept)
      addAudit(auth.db, auth.user, 'departament_creat', name)
      try { createDepartmentChannel(auth.db, dept) } catch (e) { console.warn('[messaging] Canal dept:', e.message) }
      writeDb(auth.db)
      sendJson(res, 201, { department: adminDepartment(dept) })
    } catch (error) {
      next(error)
    }
  })

  router.patch('/departments/:id', async (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requireSuperadmin(auth, res)) return
      const body = await readJsonBody(req)
      const dept = auth.db.departments.find(d => d.id === req.params.id)
      if (!dept) throwHttp(404, 'Departament inexistent.')
      if (body.name !== undefined) dept.name = String(body.name || '').trim()
      if (body.tip !== undefined) dept.tip = String(body.tip || 'departament').trim() || 'departament'
      if (body.icon !== undefined) dept.icon = String(body.icon || '👥').trim() || '👥'
      if (body.culoare !== undefined || body.color !== undefined) {
        dept.culoare = String(body.culoare || body.color || '#3B82F6').trim() || '#3B82F6'
        dept.color = dept.culoare
      }
      if (Array.isArray(body.permissions)) dept.permissions = body.permissions
      dept.updatedBy = auth.user.id
      dept.updatedAt = new Date().toISOString()
      addAudit(auth.db, auth.user, 'departament_modificat', dept.name)
      writeDb(auth.db)
      sendJson(res, 200, { department: adminDepartment(dept) })
    } catch (error) {
      next(error)
    }
  })

  router.put('/departments/:id', async (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requireSuperadmin(auth, res)) return
      const body = await readJsonBody(req)
      const dept = auth.db.departments.find(d => d.id === req.params.id)
      if (!dept) throwHttp(404, 'Departament inexistent.')
      if (body.name !== undefined) dept.name = String(body.name || '').trim()
      if (body.tip !== undefined) dept.tip = String(body.tip || 'departament').trim() || 'departament'
      if (body.icon !== undefined) dept.icon = String(body.icon || '👥').trim() || '👥'
      if (body.culoare !== undefined || body.color !== undefined) {
        dept.culoare = String(body.culoare || body.color || '#3B82F6').trim() || '#3B82F6'
        dept.color = dept.culoare
      }
      if (Array.isArray(body.permissions)) dept.permissions = body.permissions
      dept.updatedBy = auth.user.id
      dept.updatedAt = new Date().toISOString()
      addAudit(auth.db, auth.user, 'departament_modificat', dept.name)
      writeDb(auth.db)
      sendJson(res, 200, { department: adminDepartment(dept) })
    } catch (error) {
      next(error)
    }
  })

  router.delete('/departments/:id', (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requireSuperadmin(auth, res)) return
      const index = auth.db.departments.findIndex(d => d.id === req.params.id)
      if (index === -1) throwHttp(404, 'Departament inexistent.')
      const dept = auth.db.departments.splice(index, 1)[0]
      addAudit(auth.db, auth.user, 'departament_sters', dept.name)
      writeDb(auth.db)
      sendJson(res, 200, { success: true })
    } catch (error) {
      next(error)
    }
  })

  return router
}

module.exports = { createSystemDepartmentsRouter }
