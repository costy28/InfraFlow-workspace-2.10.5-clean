'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const file=path.join(__dirname,'../demo-platform/channel-review-probe.js');
test('channel probe refuses default and arbitrary args without credentials or SQL',()=>{
 for(const args of [[],['--run'],['--check-only','extra']]){
  const r=spawnSync(process.execPath,[file,...args],{encoding:'utf8',env:{...process.env,CREDENTIALS_DIRECTORY:'secret-placeholder'}});
  assert.equal(r.status,1);assert.equal(r.stdout,'');assert.equal(r.stderr.trim(),'CHANNEL_REVIEW_UNCONFIRMED_NO_AUTOMATIC_RETRY');
 }
});
test('probe binds service credential, worker identity, pilot CAS and explicit mutation mode',()=>{
 const s=fs.readFileSync(file,'utf8');
 for(const text of ['/run/credentials/infraflow-demo-channel-cycle.service','process.getuid?.()!==994','process.getgid?.()!==985','--check-only','--run-channel-review-confirmed','expectedJobRevision:3','O_NOFOLLOW','secret.fill(0)'])assert.ok(s.includes(text));
 assert.ok(!s.includes('process.env.DB_PASSWORD'));assert.ok(!s.includes('process.env.SQL_PASSWORD'));
});
