'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const { execFile } = require('node:child_process'), { promisify } = require('node:util'), crypto = require('node:crypto')
const exec = promisify(execFile)

test('SQL isolation: loginuri reale A/B, canari separați, refuz vecin/control plane și cleanup exact', {
  skip: process.env.INFRAFLOW_TEST_SQL_ISOLATION !== '1', timeout: 150000,
}, async () => {
  assert.equal(process.platform, 'win32', 'Fixture local Windows numai')
  const runId = crypto.randomBytes(6).toString('hex').toUpperCase()
  const prefix = `INFRAFLOW_TEST_ISO_${runId}`
  assert.match(prefix, /^INFRAFLOW_TEST_ISO_[A-F0-9]{12}$/)
  const env = {}
  for (const key of ['SystemRoot','WINDIR','PATH','TEMP','TMP','USERPROFILE']) if (process.env[key]) env[key] = process.env[key]
  env.ISO_PREFIX = prefix
  env.ISO_SECRET_A = crypto.randomBytes(32).toString('hex')
  env.ISO_SECRET_B = crypto.randomBytes(32).toString('hex')
  console.log('Resurse temporare SQL ale rulării:', `${prefix}_{A,B,CP}; loginuri ${prefix}_{A,B}`)
  const script = String.raw`
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Data
$prefix=$env:ISO_PREFIX
if($prefix -cnotmatch '^INFRAFLOW_TEST_ISO_[A-F0-9]{12}$'){throw 'invalid_prefix'}
$createdDb=[Collections.Generic.List[string]]::new()
$createdLogin=[Collections.Generic.List[string]]::new()
$result=[ordered]@{passed=$false;cleanup=$false;positive=0;denied=0;adminDenied=0;badPasswordDenied=0;canariesPreserved=$false;error=$null;stage='connect';sqlNumber=$null;errorType=$null;remaining=@()}
function Connect-Admin {
  $c=[Data.SqlClient.SqlConnection]::new('Server=.\SQLEXPRESS;Database=master;Integrated Security=True;TrustServerCertificate=True;Connect Timeout=5')
  $c.Open();return $c
}
function Scalar($c,[string]$sql) {
  $q=$c.CreateCommand();$q.CommandTimeout=15;$q.CommandText=$sql
  try{return $q.ExecuteScalar()}finally{$q.Dispose()}
}
function Connect-Runtime([string]$name,[string]$password) {
  $b=[Data.SqlClient.SqlConnectionStringBuilder]::new()
  $b['Data Source']='.\SQLEXPRESS';$b['Initial Catalog']=$name;$b['User ID']=$name;$b['Password']=$password
  $b['Integrated Security']=$false;$b['TrustServerCertificate']=$true;$b['Connect Timeout']=5;$b['Pooling']=$false
  $c=[Data.SqlClient.SqlConnection]::new($b.ConnectionString);$c.Open();return $c
}
function Expect-Denied($c,[string]$sql) {
  try { [void](Scalar $c $sql) } catch {
    $e=$_.Exception.GetBaseException()
    if($e -is [Data.SqlClient.SqlException] -and $e.Number -in @(916,229)){return}
    throw 'unexpected_denial_category'
  }
  throw 'cross_access_allowed'
}
$admin=$null
try {
  $admin=Connect-Admin
  $result.stage='collision_check'
  foreach($suffix in @('A','B','CP')) {
    $name=$prefix+'_'+$suffix
    $result.stage='create_database_'+$suffix
    if((Scalar $admin "SELECT COUNT(*) FROM sys.databases WHERE name=N'$name'") -ne 0){throw 'resource_collision'}
  }
  foreach($suffix in @('A','B')) {
    $name=$prefix+'_'+$suffix
    if((Scalar $admin "SELECT COUNT(*) FROM sys.server_principals WHERE name=N'$name'") -ne 0){throw 'resource_collision'}
  }
  foreach($suffix in @('A','B','CP')) {
    $name=$prefix+'_'+$suffix
    [void](Scalar $admin "CREATE DATABASE [$name]")
    $createdDb.Add($name)
    [void](Scalar $admin "USE [$name]; CREATE TABLE dbo.canary(id int NOT NULL PRIMARY KEY,value int NOT NULL); INSERT dbo.canary VALUES(1,100); USE master;")
  }
  foreach($suffix in @('A','B')) {
    $name=$prefix+'_'+$suffix;$password=[Environment]::GetEnvironmentVariable('ISO_SECRET_'+$suffix)
    $result.stage='create_login_'+$suffix
    if($password -cnotmatch '^[a-f0-9]{64}$'){throw 'invalid_secret'}
    [void](Scalar $admin "CREATE LOGIN [$name] WITH PASSWORD=N'$password', CHECK_POLICY=ON, CHECK_EXPIRATION=OFF, DEFAULT_DATABASE=[$name]")
    $createdLogin.Add($name)
    [void](Scalar $admin "USE [$name]; CREATE USER [$name] FOR LOGIN [$name]; GRANT SELECT,INSERT,UPDATE,DELETE ON OBJECT::dbo.canary TO [$name]; USE master;")
  }
  foreach($suffix in @('A','B')) {
    $name=$prefix+'_'+$suffix;$password=[Environment]::GetEnvironmentVariable('ISO_SECRET_'+$suffix)
    $result.stage='runtime_'+$suffix
    $wrong=$null
    try {
      $wrong=Connect-Runtime $name ('0'*64)
      throw 'wrong_password_allowed'
    }catch{
      $e=$_.Exception.GetBaseException()
      if($e -isnot [Data.SqlClient.SqlException] -or $e.Number -ne 18456){throw 'unexpected_auth_category'}
      $result.badPasswordDenied++
    }finally{if($null -ne $wrong){$wrong.Dispose()}}
    $runtime=Connect-Runtime $name $password
    try {
      $result.stage='own_read_'+$suffix
      if((Scalar $runtime 'SELECT ORIGINAL_LOGIN()') -ne $name){throw 'wrong_runtime_identity'}
      if((Scalar $runtime 'SELECT value FROM dbo.canary WHERE id=1') -ne 100){throw 'own_read_failed'}
      [void](Scalar $runtime 'INSERT dbo.canary VALUES(2,200); UPDATE dbo.canary SET value=201 WHERE id=2; DELETE dbo.canary WHERE id=2;')
      $result.positive+=2
      $result.stage='cross_denied_'+$suffix
      foreach($targetSuffix in @('A','B','CP')) {
        if($targetSuffix -eq $suffix){continue}
        $target=$prefix+'_'+$targetSuffix
        Expect-Denied $runtime "SELECT value FROM [$target].dbo.canary WHERE id=1"
        Expect-Denied $runtime "UPDATE [$target].dbo.canary SET value=999 WHERE id=1"
        $result.denied+=2
      }
      $permissions=Scalar $runtime "SELECT IS_SRVROLEMEMBER('sysadmin')+HAS_PERMS_BY_NAME(NULL,NULL,'ALTER ANY LOGIN')+HAS_PERMS_BY_NAME(NULL,NULL,'CREATE ANY DATABASE')"
      $result.stage='permissions_'+$suffix
      if($permissions -ne 0){throw 'runtime_has_admin_rights'}
      $result.adminDenied++
    }finally{$runtime.Dispose()}
  }
  foreach($suffix in @('A','B','CP')) {
    $name=$prefix+'_'+$suffix
    if((Scalar $admin "SELECT COUNT(*) FROM [$name].dbo.canary WHERE id=1 AND value=100") -ne 1 -or
       (Scalar $admin "SELECT COUNT(*) FROM [$name].dbo.canary") -ne 1){throw 'canary_changed'}
  }
  $result.canariesPreserved=$true;$result.passed=$true
}catch{
  # Never expose provider exception text, connection strings or SQL containing secrets.
  $result.error='isolation_probe_failed'
  $e=$_.Exception.GetBaseException();$result.errorType=$e.GetType().Name;if($e -is [Data.SqlClient.SqlException]){$result.sqlNumber=$e.Number}
}finally{
  if($null -ne $admin){
    foreach($name in $createdDb){
      try{[void](Scalar $admin "USE master; DROP DATABASE [$name]")}catch{}
    }
    foreach($name in $createdLogin){
      try{[void](Scalar $admin "USE master; DROP LOGIN [$name]")}catch{}
    }
    $remaining=[Collections.Generic.List[string]]::new()
    foreach($name in $createdDb){
      try{if((Scalar $admin "SELECT COUNT(*) FROM sys.databases WHERE name=N'$name'") -ne 0){$remaining.Add($name)}}catch{$remaining.Add($name)}
    }
    foreach($name in $createdLogin){
      try{if((Scalar $admin "SELECT COUNT(*) FROM sys.server_principals WHERE name=N'$name'") -ne 0){$remaining.Add($name)}}catch{$remaining.Add($name)}
    }
    $result.remaining=@($remaining.ToArray());$result.cleanup=($remaining.Count -eq 0)
    $admin.Dispose()
  }
}
$result | ConvertTo-Json -Compress
`
  let output
  try { output = await exec('powershell.exe', ['-NoProfile','-NonInteractive','-Command',script], {
    env, encoding: 'utf8', timeout: 135000, maxBuffer: 65536, windowsHide: true,
  }) } catch { assert.fail(`Fixture întrerupt; verificați numai resursele rulării ${prefix}, fără cleanup global.`) }
  const result = JSON.parse(output.stdout.trim())
  assert.equal(result.cleanup, true, `Cleanup incomplet: ${JSON.stringify(result.remaining)}`)
  assert.equal(result.passed, true, `${result.error}; stage=${result.stage}; sqlNumber=${result.sqlNumber}; errorType=${result.errorType}`)
  assert.equal(result.positive, 4); assert.equal(result.denied, 8); assert.equal(result.adminDenied, 2)
  assert.equal(result.badPasswordDenied, 2)
  assert.equal(result.canariesPreserved, true)
  console.log('Izolare SQL verificată: 4 probe proprii, 8 refuzuri între baze, 2 verificări drepturi, 2 parole greșite refuzate; cleanup confirmat.')
})
