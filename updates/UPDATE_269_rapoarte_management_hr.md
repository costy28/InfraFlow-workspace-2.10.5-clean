# UPDATE 269 — Rapoarte management HR

Versiune: `2.12.249`
Data: `2026-07-11`

## Scop

După Inbox HR, rezolvare ghidată și jurnal operațional, următorul pas logic este sinteza pentru management:
o imagine rapidă despre starea HR, probleme deschise, activitate și zonele cu risc.

## Backend

- Endpoint nou:
  - `GET /api/hr/management-report`
- Export nou:
  - `GET /api/hr/management-report.xlsx`
- Parametri:
  - `from`;
  - `to`.
- Raportul combină date din:
  - Inbox HR;
  - jurnal operațional HR;
  - dashboard dosar HR;
  - scadențe HR;
  - cereri concediu;
  - concedii medicale;
  - workflow-uri HR.

## KPI calculați

- sarcini Inbox totale;
- sarcini critice;
- sarcini de atenție;
- dosare complete;
- angajați cu lipsuri obligatorii;
- confirmări Kiosk lipsă;
- scadențe în 30/90 zile;
- workflow-uri HR active;
- activități HR în perioada selectată;
- concedii create/aprobate/respinse;
- concedii medicale depuse/verificate.

## Analize incluse

- activitate pe categorii;
- activitate pe utilizator HR;
- top lipsuri în dosar;
- scadențe apropiate;
- distribuție Inbox pe categorii.

## Frontend

- Dashboard HR are card nou:
  - `Raport management HR`.
- Filtru perioadă:
  - de la;
  - până la.
- Butoane:
  - `Recalculează`;
  - `Export Excel`.
- Afișare:
  - KPI-uri principale;
  - activitate pe categorii;
  - top lipsuri dosar;
  - activitate pe utilizator HR;
  - rezumat concedii și medicale.

## Compatibilitate

- Nu introduce dependențe noi.
- Folosește agregările HR existente.
- Nu modifică fluxurile operaționale existente.

## Testare

- `node --check server/modules/hr/employee-file-routes.js`
- `npm run test:hr`
- `npm run test:accounting`
- `npm run build`
