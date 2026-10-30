'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateCredentialStat,check}=require('../demo-platform/adapter-review-credential-probe');
const metadata=(overrides={})=>({isFile:()=>true,mode:0o440,uid:0,gid:0,nlink:1,size:20,...overrides});
test('adapter credential exact systemd root ACL or private service file',()=>{
 validateCredentialStat(metadata());validateCredentialStat(metadata({mode:0o400,uid:993,gid:984}));
 for(const value of [{mode:0o640},{mode:0o444},{mode:0o4440},{gid:984},{uid:994},{nlink:2},{size:15},{size:129},{isFile:()=>false}])assert.throws(()=>validateCredentialStat(metadata(value)));
});
test('credential probe performs only metadata check and clears temporary buffer',async()=>{
 const password=Buffer.from('x'.repeat(20));let checks=0,closes=0;
 await check({read:()=>password,createSql:({role,password:p})=>{
  assert.equal(role,'consumer');assert.equal(p,'x'.repeat(20));
  return {check:async()=>{checks++;},execute:()=>assert.fail('mutation forbidden'),shutdown:async()=>{closes++;}};
 }});
 assert.equal(checks,1);assert.equal(closes,1);assert.equal(password.every(v=>v===0),true);
});
test('wrong or invalid secret fails closed without disclosure and closes pool',async()=>{
 for(const failClose of [false,true]){
  const password=Buffer.from('x'.repeat(20));let closed=0;
  await assert.rejects(check({read:()=>password,createSql:()=>({check:async()=>{throw Error('private');},shutdown:async()=>{closed++;if(failClose)throw Error('private');}})}),/^Error: adapter_credential_check_unconfirmed$/);
  assert.equal(closed,1);assert.equal(password.every(v=>v===0),true);
 }
 let creates=0;await assert.rejects(check({read:()=>Buffer.from('short'),createSql:()=>{creates++;}}));assert.equal(creates,0);
});
