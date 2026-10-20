# Sincronizare Core — preflight fără scriere

18 octombrie 2026. Sursă aplicație: **2.12.734**, neschimbată în această etapă.

## Ce există și ce nu trebuie confundat

- `core/db.js` citește/scrie starea standard în `dbo.app_state`. Apelul de sincronizare generală caută `db/mssql-import-app-state.sql`; acest fișier lipsește.
- `scripts/migrate-json-to-mssql.js` importă JSON în app-state și mută directorul de date. Nu este un sincronizator pe domenii și **nu a fost executat** în acest audit.
- CRM are repository-uri relaționale proprii. Migrarea 029 creează suport/tabele contabile și registrul sincronizării, nu un import general al tuturor domeniilor.
- Migrarea HR 077 are un import particular al evaluărilor într-o tabelă goală, cu filtre și valori implicite. Nu reprezintă o sincronizare reversibilă a întregului HR.
- Cele 87 fișiere SQL au trecut construirea schemei goale în etapa precedentă. Aceasta nu rezolvă maparea datelor existente.

## Blocajele de model confirmate în surse

| Domeniu | app-state / aplicație | Core relațional | Consecință |
|---|---|---|---|
| Identitate utilizator/departament | Poate fi UUID sau ID text legacy | `uniqueidentifier` | ID-urile text cer mapare explicită, stabilă |
| Societate | Profilul organizației nu garantează un UUID per rând | `company_id` obligatoriu, cu FK | Societatea nu se alege după nume sau după primul rând SQL |
| Roluri | `role`, posibil `roles[]`, roluri custom și drepturi efective | `role_key` singular și tabele de permisiuni | Nu se selectează arbitrar primul rol; matricea drepturilor trebuie reconciliată |
| Departament utilizator | `departmentId`, `department_id` sau uneori numai denumire | FK UUID nullable | Denumirea singură nu este transformată automat în NULL |
| Modul departament | Chei și aliasuri istorice | `module_key` din catalog SQL | Aliasurile necesită o mapare verificată |
| Profil / legături | Email, angajat, manager și alte metadate | Nu toate există în proiecția Core de bază | Nu trebuie pierdute la schimbarea stocării |
| Autentificare | Hash scrypt curent sau parolă legacy | `password_hash` obligatoriu | Fără copiere/conversie necontrolată; hash-urile nu apar în raport |

## Instrumentul nou

`scripts/diagnose-core-sync.js` citește **numai două fișiere JSON explicite**, nu deschide SQL, nu încarcă configurația instalației și nu scrie fișiere. Folosește funcția pură `scripts/lib/core-sync-preflight.js`.

```powershell
node scripts/diagnose-core-sync.js --source 'C:\cale-protejata\source.json' --target 'C:\cale-protejata\target.json' --company-id 'UUID-ul-societatii-verificat'
```

Exemplul este orientativ: nu există fișiere reale cu aceste nume și nu au fost exportate date din instalațiile utilizatorului. Nu redirecționa ieșirea peste fișierele de intrare. Snapshot-ul sursă poate conține secrete; păstrează-l local, protejat, fără distribuire prin email/chat.

- Sursa așteaptă colecțiile root `users` și `departments`. Colecții paralele populate în `core.*` cer verificare; nu se face fallback implicit.
- Ținta așteaptă `companies`, `roles`, `modules`, `users`, `departments`. Pentru utilizatori: `id`, `company_id`, `department_id`, `role_key`, `username`, `display_name`, `active`. Pentru departamente: `id`, `company_id`, `module_key`, `name`, `active`. Pentru cataloage: `role_key` / `module_key`; pentru societăți: `id`. Snapshot-ul țintă nu are nevoie de parola/hash-ul SQL.
- Raportul include coduri de probleme, colecția și poziția rândului (de la 1), nu ID-uri, nume, username-uri, emailuri sau parole/hash-uri. Cel mult 100 probleme detaliate; totalurile continuă să fie numărate și trunchierea este marcată.
- Se verifică UUID-uri, duplicate, coliziuni uzuale de username, referințe și societăți, roluri/module, aliasuri contradictorii, starea activă explicită și formatul scrypt curent. Formatul hash-ului nu dovedește parola validă/equivalența credențialelor.
- Nu generează UUID-uri, nu schimbă roluri, nu redenumește, nu șterge, nu propune SQL executabil și nu tratează rândurile suplimentare din țintă ca ștergeri.
- `writeAuthorized` și `globalRelationalReadiness` sunt **întotdeauna false**. Fără blocaje detectate, rezultatul este tot `review_required`, nu „gata de import”. Colationarea SQL, drepturile, credențialele, prospețimea snapshot-ului, schema efectivă și celelalte module rămân neverificate.
- Cod ieșire CLI: 0 = raport generat fără blocaje în acest domeniu limitat; 1 = raport generat cu blocaje; 2 = argumente/fișiere/JSON invalide. 0 nu autorizează importul. Opțiunea `--apply` este refuzată.

## Verificări executate

- 10 teste dedicate: caz compatibil, ID-uri legacy, multi-rol, societate explicită, referințe/catalog, duplicate și coliziuni, conflicte în țintă, aliasuri/stări/parole legacy, departament numai ca nume, date personale nepublicate, intrări imuabile, limitarea raportului și CLI invalid.
- Regresie agregată: **64 teste trecute**, trei teste SQL din etapele precedente sărite explicit. Audit expuneri: zero constatări. Diff check: reușit.
- Test SQL dedicat (`core-sync-preflight-sql.test.js`), opt-in `INFRAFLOW_TEST_RELATIONAL_SQL=1`: **un test trecut** în `INFRAFLOW_TEST_DOCS_EB285D5B040C`. Folosește schemele reale Core/workflow/catalog, rânduri sintetice și un snapshot citit prin SELECT. Snapshot-ul țintă și app-state sunt identice înainte/după analiză; rolurile multiple sunt raportate, nu convertite. Baza este păstrată pentru diagnostic.
- Nu s-au citit datele instalațiilor active, nu s-a pornit/restartat aplicația instalată, nu s-a executat import și nu s-a activat flag-ul relațional.

## Următorii pași, în ordine

1. Definirea unui manifest privat, versionat, pentru mapările aprobate de societate, ID-uri legacy, module și roluri; fără generare implicită și fără reducerea drepturilor multiple la un singur rol.
2. Validarea manifestului față de o schemă SQL reală, cu reconciliere și detecție a modificării snapshot-urilor. Fără scriere în acest pas.
3. Abia după rezolvarea blocajelor: staging într-o bază sintetică separată, legături și câmpuri conservate, comparații și teste de reluare. Trebuie decis explicit modelul rolurilor multiple și păstrarea câmpurilor neacoperite de Core.
4. Pilot pe o copie autorizată, cu backup și rollback testate; importul în instalații rămâne o operațiune separată, explicită.

Nu este un plan de migrare integral și nu declară celelalte module reconciliate. Nu există un update nou de instalat pentru această etapă internă de diagnostic.

## 19 octombrie — manifest explicit, validare offline

Adăugate `scripts/lib/core-sync-manifest.js` și `scripts/diagnose-core-manifest.js`.
Nu sunt încărcate de server, nu se conectează la SQL și nu scriu date. Versiunea
aplicației rămâne 2.12.734; arhivele PC/Linux existente nu sunt regenerate.

Manifestul privat are următoarea structură (placeholder-ele nu sunt valori valide):

```json
{
  "format": "infraflow-core-sync-manifest-v1",
  "revision": 1,
  "companyId": "UUID-societate-verificat",
  "snapshots": {
    "sourceSha256": "SHA256-fisier-sursa-exact-64-caractere-hex-mici",
    "targetSha256": "SHA256-fisier-tinta-exact-64-caractere-hex-mici"
  },
  "mappings": {
    "users": [{ "source": "ID-sursa", "target": "UUID-explicit" }],
    "departments": [{ "source": "ID-sursa", "target": "UUID-explicit" }],
    "modules": [{ "source": "cheie-sursa", "target": "cheie-catalog-SQL" }],
    "roles": [{ "source": "cheie-sursa", "target": "aceeasi-cheie" }]
  }
}
```

1. Protejează snapshot-urile și manifestul local; nu le introduce în Git sau în chat.
2. Stabilește manual societatea și mapările; inclusiv UUID-urile nemodificate au
   intrări explicite. Nu sunt generate ID-uri și nu este ales primul rol.
3. Calculează hash-urile fișierelor exacte (PowerShell):

   ```powershell
   (Get-FileHash -LiteralPath 'C:\cale-protejata\source.json' -Algorithm SHA256).Hash.ToLowerInvariant()
   (Get-FileHash -LiteralPath 'C:\cale-protejata\target.json' -Algorithm SHA256).Hash.ToLowerInvariant()
   ```

4. Validează fără scriere:

   ```powershell
   node scripts/diagnose-core-manifest.js --source 'C:\cale-protejata\source.json' --target 'C:\cale-protejata\target.json' --manifest 'C:\cale-protejata\manifest.json'
   ```

Orice schimbare a octeților snapshot-urilor, inclusiv spații/newline, invalidează
legătura. Hash-ul nu este semnătură și nu dovedește aprobarea sau prospețimea față de
SQL live. Validatorul pur primește hash-urile de la apelant; CLI le calculează din
aceiași octeți pe care îi parsează, fără o a doua citire a snapshot-urilor.

Sunt refuzate câmpuri necunoscute în manifest, mapări incomplete, duplicate,
many-to-one, destinații necunoscute din catalog, schimbarea unui UUID existent,
asocierea unui ID legacy la o identitate deja ocupată și conflicte de societate.
Schimbarea cheii de rol este blocată până la reconcilierea drepturilor.
Omiterea unei mapări nu înseamnă excludere sau ștergere.

`mappingStatus: structurally_valid` înseamnă numai că intențiile satisfac verificările
manifestului. Raportul include analiza originală în `baseline`, fără să-i suprime
blocajele: un ID legacy mapat rămâne un blocaj al proiecției neimplementate.
Rolurile multiple nu sunt reduse. Nu se generează date proiectate sau SQL executabil.
`writeAuthorized` și `globalRelationalReadiness` rămân false.

Coduri ieșire: 0 = fără blocaje în manifest și baseline, dar tot `review_required`;
1 = blocaje; 2 = invocare/fișiere/JSON invalide. `--apply` este refuzat.
Raportul nu include hash-uri de snapshot, identificatori, nume sau credențiale;
problemele indică doar colecția și poziția. Aprobarea, schema SQL live, echivalența
permisiunilor, proiecția și importul nu sunt verificate/implementate în acest pas.

Verificare: 8 teste noi pentru manifest/CLI plus cele 10 teste preflight — 18/18
trecute. CLI este testat cu fișiere sintetice, inclusiv modificarea newline-ului,
refuzul `--apply` și JSON invalid fără expunerea conținutului.
Regresia agregată executată în această etapă: **69 teste trecute, zero eșecuri,
zero sărite**. Audit expunere fișiere: 424 fișiere, zero constatări. Verificările
de sintaxă și `git diff --check` au trecut. Nu s-a executat un test SQL nou în
această etapă exclusiv offline; rezultatul SQL de mai sus aparține etapei anterioare.

**Urmează:** reconcilierea unei proiecții în memorie pe date sintetice, apoi
verificarea ei față de schema SQL izolată. Modelul multi-rol și păstrarea câmpurilor
neacoperite rămân decizii obligatorii înainte de staging/import.

## 19 octombrie — simulare privată în memorie

`scripts/lib/core-sync-simulation.js` aplică mapările unui manifest valid într-o
copie temporară a sursei și repetă preflight-ul față de snapshot-ul țintă.
CLI (opțiunea trebuie să fie prima):

```powershell
node scripts/diagnose-core-manifest.js --simulate --source 'C:\cale-protejata\source.json' --target 'C:\cale-protejata\target.json' --manifest 'C:\cale-protejata\manifest.json'
```

- Sursa, ținta și manifestul nu sunt modificate. Copia nu este returnată/exportată.
- Sunt transpuse ID-urile utilizatorilor/departamentelor, referințele de departament
  și cheile modulelor. Societatea explicită este adăugată numai unde ambele aliasuri
  lipsesc; conflictele existente nu sunt suprascrise.
- Celelalte câmpuri sunt păstrate în copia din memorie, inclusiv profilul,
  credențialele și stările de securitate. Aceasta NU dovedește păstrarea lor în
  schema SQL: nu există încă un serializator/importator pentru ele.
- Rolurile nu sunt schimbate sau reduse. Ambiguitățile de aliasuri, stări,
  parole legacy, departamente numai ca nume și conflictele țintei opresc simularea.
- Baseline-ul original rămâne în raport. Numai incompatibilitățile ID/modul și
  referințele de departament pot fi reevaluate; referințele încă lipsă rămân blocaje.
  Dacă baseline-ul este trunchiat, simularea se oprește conservator.
- `simulationPerformed` indică dacă proiecția a fost analizată. `reconciliation`
  este raportul acelei copii; chiar fără blocaje, starea rămâne `review_required`.
  Nu este un rezultat de migrare, nici verificare a tuturor legăturilor ERP.
- Raportul nu publică proiecția, date personale sau hash-uri. Nu există SQL,
  scrieri, modificări runtime, restarturi sau arhive noi. Versiune: 2.12.734.

Verificări dedicate: 26 teste trecute (8 simulare, 8 manifest/CLI, 10 preflight),
inclusiv intrări înghețate, date originale neschimbate, CLI fără modificarea
fișierelor, referințe lipsă, snapshot schimbat, raport trunchiat și multi-rol blocat.
În această etapă nu s-a executat SQL. Urmează verificarea proiecției față de schema
SQL izolată și reconcilierea câmpurilor neacoperite, înainte de staging/import.

Regresia extinsă a acestei etape: **77/77 teste trecute**, fără eșecuri sau teste
sărite. Audit fișiere: 425 fișiere analizate, zero constatări. Sintaxa JavaScript
și `git diff --check` au trecut. Aceste rezultate nu înlocuiesc validarea SQL.

## 20 octombrie — proiecție verificată pe schema SQL izolată

Helperul intern `scripts/lib/core-sync-projection.js` este acum comun simulării și
testului SQL; algoritmul nu este duplicat. El cere validarea anterioară a manifestului
și blocajelor sursei. Returnează o copie sensibilă numai în memorie, nu un raport
public. CLI/simularea continuă să returneze exclusiv rapoarte fără proiecție.

`server/tests/core-sync-projection-sql.test.js` folosește o bază sintetică nouă și
fișierele reale `001_core.sql`, `002_inventory_workflow.sql`,
`003_seed_standard_modules.sql`. Nu încarcă o instalație reală și nu adaugă import
în `core/db.js` sau în rutele aplicației.

Rezultat: **1/1 test SQL trecut**, opt-in `INFRAFLOW_TEST_RELATIONAL_SQL=1`, în
`INFRAFLOW_TEST_DOCS_91BAF8826D0E`, bază păstrată pentru diagnostic.

1. Manifestul explicit mapează ID-uri legacy și un alias de modul; societatea și
   cataloagele provin din snapshot SQL, fără alegere implicită.
2. Proiecția este transmisă parametrizat ca JSON în SQL exclusiv de test.
   Sunt verificate UUID-urile, legătura utilizator–departament, rolul, modulul,
   username-ul, denumirea, contul inactiv și obligația schimbării parolei.
   Hash-ul sintetic este comparat fără a fi publicat în jurnal.
3. Două tranzacții cu inserările proiectate trec și sunt anulate explicit prin
   rollback. Aceasta verifică repetarea testului după rollback, **nu** idempotenta
   unui import persistent, care nu există încă.
4. Un rol absent este refuzat de FK-ul SQL (eroare 547); și acea tranzacție este
   anulată. Snapshot-ul Core și `dbo.app_state` sunt identice înainte/după probe.
5. Emailul, metadatele custom și starea de securitate sunt păstrate în copia din
   memorie. Emailul/metadatele nu sunt stocate în tabelele Core de acest test;
   rămâne de definit conservarea tuturor câmpurilor înainte de orice import real.

Prima probă a identificat colecții goale omise de exportul snapshot SQL al testului.
Interogarea testului a fost corectată cu `COALESCE(...,N'[]')`; validatorul nu a fost
relaxat și continuă să blocheze colecțiile lipsă. Probele inițiale nereușite nu au
ajuns la inserările proiectate. Bazele lor sintetice au rămas pentru diagnostic.

Verificări suplimentare: **77/77 teste de regresie trecute**, audit de expunere
426 fișiere/zero constatări, sintaxă și diff check reușite. Nicio modificare de
versiune, restart, update sau arhivă nouă; sursa rămâne 2.12.734.

Această probă validează numai subsetul sintetic descris, nu întregul Core sau toate
colationările, schema actualizată prin toate migrările ori drepturile efective.
**Urmează:** inventarul și conservarea câmpurilor fără coloană Core (profil, legături
HR, stări suplimentare de autentificare, drepturi individuale), apoi modelul multi-rol.
Staging-ul persistent și importul rămân blocate până la reconcilierea acestora.

## 20 octombrie — inventar de conservare fără export de date

Adăugat `scripts/lib/core-sync-preservation.js`, apelat de simulare înaintea
proiecției. Inventariază câmpurile proprii ale rândurilor root `users` și
`departments`; nu inventariază integral `settings`, HR sau celelalte colecții.

| Categorie | Dovezi / exemple în sursă | Decizie curentă |
|---|---|---|
| Securitate | `core/auth-routes.js`: secret 2FA criptat, data activării, hash-uri de recuperare | Blocaj până la conservare și verificarea folosirii aceleiași chei de criptare |
| Ciclu Demo | `core/auth.js`, `core/auth-routes.js`, `modules/system/users-routes.js`: autorul contului, invitație în așteptare, expirare/durată acces | Nu se resetează și nu se omit la migrare |
| Legături HR | ID angajat/manager în metadate; referințele necesită reconciliere separată | Nu se transformă automat în NULL sau în UUID nou |
| Autorizare | Metadate individuale de drepturi și roluri; `core/permissions.js` folosește și definiții/configurații din settings | Nu se declară drepturi echivalente doar fiindcă cheia rolului coincide |
| Profil / istoric / custom | Email, contact, date creare/modificare, câmpuri neclasificate | Păstrare explicită, nu eliminare implicită |

Clasificarea este diagnostică, nu o listă exhaustivă a câmpurilor active și nu
dovedește că fiecare alias enumerat este folosit de runtime. Orice cheie necunoscută
devine `unclassified` și blochează conservarea. Numele custom și valorile nu apar
în raport; se raportează numai categoria, numărul de apariții, colecția și poziția.
Valorile `null`, `false`, `[]` sau șir gol sunt inventariate, nu confundate cu absența.
Raportul detaliat este limitat la 100 probleme, totalurile rămân complete.

`mustChangePassword` are corespondent posibil în `core.users.must_change_password`
și a fost verificat în testul SQL, dar nu este încă prelucrat/verificat de întregul
preflight (aliasuri, stare și conflicte în țintă). Rămâne conservator în categoria
`security`, blocat pentru migrare. Celelalte câmpuri marcate drept proiecție de bază
sunt doar acoperirea existentă a diagnosticului; nu există importator persistent.

Raportul simulării include acum `preservationReview`. Chiar dacă `reconciliation`
nu are blocaje, starea generală este `blocked` când există câmpuri fără conservare
verificată. Simularea în memorie poate totuși rula pentru diagnostic și le păstrează
în copie. `writeAuthorized` rămâne false; CLI întoarce 1 în acest caz. Aceasta este
o întărire a instrumentului intern, nu o modificare a aplicației instalate.

Verificare curentă: **82/82 teste de regresie trecute**, inclusiv cinci teste noi
pentru inventar, date nepublicate, valori goale și trunchiere. Audit: 427 fișiere,
zero constatări; sintaxă/diff check trecute. Testul SQL separat: **1/1 trecut**, în
`INFRAFLOW_TEST_DOCS_A3C4DC15B8DC`; cele două inserări și eroarea FK sunt anulate,
iar app-state rămâne neschimbat. Proiecția de bază trece reconcilierea, dar raportul
general rămâne blocat pentru cele trei câmpuri suplimentare ale fixture-ului.

**Următorul pas:** contract de conservare versionat, legat de manifest, pentru
metadate și referințe, cu verificare de round-trip pe date sintetice. Nu se salvează
secretele 2FA într-o tabelă generică sau în fișiere de raport și nu se schimbă
modelul multi-rol înainte de a verifica matricea drepturilor. Nicio versiune sau
arhivă nouă; rămâne 2.12.734, fără restarturi/deployment.
