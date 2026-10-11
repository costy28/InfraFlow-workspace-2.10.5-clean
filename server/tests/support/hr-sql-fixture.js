// Synthetic schema: actual SQL statements and SQL Server, mocked app-state/auth.
const { execFileSync } = require('node:child_process')
const crypto = require('node:crypto')
function createSqlFixture() {
  const database = `INFRAFLOW_TEST_HR_${crypto.randomBytes(6).toString('hex').toUpperCase()}`
  if (!/^INFRAFLOW_TEST_HR_[A-F0-9]{12}$/.test(database)) throw new Error('Nume bază test invalid')
  function run(databaseName, query, options = {}) {
    const script = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Data;
      $c=New-Object System.Data.SqlClient.SqlConnection('Server=.\\SQLEXPRESS;Database=${databaseName};Integrated Security=True;TrustServerCertificate=True;Connect Timeout=5');
      try { $c.Open(); $q=$c.CreateCommand(); $q.CommandTimeout=15;
        $q.CommandText=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:TEST_SQL));
        $p=$q.Parameters.Add('@json',[Data.SqlDbType]::NVarChar,-1); $p.Value=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:TEST_JSON));
        $r=$q.ExecuteReader(); $b=New-Object Text.StringBuilder;
        while($r.Read()){[void]$b.Append([string]$r.GetValue(0))}; $r.Close(); [Console]::Write($b.ToString())
      } finally {$c.Dispose()}`
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 20000, env: { ...process.env, TEST_SQL: Buffer.from(query).toString('base64'), TEST_JSON: Buffer.from(options.jsonInput || '{}').toString('base64') } })
  }
  run('master', `CREATE DATABASE [${database}]`)
  run(database, `EXEC(N'CREATE SCHEMA core');`)
  run(database, `EXEC(N'CREATE SCHEMA hr');`)
  run(database, `
    CREATE TABLE core.departments(id int PRIMARY KEY,cod nvarchar(80),denumire nvarchar(100));
    INSERT core.departments VALUES(1,'D1','Unu'),(2,'D2','Doi');
    CREATE TABLE hr.employees(id int PRIMARY KEY,user_id nvarchar(80),nume nvarchar(80),prenume nvarchar(80),activ bit,department_id int,department_cod nvarchar(80),data_angajare date,cnp nvarchar(80),updated_at datetime2);
    INSERT hr.employees VALUES(1,'u1','Propriu','',1,1,'D1','2026-01-01','secret1',NULL),(2,'u2','Altul','',1,1,'D1','2026-01-01','secret2',NULL);
    ALTER TABLE hr.employees ADD functia nvarchar(100) NULL;
    CREATE TABLE hr.contracts(id int PRIMARY KEY,employee_id int,salariu_baza decimal(15,2),status nvarchar(80),data_start date);
    INSERT hr.contracts VALUES(1,1,1000,'activ','2026-01-01'),(2,2,2000,'activ','2026-01-01');
    CREATE TABLE hr.department_transfers(id int IDENTITY PRIMARY KEY,uuid nvarchar(80),employee_id int,dept_vechi nvarchar(80),dept_nou nvarchar(80),data_transfer date,motiv nvarchar(max),aprobat_de nvarchar(80));
  `)
  console.log(`Bază SQL sintetică păstrată: ${database}`)
  return (query, options) => run(database, query, options)
}
module.exports = { createSqlFixture }
