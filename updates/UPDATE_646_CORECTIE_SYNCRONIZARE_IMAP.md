# UPDATE 646 — Corecție sincronizare IMAP

**Versiune:** 2.12.626  
**Data:** 2 octombrie 2026

## Corecție

Clientul IMAP recunoaște corect răspunsul etichetat de forma `A0001 OK` și atunci când acesta este primul rând primit după comanda `LOGIN`.

Astfel este eliminat timeout-ul fals întâlnit la unele servere IMAP compatibile. Credencialele rămân criptate, iar mesajele de autentificare respinsă sau conectare real eșuată rămân distincte.
