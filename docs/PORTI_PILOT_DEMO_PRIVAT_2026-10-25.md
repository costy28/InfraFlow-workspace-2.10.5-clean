# Porți de acceptanță — pilot Demo privat

Data: 25 octombrie 2026. Sursă 2.12.736, HEAD verificat `97e171d`, plus
modificările locale necomise. Document de decizie, nu aprobare de deployment.

## 1. Verdict și regulă de trecere

**GO pentru continuarea dezvoltării izolate; NO-GO pentru pilot public.**

O probă trecută în TEMP/JSON sau într-o bază SQL locală de test nu închide automat
poarta echivalentă din mediul de pilot. Nicio valoare `passed`, `complete`, hash
sau receipt sintetic nu autorizează provisionare ori ștergere. Nu există
aprobare implicită prin acest document pentru restart, publicare sau migrare.

## 2. Situația consolidată

| Poartă | Dovada existentă | Ce trebuie demonstrat înainte de GO public |
| --- | --- | --- |
| Registru și joburi | SQL de test: CAS, comenzi idempotente, claim/lease/generație, heartbeat și receipt sintetic | Adaptor Node/Linux, serviciu separat, credențiale minime și recuperare operațională; nu se montează migrarea de test în ERP |
| Operator și audit | Identitate separată de test, tokenuri hash-only, scope, revocare; HTTP/SQL/jurnal pe disc integrate | Furnizor real de autentificare și MFA, politici sesiuni/abuz, jurnal protejat și operare; nici superadminul ERP nu devine implicit operator |
| Worker | Ciclu finit verificat cu retry și refuzul generației vechi | Identitate de serviciu, ceas, reconciliere și control la limita fiecărui efect real; nu daemon bazat pe fixture |
| Izolare runtime | Instanțe TEMP/JSON distincte și model proces/bază/storage/cheie/sesiune | A nu poate citi/scrie SQL, storage sau cheia lui B; runtime-ul nu accesează control plane; probe sub identități SQL/OS reale |
| Gateway | Contractul de instanță este modelat, acces local în harness | Hostname din registru, rutare server-side, refuz necunoscut/expirat, izolare sesiuni/linkuri/download; browserul nu alege portul/baza |
| Efecte externe | Probele evită emiterea/trimiterea reală | Blocare verificată SMTP/IMAP/Oblio/ANAF/WhatsApp/GPS/schedulere; invitații prin serviciu de platformă separat |
| Backup/restaurare | Probe JSON+storage, autorizare și restart în scope declarat | SQL+storage+cheie, decriptare demonstrată, restaurare izolată și inventar copii externe; fără a promite snapshot atomic neprobat |
| Expirare și ștergere | Lifecycle și plan de retenție dry-run | Politică aprobată pentru date/backupuri și executor controlat; A eliminat fără atingerea lui B, dovezi și recuperare; fără ștergere din dry-run |
| Capacitate și comercial | Model aprobare/invitație/wizard și verificări locale | Măsurători pe mediul ales, limite/coadă/monitorizare, traseu WordPress real idempotent și rollback/oprit pilot; fără operațiuni fiscale reale |

Toate porțile sunt **parțiale sau deschise pentru producție**, nu GO. Proba
integrată recentă închide numai criteriul local de consultare read-only cu
identitate de test, SQL și jurnal persistent, nu întreaga administrare a platformei.

## 3. Dovezi și repetabilitate

1. Model/JSON/wizard/restaurare: raportul
   `ACCEPTANTA_PROTOTIP_DEMO_PRIVAT_2026-10-24.md`, secțiunile 2–3.
2. Registru SQL: `REGISTRU_DEMO_SQL_PROBA_2026-10-24.md`.
3. Worker, raportare, identitate și audit:
   `JOBURI_DEMO_SQL_LEASE_2026-10-24.md`, secțiunile 7–16.
4. Ultima integrare: 32/32 probe, zero skip, din etapa precedentă; NU rerulate
   prin simpla consolidare a documentației. Include 5 subprobe ale integrării,
   nu 32 fluxuri complete ERP. Rezultatele istorice ale altor suite nu se adună
   într-un singur total de acceptanță.
5. Observații deschise: terminarea nativă Windows descrisă în raportul inițial
   și eșecul intermediar fără diagnostic din etapa jurnalului; rerulări trecute
   nu stabilesc cauza și nu înseamnă remediere certificată.

Rulare locală explicită a pachetului operator, din rădăcina proiectului:

```powershell
$env:INFRAFLOW_TEST_TRIAL_SQL='1'
node --test --test-concurrency=1 server/tests/demo-operator-audit-journal.test.js server/tests/demo-operator-audit-recovery.test.js server/tests/demo-operator-identity.test.js server/tests/demo-operator-report-harness.test.js server/tests/demo-operator-sql-audit.test.js
Remove-Item Env:INFRAFLOW_TEST_TRIAL_SQL
```

Aceasta creează și păstrează baze **noi** strict de test pe SQL Express local;
nu este o comandă pentru VPS ori pentru baza Demo/ERP. Nu se rulează dacă scopul
este doar citirea raportului. Fără flag, probele SQL se sar. Chrome se validează
separat, nu prin comanda de mai sus. Se consemnează fiecare skip/eșec.

## 4. Următorul increment, fără a publica prototipul

1. Definirea contractului serviciului separat: intrări validate, identități,
   roluri de serviciu, interfețe read-only versus comenzi, secrete și oprire sigură.
2. Stabilirea matricei negative de izolare SQL/OS: runtime A/B, operator,
   worker, control plane, directoare, chei și backupuri. Mai întâi proiectare,
   apoi fixture local dedicat; nicio schimbare de drepturi în ERP/VPS implicit.
3. Abia după contract, adaptorul real și probele de izolare; fiecare are propria
   dovadă și poartă. Nu se transformă helperii din `server/tests/support` în daemon.
4. Selectarea integrării de autentificare înainte de implementarea loginului
   real. Nu inventăm un provider și nu reutilizăm contul companiei ca operator.

Nu mai extindem raportarea cu funcții cosmetice ca precondiție pentru pilot;
următoarele dovezi trebuie să privească serviciul și izolarea efectivă.

Contractul propus și matricea negativă sunt acum documentate în
[Contract serviciu](CONTRACT_SERVICIU_DEMO_PRIVAT_2026-10-25.md).
Aceasta închide proiectarea inițială, nu probele SQL/OS. Urmează inventarul
read-only al mediului și planul fixture-ului înainte de crearea identităților.

## 5. Decizii și activare

Înainte de publicare sunt necesare alegeri explicite: mediu/identități de serviciu,
autentificare operator, hostname-uri, capacitate după măsurători și retenția
datelor/backupurilor. Valabilitatea cerută rămâne 15 zile de la activare; aceasta
nu stabilește implicit data ștergerii backupurilor sau perioada de recuperare.

GO cere dovezi pe mediul pilot pentru toate porțile relevante, decizii aprobate,
procedură de oprire/rollback și aprobare explicită de activare. Dacă lipsește o
poartă, rămâne NO-GO. La acest moment nu se livrează arhive noi și nu se modifică
Demo-ul comun, conturile existente, runtime-ul instalat ori versiunea aplicației.
