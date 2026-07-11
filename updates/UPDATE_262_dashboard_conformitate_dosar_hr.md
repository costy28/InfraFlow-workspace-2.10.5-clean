# UPDATE 262 — Dashboard conformitate dosar HR

Versiune: 2.12.242  
Data: 2026-07-11

## Scop

Dupa raportul Excel pentru dosarul HR, operatorul are nevoie si de un panou zilnic de lucru: cine are lipsuri, cine nu a confirmat documentele in Kiosk si ce scadente sunt aproape.

## Functionalitati

- Endpoint nou `GET /api/hr/dossier-dashboard`.
- Endpoint nou `POST /api/hr/dossier-dashboard/:employeeId/reminder`.
- Card nou in `HR -> Documente HR`: `Dashboard conformitate dosar HR`.
- KPI-uri pentru:
  - angajati verificati;
  - angajati fara probleme;
  - angajati cu lipsuri obligatorii;
  - confirmari Kiosk lipsa;
  - angajati cu scadente in urmatoarele 90 de zile.
- Filtre rapide:
  - probleme;
  - lipsuri obligatorii;
  - neconfirmate Kiosk;
  - scadente;
  - fara probleme;
  - toate.
- Tabel prioritizat dupa scor de risc: lipsuri obligatorii, neconfirmari Kiosk si scadente.
- Actiuni rapide:
  - deschidere dosar angajat;
  - reminder Kiosk pentru documentele neconfirmate;
  - export Excel existent.

## Reminder Kiosk

Reminderul marcheaza documentele neconfirmate ca vizibile in Kiosk, actualizeaza metadata de reminder si creeaza notificare interna daca exista utilizator ERP asociat angajatului. Actiunea este auditata.

## Verificari

- `node --check server\modules\hr\employee-file-routes.js`
- `npm run build`
