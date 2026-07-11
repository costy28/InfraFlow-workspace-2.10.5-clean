# UPDATE 266 — Inbox HR centralizat

Versiune: `2.12.246`
Data: `2026-07-11`

## Scop

HR avea deja mai multe panouri specializate, dar operatorul trebuia să știe unde să caute:
concedii, concedii medicale, dosar personal, confirmări Kiosk, scadențe și fluxuri de onboarding/offboarding.

Acest update adaugă un inbox unic pentru sarcinile care cer acțiune.

## Backend

- Endpoint nou:
  - `GET /api/hr/inbox`
- Agregare sarcini din:
  - cereri de concediu în așteptare;
  - concedii medicale care cer verificare certificat;
  - fluxuri HR active de onboarding/offboarding;
  - dosare personale cu lipsuri obligatorii;
  - documente Kiosk neconfirmate;
  - scadențe HR avansate;
  - angajați fără cont ERP/Kiosk asociat.
- Fiecare sarcină are:
  - severitate: `critical`, `warning`, `info`;
  - categorie;
  - angajat, marcă și departament;
  - detaliu operațional;
  - acțiune sugerată pentru frontend.

## Frontend

- Tab nou în HR:
  - `Inbox HR`
- Carduri sumar:
  - total sarcini;
  - critice;
  - avertizări;
  - informative.
- Filtre rapide:
  - toate;
  - critice;
  - avertizări;
  - concedii;
  - medicale;
  - onboarding;
  - offboarding;
  - dosar;
  - Kiosk;
  - scadențe.
- Acțiuni rapide:
  - deschide concedii;
  - deschide dosarul angajatului;
  - deschide fluxul HR;
  - deschide zona scadențe/Kiosk;
  - trimite reminder Kiosk.

## Compatibilitate

- Nu introduce dependențe noi.
- Folosește structurile HR existente.
- Păstrează comportamentul taburilor existente.

## Testare

- `node --check server/modules/hr/employee-file-routes.js`
- `npm run test:hr`
- `npm run test:accounting`
- `npm run build`
