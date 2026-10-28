'use strict';
(()=>{
  const form=document.getElementById('login'),panel=document.getElementById('session'),message=document.getElementById('message')
  const password=document.getElementById('password'),code=document.getElementById('code'),logout=document.getElementById('logout')
  let busy=false,generation=0,offset=0,listBusy=false
  const filters=document.getElementById('filters'),rows=document.getElementById('companies'),listMessage=document.getElementById('list-message')
  const previous=document.getElementById('previous'),next=document.getElementById('next')
  const registration=document.getElementById('registration'),registerForm=document.getElementById('register-form'),registerMessage=document.getElementById('register-message')
  const approval=document.getElementById('approval'),company=document.getElementById('company-name'),commandId=document.getElementById('command-id'),registerButton=document.getElementById('register-submit')
  let proposal=null,uncertain=false
  const preparation=document.getElementById('preparation'),prepareForm=document.getElementById('prepare-form'),prepareMessage=document.getElementById('prepare-message'),prepareButton=document.getElementById('prepare-submit')
  let canPrepare=false,prepareProposal=null,prepareUncertain=false
  const notice=(text,error=false)=>{message.textContent=text;message.dataset.error=String(error)}
  const lock=value=>{busy=value;for(const input of form.elements)input.disabled=value;logout.disabled=value}
  const showLogin=()=>{generation++;canPrepare=false;form.hidden=false;panel.hidden=true;rows.replaceChildren();document.getElementById('expiry').textContent=''}
  const showSession=session=>{generation++;canPrepare=session.canPrepare===true;form.hidden=true;panel.hidden=false;registration.hidden=session.canRegister!==true;preparation.hidden=!canPrepare||!prepareProposal;document.getElementById('expiry').textContent='Expirare maximă: '+new Date(session.expiresAt).toLocaleString('ro-RO')+'. Sesiunea expiră și după 15 minute de inactivitate.';offset=0;loadList()}
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
        const action=document.createElement('td')
        if(canPrepare&&item.state==='queued'&&item.revision===0&&typeof item.id==='string'){
          const button=document.createElement('button');button.type='button';button.textContent='Pregătește demo'
          button.addEventListener('click',()=>{
            if(busy||prepareUncertain)return
            prepareProposal={trialId:item.id,expectedRevision:item.revision,commandId:'prepare:'+crypto.randomUUID(),confirmed:true}
            document.getElementById('prepare-trial').value=item.id;document.getElementById('prepare-revision').value=String(item.revision)
            document.getElementById('prepare-command').value=prepareProposal.commandId
            document.getElementById('prepare-company').textContent=item.companyName
            document.getElementById('prepare-confirm').checked=false;prepareButton.textContent='Confirmă solicitarea jobului'
            preparation.hidden=false;prepareMessage.textContent='Verifică firma și confirmă operația. Instanța nu va fi creată în această etapă.'
            preparation.scrollIntoView({block:'nearest'})
          });action.append(button)
        }else action.textContent='—'
        row.append(action)
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
      if(!response.ok){const data=await response.json().catch(()=>({}));const error=Error('request_failed');error.code=data.code;throw error}
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
  registerForm.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!registerForm.reportValidity())return
    if(!proposal){
      if(!commandId.value)commandId.value='queue:'+crypto.randomUUID()
      proposal={approvalId:approval.value,companyName:company.value.trim(),commandId:commandId.value,confirmed:true}
    }
    const current=generation
    lock(true);registerButton.disabled=true
    approval.readOnly=true;company.readOnly=true;commandId.readOnly=true
    registerMessage.textContent='Se înregistrează numai în registru… Comandă: '+proposal.commandId
    try{
      const session=await call('/operator/session')
      if(!session){showLogin();notice('Sesiunea nu mai este activă. Comanda nu a fost trimisă; autentifică-te pentru reluare.',true);return}
      const result=await call('/operator/trials/register',proposal,session.csrfToken)
      if(current!==generation)return
      if(!result){registerMessage.textContent='Acces refuzat înainte de înregistrare. Verifică sesiunea și permisiunile.';return}
      uncertain=false;proposal=null;registerForm.reset();approval.readOnly=false;company.readOnly=false;commandId.readOnly=false
      registerButton.textContent='Înregistrează în registru'
      registerMessage.textContent='Compania a fost înscrisă în registru, în așteptare. Nu s-a creat sau pornit o instanță demo.'
      offset=0;loadList()
    }catch(error){
      if(current!==generation)return
      if(error.code==='registration_conflict'){
        uncertain=false;registerMessage.textContent='Conflict: aprobarea sau comanda este deja asociată altor date. Nu genera o comandă nouă pentru a ocoli conflictul. Identificator: '+proposal.commandId
      }else if(error.code==='registration_input_invalid'){
        uncertain=false;proposal=null;approval.readOnly=false;company.readOnly=false;commandId.readOnly=false
        registerMessage.textContent='Date invalide. Verifică referința, denumirea și identificatorul comenzii.'
      }else{
        uncertain=true;registerButton.textContent='Reia explicit aceeași comandă'
        registerMessage.textContent='Rezultat neconfirmat: înregistrarea poate exista deja. Notează identificatorul înainte de închiderea paginii: '+proposal.commandId+'. Reluarea folosește exact aceleași date; nu este automată.'
      }
    }finally{registerButton.disabled=false;lock(false)}
  })
  prepareForm.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!prepareProposal||!prepareForm.reportValidity())return
    const current=generation,command=prepareProposal;lock(true);prepareButton.disabled=true
    prepareMessage.textContent='Se solicită numai jobul… Comandă: '+command.commandId
    try{
      const session=await call('/operator/session')
      if(!session){showLogin();notice('Sesiunea nu mai este activă. Cererea nu a fost trimisă; autentifică-te pentru reluare.',true);return}
      if(session.canPrepare!==true){prepareMessage.textContent='Permisiunea de pregătire nu mai este disponibilă. Cererea nu a fost trimisă.';return}
      const result=await call('/operator/trials/prepare',command,session.csrfToken)
      if(current!==generation)return
      if(!result){prepareMessage.textContent='Acces refuzat. Verifică sesiunea și permisiunea; nu genera altă comandă.';return}
      const r=result.receipt
      if(!r||r.trialId!==command.trialId||r.executionAllowed!==false||r.jobState!=='queued'||r.trialRevision!==command.expectedRevision+1||typeof r.jobId!=='string')throw Error()
      prepareUncertain=false;prepareProposal=null;prepareForm.reset();preparation.hidden=true
      prepareMessage.textContent='Job înregistrat: '+r.jobId+'. Instanța nu este creată sau activată; perioada de 15 zile nu a început.'
      loadList()
    }catch(error){
      if(current!==generation)return
      if(error.code==='provision_request_invalid'){
        prepareUncertain=false;prepareProposal=null;preparation.hidden=true;prepareMessage.textContent='Cerere invalidă. Selectează din nou compania după verificarea datelor.'
      }else{
        prepareUncertain=true;prepareButton.textContent='Reia explicit aceeași solicitare'
        prepareMessage.textContent='Rezultat neconfirmat: jobul poate exista deja. Notează comanda '+command.commandId+' și UUID-ul '+command.trialId+'. Reluarea folosește aceleași date și nu este automată.'
      }
    }finally{prepareButton.disabled=false;lock(false)}
  })
  window.addEventListener('beforeunload',event=>{if(uncertain||prepareUncertain){event.preventDefault();event.returnValue=''}})
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
