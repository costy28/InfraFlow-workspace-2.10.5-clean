# UPDATE 379 — Task-uri „Echipa mea”

Versiune: `2.12.359`  
Data: `2026-07-22`

## Scop

Organigrama operațională începe să fie folosită direct în modulul Task-uri: managerii pot separa task-urile personale de task-urile echipei.

## Implementat

- Backend: `GET /api/tasks?scope=team`.
- Filtrul `team` folosește aria delegabilă calculată server-side:
  - subordonați direcți;
  - colegi/departament pentru șefii de departament;
  - aria globală pentru admin/manager/superadmin.
- Frontend: tab nou `Echipa mea` în pagina `Task-uri`.
- Tab-ul este afișat doar pentru utilizatorii care au echipă, subordonați sau drepturi de coordonare.
- Dacă drepturile dispar, pagina revine automat la `Ale mele`.

## Compatibilitate

- Nu necesită migrări.
- Nu schimbă structura task-urilor existente.
- Compatibil cu `DB_MODE=json` și MSSQL app_state.

## Verificări

- `node --check server/modules/tasks/routes.js`
- `npm run build`
- `npm run release:check -- --no-zip`
- `npm run test:smoke`
