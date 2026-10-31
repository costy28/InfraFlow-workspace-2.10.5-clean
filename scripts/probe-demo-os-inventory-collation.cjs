'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const {createTrialSqlFixture}=require('../server/tests/support/demo-trial-sql-fixture');
const {runOwnedSqlProcess}=require('../server/tests/support/demo-owned-sql-process');
async function dropFixture(database){
 if(!/^INFRAFLOW_TEST_TRIALS_[A-F0-9]{12}$/.test(database))throw Error('cleanup_target_refused');
 const env={};for(const key of ['SystemRoot','WINDIR','PATH','TEMP','TMP','USERPROFILE'])if(process.env[key])env[key]=process.env[key];
 const output=await runOwnedSqlProcess({env,script:`$ErrorActionPreference='Stop';Add-Type -AssemblyName System.Data;
 $c=New-Object System.Data.SqlClient.SqlConnection('Server=.\\SQLEXPRESS;Database=master;Integrated Security=True;TrustServerCertificate=True;Connect Timeout=5');
 try{$c.Open();$q=$c.CreateCommand();$q.CommandTimeout=15;$q.CommandText="DROP DATABASE [${database}];SELECT 1;";[Console]::Write($q.ExecuteScalar())}finally{$c.Dispose()}`});
 if(output!=='1')throw Error('cleanup_unconfirmed');
}
async function main(){
 if(process.env.NODE_ENV!=='test'||process.argv.slice(2).join()!=='--temporary-db-confirmed')throw Error('explicit_test_required');
 let fixture,passed=false,cleanup=false,stage='fixture';
 try{
  fixture=await createTrialSqlFixture();const {database,execute}=fixture;
  stage='schema';await execute(database,`EXEC(N'CREATE SCHEMA platform AUTHORIZATION dbo;');SELECT 1;`);
  stage='tables';await execute(database,`CREATE TABLE platform.trials(trial_id uniqueidentifier,revision int,state varchar(16),activated_at datetime2 NULL,expires_at datetime2 NULL);
CREATE TABLE platform.provision_jobs(job_id uniqueidentifier,trial_id uniqueidentifier,state varchar(16),job_revision int,generation int,execution_ready bit,lease_owner varchar(128) NULL,lease_hash binary(32) NULL,lease_expires_at datetime2 NULL,trial_revision int,resource_manifest nvarchar(max) COLLATE SQL_Latin1_General_CP1_CI_AS);
CREATE TABLE platform.resource_reservations(job_id uniqueidentifier,trial_id uniqueidentifier,resource_type varchar(32) COLLATE Latin1_General_100_BIN2,resource_key varchar(256) COLLATE Latin1_General_100_BIN2);
CREATE TABLE platform.provision_step_intents(job_id uniqueidentifier,step_name varchar(32) COLLATE Latin1_General_100_BIN2);
INSERT platform.trials VALUES('b1100b43-48d0-42fa-8a1d-73b1286f8242',1,'queued',NULL,NULL);
INSERT platform.provision_jobs VALUES('00f612ed-a8ac-4688-a26f-679760eee0be','b1100b43-48d0-42fa-8a1d-73b1286f8242','queued',5,2,0,NULL,NULL,NULL,1,N'{"osIdentity":"ift_b1100b4348d042fa8a1d73b1286f"}');
INSERT platform.resource_reservations VALUES('00f612ed-a8ac-4688-a26f-679760eee0be','b1100b43-48d0-42fa-8a1d-73b1286f8242','os_identity','ift_b1100b4348d042fa8a1d73b1286f');SELECT 1;`);
  const fixed=fs.readFileSync('scripts/linux/preflight-demo-tenant-os-identity.sql','utf8').replace("N'INFRAFLOW_DEMO_PLATFORM'",`N'${database}'`);
  const old=fixed.replace("JSON_VALUE(j.resource_manifest,'$.osIdentity') COLLATE Latin1_General_100_BIN2=r.resource_key COLLATE Latin1_General_100_BIN2","JSON_VALUE(j.resource_manifest,'$.osIdentity')=r.resource_key");
  stage='old';await assert.rejects(execute(database,old),e=>e.sqlNumber===468);
  stage='fixed';
  assert.equal(await execute(database,fixed),'TENANT_OS_SQL_BINDING_OK');
  await execute(database,`UPDATE platform.provision_jobs SET resource_manifest=N'{"osIdentity":"IFT_b1100b4348d042fa8a1d73b1286f"}';SELECT 1;`);
  await assert.rejects(execute(database,fixed),e=>e.sqlNumber===53802);
  passed=true;
 }finally{
  if(fixture){await dropFixture(fixture.database);cleanup=true;}
  console.log(JSON.stringify({passed,cleanup,stage}));
 }
}
if(require.main===module)main().catch(e=>{console.error('OS_INVENTORY_COLLATION_PROBE_FAILED_SQL_NUMBER='+(e.sqlNumber??'none'));process.exitCode=1;});
module.exports={dropFixture};
