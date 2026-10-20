'use strict'
const identity = value => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value) ? value.toLowerCase() : value

// Helper interne: numai DUPĂ validarea manifestului și a blocajelor sursei.
// Returnează date sensibile în memorie; nu se serializează în rapoarte/CLI.
function projectVerifiedSnapshot(source, manifest) {
  const projected = structuredClone(source)
  const maps = Object.fromEntries(['users', 'departments', 'modules'].map(name =>
    [name, new Map(manifest.mappings[name].map(e => [identity(e.source), identity(e.target)]))]))
  for (const name of ['departments', 'users']) {
    for (const row of projected[name]) {
      row.id = maps[name].get(identity(row.id))
      if (row.companyId === undefined && row.company_id === undefined) row.companyId = manifest.companyId
      if (name === 'departments') {
        for (const field of ['moduleKey', 'module_key']) if (row[field] !== undefined) row[field] = maps.modules.get(identity(row[field]))
      } else {
        for (const field of ['departmentId', 'department_id']) {
          if (row[field] !== undefined && row[field] !== null && row[field] !== '') row[field] = maps.departments.get(identity(row[field])) || row[field]
        }
      }
    }
  }
  return projected
}
module.exports = { projectVerifiedSnapshot }
