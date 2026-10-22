'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { createDocumentsSqlFixture } = require('./support/documents-sql-fixture')
const { encryptSettingSecretWithKey, decryptSettingSecretWithKey } = require('../core/settings-crypto')

test('MSSQL backup CHECKSUM/restaurare păstrează app_state și datele relaționale sintetice', {
  skip: process.env.INFRAFLOW_TEST_BACKUP_SQL !== '1', timeout: 180000,
}, () => {
  const f = createDocumentsSqlFixture({ empty: true })
  assert.match(f.database, /^INFRAFLOW_TEST_DOCS_[A-F0-9]{12}$/)
  const key = crypto.randomBytes(32).toString('hex')
  const secret = crypto.randomBytes(24).toString('hex')
  const state = { settings: { smtp_password_encrypted: encryptSettingSecretWithKey(secret, key) },
    users: [{ id: 'synthetic', active: true }], crm: { offers: [{ id: 'synthetic-offer' }] },
    documents: { documents: [{ id: 'synthetic-document' }] }, messaging: { channels: [] } }
  f.sql(`CREATE TABLE dbo.app_state(id int PRIMARY KEY,payload nvarchar(max));
    INSERT dbo.app_state VALUES(1,@json);
    CREATE TABLE dbo.backup_probe(id int PRIMARY KEY,label nvarchar(100));
    INSERT dbo.backup_probe VALUES(1,N'before-backup');`, { jsonInput: JSON.stringify(state) })
  // SQL Server writes into its own configured backup directory. No real application files.
  const backupPath = f.sql(`DECLARE @p nvarchar(4000)=CONVERT(nvarchar(4000),SERVERPROPERTY('InstanceDefaultBackupPath'));
    IF @p IS NULL THROW 50000,'Backup directory unavailable',1;
    SELECT @p + CASE WHEN RIGHT(@p,1) IN ('\\','/') THEN '' ELSE '\\' END + N'${f.database}.bak';`).trim()
  assert.ok(backupPath.endsWith(`${f.database}.bak`))
  const escapedPath = backupPath.replace(/'/g, "''")
  f.sql(`BACKUP DATABASE [${f.database}] TO DISK=N'${escapedPath}' WITH INIT,CHECKSUM;
    RESTORE VERIFYONLY FROM DISK=N'${escapedPath}' WITH CHECKSUM;`)
  f.sql(`UPDATE dbo.app_state SET payload=N'{}'; UPDATE dbo.backup_probe SET label=N'after-backup';`)
  f.sql(`USE master;
    ALTER DATABASE [${f.database}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    BEGIN TRY
      RESTORE DATABASE [${f.database}] FROM DISK=N'${escapedPath}' WITH REPLACE,RECOVERY,CHECKSUM;
      ALTER DATABASE [${f.database}] SET MULTI_USER;
    END TRY BEGIN CATCH
      ALTER DATABASE [${f.database}] SET MULTI_USER; THROW;
    END CATCH;`)
  const restored = JSON.parse(f.sql('SELECT payload FROM dbo.app_state WHERE id=1;'))
  assert.equal(JSON.stringify(restored) === JSON.stringify(state), true, 'Snapshot sintetic identic')
  assert.equal(decryptSettingSecretWithKey(restored.settings.smtp_password_encrypted, key) === secret, true)
  assert.equal(f.sql('SELECT label FROM dbo.backup_probe WHERE id=1;').trim(), 'before-backup')
  console.log('Backup nativ verificat și restaurat exclusiv în baza sintetică; fișierul .bak este păstrat.')
})
