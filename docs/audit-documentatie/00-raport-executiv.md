# Raport executiv — audit funcțional pentru documentație și onboarding

## Obiectiv

Auditul transformă structura tehnică InfraFlow v2.12.705 într-o bază verificabilă pentru:

- documentație integrată în aplicație;
- onboarding pe rol și module active;
- instruire administratori și utilizatori;
- registru de capturi reproductibile;
- delimitarea strictă dintre funcții confirmate în cod și comportamente care necesită UAT.

Nu au fost modificate funcționalități ale aplicației. Livrabilele sunt exclusiv Markdown în `docs/audit-documentatie/`.

## Surse auditate

- instrucțiunile și direcția de produs din `AGENTS.md`;
- catalogul canonic de module și drepturile efective;
- rutele frontend și navigarea Sidebar;
- rolurile și grupurile de permisiuni backend;
- rutele funcționale și paginile principalelor module;
- Ajutorul administrabil, exportul/importul bibliotecii și onboardingul existent;
- istoricul funcțional declarat până la v2.12.705, utilizat ca index, nu ca substitut pentru verificarea în cod/UAT.

## Rezultate numerice

| Element | Număr | Interpretare |
|---|---:|---|
| Module canonice/licențiabile | 25 | sursa de adevăr pentru activare și entitlement |
| Suprafețe transversale | 8 | funcții importante, dar nu module comerciale autonome |
| Unități funcționale pentru documentație | 33 | total module + suprafețe |
| Operațiuni documentabile | 72 | acțiuni de utilizator/admin, nu endpointuri brute |
| Roluri încorporate | 12 | roluri legacy/sistem definite în cod |
| Roluri implicite configurabile | 11 | roluri seed pentru scenarii uzuale |
| Roluri identificate explicit | 23 | fără a include rolurile custom create de client |
| Fluxuri end-to-end | 15 | trasee intermodulare prioritare pentru UAT |
| Capturi planificate | 34 | registru cu ecran, rol și date de mascat |
| Aspecte/neconcordanțe de verificat | 18 | nu trebuie prezentate drept garanții până la închidere |
| Probleme FAQ/troubleshooting pregătite | 18 | bază editorială, nu mesaje runtime inventate |

## Constatări principale

1. InfraFlow are deja o arhitectură potrivită documentației contextuale: catalog canonic, permisiuni granulare, Ajutor căutabil și editor Superadmin.
2. Catalogul tehnic conține 25 module; Dashboard, Setări, Kiosk, Task-uri și Ajutor trebuie documentate separat, fără a fi numărate ca module comerciale.
3. Cel mai mare risc editorial este confundarea existenței unei rute cu un flux demonstrat. Pentru procesele intermodulare și integrările externe este obligatoriu UAT.
4. Ajutorul actual este autentificat. Nu a fost identificat un portal public separat, deci materialele pentru vizitatori nu trebuie promise în forma curentă.
5. Exportul/importul Ajutor permite portarea bibliotecii, dar importul pare înlocuitor; backupul și testul de rollback trebuie incluse în procedură.
6. Rolurile sunt granulare și configurabile. Orice ghid trebuie să indice permisiunea minimă, nu doar un nume de rol.
7. România este profilul declarat complet. Documentația pentru alte jurisdicții trebuie marcată separat și validată local.
8. Datele sensibile din HR, contabilitate, securitate și capturi necesită o politică explicită de mască și audiență.

## Recomandare de implementare editorială

1. Se aprobă taxonomia din `05-structura-knowledge-base.md`.
2. Se execută UAT P0 din `04-fluxuri-functionale.md` și se închid constatările aferente din `10-neconcordante-verificari.md`.
3. Se redactează primele 10 articole de mai jos folosind `06-template-articol.md`.
4. Se produc capturile critice din `09-registru-capturi.md`, exclusiv cu date fictive.
5. Se publică în Demo, se verifică prin rol non-admin, apoi se exportă biblioteca ZIP.
6. Înainte de import la client se exportă biblioteca existentă; importul se testează pe staging și abia apoi în producție.
7. Trimestrial sau la fiecare schimbare de flux, articolele afectate se revizuiesc împreună cu registrul de capturi.

## DOCUMENTAȚIE DE CREAT

- cele 10 articole prioritare din tabelul următor;
- câte un ghid scurt pentru fiecare operațiune critică P0/P1;
- articole distincte pentru administrator, utilizator și echipa InfraFlow, fără amestecarea pașilor interni cu cei ai clientului;
- glosar unic pentru denumirile UI și aliasurile tehnice/legacy;
- proceduri de backup înainte de import Ajutor, restore și update.

## CAPTURI NECESARE

- prioritate imediată: CAP-001–CAP-004, CAP-008, CAP-011–CAP-013, CAP-015, CAP-024–CAP-027, CAP-030 și CAP-032;
- toate capturile se produc pe date fictive și se revizuiesc după fiecare schimbare de shell sau formular;
- pentru PWA/mobil se păstrează separat CAP-033 și CAP-034.

## DE VERIFICAT ÎN PRODUS

- fluxurile UAT P0 și P1 din `04-fluxuri-functionale.md`;
- integrările SMTP/IMAP, Oblio, ANAF/SPV, GPS și WhatsApp numai cu autorizare și credențiale controlate;
- restart/rollback Windows și Linux, backup/restore și ștergerea completă a datelor Demo;
- separarea datelor proprii/departamentale și protecția backend pe URL/API direct;
- paritatea Web/PWA/Electron și profilurile de țară din afara României.

## EMAILURI / FAQ

- email de bun venit și activare, fără parole în clar;
- email/link ofertă cu expirare și date de contact suport;
- notificare de onboarding incomplet și articol aferent;
- FAQ pentru modul absent, buton absent, perioadă contabilă închisă, import Ajutor, email indisponibil și restart după update;
- răspunsuri suport P1–P4 aliniate programului L–V 09:00–17:00, fără promisiuni de rezolvare neimplementate.

## DECIZII PENTRU MASTER

1. Se decide dacă va exista Ajutor public separat sau biblioteca rămâne exclusiv autentificată.
2. Se aprobă schema editorială (audiență, versiune, autor, revizie și status) înainte de extinderea editorului.
3. Se decide strategia importului Ajutor: înlocuire controlată sau merge cu conflicte/versionare.
4. Se aprobă glosarul canonic UI pentru Contracte, CRM / Vânzări, Lucrări / Execuție și Devize.
5. Se stabilește setul minim UAT care blochează publicarea unui articol procedural.

## Primele 10 articole recomandate

| Ordine | Titlu articol | Audiență | Motiv |
|---:|---|---|---|
| 1 | Prima configurare a organizației | Superadmin | condiționează toate modulele, formatele și utilizatorii |
| 2 | Activează modulele și verifică accesul efectiv | Superadmin | previne confuzia licență–modul–permisiune |
| 3 | Creează utilizatori, roluri și departamente | Superadmin | baza separării accesului și datelor |
| 4 | Folosește Dashboardul și căutarea globală | Toți utilizatorii | reduce timpul de orientare inițială |
| 5 | Creează și convertește un lead CRM | Vânzări | primul pas al fluxului comercial |
| 6 | Creează, aprobă și trimite o ofertă | Vânzări/Manager | flux cu revizii, email și client extern |
| 7 | Creează un referat și urmărește aprobările | Solicitant/Aprobator | explică workflowul configurabil și responsabilitățile |
| 8 | Înregistrează recepția și NIR-ul | Gestionar/Magaziner | operațiune critică pentru stoc și achiziții |
| 9 | Completează și validează pontajul | Angajat/Șef/HR | flux sensibil, cu roluri și stări diferite |
| 10 | Fă backup și aplică în siguranță un update | Superadmin | reduce riscul operațional la mentenanță |

## Livrabile

| Fișier | Conținut |
|---|---|
| `00-raport-executiv.md` | sinteză, numărători și priorități |
| `01-inventar-module.md` | 25 module canonice și 8 suprafețe transversale |
| `02-inventar-operatiuni.md` | 72 operațiuni, condiții, rezultate și riscuri |
| `03-roluri-permisiuni.md` | 23 roluri și matrice operațională |
| `04-fluxuri-functionale.md` | 15 fluxuri end-to-end și prioritate UAT |
| `05-structura-knowledge-base.md` | taxonomie și audiențe pentru biblioteca Ajutor |
| `06-template-articol.md` | șablon editorial standard |
| `07-onboarding-training.md` | plan de onboarding și instruire |
| `08-faq-troubleshooting.md` | întrebări frecvente și diagnostic sigur |
| `09-registru-capturi.md` | 34 capturi, conținut și reguli de mască |
| `10-neconcordante-verificari.md` | 18 aspecte neconfirmate/de urmărit |

## Limitarea auditului

Acesta este un audit static și documentar al sursei. Nu certifică integrarea live cu furnizori externi, conformitatea legală într-o jurisdicție, restaurarea unui backup real sau fiecare combinație de rol și date. Acestea se confirmă numai prin UAT documentat pe versiunea și mediul livrat.

