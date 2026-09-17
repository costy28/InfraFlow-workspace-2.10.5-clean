# UPDATE 579 — Previzualizare update cu rânduri corecte

Versiune: `v2.12.559`  
Data: `2026-09-17`

## Scop

Previzualizarea pachetului de update afișează changelog-ul ca text lizibil, nu cu secvențe tehnice precum `\n`.

## Modificări

- transformă secvențele literal `\n` și `\r\n` din pachete vechi în delimitatori de rând reali;
- pachetele noi folosesc newline-uri corecte în `version.json`;
- păstrează retrocompatibilitatea pentru pachetele deja generate;
- previzualizarea rămâne în text simplu, fără interpretare HTML.

## Verificare

- `npm run build`
- `npm run release:check -- --no-zip`
- `npm run audit:file-exposure`
- `git diff --check`
- generare și validare ZIP update
