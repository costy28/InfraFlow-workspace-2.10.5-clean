'use strict'
const { createHash, randomUUID } = require('node:crypto')
function fail(code){throw Object.assign(Error(code),{code})}
const uuid=id=>typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)
function validate(input,write){
  if(process.env.NODE_ENV!=='test')fail('synthetic_test_only')
  const keys=write?'commandId,expectedGeneration,now,trialId':'trialId'
  if(!input||Object.getPrototypeOf(input)!==Object.prototype||Object.keys(input).sort().join(',')!==keys||!uuid(input.trialId))fail('invalid_runtime_generation_request')
  if(write&&(typeof input.commandId!=='string'||!/^[a-zA-Z0-9_.:-]{1,128}$/.test(input.commandId)
    ||!Number.isInteger(input.expectedGeneration)||input.expectedGeneration<0||input.expectedGeneration>2147483646
    ||!Number.isSafeInteger(input.now)||input.now<0))fail('invalid_runtime_generation_request')
}
function row(data){
  if(!data||!Number.isInteger(data.generation)||data.generation<1||!uuid(data.epoch?.toLowerCase())
    ||!Number.isSafeInteger(data.changedAt)||data.changedAt<0)fail('invalid_runtime_generation_result')
  return {generation:data.generation,epoch:data.epoch.toLowerCase(),changedAt:data.changedAt}
}
function createSqlRuntimeTestStore(run){
  return {
    async readRuntimeGeneration(input,options={}){
      validate(input,false)
      if(!options||Object.getPrototypeOf(options)!==Object.prototype||Object.keys(options).some(k=>k!=='signal')
        ||(options.signal!==undefined&&!(options.signal instanceof AbortSignal)))fail('invalid_runtime_generation_request')
      if(options.signal?.aborted)fail('synthetic_sql_aborted')
      const data=JSON.parse(await run(`SELECT COALESCE((SELECT generation,epoch,changed_at AS changedAt FROM dbo.demo_runtime_generations
        WHERE trial_id=CONVERT(uniqueidentifier,JSON_VALUE(@json,'$.trialId')) FOR JSON PATH,WITHOUT_ARRAY_WRAPPER),N'null');`,input,options))
      if(options.signal?.aborted)fail('synthetic_sql_aborted')
      return data===null?null:row(data)
    },
    async advanceRuntimeGeneration(input,options={}){
      validate(input,true)
      if(!options||Object.getPrototypeOf(options)!==Object.prototype||Object.keys(options).some(k=>k!=='fault')
        ||(options.fault!==undefined&&!['before_commit','after_commit_ack'].includes(options.fault)))fail('invalid_runtime_generation_request')
      const canonical={trialId:input.trialId,commandId:input.commandId,expectedGeneration:input.expectedGeneration,now:input.now}
      const digest=createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
      const data=JSON.parse(await run(`SET NOCOUNT ON;SET XACT_ABORT ON;
        BEGIN TRY
          BEGIN TRANSACTION;
          DECLARE @id uniqueidentifier=CONVERT(uniqueidentifier,JSON_VALUE(@json,'$.trialId')),
            @cmd nvarchar(128)=JSON_VALUE(@json,'$.commandId'),@state nvarchar(32),@snapshot nvarchar(max),
            @expected int=CONVERT(int,JSON_VALUE(@json,'$.expectedGeneration')),
            @now bigint=CONVERT(bigint,JSON_VALUE(@json,'$.now'));
          SELECT @state=state,@snapshot=snapshot FROM dbo.demo_trials WITH(UPDLOCK,HOLDLOCK) WHERE trial_id=@id;
          IF @state IS NULL BEGIN ROLLBACK;SELECT N'{"error":"trial_not_found"}';RETURN;END;
          IF EXISTS(SELECT 1 FROM dbo.demo_runtime_generation_commands WHERE trial_id=@id AND command_id=@cmd)
          BEGIN
            IF NOT EXISTS(SELECT 1 FROM dbo.demo_runtime_generation_commands WHERE trial_id=@id AND command_id=@cmd AND digest=JSON_VALUE(@json,'$.digest'))
              BEGIN ROLLBACK;SELECT N'{"error":"runtime_command_reused"}';RETURN;END;
            COMMIT;
            SELECT generation,epoch,changed_at AS changedAt FROM dbo.demo_runtime_generation_commands WHERE trial_id=@id AND command_id=@cmd FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;
            RETURN;
          END;
          IF @state<>N'active' OR @now<CONVERT(bigint,JSON_VALUE(@snapshot,'$.activatedAt')) OR @now>=CONVERT(bigint,JSON_VALUE(@snapshot,'$.expiresAt'))
            BEGIN ROLLBACK;SELECT N'{"error":"runtime_trial_ineligible"}';RETURN;END;
          DECLARE @current int=0,@changed bigint=0;
          SELECT @current=generation,@changed=changed_at FROM dbo.demo_runtime_generations WHERE trial_id=@id;
          IF @current<>@expected BEGIN ROLLBACK;SELECT N'{"error":"runtime_generation_conflict"}';RETURN;END;
          IF @now<@changed BEGIN ROLLBACK;SELECT N'{"error":"runtime_time_reversal"}';RETURN;END;
          DECLARE @next int=@current+1,@epoch uniqueidentifier=CONVERT(uniqueidentifier,JSON_VALUE(@json,'$.epoch'));
          IF @current=0 INSERT dbo.demo_runtime_generations VALUES(@id,@next,@epoch,@now);
          ELSE UPDATE dbo.demo_runtime_generations SET generation=@next,epoch=@epoch,changed_at=@now WHERE trial_id=@id;
          INSERT dbo.demo_runtime_generation_commands VALUES(@id,@cmd,JSON_VALUE(@json,'$.digest'),@next,@epoch,@now);
          IF JSON_VALUE(@json,'$.failBeforeCommit')='true' THROW 51103,'synthetic_runtime_before_commit',1;
          COMMIT;
          SELECT @next AS generation,@epoch AS epoch,@now AS changedAt FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;
        END TRY
        BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;`,
      {...canonical,digest,epoch:randomUUID(),failBeforeCommit:options.fault==='before_commit'}))
      if(data.error)fail(data.error)
      const result=row(data)
      if(options.fault==='after_commit_ack')fail('synthetic_runtime_ack_lost')
      return result
    },
  }
}
module.exports={createSqlRuntimeTestStore}
