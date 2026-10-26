'use strict'
const crypto=require('node:crypto')
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v)
const actions=['operator_login','trial.read','trial.queue','trial.activate','session.logout']
const denied=()=>{throw Error('operator_store_unavailable')}
function context(key,id,revision){
  if(!Buffer.isBuffer(key)||key.length!==32||!uuid(id)||!Number.isInteger(revision)||revision<0||revision>2147483647)denied()
  return Buffer.from(`infraflow-operator-totp-v1:${id}:${revision}`)
}
function encryptTotpSecret(secret,{key,id,revision}){
  const aad=context(key,id,revision)
  if(typeof secret!=='string'||!/^[A-Z2-7]{32}$/.test(secret))denied()
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv)
  cipher.setAAD(aad)
  const ciphertext=Buffer.concat([cipher.update(secret,'ascii'),cipher.final()])
  return 'gcm-v1:'+Buffer.concat([iv,cipher.getAuthTag(),ciphertext]).toString('base64')
}
function decryptTotpSecret(envelope,{key,id,revision}){
  try{
    const aad=context(key,id,revision)
    if(typeof envelope!=='string'||!/^gcm-v1:[A-Za-z0-9+/]{80}$/.test(envelope))denied()
    const bytes=Buffer.from(envelope.slice(7),'base64')
    if(bytes.length!==60)denied()
    const decipher=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12))
    decipher.setAAD(aad);decipher.setAuthTag(bytes.subarray(12,28))
    const secret=Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('ascii')
    if(!/^[A-Z2-7]{32}$/.test(secret))denied()
    return secret
  }catch{denied()}
}
function createSqlOperatorStore({execute,operatorId,key,procedures=false}){
  context(key,operatorId,0)
  if(typeof execute!=='function'||typeof procedures!=='boolean')denied()
  // Keep our own key bytes. Do not return or serialize them.
  const privateKey=Buffer.from(key)
  let closed=false
  const run=async(sql,input,command)=>{if(closed)denied();try{return await execute(procedures?command:sql,input)}catch{denied()}}
  const checkId=input=>{if(input?.operatorId!==operatorId)denied()}
  return {
    async readOperator(){
      try{
        const r=JSON.parse(await run(`SELECT LOWER(CONVERT(char(36),operator_id)) id,username,revision,enabled,
          password_hash passwordHash,totp_envelope envelope,JSON_QUERY(scopes_json) scopes
          FROM operator_security.accounts WHERE operator_id=CONVERT(uniqueidentifier,JSON_VALUE(@json,'$.id'))
          FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;`,{id:operatorId},'read_account'))
        if(r?.id!==operatorId)denied()
        const totpSecret=decryptTotpSecret(r.envelope,{key:privateKey,id:operatorId,revision:r.revision})
        delete r.envelope;return {...r,totpSecret}
      }catch{denied()}
    },
    async reserveAttempt(input){
      checkId(input)
      if(input.limit!==5||input.windowMs!==15*60000||!Number.isSafeInteger(input.now)||input.now<0)denied()
      const value=await run(`SET NOCOUNT ON; SET XACT_ABORT ON;
        BEGIN TRY
        BEGIN TRANSACTION;
        DECLARE @id uniqueidentifier=CONVERT(uniqueidentifier,JSON_VALUE(@json,'$.id')),@enabled bit,@count int,
          @start datetime2(3),@now datetime2(3)=SYSUTCDATETIME();
        SELECT @enabled=enabled,@count=attempt_count,@start=window_started_at
          FROM operator_security.accounts WITH(UPDLOCK,HOLDLOCK) WHERE operator_id=@id;
        IF @enabled IS NULL OR @enabled=0 BEGIN ROLLBACK;SELECT 0;RETURN;END;
        IF @start IS NOT NULL AND @now<@start BEGIN ROLLBACK;SELECT 0;RETURN;END;
        IF @start IS NULL OR @now>=DATEADD(minute,15,@start) BEGIN SET @count=0;SET @start=@now;END;
        IF @count>=5 BEGIN
          INSERT operator_security.audit(operator_id,action) VALUES(@id,'operator_attempt_limited');
          COMMIT;SELECT 0;RETURN;
        END;
        UPDATE operator_security.accounts SET attempt_count=@count+1,window_started_at=@start WHERE operator_id=@id;
        INSERT operator_security.audit(operator_id,action) VALUES(@id,'operator_attempt_reserved');
        COMMIT;SELECT 1;
        END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;`,{id:operatorId},'reserve_attempt')
      if(!['0','1'].includes(value))denied();return value==='1'
    },
    async claimTotpCounter(input){
      checkId(input)
      if(!Number.isSafeInteger(input.counter)||input.counter<0||!Number.isInteger(input.revision)||input.revision<0||input.revision>2147483647)denied()
      const value=await run(`SET NOCOUNT ON;SET XACT_ABORT ON;
        BEGIN TRY BEGIN TRANSACTION;
        DECLARE @id uniqueidentifier=CONVERT(uniqueidentifier,JSON_VALUE(@json,'$.id')),
          @counter bigint=CONVERT(bigint,JSON_VALUE(@json,'$.counter')),
          @nowCounter bigint=DATEDIFF_BIG(second,CONVERT(datetime2,'1970-01-01'),SYSUTCDATETIME())/30;
        IF @counter NOT BETWEEN @nowCounter-1 AND @nowCounter BEGIN ROLLBACK;SELECT 0;RETURN;END;
        UPDATE operator_security.accounts WITH(UPDLOCK) SET last_totp_counter=@counter
          WHERE operator_id=@id AND enabled=1 AND revision=CONVERT(int,JSON_VALUE(@json,'$.revision')) AND last_totp_counter<@counter;
        IF @@ROWCOUNT=0 BEGIN ROLLBACK;SELECT 0;RETURN;END;
        INSERT operator_security.audit(operator_id,action) VALUES(@id,'operator_totp_claimed');
        COMMIT;SELECT 1;
        END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;`,{id:operatorId,counter:input.counter,revision:input.revision},'claim_totp')
      if(!['0','1'].includes(value))denied();return value==='1'
    },
    async appendAudit(input){
      checkId(input)
      if(!actions.includes(input.action)||!Number.isSafeInteger(input.at)||input.at<0)denied()
      const value=await run(`SET NOCOUNT ON;
        INSERT operator_security.audit(operator_id,action)
        VALUES(CONVERT(uniqueidentifier,JSON_VALUE(@json,'$.id')),JSON_VALUE(@json,'$.action'));SELECT 1;`,{id:operatorId,action:input.action},'append_audit')
      if(value!=='1')denied()
    },
    shutdown(){closed=true;privateKey.fill(0)},
  }
}
module.exports={encryptTotpSecret,decryptTotpSecret,createSqlOperatorStore}
