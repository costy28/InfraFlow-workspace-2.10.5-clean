'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {createSqlProcessPool}=require('./support/demo-sql-process-pool')
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
function mode(t){const old=process.env.NODE_ENV;process.env.NODE_ENV='test';t.after(()=>{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old})}
const tick=()=>new Promise(r=>setImmediate(r))
test('pool: limită activă și coadă FIFO mărginită; depășirea nu execută',async t=>{
  mode(t);const gates=[deferred(),deferred(),deferred()],started=[]
  const pool=createSqlProcessPool({maxActive:1,maxQueued:2,execute:({id})=>{started.push(id);return gates[id].promise}})
  const a=pool.run({id:0}),b=pool.run({id:1}),c=pool.run({id:2})
  await assert.rejects(pool.run({id:3}),{code:'synthetic_sql_busy'})
  assert.deepEqual(started,[0]);assert.equal(pool.status().queued,2)
  gates[0].resolve('a');assert.equal(await a,'a');await tick();assert.deepEqual(started,[0,1])
  gates[1].resolve('b');await b;await tick();assert.deepEqual(started,[0,1,2])
  gates[2].resolve('c');await c;assert.equal(pool.status().active,0)
})
test('pool: cerere anulată în coadă nu ajunge la executor și eliberează coada',async t=>{
  mode(t);const gate=deferred(),controller=new AbortController(),started=[]
  const pool=createSqlProcessPool({maxActive:1,maxQueued:1,execute:({id})=>{started.push(id);return id===0?gate.promise:'done'}})
  const a=pool.run({id:0}),b=pool.run({id:1,signal:controller.signal})
  const rejected=assert.rejects(b,{code:'synthetic_sql_aborted'});controller.abort();await rejected
  assert.equal(pool.status().queued,0)
  const c=pool.run({id:2});gate.resolve();await a;assert.equal(await c,'done');assert.deepEqual(started,[0,2])
})
test('pool: anularea activă nu eliberează locul înainte de confirmarea închiderii',async t=>{
  mode(t);const closed=deferred(),controller=new AbortController(),started=[]
  const pool=createSqlProcessPool({maxActive:1,execute:({id})=>{started.push(id);return id===0?closed.promise:'next'}})
  const a=pool.run({id:0,signal:controller.signal});await tick()
  controller.abort();const b=pool.run({id:1});await tick()
  assert.deepEqual(started,[0]);assert.equal(pool.status().active,1)
  const rejected=assert.rejects(a,{code:'synthetic_sql_aborted'})
  closed.reject(Object.assign(Error('synthetic_sql_aborted'),{code:'synthetic_sql_aborted'}));await rejected
  assert.equal(await b,'next');assert.deepEqual(started,[0,1])
})
test('pool: eroare sincronă sau asincronă nu pierde locul',async t=>{
  mode(t);const pool=createSqlProcessPool({maxActive:1,execute:({id})=>{if(id===0)throw Error('sync');if(id===1)return Promise.reject(Error('async'));return 'ok'}})
  const a=pool.run({id:0}),b=pool.run({id:1}),c=pool.run({id:2})
  await assert.rejects(a,/sync/);await assert.rejects(b,/async/);assert.equal(await c,'ok');assert.equal(pool.status().active,0)
})
test('pool: pre-abort fără execuție și configurație invalidă refuzate',async t=>{
  mode(t);const controller=new AbortController();controller.abort()
  const pool=createSqlProcessPool({execute:()=>assert.fail('must not execute')})
  await assert.rejects(pool.run({signal:controller.signal}),{code:'synthetic_sql_aborted'})
  for(const options of [{maxActive:0},{maxActive:9},{maxQueued:-1},{maxQueued:65},{queueTimeoutMs:0},{queueTimeoutMs:60001}])assert.throws(()=>createSqlProcessPool(options),/invalid_sql_pool/)
  process.env.NODE_ENV='production';assert.throws(()=>createSqlProcessPool(),/synthetic_test_only/)
})
test('coadă: termen propriu expiră fără semnal extern, fără spawn ulterior',async t=>{
  mode(t);const gate=deferred(),started=[]
  const pool=createSqlProcessPool({maxActive:1,queueTimeoutMs:30,execute:({id})=>{started.push(id);return gate.promise}})
  const a=pool.run({id:0})
  await assert.rejects(pool.run({id:1}),{code:'synthetic_sql_queue_timeout'})
  assert.equal(pool.status().queued,0);assert.equal(pool.status().active,1)
  gate.resolve('done');await a;await tick();assert.deepEqual(started,[0])
})
test('coadă: pump verifică termenul chiar dacă timerul nu a apucat să ruleze',async t=>{
  mode(t);let now=0;const gate=deferred(),started=[]
  const pool=createSqlProcessPool({maxActive:1,queueTimeoutMs:1000,monotonicNow:()=>now,execute:({id})=>{started.push(id);return gate.promise}})
  const a=pool.run({id:0}),b=pool.run({id:1}),rejected=assert.rejects(b,{code:'synthetic_sql_queue_timeout'})
  now=1000;gate.resolve();await a;await rejected;assert.deepEqual(started,[0]);assert.equal(pool.status().active,0)
})
test('coadă: expirarea eliberează capacitatea fără a afecta cererea activă',async t=>{
  mode(t);let now=0;const gate=deferred(),started=[]
  const pool=createSqlProcessPool({maxActive:1,maxQueued:1,queueTimeoutMs:30,monotonicNow:()=>now,execute:({id})=>{started.push(id);return id===0?gate.promise:'next'}})
  const a=pool.run({id:0})
  await assert.rejects(pool.run({id:1}),{code:'synthetic_sql_queue_timeout'})
  const c=pool.run({id:2});gate.resolve();await a;assert.equal(await c,'next');assert.deepEqual(started,[0,2])
})
test('coadă: expirare urmată de abort nu respinge din nou și nu ocupă loc',async t=>{
  mode(t);const gate=deferred(),controller=new AbortController(),started=[]
  const pool=createSqlProcessPool({maxActive:1,queueTimeoutMs:30,execute:({id})=>{started.push(id);return gate.promise}})
  const a=pool.run({id:0})
  await assert.rejects(pool.run({id:1,signal:controller.signal}),{code:'synthetic_sql_queue_timeout'})
  controller.abort();gate.resolve();await a;await tick();assert.deepEqual(started,[0]);assert.equal(pool.status().queued,0)
})
