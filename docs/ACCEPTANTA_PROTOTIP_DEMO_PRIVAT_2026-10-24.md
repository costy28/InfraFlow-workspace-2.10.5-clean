# Acceptanță tehnică — prototip Demo privat pe companie

Data verificării: 24 octombrie 2026. Sursă: **2.12.736**, HEAD de referință
`cf3eb9a`, plus modificările locale necomise. Raportul descrie acest checkout,
nu o versiune instalată pe VPS. Nu este certificat de securitate sau de livrare.

## 1. Verdict

**Prototip local verificat; pilot public blocat.**

Modelul și adaptoarele TEMP/JSON demonstrează parcursul aprobare → instanță →
invitație → activare → wizard → utilizare → expirare/prelungire → restaurare.
Nu reprezintă încă serviciul de provisionare pe Linux/MSSQL. Nu activăm wizardul
privat în Demo-ul comun, nu migrăm conturile existente și nu activăm ștergerea.

O companie rămâne o instanță distinctă: proces, bază, storage, cheie și sesiuni.
Nu se adaugă un selector de tenant peste pool-ul/cache-ul global al ERP-ului.

## 2. Ce este verificat și ce NU rezultă din probe

| Componentă | Dovadă locală | Limită de acceptanță |
| --- | --- | --- |
| Stări, revizii, idempotentă | `demo-trial-registry.test.js`, `demo-trial-store.test.js` | Registru JSON cu lock cooperant, nu tranzacții SQL/control plane disponibil public |
| Aprobare și provisionare | `demo-approval-orchestrator.test.js`, `demo-local-provisioning.test.js` | Procese JSON pe loopback; fără conturi SQL/OS dedicate ori rutare publică |
| Administrator companie | `demo-company-setup.test.js`, probe HTTP | Rol restrâns în scenariile acoperite; nu audit exhaustiv al tuturor modulelor ERP |
| Wizard și aplicare | `demo-company-apply.test.js`, `demo-company-setup-http.test.js`, Chrome | Profil și module, progres/retry; nu configurare completă pe fiecare modul sau utilizatori invitați ulterior |
| Invitație și activare | `demo-invitation.test.js`, Chrome | Token unic/hash-only, parolă reală, 15 zile; fără livrare reală WordPress/email |
| Lifecycle și prelungire | `demo-runtime-reconciliation.test.js` | ERP și registry sunt două fișiere; reconcilierea nu este o tranzacție distribuită |
| Recuperare proces | `demo-runtime-recovery.test.js`, `demo-coordinator-client.test.js` | Pierdere simulată a coordonatorului și oprire de copil cunoscut; nu crash OS sau power loss |
| Retenție | `demo-retention-plan.test.js` | Exclusiv dry-run; nicio ștergere reală și nicio durată implicită aprobată |
| Inventar resurse/backupuri/storage | `demo-resource-inventory.test.js`, `demo-backup-inventory.test.js`, `demo-storage-inventory.test.js` | Manifesturi sintetice locale; nu inventarierea tuturor copiilor externe/rutelor/ACL-urilor |
| Restaurare JSON | `demo-backup-restore.test.js` | Director/proces/cheie de test noi; fără restaurare MSSQL sau dovada decriptării secretelor |
| Restaurare comună | `demo-joint-restore.test.js` | Fixture plat JSON+storage, nu snapshot atomic live al întregului ERP |
| Acces la fișier restaurat | Același test, autentificare originală | Download prin adaptor exclusiv de test, owner-only; nu endpoint nativ certificat pentru toate documentele |
| Restricții după restart | Același test, patru restarturi reale | Modul/permisiune, sesiune și nonce vechi refuzate; furnizor JSON, nu întreaga matrice MSSQL |

Fișierele de test sunt în `server/tests/`; helperii concreți în
`server/tests/support/`; modelul și adaptoarele prototipului în `scripts/lib/`.
Planul detaliat și istoricul probelor sunt în
`docs/PLAN_DEMO_COMPANII_2026-10-22.md`, secțiunile 8–33.

### Limite care trebuie păstrate în comunicarea comercială

1. Nu promitem încă „fiecare solicitant primește automat un spațiu complet izolat”.
2. Nu promitem ștergere automată completă la termen sau ștergerea tuturor copiilor.
3. Nu prezentăm manifestele SHA-256 drept semnătură/autenticitate: un atacator care
   poate rescrie toate componentele nu este blocat doar de aceste hashuri.
4. Restaurarea de test nu certifică secrete criptate, toate tipurile de fișiere
   și toate domeniile ERP. Cheia nouă din fixture nu rezolvă migrarea secretelor.
5. Un rezultat JSON `passed: true` este o dovadă pentru scope-ul declarat, nu
   permisiune de instalare sau ștergere. Păstrăm `productionRestoreApproved=false`.

## 3. Dovezi și repetabilitate

Rezultat curent, rerulat pentru acest raport: **87/87 teste trecute**, zero skip,
inclusiv Chrome. Audit expuneri: **481 fișiere, zero constatări**. Diff check
trecut; verificarea finală a găsit **zero procese sintetice rămase active**.
Acestea sunt 18 fișiere de test, nu 87 de fluxuri ERP complete.

Rularea extinsă include cele 15 fișiere ale regresiei anterioare, plus probele
unitare pentru store, setup și aplicare. Chrome trebuie activat explicit prin
`INFRAFLOW_PLAYWRIGHT_MODULE`, către modulul Playwright disponibil local;
fără acesta proba browser este sărită și raportul nu poate declara validarea UI.

Comanda, din rădăcina proiectului, după configurarea modulului Playwright:

```powershell
node --test --test-concurrency=2 server/tests/demo-coordinator-client.test.js server/tests/demo-joint-restore.test.js server/tests/demo-storage-inventory.test.js server/tests/demo-backup-restore.test.js server/tests/demo-backup-inventory.test.js server/tests/demo-resource-inventory.test.js server/tests/demo-retention-plan.test.js server/tests/demo-trial-registry.test.js server/tests/demo-trial-store.test.js server/tests/demo-company-setup.test.js server/tests/demo-company-apply.test.js server/tests/demo-runtime-reconciliation.test.js server/tests/demo-runtime-recovery.test.js server/tests/demo-local-provisioning.test.js server/tests/demo-approval-orchestrator.test.js server/tests/demo-company-wizard-browser.test.js server/tests/demo-invitation.test.js server/tests/demo-company-setup-http.test.js
npm run audit:file-exposure
git diff --check
```

Nu se setează flagurile SQL din `demo-two-instances.test.js` prin această
comandă. Proba SQL opt-in existentă este separată și nu a fost rerulată pentru
acest raport; rezultatele ei istorice nu sunt tratate ca validare a noului lifecycle.
Nu se colectează nonce-uri, parole, chei sau conținut de document în raport.

Artefacte locale regenerate de probe:

- `installer/output/qa/demo-restore-probe.json`: autentificare/setup JSON restaurate;
- `installer/output/qa/demo-storage-restore-probe.json`: copiere verificată de octeți;
- `installer/output/qa/demo-joint-restore-probe.json`: referințe, autorizare de test,
  retragere de drepturi și persistența lor după restart.

Artefactele nu sunt un catalog de release și nu sunt pachete pentru client.
În proba cu restart, loginurile noi modifică intenționat numai auditul de login
și `devices.lastSeenAt`; aceste efecte sunt verificate separat de datele de lucru.

### Incident de test încă neînchis complet

În investigația anterioară s-a observat o terminare a coordonatorului cu
`0xC0000409` pe Windows/Node v24.15.0. Ieșirea naturală, gestionarea IPC și
cleanup-ul au fost întărite, iar repetările au trecut. Nu există însă dump sau
dovadă suficientă pentru cauza nativă exactă. Aceasta rămâne o observație deschisă,
nu „bug Node remediat”. Detalii și surse oficiale: secțiunea 32 a planului.

## 4. Blocaje înainte de pilot public

| Poartă | Ce lipsește pentru acceptare |
| --- | --- |
| Control plane durabil | Registru SQL separat, constrângeri de unicitate, CAS tranzacțional, comenzi/retry și jurnal de joburi persistente |
| Autoritate administrativă | Autentificarea operatorului, autorizare pe comenzi și audit; `actor.kind` ori nonce-ul din harness nu sunt modelul de autentificare public |
| Provisionare izolată | Identitate administrativă separată de fiecare identitate runtime SQL/OS; ACL-uri și probe negative directe pe bazele/directoarele vecine |
| Rutare și acces | Hostname din registry, gateway fail-closed, sesiuni/linkuri/fișiere verificate pe instanță și la expirare; fără port/URL ales de browser |
| Efecte externe | Blocare efectivă a SMTP/IMAP/Oblio/ANAF/WhatsApp/GPS și schedulerelor în trial; serviciu platformă separat pentru invitații |
| Backup și restaurare | MSSQL + storage + cheia corectă, restaurare izolată, decriptare demonstrată, inventar al copiilor externe și al domeniilor ERP incluse |
| Ștergere controlată | Politică explicită date/backupuri, executor cu reverificare și dovezi; A șters fără a afecta B; fără ștergere pornită dintr-un simplu dry-run |
| Capacitate și operare | Măsurători pe mediul de pilot, limită concurentă, coadă, monitorizare, recuperare și procedură de oprire a pilotului |
| Integrare comercială | Aprobarea existentă WordPress → job idempotent → invitație trimisă numai după instanță sănătoasă; scenariu verificat fără emitere fiscală reală |

Decizii de operator necesare înainte de activare: mediul pilot, limita de trialuri
simultane după măsurători, retenția datelor și backupurilor, hostname-urile și
identitățile de serviciu. Nu completăm aceste valori din presupuneri și nu sunt
necesare pentru proiectarea offline a registrului SQL.

## 5. Următoarea etapă concretă — registru SQL tranzacțional izolat

Ordinea propusă, fără modificarea Demo-ului comun:

1. Stabilirea contractului de persistență pornind de la modelul existent:
   trial/aprobare/resurse, revizie, comenzi idempotente, evenimente și joburi.
   Schema control plane-ului nu se instalează în bazele ERP ale companiilor.
2. Proiectarea tranzacțiilor: unicitate pentru aprobare/resurse/comandă, refuzul
   unei revizii vechi și commit comun pentru schimbarea stării și jobul necesar.
   Nu ținem tranzacția SQL deschisă cât pornește un proces sau se trimite email.
3. Contract pentru worker cu lease și verificarea generației jobului: un worker
   întârziat nu poate confirma un job reatribuit. Efectele externe se reconciliază;
   nu se promite execuție fizică „exact o dată” doar printr-un ID de comandă.
4. Implementare/testare într-o bază de test explicită, cu două conexiuni/workeri:
   aceeași aprobare concurentă, aceeași revizie, reluare după commit și proces căzut.
   Testul refuză o bază reală sau credențiale de producție.
5. Adaptarea orchestratorului la contract numai după aceste probe. Provisionarea,
   gateway-ul și ștergerea rămân dezactivate până la propriile porți de acceptare.

**Criteriu de închidere al următorului increment:** registry-ul SQL păstrează
starea/idempotenta după întrerupere și concurență, fără să creeze ori să șteargă
resurse reale și fără conexiune din trial spre control plane. Un test doar JSON
nu poate închide această poartă.

## 6. Livrare și limitele acestei etape

Actualizare ulterioară în aceeași zi: prima probă de registry SQL este implementată
și a trecut 9/9 teste reale, separat de rularea 87/87 de mai sus. Vezi
`docs/REGISTRU_DEMO_SQL_PROBA_2026-10-24.md`. Poarta „control plane durabil” rămâne
parțială: nu sunt încă worker/lease, întregul contract de setup/invitații și
serviciul Node/Linux. Poarta nu este închisă doar prin această probă SQL.

Extensie ulterioară: claim/lease/generație și confirmare idempotentă sunt acum
verificate în SQL, **16/16 probe** împreună cu regresia registrului. Vezi
`docs/JOBURI_DEMO_SQL_LEASE_2026-10-24.md`. Rămân lipsă daemonul, reînnoirea
lease-ului, handlerii reali și verificarea autorității la limita efectelor.
Această extensie nu autorizează activarea pilotului sau ștergerea de resurse.

Extensia de heartbeat verifică acum reînnoirea înainte de expirare și CAS pe
termen. Un efect exclusiv SQL/sintetic este deduplicat la retry și la reluarea
cu generație nouă. Vezi secțiunea 7 din documentul joburilor. Rămân nevalidate
efectele externe și recuperarea lor reală, autentificarea workerului și ceasul
de producție; nu se închide poarta de provisionare printr-un receipt sintetic.

Ciclul finit claim/heartbeat/receipt/confirmare este acum verificat prin 19/19
probe pentru ciclu și reînnoire, inclusiv SQL real. Nu este daemon și nu execută
provisionare: folosește checkpointuri și întreruperi injectate, nu crash OS sau
rețea. Detalii în secțiunea 8 a documentului joburilor; porțile de livrare reală
rămân deschise.

Raportul de test are acum filtre și paginare cu cursor legat de context și
amprenta datelor: **17/17 probe** cu regresia citirii integrale. Schimbările
între pagini cer reluarea raportului; nu există cursor de autorizare ori
snapshot istoric. Exportul/previzualizarea paginată și interfața operatorului
rămân separate. Detalii în secțiunea 10 a documentului joburilor.

Previzualizarea și exportul static paginat sunt acum implementate pentru test,
cu verificarea completitudinii/contextului și fără controale administrative.
Artefactele sunt locale; nu există încă un endpoint pentru operator și nu este
acordată autoritate prin HTML/JSON. Vezi secțiunea 11 a documentului joburilor.

Acest raport nu schimbă versiunea aplicației, serviciile instalate, arhivele
Windows/Linux, configurațiile VPS sau conturile existente. Nu necesită update
pe PC ori server. Acceptanța prototipului nu autorizează publicarea pilotului.
