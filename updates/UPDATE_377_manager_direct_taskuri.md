# UPDATE 377 — Manager direct pentru task-uri

Versiune: `2.12.357`  
Data: `2026-07-22`

## Scop

Task Management primește prima regulă de organigramă reală: utilizatorii pot avea manager direct, iar managerul poate delega task-uri către subordonații direcți.

## Implementat

- Câmp opțional `manager_id` pe utilizator.
- Select `Manager direct` în Setări → Utilizatori.
- Coloana `Manager` în lista de utilizatori.
- Validare server-side:
  - managerul trebuie să fie utilizator activ;
  - utilizatorul nu poate fi propriul manager.
- `GET /api/tasks/assignees` include `direct_report` și poate raporta scope `hierarchy`.
- Regulile task-urilor includ subordonații direcți la vizibilitate și delegare.

## Compatibilitate

- Nu necesită migrări SQL.
- Câmpul este opțional, deci utilizatorii existenți rămân neschimbați.
- Compatibil cu `DB_MODE=json` și MSSQL app_state.

## Verificări

- `node --check server/modules/tasks/routes.js`
- `node --check server/modules/system/routes.js`
- `node --check server/modules/workflow/routes.js`
- `node --check server/core/permissions.js`
- `npm run build`
- `npm run release:check -- --no-zip`
- `npm run test:smoke`
