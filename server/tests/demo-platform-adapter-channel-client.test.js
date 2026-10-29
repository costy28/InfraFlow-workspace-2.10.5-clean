'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createAdapterChannelClient,validateSocket}=require('../demo-platform/adapter-channel-client');
const input={intentId:'b1100b43-48d0-42fa-8a1d-73b1286f8242',ticketToken:'ab'.repeat(32)};
const receipt={intentId:input.intentId,jobId:'00f612ed-a8ac-4688-a26f-679760eee0be',generation:1,jobRevision:1,step:'os_identity',operation:'consume',executionAllowed:false};
function fixture(response,{error=false}={}){
 let calls=0,sent,config;
 const client=createAdapterChannelClient({checkIdentity(){},checkSocket(){},connect(options){
  calls++;config=options;
  const socket=new EventEmitter();socket.destroy=()=>{};
  socket.end=body=>{sent=JSON.parse(body);queueMicrotask(()=>{
   if(error)socket.emit('error',Error(input.ticketToken));else{socket.emit('data',Buffer.from(response));socket.emit('end');}
  });};queueMicrotask(()=>socket.emit('connect'));return socket;
 }});return {client,get calls(){return calls;},get sent(){return sent;},get config(){return config;}};
}
test('Unix client fixed socket, EOF request, receipt excludes ticket',async()=>{
 const f=fixture(JSON.stringify({ok:true,receipt}));const result=await f.client.execute(input);
 assert.equal(f.config.path,'/run/infraflow-demo-adapter-review.sock');assert.deepEqual(f.sent,input);
 assert.equal(result.executionAllowed,false);assert.equal(JSON.stringify(result).includes(input.ticketToken),false);await f.client.shutdown();
});
test('wrong socket ownership, mode and unsafe parent refused',()=>{
 const socket={isSocket:()=>true,uid:0,gid:985,mode:0o660},parent={isDirectory:()=>true,uid:0,mode:0o755};
 validateSocket(socket,parent);
 for(const s of [{...socket,uid:994},{...socket,gid:0},{...socket,mode:0o666},{...socket,isSocket:()=>false}])assert.throws(()=>validateSocket(s,parent));
 assert.throws(()=>validateSocket(socket,{...parent,mode:0o777}));
});
test('identity refusal prevents connection; malformed input prevents inspection',async()=>{
 let checks=0,connects=0;const client=createAdapterChannelClient({checkIdentity(){checks++;throw Error();},checkSocket(){throw Error();},connect(){connects++;}});
 await assert.rejects(client.execute({...input,uid:994}));assert.equal(checks,0);
 await assert.rejects(client.execute(input));assert.equal(checks,1);assert.equal(connects,0);await client.shutdown();
});
test('failure, malformed response, excess payload and execution authority never retry',async()=>{
 for(const response of ['x',JSON.stringify({ok:false,code:input.ticketToken}),JSON.stringify({ok:true,receipt:{...receipt,executionAllowed:true}}),'x'.repeat(4097)]){
  const f=fixture(response);await assert.rejects(f.client.execute(input),/^Error: adapter_ticket_result_unconfirmed$/);assert.equal(f.calls,1);await f.client.shutdown();
 }
 const f=fixture('',{error:true});await assert.rejects(f.client.execute(input));assert.equal(f.calls,1);await f.client.shutdown();
});
