'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateKeyStat,processRecord}=require('../demo-platform/operator-prepare-admin');
const {encryptTotpSecret}=require('../demo-platform/operator-store');
test('administrative key accepts only root-owned single-link regular 0600 file, 32 bytes',()=>{
 const s={isFile:()=>true,uid:0,gid:0,nlink:1,size:32,mode:0o100600};validateKeyStat(s);
 for(const delta of [{uid:995},{gid:986},{mode:0o100640},{mode:0o104600},{nlink:2},{size:31},{isFile:()=>false}])assert.throws(()=>validateKeyStat({...s,...delta}));
});
test('administrative IPC plans and verifies binding without returning plaintext secret',()=>{
 const key=Buffer.alloc(32,7),id='11111111-1111-4111-8111-111111111111',secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
 const record={id,enabled:true,revision:1,scopesJson:'["trial:read"]',envelope:encryptTotpSecret(secret,{key,id,revision:1})};
 const plan=processRecord('prepare',record,key);
 assert.equal(JSON.stringify(plan).includes(secret),false);
 const next={...record,revision:plan.revision,envelope:plan.envelope,scopesJson:plan.scopesJson};
 assert.deepEqual(processRecord('verify',next,key),{verified:true});
 assert.throws(()=>processRecord('verify',{...next,revision:1},key));
 assert.throws(()=>processRecord('arbitrary',record,key));
});
