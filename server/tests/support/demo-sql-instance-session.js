'use strict'
const {createHash}=require('node:crypto')
const {createInstanceSessions}=require('./demo-instance-session')
const hash=token=>createHash('sha256').update(token).digest('hex')
function createSqlBoundInstanceSessions({clock,readRuntimeGeneration}){
  if(process.env.NODE_ENV!=='test')throw Error('synthetic_test_only')
  if(typeof readRuntimeGeneration!=='function')throw Error('runtime_reader_required')
  const local=createInstanceSessions({clock}),registered=new Map(),issued=new Map()
  async function current(route){
    if(process.env.NODE_ENV!=='test')throw Error('synthetic_test_only')
    const row=await readRuntimeGeneration({trialId:route.trialId})
    if(row===null)return null
    if(!row||!Number.isInteger(row.generation)||row.generation<1||typeof row.epoch!=='string'
      ||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(row.epoch))throw Error('invalid_runtime_generation')
    return {generation:row.generation,epoch:row.epoch}
  }
  const same=(a,b)=>!!a&&!!b&&a.generation===b.generation&&a.epoch===b.epoch
  return {
    async replaceRuntime(route,server,expectedGeneration=null){
      const row=await current(route)
      if(!row)throw Error('runtime_generation_missing')
      const result=local.replaceRuntime(route,server,expectedGeneration)
      registered.set(route.trialId,row)
      if(!same(row,await current(route)))throw Error('runtime_generation_changed')
      return result
    },
    async issue(route,ttlMs){
      const row=await current(route)
      if(!same(row,registered.get(route.trialId)))throw Error('runtime_generation_changed')
      const session=local.issue(route,ttlMs)
      try{
        if(!same(row,await current(route)))throw Error('runtime_generation_changed')
        issued.set(hash(session.token),row)
        return session
      }catch(error){local.revoke(session.token);throw error}
    },
    async authorize(token,route,server){
      if(!local.authorize(token,route,server))return false
      const row=await current(route)
      return same(row,registered.get(route.trialId))&&same(row,issued.get(hash(token)))&&local.authorize(token,route,server)
    },
    revoke(token){local.revoke(token);if(typeof token==='string')issued.delete(hash(token))},
  }
}
module.exports={createSqlBoundInstanceSessions}
