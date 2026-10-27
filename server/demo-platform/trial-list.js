'use strict'
const STATES=Object.freeze(['queued','provisioning','awaiting_activation','active','expired','purge_pending','purging','deleted'])
function filters(input={}){
  if(!input||Object.getPrototypeOf(input)!==Object.prototype||Object.keys(input).some(k=>!['limit','offset','state','search'].includes(k)))throw Error('trial_filter_invalid')
  const {limit=20,offset=0,state='',search=''}=input
  if(!Number.isInteger(limit)||limit<1||limit>50||!Number.isInteger(offset)||offset<0||offset>100000
    ||typeof state!=='string'||(state!==''&&!STATES.includes(state))||typeof search!=='string'||search.length>100||/[\x00-\x1f\x7f]/.test(search))throw Error('trial_filter_invalid')
  return {limit,offset,state,search}
}
const SQL=`SET NOCOUNT ON;
SELECT COUNT(*) AS total FROM platform.trials
WHERE (@state='' OR state=@state) AND (@search='' OR company_name LIKE @pattern ESCAPE N'~');
SELECT LOWER(CONVERT(char(36),trial_id)) AS id,company_name AS companyName,state,revision,
created_at AS createdAt,activated_at AS activatedAt,expires_at AS expiresAt
FROM platform.trials WHERE (@state='' OR state=@state) AND (@search='' OR company_name LIKE @pattern ESCAPE N'~')
ORDER BY created_at DESC,trial_id ASC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;`
function project(result,options){
  const sets=result?.recordsets,total=sets?.[0]?.[0]?.total,rows=sets?.[1]
  if(!Number.isInteger(total)||total<0||!Array.isArray(rows)||rows.length>options.limit)throw Error('trial_result_invalid')
  const date=(value,nullable)=>{if(value===null&&nullable)return null;if(!(value instanceof Date)||!Number.isFinite(value.getTime()))throw Error('trial_result_invalid');return value.toISOString()}
  const items=rows.map(row=>{
    if(typeof row.id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(row.id)
      ||typeof row.companyName!=='string'||!row.companyName.trim()||row.companyName.length>200||!STATES.includes(row.state)||!Number.isInteger(row.revision)||row.revision<0)throw Error('trial_result_invalid')
    return {id:row.id,companyName:row.companyName,state:row.state,revision:row.revision,createdAt:date(row.createdAt,false),activatedAt:date(row.activatedAt,true),expiresAt:date(row.expiresAt,true)}
  })
  return {items,total,limit:options.limit,offset:options.offset}
}
module.exports={STATES,filters,SQL,project}
