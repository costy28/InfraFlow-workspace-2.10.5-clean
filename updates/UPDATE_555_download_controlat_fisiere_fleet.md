# UPDATE 555 — Download controlat fișiere Parc & Resurse

Versiune: `2.12.535`  
Data: `2026-09-06`

## Scop

Închide finding-urile `high` raportate de auditul automat de expuneri fișiere pentru fișa resursei parc și pagina „Vehiculul meu”.

## Modificări

- API-ul Fleet serializează fișierele atașate fără `local_path` și fără link direct către storage.
- Pentru fiecare fișier atașat este expus doar `has_file` și `download_url`.
- Descărcarea trece prin endpoint dedicat:
  - verifică sesiunea;
  - verifică permisiunea de citire Fleet;
  - verifică existența resursei și apartenența fișierului la resursă;
  - limitează livrarea la fișiere din folderul `storage`.
- Frontend-ul din `FisaVehicul.jsx` și `MyVehicle.jsx` descarcă fișierele prin API autentificat, ca blob, fără `href` direct pe `file_path`.

## Verificări

- `node --check server/modules/fleet/asset-routes.js`
- `npm run audit:file-exposure` — `high=0`
- `npm run build`

## Migrare SQL

Nu necesită migrare SQL.
