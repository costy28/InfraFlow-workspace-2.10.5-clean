'use strict'
const { execFile } = require('node:child_process'), { promisify } = require('node:util'), crypto = require('node:crypto')
const exec = promisify(execFile)
const { assertTestDatabase } = require('../../core/demo-trial-sql-test-store')
async function createTrialSqlFixture() {
  const database = `INFRAFLOW_TEST_TRIALS_${crypto.randomBytes(6).toString('hex').toUpperCase()}`
  assertTestDatabase(database)
  async function execute(target, sql, input = {}) {
    if (target !== database && !(target === 'master' && sql === `CREATE DATABASE [${database}]; SELECT 1;`)) throw Error('synthetic_sql_target_refused')
    assertTestDatabase(database)
    const json = JSON.stringify(input)
    if (Buffer.byteLength(json) > 20000 || Buffer.byteLength(sql) > 20000) throw Error('synthetic_sql_payload_limit')
    const env = {}
    for (const key of ['SystemRoot','WINDIR','PATH','TEMP','TMP','USERPROFILE']) if (process.env[key]) env[key] = process.env[key]
    env.TEST_SQL = Buffer.from(sql).toString('base64'); env.TEST_JSON = Buffer.from(json).toString('base64')
    const script = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Data;
      $c=New-Object System.Data.SqlClient.SqlConnection('Server=.\\SQLEXPRESS;Database=${target};Integrated Security=True;TrustServerCertificate=True;Connect Timeout=5');
      try { $c.Open(); $q=$c.CreateCommand(); $q.CommandTimeout=15;
        $q.CommandText=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:TEST_SQL));
        $p=$q.Parameters.Add('@json',[Data.SqlDbType]::NVarChar,-1); $p.Value=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:TEST_JSON));
        $r=$q.ExecuteReader(); $b=New-Object Text.StringBuilder;
        while($r.Read()){[void]$b.Append([string]$r.GetValue(0))}; $r.Close(); [Console]::Write($b.ToString())
      } catch { $n=$_.Exception.GetBaseException().Number; if($null -eq $n){$n=-1}; [Console]::Write('{"sqlError":'+$n+'}') }
      finally {$c.Dispose()}`
    let output
    try { output = (await exec('powershell.exe', ['-NoProfile','-NonInteractive','-Command',script], { env, encoding: 'utf8', timeout: 25000, maxBuffer: 1024 * 1024, windowsHide: true })).stdout }
    catch { throw Object.assign(Error('synthetic_sql_process_failed'), { code: 'synthetic_sql_process_failed' }) }
    if (output.startsWith('{"sqlError":')) throw Object.assign(Error('synthetic_sql_execution_failed'), { code: 'synthetic_sql_execution_failed', sqlNumber: JSON.parse(output).sqlError })
    return output
  }
  await execute('master', `CREATE DATABASE [${database}]; SELECT 1;`)
  console.log(`Bază SQL sintetică nouă, păstrată pentru inspecție: ${database}`)
  return { database, execute }
}
module.exports = { createTrialSqlFixture }
