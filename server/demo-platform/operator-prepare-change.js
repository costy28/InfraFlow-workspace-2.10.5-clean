'use strict';
// Internal administrative preparation only. No SQL, file reads, grants or HTTP.
const crypto=require('node:crypto');
const {encryptTotpSecret,decryptTotpSecret}=require('./operator-store');
const SCOPES=Object.freeze(['trial:read','trial:queue','trial:activate','trial:prepare','session:own']);
const fail=()=>{throw Error('operator_prepare_change_refused');};
function prepareOperatorScopeChange({record,key}={}){
 try{
  if(!record||Object.getPrototypeOf(record)!==Object.prototype||
   Object.keys(record).sort().join(',')!=='enabled,envelope,id,revision,scopesJson'||record.enabled!==true||
   !Number.isInteger(record.revision)||record.revision<0||record.revision>=2147483647||typeof record.scopesJson!=='string'||Buffer.byteLength(record.scopesJson)>2048)fail();
  const scopes=JSON.parse(record.scopesJson);
  if(!Array.isArray(scopes)||scopes.some(s=>!SCOPES.includes(s))||new Set(scopes).size!==scopes.length||scopes.includes('trial:prepare'))fail();
  if(!scopes.includes('trial:read'))fail();
  const secret=decryptTotpSecret(record.envelope,{key,id:record.id,revision:record.revision});
  const nextRevision=record.revision+1;
  const newEnvelope=encryptTotpSecret(secret,{key,id:record.id,revision:nextRevision});
  if(decryptTotpSecret(newEnvelope,{key,id:record.id,revision:nextRevision})!==secret)fail();
  // No plaintext TOTP or key is returned. Still private administrative material.
  return Object.freeze({operatorId:record.id,expectedRevision:record.revision,
   expectedEnvelope:record.envelope,expectedScopesJson:record.scopesJson,
   revision:nextRevision,envelope:newEnvelope,scopesJson:JSON.stringify([...scopes,'trial:prepare']),
   changeId:crypto.randomUUID()});
 }catch{fail();}
}
module.exports={prepareOperatorScopeChange};
