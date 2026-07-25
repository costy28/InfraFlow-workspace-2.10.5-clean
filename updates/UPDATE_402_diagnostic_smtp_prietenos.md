# UPDATE 402 — Diagnostic SMTP prietenos

Versiune: `2.12.382`  
Data: `2026-07-25`

## Context

Configurarea SMTP funcționează, dar erorile returnate de Gmail/SMTP erau prea tehnice pentru utilizatorul final.

## Implementat

- `server/modules/messaging/email.js`
  - adaugă diagnostic prietenos pentru erori SMTP;
  - detectează providerul după host: Gmail, Microsoft 365, SMTP2GO sau SMTP generic;
  - normalizează autentificarea respinsă, conexiunea eșuată, TLS/SSL și parola salvată necitibilă.
- `server/modules/system/settings-routes.js`
  - endpointul de test SMTP returnează răspuns controlat cu `code`, `provider`, `details` și `tips`;
  - păstrează contractul de eroare `{ error: "..." }`.
- `client/src/pages/SetariPage.jsx`
  - afișează erorile SMTP pe mai multe linii;
  - afișează pașii recomandați primiți de la server;
  - adaugă ghid rapid pentru Gmail, Microsoft 365 și SMTP2GO.

## Beneficiu

Un administrator non-tehnic vede direct ce trebuie corectat: App Password pentru Gmail, SMTP AUTH pentru Microsoft 365, porturile uzuale sau blocajele de rețea/firewall.

## Verificare

- `node --check server/modules/messaging/email.js`
- `node --check server/modules/system/settings-routes.js`
- `npm run build`
- `npm run release:check -- --no-zip`
- `npm run test:smoke`
