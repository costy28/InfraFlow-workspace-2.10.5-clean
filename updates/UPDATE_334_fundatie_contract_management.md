# UPDATE 334 — Fundație Contract Management

Versiune: `2.12.314`  
Data: `2026-07-18`

## Ce s-a schimbat

- Backend:
  - modul nou `server/modules/contracts/routes.js`;
  - endpointuri:
    - `GET /contracts/dashboard`;
    - `GET /contracts`;
    - `GET /contracts/:id`;
    - `POST /contracts`;
    - `PATCH /contracts/:id`;
    - `POST /contracts/:id/consumptions`;
    - `POST /contracts/:id/cancel`;
  - structură JSON nouă `contractManagement`;
  - calcule automate pentru valoare contractată, consumată, rămasă și procent consumat;
  - alerte pentru praguri valorice și termene apropiate/expirate;
  - consumuri manuale și consumuri agregate din facturi legate prin `contract_id` / `contractId`.

- MSSQL:
  - migrare nouă `db/migrations/067_contract_management.sql`;
  - schema `contract_management`;
  - tabele `contract_management.contracts` și `contract_management.consumptions`.

- Smoke:
  - verificare `GET /api/contracts/dashboard`;
  - verificare `GET /api/contracts`.

## Motiv

Contract Management devine o piesă comercială importantă: un client poate urmări contracte pe valoare, consum, responsabil, CPV, PAAP, centru de cost și scadențe. În această etapă am pus fundația sigură și extensibilă, fără să blocăm fluxurile existente.

## Validare

- `node --check server/modules/contracts/routes.js`
- `node --check server/app.js`
- `node --check server/core/db.js`
- `node --check scripts/smoke-modules-readonly.js`
- `npm run test:smoke`
- `npm run audit:local`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/build-update-zip.ps1 -SkipClientBuild`
