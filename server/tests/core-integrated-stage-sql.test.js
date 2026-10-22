'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { createDocumentsSqlFixture } = require('./support/documents-sql-fixture')
const { integratedFixture } = require('./support/core-integrated-fixture')
const { createIntegratedStage, verifyIntegratedStage } = require('../../scripts/lib/core-integrated-stage-prototype')
test('staging sintetic integrat: salvare atomică, reconciliere, refuz incomplet și rollback', {
  skip: process.env.INFRAFLOW_TEST_RELATIONAL_SQL !== '1', timeout: 120000
}, () => {
  const sql = createDocumentsSqlFixture({ empty: true }), f = integratedFixture()
  const stage = createIntegratedStage(f.source, f.target, f.manifest, f.key)
  try {
    sql.sql(`CREATE TABLE dbo.stage_probe(id int PRIMARY KEY,format nvarchar(100) NOT NULL,capsule nvarchar(max) NOT NULL CHECK(ISJSON(capsule)=1));
      CREATE TABLE dbo.stage_user_probe(id uniqueidentifier PRIMARY KEY,stage_id int NOT NULL REFERENCES dbo.stage_probe(id),primary_role nvarchar(80) NOT NULL);
      CREATE TABLE dbo.stage_role_probe(user_id uniqueidentifier NOT NULL REFERENCES dbo.stage_user_probe(id),role_key nvarchar(80) NOT NULL,
        position int NOT NULL CHECK(position>=0),PRIMARY KEY(user_id,role_key),UNIQUE(user_id,position));
      CREATE TABLE dbo.stage_policy_probe(stage_id int NOT NULL REFERENCES dbo.stage_probe(id),section nvarchar(32) NOT NULL,entry_key nvarchar(200) NOT NULL,
        payload nvarchar(max) NOT NULL CHECK(ISJSON(payload)=1),PRIMARY KEY(stage_id,section,entry_key));
      SET XACT_ABORT ON; BEGIN TRY BEGIN TRAN;
      INSERT dbo.stage_probe SELECT 1,JSON_VALUE(@json,'$.format'),JSON_QUERY(@json,'$.capsule');
      INSERT dbo.stage_user_probe SELECT id,1,primaryRole FROM OPENJSON(@json,'$.users') WITH(id uniqueidentifier,primaryRole nvarchar(80));
      INSERT dbo.stage_role_probe SELECT u.id,l.roleKey,l.position FROM OPENJSON(@json,'$.users') WITH(id uniqueidentifier,links nvarchar(max) AS JSON) u
        CROSS APPLY OPENJSON(u.links) WITH(roleKey nvarchar(80),position int) l;
      INSERT dbo.stage_policy_probe SELECT 1,section,entry_key,payload FROM OPENJSON(@json,'$.policy.rows')
        WITH(section nvarchar(32),entry_key nvarchar(200) '$.key',payload nvarchar(max));
      COMMIT; SELECT 1; END TRY BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH;`, { jsonInput: JSON.stringify(stage) })
    const query = `SELECT s.format,JSON_QUERY(s.capsule) capsule,
      JSON_QUERY(COALESCE((SELECT CONVERT(nvarchar(36),u.id) id,u.primary_role primaryRole,
        JSON_QUERY(COALESCE((SELECT role_key roleKey,position FROM dbo.stage_role_probe r WHERE r.user_id=u.id ORDER BY position DESC FOR JSON PATH),N'[]')) links
        FROM dbo.stage_user_probe u WHERE u.stage_id=s.id FOR JSON PATH),N'[]')) users,
      JSON_QUERY((SELECT N'infraflow-policy-prototype-v1' format,
        JSON_QUERY(COALESCE((SELECT section,entry_key [key],payload FROM dbo.stage_policy_probe p WHERE p.stage_id=s.id ORDER BY section DESC,entry_key DESC FOR JSON PATH),N'[]')) rows
        FOR JSON PATH,WITHOUT_ARRAY_WRAPPER)) policy FROM dbo.stage_probe s WHERE s.id=1 FOR JSON PATH,WITHOUT_ARRAY_WRAPPER`
    const before = sql.sql(query + ';'), restored = JSON.parse(before)
    assert.ok(!before.includes('SYNTHETIC-SECRET'))
    const report = verifyIntegratedStage(restored, f.target, f.manifest, f.key)
    assert.equal(report.usersCompared, 1); assert.equal(report.writeAuthorized, false)
    // Citim deliberat un staging incomplet în tranzacție, apoi restaurăm SQL.
    const incomplete = sql.sql(`BEGIN TRAN; DELETE dbo.stage_policy_probe WHERE entry_key=N'rolePermissionOverrides';
      DECLARE @snapshot nvarchar(max)=(${query}); ROLLBACK; SELECT @snapshot;`)
    assert.throws(() => verifyIntegratedStage(JSON.parse(incomplete), f.target, f.manifest, f.key))
    assert.equal(sql.sql(query + ';'), before)
    const error = sql.sql(`SET XACT_ABORT ON; BEGIN TRY BEGIN TRAN;
      UPDATE dbo.stage_user_probe SET primary_role=N'operator';
      THROW 51000,N'Eșec sintetic după modificare parțială',1;
      COMMIT; END TRY BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; SELECT ERROR_NUMBER(); END CATCH;`)
    assert.equal(Number(error), 51000); assert.equal(sql.sql(query + ';'), before)
    const changedManifest = structuredClone(f.manifest); changedManifest.revision++
    assert.throws(() => verifyIntegratedStage(restored, f.target, changedManifest, f.key))
    assert.throws(() => verifyIntegratedStage(restored, Buffer.concat([f.target, Buffer.from(' ')]), f.manifest, f.key))
    assert.equal(verifyIntegratedStage(JSON.parse(sql.sql(query + ';')), f.target, f.manifest, f.key).decisionsCompared, report.decisionsCompared)
    console.log(`Staging integrat SQL OK: ${sql.database}; ${report.decisionsCompared} decizii, date incomplete refuzate și rollback identic după eșec parțial.`)
  } finally { f.key.fill(0) }
})
