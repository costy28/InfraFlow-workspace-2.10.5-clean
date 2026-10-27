'use strict';
(()=>{
  const form=document.getElementById('login'),panel=document.getElementById('session'),message=document.getElementById('message')
  const password=document.getElementById('password'),code=document.getElementById('code'),logout=document.getElementById('logout')
  let busy=false,generation=0,offset=0,listBusy=false
  const filters=document.getElementById('filters'),rows=document.getElementById('companies'),listMessage=document.getElementById('list-message')
  const previous=document.getElementById('previous'),next=document.getElementById('next')
  const notice=(text,error=false)=>{message.textContent=text;message.dataset.error=String(error)}
  const lock=value=>{busy=value;for(const input of form.elements)input.disabled=value;logout.disabled=value}
  const showLogin=()=>{generation++;form.hidden=false;panel.hidden=true;rows.replaceChildren();document.getElementById('expiry').textContent=''}
  const showSession=session=>{generation++;form.hidden=true;panel.hidden=false;document.getElementById('expiry').textContent='Expirare maximă: '+new Date(session.expiresAt).toLocaleString('ro-RO')+'. Sesiunea expiră și după 15 minute de inactivitate.';offset=0;loadList()}
  async function loadList(){
    if(listBusy||panel.hidden)return
    const current=generation;listBusy=true;previous.disabled=true;next.disabled=true
    listMessage.textContent='Se încarcă registrul…';rows.replaceChildren()
    try{
      const params=new URLSearchParams({limit:'20',offset:String(offset),state:document.getElementById('state').value,search:document.getElementById('search').value})
      const data=await call('/operator/trials?'+params)
      if(current!==generation)return
      if(!data){showLogin();notice('Sesiunea nu mai este activă.',true);return}
      const labels={queued:'În așteptare',provisioning:'În pregătire',awaiting_activation:'Așteaptă activarea',active:'Activă',expired:'Expirată',purge_pending:'Așteaptă ștergerea',purging:'În curs de ștergere',deleted:'Ștearsă'}
      const date=value=>value?new Date(value).toLocaleDateString('ro-RO'):'—'
      for(const item of data.items){
        const row=document.createElement('tr')
        for(const text of [item.companyName,labels[item.state]||item.state,date(item.createdAt),date(item.expiresAt)]){const cell=document.createElement('td');cell.textContent=text;row.append(cell)}
        rows.append(row)
      }
      listMessage.textContent=data.total===0?'Nu există companii pentru filtrele alese.':`${data.total} companii. Pozițiile ${offset+1}–${offset+data.items.length}.`
      previous.disabled=offset===0;next.disabled=offset+data.items.length>=data.total
    }catch{if(current===generation)listMessage.textContent='Registrul nu a putut fi încărcat. Datele existente nu au fost modificate.'}
    finally{listBusy=false;if(current!==generation&&!panel.hidden)loadList()}
  }
  filters.addEventListener('submit',event=>{event.preventDefault();if(!listBusy){offset=0;loadList()}})
  previous.addEventListener('click',()=>{if(!listBusy){offset=Math.max(0,offset-20);loadList()}})
  next.addEventListener('click',()=>{if(!listBusy){offset+=20;loadList()}})
  async function call(path,input,csrf){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000)
    try{
      const headers={};if(input!==undefined)headers['Content-Type']='application/json';if(csrf)headers['X-CSRF-Token']=csrf
      const response=await fetch(path,{method:input===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers,body:input===undefined?undefined:JSON.stringify(input),signal:controller.signal})
      if(response.status===401)return null
      if(!response.ok)throw Error()
      return await response.json()
    }finally{clearTimeout(timer)}
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!form.reportValidity())return
    const input={username:document.getElementById('username').value,password:password.value,code:code.value}
    lock(true);notice('Se verifică autentificarea…')
    try{
      const session=await call('/operator/login',input)
      if(!session){notice('Autentificare refuzată sau limită de încercări atinsă. Verifică datele înainte de o nouă încercare.',true);return}
      showSession(session);notice('Autentificare reușită.')
    }catch{notice('Rezultatul nu a putut fi confirmat. Codul poate fi consumat; nu retrimite automat cererea. Reîncarcă pagina pentru verificarea sesiunii.',true)}
    finally{password.value='';code.value='';input.password='';input.code='';lock(false)}
  })
  logout.addEventListener('click',async()=>{
    if(busy)return;lock(true);notice('Se închide sesiunea…')
    try{
      // Refresh CSRF before logout, including after reload or activity in another tab.
      const session=await call('/operator/session')
      if(!session){showLogin();notice('Sesiunea nu mai este activă.');return}
      const result=await call('/operator/logout',{},session.csrfToken)
      if(!result)throw Error()
      showLogin();notice('Ai ieșit din sesiune.');password.value='';code.value=''
    }catch{notice('Ieșirea nu a putut fi confirmată. Nu considera sesiunea închisă; reîncarcă pagina pentru verificare.',true)}
    finally{lock(false)}
  })
  async function initial(){
    lock(true)
    try{const session=await call('/operator/session');if(session){showSession(session);notice('Sesiunea existentă este activă.')}else{showLogin();notice('Introdu parola operatorului și codul din Authenticator.')}}
    catch{showLogin();notice('Sesiunea nu a putut fi verificată. Verifică legătura înainte de autentificare.',true)}
    finally{lock(false)}
  }
  initial()
})()
