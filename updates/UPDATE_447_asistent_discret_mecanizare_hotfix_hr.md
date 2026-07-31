# UPDATE 447 — Asistent discret Mecanizare + hotfix Inbox HR

Versiune: `2.12.427`  
Data: 2026-07-31

## Scop

Continuă seria de asistenți discreți pe modulele mari și repară o problemă vizibilă în Inbox HR: două butoane identice „Încarcă document” pentru aceeași sarcină.

## Modificări

### Mecanizare / Parc & Resurse

- `client/src/pages/modules/MecanizarePage.jsx`
  - înlocuit `ContextHelp` cu un asistent operațional compact;
  - adăugat sumar pentru:
    - cereri de parc;
    - planificări;
    - bonuri de lucru;
    - alimentări PIUSI nemapate;
    - intervenții deschise;
    - scadențe RCA/ITP/ISCIR/service;
  - asistentul calculează următorul pas și deschide zona relevantă;
  - detaliile operaționale sunt pliabile.

### HR Inbox

- `client/src/pages/modules/hr/HRInboxPanel.jsx`
  - eliminată dublarea butonului „Încarcă document” când sarcina are deja aceeași acțiune principală;
  - păstrat butonul suplimentar doar când aduce o acțiune diferită de acțiunea principală.

## Compatibilitate

- Nu modifică API-uri.
- Nu modifică schema DB.
- Nu schimbă fluxurile existente de HR sau Mecanizare.

## Verificări

- `npm run build` ✅
- `npm run release:check` ✅
- ZIP update generat: `installer/output/InfraFlow-update-v2.12.427.zip` ✅
