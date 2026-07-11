# UPDATE 268 — Jurnal operațional HR

Versiune: `2.12.248`
Data: `2026-07-11`

## Scop

După Inbox HR și rezolvarea ghidată, HR are nevoie de dovada clară că sarcinile au fost rezolvate:
cine a lucrat, când, pentru ce angajat și în ce categorie.

Acest update transformă auditul tehnic existent într-un jurnal operațional citibil pentru HR.

## Backend

- Endpoint nou:
  - `GET /api/hr/activity`
- Export nou:
  - `GET /api/hr/activity.xlsx`
- Evenimentele HR din audit sunt normalizate în:
  - categorie;
  - etichetă umană;
  - angajat;
  - marcă;
  - utilizator;
  - rol;
  - detalii;
  - dată/oră.
- Filtre suportate:
  - `employee_id`;
  - `category`;
  - `user_id`;
  - `from`;
  - `to`;
  - `limit`.

## Categorii principale

- Dosar;
- Kiosk;
- Workflow;
- Concedii;
- Medical;
- Scadențe;
- Angajați;
- Contracte;
- Pontaj;
- Echipamente;
- Salarizare;
- Training;
- Alte acțiuni.

## Frontend

- În `Inbox HR` apare secțiunea:
  - `Istoric rezolvări / jurnal operațional HR`.
- Filtre rapide:
  - categorie;
  - angajat;
  - perioadă.
- Buton:
  - `Export Excel`.
- În fișa angajatului apare:
  - `Activitate HR recentă`, mini timeline cu ultimele acțiuni legate de angajat.

## Compatibilitate

- Nu introduce dependențe noi.
- Folosește `db.audit` existent.
- Nu modifică structura auditului tehnic, doar îl interpretează pentru UI HR.

## Testare

- `node --check server/modules/hr/employee-file-routes.js`
- `npm run test:hr`
- `npm run test:accounting`
- `npm run build`
