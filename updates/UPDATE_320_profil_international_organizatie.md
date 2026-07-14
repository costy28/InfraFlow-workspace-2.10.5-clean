# UPDATE 320 — Profil internațional organizație

Versiune: `2.12.300`  
Data: `2026-07-14`

## Scop

Fundație tehnică pentru InfraFlow multi-country: organizația poate avea țară, limbă/locale, monedă, fus orar și profil juridic. Această bază va permite ulterior reguli legislative, template-uri, validatoare și nomenclatoare pe țară.

## Modificări

- Backend:
  - endpoint read-only `GET /api/settings/country-profiles`;
  - catalog inițial de profiluri: RO, GB, US, DE, FR, IT, ES și GLOBAL/demo;
  - normalizare server-side pentru `locale`, `language`, `country`, `currency`, `timezone`, `jurisdiction_profile`.

- DB:
  - migrare MSSQL `065_country_profile_settings.sql`;
  - fallback-uri compatibile cu `DB_MODE=json` în `server/core/db.js`.

- Frontend:
  - panou nou `Profil internațional` în `Setări > General`;
  - alegerea țării completează automat limba, moneda, fusul orar și profilul juridic;
  - checklistul de onboarding include pasul `Profil țară`.

- Verificare:
  - smoke suite read-only verifică endpointul nou de profiluri de țară.

## Compatibilitate

- Nu schimbă fluxuri existente.
- Valorile implicite rămân România: `ro-RO`, `RO`, `RON`, `Europe/Bucharest`.
- Instalațiile existente primesc fallback-uri sigure.
