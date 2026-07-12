const { Router } = require('express')
const { requireAuth } = require('../../core/auth')
const { requireSuperadmin } = require('../../core/permissions')
const {
  writeDb,
  runMssqlScalar: coreRunMssqlScalar,
  closeMssqlPool: coreCloseMssqlPool,
  ensureMssqlDatabase: coreEnsureMssqlDatabase,
  getMssqlRelationalStatus: coreGetMssqlRelationalStatus,
  prepareMssqlRelationalSchema: corePrepareMssqlRelationalSchema
} = require('../../core/db')
const { addAudit } = require('../../core/audit')
const { syncAccountingToMssql } = require('../accounting/relational-sync')

function createSystemDatabaseRouter(context) {
  const {
    readJsonBody,
    sendJson,
    publicDatabaseConfig,
    normalizeDatabaseConfig,
    buildDatabaseConnectionString,
    writeDatabaseRuntimeEnv,
    applyDatabaseRuntimeEnv,
    safeDatabaseHealth
  } = context

  const router = Router()

  router.get('/system/database-config', (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requireSuperadmin(auth, res)) return
      sendJson(res, 200, {
        config: publicDatabaseConfig(),
        health: safeDatabaseHealth()
      })
    } catch (error) {
      next(error)
    }
  })

  router.post('/system/database-config/test', async (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requireSuperadmin(auth, res)) return
      const body = await readJsonBody(req)
      const normalized = normalizeDatabaseConfig(body, false)
      const connectionString = buildDatabaseConnectionString(normalized)
      const result = coreRunMssqlScalar('select db_name() + \':\' + system_user;', { connectionString }).trim()
      sendJson(res, 200, {
        ok: true,
        message: 'Conexiunea SQL Server functioneaza.',
        identity: result,
        config: publicDatabaseConfig(normalized)
      })
    } catch (error) {
      next(error)
    }
  })

  router.post('/system/database-config', async (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requireSuperadmin(auth, res)) return
      const body = await readJsonBody(req)
      const normalized = normalizeDatabaseConfig(body, true)
      const connectionString = buildDatabaseConnectionString(normalized)
      const result = coreRunMssqlScalar('select db_name() + \':\' + system_user;', { connectionString }).trim()
      writeDatabaseRuntimeEnv(normalized, connectionString)
      applyDatabaseRuntimeEnv(normalized, connectionString)
      coreEnsureMssqlDatabase()
      await coreCloseMssqlPool()
      addAudit(auth.db, auth.user, 'configurare_mssql_actualizata', `${normalized.server} / ${normalized.database} / ${normalized.authMode}`)
      try { writeDb(auth.db) } catch (auditError) { console.warn('Audit configurare MSSQL nu a putut fi salvat:', auditError.message) }
      sendJson(res, 200, {
        ok: true,
        message: 'Configuratia SQL Server a fost salvata. Reporneste serverul pentru a folosi garantat configuratia la startup.',
        identity: result,
        config: publicDatabaseConfig(normalized),
        health: safeDatabaseHealth(),
        needsRestart: true
      })
    } catch (error) {
      next(error)
    }
  })

  router.get('/system/database-schema', (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requireSuperadmin(auth, res)) return
      sendJson(res, 200, coreGetMssqlRelationalStatus())
    } catch (error) {
      next(error)
    }
  })

  router.post('/system/database-schema/prepare', (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requireSuperadmin(auth, res)) return
      const result = corePrepareMssqlRelationalSchema()
      addAudit(auth.db, auth.user, 'schema_sql_pregatita', `${result.status?.tableCount || 0} tabele`)
      try { writeDb(auth.db) } catch (auditError) { console.warn('Audit schema SQL nu a putut fi salvat:', auditError.message) }
      sendJson(res, 200, {
        ok: true,
        message: 'Tabelele SQL relationale au fost create sau actualizate.',
        ...result
      })
    } catch (error) {
      next(error)
    }
  })

  router.post('/system/database-schema/sync-accounting', (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requireSuperadmin(auth, res)) return
      const result = syncAccountingToMssql(auth.db, auth.user)
      addAudit(auth.db, auth.user, 'schema_sql_contabilitate_sincronizata', JSON.stringify(result.counts || {}))
      try { writeDb(auth.db) } catch (auditError) { console.warn('Audit sync contabilitate SQL nu a putut fi salvat:', auditError.message) }
      sendJson(res, 200, result)
    } catch (error) {
      next(error)
    }
  })

  return router
}

module.exports = { createSystemDatabaseRouter }
