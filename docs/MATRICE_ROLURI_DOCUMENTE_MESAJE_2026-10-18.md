# Matrice verificată Documente / Mesaje

Versiune: 2.12.730 — 18 octombrie 2026. Domeniu limitat la fluxurile enumerate, nu audit integral ERP.

| Profil / situație | Rezultat verificat |
|---|---|
| Cititor documente proprii | Citește documentul propriu; refuz document străin, PDF și audit |
| Destinatar partajare activă | Citește și urmărește; partajările multiple nu dublează lista |
| Partajare expirată / revocată | Dispare accesul, inclusiv din urmărire, sursele și legăturile Email |
| Urmăritor istoric fără acces | Urmărirea nu acordă drept de consultare |
| Responsabil de pas fără aprobare | Atribuirea pasului nu acordă dreptul de aprobare |
| Responsabil cu aprobare explicită | Aprobă pasul; starea și auditul se păstrează în SQL |
| Admin cu drepturi restrânse | Nu primește implicit administrare șabloane, canale sau WhatsApp |
| Editor / gestionar explicit | Poate administra șabloane / canale fără rol admin |
| Cititor mesagerie | Consultă, dar nu modifică, sincronizează sau compune |
| Expeditor autorizat | Modifică status / salvează draft; nu s-au trimis mesaje externe |
| Legare Email → entitate | Verificare pe țintă, metadate canonice, refuz ținte inexistente / străine |
| Atașamente Email | Necesită consultare Inbox; indexuri, nume și antete validate |

## Dovezi și limite

1. 48 teste unitare/policy trecute: `document-entity-access`, `email-source-access`, `role-override-normalization`, `permissions-regression`, `client-permission-access`, `whatsapp-business`.
2. `npm run test:hr:roles`: 24 scenarii HTTP/recitire pe JSON temporar, incluzând regresiile HR și Documente/Mesaje. Nu reprezintă SQL real.
3. `server/tests/documents-sql-http.test.js`: 19 cereri HTTP și 35 interogări reale în baza sintetică `INFRAFLOW_TEST_DOCS_8A3A306EC374`, păstrată pentru diagnostic. Schema Documente provine din migrările proiectului 002 și 030, cu dependențe core minimale. Auth și app-state sunt simulate; operațiunile Documente, auditul aprobării și partajările folosesc SQL real.
4. Audit expuneri fișiere: zero constatări.

Testul SQL se activează explicit în PowerShell:

```powershell
$env:INFRAFLOW_TEST_DOCUMENTS_SQL = '1'
try { node --test server/tests/documents-sql-http.test.js }
finally { Remove-Item Env:INFRAFLOW_TEST_DOCUMENTS_SQL }
```

Fiecare rulare creează și păstrează o bază nouă `INFRAFLOW_TEST_DOCS_*` pe SQL Express local. Nu folosește baza instalată și nu trimite emailuri.

## Ce rămâne separat

- Validare a modului relațional extins și a celorlalte transporturi SQL; configurația standard completă este verificată mai jos.
- Validarea fluxului CRM complet și a executorului DB de producție, dincolo de testul de surse descris mai jos.
- Acceptanță manuală pe instalațiile Windows/Linux, cu roluri reale.
- Integrările SMTP, Meta și Oblio nu au fost apelate în aceste teste.

Nu se afirmă că toate modulele și toate combinațiile de permisiuni ale ERP au fost auditate.

## Extindere verificată — v2.12.731

`server/tests/auth-crm-sql-http.test.js`: 9 cereri HTTP și 35 interogări SQL reale, în baza sintetică păstrată `INFRAFLOW_TEST_DOCS_9B53426B3DE4`. Se activează cu aceeași variabilă opt-in ca testul Documente; se rulează separat pentru lizibilitatea rezultatului.

- Fără token și cu parolă greșită: 401. Loginul real generează sesiunea Bearer și auditul persistat în SQL; hash-ul parolei nu apare în răspuns.
- Document propriu: permis; document străin: refuzat.
- Repository-urile CRM reale citesc oferta, lead-ul și comanda din schema migrată 070–074. ID-urile inexistente și lead-ul anulat nu publică sursa.
- Comanda afișează `CO-SQL`, nu oferta asociată `OF-SQL`; eroarea descoperită a fost corectată.
- Retragerea drepturilor CRM este aplicată la următoarea cerere, fără reautentificare. Dezactivarea contului refuză și invalidează sesiunea existentă.

Limite: ruta login, verificarea parolei, sesiunile, politicile și repository-urile sunt cele ale aplicației, dar `core/db` este înlocuit cu un adaptor dedicat care citește/scrie app-state în SQL. Nu se pornește `app.js` complet și nu se validează executorul DB de producție, 2FA sau toate configurațiile de licențiere/rețea. Fără apeluri SMTP/Meta/Oblio.

Regresie curentă: 49 teste unitare/policy și 24 scenarii HTTP/recitire JSON trecute, build reușit și zero constatări în auditul expunerilor de fișiere. Cele 19 cereri Documente SQL din secțiunea anterioară aparțin verificării v2.12.730, nu unei rerulări în această etapă.

## Aplicație completă MSSQL standard — acceptanță v2.12.731

`server/tests/full-app-mssql-http.test.js` a trecut: **18 cereri HTTP și două porniri reale prin `server/app.js`**, în baza sintetică `INFRAFLOW_TEST_DOCS_E5A0EA708F76`. Nu folosește VM, mock de autentificare sau adaptor DB. `core/db.js` și ruta de administrare utilizatori/roluri sunt cele de producție.

1. Health confirmă modul MSSQL și numele exact al bazei izolate.
2. Lipsa sesiunii și parola greșită sunt refuzate; loginurile reale pentru cititor și superadmin funcționează.
3. Documentul propriu este accesibil; cel străin este refuzat. Urmărirea se salvează, iar Email rezolvă sursa proprie.
4. Superadmin retrage dreptul Documente prin API-ul rolurilor. Sesiunea existentă primește imediat refuz, iar sursa Email este ascunsă.
5. Dezactivarea contului prin API invalidează accesul. Verificarea directă în SQL confirmă contul inactiv, urmărirea și auditul de login, rol și utilizator.
6. După oprirea și repornirea procesului de test, contul dezactivat nu se autentifică, iar superadmin regăsește starea salvată.

Comandă PowerShell (opt-in; creează și păstrează o bază sintetică nouă):

```powershell
$env:INFRAFLOW_TEST_FULL_APP_SQL = '1'
try { node --test server/tests/full-app-mssql-http.test.js }
finally { Remove-Item Env:INFRAFLOW_TEST_FULL_APP_SQL }
```

Izolare: seed sintetic în TEMP, port aleator loopback, cheie temporară, recuperare app-state locală oprită, scheduler dezactivat. Nu sunt repornite instalațiile utilizatorului și nu sunt trimise emailuri. Baza și jurnalul sunt păstrate pentru diagnostic; jurnalul rulării trecute: `C:\Users\costy\AppData\Local\Temp\infraflow-full-sql-RiObnj\server.log`.

Limite: `INFRAFLOW_SQL_RELATIONAL=0`, configurația standard app-state. Documentele sunt stocate în JSON-ul din SQL, nu în tabelele Documente relaționale; acelea au verificare separată în secțiunile anterioare. Cu autentificarea Windows integrată, executorul PowerShell de producție a funcționat, dar pool-ul Node a raportat `Login failed for user ''`; nu se declară transportul pooled validat. Fără validare Linux, SQL-login, 2FA, browser UI sau integrări externe în această etapă.

Prima încercare s-a oprit în infrastructura testului: app-state cu nomenclator CPV avea aproximativ 1,9 milioane de caractere, peste bufferul auxiliar implicit. Bufferul cititorului de test a fost mărit la 64 MiB, iar curățarea procesului oprit prin semnal a fost corectată; reluarea integrală a trecut. Nu a fost necesară o corecție nouă de runtime. Cele 49 teste unitare/policy și auditul expunerilor (zero constatări) au fost rerulate și au trecut; cele 24 scenarii JSON rămân rezultatul etapei anterioare.

## Diagnostic relațional și pool — v2.12.732

Driver instalat: `mssql` 12.5.4, implicit Tedious. Parserul local ignoră `Integrated Security=True/SSPI`; nu creează o autentificare Windows. Acest comportament este documentat de [node-mssql, secțiunea Drivers](https://github.com/tediousjs/node-mssql#drivers): Trusted Connection este oferit de driverul nativ separat MSNodeSQLv8, absent din instalația de dezvoltare. NTLM explicit cu domain/user/password este o configurație diferită. Nu s-au instalat dependențe și nu s-a schimbat autentificarea SQL. SQL-login este recunoscut de parser, dar nu este declarat verificat prin conexiune reală în această etapă.

Diagnostic nou: `scripts/diagnose-relational-schema.js`, opt-in `INFRAFLOW_TEST_RELATIONAL_SQL=1`. Creează exclusiv o bază sintetică locală, construiește schema și oprește la prima eroare. Nu este bootstrap complet, nu verifică sincronizarea sau migrarea datelor organizației; păstrează separarea batch-urilor GO prin sp_executesql, nu prin același transport de bootstrap.

Prima rulare (`INFRAFLOW_TEST_DOCS_B4DEAABB2101`) a aplicat 69 de fișiere și a eșuat la 063: `Invalid column name 'generated'`. Migrarea adăuga coloana și o folosea în UPDATE în același batch. SQL Server compilează UPDATE înainte ca ALTER să fie executat.

Corecția este o migrare nouă, `062b_hr_employee_file_ack_columns.sql`, ordonată înaintea 063; migrarea istorică nu este editată. Testul SQL dedicat a trecut în `INFRAFLOW_TEST_DOCS_F20DE4DCBADE`: reproducerea erorii, pregătirea, aplicarea/reaplicarea, trei rânduri păstrate, document anulat neatins de UPDATE și document negenerat fără marcaj de confirmare. Setul fără SQL opt-in: 52 teste trecute și un test SQL sărit explicit. Testul dedicat opt-in: două teste trecute. Build și audit expuneri reușite.

Limită importantă identificată în surse: `syncMssqlRelationalFromAppState` caută `db/mssql-import-app-state.sql`, fișier absent. Nu se poate declara sincronizarea generală disponibilă și nu se activează flag-ul relațional pe instalațiile utilizatorului. Comentariul din `core/migrations.js` păstrează explicit configurația standard app-state până la uniformizarea generațiilor de ID-uri. Crearea tabelelor, chiar dacă reușește, nu este echivalentă cu migrarea sigură a datelor.

Reluarea integrală de schemă (`INFRAFLOW_TEST_DOCS_773641C0E687`) a aplicat 73 de fișiere, inclusiv 062b/063, apoi s-a oprit la `066_controlling_generic_cost_centers.sql`: `Invalid column name 'cancelled_at' / 'cancelled_reason'`. Aceeași categorie de compilare în batch; migrarea implică dezactivarea seed-urilor și asocierile centrelor de cost, deci remedierea trebuie verificată separat cu date sintetice. Nu este inclusă în v2.12.732. Fișierele de după 066 nu au fost validate prin acest diagnostic. Rezultat general: schema extinsă NU este declarată gata.

## Preflight Controlling 066 — v2.12.733

Migrare nouă: `065b_controlling_legacy_cleanup_preflight.sql`, înainte de 066, fără editarea istoriei. Pregătește coloanele de anulare ale centrelor și asocierilor în batch separat. Înainte de curățarea istorică, compară codul cu numele/tipul/company_id din seed-ul 021 și verifică referințele declarate prin FK plus coloanele cunoscute Controlling/Flotă. O coliziune sau o referință produce eroarea 51066, pentru verificare manuală, înaintea modificărilor persistente ale acestui preflight. Nu forțează rezolvarea prin redenumire, ștergere sau mutarea datelor clientului.

Test SQL real trecut în `INFRAFLOW_TEST_DOCS_7EB4BD34A9F1` (rularea inițială fără cazul buget: `INFRAFLOW_TEST_DOCS_27AB378C19CB`):

1. Eroarea originală de compilare este reprodusă înaintea preflight-ului.
2. Centrul personalizat cu codul ADMINISTRATIV oprește migrarea; rămâne activ și coloanele noi nu sunt adăugate în acea încercare.
3. O asociere, un buget și un vehicul legate de coduri istorice opresc separat migrarea. Bugetul sintetic își păstrează valoarea.
4. Doar fixture-ul este ajustat între scenarii pentru a permite verificările pozitive. Niciun astfel de transfer/renumire nu face parte din migrare.
5. Preflight + 066 pot fi reluate; snapshot-ul centrelor rămâne identic. Cele 18 centre sunt păstrate, inclusiv cele două centre client active, asocierea și vehiculul clientului, precum și valoarea și asocierea bugetului.
6. Înregistrarea istorică a lui 066 în `dbo.schema_migrations` împiedică noua gardă să blocheze retroactiv upgrade-ul. Aceasta nu repară modificări deja executate de vechea migrare.

Regresie: 53 teste trecute, două teste SQL sărite explicit în rularea fără opt-in; rularea SQL dedicată are două teste trecute. Build, audit expuneri (zero constatări) și verificare versiune reușite. Testul folosește schemele reale core/workflow, Controlling și Flotă relevante, nu aplicația completă. Nu au fost testate toate personalizările de schemă sau toate configurațiile de date existente.

Identitatea cod/nume/tip fără referințe nu dovedește absolut originea unui rând. Nu se activează modul relațional extins și nu se declară sincronizarea generală app-state disponibilă; fișierul de import rămâne absent. Pool-ul Node și integrările externe nu au fost validate în această etapă.

Reluarea integrală a diagnosticului de schemă în `INFRAFLOW_TEST_DOCS_41D829A28C3C` a trecut 76 de fișiere, inclusiv noua 065b, 066 și 067. S-a oprit la `068_contract_management_tasks.sql`, eroare `Incorrect syntax near 'NOT'`, în definirea indexului filtrat `UX_contract_management_tasks_open_alert`. Această eroare nu este remediată în v2.12.733 și fișierele ulterioare nu sunt validate de această rulare. Rezultatul nu este un succes integral al modului relațional. Urmează remedierea 068 cu test SQL dedicat, apoi reluarea diagnosticului; sincronizarea datelor rămâne separată.
