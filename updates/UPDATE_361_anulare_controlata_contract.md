# UPDATE 361 — Anulare controlată contract

Versiune: `2.12.341`
Data: 2026-07-20

## Context

Contract Management avea nevoie de o anulare coerentă cu regula proiectului: nu se șterge fizic, ci se marchează controlat și auditat.

## Implementare

- `POST /api/contracts/:id/cancel` folosește anulare controlată.
- Motivul anulării este obligatoriu și trebuie să fie explicit.
- Contractul primește:
  - `status: anulat`;
  - `cancelled_at` / `cancelledAt`;
  - `cancelled_by` / `cancelledBy`;
  - `cancelled_by_name`;
  - `cancelled_reason` / `cancelledReason`;
  - eveniment în `lifecycle_history`.
- Contractele anulate rămân vizibile în:
  - lista Contract Management;
  - dosarul contractului;
  - fișa printabilă.
- Dashboard-ul și fluxurile active continuă să ignore contractele anulate.
- UI:
  - buton `Anulează` cu confirmare;
  - filtru `Anulate`;
  - card vizibil cu motivul anulării;
  - jurnal ciclul de viață;
  - dosarele anulate nu mai permit consumuri, acte adiționale sau atașamente noi.

## Compatibilitate

- Nu adaugă dependențe.
- Nu necesită migrare MSSQL.
- Compatibil cu `DB_MODE=json`.
- Păstrează comportamentul endpoint-urilor existente, cu răspuns îmbogățit pentru anulare.

## Verificare

- `node --check server/modules/contracts/routes.js`
- `npm run build`
- `npm run test:smoke`
- `npm run release:check`
