# UPDATE 573 — Jurnal securitate compact cu detalii la click

Versiune: v2.12.553  
Data: 2026-09-12

## Scop

Listele lungi din ecranele de administrare trebuie să fie ușor de urmărit. Administratorul are nevoie de rezumat rapid pe pagină și detalii complete doar când investighează un eveniment.

## Implementat

- Jurnalul de securitate afișează rânduri compacte cu categorie, eveniment, operator și moment.
- Detaliile evenimentului sunt afișate trunchiat în listă și complet într-un modal la click pe rând.
- Modalul arată categoria, vechimea, acțiunea, operatorul, momentul și detaliile sanitizate din audit.
- Se păstrează filtrele existente pe autentificări, roluri, utilizatori, stații și setări sensibile.

## Verificări

- Build frontend/backend.
- Release check fără ZIP.
- Audit expuneri fișiere.
- Verificare whitespace cu git diff --check.
- Pachet update ZIP generat și validat.
