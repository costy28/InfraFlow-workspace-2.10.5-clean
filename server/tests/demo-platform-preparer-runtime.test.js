'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createPreparerRuntime,validateCredentialStat}=require('../demo-platform/preparer-runtime');
test('preparer credential accepts exact systemd ACL or private owner metadata only',()=>{
 const s={isFile:()=>true,uid:0,gid:0,nlink:1,size:32,mode:0o100440};validateCredentialStat(s,995);validateCredentialStat({...s,uid:995,mode:0o100400},995);
 for(const d of [{gid:986},{nlink:2},{size:129},{mode:0o100444},{mode:0o104440},{isFile:()=>false}])assert.throws(()=>validateCredentialStat({...s,...d},995));
});
test('runtime startup only checks metadata, zeroes secret and closes both layers',async()=>{
 let checks=0,commands=0,closes=0;const password=Buffer.from('fixture-password-1234');
 const runtime=await createPreparerRuntime({read:()=>password,createSql:p=>{assert.equal(p,'fixture-password-1234');return {check:async()=>{checks++;},execute:async()=>{commands++;},shutdown:async()=>{closes++;}};}});
 assert.equal(checks,1);assert.equal(commands,0);assert.ok(password.every(v=>v===0));const stop=runtime.shutdown();assert.equal(runtime.shutdown(),stop);await stop;assert.equal(closes,1);
});
test('invalid directory or SQL scope fails closed, masks errors and clears password',async()=>{
 let reads=0,closes=0;await assert.rejects(createPreparerRuntime({directory:'/tmp/unsafe',read:()=>{reads++;}}),{message:'preparer_runtime_unavailable'});assert.equal(reads,0);
 const password=Buffer.from('fixture-password-1234');
 await assert.rejects(createPreparerRuntime({read:()=>password,createSql:()=>({check:async()=>{throw Error('private');},shutdown:async()=>{closes++;}})}),{message:'preparer_runtime_unavailable'});
 assert.equal(closes,1);assert.ok(password.every(v=>v===0));
});
