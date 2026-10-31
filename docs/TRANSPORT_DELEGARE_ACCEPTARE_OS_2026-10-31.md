# Transport legat pentru delegare și acceptare OS

Componentă locală privată, fără instalare sau comandă nouă pe VPS în această etapă.
ERP rămâne 2.12.736. Nu există CLI de creare sau orchestrator instalat prin acest cod.

`os-delegation-rpc-client.js` folosește doi clienți separați:

- worker: verificatorul de patru RPC; interfața nouă expune doar pregătirea delegării;
- executor: verificatorul de trei RPC; interfața expune acceptare, context și rezultat.

Ambele sunt legate la construcție de jobId/trialId/intentId/generation/jobRevision.
Tokenurile se transmit numai în parametrul JSON al procedurii, fără argv sau log.
Procedurile, serverul, baza și loginul sunt fixe pe profil; nu există execuție SQL
arbitrară în API. Configurația și portul driver sunt de încredere, nu intrare browser.

Fiecare RPC verifică întâi profilul efectiv de drepturi. Răspunsul trebuie să aibă
exact câmpurile așteptate, aceleași legături și `executionAllowed=false`.
Acceptarea trebuie să păstreze `nextGate=durable_result_and_reconciliation_protocol`.
Contextul este doar informativ pentru garda separată, cu termen 15–60 secunde.
Rezultatul incert cere UID/GID null; cel observat cere identificatori pozitivi.

Nu există retry automat. O eroare de transport, răspuns neconfirmat sau nepotrivire
de legături marchează clientul ca neutilizabil; shutdown așteaptă cererea în curs și
închide pool-ul. Clientul nu face compensări, adoptări sau ștergeri după incertitudine.

## Probe

Testele unitare verifică separarea metodelor, payload-ul legat, refuzul câmpurilor
suplimentare/getterelor, răspunsurile cu altă revizie și autoritatea OS nepermisă.

Proba `scripts/probe-demo-os-delegation-clients.cjs` folosește proceduri SQL reale
într-o bază sintetică și un driver fixture injectat pentru apeluri. Autentificarea
pool-ului și metadatele clientului sunt simulate în această probă; validarea SQL
nativă a scope-urilor de patru/trei RPC a fost făcută separat, nu este pretinsă aici.
Se verifică replay-ul exact al pregătirii, acceptarea, contextul, înregistrarea
unui rezultat incert și refuzul celei de-a doua raportări. Nu se rulează comenzi OS.
Lease-ul de cinci minute și termenul scurtat al acceptării apar numai în fixture;
nu sunt modificări ale duratelor din producție.

Rezultat local: 188 teste Node trecute; audit advisory 638 fișiere, zero constatări.
Proba SQL pe `INFRAFLOW_TEST_TRIALS_FCAF48826961`: 9 grupuri trecute,
`passed=true`, `cleanup=true`. Baza temporară a fost eliminată. Nicio operație
pe VPS, nicio identitate OS și nicio activare de companie nu au fost executate.

## Înaintea primei creări reale

Mai trebuie montate orchestrat porturile de lease/intent, delegare, IPC protejat,
execuție, observare și raportare. Tokenurile și starea de reconciliere trebuie
păstrate protejat astfel încât un crash să nu conducă la retry/adoptare automată.
Prima creare reală va necesita confirmare distinctă pentru pilot și nu activează
singură aplicația sau perioada de 15 zile. Nu trata aceste teste ca tenant funcțional.
