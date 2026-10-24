'use strict'
// Pure consistency check for an explicitly marked SYNTHETIC snapshot, NOT download authorization.
const crypto = require('node:crypto')
function fail(code) { const e = new Error(code); e.code = code; throw e }
function verifySyntheticSnapshotReferences(database, storage, { trialId, ownerId }) {
  if (typeof ownerId !== 'string' || !/^[a-zA-Z0-9_.:-]{1,100}$/.test(ownerId)) fail('snapshot_owner_invalid')
  const marker = database?.syntheticSnapshot
  if (!marker || marker.format !== 'infraflow-synthetic-joint-snapshot-v1' || marker.trialId !== trialId
    || database.settings?.demoTrialId !== trialId || Object.keys(marker).some(k => !['format','trialId','storageManifestSha256'].includes(k))
    || !/^[a-f0-9]{64}$/.test(marker.storageManifestSha256 || '') || !Buffer.isBuffer(storage?.manifestBytes)
    || crypto.createHash('sha256').update(storage.manifestBytes).digest('hex') !== marker.storageManifestSha256) fail('snapshot_manifest_mismatch')
  if (storage.status !== 'local_storage_manifest_verified' || !Array.isArray(storage.files)) fail('snapshot_storage_unverified')
  let manifest
  try { manifest = JSON.parse(storage.manifestBytes.toString('utf8')) } catch { fail('snapshot_manifest_mismatch') }
  if (manifest?.format !== 'infraflow-synthetic-storage-v1' || manifest.trialId !== trialId
    || !Array.isArray(manifest.files) || manifest.files.length !== storage.files.length) fail('snapshot_manifest_mismatch')
  for (const file of storage.files) {
    const entry = file && manifest.files.find(e => e?.name === file.name)
    if (!entry || !Buffer.isBuffer(file.bytes) || entry.bytes !== file.bytes.length
      || entry.sha256 !== crypto.createHash('sha256').update(file.bytes).digest('hex')) fail('snapshot_file_integrity_mismatch')
  }
  const documents = database.documents?.documents
  if (!Array.isArray(documents) || documents.length > 1000) fail('snapshot_documents_invalid')
  const files = new Set(storage.files.map(f => `storage/${f.name}`)), ids = new Set(), used = new Set()
  if (files.size !== storage.files.length) fail('snapshot_duplicate_file')
  for (const document of documents) {
    if (!document || typeof document.id !== 'string' || !/^[a-zA-Z0-9_.:-]{1,100}$/.test(document.id) || ids.has(document.id)) fail('snapshot_document_identity_invalid')
    ids.add(document.id)
    for (const field of ['fisier_draft_path','fisier_final_path']) {
      const reference = document[field]
      if (reference === null || reference === undefined || reference === '') continue
      if (document.creat_de !== ownerId) fail('snapshot_document_owner_mismatch')
      if (typeof reference !== 'string' || !files.has(reference)) fail('snapshot_file_reference_missing')
      if (used.has(reference)) fail('snapshot_duplicate_reference')
      used.add(reference)
    }
  }
  if (used.size !== files.size) fail('snapshot_orphan_files')
  return { documentCount: documents.length, fileCount: files.size, referencesConsistent: true, entityAccessVerified: false }
}
module.exports = { verifySyntheticSnapshotReferences }
