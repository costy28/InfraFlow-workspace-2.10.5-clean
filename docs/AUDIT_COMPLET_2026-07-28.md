# Audit complet InfraFlow ERP — 28 Iulie 2026

Versiune analizată inițial: `2.12.398`  
Update rezultat: `2.12.399` / `UPDATE 419`

## Rezumat executiv

Aplicația este funcțională și testele automate existente trec. Problemele majore nu sunt de tip „serverul nu pornește” sau „modulele principale pică”, ci de scalare a produsului comercial: cod istoric mare, UX încă tehnic în unele fluxuri, dependențe cu advisory-uri de securitate și module care trebuie prezentate mai generic pentru clienți internaționali.

Direcția corectă pentru perioada următoare:

1. stabilizare tehnică și securitate;
2. reducerea fișierelor mari prin splituri controlate;
3. curățare UX: confirmări, pași ghidați, helper-e, texte mai puțin tehnice;
4. generalizare comercială: fără identitate vizibilă legată de un client sau de un singur domeniu;
5. testare mai largă pe fluxuri reale, nu doar smoke read-only.

## Baseline verificări

| Verificare | Rezultat |
| --- | --- |
| `npm run release:check` | OK |
| `npm run test:hr` | OK — 15 teste |
| `npm run test:accounting` | OK — 82 teste |
| `npm run build` | OK |
| `npm run test:smoke` | OK — 69 verificări |
| `npm run test:release` | OK |
| `npm run test:backup` | OK |
| `npm run audit:local -- --skip-build` | OK |
| Backend syntax check | OK — 135 fișiere |
| `npx eslint src/pages/modules/MessagingPage.jsx --quiet` după fix | OK |

## Probleme remediate în UPDATE 419

| Zonă | Problemă | Remediere |
| --- | --- | --- |
| Mesaje / Inbox ERP | `setEmailError` era folosit fără stare definită la eroare de download atașament | stare `emailError` dedicată și afișare în modal |
| Mesaje / deep-link email | lint React semnala setState sincron în effect | mutare pe microtask |
| Setări / GPS | raw body GPS putea ajunge în consola browserului în producție | raw body logat doar în development |
| Fișa vehiculului | catch gol la GPS live | tratament explicit, păstrează ultima poziție cunoscută |

## Zone mari de cod

| Prioritate | Fișier / zonă | Linii aproximative | Observație |
| --- | --- | ---: | --- |
| P0 | `server/modules/system/routes.js` | 8.410 | prea multă logică într-o rută; trebuie spart în servicii/rute tematice |
| P0 | `server/modules/fleet/routes.js` | 8.387 | mecanizare/fleet/GPS/foi parcurs într-un singur fișier masiv |
| P0 | `server/modules/procurement/routes.js` | 8.350 | conține logică istorică și părți duplicate din fluxuri vechi |
| P0 | `server/modules/inventory/routes.js` | 8.187 | gestiune + producție istorică amestecată |
| P0 | `server/modules/technical/routes.js` | 8.115 | conține multă logică de producție/raportare istorică |
| P0 | `server/modules/production/routes.js` | 8.076 | producția trebuie delimitată de operațional generic |
| P1 | `server/modules/workflow/routes.js` | 7.643 | motor workflow + multe rute concrete |
| P1 | `server/modules/system/service.js` | 6.897 | serviciu foarte mare, candidat la split pe update/backup/settings |
| P1 | `server/modules/hr/routes.js` | 4.780 | HR e activ și merită split complet pe subdomenii |
| P1 | `client/src/pages/SetariPage.jsx` | 3.603 | prea mare pentru administrare comercială; trebuie împărțit pe secțiuni |
| P1 | `client/src/pages/modules/ContractePage.jsx` | 2.504 | modul matur, dar greu de extins |
| P1 | `client/src/pages/modules/HRPage.jsx` | 2.007 | multe fluxuri HR într-o pagină |
| P1 | `client/src/pages/modules/MessagingPage.jsx` | 1.805 | după multe update-uri email/task/document, trebuie split |

Notă: `server/modules/nomenclator/cpv_codes.json` are ~47k linii, dar este dataset; nu este problemă de arhitectură, doar trebuie tratat ca seed/data, nu cod.

## Advisory securitate și dependențe

| Zonă | Finding | Recomandare |
| --- | --- | --- |
| Server | `body-parser`, `form-data`, `nodemailer` au fix disponibil | update controlat dependențe + smoke/teste complete |
| Server | `adm-zip` are fix major/breaking | analiză separată pentru update ZIP/backup înainte de schimbare |
| Server/Client | `xlsx` are vulnerabilități fără fix npm direct | limitare input Excel, validare tip/dimensiune, eventual înlocuire treptată pe termen mediu |
| Client | `axios`, `react-router-dom` au fix disponibil | update controlat client dependencies + build/smoke |
| Runtime | lipsă `APP_KEY` în test generează warning | în producție trebuie verificare setup/health mai vizibilă |

## Probleme UX / produs observate

| Prioritate | Problemă | Impact |
| --- | --- | --- |
| P0 | multe acțiuni critice folosesc `window.confirm`, `window.prompt`, `window.alert` | UX neuniform, greu de folosit, risc de mesaje neclare |
| P0 | dashboardul și unele module încă folosesc termeni legați de asfalt | produsul trebuie să pară ERP modular general, nu aplicație de nișă |
| P0 | unele exporturi folosesc token în query string | risc de expunere token în history/loguri; trebuie endpointuri download autentificate prin API/blob |
| P1 | setările sunt foarte dense | utilizatorul nou nu știe ce este esențial și ce este avansat |
| P1 | modulele mature nu au peste tot „următorul pas” vizibil | aplicația e puternică, dar trebuie să ghideze operatorul |
| P1 | lint-ul global are multe erori istorice | nu blochează build-ul, dar încetinește refactorizarea sigură |

## Backlog prioritar pe module

### P0 — Stabilizare și siguranță

1. Înlocuire token în query string pentru exporturi/printări cu download prin API autentificat:
   - Achiziții PAAP;
   - Referate PDF;
   - Contracte export/print;
   - Terti/contabilitate unde există pattern similar.
2. Curățare lint runtime:
   - `no-undef`;
   - `no-empty`;
   - variabile nefolosite evidente;
   - apoi regula React `set-state-in-effect` pe componentele active.
3. Update controlat dependențe cu fix disponibil:
   - `axios`;
   - `react-router-dom`;
   - `nodemailer`;
   - `body-parser`;
   - `form-data`.
4. Verificare explicită `APP_KEY` în diagnostice/setup pentru producție.

### P1 — Modularizare chirurgicală

1. `SetariPage.jsx` → componente:
   - General;
   - Administrare utilizatori/roluri;
   - Interfață;
   - Integrări GPS/SMTP/IMAP/TVA;
   - Update/backup/licență.
2. `MessagingPage.jsx` → componente:
   - Chat;
   - Inbox list;
   - Email detail modal;
   - Compose modal;
   - Link/task/document actions.
3. `HRPage.jsx` → split final:
   - Pontaj;
   - Concedii;
   - Documente HR;
   - Training;
   - Ture;
   - Echipamente.
4. Server rute mari:
   - `system/routes.js`;
   - `fleet/routes.js`;
   - `inventory/routes.js`;
   - `production/routes.js`;
   - `technical/routes.js`;
   - `procurement/routes.js`.

### P1 — UX intuitiv

1. Înlocuire `confirm/prompt/alert` cu modaluri consistente:
   - motiv obligatoriu;
   - impact explicit;
   - acțiune reversibilă/anulare;
   - feedback după succes.
2. Adăugare helper contextual standard în fiecare modul:
   - „Ce faci aici?”;
   - „Următorul pas recomandat”;
   - „Blocaje / ce lipsește”.
3. Dashboard comercial generic:
   - KPI-uri configurabile pe module active;
   - fără „asfalt” ca default prioritar;
   - demo generic pe organizație fictivă.

### P2 — Module funcționale

| Modul | Pași recomandați |
| --- | --- |
| Core/System | health mai clar, status APP_KEY, update dependencies, backup restore UI ghidat |
| HR | finalizare split HR, wizard angajat nou, status pontaj/concedii pe pași, modaluri în loc de prompt |
| Salarizare/Contabilitate | integrare mai vizibilă HR → salarizare → D112; checklist lunar operator |
| Gestiune/WMS | separare WMS generic de producție/asfalt, locații depozit, loturi, scanare mobilă |
| Achiziții/PAAP | contract manager legat de CPV, alertare consum contract, exporturi fără token în URL |
| Contracte | dashboard manager contract, consum din facturi, alerte 80/90/100%, legături email/document/task |
| Mesaje/Inbox ERP | reguli avansate, căutare full-text, conversații grupate, permisiuni mailbox |
| Task-uri | board kanban, recurring tasks, notificări kiosk mai vizibile, SLA/termene |
| Documente | preview sigur/sanitizare, fluxuri template pe țară/limbă, versionare document |
| Fleet/Mecanizare | split GPS/FAZ/foi parcurs, diagnostic GPS prietenos, importuri protejate |
| Producție/Așternere | redenumire generică configurabilă pentru industrii: asfalt, beton, mobilier, servicii |
| Servicii publice | pachete activabile: salubrizare, deszăpezire, mediu, ecarisaj, teren |
| Internaționalizare | i18n labels, profil țară, reguli legislative pe module, template-uri per jurisdicție |

## Ordinea propusă de lucru

1. UPDATE următor: eliminăm tokenurile din URL pentru exporturi/printări importante.
2. Apoi: update dependențe cu fix disponibil, cu testare completă.
3. Apoi: split `MessagingPage.jsx`, fiindcă este activ și a crescut mult.
4. Apoi: split `SetariPage.jsx`, pentru că setările sunt poarta de onboarding comercial.
5. Apoi: curățare dashboard generic și texte vizibile legate de asfalt.
6. Apoi: primul pachet UX modaluri comune pentru confirmări/motive.

## Concluzie

InfraFlow este deja solid la nivel funcțional pentru un proiect atât de amplu: testele trec, modulele răspund, backup-ul e valid. Următoarea etapă nu este „mai multe funcții brute”, ci transformarea complexității în fluxuri ghidate, curate și comerciale. Acolo apare diferența dintre o aplicație mare și un produs care creează dependență.
