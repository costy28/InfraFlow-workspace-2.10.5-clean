'use strict'
const {runOwnedSqlProcess}=require('./demo-owned-sql-process')
const {performance}=require('node:perf_hooks')
const error=code=>Object.assign(Error(code),{code})
function createSqlProcessPool({maxActive=2,maxQueued=16,queueTimeoutMs=10000,monotonicNow=()=>performance.now(),execute=runOwnedSqlProcess}={}){
  if(process.env.NODE_ENV!=='test')throw error('synthetic_test_only')
  if(!Number.isInteger(maxActive)||maxActive<1||maxActive>8||!Number.isInteger(maxQueued)||maxQueued<0||maxQueued>64
    ||!Number.isInteger(queueTimeoutMs)||queueTimeoutMs<20||queueTimeoutMs>60000||typeof monotonicNow!=='function'||typeof execute!=='function')throw error('invalid_sql_pool')
  let active=0,state='open',shutdownPromise,resolveShutdown
  const queue=[]
  const time=()=>{const value=monotonicNow();if(!Number.isFinite(value)||value<0)throw error('invalid_sql_pool_clock');return value}
  const detach=item=>{clearTimeout(item.timer);item.args.signal?.removeEventListener('abort',item.abort)}
  const completeShutdown=()=>{if(state==='closing'&&active===0){state='closed';resolveShutdown()}}
  const pump=()=>{while(state==='open'&&active<maxActive&&queue.length)start(queue.shift())}
  function start(item){
    detach(item)
    try{if(item.deadline!==null&&time()>=item.deadline){item.reject(error('synthetic_sql_queue_timeout'));return}}
    catch(failure){item.reject(failure);return}
    active++
    // execute must settle only after its owned child is closed; cancellation does not free a slot early.
    Promise.resolve().then(()=>{
      if(state!=='open')throw error('synthetic_sql_pool_closed')
      if(item.args.signal?.aborted)throw error('synthetic_sql_aborted')
      return execute(item.args)
    }).then(value=>finish(null,value),failure=>finish(failure))
    function finish(failure,value){active--;pump();completeShutdown();if(failure)item.reject(failure);else item.resolve(value)}
  }
  return {
    run(args){
      if(process.env.NODE_ENV!=='test')return Promise.reject(error('synthetic_test_only'))
      if(state!=='open')return Promise.reject(error('synthetic_sql_pool_closed'))
      if(!args||Object.getPrototypeOf(args)!==Object.prototype||(args.signal!==undefined&&!(args.signal instanceof AbortSignal)))return Promise.reject(error('invalid_sql_pool_request'))
      args={...args}
      if(args.signal?.aborted)return Promise.reject(error('synthetic_sql_aborted'))
      if(active>=maxActive&&queue.length>=maxQueued)return Promise.reject(error('synthetic_sql_busy'))
      return new Promise((resolve,reject)=>{
        const item={args,resolve,reject,abort:null,timer:null,deadline:null}
        item.abort=()=>{
          const index=queue.indexOf(item)
          if(index<0)return
          queue.splice(index,1);detach(item);reject(error('synthetic_sql_aborted'))
        }
        if(active<maxActive&&queue.length===0)start(item)
        else{
          item.deadline=time()+queueTimeoutMs
          queue.push(item);args.signal?.addEventListener('abort',item.abort,{once:true})
          item.timer=setTimeout(()=>{
            const index=queue.indexOf(item)
            if(index<0)return
            queue.splice(index,1);detach(item);reject(error('synthetic_sql_queue_timeout'))
          },queueTimeoutMs)
        }
      })
    },
    shutdown(){
      if(process.env.NODE_ENV!=='test')return Promise.reject(error('synthetic_test_only'))
      if(shutdownPromise)return shutdownPromise
      state='closing';shutdownPromise=new Promise(resolve=>{resolveShutdown=resolve})
      while(queue.length){const item=queue.shift();detach(item);item.reject(error('synthetic_sql_pool_closed'))}
      completeShutdown();return shutdownPromise
    },
    status:()=>({state,active,queued:queue.length,maxActive,maxQueued,queueTimeoutMs}),
  }
}
let defaultPool
function runLimitedSqlProcess(args){
  if(process.env.NODE_ENV!=='test')throw error('synthetic_test_only')
  defaultPool??=createSqlProcessPool()
  return defaultPool.run(args)
}
module.exports={createSqlProcessPool,runLimitedSqlProcess}
