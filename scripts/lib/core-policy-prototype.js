'use strict'
const { allPermissions } = require('../../server/core/permissions')
const { isDeepStrictEqual } = require('node:util')
const FORMAT = 'infraflow-policy-prototype-v1'
const fields = ['license', 'modules_enabled', 'customRoles', 'rolePermissionOverrides']
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const fail = () => { throw Error('Configurația politicilor necesită verificare explicită.') }
function verify(settings, departments) {
  const catalog = new Set(allPermissions)
  if (!object(settings) || !object(settings.license) || !Array.isArray(settings.modules_enabled) || settings.modules_enabled.some(v => typeof v !== 'string' || !v) || !Array.isArray(settings.customRoles) || !object(settings.rolePermissionOverrides) || !Array.isArray(departments)) fail()
  const permissions = value => Array.isArray(value) && value.every(p => typeof p === 'string' && catalog.has(p))
  const roles = new Set(), ids = new Set()
  for (const r of settings.customRoles) {
    if (!object(r) || typeof r.id !== 'string' || !r.id || roles.has(r.id) || !permissions(r.permissions)) fail()
    roles.add(r.id)
  }
  for (const value of Object.values(settings.rolePermissionOverrides)) if (!permissions(value)) fail()
  for (const d of departments) {
    if (!object(d) || typeof d.id !== 'string' || !d.id || d.id.length > 200 || ids.has(d.id)) fail()
    if (Object.hasOwn(d, 'permissions') && d.permissions !== null && !permissions(d.permissions)) fail()
    ids.add(d.id)
  }
}
// Exclusiv prototip intern. Payload-urile pot fi sensibile; nu se loghează.
function encodePolicyContext(db) {
  try {
    verify(db?.settings, db?.departments)
    const serialize = value => {
      const payload = JSON.stringify(value)
      if (!isDeepStrictEqual(JSON.parse(payload), value)) fail()
      return payload
    }
    const rows = fields.map(key => ({ section: 'settings', key, payload: serialize(db.settings[key]) }))
    for (const d of db.departments) {
      const value = Object.hasOwn(d, 'permissions') ? { permissions: d.permissions } : {}
      rows.push({ section: 'department', key: d.id, payload: serialize(value) })
    }
    return { format: FORMAT, rows }
  } catch { fail() }
}
function decodePolicyContext(input) {
  try {
    if (!object(input) || input.format !== FORMAT || !Array.isArray(input.rows)) fail()
    const settings = {}, departments = [], seen = new Set()
    for (const row of input.rows) {
      if (!object(row) || typeof row.key !== 'string' || typeof row.payload !== 'string' || !['settings', 'department'].includes(row.section)) fail()
      const identity = JSON.stringify([row.section, row.key])
      if (seen.has(identity)) fail()
      seen.add(identity)
      const value = JSON.parse(row.payload)
      if (row.section === 'settings') {
        if (!fields.includes(row.key)) fail()
        settings[row.key] = value
      } else {
        if (!object(value) || Object.keys(value).some(k => k !== 'permissions')) fail()
        departments.push({ id: row.key, ...value })
      }
    }
    if (fields.some(k => !Object.hasOwn(settings, k))) fail()
    verify(settings, departments)
    return { settings, departments }
  } catch { fail() }
}
module.exports = { encodePolicyContext, decodePolicyContext }
