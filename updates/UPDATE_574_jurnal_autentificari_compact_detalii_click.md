# UPDATE 574 — Jurnal autentificări compact cu detalii la click

Versiune: `v2.12.554`  
Data: `2026-09-17`

## Scop

Jurnalul autentificărilor din Setări → Securitate devine mai ușor de urmărit pe ecrane înguste, fără pierderea datelor necesare auditului.

## Modificări

- lista păstrează doar rezultatul, utilizatorul și momentul autentificării;
- click pe un eveniment deschide un modal cu adresa IP, stația, momentul complet și observația aferentă;
- nu sunt afișate parole, token-uri sau alte secrete;
- auditul complet rămâne disponibil fără tabel lat ori scroll orizontal.

## Verificare

- `npm run build`
- `npm run release:check -- --no-zip`
- `npm run audit:file-exposure`
- `git diff --check`
- generare și validare ZIP update
