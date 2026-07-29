# UPDATE 421 — Notificări live fără token real în URL

Versiune: `2.12.401`  
Data: `2026-07-29`

## Obiectiv

Închiderea restului rămas din P0 securitate după UPDATE 420: stream-ul live de notificări nu trebuie să expună tokenul real de autentificare în URL.

## Implementare

- Adăugat `POST /api/messaging/stream-ticket`.
  - Endpointul este apelat prin `api`, deci primește autentificarea normală prin header `Authorization`.
  - Serverul emite un tichet temporar, scoped pentru SSE.
  - Tichetul nu este token de login și nu poate fi folosit pe celelalte endpointuri API.
- `GET /api/messaging/stream` acceptă `?sse=...` și validează tichetul temporar.
- Adăugat `client/src/utils/sse.js` pentru handshake comun.
- Actualizat `useGlobalNotifications()` să deschidă stream-ul prin handshake, fără `infraflow_token` în URL.
- Actualizată pagina `MessagingPage` să folosească același utilitar SSE.

## Compatibilitate

Nu am modificat global `requireAuth()` și `tokenFrom()`, deoarece pot exista linkuri istorice sau fluxuri vechi care depind încă de compatibilitatea cu `?token=...`. Schimbarea este izolată pe SSE, unde era expunerea activă din frontend.

## Verificări

- `rg -n "token=" client/src server` — fără rezultate.
- `npm run release:check -- --no-zip`
- `npm run build`
- `npm run test:smoke`
- `git diff --check`
- `scripts/windows/build-update-zip.ps1 -SkipClientBuild`

## Fișiere modificate

- `server/modules/messaging/routes.js`
- `client/src/utils/sse.js`
- `client/src/hooks/useGlobalNotifications.js`
- `client/src/pages/modules/MessagingPage.jsx`
- `package.json`
- `server/package.json`
- `client/package.json`
- `version.json`
- `CHANGELOG.md`
- `AGENTS.md`
- `docs/AUDIT_COMPLET_2026-07-28.md`
- `docs/AUDIT_MENTENANTA_2026-07-11.md`
