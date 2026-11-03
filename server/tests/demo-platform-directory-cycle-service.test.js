'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {validateCredentialStat}=require('../demo-platform/directory-cycle-service');
test('cycle service accepts only systemd ACL or private worker credential',()=>{
 const s={uid:0,gid:0,mode:0o440,nlink:1,size:20,isFile:()=>true};validateCredentialStat(s);validateCredentialStat({...s,uid:994,mode:0o400});
 for(const bad of [{...s,mode:0o644},{...s,nlink:2},{...s,uid:995},{...s,size:0},{...s,isFile:()=>false}])assert.throws(()=>validateCredentialStat(bad));
});
test('metadata probe invokes only init/check and closes its pipe',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../../scripts/linux/probe-demo-directory-cycle-metadata.py'),'utf8');
 assert.deepEqual([...s.matchAll(/pipe\.call\('([^']+)'/g)].map(m=>m[1]),['init','check']);
 assert.ok(s.includes('finally:pipe.close()'));assert.ok(s.includes('--preflight-only'));assert.ok(s.includes('NO_CLAIM_NO_PREPARE_NO_JOB_NO_DIRECTORY'));
});
