'use strict';
const fs=require('node:fs'),net=require('node:net');
const {createAdapterTicketClient}=require('./adapter-ticket-client');
const SOCKET='/run/infraflow-demo-adapter-review.sock';
function validateSocket(socket,parent){
 if(!socket.isSocket()||socket.uid!==0||socket.gid!==985||(socket.mode&0o7777)!==0o660||
  !parent.isDirectory()||parent.uid!==0||(parent.mode&0o022)!==0)throw Error('adapter_channel_refused');
}
function eligible(){if(process.platform!=='linux'||process.getuid?.()!==994||process.getgid?.()!==985)throw Error();}
function inspect(){validateSocket(fs.lstatSync(SOCKET),fs.lstatSync('/run'));}
function createAdapterChannelClient({connect=net.createConnection,checkIdentity=eligible,checkSocket=inspect}={}){
 const client=createAdapterTicketClient({role:'consumer',execute:async(_proc,args)=>{
  checkIdentity();checkSocket();
  return new Promise((resolve,reject)=>{
   let socket,settled=false,raw=Buffer.alloc(0);
   const finish=(error,value)=>{
    if(settled)return;settled=true;clearTimeout(timer);socket?.destroy();
    if(error)reject(Error('adapter_channel_unconfirmed'));else resolve(value);
   };
   const timer=setTimeout(()=>finish(true),10000);
   try{
    socket=connect({path:SOCKET,allowHalfOpen:true});
    socket.once('connect',()=>{try{socket.end(args.json);}catch{finish(true);}}); // EOF frames the bounded request.
    socket.on('data',chunk=>{
     if(settled)return;
     if(!Buffer.isBuffer(chunk)||chunk.some(v=>v>127)||raw.length+chunk.length>4096)return finish(true);
     raw=Buffer.concat([raw,chunk]);
    });
    socket.once('end',()=>{try{
     const response=JSON.parse(raw.toString('ascii'));
     if(!response||Object.keys(response).sort().join(',')!=='ok,receipt'||response.ok!==true)throw Error();
     finish(false,JSON.stringify(response.receipt));
    }catch{finish(true);}});
    socket.once('error',()=>finish(true));
    socket.once('close',()=>{if(!settled)finish(true);});
   }catch{finish(true);}
  });
 }});
 return client;
}
module.exports={createAdapterChannelClient,validateSocket};
