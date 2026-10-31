'use strict';
// Diagnostic only. Matching evidence is not authority to adopt, recreate or activate.
function exact(v,keys){
 if(!v||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==keys.length)throw Error();
 for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d||!Object.hasOwn(d,'value'))throw Error();}
}
function classifyOsIdentity(input){
 try{
  exact(input,['identity','journalOutcome','recordedUid','recordedGid','observation']);
  if(typeof input.identity!=='string'||!/^ift_[a-f0-9]{28}$/.test(input.identity)||![null,'uncertain','observed_created'].includes(input.journalOutcome))throw Error();
  const positive=n=>Number.isInteger(n)&&n>0&&n<2147483647;
  if(input.journalOutcome==='observed_created'?(!positive(input.recordedUid)||!positive(input.recordedGid)):(input.recordedUid!==null||input.recordedGid!==null))throw Error();
  let classification='inspection_required';
  const o=input.observation;
  if(o!==null){
   exact(o,['userPresent','groupPresent','uid','gid','groupGid','home','shell','passwordLocked','supplementaryGroups']);
   if(typeof o.userPresent!=='boolean'||typeof o.groupPresent!=='boolean'||!Array.isArray(o.supplementaryGroups)||o.supplementaryGroups.some(x=>!positive(x)))throw Error();
   if(o.userPresent){if(!positive(o.uid)||!positive(o.gid)||typeof o.home!=='string'||typeof o.shell!=='string'||typeof o.passwordLocked!=='boolean')throw Error();}
   else if(o.uid!==null||o.gid!==null||o.home!==null||o.shell!==null||o.passwordLocked!==null||o.supplementaryGroups.length)throw Error();
   if(o.groupPresent?!positive(o.groupGid):o.groupGid!==null)throw Error();
   if(!o.userPresent&&!o.groupPresent)classification=input.journalOutcome==='observed_created'?'recorded_identity_missing':'absent_requires_review';
   else if(!o.userPresent||!o.groupPresent)classification='partial_identity_requires_review';
   else if(o.gid!==o.groupGid||o.home!=='/nonexistent'||o.shell!=='/usr/sbin/nologin'||!o.passwordLocked||o.supplementaryGroups.length)classification='identity_conflict_requires_review';
   else if(input.journalOutcome==='observed_created')classification=o.uid===input.recordedUid&&o.gid===input.recordedGid?'recorded_identity_matches_requires_review':'identity_conflict_requires_review';
   else classification='unconfirmed_identity_requires_review';
  }
  return Object.freeze({identity:input.identity,classification,reconciliationRequired:true,executionAllowed:false,automaticActions:Object.freeze([])});
 }catch{throw Error('os_identity_reconciliation_refused');}
}
module.exports={classifyOsIdentity};
