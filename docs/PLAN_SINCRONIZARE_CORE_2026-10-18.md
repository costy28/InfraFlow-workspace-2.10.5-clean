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

## 20 octombrie — round-trip criptat, exclusiv sintetic

Adăugat helperul intern `scripts/lib/core-sync-capsule.js`. Nu este conectat la
server, CLI, updater sau baze client. Este o probă de conservare a snapshot-ului
original, **nu** un format aprobat de backup/livrare sau un importator.

- Contract versionat: `infraflow-core-preservation-capsule-v1`, AES-256-GCM,
  nonce aleator de 12 octeți și tag de 16 octeți. Cheia de 32 octeți trebuie
  furnizată explicit; nu există cheie implicită, generare automată în aplicație
  sau folosire/modificare a APP_KEY.
- Sunt criptate exact octeții snapshot-ului original, inclusiv spații, newline,
  câmpuri necunoscute, null/false, roluri multiple și secrete deja criptate.
  Nu se proiectează/reduce conținutul înainte de conservare.
- Se verifică hash-ul sursei și al țintei față de manifest. Hash-ul întregului
  manifest (inclusiv revizia și societatea) și hash-ul țintei sunt date autentificate
  GCM. Schimbarea lor împiedică deschiderea capsulei. Ordinea proprietăților
  manifestului contează în această probă; nu se recanonicalizează implicit.
- Crearea cere colecțiile sursă și un manifest valid structural; **nu** cere și
  nu dovedește că baseline-ul este migrabil. Astfel poate conserva exact și
  datele multi-rol care rămân blocate pentru proiecție/import.
- Capsula nu conține cheia sau metadate personale în clar. Recitirea returnează
  un Buffer sensibil numai apelantului intern; el nu este logat sau exportat de CLI.
  Erorile sunt generice, fără fragmente de sursă, chei sau ciphertext.
- Limită de sursă/țintă: 16 MiB în acest helper experimental. Formatele necunoscute,
  cheile invalide și anvelopele cu câmpuri neașteptate sunt respinse.

Teste unitare: patru scenarii noi, cu round-trip byte-exact, date personale absente
din anvelopă, nonce-uri diferite, cheie greșită, modificarea ciphertext/tag/nonce,
manifest sau țintă, sursă schimbată și mapare incompletă.

Test SQL separat: **1/1 trecut** în `INFRAFLOW_TEST_DOCS_226710DAB80C`. Creează o
tabelă `dbo.capsule_probe` numai în baza sintetică, salvează parametrizat anvelopa
criptată, recitește într-o conexiune separată și verifică hash-ul sursei originale.
În SQL nu ajung cheia sau sursa în clar. Cheia aleatoare rămâne în proces și este
suprascrisă la finalul testului; baza păstrată conține numai capsula sintetică și
nu poate fi deschisă ulterior fără acea cheie. Nu este un mecanism de recuperare
a cheilor. Nu s-a citit/scris nicio instalație existentă.

Regresie: **86/86 teste trecute**, fără teste sărite; audit fișiere 429/zero
constatări; sintaxă și diff check trecute. Nicio modificare de versiune sau arhive.

**Limite și următorul pas:** recitirea exactă dovedește conservarea octeților, nu
folosirea corectă a acestora de către runtime relațional. Rămân de reconciliat
rolurile multiple și drepturile efective (inclusiv setările globale), referințele
HR și compatibilitatea cheii pentru secretele deja criptate. Gestionarea/rotația/
recuperarea cheilor capsulei și aprobarea unui format persistent pentru producție
nu sunt implementate. Blocajele `preservationReview` nu sunt eliminate automat.

## 20 octombrie — reconciliere diagnostică a granturilor

`scripts/lib/core-sync-authorization.js` compară **deciziile motorului runtime
actual** pe catalogul curent de permisiuni cu **granturile stocate în SQL** ale
rolului utilizatorului mapat. Nu inventează un motor de autorizare SQL și nu
declară că tabelele de granturi reprezintă singure drepturile efective.

Surse de adevăr inspectate: `server/core/permissions.js` (`normalizedUserRoles`,
`effectivePermissionsForUser`, `authHasPermission`, `permissionsFor`) și
`server/core/module-catalog.js` (`effectiveEntitlements`). Instrumentul folosește
direct aceste funcții, nu copiază o matrice statică de drepturi.

- Runtime unește rolurile principale/suplimentare, adaugă drepturi de angajat
  activ, filtrează după licență/module și poate restrânge după departament.
- Superadmin are bypass global în `authHasPermission`; o simplă listă finită de
  granturi nu reproduce această regulă pentru toate acțiunile viitoare.
- Rolurile custom și suprascrierile rolurilor implicite sunt citite din settings;
  cheia de rol identică nu dovedește configurație identică.
- Cazurile multi-rol și superadmin sunt blocate explicit, fără alegerea primului
  rol. Utilizatorii inactivi, rolurile necunoscute și aliasurile de departament
  ambigue nu sunt comparați ca utilizatori activi fără drepturi.

CLI offline (opțiunea prima, exclusivă cu `--simulate`):

```powershell
node scripts/diagnose-core-manifest.js --authorization --source 'C:\cale-protejata\source.json' --target 'C:\cale-protejata\target.json' --manifest 'C:\cale-protejata\manifest.json'
```

Pe lângă snapshot-urile/manifestul anterior, sursa cere explicit
`settings.license`, `settings.modules_enabled`, `settings.customRoles` și
`settings.rolePermissionOverrides`. Ținta cere `permissions: [{permission_key}]`
și `role_permissions: [{role_key,permission_key}]`. Se cere întregul catalog
runtime curent; catalogul SQL incomplet sau cu chei necunoscute, duplicate ori
granturi către roluri/permisiuni absente blochează comparația. Acest lucru poate
bloca legitim schema SQL veche și nu autorizează completarea ei automată.

Identitatea/compania utilizatorului țintă și rolul exact declarat în manifest
sunt verificate. Raportul include numai poziții și numere: granturi runtime,
granturi stocate, `gainedGrants` și `lostGrants`. Nu expune ID-uri, nume, loginuri,
chei de rol sau liste de permisiuni din datele persoanei. Nu modifică nici settings.

Rezultatul `review_required` fără diferențe este limitat la această comparație
de catalog. `runtimeEquivalenceVerified`, `writeAuthorized` și
`globalRelationalReadiness` rămân false. Baseline-ul complet este păstrat în raport;
eventualele sale blocaje de date nu dispar și trebuie evaluate separat înainte de
migrare. Accesul pe entitate, sesiuni, dispozitive și permisiuni viitoare rămâne
neverificat. Niciun grant SQL nu este adăugat, șters sau folosit în aplicație.

Opt teste noi: set egal (fără autorizare de import), drepturi pierdute/câștigate,
multi-rol, superadmin, licență/module/departament, configurație lipsă, catalog
incomplet, roluri necunoscute, inactivitate, rol țintă diferit și duplicate.
Nu s-a executat SQL în această etapă. Versiunea rămâne 2.12.734; fără restart,
deployment sau arhive noi.

Regresia agregată: **94/94 teste trecute**, zero sărite/eșuate. Audit fișiere:
430 fișiere, zero constatări; sintaxă JavaScript și diff check trecute.

**Urmează:** proiectarea modelului multi-rol relațional care păstrează asocierea
fiecărui rol și configurația drepturilor, cu teste comparative ale deciziilor.
Nu se înlocuiește runtime-ul și nu se elimină blocajele de conservare prin simpla
egalitate a listelor de granturi.

## 20 octombrie — prototip relațional multi-rol, separat de runtime

`scripts/lib/core-role-links-prototype.js` definește un model experimental:

1. Rolul principal rămâne în `core.users.role_key`. Nu este ales din `roles[]`
   și nu este suprascris cu primul rol suplimentar.
2. Asocierile suplimentare păstrează cheia rolului și poziția originală din
   `roles[]`. Prima apariție a fiecărui rol este păstrată. Duplicate identice sunt
   deduplicate, conform semanticii actuale `normalizedUserRoles`; octeții originali
   rămân doar în snapshot/capsulă, nu sunt declarați identici după normalizare.
3. Reconstrucția sortează după poziție și reface separat `role` și `roles`.
   Rolurile necunoscute, lipsa rolului principal, ID-urile legacy nemapate,
   asocierile/pozițiile duplicate sau pozițiile nevalide sunt respinse.
4. Acest helper returnează date interne sensibile; nu este apelat de CLI, server,
   autentificare sau importator. Nu modifică permisiunile existente.

Schema experimentală este declarată **numai în testul SQL**, ca
`core.user_role_probe(user_id,role_key,source_position)`, cu FK spre utilizator și
catalogul rolurilor, PK pe pereche și unicitate pe poziția fiecărui utilizator.
Nu s-a creat migrare în `db/migrations`, nu s-a schimbat schema unei instalații și
nu se propune rularea acestei tabele de test în producție.

Cinci teste de model verifică rolul principal, ordinea, duplicatele, rolul singular,
restricțiile de departament/module, excepția superadmin și intrările invalide.
Deciziile motorului runtime actual sunt comparate înainte/după reconstrucție pentru
întregul catalog curent și o permisiune viitoare sintetică. Aceasta dovedește
compatibilitatea reconstrucției în aceste scenarii, nu un motor SQL de autorizare.

Regresie executată: **99/99 teste trecute**, zero sărite/eșuate; audit fișiere
432/zero constatări. Sintaxă și diff check trecute. Versiunea rămâne 2.12.734;
fără arhive noi, restarturi sau deployment.

Test SQL separat: **1/1 trecut**, în `INFRAFLOW_TEST_DOCS_076CD5A76657`.
Folosește schema Core reală și tabela experimentală creată numai în acea bază.
Recitește asocierile în ordine inversă pentru a testa sortarea la reconstrucție,
compară deciziile runtime și verifică refuzurile PK/FK/poziție. Tranzacțiile
invalide sunt anulate; asocierile sintetice valide rămân pentru diagnostic.
`core.users.role_key` și snapshot-ul `dbo.app_state` sunt neschimbate.

**Limite:** definițiile rolurilor custom, suprascrierile implicite, licența,
configurația modulelor și restricțiile departamentale sunt încă furnizate prin
settings în probe. Nu sunt încă reconstruite din SQL. Diagnosticul `--authorization`
continuă să blocheze multi-rolul; acest prototip nu îi elimină blocajele.
Urmează conservarea/reconstrucția configurației acestor politici și comparația
deciziilor după recitire, înaintea unei migrări reale sau a integrării runtime.

## 21 octombrie — reconstrucția politicilor, prototip izolat

Adăugat `scripts/lib/core-policy-prototype.js`, neconectat la server/CLI. Codifică
politicile în rânduri versionate (`infraflow-policy-prototype-v1`) și le reconstruiește
după recitire. Nu modifică motorul `core/permissions.js`.

Acoperire explicită:

- patru configurații: `license`, `modules_enabled`, `customRoles`,
  `rolePermissionOverrides`, cu valorile lor JSON păstrate;
- departamentele identificate și prezența exactă a proprietății `permissions`:
  absentă, `null`, listă goală sau listă populată;
- rolurile utilizatorului se reconstruiesc prin prototipul multi-rol anterior.

Nu sunt copiate toate setările organizației sau toate câmpurile departamentului.
Nu este un contract de migrare integrală. Ordinea rândurilor SQL nu contează;
listele din payload păstrează ordinea. Datele care ar pierde informație prin
JSON (de exemplu metadate `undefined`) sunt refuzate, nu simplificate tacit.
Configurația incompletă, dublurile, granturile necunoscute, secțiunile/cheile
nepermise și payload-urile invalide sunt refuzate cu mesaj generic.

În testul de licență expirată, fixture-ul a fost corectat să folosească
`plan: full` și `expiresAt: 2000-01-01`. Runtime-ul recalculează statusul din date;
un simplu `status: expired` în input nu este sursa de adevăr. Nu s-a schimbat
comportamentul licențierii ca să treacă testul.

Patru teste noi verifică round-trip, absență vs listă goală, roluri multiple,
superadmin, departamente restrânse, module oprite, licență expirată și intrări
invalide. Se compară întregul catalog runtime plus o permisiune viitoare sintetică.

Testul SQL creează numai în baza sintetică `dbo.policy_probe`, nu
`core.app_settings`. Salvează parametrizat configurații sintetice, le recitește
într-o conexiune separată și compară deciziile runtime pentru 12 combinații de
roluri/departamente. Suprimarea unui rând obligatoriu este refuzată la decodificare,
fără activarea valorilor implicite. Rândurile sintetice sunt păstrate pentru diagnostic.

Rezultat final: **103/103 teste de regresie trecute**, plus **1/1 test SQL trecut**
în `INFRAFLOW_TEST_DOCS_A8E65D7305F0`, cu **3012 decizii** comparate fără diferențe.
Audit fișiere: 434/zero constatări. Sintaxa JavaScript și diff check au trecut.
Nicio bază a instalațiilor existente nu a fost citită sau modificată.

**Limite:** payload-urile de politică pot conține informații sensibile și sunt
permise aici numai cu date sintetice; nu sunt un nou loc de stocare pentru licențe,
semnături sau configurații reale. Nu s-au verificat integritatea criptografică a
politicilor persistate, validarea unei licențe semnate, hot-reload, sesiuni reale,
restricții pe document/entitate sau migrarea unui client. Prototipul nu autorizează
importul, nu este folosit de `--authorization` și nu elimină blocajele anterioare.

**Urmează:** o probă integrată într-o singură bază sintetică, legând explicit
snapshot-ul, rolurile, politicile și rezultatul reconcilierii, inclusiv scenarii
de date schimbate sau incomplete. Nicio activare în producție înaintea acestei probe
și a verificării rollback-ului; sursa rămâne 2.12.734, fără pachete noi de instalat.

## 21 octombrie — probă integrată cu reconciliere și rollback

`scripts/lib/core-integrated-stage-prototype.js` leagă snapshot-ul original criptat,
rolurile principale/suplimentare și politicile. Helperul nu este conectat la server,
CLI sau importator și este destinat numai probelor sintetice.

Verificarea deschide capsula cu manifestul/ținta așteptate, regenerează modelul
din sursa conservată și cere egalitate structurală cu staging-ul recitit. Abia apoi
reconstruiește contextul și compară deciziile motorului runtime. Ordinea rândurilor
SQL nu contează; ordinea explicită a asocierilor de roluri contează. UUID-urile
se compară fără diferență de litere mari/mici. În prima probă SQL această diferență
de reprezentare a fost identificată și corectată în comparator, cu test dedicat;
nu s-a relaxat verificarea celorlalte valori.

În `server/tests/core-integrated-stage-sql.test.js`, o singură bază sintetică are
patru tabele `dbo.stage_*_probe` (capsulă, utilizator/rol principal, asocieri,
politici). Crearea/salvarea rândurilor de staging se face într-o tranzacție; schema
este exclusiv de test și nu există o migrare a instalațiilor. Sursa cu secretul 2FA
sintetic se păstrează numai criptată în SQL; politicile de test sunt sintetice,
fără credențiale reale. Cheia este temporară în proces și suprascrisă la final.

Rezultat final SQL: **1/1 trecut**, `INFRAFLOW_TEST_DOCS_17D54D005267`:

1. Salvare și recitire în conexiuni separate; snapshot-ul este deschis byte-exact,
   rolurile și politicile coincid cu modelul așteptat.
2. **251 decizii de acces** comparate fără diferențe pentru utilizatorul multi-rol
   și departamentul restrâns al fixture-ului.
3. O politică obligatorie este eliminată temporar într-o tranzacție: staging-ul
   incomplet este refuzat. Rollback-ul păstrează snapshot-ul staging identic.
4. O modificare de rol principal urmată de eroare sintetică 51000 este anulată;
   recitirea completă după rollback este identică celei inițiale.
5. Manifestul cu revizie schimbată sau octeții țintei modificați sunt refuzați.
   Staging-ul original continuă să treacă după probele negative.

Trei teste locale acoperă suplimentar roluri/politici lipsă, rol principal schimbat,
conținut de politici modificat și reportare fără secrete. Regresie: **106/106 teste
trecute**, fără sărite/eșuate; audit 437 fișiere/zero constatări; sintaxă și diff
check trecute. Bazele sintetice sunt păstrate pentru diagnostic.

**Limite:** proba folosește ID-uri sursă deja UUID, cataloage și politici sintetice;
nu validează migrarea ID-urilor legacy, compatibilitatea APP_KEY, sesiuni reale,
CRUD prin API, ACL pe entități sau sincronizarea celorlalte domenii. Prototipul
salvează metadatele de rol/politici, nu o clonă completă a tabelelor ERP. Ținta
așteptată este un snapshot furnizat; nu există control automat de concurență pe
baza clientului. `writeAuthorized` și `globalRelationalReadiness` rămân false.

**Urmează:** consolidarea într-un diagnostic unic a probelor și a blocajelor rămase,
pentru pregătirea unui pilot pe copie autorizată, fără activare implicită. Versiunea
aplicației rămâne 2.12.734; niciun restart/deployment sau pachet nou de instalat.

## 21 octombrie — diagnostic consolidat și praguri de pilot

Adăugat `scripts/lib/core-sync-readiness.js`, expus offline prin:

```powershell
node scripts/diagnose-core-manifest.js --readiness --source 'C:\cale-protejata\source.json' --target 'C:\cale-protejata\target.json' --manifest 'C:\cale-protejata\manifest.json'
```

Opțiunea trebuie să fie prima și este exclusivă cu `--simulate` și
`--authorization`. Cele trei fișiere sunt citite explicit, snapshot-urile o singură
dată; hash-urile se calculează din aceiași octeți. Nu încarcă configurația unei
instalații, nu deschide SQL și nu scrie fișiere. Nu redirecționa rezultatul peste
fișierele de intrare. Snapshot-urile și manifestul rămân date private.

Raportul are trei secțiuni:

1. `manifest`: starea mapărilor și numărul blocajelor baseline;
2. `simulation`: dacă proiecția a fost analizată, blocaje de reconciliere/conservare;
3. `authorization`: comparația limitată a granturilor, utilizatori comparați și
   numărul granturilor suplimentare/pierdute.

Secțiunile sunt rezumate prin stări și numere, fără date personale, chei de rol,
liste de permisiuni, hash-uri sau credențiale. Limitele de trunchiere sunt propagate.
O eroare internă de analiză devine `analysis_failed`, fără textul excepției sau date
private. Numerele dintre secțiuni nu se adună ca și cum ar fi blocaje distincte:
aceeași problemă poate fi constatată de mai multe verificări.

Separat apar șase praguri nerezolvate pentru pilot:

| Prag | Ce lipsește înainte de pilot |
|---|---|
| Schema live / collation / concurență | Verificare pe copia autorizată și detectarea modificării datelor după snapshot |
| Importator persistent | Nu există încă un importator Core complet, versionat și idempotent |
| Acces pe entități / autentificare / sesiuni | Probe HTTP și ACL cu contextul reconstruit, nu doar comparații de catalog |
| ID-uri legacy / referințe între domenii | Reconciliere integrală, nu numai UUID-uri sintetice |
| Compatibilitatea secretelor existente | Verificarea păstrării/decriptării în contextul cheii autorizate, fără expunere |
| Backup / restore / copie de pilot autorizată | Restaurare verificată și identificarea explicită a copiei, separat de producție |

Raportul este **întotdeauna `blocked` pentru pilot/import** în stadiul actual,
chiar dacă cele trei secțiuni nu găsesc blocaje locale. `writeAuthorized`,
`pilotAuthorized` și `globalRelationalReadiness` sunt false. `review_required`
într-o secțiune nu înseamnă verificare completă sau aprobare.

CLI: ieșire 1 pentru raportul consolidat blocat; 2 pentru invocare/fișiere/JSON
invalide. `--apply` rămâne refuzat. `--readiness` nu rulează automat testele SQL și
nu încorporează rezultatele istorice ca dovadă despre snapshot-ul analizat.

Verificare: cinci teste noi (rezumat fără date private, hash nepotrivit, intrări
malformate, CLI fără scrieri/refuz apply și toate cele trei secțiuni local curate
dar pilot încă blocat). **111/111 teste de regresie trecute**, fără eșecuri/sărite;
audit 438 fișiere/zero constatări, sintaxă/diff check trecute. Nu s-a executat SQL
în această etapă de consolidare. Versiunea rămâne 2.12.734; fără pachete noi.

**Continuare recomandată:** importator persistent limitat la staging sintetic,
cu jurnal, idempotentă și revenire verificată, înaintea oricărei copii reale.
Celelalte praguri rămân obligatorii. Pentru accesul la o copie de date reale sunt
necesare identificarea ei și autorizarea explicită; nu se deduc din rularea acestui
diagnostic sau din succesul probelor sintetice.

## 21 octombrie — depozit persistent de loturi, exclusiv staging sintetic

`scripts/lib/synthetic-stage-store.js` implementează persistența artefactelor
integrate cu jurnal și reluare. Este un **depozit experimental de staging**, nu
importatorul complet al tabelelor ERP. Nu este conectat la CLI, server, updater sau
`core/db.js`; pragul `persistent_importer_not_implemented` rămâne justificat.

Condiții obligatorii înaintea execuției:

- `allowSyntheticStaging: true`, executor SQL furnizat explicit de test și nume
  strict `INFRAFLOW_TEST_DOCS_` urmat de 12 caractere hex majuscule;
- fiecare cerere SQL verifică `DB_NAME()` înainte de DDL/DML; numele declarat
  diferit de baza conexiunii este refuzat;
- UUID de lot explicit și staging reconciliat criptografic/structural prin helperul
  integrat înainte de salvare. Nu încarcă fișiere/env și nu generează conexiuni ERP.

În baza sintetică sunt create numai `dbo.synthetic_stage_runs` și
`dbo.synthetic_stage_journal`. Lotul păstrează hash-ul payload-ului, capsula și
politicile sintetice, plus starea `applied`/`reverted`. Jurnalul conține doar ID-ul
lotului, eveniment, cod numeric de eroare și timestamp, nu payload/secrete.
Nu are FK către lot pentru a putea jurnaliza și inserările anulate înainte ca
lotul să existe. Nici cheia capsulei, nici sursa decriptată nu sunt salvate.

Semantica operațiunilor:

1. `initialize`: creează idempotent tabelele numai în baza sintetică verificată.
2. `apply`: validează staging-ul în memorie, apoi persistă lotul și evenimentul
   într-o tranzacție. Folosește `UPDLOCK,HOLDLOCK` pe identitatea lotului.
3. Același UUID și **același payload exact** întorc `reused`, fără rând de lot
   duplicat; jurnalul păstrează tentativa. Hash-ul, starea și conținutul stocat
   sunt verificate înaintea reutilizării. Compararea conținutului este binară,
   inclusiv lungimea, nu depinde de collation implicită.
4. Conținut diferit sub același UUID, inclusiv o capsulă nouă cu alt nonce pentru
   aceeași sursă, este refuzat conservator; nu se suprascrie lotul.
5. Eșecul injectat după inserare anulează tranzacția; un eveniment `failed` este
   salvat după rollback. Reîncercarea aceluiași UUID poate reuși dacă lotul nu a
   fost persistat. Refuzurile de validare anterioare SQL nu creează evenimente SQL.
6. `reconcile`: verifică hash-ul payload-ului recitit înainte de deschiderea capsulei
   și reconcilierea rolurilor/politicilor. Un lot retras nu poate fi reconcilat ca activ.
7. `revert`: marchează logic lotul ca `reverted` și jurnalizează acțiunea. Repetarea
   devine `revert_reused`; lotul nu este șters și nu este reaplicat automat.

`writeAuthorized: false` se referă în continuare la migrarea ERP reală; operațiunile
de mai sus scriu explicit numai în depozitul sintetic. Revenirea logică a lotului
**nu** reprezintă restaurarea tabelelor unui ERP, deoarece acestea nu sunt modificate.
Concurența reală multi-proces, recuperarea cheii după restart și revenirea unui
import complet nu sunt demonstrate de acest depozit.

Unitățile noi verifică opt-in/nume bază, guard-ul efectiv și refuzul UUID-urilor
invalide fără apel SQL. Testul SQL exercită apply/retry, coruperea payload-ului,
conflict de identitate, eșec parțial/retry, retragere/repetare, jurnal și refuzul
executorului conectat la alt nume de bază. Erorile SQL deliberate sunt așteptate,
nu un semn că s-ar fi atins o instalație reală.

Regresie: **113/113 teste trecute**, audit 440 fișiere/zero constatări; sintaxă și
diff check trecute. Versiune neschimbată 2.12.734, fără restart/deployment/arhive.
Proba SQL finală: **1/1 trecut**, în `INFRAFLOW_TEST_DOCS_087320F84E14`, inclusiv
întăririle de integritate la retry/recitire. Baza păstrată conține două loturi
sintetice (unul retras și unul activ) și nouă evenimente de jurnal așteptate.
Cheia temporară a testului nu este păstrată. Refuzul deliberat pentru un nume de
bază diferit produce eroare SQL așteptată și confirmă guard-ul, înaintea DDL.

**Urmează:** integrarea controlată a materializării relaționale în staging, cu
reconciliere pe rânduri și jurnal de schimbări, păstrând aceste protecții. Nu se
autorizează încă pilotul real și nu se elimină celelalte praguri din `--readiness`.

## 21 octombrie — materializare relațională limitată, numai staging

Extins depozitul `synthetic-stage-store.js` cu `materialize` și
`reconcileMaterialized`. Nu există endpoint/CLI de scriere și nu se folosesc
tabelele ERP. Sunt create suplimentar, exclusiv în baza sintetică verificată:

- `dbo.synthetic_stage_users`: rolul principal, cheie compusă lot/utilizator;
- `dbo.synthetic_stage_roles`: asocieri, poziții, FK compus spre utilizator și
  unicitate pe rol și pe poziția fiecărui utilizator din lot;
- `dbo.synthetic_stage_policies`: secțiune, cheie și payload JSON, izolate pe lot;
- `dbo.synthetic_materialization_runs`: hash și formatul politicii materializate;
- `dbo.synthetic_materialization_journal`: eveniment/cod numeric, fără payload.

Fluxul verificat de implementare:

1. Recitește lotul activ, verifică hash-ul și reconcilierea integrată în memorie.
2. În tranzacție, blochează identitatea lotului și verifică din nou starea,
   hash-ul și payload-ul exact înainte de materializare. Un artefact schimbat după
   validare nu poate fi folosit prin simpla reutilizare a unei aprobări vechi.
3. Citește utilizatorii/rolurile/politicile așteptate din JSON în structuri SQL
   temporare, fără trunchiere la citire; inserează numai rânduri de staging.
4. Compară toate rândurile așteptate cu cele stocate în ambele direcții prin
   `EXCEPT`, inclusiv chei, rol, poziție și payload. Textele sunt comparate ca
   octeți, nu după collation implicită. Verifică și formatul politicii.
5. Repetarea unui lot materializat nu inserează duplicate și nu repară tacit
   rânduri corupte: acestea sunt refuzate, cu eveniment `failed`.
6. Eșecul sintetic după inserarea utilizatorilor anulează toate rândurile acelei
   materializări; jurnalul de eroare este salvat după rollback. Artefactul sursă
   rămâne activ, pentru o reîncercare verificată.
7. Recitirea relațională reconstruiește bundle-ul și repetă reconcilierea criptată,
   structurală și comparația deciziilor runtime. Un lot retras logic nu mai poate
   fi materializat/folosit prin aceste metode; rândurile lui se păstrează fizic.

Acoperirea rămâne intenționat limitată: se materializează ID-ul și rolul principal,
asocierile și politicile. Numele, credențialele și celelalte câmpuri ale utilizatorului
nu sunt importate în `core.users`; sursa completă rămâne în capsula criptată.
Nu există încă sincronizare Core completă, gestionare de ID-uri legacy pe toate
domeniile sau integrare a materializării în autentificarea aplicației.

Testele locale verifică refuzul UUID-urilor invalide și al unui artefact cu hash
corupt înainte de query-uri de scriere. Testul SQL nou verifică rândurile și
cardinalitățile, retry fără dubluri, corupere, rollback parțial/retry, retragere și
jurnal. Valorile așteptate ale fixture-ului: 1 utilizator, 1 rol suplimentar și
5 rânduri de politică pentru fiecare lot materializat valid.

**Limite:** nu este un importator de producție; nu se declară verificată concurența
multi-proces sau restaurarea backupului. FK-urile leagă entitățile de staging între
ele, nu cataloagele ERP ale unei instalații. `writeAuthorized` rămâne false pentru
migrarea ERP. Nu se elimină pragurile din diagnosticul `--readiness`.

Versiunea rămâne 2.12.734, fără restart/deployment sau pachete noi.

Rezultat final al materializării: **114/114 teste de regresie trecute**, plus
**1/1 test SQL trecut** în `INFRAFLOW_TEST_DOCS_3FAC876198A4`. Proba SQL verifică
1 utilizator, 1 asociere suplimentară și 5 politici per lot, retry fără dubluri,
corupere refuzată la recitire și la retry, rollback complet după inserarea parțială,
reluare reușită și indisponibilitatea lotului retras. Audit: 441 fișiere, zero
constatări; sintaxă și diff check trecute. Baza sintetică este păstrată.

Următoarea verificare necesară: acces prin HTTP pe context reconstruit, cu refuzuri
pe entități și sesiuni, înainte de a considera o copie reală de pilot. Succesul
materializării nu elimină aceste praguri și nu dovedește un import Core complet.

## 21 octombrie — probă HTTP pe context reconstruit

Adăugat testul opt-in `server/tests/reconstructed-context-http.test.js`
(`INFRAFLOW_TEST_FULL_APP_SQL=1`). Fluxul său folosește o bază sintetică nouă:

1. Creează date fictive, hash-uri scrypt valide pentru o parolă aleatoare și roluri
   custom separate pentru Documente și Mesaje; al doilea rol este suplimentar.
2. Conservă sursa criptată, persistă artefactul și materializează rolurile/politicile
   prin depozitul de staging. Verifică reconcilierea înainte de reconstrucție.
3. Recitește capsula și rândurile SQL, reconstruiește utilizatorii/rolurile/settings
   și scrie un seed temporar numai cu date sintetice.
4. Pornește `server/app.js` complet, fără VM sau adaptor DB/auth, pe loopback și port
   temporar, cu baza SQL sintetică explicită. Scheduler-ul și recuperarea automată
   din alte date sunt oprite; nu se trimit emailuri și nu se folosesc servicii externe.
5. Folosește login real prin HTTP și tokenuri reale ale serverului de test pentru
   a verifica autorizarea. Procesul de test este oprit explicit la final.

**Distincție esențială:** aplicația HTTP rulează în modul MSSQL standard
`dbo.app_state`, cu modul relațional extins oprit. Datele rolurilor/politicilor au
fost reconstruite din staging, dar autentificarea nu a fost mutată pe tabelele de
staging. Aceasta este o probă a contextului reconstruit în runtime-ul existent,
nu dovada unui runtime relațional complet sau a unui importator ERP de producție.

Scenariile testului: lipsă sesiune/parolă greșită, acces la document propriu,
refuz pe document străin/dosar/audit/PDF, acces Mesaje prin rol suplimentar,
retragerea dreptului Documente cu sesiunea deja deschisă, păstrarea rolului Mesaje,
logout cu invalidare, dezactivare cu invalidarea sesiunii și restart cu tokenurile
vechi refuzate. Nu se declară testate expirarea prin timeout sau loginul 2FA.

Nu sunt citite sau modificate bazele instalațiilor existente și nu se pornește/
repornește serviciul lor. Versiunea aplicației rămâne 2.12.734; fără pachete noi.

Rezultat final: **1/1 test HTTP complet trecut**, în
`INFRAFLOW_TEST_DOCS_DF23FA57EF68`: **23 cereri verificate, două porniri**, aproximativ
272 secunde. Serverul sintetic a fost oprit în `finally`. Regresie separată:
**114/114 teste trecute**, fără sărite/eșuate; audit 442 fișiere/zero constatări;
sintaxă și diff check reușite. Baza și seed-ul sintetic temporar sunt păstrate
pentru diagnostic; nu conțin credențiale reale ale instalațiilor existente.

Pragul de acces HTTP este acum acoperit pentru scenariile acestui context
reconstruit și runtime MSSQL standard. Nu se declară închis pentru toate modulele,
un viitor runtime relațional, expirarea sesiunilor sau 2FA. `--readiness` rămâne
conservator: probele sintetice nu autorizează un pilot pe date reale.

Următoarele verificări punctuale: expirarea sesiunilor/accesului Demo și
compatibilitatea secretelor de autentificare, apoi restaurarea backupului înainte
de a cere autorizarea unei copii reale de pilot.

## 22 octombrie — închidere stabilizare, punctul 1: expirarea accesului

Etapa este limitată la stabilizarea începută; nu se dezvoltă wizard-ul Demo și nu
se extinde acum importatorul. Au fost adăugate teste, fără modificări în runtime.

`server/tests/session-expiry-boundaries.test.js` verifică funcțiile de timp din
sursa actuală `core/auth.js` cu un ceas fix: înainte/la/după limita de inactivitate,
limita absolută chiar când există activitate recentă, prioritățile, aliasurile,
limitele minime și timestamp-uri ISO. Comportamentul existent este păstrat:
sesiunea expiră când durata este strict mai mare decât pragul; termenul Demo este
expirat chiar la egalitate (`<= now`). Zero nu dezactivează implicit timeout-urile.

Testul HTTP complet pe context reconstruit este extins cu un preload exclusiv
de test (`server/tests/support/auth-clock-preload.js`). Acesta este încărcat numai
prin `--require`, cere `NODE_ENV=test` și un fișier de ceas din TEMP. Nu este importat
de aplicație și nu există endpoint care să schimbe timpul. Numai `Date.now` din
procesul copil sintetic este avansat; ceasul Windows, al celorlalte procese și
`new Date()` nu sunt schimbate. Offsetul este limitat și fișierul este înlocuit
atomic pentru a evita citirea în timpul unei trunchieri.

Scenariile HTTP adăugate:

1. O sesiune cu prag de 15 minute este refuzată după 16 minute de inactivitate
   pe o rută de document, nu numai în `/session`.
2. După refuz și resetarea ceasului de test, același token rămâne invalid.
3. Sesiunea cu limită absolută de o oră primește activitate la fiecare 10 minute;
   la 61 minute este refuzată ca expirată absolut, nu din inactivitate.
4. Un cont Demo se autentifică înainte de termen; după trecerea termenului,
   sesiunea este refuzată cu 401, iar autentificarea nouă cu 403.
5. Tokenul Demo invalidat nu redevine valid după resetarea timpului sintetic.
   Accesul legitim înainte de termen poate fi obținut numai prin login nou.

Testele Demo locale includ și egalitatea exactă la termen, lipsa termenului și
comportamentul legacy documentat: un termen invalid este marcat `invalid`, dar
nu blochează automat contul. Nu s-a schimbat această politică de compatibilitate;
aceste date corupte trebuie diagnosticate separat și nu sunt declarate expirate.
Nu se afirmă că ștergerea automată a datelor este implementată sau testată aici.

Regresia locală curentă: **122/122 teste trecute**, fără sărite/eșuate. Audit:
444 fișiere/zero constatări; sintaxă/diff check trecute. Proba HTTP extinsă este
înregistrată separat după finalizarea cererilor și a restartului.

După închiderea acestui punct rămân, în ordine: compatibilitatea secretelor/2FA,
backup/restaurare, apoi bilanțul modificărilor efectiv livrabile și arhivele necesare.
Nu se activează migrarea relațională experimentală. Versiune curentă: 2.12.734.

**Rezultat final, punctul 1 verificat:** proba HTTP extinsă a trecut — **39 cereri,
două porniri**, în `INFRAFLOW_TEST_DOCS_C4E828681A7A` (aproximativ 224 secunde).
Toate refuzurile de expirare, invalidarea tokenurilor și verificările anterioare
de drepturi/restart au trecut. Procesul sintetic este oprit, iar offsetul este
resetat în `finally`. Nu a fost necesară o corecție în codul aplicației.
Rezultatul rămâne limitat la configurații valide și la politica legacy descrisă
mai sus; nu reprezintă o schimbare a politicii pentru date corupte.

Rămân două verificări de închidere: **2. secrete/2FA; 3. backup/restaurare**.
Abia după ele se face bilanțul și se decide dacă există modificări runtime care
necesită versiune/arhive noi. Wizard-ul Demo separat rămâne în afara acestei etape.

### 22 octombrie — punctul 2: compatibilitate secrete și 2FA

Proba reală `server/app.js` a trecut: **52 cereri HTTP, două porniri**, în baza
sintetică `INFRAFLOW_TEST_DOCS_A27FC628A581`, aproximativ 251 secunde. Pe lângă
verificările precedente de sesiuni/ACL, aceasta verifică:

1. Activarea 2FA refuză un cod invalid și acceptă codul TOTP corect.
2. Loginul cu parolă returnează 202/provocare, fără token de sesiune.
3. Factorul invalid este refuzat; codul de recuperare permite autentificarea.
4. Provocarea consumată nu poate fi reutilizată; provocarea expirată este refuzată.
5. După restart, codul de recuperare consumat rămâne invalid, TOTP funcționează,
   configurarea rămâne activă și mai sunt nouă coduri de recuperare.

Testele locale dedicate au trecut **6/6**: vector TOTP, hash-uri de recuperare,
compatibilitate AI/setări, rotație explicită a câmpurilor cunoscute și fallback
legacy. Un secret de test criptat cu altă cheie configurată este refuzat.
Regresia locală suplimentară: **119/119**; audit expuneri: 444 fișiere, zero
constatări. Nu s-au afișat chei, secrete TOTP sau coduri de recuperare.

Limitări: formatul existent AES-CBC nu este criptare autentificată; aceste teste
nu dovedesc detectarea oricărei alterări arbitrare. Fallback-ul pentru cheia veche
implicită există în continuare și nu înlocuiește migrarea controlată. Nu s-a
testat aici epuizarea celor cinci încercări, regenerarea codurilor sau restartul
HTTP cu o cheie greșită; refuzul cheii diferite este verificat la nivel crypto.
Nu s-a schimbat codul runtime, versiunea sau cheia vreunei instalații.

Următorul punct: **backup/restaurare**, urmat de bilanțul final. Nu sunt necesare
arhive noi pentru această extindere de teste; versiunea rămâne 2.12.734.

### 22 octombrie — punctul 3: proba backup/restaurare și limită identificată

Test nou opt-in: `server/tests/mssql-backup-roundtrip.test.js`, rulat prin
`INFRAFLOW_TEST_BACKUP_SQL=1 node --test server/tests/mssql-backup-roundtrip.test.js`.
Rezultat: **1/1 trecut**, circa 27 secunde, exclusiv pe baza nouă sintetică
`INFRAFLOW_TEST_DOCS_722A33340AE5`. Fișierul `.bak` și baza de test sunt păstrate.

1. Creează un snapshot sintetic cu utilizator, CRM, Documente, Mesaje și secret
   criptat, plus un tabel relațional separat.
2. Execută BACKUP DATABASE WITH CHECKSUM și RESTORE VERIFYONLY WITH CHECKSUM.
3. Modifică intenționat numai datele sintetice.
4. Restaurează aceeași bază sintetică și verifică egalitatea snapshotului,
   revenirea rândului relațional și decriptarea cu cheia originală de test.

Aceasta este o probă a mecanismului SQL Server, **nu** o probă end-to-end a
rutelor UI, a restartului după restaurare sau a scripturilor Windows/Linux.
Nu include fișierele storage, cheia APP_KEY, credențiale SQL, certificate,
configurația serviciilor ori catalogul extern de update. Acestea necesită copii
separate și o procedură de recuperare verificată. Nu s-a accesat baza reală.

**Problemă deschisă, nu se închide încă punctul 3:** `validateRestoreData` din
`server/modules/system/routes.js` (funcția folosită și de routerul modern de
backup) returnează o listă explicită legacy. Domenii precum `crm`, `documents`,
`messaging`, `departments` și alte extensii nu sunt returnate. Exportul JSON
include snapshotul complet, dar restaurarea îl reconstruiește incomplet.
Nu se recomandă restaurarea JSON ca mecanism complet de recuperare.

În plus, `npm run test:backup` execută momentan numai serializarea/deserializarea
fișierului seed; nu apelează validatorul, rutele ori RESTORE DATABASE. Succesul
acestei comenzi nu demonstrează recuperarea aplicației.

Următoarea lucrare este corectarea controlată a restaurării JSON, cu regresii
pentru domeniile actuale, validarea structurii și păstrarea secretelor criptate.
Aceasta va fi o modificare runtime și va necesita versiune/note/arhive conform
convențiilor proiectului. În această verificare nu s-a modificat runtime-ul;
versiunea rămâne 2.12.734, iar stabilizarea globală nu este declarată încheiată.

### 22 octombrie — corecție runtime 2.12.735 pentru restaurarea JSON

Validatorul comun `server/modules/system/restore-data.js` înlocuiește lista
legacy din `routes.js`, fiind folosit de ambele trasee existente. Păstrează
toate câmpurile snapshotului, setările și secretele criptate, fără trecere prin
formularul `updateSettings`. Listele opționale legacy absente rămân compatibile.
Respingerea structurii invalide/cheilor nesigure precedă backupul și scrierea.

Verificări trecute: 3 teste validator (inclusiv seed-ul real livrat), 1 test
HTTP al routerului cu adaptoare auth/DB/backup sintetice, 6 teste crypto/2FA,
regresie separată 35/35 pentru restaurare, permisiuni și expirare. Numerele se
suprapun; nu se însumează ca teste distincte. `npm run test:backup` apelează acum
validatorul real și compară toate câmpurile originale. Build React trecut;
audit 448 fișiere/zero constatări; sintaxă și diff check trecute.

Testul de router nu este o restaurare end-to-end în aplicația instalată și nu
verifică reîncărcarea cache-urilor, sesiunile existente sau fișierele storage.
Proba MSSQL nativă de mai sus rămâne separată. Backupul JSON nu înlocuiește
backupul SQL pentru domeniile relaționale și nici copia separată APP_KEY/storage.
Versiune nouă pentru livrare: 2.12.735, UPDATE 755. Nu s-au instalat pachete și
nu s-au repornit serviciile utilizatorului. Wizard-ul Demo rămâne amânat.

### 22 octombrie — bilanț și persistență JSON după proces nou

`restore-persistence.test.js` verifică acum validator → scriere prin core/db →
citire prin core/db într-un proces nou, exclusiv cu JSON temporar și APP_KEY
sintetică. Domeniile CRM/Documente/Mesaje/departamente/extensie și decriptarea
secretului sunt păstrate. Suita focalizată restaurare: **5/5**, test:backup și
release:check trecute. Runtime-ul și arhivele 2.12.735 nu s-au modificat.

Bilanțul cu limite și pragul de acceptare operațională este în
`docs/BILANT_STABILIZARE_2026-10-22.md`. Următoarea probă de recuperare completă
necesită o copie autorizată izolată, cu SQL/storage/APP_KEY, nu restaurare pe live.

### 22 octombrie — recuperare sintetică pe laptop verificată

Proba opt-in `INFRAFLOW_TEST_RECOVERY_SQL=1` a trecut: **53 cereri HTTP, două
porniri**, circa 259 secunde, baza `INFRAFLOW_TEST_DOCS_E35ED2622181`.
Copie temporară de runtime, licență semnată cu RSA exclusiv de test, APP_KEY
citită din fișier, backup/VERIFYONLY SQL, deteriorare intenționată și restaurare
SQL + fișier model Documente + cheia sintetică. După restart: TOTP funcțional,
cod de recuperare consumat refuzat, token vechi refuzat, cont inactiv păstrat,
descărcare autorizată cu conținut identic. Procesul sintetic este oprit.

Detalii, rulări inițiale eșuate și limite: secțiunea 4 din bilanț. Nu reprezintă
test integral CRM sau recuperare prin UI pe o instalație reală. Niciun runtime
modificat în această etapă; pachetele 2.12.735 rămân cele livrate anterior.
