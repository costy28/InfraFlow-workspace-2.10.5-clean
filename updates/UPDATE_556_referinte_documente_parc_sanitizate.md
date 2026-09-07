# UPDATE 556 — Referințe documente parc sanitizate

Versiune: `2.12.536`  
Data: `2026-09-06`

## Scop

Reduce zgomotul real din auditul de expuneri fișiere și împiedică salvarea accidentală a căilor locale sau linkurilor directe în formularul de scadențe Parc & Resurse.

## Modificări

- Câmpul vizibil din Mecanizare pentru polițe, ITP, taxe și ISCIR nu mai este prezentat ca „Fișier atașat (cale)”.
- Câmpul devine „Referință document (opțional)”, cu helper care trimite utilizatorul spre upload-ul controlat din fișa resursei.
- Frontend-ul blochează valori de tip:
  - `C:\...`;
  - path UNC `\\server\...`;
  - URL-uri `http/https`;
  - linkuri directe către `storage`.
- Salvarea ITP folosește payload explicit, fără trimiterea întregului formular legacy.
- Auditul automat recunoaște cazul de referință text sanitizată și nu îl mai raportează ca posibil download necontrolat.

## Verificări

- `npm run audit:file-exposure` — `high=0`, finding-uri medium reduse de la 5 la 4.
- `npm run build`

## Migrare SQL

Nu necesită migrare SQL.
