# UPDATE 650 — Diagnostic conflict invitație Demo

**Versiune:** 2.12.630  
**Data:** 3 octombrie 2026

## Ce aduce

- Dacă serverul Demo refuză o invitație fiindcă există deja un cont activ, răspunsul către administrator identifică adresa normalizată primită și numele de utilizator găsit.
- Mesajul permite diferențierea între o adresă transmisă greșit și un cont existent real.

## Protecții

- Nu afișează parola, tokenul de activare, semnătura HMAC sau secretul integrării.
- Nu schimbă și nu suprascrie un cont activ existent.
