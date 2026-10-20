'use strict'
const { validateCoreManifest } = require('./core-sync-manifest')
const { analyzeCoreSync } = require('./core-sync-preflight')
const { projectVerifiedSnapshot } = require('./core-sync-projection')
const { analyzeCorePreservation } = require('./core-sync-preservation')

// Proiecția privată există numai în memorie. Nu este returnată sau serializată.
function simulateCoreSync(source, target, manifest, fingerprints) {
  const validation = validateCoreManifest(source, target, manifest, fingerprints)
  const preservationReview = analyzeCorePreservation(source)
  const result = { format: 'infraflow-core-sync-simulation-v1', mode: 'read-only',
    writeAuthorized: false, globalRelationalReadiness: false, status: 'blocked',
    simulationPerformed: false, validation, preservationReview }
  if (validation.mappingStatus !== 'structurally_valid') return result
  // Numai aceste incompatibilități pot fi reevaluate după aplicarea mapării.
  // Verificăm totalul, nu doar lista trunchiată: un blocaj ascuns oprește simularea.
  const mappable = new Set(['uuid_mapping_required', 'department_uuid_mapping_required', 'department_reference_missing', 'module_mapping_required'])
  const baseline = validation.baseline
  if (baseline.issuesTruncated || baseline.issues.some(i => i.severity === 'blocker' && !mappable.has(i.code))) return result
  const projected = projectVerifiedSnapshot(source, manifest)
  const reconciliation = analyzeCoreSync(projected, target, { companyId: manifest.companyId })
  return { ...result, simulationPerformed: true, status: preservationReview.totals.blockers ? 'blocked' : reconciliation.status, reconciliation,
    preservation: { sourceModified: false, targetModified: false, unmappedFieldsRetainedInMemory: true, projectedDataExported: false },
    notEvaluated: ['SQL schema and collation', 'permission equivalence', 'credential validity', 'live concurrency', 'staging and import', 'references from other domains'] }
}
module.exports = { simulateCoreSync }
