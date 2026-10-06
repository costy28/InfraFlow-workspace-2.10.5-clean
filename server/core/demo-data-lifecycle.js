const PROTECTED_ROOTS = new Set([
  'users', 'departments', 'devices', 'workstationRequests', 'settings', 'audit', 'demoInvites'
])

function purgeDemoOwnedData(db, userId) {
  const ownerId = String(userId || '').trim()
  const removedByCollection = {}
  if (!ownerId || !db || typeof db !== 'object') return { removed: 0, removedByCollection }

  const purge = (value, path = []) => {
    if (Array.isArray(value)) {
      const kept = []
      for (const item of value) {
        if (
          item && typeof item === 'object' && !Array.isArray(item) &&
          !PROTECTED_ROOTS.has(String(path[0] || '')) &&
          String(item.demoOwnerId || '') === ownerId
        ) {
          const collection = path.join('.') || 'date'
          removedByCollection[collection] = (removedByCollection[collection] || 0) + 1
          continue
        }
        kept.push(purge(item, path))
      }
      return kept
    }
    if (!value || typeof value !== 'object') return value
    for (const [key, child] of Object.entries(value)) value[key] = purge(child, [...path, key])
    return value
  }

  purge(db)
  const removed = Object.values(removedByCollection).reduce((total, count) => total + count, 0)
  return { removed, removedByCollection }
}

module.exports = { purgeDemoOwnedData }
