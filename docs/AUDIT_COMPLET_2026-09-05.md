# Audit complet InfraFlow ERP — 2026-09-05

Versiune auditată: **2.12.532**

## Verdict curent

Aplicația este funcțională pe fluxurile principale testate, dar are încă datorii tehnice și de securitate care trebuie închise înainte de lansare comercială largă. Cel mai important câștig din auditul acesta este că am introdus un smoke test comercial real, izolat de baza live, care verifică operații HTTP cu date introduse efectiv.

## Verificări rulate

- `node scripts/audit-commercial-smoke.js` — **11/11 trecut**
  - autentificare și sesiune;
  - gestiune materiale și ieșire stoc;
  - parc/resurse cu creare manuală și date tehnice;
  - contracte, consum și praguri;
  - task-uri, comentarii și finalizare;
  - email draft fără trimitere externă;
  - documente, template și watchlist;
  - HR: pontaj validat blochează concediul, devalidarea permite aprobarea, pontajul se actualizează;
  - sesizări, arhivă și secretariat.
- `node --check` pe fișierele server modificate și scriptul nou — **trecut**.
- `npm run audit:local` anterior în această rundă — **trecut** pe backend syntax, HR/accounting regression, release acceptance, smoke readonly, backup roundtrip și frontend build.
- `npm run audit:advisory` anterior în această rundă — a trecut execuția, dar a raportat lint/vulnerabilități advisory.

## Buguri remediate în update 549–551

1. **Timeout POST în module legacy mari**
   - Cauză: unele fișiere aveau două funcții `readJsonBody`; varianta veche citea stream-ul raw, dar `express.json()` consumase deja corpul requestului.
   - Impact: rute precum creare material sau creare resursă parc puteau rămâne blocate în testele reale.
   - Fix: helper-ul legacy returnează `req.body` când corpul JSON este deja parsuit.

2. **Documente: responsabil curent null**
   - Cauză: `documentUserLabel(null)` încerca să citească proprietăți de pe `null`.
   - Impact: creare document putea da 500 dacă workflow-ul nu calcula încă responsabil curent.
   - Fix: helper-ul normalizează valori lipsă/non-obiect înainte de randare.

3. **Acoperire audit comercial**
   - Adăugat `scripts/audit-commercial-smoke.js` și script npm dedicat.
   - Testul pornește server temporar pe port aleator și folosește bază JSON temporară, fără să atingă datele live.

## Riscuri rămase prioritare

1. **Securitate fișiere /storage** — rezolvată parțial în 2.12.530–2.12.531
   - `/storage` nu mai este servit public; cere sesiune validă și blochează traversal.
   - Modelele Documente nu mai expun către frontend path-uri `/storage`, ci URL-uri API controlate.
   - Recomandare rămasă: migrare graduală a tuturor linkurilor de fișiere către endpoint-uri dedicate pe entitate, cu autorizare pe dosar/document/atașament.

2. **Scheduler pornit în teste temporare** — rezolvat în 2.12.532
   - Scripturile de audit/test setează `INFRAFLOW_SCHEDULER_DISABLED=1`.
   - Schedulerul principal și PIUSI nu mai pornesc joburi periodice când flag-ul este activ.
   - Smoke-urile verifică explicit că nu apar joburi `scheduler check... start`.

3. **Fișiere foarte mari**
   - Modulele `fleet`, `system`, `procurement`, `inventory`, `technical`, `production`, `workflow` au route files de mii de linii.
   - Recomandare: split gradual pe subrute/services, fără rescriere agresivă.

4. **Lint și dependențe advisory**
   - Lint frontend raportează multe avertizări/erori, inclusiv setState în efecte și variabile nefolosite.
   - Audit npm raportează vulnerabilități în dependențe precum express/body-parser/qs/nodemailer/xlsx/axios/react-router.
   - Recomandare: tratat controlat, pe pachete, cu regresii după fiecare lot.

5. **Curățare comercială completă**
   - Încă există texte/constante legacy legate de asfalt/Publiserv în zone vechi.
   - Recomandare: curățare diferențiată: păstrăm termenii legitimi din CPV sau module opționale, eliminăm brandingul vechi din UX/licențiere/demo.

## Backlog de îmbunătățiri pe module

- **Core/Securitate**: 2FA admin, audit login eșuat, protecție atașamente, politici sesiune pe rol.
- **Dashboard**: onboarding complet generic, carduri pe module active, „următorul pas” per rol.
- **Documente/Workflow**: motor real complet pentru fluxuri configurabile, template-uri pe țară/limbă, dosar document cu timeline simplificat.
- **HR**: REGES doar pe România, dosar angajat mai ghidat, controale salarizare mai clare.
- **Gestiune/Parc**: importuri ca adaptoare opționale, catalog manual complet, alerte pe stoc/resurse.
- **Contracte**: manager contract, CPV România, consum din facturi, alerte prag și raport închidere.
- **Mesaje/Email**: inbox comercial cu reguli, legare de entități ERP, controale clare pentru SMTP/IMAP.
- **Contabilitate**: reconciliere pe surse ERP, explicații pentru blocaje, rapoarte exportabile.

## Recomandarea pentru următorul update

Următorul pas tehnic ar trebui să fie **migrarea linkurilor de fișiere rămase spre endpoint-uri dedicate pe entitate**, cu verificare de drepturi pe dosar/document/atașament. După aceea putem continua cu audit securitate pentru autentificări eșuate, stații noi și schimbări de permisiuni.
