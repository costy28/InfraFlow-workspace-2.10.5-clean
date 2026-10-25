'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {createSqlProcessPool}=require('./support/demo-sql-process-pool')
function mode(t){const old=process.env.NODE_ENV;process.env.NODE_ENV='test';t.after(()=>{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old})}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
const tick=()=>new Promise(r=>setImmediate(r))
test('shutdown: închide coada, refuză cereri noi și așteaptă activa',async t=>{
  mode(t);const gate=deferred(),started=[]
  const pool=createSqlProcessPool({maxActive:1,execute:({id})=>{started.push(id);return gate.promise}})
  const a=pool.run({id:0});await tick()
  const queued=assert.rejects(pool.run({id:1}),{code:'synthetic_sql_pool_closed'})
  const stop=pool.shutdown();await queued
  assert.equal(pool.shutdown(),stop);assert.equal(pool.status().state,'closing')
  let finished=false;stop.then(()=>{finished=true});await tick();assert.equal(finished,false)
  await assert.rejects(pool.run({id:2}),{code:'synthetic_sql_pool_closed'})
  gate.resolve('ok');assert.equal(await a,'ok');await stop
  assert.deepEqual(started,[0]);assert.equal(pool.status().state,'closed');assert.equal(pool.status().active,0)
})
test('shutdown: oprirea înainte de microtask nu pornește executorul rezervat',async t=>{
  mode(t);const pool=createSqlProcessPool({execute:()=>assert.fail('must not execute')})
  const result=assert.rejects(pool.run({}),{code:'synthetic_sql_pool_closed'})
  await pool.shutdown();await result;assert.equal(pool.status().active,0)
})
test('shutdown: eroarea activei permite finalizarea, fără restart implicit',async t=>{
  mode(t);const gate=deferred(),pool=createSqlProcessPool({execute:()=>gate.promise})
  const result=assert.rejects(pool.run({}),/executor_failure/);await tick()
  const stop=pool.shutdown();gate.reject(Error('executor_failure'));await result;await stop
  await assert.rejects(pool.run({}),{code:'synthetic_sql_pool_closed'});assert.equal(pool.status().state,'closed')
})
test('shutdown: pool gol, idempotent și runtime normal refuzat',async t=>{
  mode(t);const pool=createSqlProcessPool(),stop=pool.shutdown();await stop
  assert.equal(pool.status().state,'closed');assert.equal(pool.shutdown(),stop)
  process.env.NODE_ENV='production';await assert.rejects(pool.shutdown(),{code:'synthetic_test_only'})
})
test('shutdown: proces PowerShell propriu se închide normal, coada nu pornește',{
  skip:process.platform!=='win32',timeout:15000,
},async t=>{
  mode(t);const env={};for(const key of ['SystemRoot','WINDIR','PATH','TEMP','TMP','USERPROFILE'])if(process.env[key])env[key]=process.env[key]
  const started=deferred();let child,closed=false
  const pool=createSqlProcessPool({maxActive:1})
  const active=pool.run({env,script:"Start-Sleep -Milliseconds 200; [Console]::Write('done')",onProcess:process=>{
    child=process;process.once('close',()=>{closed=true});started.resolve()
  }})
  await started.promise
  const queued=assert.rejects(pool.run({env,script:'exit 0',onProcess:()=>assert.fail('queued child must not start')}),{code:'synthetic_sql_pool_closed'})
  const stop=pool.shutdown();await queued
  assert.equal(await active,'done');await stop;assert.equal(closed,true);assert.equal(child.killed,false)
  assert.equal(pool.status().state,'closed')
})
