# UPDATE 042 - Flux demo director

## Scop

Pregateste un flux de prezentare pentru director, cu un cont dedicat si un referat aflat direct in pasul de aprobare `Director General`.

## Inclus

- Cont demo director: `director` / `demo123`.
- Referat demo marcat clar pentru director, cu status `dir_general`.
- Dashboard cu panou "Demo director" pentru acces rapid la Referate, Mecanizare, HR si Controlling.
- Smoke test pentru login director, verificare permisiune `referate:dir_general`, aprobare referat si generare automata comanda.
- Seed demo actualizat la versiunea `2.12.21`.

## Note

- Demo-ul ramane pe `DB_MODE=json` si portul `4190`.
- Instanta MSSQL de dezvoltare nu este modificata.
- Dupa smoke test, seed-ul trebuie refacut ca referatul directorului sa revina in starea de asteptare pentru prezentare.
