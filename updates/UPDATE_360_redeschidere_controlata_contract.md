# UPDATE 360 — Redeschidere controlată contract

Versiune: `2.12.340`
Data: 2026-07-20

## Context

După introducerea închiderii controlate a contractelor, era nevoie de o cale sigură de revenire când un contract a fost închis din greșeală sau apar documente/facturi ulterioare.

## Implementare

- Endpoint nou `POST /api/contracts/:id/reopen`.
- Redeschiderea este permisă doar pentru contracte cu status `inchis`.
- Motivul redeschiderii este obligatoriu și trebuie să fie explicit.
- Contractul revine la `status_before_close` dacă acesta este valid, altfel la `activ`.
- Închiderea contractului salvează acum evenimente în `closure_history`.
- Redeschiderea adaugă eveniment `reopened` în același jurnal.
- UI-ul afișează:
  - buton `Redeschide` pentru contractele închise;
  - motivul ultimei închideri;
  - jurnalul închidere/redeschidere din dosarul contractului.

## Compatibilitate

- Nu adaugă dependențe.
- Nu necesită migrare MSSQL.
- Compatibil cu `DB_MODE=json`.
- Nu schimbă răspunsurile endpoint-urilor existente.

## Verificare

- `node --check server/modules/contracts/routes.js`
- `npm run build`
- `npm run test:smoke`
- `npm run release:check`
