# UPDATE 554 — Audit automat expuneri fișiere

Versiune: `2.12.534`  
Data: `2026-09-06`

## Scop

Adaugă un detector automat pentru linkuri directe către fișiere și path-uri interne expuse accidental prin server sau frontend.

## Inclus

- Adaugă `scripts/audit-file-exposure.js`.
- Adaugă comanda `npm run audit:file-exposure`.
- Integrează verificarea în `npm run audit:local` ca advisory, fără blocarea release-ului curent.
- Detectorul semnalează:
  - linkuri frontend directe către `file_path`, `fisier_path` sau `local_path`;
  - URL-uri directe către `/storage`;
  - posibile căi locale trimise către client;
  - path-uri de storage care trebuie expuse doar prin endpoint-uri controlate.

## Rezultat inițial audit

Auditul a găsit primele zone de curățat:

- `client/src/pages/FisaVehicul.jsx` — link direct către `row.file_path`;
- `client/src/pages/MyVehicle.jsx` — link direct către `file.file_path`;
- câteva câmpuri `file_path` / `fisier_path` ce trebuie migrate treptat către URL-uri de download controlate.

## Impact tehnic

- Nu schimbă schema bazei de date.
- Nu schimbă comportamentul runtime.
- Nu necesită migrare SQL.
- Pregătește securizarea graduală a atașamentelor înainte de release comercial.

## Verificări

- `node --check scripts/audit-file-exposure.js`
- `npm run audit:file-exposure`
- `npm run release:check -- --no-zip`
- Generare ZIP update.
