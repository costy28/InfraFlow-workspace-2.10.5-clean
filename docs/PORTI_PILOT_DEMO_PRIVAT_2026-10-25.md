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

Inventarul este consemnat în
[Inventar local](INVENTAR_IZOLARE_DEMO_LOCAL_2026-10-25.md). Capacitatea SQL de
setup este observată, nu proba de izolare. Resursele/cleanup-ul propuse cer
confirmare explicită; identitățile OS nu au fost create sau probate.

Actualizare: proba SQL A/B/CP a fost executată după confirmare, cu loginuri reale
și cleanup verificat; rezultatul și erorile intermediare sunt în secțiunea 6 a
inventarului local. Aceasta închide doar canarii SQL minimali locali, nu izolarea
OS, schema ERP, control plane real ori mediul Linux. NO-GO public rămâne.

Actualizare OS: cleanup-ul rulărilor restante este confirmat, însă proba ACL
rămâne blocată de ExecutionPolicy; nu modificăm politica și nu o marcăm trecută.
Actualizare rutare: resolverul fail-closed și harness-ul HTTP au 14/14 probe cu
regresia modelului. Detalii în [Proba rutare](PROBA_RUTARE_DEMO_2026-10-25.md).
Nu există încă proxy real sau validare cookie/sesiuni între instanțe.

Extensie locală: două listener-e HTTP sintetice sunt acum legate de decizia de
rutare; 25/25 probe cu regresii, fără fallback și fără propagare credențiale.
Nu sunt procese ERP izolate sau un reverse proxy complet; validarea sesiunilor
reale/cookie-urilor, TLS și mediului de pilot rămâne deschisă. NO-GO neschimbat.

Sesiuni sintetice legate de host/trial/runtime sunt acum probate prin HTTP,
cu refuz A↔B, expirare și revocare inclusiv în timpul răspunsului. Nu sunt
autentificarea ERP ori cookie-uri browser reale; sesiuni volatile emise de fixture.
Poarta runtime/browser/serviciu public rămâne deschisă, la fel izolarea OS blocată.

Generația runtime-ului și invalidarea sesiunilor după înlocuire/close-relisten
sunt acum probate pe listener-e sintetice (36/36 cu regresii). Registrul este
volatil, fără coordonare SQL ori identitate runtime de producție. Aceasta nu
închide porțile control plane/runtime și nu validează restartul ERP instalat.

Generația runtime are acum persistență SQL izolată (7/7 probe), separată de
lease/lifecycle, cu CAS și receipts idempotente. Vezi
[Generații SQL](GENERATII_RUNTIME_SQL_2026-10-25.md). Integrarea cu gateway-ul și
autorizarea sesiunilor distribuite nu sunt încă făcute. NO-GO public neschimbat.

Actualizare: adaptorul de test leagă acum sesiunea/listenerul de generația și
epoca SQL curente; integrarea SQL/HTTP are 5/5 probe, regresiile locale 36/36.
Este fail-closed la eroarea cititorului SQL, fără receipt istoric/cache pozitiv.
Nu este auth ERP, persistență de sesiuni sau serviciu multi-proces de producție.
Fereastra de schimbare lifecycle/rutare în autorizarea asincronă rămâne următoarea
probă; NO-GO și blocajul OS sunt păstrate.

Fereastra din autorizarea asincronă are acum revalidări de rută/lifecycle după
așteptare și probe deterministe (44 trecute, 1 SQL opt-in sărită). SQL real nu
a fost rerulat la această extensie. Mai sunt necesare deadline/anulare pentru
control plane și verificarea mediului real; nu există garanție atomică pe socket.

## 5. Decizii și activare

Înainte de publicare sunt necesare alegeri explicite: mediu/identități de serviciu,
autentificare operator, hostname-uri, capacitate după măsurători și retenția
datelor/backupurilor. Valabilitatea cerută rămâne 15 zile de la activare; aceasta
nu stabilește implicit data ștergerii backupurilor sau perioada de recuperare.

GO cere dovezi pe mediul pilot pentru toate porțile relevante, decizii aprobate,
procedură de oprire/rollback și aprobare explicită de activare. Dacă lipsește o
poartă, rămâne NO-GO. La acest moment nu se livrează arhive noi și nu se modifică
Demo-ul comun, conturile existente, runtime-ul instalat ori versiunea aplicației.
