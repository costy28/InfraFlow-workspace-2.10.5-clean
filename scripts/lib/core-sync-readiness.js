'use strict'
const { validateCoreManifest } = require('./core-sync-manifest')
const { simulateCoreSync } = require('./core-sync-simulation')
const { analyzeCoreAuthorization } = require('./core-sync-authorization')

// Consolidare offline. Nicio constatare din teste anterioare nu este considerată
// dovadă despre snapshot-ul curent sau despre o instalație reală.
function analyzeCoreReadiness(source, target, manifest, fingerprints) {
  const sections = {}
  function evaluate(name, analyze, summarize) {
    try { sections[name] = summarize(analyze()) }
    catch { sections[name] = { status: 'blocked', code: 'analysis_failed' } }
  }
  evaluate('manifest', () => validateCoreManifest(source, target, manifest, fingerprints), r => ({
    status: r.mappingStatus === 'structurally_valid' ? 'review_required' : 'blocked',
    blockers: r.totals.blockers, sourceBaselineBlockers: r.baseline.totals.blockers,
    mappingStatus: r.mappingStatus, detailsTruncated: r.issuesTruncated || r.baseline.issuesTruncated
  }))
  evaluate('simulation', () => simulateCoreSync(source, target, manifest, fingerprints), r => ({
    status: r.status, performed: r.simulationPerformed,
    reconciliationBlockers: r.reconciliation?.totals.blockers ?? null,
    preservationBlockers: r.preservationReview.totals.blockers,
    uncoveredFields: r.preservationReview.totals.uncoveredFields,
    detailsTruncated: Boolean(r.reconciliation?.issuesTruncated || r.preservationReview.issuesTruncated)
  }))
  evaluate('authorization', () => analyzeCoreAuthorization(source, target, manifest, fingerprints), r => ({
    status: r.status, blockers: r.totals.blockers, comparedUsers: r.totals.comparedUsers,
    gainedGrants: r.totals.gainedGrants, lostGrants: r.totals.lostGrants,
    runtimeEquivalenceVerified: false, detailsTruncated: r.issuesTruncated || r.rowsTruncated
  }))
  const gates = [
    { code: 'live_schema_collation_and_concurrency', status: 'not_verified' },
    { code: 'persistent_importer_not_implemented', status: 'blocked' },
    { code: 'entity_access_authentication_and_sessions', status: 'not_verified' },
    { code: 'legacy_ids_and_cross_domain_links', status: 'not_verified' },
    { code: 'existing_secret_key_compatibility', status: 'not_verified' },
    { code: 'backup_restore_and_authorized_pilot_copy', status: 'not_verified' }
  ]
  return { format: 'infraflow-core-readiness-v1', mode: 'offline-read-only', status: 'blocked',
    writeAuthorized: false, pilotAuthorized: false, globalRelationalReadiness: false,
    sections, unresolvedGates: gates,
    snapshotChecksWithoutDetectedBlockers: Object.values(sections).filter(s => s.status === 'review_required').length,
    scope: 'core snapshot diagnostics only',
    evidencePolicy: 'historical synthetic test results do not authorize migration of these snapshots',
    nextSteps: ['resolve snapshot blockers using detailed diagnostics', 'implement and verify persistent importer only in isolated staging',
      'validate entity access and backup restoration', 'obtain explicit authorization and identify pilot copy'] }
}
module.exports = { analyzeCoreReadiness }
