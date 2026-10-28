'use strict';
// Private IPC helper for the root-only installer; stdout must never be displayed.
const fs=require('node:fs');
const {prepareOperatorScopeChange}=require('./operator-prepare-change');
const {decryptTotpSecret}=require('./operator-store');
function validateKeyStat(s){
 if(!s.isFile()||s.uid!==0||s.gid!==0||(s.mode&0o7777)!==0o600||s.nlink!==1||s.size!==32)throw Error('admin_key_invalid');
}
function readKey(){
 const fd=fs.openSync('/etc/infraflow-demo-platform/operator-auth.key',fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
 try{validateKeyStat(fs.fstatSync(fd));return fs.readFileSync(fd);}finally{fs.closeSync(fd);}
}
function processRecord(mode,record,key){
 if(mode==='prepare')return prepareOperatorScopeChange({record,key});
 if(mode==='verify'){
  if(!record||record.enabled!==true||!JSON.parse(record.scopesJson).includes('trial:prepare'))throw Error();
  decryptTotpSecret(record.envelope,{key,id:record.id,revision:record.revision});
  return {verified:true};
 }
 throw Error();
}
async function main(){
 if(process.platform!=='linux'||process.getuid()!==0||process.argv.length!==3||!['prepare','verify'].includes(process.argv[2]))throw Error();
 let key,bytes=0;const chunks=[];
 try{
  for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>8192)throw Error();chunks.push(chunk);}
  const record=JSON.parse(Buffer.concat(chunks).toString('utf8'));key=readKey();
  process.stdout.write(JSON.stringify(processRecord(process.argv[2],record,key)));
 }finally{key?.fill(0);for(const chunk of chunks)chunk.fill(0);}
}
if(require.main===module)main().catch(()=>{process.stderr.write('ADMIN_PREPARE_HELPER_FAILED\n');process.exitCode=1;});
module.exports={validateKeyStat,processRecord};
