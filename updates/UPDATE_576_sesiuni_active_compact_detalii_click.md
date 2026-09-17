# UPDATE 576 — Sesiuni active compacte cu detalii la click

Versiune: `v2.12.556`  
Data: `2026-09-17`

## Scop

Panoul „Sesiuni active acum” din Setări → Securitate devine ușor de urmărit fără să piardă controlul administrativ.

## Modificări

- lista păstrează doar utilizatorul și momentul pornirii sesiunii;
- click pe sesiune deschide stația, IP-ul mascat, momentul pornirii și ultima activitate;
- sesiunea altui utilizator poate fi închisă controlat din detalii, cu confirmare auditabilă;
- sesiunea curentă nu poate fi închisă accidental și indică folosirea opțiunii „Ieșire”;
- nu sunt expuse parole, token-uri sau identificatori compleți de sesiune.

## Verificare

- `npm run build`
- `npm run release:check -- --no-zip`
- `npm run audit:file-exposure`
- `git diff --check`
- generare și validare ZIP update
