'use strict'
// Private CLI helper. stdin/stdout may contain setup material: never expose as HTTP.
const {hashPassword}=require('./operator-credentials')
const {encryptTotpSecret}=require('./operator-store')
async function createEnrollmentMaterial(input){
  if(!input||Object.getPrototypeOf(input)!==Object.prototype||Object.keys(input).sort().join(',')!=='id,keyHex,password,totpSecret,username'
    ||typeof input.username!=='string'||!/^[a-z0-9_.-]{1,64}$/.test(input.username)
    ||typeof input.keyHex!=='string'||!/^[a-f0-9]{64}$/.test(input.keyHex))throw Error('invalid_enrollment_material')
  const key=Buffer.from(input.keyHex,'hex')
  try{
    const envelope=encryptTotpSecret(input.totpSecret,{key,id:input.id,revision:1})
    const passwordHash=await hashPassword(input.password)
    return {id:input.id,username:input.username,revision:1,passwordHash,envelope}
  }finally{key.fill(0)}
}
if(require.main===module){
  let chunks=[],size=0
  process.stdin.on('data',chunk=>{size+=chunk.length;if(size>8192){process.stderr.write('enrollment_input_limit\n');process.exit(1)}chunks.push(chunk)})
  process.stdin.on('end',async()=>{
    try{const result=await createEnrollmentMaterial(JSON.parse(Buffer.concat(chunks).toString('utf8')));process.stdout.write(JSON.stringify(result))}
    catch{process.stderr.write('enrollment_material_failed\n');process.exitCode=1}
    finally{chunks=[]}
  })
}
module.exports={createEnrollmentMaterial}
