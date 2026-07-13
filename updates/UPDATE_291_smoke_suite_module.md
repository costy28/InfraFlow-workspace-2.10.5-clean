# UPDATE 291 — Smoke suite module read-only

Versiune: `2.12.271`
Data: `2026-07-13`

## Scop

Adaugă o verificare rapidă, read-only, pentru modulele principale ale aplicației, astfel încât refactorizările să nu rupă rute critice fără să observăm înainte de update ZIP.

## Modificări

- A fost adăugat `scripts/smoke-modules-readonly.js`.
- Scriptul pornește serverul pe o bază JSON temporară, cu utilizator superadmin generat doar pentru test.
- Sunt verificate 48 endpointuri critice din Core, HR, Documente, Contabilitate, Achiziții, Referate, Gestiune, Mecanizare, Producție, Tehnic, Controlling, ANAF și Servicii.
- `npm run test:smoke` poate fi rulat separat pentru verificarea rapidă a rutelor.
- `npm run audit:local` include acum smoke suite-ul după testele de acceptanță existente.

## Compatibilitate

- Testul este read-only și folosește o copie temporară a seed-ului JSON.
- Datele reale MSSQL/JSON ale instalării nu sunt modificate.
- Endpointurile HTTP rămân neschimbate.
- Schema DB rămâne neschimbată.
- Nu s-au adăugat dependențe noi.

## Verificări

- `npm run test:smoke`
- `npm run audit:local`
