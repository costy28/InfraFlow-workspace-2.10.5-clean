'use strict'
function createGatewayPoolLifecycle({gateway,pool}){
  if(process.env.NODE_ENV!=='test')throw Error('synthetic_test_only')
  if(typeof gateway?.shutdown!=='function'||typeof pool?.shutdown!=='function')throw Error('invalid_gateway_pool_lifecycle')
  let state='open',stopping
  return {
    shutdown(){
      if(process.env.NODE_ENV!=='test')return Promise.reject(Error('synthetic_test_only'))
      if(stopping)return stopping
      state='closing'
      // Admission stops synchronously before pool shutdown; never reopen either component.
      const gatewayStopped=gateway.shutdown(),poolStopped=pool.shutdown()
      stopping=Promise.all([gatewayStopped,poolStopped]).then(()=>{state='closed'})
      return stopping
    },
    status:()=>({state,gateway:gateway.status(),pool:pool.status()}),
  }
}
module.exports={createGatewayPoolLifecycle}
