# UPDATE 271 — Adevăr proiect și audit local

Versiune: `2.12.251`
Data: `2026-07-11`

## Scop

După auditul complet al aplicației, primul pas de stabilizare este alinierea
sursei de adevăr a proiectului: versiuni, documentație, verificări locale și
planul de mentenanță.

## Schimbări

- Versiunea proiectului este ridicată la `2.12.251`.
- `AGENTS.md` este sincronizat cu versiunea reală și cu stack-ul curent React/Vite.
- Script nou:
  - `npm run audit:local`
  - `npm run audit:advisory`
- `audit:local` rulează:
  - verificare sintactică backend JS;
  - teste HR;
  - teste Contabilitate;
  - release acceptance;
  - backup roundtrip;
  - build frontend.
- `audit:advisory` adaugă lint frontend și `npm audit` pe root/server/client fără să blocheze verificările principale.
- Document nou:
  - `docs/AUDIT_MENTENANTA_2026-07-11.md`
- Tooling frontend:
  - ESLint recunoaște `__APP_VERSION__` injectat de Vite;
  - fallback-ul Vite pentru versiune este `dev`, nu o versiune istorică;
  - două service workere au fost curățate de assignment inutil.

## Compatibilitate

- Nu introduce dependențe noi.
- Nu schimbă schema DB.
- Nu schimbă endpointuri sau răspunsuri API.
- Nu modifică logica de business.

## Testare

- `npm run audit:local`
