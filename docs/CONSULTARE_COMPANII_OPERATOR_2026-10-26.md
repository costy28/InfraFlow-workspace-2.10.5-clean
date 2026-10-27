# Registru companii operator — consultare locală

## Dovezi VPS și Access

Instalare HTTP v1 confirmată: OPERATOR_HTTP_INSTALLED, UI_LOCAL_OK,
SESSION_GATE_OK, OPERATOR_HEALTH_OK, SQL_READER_HEALTH_OK. Capturi utilizator:
autentificare prin operator.infraflow.ro și logout funcționale; nu s-a afirmat
separat în capturi rezultatul reîncărcării paginii.

Verificare HTTPS fără cookie din mediul agentului: `/operator`,
`/operator/session`, `/operator/logout` răspund 302 către
noisy-mouse-4240.cloudflareaccess.com. DNS public rezolvat explicit pentru a evita
cache-ul negativ al routerului local; certificatul TLS verificat de curl.
Testul cu email nepermis rămâne manual; nu se solicită email către terți.

## Increment local neinstalat

- GET `/operator/trials` autentificat și auditat înaintea citirii și înaintea
  răspunsului. Sesiune revocată în timpul citirii nu dezvăluie datele.
- Reader SQL `infraflow_demo_platform`, aceleași drepturi SELECT existente.
  Nu se folosește auth login pentru citirea registrului, nici SA sau DML.
- Query fix, parametri MSSQL, fără SQL din cerere; LIKE escape pentru ~/%/_/[.
- Paginare implicit 20, maxim 50; offset maxim 100000, stare whitelist, căutare
  maxim 100 caractere. Fără coadă nelimitată; reader refuză concurența suplimentară.
- Proiecție whitelist: id, companyName, state, revision și date UTC. Fără
  database_name/storage_key/runtime_key/key_ref, SQL intern sau parole.
- UI: căutare după nume, stare, paginare și date. textContent, fără HTML injectat.
  Registrul este separat de conturile demo-ului ERP comun; zero rânduri este un
  rezultat valid. Nu există butoane de creare/activare/ștergere.

Validare locală: 37/37 teste Node. Include negative de autorizare/revocare,
parametri, filtrare și lipsa operațiilor SQL de scriere. Smoke Chrome fixture
verifică și nume ce conține HTML, afișat literal, fără element HTML executat.
SQL real cu acest query și registrul gol, distribuția noului fișier trial-list.js
și acceptanța browser pe VPS urmează separat. Pachetul HTTP v1 existent NU conține
acest increment; arhiva livrată anterior rămâne nemodificată.

Proba separată pregătită: probe-demo-platform-registry.py --probe-confirmed,
Linux/root doar pentru director root-owned nou registry-read-probe-v1. Execută
Node prin /usr/sbin/runuser sub infraflow-demo-platform, cu credentialul reader
existent, fără parola SA/auth și fără TOTP. Listează maximum un rând, afișează
doar markerul și numărul total; verifică separat filtrul active + caractere LIKE
literale. Nu tipărește nume/identificatori, SQL brut sau erori driver. Nu conține
comenzi systemctl, nu activează release-ul și nu schimbă schema/granturi/date.
La eșec se păstrează directorul pentru diagnostic și nu se reia automat.

## Confirmare VPS și livrare UI

Utilizatorul a raportat REGISTRY_READ_OK, REGISTRY_TOTAL=0, REGISTRY_FILTERS_OK și
REGISTRY_PROBE_COMPLETE_NO_RESTART. Query-ul real și filtrele au trecut sub
identitatea reader. Nu au fost create companii sau date sintetice pe VPS.

Pachet UI separat: instalator install-demo-platform-operator-registry.py, release
nou operator-http-v2 și drop-in nou 41-operator-registry.conf. Cere release activ
operator-http-v1 și refuză ținte existente. Nu suprascrie configurațiile 20/30/40,
credentialele sau release-ul anterior. La eșec după activare înlătură numai noul
drop-in și verifică health operator/SQL pe configurația HTTP v1 restaurată.

Verificarea instalării include pagina listei, asset-uri, refuz 401 pentru registru
și sesiune fără cookie și readiness încă 503. Nu încearcă login, nu consumă TOTP.
Browserul autorizat trebuie să confirme separat lista goală și filtrele după
instalare. Nu se modifică schema, drepturile SQL, ruta Cloudflare sau ERP.
