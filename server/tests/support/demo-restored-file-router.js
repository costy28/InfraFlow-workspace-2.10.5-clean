'use strict'
// Test-only, deliberately owner-only adapter. Not a production Documente endpoint.
const { Router } = require('../../node_modules/express')
const { requireAuth } = require('../../core/auth')
const { authHasPermission } = require('../../core/permissions')
const { readVerifiedSyntheticStorage } = require('./demo-storage-inventory')
const { verifySyntheticSnapshotReferences } = require('../../../scripts/lib/demo-snapshot-references')
function createRestoredFileRouter(directory, trialId) {
  if (process.env.NODE_ENV !== 'test') throw Error('synthetic_test_only')
  const router = Router()
  router.get('/synthetic-documents/:id/file/:kind', async (req, res) => {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!authHasPermission(auth, 'documents:view_own')) return res.sendStatus(403)
    const document = auth.db.documents?.documents?.find(d => d.id === req.params.id)
    if (!document || document.creat_de !== auth.user.id) return res.sendStatus(404)
    const field = { draft: 'fisier_draft_path', final: 'fisier_final_path' }[req.params.kind]
    if (!field || !document[field] || Object.keys(req.query).length) return res.sendStatus(404)
    try {
      const storage = await readVerifiedSyntheticStorage(directory, trialId)
      verifySyntheticSnapshotReferences(auth.db, storage, { trialId, ownerId: auth.user.id })
      const file = storage.files.find(f => `storage/${f.name}` === document[field])
      if (!file) return res.sendStatus(404)
      res.set({ 'Content-Type': 'application/octet-stream', 'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store', 'Content-Disposition': 'attachment' })
      res.send(file.bytes)
    } catch { res.status(409).json({ code: 'synthetic_file_unverified' }) }
  })
  return router
}
module.exports = { createRestoredFileRouter }
