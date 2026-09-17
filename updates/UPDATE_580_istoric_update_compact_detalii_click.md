# UPDATE 580 — Istoric update-uri compact cu detalii la click

Versiune: `v2.12.560`  
Data: `2026-09-17`

## Scop

Istoricul update-urilor din Setări → Actualizări rămâne ușor de urmărit când organizația are multe versiuni instalate.

## Modificări

- lista arată doar versiunea și momentul aplicării;
- click pe update deschide versiunea anterioară, operatorul și referința backup-ului;
- istoricul păstrează maximumul existent de intrări fără tabel lat și scroll orizontal;
- informațiile de backup rămân text, fără acces direct necontrolat la fișiere.

## Verificare

- `npm run build`
- `npm run release:check -- --no-zip`
- `npm run audit:file-exposure`
- `git diff --check`
- generare și validare ZIP update
