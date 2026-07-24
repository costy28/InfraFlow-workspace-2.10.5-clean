# UPDATE 395 — Task-uri legate în dosarul documentului

Versiune: `2.12.375`
Data: `2026-07-24`

## Scop

După ce un document poate genera task-uri, dosarul documentului trebuie să arate imediat ce sarcini există deja pe acel document.

## Modificări backend

- `server/modules/tasks/routes.js`
  - `GET /api/tasks` acceptă filtre opționale:
    - `source_type`;
    - `source_id`;
  - comportamentul existent rămâne identic când filtrele lipsesc.

## Modificări frontend

- `client/src/pages/modules/DocumentePage.jsx`
  - la deschiderea detaliilor unui document se încarcă task-urile cu `source_type=document`;
  - detaliile documentului afișează card `Task-uri legate`;
  - cardul arată status, prioritate, responsabil și termen;
  - după creare task din document, lista task-urilor legate se reîncarcă automat.

## Testare

- `scripts/smoke-modules-readonly.js`
  - adăugat smoke read-only pentru `/api/tasks?source_type=document&source_id=smoke`.

## Compatibilitate

- Nu s-au adăugat tabele sau coloane noi.
- Filtrele sunt opționale și nu schimbă răspunsurile existente.
- Compatibil cu `DB_MODE=json`.
