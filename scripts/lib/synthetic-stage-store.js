'use strict'
const { fingerprint } = require('./core-sync-manifest')
const { verifyIntegratedStage } = require('./core-integrated-stage-prototype')
const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v)
const fail = () => { throw Error('Operațiunea de staging sintetic a fost refuzată sau nu a putut fi finalizată.') }

// Depozit experimental pentru artefacte de staging, NU import în tabelele ERP.
// Executorul este injectat de test; nu încarcă env, APP_KEY sau conexiuni runtime.
function createSyntheticStageStore({ database, sql, allowSyntheticStaging } = {}) {
  if (allowSyntheticStaging !== true || !/^INFRAFLOW_TEST_DOCS_[A-F0-9]{12}$/.test(database || '') || typeof sql !== 'function') fail()
  const guard = `IF DB_NAME()<>N'${database}' THROW 51001,N'Baza sintetică nu corespunde',1;`
  function execute(query, input) {
    try { return sql(guard + '\n' + query, input === undefined ? undefined : { jsonInput: JSON.stringify(input) }) }
    catch { fail() }
  }
  function runId(id) { if (!uuid(id)) fail(); return id.toLowerCase() }
  function load(id) {
    const raw = execute(`SELECT payload_hash hash,payload FROM dbo.synthetic_stage_runs WHERE run_id=CONVERT(uniqueidentifier,JSON_VALUE(@json,'$.runId')) AND state=N'applied' FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;`, { runId: id })
    try {
      const record = JSON.parse(raw)
      if (typeof record.payload !== 'string' || fingerprint(record.payload) !== record.hash) fail()
      return { stage: JSON.parse(record.payload), hash: record.hash, payload: record.payload }
    } catch { fail() }
  }
  return {
    initialize() {
      execute(`SET XACT_ABORT ON; BEGIN TRAN;
        IF OBJECT_ID(N'dbo.synthetic_stage_runs',N'U') IS NULL CREATE TABLE dbo.synthetic_stage_runs(
          run_id uniqueidentifier PRIMARY KEY, payload_hash char(64) NOT NULL,
          payload nvarchar(max) NOT NULL CHECK(ISJSON(payload)=1),
          state nvarchar(16) NOT NULL CHECK(state IN(N'applied',N'reverted')),created_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME());
        IF OBJECT_ID(N'dbo.synthetic_stage_journal',N'U') IS NULL CREATE TABLE dbo.synthetic_stage_journal(
          id bigint IDENTITY PRIMARY KEY,run_id uniqueidentifier NOT NULL,
          event nvarchar(20) NOT NULL CHECK(event IN(N'applied',N'reused',N'failed',N'reverted',N'revert_reused')),
          error_number int NULL,created_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME());
        IF OBJECT_ID(N'dbo.synthetic_stage_users',N'U') IS NULL CREATE TABLE dbo.synthetic_stage_users(
          run_id uniqueidentifier NOT NULL REFERENCES dbo.synthetic_stage_runs(run_id),user_id uniqueidentifier NOT NULL,
          primary_role nvarchar(80) NOT NULL,PRIMARY KEY(run_id,user_id));
        IF OBJECT_ID(N'dbo.synthetic_stage_roles',N'U') IS NULL CREATE TABLE dbo.synthetic_stage_roles(
          run_id uniqueidentifier NOT NULL,user_id uniqueidentifier NOT NULL,role_key nvarchar(80) NOT NULL,
          position int NOT NULL CHECK(position>=0),PRIMARY KEY(run_id,user_id,role_key),UNIQUE(run_id,user_id,position),
          FOREIGN KEY(run_id,user_id) REFERENCES dbo.synthetic_stage_users(run_id,user_id));
        IF OBJECT_ID(N'dbo.synthetic_stage_policies',N'U') IS NULL CREATE TABLE dbo.synthetic_stage_policies(
          run_id uniqueidentifier NOT NULL REFERENCES dbo.synthetic_stage_runs(run_id),section nvarchar(32) NOT NULL,
          entry_key nvarchar(200) NOT NULL,payload nvarchar(max) NOT NULL CHECK(ISJSON(payload)=1),PRIMARY KEY(run_id,section,entry_key));
        IF OBJECT_ID(N'dbo.synthetic_materialization_runs',N'U') IS NULL CREATE TABLE dbo.synthetic_materialization_runs(
          run_id uniqueidentifier PRIMARY KEY REFERENCES dbo.synthetic_stage_runs(run_id),payload_hash char(64) NOT NULL,policy_format nvarchar(100) NOT NULL);
        IF OBJECT_ID(N'dbo.synthetic_materialization_journal',N'U') IS NULL CREATE TABLE dbo.synthetic_materialization_journal(
          id bigint IDENTITY PRIMARY KEY,run_id uniqueidentifier NOT NULL,event nvarchar(16) NOT NULL,error_number int NULL,
          created_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME());
        COMMIT; SELECT N'initialized';`)
    },
    apply(id, stage, targetBytes, manifest, key, { injectFailure = false } = {}) {
      id = runId(id)
      // Validare înaintea oricărei scrieri. Nu înlătură blocajele de migrare reală.
      verifyIntegratedStage(stage, targetBytes, manifest, key)
      const serialized = JSON.stringify(stage)
      const input = { runId: id, hash: fingerprint(serialized), stage }
      const outcome = execute(`SET XACT_ABORT ON;
        DECLARE @id uniqueidentifier=JSON_VALUE(@json,'$.runId'),@hash char(64)=JSON_VALUE(@json,'$.hash');
        BEGIN TRY BEGIN TRAN;
          DECLARE @oldhash char(64),@state nvarchar(16),@oldpayload nvarchar(max),@incoming nvarchar(max)=JSON_QUERY(@json,'$.stage');
          SELECT @oldhash=payload_hash,@state=state,@oldpayload=payload FROM dbo.synthetic_stage_runs WITH(UPDLOCK,HOLDLOCK) WHERE run_id=@id;
          IF @oldhash IS NOT NULL BEGIN
            IF @oldhash<>@hash OR @state<>N'applied' OR DATALENGTH(@oldpayload)<>DATALENGTH(@incoming)
              OR @oldpayload COLLATE Latin1_General_100_BIN2<>@incoming COLLATE Latin1_General_100_BIN2
              THROW 51003,N'Identitate staging deja folosită',1;
            INSERT dbo.synthetic_stage_journal(run_id,event) VALUES(@id,N'reused');
            COMMIT; SELECT N'reused';
          END ELSE BEGIN
            INSERT dbo.synthetic_stage_runs(run_id,payload_hash,payload,state) VALUES(@id,@hash,JSON_QUERY(@json,'$.stage'),N'applied');
            INSERT dbo.synthetic_stage_journal(run_id,event) VALUES(@id,N'applied');
            ${injectFailure === true ? "THROW 51002,N'Eșec sintetic după inserare',1;" : ''}
            COMMIT; SELECT N'applied';
          END
        END TRY BEGIN CATCH
          DECLARE @error int=ERROR_NUMBER(); IF @@TRANCOUNT>0 ROLLBACK;
          INSERT dbo.synthetic_stage_journal(run_id,event,error_number) VALUES(@id,N'failed',@error);
          SELECT N'failed';
        END CATCH;`, input).trim()
      if (!['applied', 'reused'].includes(outcome)) fail()
      return { outcome, writeAuthorized: false, scope: 'synthetic artifact store only' }
    },
    reconcile(id, targetBytes, manifest, key) {
      id = runId(id)
      return verifyIntegratedStage(load(id).stage, targetBytes, manifest, key)
    },
    materialize(id, targetBytes, manifest, key, { injectFailure = false } = {}) {
      id = runId(id)
      const saved = load(id)
      verifyIntegratedStage(saved.stage, targetBytes, manifest, key)
      const outcome = execute(`SET XACT_ABORT ON; SET ANSI_WARNINGS ON;
        DECLARE @id uniqueidentifier=JSON_VALUE(@json,'$.runId'),@hash char(64)=JSON_VALUE(@json,'$.hash');
        BEGIN TRY BEGIN TRAN;
          DECLARE @payload nvarchar(max),@state nvarchar(16),@oldhash char(64),@storedhash char(64);
          SELECT @payload=payload,@state=state,@storedhash=payload_hash FROM dbo.synthetic_stage_runs WITH(UPDLOCK,HOLDLOCK) WHERE run_id=@id;
          IF @state IS NULL OR @state<>N'applied' OR @storedhash<>@hash OR DATALENGTH(@payload)<>DATALENGTH(JSON_QUERY(@json,'$.stage'))
            OR @payload COLLATE Latin1_General_100_BIN2<>JSON_QUERY(@json,'$.stage') COLLATE Latin1_General_100_BIN2
            THROW 51005,N'Lot schimbat după validare',1;
          DECLARE @users TABLE(user_id uniqueidentifier,primary_role nvarchar(max));
          DECLARE @roles TABLE(user_id uniqueidentifier,role_key nvarchar(max),position int);
          DECLARE @policies TABLE(section nvarchar(max),entry_key nvarchar(max),payload nvarchar(max));
          INSERT @users SELECT id,primaryRole FROM OPENJSON(@payload,'$.users') WITH(id uniqueidentifier,primaryRole nvarchar(max));
          INSERT @roles SELECT u.id,l.roleKey,l.position FROM OPENJSON(@payload,'$.users') WITH(id uniqueidentifier,links nvarchar(max) AS JSON) u
            CROSS APPLY OPENJSON(u.links) WITH(roleKey nvarchar(max),position int) l;
          INSERT @policies SELECT section,entry_key,payload FROM OPENJSON(@payload,'$.policy.rows') WITH(section nvarchar(max),entry_key nvarchar(max) '$.key',payload nvarchar(max));
          SELECT @oldhash=payload_hash FROM dbo.synthetic_materialization_runs WITH(UPDLOCK,HOLDLOCK) WHERE run_id=@id;
          IF @oldhash IS NOT NULL AND @oldhash<>@hash THROW 51006,N'Materializare diferită',1;
          IF @oldhash IS NULL BEGIN
            INSERT dbo.synthetic_stage_users SELECT @id,user_id,primary_role FROM @users;
            ${injectFailure === true ? "THROW 51007,N'Eșec sintetic după utilizatori',1;" : ''}
            INSERT dbo.synthetic_stage_roles SELECT @id,user_id,role_key,position FROM @roles;
            INSERT dbo.synthetic_stage_policies SELECT @id,section,entry_key,payload FROM @policies;
            INSERT dbo.synthetic_materialization_runs VALUES(@id,@hash,JSON_VALUE(@payload,'$.policy.format'));
          END
          IF EXISTS(SELECT 1 FROM dbo.synthetic_materialization_runs WHERE run_id=@id AND
              CONVERT(varbinary(max),policy_format)<>CONVERT(varbinary(max),JSON_VALUE(@payload,'$.policy.format')))
            OR EXISTS(SELECT user_id,CONVERT(varbinary(max),primary_role) FROM @users EXCEPT SELECT user_id,CONVERT(varbinary(max),primary_role) FROM dbo.synthetic_stage_users WHERE run_id=@id)
            OR EXISTS(SELECT user_id,CONVERT(varbinary(max),primary_role) FROM dbo.synthetic_stage_users WHERE run_id=@id EXCEPT SELECT user_id,CONVERT(varbinary(max),primary_role) FROM @users)
            OR EXISTS(SELECT user_id,CONVERT(varbinary(max),role_key),position FROM @roles EXCEPT SELECT user_id,CONVERT(varbinary(max),role_key),position FROM dbo.synthetic_stage_roles WHERE run_id=@id)
            OR EXISTS(SELECT user_id,CONVERT(varbinary(max),role_key),position FROM dbo.synthetic_stage_roles WHERE run_id=@id EXCEPT SELECT user_id,CONVERT(varbinary(max),role_key),position FROM @roles)
            OR EXISTS(SELECT CONVERT(varbinary(max),section),CONVERT(varbinary(max),entry_key),CONVERT(varbinary(max),payload) FROM @policies EXCEPT SELECT CONVERT(varbinary(max),section),CONVERT(varbinary(max),entry_key),CONVERT(varbinary(max),payload) FROM dbo.synthetic_stage_policies WHERE run_id=@id)
            OR EXISTS(SELECT CONVERT(varbinary(max),section),CONVERT(varbinary(max),entry_key),CONVERT(varbinary(max),payload) FROM dbo.synthetic_stage_policies WHERE run_id=@id EXCEPT SELECT CONVERT(varbinary(max),section),CONVERT(varbinary(max),entry_key),CONVERT(varbinary(max),payload) FROM @policies)
            THROW 51008,N'Rânduri relaționale nereconciliate',1;
          INSERT dbo.synthetic_materialization_journal(run_id,event) VALUES(@id,CASE WHEN @oldhash IS NULL THEN N'applied' ELSE N'reused' END);
          COMMIT; SELECT CASE WHEN @oldhash IS NULL THEN N'applied' ELSE N'reused' END;
        END TRY BEGIN CATCH
          DECLARE @error int=ERROR_NUMBER(); IF @@TRANCOUNT>0 ROLLBACK;
          INSERT dbo.synthetic_materialization_journal(run_id,event,error_number) VALUES(@id,N'failed',@error);
          SELECT N'failed';
        END CATCH;`, { runId: id, hash: saved.hash, stage: saved.stage }).trim()
      if (!['applied', 'reused'].includes(outcome)) fail()
      return { outcome, writeAuthorized: false, scope: 'synthetic relational staging only' }
    },
    reconcileMaterialized(id, targetBytes, manifest, key) {
      id = runId(id)
      const saved = load(id)
      verifyIntegratedStage(saved.stage, targetBytes, manifest, key)
      const raw = execute(`DECLARE @id uniqueidentifier=JSON_VALUE(@json,'$.runId');
        SELECT JSON_VALUE(s.payload,'$.format') format,JSON_QUERY(s.payload,'$.capsule') capsule,
          JSON_QUERY(COALESCE((SELECT CONVERT(nvarchar(36),u.user_id) id,u.primary_role primaryRole,
            JSON_QUERY(COALESCE((SELECT role_key roleKey,position FROM dbo.synthetic_stage_roles r WHERE r.run_id=@id AND r.user_id=u.user_id ORDER BY position FOR JSON PATH),N'[]')) links
            FROM dbo.synthetic_stage_users u WHERE u.run_id=@id ORDER BY u.user_id FOR JSON PATH),N'[]')) users,
          JSON_QUERY((SELECT m.policy_format format,JSON_QUERY(COALESCE((SELECT section,entry_key [key],payload FROM dbo.synthetic_stage_policies WHERE run_id=@id ORDER BY section,entry_key FOR JSON PATH),N'[]')) rows FOR JSON PATH,WITHOUT_ARRAY_WRAPPER)) policy
        FROM dbo.synthetic_stage_runs s JOIN dbo.synthetic_materialization_runs m ON s.run_id=m.run_id
        WHERE s.run_id=@id AND s.state=N'applied' AND s.payload_hash=m.payload_hash FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;`, { runId: id })
      try { return verifyIntegratedStage(JSON.parse(raw), targetBytes, manifest, key) } catch { fail() }
    },
    revert(id) {
      id = runId(id)
      const outcome = execute(`SET XACT_ABORT ON;
        DECLARE @id uniqueidentifier=JSON_VALUE(@json,'$.runId'),@state nvarchar(16);
        BEGIN TRY BEGIN TRAN;
          SELECT @state=state FROM dbo.synthetic_stage_runs WITH(UPDLOCK,HOLDLOCK) WHERE run_id=@id;
          IF @state IS NULL THROW 51004,N'Staging absent',1;
          IF @state=N'applied' BEGIN
            UPDATE dbo.synthetic_stage_runs SET state=N'reverted' WHERE run_id=@id;
            INSERT dbo.synthetic_stage_journal(run_id,event) VALUES(@id,N'reverted');
            COMMIT; SELECT N'reverted';
          END ELSE BEGIN
            INSERT dbo.synthetic_stage_journal(run_id,event) VALUES(@id,N'revert_reused');
            COMMIT; SELECT N'revert_reused';
          END
        END TRY BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; SELECT N'failed'; END CATCH;`, { runId: id }).trim()
      if (!['reverted', 'revert_reused'].includes(outcome)) fail()
      return { outcome, writeAuthorized: false }
    }
  }
}
module.exports = { createSyntheticStageStore }
