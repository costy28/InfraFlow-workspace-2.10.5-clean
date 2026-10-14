const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..', '..')
const source = relative => fs.readFileSync(path.join(root, relative), 'utf8')

test('loginul, configurarea inițială și sesiunea expun aceleași entitlements', () => {
  const authRoutes = source('server/core/auth-routes.js')
  const auth = source('server/core/auth.js')

  assert.match(authRoutes, /entitlementsForDb\(db\)/)
  assert.match(authRoutes, /entitlementsForDb\(result\.db\)/)
  assert.match(authRoutes, /router\.get\('\/session'[\s\S]*entitlements: auth\.entitlements/)
  assert.match(auth, /effectivePermissionsForUser\(user, db, entitlements\)/)
})

test('navigarea folosește lista canonică din sesiune fără tabele locale de aliasuri', () => {
  const settingsHook = source('client/src/hooks/useSettings.js')
  const sidebar = source('client/src/components/layout/Sidebar.jsx')
  const search = source('client/src/components/layout/GlobalSearch.jsx')

  assert.match(settingsHook, /user\?\.entitlements\?\.effective_modules/)
  assert.doesNotMatch(sidebar, /moduleActiveAliases/)
  assert.doesNotMatch(search, /const moduleAliases/)
  assert.match(sidebar, /moduleKey: 'fleet', accessKey: 'mechanization'/)
  assert.match(sidebar, /moduleKey: 'procurement', accessKey: 'referate'/)
  assert.match(search, /return enabled\.has\(item\.moduleKey\)/)
})
