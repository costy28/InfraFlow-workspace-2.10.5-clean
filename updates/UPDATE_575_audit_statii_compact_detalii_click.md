# UPDATE 575 — Audit stații autorizate compact cu detalii la click

Versiune: `v2.12.555`  
Data: `2026-09-17`

## Scop

Registrul stațiilor autorizate din Setări → Securitate devine ușor de urmărit pe ecrane înguste, fără să piardă datele necesare pentru audit.

## Modificări

- lista păstrează riscul, numele stației și ultima activitate;
- click pe stație deschide utilizatorul, IP-ul, sesiunile active, datele tehnice, vechimea și recomandarea;
- rezumatul de risc și cererile de stații rămân vizibile direct în pagină;
- nu sunt expuse parole, token-uri sau identificatori de sesiune.

## Verificare

- `npm run build`
- `npm run release:check -- --no-zip`
- `npm run audit:file-exposure`
- `git diff --check`
- generare și validare ZIP update
