# UPDATE 577 — Checklist securitate compact cu detalii la click

Versiune: `v2.12.557`  
Data: `2026-09-17`

## Scop

Checklistul rapid din Setări → Securitate afișează verdictul esențial fără a ocupa pagina cu explicații repetitive.

## Modificări

- fiecare verificare păstrează în listă doar denumirea și statutul;
- click pe verificare deschide detaliul complet și recomandarea pentru următorul pas;
- butonul de afișare completă rămâne disponibil când sunt mai mult de cinci verificări;
- toate elementele sunt navigabile prin tastatură, nu doar prin mouse;
- diagnosticul nu expune parole, token-uri sau date de conexiune.

## Verificare

- `npm run build`
- `npm run release:check -- --no-zip`
- `npm run audit:file-exposure`
- `git diff --check`
- generare și validare ZIP update
