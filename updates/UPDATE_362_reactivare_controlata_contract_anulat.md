# UPDATE 362 — Reactivare controlată contract anulat

Versiune: `2.12.342`
Data: 2026-07-20

## Context

După anularea controlată, operatorii aveau nevoie de o cale sigură de revenire când un contract a fost anulat greșit sau decizia de anulare a fost reversată.

## Implementare

- Endpoint nou `POST /api/contracts/:id/reactivate`.
- Reactivarea este permisă doar pentru contracte anulate.
- Motivul reactivării este obligatoriu și trebuie să fie explicit.
- Reactivarea verifică duplicatele active cu același număr de contract.
- Contractul revine la `status_before_cancel` dacă acesta este valid, altfel la `activ`.
- Câmpurile active `cancelled_at` / `cancelledAt` sunt curățate, iar ultima anulare rămâne păstrată în câmpuri `last_cancelled_*`.
- Evenimentul `reactivated` este adăugat în `lifecycle_history`.
- UI:
  - buton `Reactivează` pentru contractele anulate;
  - acțiune disponibilă și în bannerul de anulare;
  - jurnalul ciclului de viață afișează `Reactivat`.

## Compatibilitate

- Nu adaugă dependențe.
- Nu necesită migrare MSSQL.
- Compatibil cu `DB_MODE=json`.
- Păstrează regula de audit pentru operațiunile write.

## Verificare

- `node --check server/modules/contracts/routes.js`
- `npm run build`
- `npm run test:smoke`
- `npm run release:check`
