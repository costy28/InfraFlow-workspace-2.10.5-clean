# UPDATE 267 — Rezolvare ghidată Inbox HR

Versiune: `2.12.247`
Data: `2026-07-11`

## Scop

UPDATE 266 a adăugat Inbox HR ca radar operațional.
UPDATE 267 transformă sarcinile din Inbox în pași ghidați de rezolvare.

## Backend

- Endpointul `GET /api/hr/inbox` trimite câmpuri operaționale suplimentare:
  - `suggested_type` pentru documentul care trebuie încărcat;
  - `next_step_key` pentru fluxurile onboarding/offboarding.
- Lipsurile din dosar sunt mapate la tipuri concrete:
  - CIM/contract → `contract`;
  - act identitate → `identitate`;
  - fișa postului → `fisa_post`;
  - SSM/PSI → `ssm`;
  - apt medical → `medical`;
  - GDPR → `gdpr`;
  - diplomă/calificare → `diploma`;
  - acte adiționale → `act_aditional`.
- Scadențele HR sugerează tipul documentului potrivit pentru reîncărcare/actualizare.

## Frontend

- Inbox HR afișează buton rapid `Încarcă document` pentru:
  - dosare incomplete;
  - scadențe care pot fi rezolvate prin document nou.
- Fișa angajatului deschisă din Inbox:
  - intră direct în tabul `Dosar documente`;
  - preselectează tipul documentului lipsă;
  - afișează banner de rezolvare ghidată cu sarcina de origine.
- Fluxurile HR deschise din Inbox:
  - intră direct în tabul `Onboarding / Offboarding`;
  - evidențiază pasul următor recomandat.
- După încărcarea documentului sau bifarea pasului recomandat:
  - sugestia se curăță;
  - Inbox-ul HR se reîncarcă.

## Compatibilitate

- Nu introduce dependențe noi.
- Păstrează endpointurile existente.
- Extinde răspunsul `GET /api/hr/inbox` fără să rupă consumatorii existenți.

## Testare

- `node --check server/modules/hr/employee-file-routes.js`
- `npm run test:hr`
- `npm run test:accounting`
- `npm run build`
