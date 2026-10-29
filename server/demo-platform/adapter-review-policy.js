'use strict';
// Metadata policy for a future dedicated SQL review login; does not create/grant it.
function validateAdapterReviewIdentity(result){
 try{
  const sets=result.recordsets,r=sets[0];
  if(!Array.isArray(r)||r.length!==1)throw Error();
  const identity=r[0];
  if(identity.db!=='INFRAFLOW_DEMO_PLATFORM'||identity.login!=='infraflow_demo_adapter_review'||
   identity.principal!==identity.login||identity.sysadmin!==0||identity.accessDemo!==0)throw Error();
  const allowed=[['CONNECT SQL','VIEW ANY DATABASE'],['CONNECT','VIEW ANY COLUMN ENCRYPTION KEY DEFINITION','VIEW ANY COLUMN MASTER KEY DEFINITION']];
  for(let i=0;i<2;i++){
   if(!Array.isArray(sets[i+1])||!sets[i+1].some(p=>p.permission_name===allowed[i][0])||
    sets[i+1].some(p=>!allowed[i].includes(p.permission_name)))throw Error();
  }
  if(!Array.isArray(sets[3])||sets[3].length!==1)throw Error();
  const permission=sets[3][0];
  if(permission.schema_name!=='platform'||permission.object_name!=='read_adapter_resource_review'||permission.permission_name!=='EXECUTE')throw Error();
  if(sets.length!==4)throw Error();
 }catch{throw Error('adapter_review_identity_refused');}
}
module.exports={validateAdapterReviewIdentity};
