'use strict'
// Prototip intern, fără DB/CLI. Nu este folosit de autorizarea aplicației.
const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v)
const fail = () => { throw Error('Asocierile de roluri necesită verificare explicită.') }
function role(value, catalog) {
  if (typeof value !== 'string' || !value.trim() || !catalog.has(value.trim())) fail()
  return value.trim()
}
function encodeRoleLinks(user, catalog) {
  if (!(catalog instanceof Set) || !uuid(user?.id) || (user.roles !== undefined && !Array.isArray(user.roles))) fail()
  const primaryRole = role(user.role, catalog), seen = new Set(), links = []
  for (const [position, value] of (user.roles || []).entries()) {
    const roleKey = role(value, catalog)
    if (!seen.has(roleKey)) { links.push({ roleKey, position }); seen.add(roleKey) }
  }
  return { primaryRole, links }
}
function decodeRoleLinks(primary, links, catalog) {
  if (!(catalog instanceof Set) || !Array.isArray(links)) fail()
  const primaryRole = role(primary, catalog), seen = new Set(), positions = new Set()
  const roles = links.map(link => {
    if (!link || !Number.isSafeInteger(link.position) || link.position < 0 || link.position > 2147483647) fail()
    const roleKey = role(link.roleKey, catalog)
    if (seen.has(roleKey) || positions.has(link.position)) fail()
    seen.add(roleKey); positions.add(link.position)
    return { roleKey, position: link.position }
  }).sort((a, b) => a.position - b.position).map(link => link.roleKey)
  return { role: primaryRole, roles }
}
module.exports = { encodeRoleLinks, decodeRoleLinks }
