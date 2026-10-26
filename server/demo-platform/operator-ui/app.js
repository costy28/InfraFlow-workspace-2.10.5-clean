'use strict';
(()=>{
  const form=document.getElementById('login'),panel=document.getElementById('session'),message=document.getElementById('message')
  const password=document.getElementById('password'),code=document.getElementById('code'),logout=document.getElementById('logout')
  let busy=false
  const notice=(text,error=false)=>{message.textContent=text;message.dataset.error=String(error)}
  const lock=value=>{busy=value;for(const input of form.elements)input.disabled=value;logout.disabled=value}
  const showLogin=()=>{form.hidden=false;panel.hidden=true;document.getElementById('expiry').textContent=''}
  const showSession=session=>{form.hidden=true;panel.hidden=false;document.getElementById('expiry').textContent='Expirare maximă: '+new Date(session.expiresAt).toLocaleString('ro-RO')+'. Sesiunea expiră și după 15 minute de inactivitate.'}
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
