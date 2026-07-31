# Audit complet InfraFlow ERP — 28 Iulie 2026

Versiune analizată inițial: `2.12.398`
Update audit inițial: `2.12.399` / `UPDATE 419`
Completare P0 securitate export/print: `2.12.400` / `UPDATE 420`
Completare P0 securitate notificări live: `2.12.401` / `UPDATE 421`
Completare P0 UX confirmări native: `2.12.402` / `UPDATE 422`
Completare P0 UX contracte: `2.12.403` / `UPDATE 423`
Completare P0 UX setări: `2.12.404` / `UPDATE 424`
Completare P0 UX gestiune: `2.12.405` / `UPDATE 425`
Completare P0 UX HR: `2.12.406` / `UPDATE 426`
Completare P0 UX Salarizare: `2.12.407` / `UPDATE 427`
Completare P0 UX facturi și registru jurnal: `2.12.408` / `UPDATE 428`
Completare P0 UX controlling și raportări contabile: `2.12.409` / `UPDATE 429`
Completare P0 UX producție, așternere, documente și dashboard: `2.12.410` / `UPDATE 430`
Completare P0 UX mecanizare, FAZ și operațiuni contabile: `2.12.411` / `UPDATE 431`
Completare P0 dashboard comercial generic: `2.12.412` / `UPDATE 432`
Completare P0 shell comercial generic: `2.12.413` / `UPDATE 433`
Completare P0 module operaționale limbaj generic: `2.12.414` / `UPDATE 434`
Completare P0 seed-uri și exemple comerciale generice: `2.12.415` / `UPDATE 435`
Completare P0 onboarding și demo comercial generic: `2.12.416` / `UPDATE 436`
Completare P0 demo și smoke test limbaj comercial: `2.12.417` / `UPDATE 437`

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

## Probleme remediate în UPDATE 420

| Zonă | Problemă | Remediere |
| --- | --- | --- |
| Achiziții / PAAP | exporturile și printarea comenzilor puneau token în URL | request blob prin API autentificat cu header |
| Referate | printarea referatului punea token în URL | deschidere document prin blob autentificat |
| Contracte | fișa contractului, raportul portofoliu și exportul Excel puneau token în URL | helper comun `download/open` cu `Authorization` din interceptor |
| Contabilitate / Terți | confirmările de sold și fișa furnizorului puneau token în URL | documente deschise prin API autentificat |
| Kiosk | adeverința folosea URL cu token ERP | sesiune ERP prin header și mesaj explicit pentru login kiosk pur |
| Notificări live | EventSource încă folosește token în URL | rămas intenționat pentru update separat, necesitând strategie SSE/cookie |

## Probleme remediate în UPDATE 421

| Zonă | Problemă | Remediere |
| --- | --- | --- |
| Mesaje / SSE | `EventSource` nu poate trimite header `Authorization`, deci folosea tokenul real în query string | endpoint de handshake `stream-ticket` cu tichet temporar și limitat la notificări |
| Notificări globale | hook-ul global construia URL-ul SSE cu `token=` | utilitar comun `createMessagingEventSource()` |
| Pagina Mesaje | stream-ul din pagină duplica același model cu token în URL | aceeași cale de handshake prin API autentificat |
| Audit securitate | `rg "token=" client/src server` găsea încă expuneri URL | pattern eliminat din codul aplicației |

## Probleme remediate în UPDATE 422

| Zonă | Problemă | Remediere |
| --- | --- | --- |
| UI comun | lipsea o confirmare ERP reutilizabilă pentru acțiuni critice | componentă `ConfirmDialog` cu ton, explicație, butoane și loading |
| Achiziții / PAAP | generarea planului folosea dialog nativ `window.confirm` | modal explicit cu impactul generării din istoric |
| Achiziții / PAAP | anularea pozițiilor folosea dialog nativ și mesaj scurt | confirmare în stil aplicație, cu precizarea că anularea rămâne în audit |

## Probleme remediate în UPDATE 423

| Zonă | Problemă | Remediere |
| --- | --- | --- |
| UI comun | confirmările nu puteau cere motiv auditat | `ConfirmDialog` acceptă câmp de motiv, default și validare minimă |
| Contracte | lifecycle-ul contractului folosea `window.prompt/window.confirm` | închidere, redeschidere, anulare și reactivare prin dialog ERP |
| Contracte | închiderea cu blocaje cerea confirmare nativă greu de citit | pas dedicat pentru forțare, cu lista blocajelor afișată în modal |
| Contracte | anularea actelor adiționale și atașamentelor folosea prompt nativ | motiv obligatoriu în modal, cu păstrare în audit |

## Probleme remediate în UPDATE 424

| Zonă | Problemă | Remediere |
| --- | --- | --- |
| Setări / Departamente | ștergerea departamentului folosea `window.confirm` generic | dialog ERP cu numele departamentului și impact operațional |
| Setări / Roluri | resetarea permisiunilor folosea `window.confirm` scurt | confirmare clară cu rolul vizat și efectul resetării |
| Audit UX | `SetariPage.jsx` păstra dialoguri native | pagina Setări nu mai conține `window.confirm/window.prompt/window.alert` |

## Probleme remediate în UPDATE 425

| Zonă | Problemă | Remediere |
| --- | --- | --- |
| Gestiune / Materiale | ștergerea materialului folosea `window.confirm` | dialog ERP cu avertizare despre mișcări/documente legate |
| Gestiune / Furnizori | ștergerea furnizorului folosea `window.confirm` | dialog ERP cu avertizare despre recepții, comenzi și facturi |
| Gestiune / NIR | confirmarea/anularea recepției folosea dialog nativ | confirmări explicite despre actualizarea sau revertirea stocului |
| Gestiune / Bon Consum | aprobarea/ștergerea bonului folosea dialog nativ | confirmări explicite despre scăderea stocului și documente draft |
| Gestiune / Inventar | crearea/finalizarea inventarului folosea dialog nativ | confirmări explicite despre preluarea scriptică și aplicarea diferențelor |

## Probleme remediate în UPDATE 426

| Zonă | Problemă | Remediere |
| --- | --- | --- |
| HR / Flux angajat | anularea fluxului folosea `window.prompt` | dialog ERP cu motiv obligatoriu și explicație de audit |
| HR / Ore suplimentare | respingerea cererilor folosea prompt nativ | motiv obligatoriu în `ConfirmDialog`, păstrând aceeași rută API |
| HR / Ture și evaluări | dezactivarea turelor și ștergerea evaluărilor foloseau `window.confirm` | confirmări explicite cu impact operațional |
| HR / Pontaj lunar | devalidarea, completarea tuturor departamentelor și blocarea/deblocarea lunii foloseau dialoguri native | dialoguri ERP cu motiv unde este necesar și mesaje de succes în pagină |
| HR / Concedii medicale | respingerea certificatului și trimiterea în salarizare foloseau prompt/alert nativ | respingere cu motiv auditat și notificare verde de confirmare |
| HR / Dosar angajat | anularea documentelor din dosarul electronic folosea prompt nativ | dialog ERP cu motiv și precizare că documentul rămâne trasabil |

## Probleme remediate în UPDATE 427

| Zonă | Problemă | Remediere |
| --- | --- | --- |
| Contabilitate / Salarizare | devalidarea statului salarial folosea `window.prompt` | dialog ERP cu motiv obligatoriu și explicație de audit |
| Contabilitate / Salarizare | crearea statului rectificativ folosea prompt nativ | confirmare cu motiv și precizarea că originalul rămâne în istoric |
| Contabilitate / Salarizare | plata salariilor și obligațiilor bugetare folosea `window.confirm` | confirmări explicite despre înregistrarea în trezorerie |
| Contabilitate / Salarizare | stornările de plată/notă/obligații foloseau prompt nativ | dialoguri cu motiv obligatoriu și impact vizibil |
| Contabilitate / Salarizare | anularea ajustărilor salariale folosea confirmare nativă și motiv fix | motiv editabil în dialog ERP, trimis prin aceeași rută API |

## Probleme remediate în UPDATE 430

| Zonă | Problemă | Remediere |
| --- | --- | --- |
| Producție | legarea consumului de Gestiune folosea `window.confirm` | dialog ERP cu impact explicit asupra mișcărilor de stoc |
| Așternere | anularea lucrărilor și ștergerea rapoartelor foloseau `window.confirm` | confirmări ERP cu identificator și efect asupra dashboardului |
| Documente | dezactivarea template-urilor folosea `window.confirm` | confirmare ERP care explică păstrarea documentelor deja generate |
| Dashboard | resetarea demo folosea `window.confirm` | confirmare ERP înainte de reset și reîncărcare pagină |

## Probleme remediate în UPDATE 431

| Zonă | Problemă | Remediere |
| --- | --- | --- |
| FC Utilaje | generarea FAZ utilaje folosea `window.confirm` | dialog ERP cu impact asupra marcării FC-urilor în FAZ |
| Foi Parcurs | generarea FAZ lunar folosea `window.confirm` | confirmare ERP înainte de centralizarea foilor închise |
| Mecanizare | ștergeri, import PIUSI și FAZ lunar foloseau `window.confirm` | confirmări ERP explicite, fără popup nativ |
| Operațiuni contabile | stornarea retururilor și acțiunile pe imobilizări foloseau `window.confirm/window.prompt` | dialog ERP cu câmp pentru locație, valoare sau motiv |

## Probleme remediate în UPDATE 432

| Zonă | Problemă | Remediere |
| --- | --- | --- |
| Dashboard | prima pagină păstra limbaj de demo/pilot orientat spre asfalt și utilaje | texte repoziționate ca ERP modular pentru orice organizație |
| Dashboard / demo operațional | fluxul de prezentare folosea exemplu concret „motorină utilaje” | flux generic: aprobări, resurse, oameni, contracte și costuri |
| Dashboard / onboarding | utilizatorul nou nu primea pe prima pagină direcția comercială modulară | bandă „Start rapid” cu module, task-uri și dosare contract/document |
| Dashboard / metrici | activitatea zilnică depindea conceptual de `asphaltTotal` | fallback generic `outputTotal`, păstrând compatibilitatea cu datele vechi |

## Probleme remediate în UPDATE 433

| Zonă | Problemă | Remediere |
| --- | --- | --- |
| Sidebar | meniul principal păstra etichete prea specifice pentru client/domeniu pilot | `Parc & Resurse` și `Lucrări / Execuție` ca etichete comerciale mai generale |
| Setări | formularul de companie cerea `Stație` | câmpul vizibil a devenit `Punct de lucru / locație` |
| Catalog module | producția era descrisă explicit ca producție asfalt | descriere generică pentru rețete, fluxuri, consumuri și output operațional |
| Server / rapoarte | fallback-ul de firmă era `Statie asfalt` | fallback generic `Organizație` |
| Documentație utilizator | ghidurile scurte Dashboard/Producție erau orientate pe producție/utilaje | texte aliniate cu ERP modular |

## Probleme remediate în UPDATE 434

| Zonă | Problemă | Remediere |
| --- | --- | --- |
| Parc operațional | pagina se prezenta ca `Mecanizare` și vorbea preponderent despre utilaje | header, helper, demo și KPI-uri repoziționate ca `Parc & Resurse` |
| Flotă | headerul `Flotă utilaje` era prea îngust | `Parc & Resurse mobile` |
| Producție | pagina și exporturile păstrau limbaj orientat pe asfalt | `Producție / Operațiuni`, output generic și raport printabil general |
| Lucrări / Execuție | pagina era titulată `Asternere Asfalt` | header și corelare producție generalizate |

## Probleme remediate în UPDATE 435

| Zonă | Problemă | Remediere |
| --- | --- | --- |
| Catalog module / seed | denumirile standard rămâneau `Mecanizare`, `Productie`, `Asternere asfalt` | seed și catalog intern repoziționate comercial |
| Instalații existente | schimbarea de denumiri nu ajungea în MSSQL existent | migrare `069_commercial_generic_module_labels.sql` |
| Workflow standard | template-urile și conexiunile vorbeau explicit despre asfalt/utilaje | formulări neutre: output operațional, resurse mobile, execuție |
| Demo parc | cardurile vizibile foloseau `șofer`/nume demo prea concret | limbaj de operator și echipă mobilă |
| Contabilitate | maparea `out_productie` descria asfaltul ca default | descriere generică pentru produse, servicii sau output operațional |

## Probleme remediate în UPDATE 436

| Zonă | Problemă | Remediere |
| --- | --- | --- |
| Wizard inițial | profilurile de onboarding promovau asfalt/mecanizare ca default | profiluri descrise cu Parc & Resurse, Producție / Operațiuni și Execuție |
| Ghid ajutor | întrebările principale erau nișate pe consum de asfalt și utilaje | întrebări generale pentru consum operațional și resurse |
| Tehnic | tabul de vânzări era `Vânzări asfalt` | `Vânzări / Output`, descriere generică |
| Gestiune | categoria tehnică `asfalt` era afișată vizibil ca verticală default | etichetă vizibilă `Material de producție`, valoare internă păstrată |
| Demo seed | exemplele de demo păstrau nume și activități foarte specifice asfaltului | exemple operaționale neutre pentru foi, referate, PAAP, costuri și notificări |

## Probleme remediate în UPDATE 437

| Zonă | Problemă | Remediere |
| --- | --- | --- |
| Start Demo | descrierea directorului menționa mecanizarea ca zonă implicită | descriere generală pe operațiuni, HR și costuri |
| Smoke demo | mesajele de test vorbeau despre șofer/mecanizare | mesaje neutre: operator Kiosk și coordonator resurse |
| Seed demo | rețete, notificări și puncte de lucru păstrau exemple nișate | rețete `Flux operațional`, material procesabil și punct lucru demo |
| Compatibilitate demo | conturile istorice puteau fi schimbate accidental | conturile/rutele/câmpurile interne au fost păstrate explicit |

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
| P0 | multe acțiuni critice folosesc `window.confirm`, `window.prompt`, `window.alert` | rezolvat gradual în UPDATE 422-431; scan-ul principal `client/src/pages` + `client/src/components` nu mai găsește dialoguri native |
| P0 | dashboardul și unele module încă folosesc termeni legați de asfalt | dashboardul principal a fost generalizat în UPDATE 432; modulele istorice rămân candidate la curățare graduală |
| P0 | unele exporturi și stream-uri live foloseau token în query string | rezolvat în UPDATE 420 și UPDATE 421 |
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

## Probleme remediate în UPDATE 438 — Checklist primii pași după instalare

| Zonă | Remediere |
| --- | --- |
| Dashboard | Adăugat checklist ghidat pentru pornirea oricărei organizații, cu pași clari și CTA-uri directe. |
| Setări | Adăugat suport pentru `?tab=...`, ca onboardingul să deschidă direct zona relevantă. |
| Comercializare | Prima pagină arată secvența minimă de configurare: profil, module, oameni, email, import și siguranță operațională. |

Status: ✅ implementat în v2.12.418.

## Probleme remediate în UPDATE 439 — Checklist onboarding inteligent

| Zonă | Remediere |
| --- | --- |
| Dashboard | Checklistul citește statusuri reale și calculează automat progresul configurării. |
| Onboarding | Se afișează „Următorul pas recomandat”, ca utilizatorul să nu ghicească ce lipsește. |
| Reziliență UX | Verificările sunt tolerante la endpointuri indisponibile; pagina rămâne utilizabilă. |

Status: ✅ implementat în v2.12.419.

## Probleme remediate în UPDATE 440 — Asistent configurare în Setări

| Zonă | Remediere |
| --- | --- |
| Setări | Onboardingul nu mai este ascuns în tabul Module; este vizibil permanent deasupra taburilor. |
| UX | Utilizatorul vede progresul, pașii bifați și următorul pas recomandat chiar în zona de configurare. |
| Navigare | Fiecare pas deschide direct tabul relevant din Setări. |

Status: ✅ implementat în v2.12.420.

## Probleme remediate în UPDATE 441 — Asistent configurare pliabil

| Zonă | Remediere |
| --- | --- |
| Setări | Asistentul poate fi strâns manual, ca să nu ocupe spațiu când utilizatorul lucrează în taburi. |
| Onboarding | Panoul se deschide automat când există pași lipsă și se compactează automat la configurare completă. |
| UX | Bara compactă păstrează progresul, statusul și acțiunea rapidă către următorul pas. |

Status: ✅ implementat în v2.12.421.

## Probleme remediate în UPDATE 442 — Asistent discret Contracte

| Zonă | Remediere |
| --- | --- |
| Contracte | Portofoliul are status compact de sănătate: critic, atenție sau sub control. |
| UX | Utilizatorul vede direct următorul pas recomandat, nu o listă lungă de posibile probleme. |
| Operare | Indicatorii rapizi filtrează contractele critice, scadente, fără manager sau fără document semnat. |

Status: ✅ implementat în v2.12.422.

## Probleme remediate în UPDATE 443 — Asistent discret Achiziții

| Zonă | Remediere |
| --- | --- |
| Achiziții | Helperul generic a devenit asistent de modul cu următorul pas calculat din date reale. |
| UX | Utilizatorul vede imediat dacă trebuie să rezolve cerințe, comenzi, PAAP sau cântar. |
| Operare | Indicatorii rapizi deschid tabul relevant și reduc căutarea manuală prin liste. |

Status: ✅ implementat în v2.12.423.

## Probleme remediate în UPDATE 444 — Asistent discret Gestiune / Depozit

| Zonă | Remediere |
| --- | --- |
| Gestiune | Pagina arată următorul pas recomandat pentru stocuri, documente și nomenclator. |
| UX | Operatorul vede imediat materialele epuizate/sub minim, bonurile draft și lipsurile de configurare. |
| Operare | Indicatorii rapizi duc direct la tabul relevant și pregătesc viitorul WMS prin locații/CPV/praguri. |

Status: ✅ implementat în v2.12.424.

## Probleme remediate în UPDATE 445 — Asistent discret HR

| Zonă | Remediere |
| --- | --- |
| HR | Ghidul HR a devenit asistent compact cu următorul pas calculat din date reale. |
| UX | Utilizatorul vede imediat concedii, certificate medicale, dosare, scadențe, Kiosk și pontaj fără să caute în toate taburile. |
| Operare | Indicatorii rapizi deschid tabul relevant și păstrează detaliile operaționale pliabile. |

Status: ✅ implementat în v2.12.425.

## Probleme remediate în UPDATE 446 — Asistent discret Documente

| Zonă | Remediere |
| --- | --- |
| Documente | Ghidul generic a fost transformat în asistent compact cu următorul pas calculat. |
| UX | Utilizatorul vede Inbox, urgențe, drafturi, emailuri sursă și template-uri fără să parcurgă manual toate zonele. |
| Operare | Pentru documentul selectat, asistentul leagă circuitul, task-urile și emailurile într-un singur fir de lucru. |

Status: ✅ implementat în v2.12.426.

## Probleme remediate în UPDATE 447 — Asistent discret Mecanizare + hotfix Inbox HR

| Zonă | Remediere |
| --- | --- |
| Mecanizare | Ghidul generic a devenit asistent compact pentru cereri, planificări, bonuri, PIUSI, intervenții și scadențe. |
| HR Inbox | Nu se mai afișează două butoane identice „Încarcă document” pentru aceeași sarcină. |
| UX | Operatorul vede următorul blocaj operațional fără să intre manual în fiecare subtab. |

Status: ✅ implementat în v2.12.427.
