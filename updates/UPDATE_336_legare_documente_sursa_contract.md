# UPDATE 336 — Legare documente sursă la contract

Versiune: `2.12.316`  
Data: `2026-07-18`

## Ce s-a schimbat

- Backend:
  - `GET /contracts/linkable-sources`;
  - `POST /contracts/:id/link-source`;
  - Contract Management citește consumuri generate și din NIR-uri/recepții cu `contract_id` / `contractId`;
  - legarea marchează documentul sursă, fără să creeze consum duplicat.

- Frontend:
  - buton `Leagă doc.` în lista de contracte;
  - modal pentru alegerea unei facturi/NIR existente nelegate;
  - după legare, consumul contractului se recalculează automat.

- Smoke:
  - verificare nouă pentru `/api/contracts/linkable-sources`.

## Motiv

După UI-ul minimal, Contract Management trebuie să poată consuma automat din documentele reale ale aplicației. Acest update introduce legarea controlată a facturilor și recepțiilor/NIR-urilor fără să modifice încă toate formularele sursă.

## Validare

- `node --check server/modules/contracts/routes.js`
- `node --check scripts/smoke-modules-readonly.js`
- `npm run build`
- `npm run test:smoke`
- `npm run audit:local`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/build-update-zip.ps1 -SkipClientBuild`
