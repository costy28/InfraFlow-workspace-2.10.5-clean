# UPDATE 270 — Notificări automate HR

Versiune: `2.12.250`
Data: `2026-07-11`

## Scop

După Inbox HR, rezolvare ghidată, jurnal operațional și rapoarte de management,
următorul pas este ca aplicația să împingă proactiv atenționările către HR.

Acest update adaugă generarea controlată de notificări HR din sarcinile Inbox.

## Backend

- Endpoint nou:
  - `POST /api/hr/notifications/generate`
- Generatorul folosește `buildHrInbox()` ca sursă unică de adevăr.
- Notificări generate pentru:
  - sarcini critice;
  - avertizări;
  - dosare incomplete;
  - documente Kiosk neconfirmate;
  - concedii medicale neverificate;
  - offboarding;
  - alte sarcini operaționale importante.
- Destinatari:
  - utilizatori cu permisiuni HR relevante;
  - utilizatorul curent ca fallback.
- Protecție anti-spam:
  - deduplicare pe zi;
  - utilizator;
  - sarcină Inbox.
- Audit:
  - `hr_notificari_automate_generate`.

## Frontend

- În `Dashboard HR`, cardul `Raport management HR` are buton nou:
  - `Generează notificări HR`.
- După generare se afișează sumar:
  - notificări create;
  - deja existente;
  - sarcini acoperite;
  - destinatari.
- După generare se reîncarcă:
  - Inbox HR;
  - istoricul notificărilor;
  - jurnalul operațional HR.

## Compatibilitate

- Nu introduce dependențe noi.
- Nu schimbă endpointul existent pentru scadențe HR.
- Folosește mecanismul existent `db.notifications`.

## Testare

- `node --check server/modules/hr/employee-file-routes.js`
- `npm run test:hr`
- `npm run test:accounting`
- `npm run build`
