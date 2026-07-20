# UPDATE 363 — Audit portofoliu contracte

Versiune: `2.12.343`
Data: 2026-07-20

## Context

După ciclul complet închidere/redeschidere/anulare/reactivare, rapoartele de portofoliu trebuiau să păstreze vizibilitatea asupra contractelor scoase din fluxul activ, fără să le includă în totalurile operaționale.

## Implementare

- Helper nou `contractLifecycleSummary`.
- Raportul printabil de portofoliu include și contractele anulate.
- Tabelul printabil `Contracte urmărite` afișează:
  - status curent;
  - ultim eveniment de viață;
  - valoare, consum, scadență și alerte.
- Secțiune printabilă nouă `Audit ciclu de viață`, cu:
  - contract;
  - status curent;
  - ultim eveniment;
  - data evenimentului;
  - utilizator;
  - motiv.
- Exportul Excel include coloane de lifecycle în sheet-ul `Contracte`.
- Exportul Excel adaugă sheet `Audit ciclu viata`.
- Sheet-ul `Sumar` afișează și contractele afișate/anulate/închise în raport.

## Compatibilitate

- Nu adaugă dependențe.
- Nu necesită migrare MSSQL.
- KPI-urile financiare rămân calculate pe portofoliul activ.
- Contractele anulate sunt incluse doar în raportare/audit.

## Verificare

- `node --check server/modules/contracts/routes.js`
- `npm run build`
- `npm run test:smoke`
- `npm run release:check`
