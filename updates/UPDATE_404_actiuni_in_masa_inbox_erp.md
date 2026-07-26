# UPDATE 404 — Acțiuni în masă Inbox ERP

Versiune: `2.12.384`  
Data: `2026-07-26`

## Context

După acțiunile rapide pe fiecare email, următorul pas firesc pentru utilizare zilnică este operarea în masă a Inbox-ului ERP.

## Implementat

- `client/src/pages/modules/MessagingPage.jsx`
  - checkbox pe fiecare email operabil;
  - checkbox global pentru selectarea emailurilor vizibile;
  - acțiuni în masă: `Marchează citite`, `Marchează necitite`, `Arhivează`;
  - contor pentru emailurile selectate;
  - selecție resetată automat la reîncărcarea listei/filtrare;
  - corecție pentru eroarea latentă `setEmailError` în catch-ul de actualizare status.

## Compatibilitate

Nu s-a schimbat schema DB. Acțiunile în masă folosesc endpoint-ul existent `PATCH /messaging/email/inbox/:id`, deci auditul și regulile actuale rămân neschimbate.

## Verificare

- `npm run build`
- `npm run release:check -- --no-zip`
- `npm run test:smoke`
