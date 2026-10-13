const test = require('node:test')
const assert = require('node:assert/strict')
const {
  MODULE_GROUPS,
  MODULE_ALIASES,
  BASE_MODULE_KEYS,
  CONFIGURABLE_MODULE_KEYS,
  canonicalModuleKey,
  licenseModuleKeys,
  allowedModulesForLicense,
  effectiveEntitlements,
} = require('../core/module-catalog')

test('catalogul canonic nu conține chei duplicate și acoperă aliasurile declarate', () => {
  const keys = MODULE_GROUPS.flatMap(group => group.modules.map(module => module.key))
  assert.equal(new Set(keys).size, keys.length)
  assert.ok(keys.length > 20)
  for (const [canonical, aliases] of Object.entries(MODULE_ALIASES)) {
    assert.ok(keys.includes(canonical) || BASE_MODULE_KEYS.has(canonical), canonical)
    aliases.forEach(alias => assert.equal(canonicalModuleKey(alias), canonical, alias))
  }
})

test('licențele vechi și noi sunt normalizate în aceleași module', () => {
  assert.deepEqual(
    licenseModuleKeys({ module: ['mechanization'], modules: ['sales_automation'], addons: ['AI Assistant'] }).sort(),
    ['ai', 'crm', 'fleet']
  )
  assert.deepEqual(licenseModuleKeys({ modules: ['fleet', 'crm', 'ai'] }).sort(), ['ai', 'crm', 'fleet'])
})

test('modulele permise includ Core și canonizează aliasurile comerciale', () => {
  const allowed = allowedModulesForLicense({ module: ['contracts', 'contabilitate'] })
  ;['core', 'inventory', 'production', 'reports', 'system', 'contract_management', 'accounting'].forEach(key => assert.ok(allowed.includes(key), key))
  assert.equal(allowed.includes('crm'), false)
  assert.equal(allowedModulesForLicense({ modules: ['all'] }).length, BASE_MODULE_KEYS.size + CONFIGURABLE_MODULE_KEYS.size)
})

test('effectiveEntitlements intersectează licența cu activarea organizației', () => {
  const result = effectiveEntitlements({
    license: { modules: ['sales', 'documents'] },
    settings: { modules_enabled: ['crm', 'documents', 'hr'] },
  })
  assert.ok(result.effective_modules.includes('crm'))
  assert.ok(result.effective_modules.includes('documents'))
  assert.equal(result.effective_modules.includes('hr'), false)
  assert.ok(result.effective_modules.includes('core'))
  assert.deepEqual(result.configured_modules.sort(), ['crm', 'documents', 'hr'])
})
