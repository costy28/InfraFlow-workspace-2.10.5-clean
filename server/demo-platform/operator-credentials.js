'use strict'
// Standalone primitives; no ERP accounts, settings, sessions or database imports.
const crypto=require('node:crypto'),{promisify}=require('node:util')
const scrypt=promisify(crypto.scrypt)
const parameters={N:32768,r:8,p:3,maxmem:64*1024*1024}
const validPassword=p=>typeof p==='string'&&[...p].length>=16&&Buffer.byteLength(p)<=1024&&!/[\x00-\x1f\x7f]/.test(p)
async function hashPassword(password){
  if(!validPassword(password))throw Error('invalid_operator_password')
  const salt=crypto.randomBytes(16).toString('hex')
  const hash=await scrypt(password,Buffer.from(salt,'hex'),32,parameters)
  return `scrypt-v1$${salt}$${hash.toString('hex')}`
}
async function verifyPassword(password,stored){
  if(!validPassword(password)||typeof stored!=='string'||!/^scrypt-v1\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(stored))return false
  const [,salt,hex]=stored.split('$')
  const hash=await scrypt(password,Buffer.from(salt,'hex'),32,parameters)
  return crypto.timingSafeEqual(hash,Buffer.from(hex,'hex'))
}
function secretBytes(secret){
  if(typeof secret!=='string'||!/^[A-Z2-7]{32}$/.test(secret))throw Error('invalid_operator_totp_secret')
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=0,value=0;const bytes=[]
  for(const char of secret){value=(value<<5)|alphabet.indexOf(char);bits+=5;if(bits>=8){bytes.push((value>>>(bits-8))&255);bits-=8}}
  return Buffer.from(bytes)
}
function totpAtCounter(secret,counter){
  if(!Number.isSafeInteger(counter)||counter<0)throw Error('invalid_operator_totp_counter')
  const bytes=Buffer.alloc(8);bytes.writeBigUInt64BE(BigInt(counter))
  const digest=crypto.createHmac('sha1',secretBytes(secret)).update(bytes).digest(),offset=digest[19]&15
  return String((digest.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')
}
function acceptedTotpCounter(secret,code,now){
  if(typeof code!=='string'||!/^\d{6}$/.test(code)||!Number.isSafeInteger(now)||now<0)return null
  const counter=Math.floor(now/30000)
  for(const candidate of [counter,counter-1])if(candidate>=0&&crypto.timingSafeEqual(Buffer.from(totpAtCounter(secret,candidate)),Buffer.from(code)))return candidate
  return null
}
module.exports={hashPassword,verifyPassword,totpAtCounter,acceptedTotpCounter}
