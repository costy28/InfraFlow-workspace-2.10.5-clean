# UPDATE 046 - Fisa vehicul/utilaj completa

Versiune sursa: 2.12.24 -> 2.12.25
Data: 2026-06-11

## Scop

Fișa vehicul/utilaj devine pagina centrală pentru orice asset din flotă: autovehicule cu kilometri și utilaje cu ore motor.
Pagina agregă date tehnice, documente, șoferi/operatori, foi de parcurs/FAZ, reparații și consum combustibil, fără să dubleze modulele existente.

## Backend

- Adăugat `server/modules/fleet/asset-routes.js`.
- Montat routerul în `server/app.js`.
- Expus `storage/` ca resursă statică pentru fișierele încărcate.
- Endpoint-uri noi:
  - `GET /api/fleet/assets/:id/full`
  - `GET /api/fleet/assets/:id/drivers`
  - `POST /api/fleet/assets/:id/drivers`
  - `DELETE /api/fleet/assets/:id/drivers/:driverId`
  - `GET /api/fleet/assets/:id/files`
  - `POST /api/fleet/assets/:id/files`
  - `DELETE /api/fleet/assets/:id/files/:fileId`
  - `GET /api/fleet/assets/:id/gps-live`
  - `GET /api/fleet/assets/:id/trip-logs`
  - `GET /api/fleet/assets/:id/faz-logs`
  - `GET /api/fleet/assets/:id/maintenances`
  - `GET /api/fleet/assets/:id/fuel`
  - `GET /api/fleet/my-vehicle`
- Upload fișiere PDF/JPG/PNG, maximum 10 MB, în `storage/fleet-files/asset_{id}/`.
- Dezalocarea șoferilor/operatorilor și ștergerea fișierelor se fac prin marcare inactivă/anulare, nu prin ștergere fizică din baza JSON.
- `GET /api/fleet/my-vehicle` este disponibil pentru orice utilizator autentificat.
- GPS live se ascunde elegant dacă asset-ul nu are `gps_device_id`.

## Baza de date

- Migrare MSSQL nouă: `db/migrations/026_fisa_vehicul.sql`.
- Tabele noi:
  - `dbo.fleet_asset_drivers`
  - `dbo.fleet_asset_files`
- Coloane noi pe `dbo.fleet_assets`:
  - `consum_orar_normat`
  - `consum_normat_km`
  - `tip_combustibil`
  - `gps_device_id`
  - `sofer_principal_id`
- Script JSON/update: `updates/UPDATE_041.js`.
- `server/core/db.js` normalizează automat structurile:
  - `fleetAssetDrivers`
  - `fleetAssetFiles`
  - `fleet.assetDrivers`
  - `fleet.assetFiles`
  - câmpurile tehnice noi pe `fleetAssets`

## Frontend

- Pagină nouă `client/src/pages/FisaVehicul.jsx`.
- Rută nouă: `/fleet/asset/:id`.
- Fișa are 6 taburi:
  - Date generale
  - Documente
  - Șoferi / Operatori
  - Foi / FAZ
  - Reparații
  - Combustibil
- Widget GPS live cu hartă Leaflet, afișat doar când există `gps_device_id`.
- Upload documente direct din tabul Documente.
- Modal de alocare șofer/operator.
- Grafic consum real vs normat pe ultimele luni.
- Pagină mobilă nouă `client/src/pages/MyVehicle.jsx`.
- Rută mobilă nouă: `/my-vehicle`.
- Sidebar afișează `Vehiculul meu` doar dacă endpointul `/api/fleet/my-vehicle` găsește alocare activă.
- În listele existente de Flotă și Mecanizare a fost adăugat butonul `Fișă completă`.
- În lista de Flotă a fost adăugat indicator simplu pentru status documente.

## Integrare cu module existente

- Documentele existente ITP/RCA/ISCIR/taxe sunt agregate în fișă ca statusuri, fără duplicare de date.
- Foile de parcurs citesc din `fleetTripLogs`.
- FAZ-urile citesc din `fazLogs`.
- Reparațiile/reviziile și alimentările folosesc structurile deja existente în Mecanizare/Flotă.
- La creare asset se păstrează noile câmpuri tehnice: combustibil, consum normat km/oră, GPS device și șofer principal.

## Versiune

- Actualizat la `2.12.25`:
  - `package.json`
  - `package-lock.json`
  - `client/package.json`
  - `client/package-lock.json`
  - `server/package.json`
  - `server/package-lock.json`
  - `electron/package.json`
  - `electron/package-lock.json`
  - `version.json`

## Verificări

- `node --check server/modules/fleet/asset-routes.js` OK.
- `node --check server/app.js` OK.
- `node --check server/core/db.js` OK.
- `node --check server/modules/fleet/routes.js` OK.
- `node --check updates/UPDATE_041.js` OK.
- `npm run build` în `client` OK.
- Smoke test pe server temporar `4192`, DB JSON:
  - `/api/system/health` OK.
  - login demo OK.
  - `/api/fleet/assets/UTIL-003/full` OK.
  - `/api/fleet/assets/UTIL-003/drivers` OK.
  - `/api/fleet/assets/UTIL-003/files` OK.
  - `/api/fleet/assets/UTIL-003/gps-live` OK, cu widget ascuns când nu există device GPS.
  - upload fișier test OK, apoi curățat.
  - alocare/dezalocare operator OK, apoi curățată.
- Verificare vizuală în browser:
  - login afișează `v2.12.25`.
  - `/fleet/asset/UTIL-003` se încarcă.
  - taburile principale sunt vizibile.
  - tabul `Șoferi / Operatori` se afișează corect.

## Note

- Cerința inițială menționa `2.12.20 -> 2.12.21`, dar workspace-ul era deja la `2.12.24` după update-urile anterioare. Update-ul a fost aplicat înainte, la `2.12.25`.
- Serverul principal de pe portul `4180` nu a fost repornit sau modificat în timpul verificării. Testele au rulat pe port temporar `4192`.
